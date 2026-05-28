import * as vscode from 'vscode';
import { ChangeType, CriticChange } from './types';
import { DecoratorManager } from './decorator';
import { findAtCursor, findNext, findPrev, findFirst, findLast, revealChange } from './navigator';

export function registerAllCommands(
  ctx: vscode.ExtensionContext,
  dm: DecoratorManager,
): void {
  const reg = (id: string, fn: () => void) =>
    ctx.subscriptions.push(vscode.commands.registerCommand(id, fn));

  // ── Insert commands ──────────────────────────────────────────────────────────

  reg('kaicrit.insertDeletion', () => wrapSelection('{--', '--}'));
  reg('kaicrit.insertAddition', () => wrapSelection('{++', '++}'));
  reg('kaicrit.insertHighlight', () => wrapSelection('{==', '==}'));
  reg('kaicrit.insertComment',   () => wrapSelection('{>>', '<<}'));
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
    vscode.window.showInformationMessage(
      direction === 'next' || direction === 'last'
        ? 'No more changes after this position.'
        : 'No more changes before this position.',
    );
    return;
  }
  revealChange(editor, target);
}

function applyAtCursor(dm: DecoratorManager, mode: 'accept' | 'reject'): void {
  const editor = activeEditor();
  if (!editor) { return; }
  const changes = dm.getChanges(editor.document);
  const change = findAtCursor(changes, editor.selection.active);
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
