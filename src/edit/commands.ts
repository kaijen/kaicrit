import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { ChangeType, CriticChange } from '../core/types';
import { MARKERS } from '../core/markers';
import { DecoratorManager } from './decorator';
import { TrackChangesManager } from './trackChanges';
import { EnablementManager } from './enablement';
import { findAtCursor, findNext, findPrev, findFirst, findLast, revealChange } from './navigator';
import { resolveReplacement } from './resolve';

export function registerEditCommands(
  ctx: vscode.ExtensionContext,
  dm: DecoratorManager,
  tcm: TrackChangesManager,
  em: EnablementManager,
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

  // ── Track Changes (Annotate) ─────────────────────────────────────────────────

  reg('kaicrit.toggleTrackChanges', () => {
    const editor = activeEditor();
    if (editor) { tcm.toggle(editor.document); }
  });

  // ── Per-file enable/disable ──────────────────────────────────────────────────

  reg('kaicrit.toggleFileEnabled', () => {
    const editor = activeEditor();
    if (editor) { em.toggle(editor.document); }
  });

  // Position-targeted variants used by the CodeLens actions and the hover
  // command links. They delegate to the same resolve logic, but act on the
  // change at the supplied position instead of the cursor. A CodeLens passes a
  // live `vscode.Position`; a hover `command:` link deserializes its argument as
  // a plain `{line, character}` object, so normalize before use.
  const toPos = (p: vscode.Position | { line: number; character: number }): vscode.Position =>
    p instanceof vscode.Position ? p : new vscode.Position(p.line, p.character);
  ctx.subscriptions.push(
    vscode.commands.registerCommand('kaicrit.acceptChangeAt',
      (pos: vscode.Position) => applyAt(dm, 'accept', toPos(pos))),
    vscode.commands.registerCommand('kaicrit.rejectChangeAt',
      (pos: vscode.Position) => applyAt(dm, 'reject', toPos(pos))),
  );

  // Tree-View actions: reveal a change on click, and inline accept/reject on a
  // node. The Tree items carry their start position; everything else reuses the
  // shared navigate/resolve logic.
  ctx.subscriptions.push(
    vscode.commands.registerCommand('kaicrit.revealChangeAt',
      (pos: vscode.Position) => revealAt(dm, pos)),
    vscode.commands.registerCommand('kaicrit.acceptChangeNode',
      (node?: { position?: vscode.Position }) => {
        if (node?.position) { applyAt(dm, 'accept', node.position); }
      }),
    vscode.commands.registerCommand('kaicrit.rejectChangeNode',
      (node?: { position?: vscode.Position }) => {
        if (node?.position) { applyAt(dm, 'reject', node.position); }
      }),
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
async function insertComment(): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('kaicrit');
  let open = '{>>';
  if (cfg.get<boolean>('edit.commentMetadata', true)) {
    const author = await resolveAuthor(cfg);
    const date = isoToday();
    open = `{>>${author ? '@' + author + ' ' : ''}${date}: `;
  }
  wrapSelection(open, '<<}');
}

const execFileAsync = promisify(execFile);

// Cache the resolved `git config user.name` per workspace-folder path so each
// comment doesn't spawn a fresh git process. Keyed by fsPath (or '' when there
// is no folder); the stored value may be '' (no name / git failed).
const gitAuthorCache = new Map<string, string>();

// Author for a new comment: the configured name wins; otherwise fall back to
// the repository's `git config user.name`. Returns '' when neither is available
// (the metadata then carries just the date). The git lookup runs asynchronously
// (and is cached) so it never blocks the extension host.
async function resolveAuthor(cfg: vscode.WorkspaceConfiguration): Promise<string> {
  const configured = (cfg.get<string>('edit.commentAuthor', '') ?? '').trim();
  if (configured) { return configured; }
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
  const cached = gitAuthorCache.get(folder);
  if (cached !== undefined) { return cached; }
  let author = '';
  try {
    const { stdout } = await execFileAsync('git', ['config', 'user.name'], {
      cwd: folder || undefined,
      timeout: 1000,
    });
    author = stdout.toString().trim();
  } catch {
    author = '';
  }
  gitAuthorCache.set(folder, author);
  return author;
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function insertSubstitution(): void {
  const editor = activeEditor();
  if (!editor) { return; }
  // A substitution must replace *existing* text. With nothing selected there is
  // no "old" side, which would degenerate into a plain addition ({~~~>new~~} ≡
  // {++new++}). So we decline and point the user at the right gesture instead of
  // inserting an empty pair — unlike addition/highlight/comment, which are valid
  // to author from scratch. (Multi-cursor: any empty cursors are skipped.)
  const targets = editor.selections.filter(sel => !sel.isEmpty);
  if (targets.length === 0) {
    vscode.window.setStatusBarMessage(
      'kaicrit: select the text to replace before inserting a substitution.', 3000);
    return;
  }
  const { open, sep, close } = MARKERS[ChangeType.Substitution];
  editor.edit(eb => {
    for (const sel of targets) {
      eb.replace(sel, `${open}${editor.document.getText(sel)}${sep}${close}`);
    }
  }).then(() => {
    // Park the cursor on the empty "new" side (before `~~}`) so the user can type
    // the replacement. After the replace, the cursor sits at the end of the
    // inserted text; the desired point is exactly `close.length` units before it.
    // Computing from that offset (rather than searching the text for `~>`) stays
    // correct for multi-line selections and replaced text that contains a `~>`.
    if (editor.selections.length === 1) {
      const doc = editor.document;
      const end = doc.offsetAt(editor.selection.active);
      const pos = doc.positionAt(end - close.length);
      editor.selection = new vscode.Selection(pos, pos);
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

function revealAt(dm: DecoratorManager, position: vscode.Position): void {
  const editor = activeEditor();
  if (!editor) { return; }
  const change = findAtCursor(dm.getChanges(editor.document), position);
  if (change) { revealChange(editor, change); }
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
    // Non-modal: a stray Alt+A/Alt+R with the cursor outside a change should be
    // a quiet no-op, not an interruptive box.
    vscode.window.setStatusBarMessage('Cursor is not inside a CriticMarkup change.', 3000);
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
  edit.replace(uri, change.fullRange, resolveReplacement(change, mode));
}
