import * as vscode from 'vscode';
import { execFileSync } from 'child_process';
import { ChangeType, CriticChange } from '../core/types';
import { DecoratorManager } from './decorator';
import { findAtCursor, findNext, findPrev, findFirst, findLast, revealChange } from './navigator';

export function registerEditCommands(
  ctx: vscode.ExtensionContext,
  dm: DecoratorManager,
): void {
  const reg = (id: string, fn: () => void) =>
    ctx.subscriptions.push(vscode.commands.registerCommand(id, fn));

  // ── Insert commands ──────────────────────────────────────────────────────────

  reg('kaicrit.insertDeletion', () => wrapSelection('{--', '--}'));
  reg('kaicrit.insertAddition', () => wrapSelection('{++', '++}'));
  reg('kaicrit.insertHighlight', () => wrapSelection('{==', '==}'));
  reg('kaicrit.insertComment',   insertComment);
  reg('kaicrit.insertSubstitution', insertSubstitution);

  // ── Navigation commands ──────────────────────────────────────────────────────

  reg('kaicrit.nextChange',  () => navigate(dm, 'next'));
  reg('kaicrit.prevChange',  () => navigate(dm, 'prev'));
  reg('kaicrit.firstChange', () => navigate(dm, 'first'));
  reg('kaicrit.lastChange',  () => navigate(dm, 'last'));

  // ── Accept / Reject ──────────────────────────────────────────────────────────

  reg('kaicrit.acceptChange', () => applyAtCursor(dm, 'accept'));
  reg('kaicrit.rejectChange', () => applyAtCursor(dm, 'reject'));
  reg('kaicrit.acceptAll',    () => applyAll(dm, 'accept'));
  reg('kaicrit.rejectAll',    () => applyAll(dm, 'reject'));

  // Position-targeted variants used by the CodeLens actions. They delegate to
  // the same resolve logic, but act on the change at the supplied position
  // instead of the cursor.
  ctx.subscriptions.push(
    vscode.commands.registerCommand('kaicrit.acceptChangeAt',
      (pos: vscode.Position) => applyAt(dm, 'accept', pos)),
    vscode.commands.registerCommand('kaicrit.rejectChangeAt',
      (pos: vscode.Position) => applyAt(dm, 'reject', pos)),
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function activeEditor(): vscode.TextEditor | undefined {
  return vscode.window.activeTextEditor;
}

function wrapSelection(open: string, close: string): void {
  const editor = activeEditor();
  if (!editor) { return; }
  const noSelection = editor.selections.length === 1 && editor.selection.isEmpty;
  editor.edit(eb => {
    for (const sel of editor.selections) {
      if (sel.isEmpty) {
        eb.insert(sel.active, open + close);
      } else {
        eb.replace(sel, open + editor.document.getText(sel) + close);
      }
    }
  }).then(() => {
    if (editor.selections.length === 1) {
      const doc = editor.document;
      const base = doc.offsetAt(editor.selection.active);
      const offset = noSelection ? base - close.length : base;
      const pos = doc.positionAt(offset);
      editor.selection = new vscode.Selection(pos, pos);
    }
  });
}

// Insert a comment, optionally pre-filled with author + today's date so the
// metadata convention ({>>@author YYYY-MM-DD: text<<}) is one keystroke away.
// When `kaicrit.edit.commentMetadata` is off, falls back to a plain comment.
function insertComment(): void {
  const cfg = vscode.workspace.getConfiguration('kaicrit');
  let open = '{>>';
  if (cfg.get<boolean>('edit.commentMetadata', true)) {
    const author = resolveAuthor(cfg);
    const date = isoToday();
    open = `{>>${author ? '@' + author + ' ' : ''}${date}: `;
  }
  wrapSelection(open, '<<}');
}

// Author for a new comment: the configured name wins; otherwise fall back to
// the repository's `git config user.name`. Returns '' when neither is available
// (the metadata then carries just the date).
function resolveAuthor(cfg: vscode.WorkspaceConfiguration): string {
  const configured = (cfg.get<string>('edit.commentAuthor', '') ?? '').trim();
  if (configured) { return configured; }
  try {
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    return execFileSync('git', ['config', 'user.name'], {
      cwd: folder,
      timeout: 1000,
    }).toString().trim();
  } catch {
    return '';
  }
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function insertSubstitution(): void {
  const editor = activeEditor();
  if (!editor) { return; }
  editor.edit(eb => {
    for (const sel of editor.selections) {
      const selected = sel.isEmpty ? 'old' : editor.document.getText(sel);
      eb.replace(sel, `{~~${selected}~>~~}`);
    }
  }).then(() => {
    // Move cursor between ~> and ~~} so user can type the replacement
    if (editor.selections.length === 1) {
      const doc = editor.document;
      const anchor = editor.selection.active;
      // After replacement the cursor sits at the end of the inserted text.
      // Find the last inserted ~> before the cursor and position after it.
      const lineText = doc.lineAt(anchor.line).text;
      const cursorCol = anchor.character;
      const searchArea = lineText.slice(0, cursorCol);
      const separatorIdx = searchArea.lastIndexOf('~>');
      if (separatorIdx !== -1) {
        const newPos = new vscode.Position(anchor.line, separatorIdx + 2);
        editor.selection = new vscode.Selection(newPos, newPos);
      }
    }
  });
}

function navigate(dm: DecoratorManager, direction: 'next' | 'prev' | 'first' | 'last'): void {
  const editor = activeEditor();
  if (!editor) { return; }
  const changes = dm.getChanges(editor.document);
  if (changes.length === 0) {
    vscode.window.showInformationMessage('No CriticMarkup changes found.');
    return;
  }
  const cursor = editor.selection.active;
  let target: CriticChange | undefined;
  switch (direction) {
    case 'next':  target = findNext(changes, cursor); break;
    case 'prev':  target = findPrev(changes, cursor); break;
    case 'first': target = findFirst(changes); break;
    case 'last':  target = findLast(changes); break;
  }
  if (!target) {
    if (direction === 'next') {
      vscode.window.setStatusBarMessage('Wrapped to first change.', 3000);
      target = findFirst(changes);
    } else if (direction === 'prev') {
      vscode.window.setStatusBarMessage('Wrapped to last change.', 3000);
      target = findLast(changes);
    } else {
      return;
    }
  }
  revealChange(editor, target!);
}

function applyAtCursor(dm: DecoratorManager, mode: 'accept' | 'reject'): void {
  const editor = activeEditor();
  if (!editor) { return; }
  applyAt(dm, mode, editor.selection.active);
}

function applyAt(dm: DecoratorManager, mode: 'accept' | 'reject', position: vscode.Position): void {
  const editor = activeEditor();
  if (!editor) { return; }
  const changes = dm.getChanges(editor.document);
  const change = findAtCursor(changes, position);
  if (!change) {
    vscode.window.showInformationMessage('Cursor is not inside a CriticMarkup change.');
    return;
  }
  const edit = new vscode.WorkspaceEdit();
  addResolution(edit, editor.document.uri, change, mode);
  vscode.workspace.applyEdit(edit).then(() => dm.update(editor));
}

function applyAll(dm: DecoratorManager, mode: 'accept' | 'reject'): void {
  const editor = activeEditor();
  if (!editor) { return; }
  const changes = dm.getChanges(editor.document);
  if (changes.length === 0) {
    vscode.window.showInformationMessage('No CriticMarkup changes found.');
    return;
  }
  const edit = new vscode.WorkspaceEdit();
  for (const change of changes) {
    addResolution(edit, editor.document.uri, change, mode);
  }
  vscode.workspace.applyEdit(edit).then(() => dm.update(editor));
}

function addResolution(
  edit: vscode.WorkspaceEdit,
  uri: vscode.Uri,
  change: CriticChange,
  mode: 'accept' | 'reject',
): void {
  let replacement: string;
  switch (change.type) {
    case ChangeType.Deletion:
      replacement = mode === 'accept' ? '' : (change.text ?? '');
      break;
    case ChangeType.Addition:
      replacement = mode === 'accept' ? (change.text ?? '') : '';
      break;
    case ChangeType.Substitution:
      replacement = mode === 'accept' ? (change.newText ?? '') : (change.oldText ?? '');
      break;
    case ChangeType.Highlight:
      replacement = change.text ?? '';
      break;
    case ChangeType.Comment:
      replacement = '';
      break;
  }
  edit.replace(uri, change.fullRange, replacement);
}
