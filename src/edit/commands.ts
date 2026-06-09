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

  reg('kaicrit.insertDeletion', () => wrapSelection(tcm, '{--', '--}'));
  reg('kaicrit.insertAddition', () => wrapSelection(tcm, '{++', '++}'));
  reg('kaicrit.insertHighlight', () => wrapSelection(tcm, '{==', '==}'));
  reg('kaicrit.insertComment',   () => insertComment(tcm));
  reg('kaicrit.insertSubstitution', () => insertSubstitution(tcm));

  // ── Navigation commands ──────────────────────────────────────────────────────

  reg('kaicrit.nextChange',  () => navigate(dm, 'next'));
  reg('kaicrit.prevChange',  () => navigate(dm, 'prev'));
  reg('kaicrit.firstChange', () => navigate(dm, 'first'));
  reg('kaicrit.lastChange',  () => navigate(dm, 'last'));

  // ── Accept / Reject ──────────────────────────────────────────────────────────

  reg('kaicrit.acceptChange', () => applyAtCursor(dm, tcm, 'accept'));
  reg('kaicrit.rejectChange', () => applyAtCursor(dm, tcm, 'reject'));
  reg('kaicrit.acceptAll',    () => applyAll(dm, tcm, 'accept'));
  reg('kaicrit.rejectAll',    () => applyAll(dm, tcm, 'reject'));

  // ── Track Changes (Annotate) ─────────────────────────────────────────────────

  reg('kaicrit.toggleTrackChanges', () => {
    const editor = activeEditor();
    if (!editor) { return; }
    const doc = editor.document;
    // Turning Track Changes ON in a kaicrit-disabled document would record
    // markers that no decoration / accept-reject can act on — invisible text
    // noise (issue #54). Implicitly enable kaicrit for this file first (the
    // expected gesture) so the recorded markup is visible and resolvable.
    if (!tcm.isEnabled(doc) && !em.isEnabled(doc)) { em.toggle(doc); }
    tcm.toggle(doc);
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
      (pos: vscode.Position) => applyAt(dm, tcm, 'accept', toPos(pos))),
    vscode.commands.registerCommand('kaicrit.rejectChangeAt',
      (pos: vscode.Position) => applyAt(dm, tcm, 'reject', toPos(pos))),
  );

  // Tree-View actions: reveal a change on click, and inline accept/reject on a
  // node. The Tree items carry their start position; everything else reuses the
  // shared navigate/resolve logic.
  ctx.subscriptions.push(
    vscode.commands.registerCommand('kaicrit.revealChangeAt',
      (pos: vscode.Position) => revealAt(dm, pos)),
    vscode.commands.registerCommand('kaicrit.acceptChangeNode',
      (node?: { position?: vscode.Position }) => {
        if (node?.position) { applyAt(dm, tcm, 'accept', node.position); }
      }),
    vscode.commands.registerCommand('kaicrit.rejectChangeNode',
      (node?: { position?: vscode.Position }) => {
        if (node?.position) { applyAt(dm, tcm, 'reject', node.position); }
      }),
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function activeEditor(): vscode.TextEditor | undefined {
  return vscode.window.activeTextEditor;
}

// `cursorInside`: park the caret just before `close` even when a selection was
// wrapped (used for comments, where you keep typing the note inside the marker).
// Without it, wrapping a selection leaves the caret after the closing delimiter.
// Handles multi-cursor: each caret is repositioned independently, driven by the
// per-selection `wasEmpty` snapshot taken before the edit (an empty cursor always
// parks inside the new pair). VS Code preserves the count and order of
// `editor.selections` across an edit, so post-edit `selections[i]` is the i-th input.
function wrapSelection(tcm: TrackChangesManager, open: string, close: string, cursorInside = false): void {
  const editor = activeEditor();
  if (!editor) { return; }
  const wasEmpty = editor.selections.map(sel => sel.isEmpty);
  // Route through the Track Changes guard: this is explicit markup authoring, so
  // the recorder must leave it verbatim instead of re-tracking the wrap as an
  // edit (which would prepend a spurious deletion — issue #44).
  void tcm.applyAuthoringEdit(editor.document, () => editor.edit(eb => {
    for (const sel of editor.selections) {
      if (sel.isEmpty) {
        eb.insert(sel.active, open + close);
      } else {
        eb.replace(sel, open + editor.document.getText(sel) + close);
      }
    }
  })).then(() => {
    const doc = editor.document;
    editor.selections = editor.selections.map((sel, i) => {
      const base = doc.offsetAt(sel.active);
      const offset = (wasEmpty[i] || cursorInside) ? base - close.length : base;
      const pos = doc.positionAt(offset);
      return new vscode.Selection(pos, pos);
    });
  });
}

// Insert a comment, optionally pre-filled with author + today's date so the
// metadata convention ({>>@author YYYY-MM-DD: text<<}) is one keystroke away.
// When `kaicrit.edit.commentMetadata` is off, falls back to a plain comment.
async function insertComment(tcm: TrackChangesManager): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('kaicrit');
  let open = '{>>';
  if (cfg.get<boolean>('edit.commentMetadata', true)) {
    const author = await resolveAuthor(cfg);
    const date = isoToday();
    open = `{>>${author ? '@' + author + ' ' : ''}${date}: `;
  }
  wrapSelection(tcm, open, '<<}', true);
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

// Local calendar date as YYYY-MM-DD. `toISOString` would emit the UTC date,
// which stamps tomorrow/yesterday for users whose local day differs from UTC
// (e.g. Germany in the evening got the previous day — issue #58). Intl with the
// 'sv-SE' locale yields the ISO-shaped, zero-padded date in the local zone.
function isoToday(): string {
  return new Intl.DateTimeFormat('sv-SE').format(new Date());
}

function insertSubstitution(tcm: TrackChangesManager): void {
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
  const edited = editor.selections.map(sel => !sel.isEmpty);
  const { open, sep, close } = MARKERS[ChangeType.Substitution];
  // Authoring edit — guard it so the recorder doesn't re-track the wrap (issue #44).
  void tcm.applyAuthoringEdit(editor.document, () => editor.edit(eb => {
    for (const sel of targets) {
      eb.replace(sel, `${open}${editor.document.getText(sel)}${sep}${close}`);
    }
  })).then(() => {
    // Park each cursor on the empty "new" side (before `~~}`) so the user can type
    // the replacement. After the replace, the cursor sits at the end of the
    // inserted text; the desired point is exactly `close.length` units before it.
    // Computing from that offset (rather than searching the text for `~>`) stays
    // correct for multi-line selections and replaced text that contains a `~>`.
    // Only the wrapped (non-empty) selections move; any empty cursor is left as-is.
    const doc = editor.document;
    editor.selections = editor.selections.map((sel, i) => {
      if (!edited[i]) { return sel; }
      const end = doc.offsetAt(sel.active);
      const pos = doc.positionAt(end - close.length);
      return new vscode.Selection(pos, pos);
    });
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

function applyAtCursor(dm: DecoratorManager, tcm: TrackChangesManager, mode: 'accept' | 'reject'): void {
  const editor = activeEditor();
  if (!editor) { return; }
  applyAt(dm, tcm, mode, editor.selection.active);
}

function applyAt(
  dm: DecoratorManager,
  tcm: TrackChangesManager,
  mode: 'accept' | 'reject',
  position: vscode.Position,
): void {
  const editor = activeEditor();
  if (!editor) { return; }
  // The cache is refreshed only debounced. If a re-parse is still queued (the
  // user typed within the debounce window, then triggered accept/reject), the
  // cached `fullRange` offsets predate that edit and would target the wrong
  // span. Flush synchronously so we resolve against the document's current text
  // (issue #52).
  if (dm.hasPending(editor.document)) { dm.update(editor); }
  let change = findAtCursor(dm.getChanges(editor.document), position);
  if (!change) {
    // Non-modal: a stray Alt+A/Alt+R with the cursor outside a change should be
    // a quiet no-op, not an interruptive box.
    vscode.window.setStatusBarMessage('Cursor is not inside a CriticMarkup change.', 3000);
    return;
  }
  // Defence in depth: confirm the cached span still spans this exact marker
  // before editing. If it drifted (e.g. an edit landed between the flush and
  // here), re-parse once and re-locate; abort rather than corrupt on mismatch.
  if (!spanMatches(editor, change)) {
    dm.update(editor);
    change = findAtCursor(dm.getChanges(editor.document), position);
    if (!change || !spanMatches(editor, change)) {
      vscode.window.setStatusBarMessage('kaicrit: change moved, please retry.', 3000);
      return;
    }
  }
  const edit = new vscode.WorkspaceEdit();
  addResolution(edit, editor.document.uri, change, mode);
  // Route through the recorder so a resolution applied while Track Changes is on
  // isn't re-interpreted as a user edit (which would undo the accept/reject).
  tcm.applyResolution(editor.document, edit).then(() => {
    dm.update(editor);
    dismissHover();
  });
}

// After resolving a change from the hover actions, the hover widget stays open
// over the now-removed marker (issue #42) — VS Code deliberately keeps a hover up
// when you click a command: link (so multiple links stay clickable). Dismiss it
// explicitly. This is a no-op when no hover is visible (the CodeLens, sidebar and
// keyboard paths all flow through applyAt too) and on VS Code builds that predate
// the command (the rejection is swallowed). Added in VS Code 1.96 (microsoft/vscode#222316).
function dismissHover(): void {
  vscode.commands.executeCommand('editor.action.hideHover').then(undefined, () => {});
}

function applyAll(dm: DecoratorManager, tcm: TrackChangesManager, mode: 'accept' | 'reject'): void {
  const editor = activeEditor();
  if (!editor) { return; }
  // Flush any queued debounced parse so every cached span reflects current text
  // before we build one atomic edit over all of them (issue #52).
  if (dm.hasPending(editor.document)) { dm.update(editor); }
  let changes = dm.getChanges(editor.document);
  if (changes.length === 0) {
    vscode.window.showInformationMessage('No CriticMarkup changes found.');
    return;
  }
  // If any cached span no longer matches its marker text, re-parse once before
  // committing — an Accept-All over drifted offsets would corrupt the document.
  if (!changes.every(c => spanMatches(editor, c))) {
    dm.update(editor);
    changes = dm.getChanges(editor.document);
    if (!changes.every(c => spanMatches(editor, c))) {
      vscode.window.setStatusBarMessage('kaicrit: changes moved, please retry.', 3000);
      return;
    }
  }
  const edit = new vscode.WorkspaceEdit();
  for (const change of changes) {
    addResolution(edit, editor.document.uri, change, mode);
  }
  tcm.applyResolution(editor.document, edit).then(() => dm.update(editor));
}

// Whether the cached change still spans its exact marker text in the live
// document. Changes parsed before the `raw` field existed (or built in tests)
// carry no `raw` and are treated as matching, preserving prior behaviour.
function spanMatches(editor: vscode.TextEditor, change: CriticChange): boolean {
  return change.raw === undefined
    || editor.document.getText(change.fullRange) === change.raw;
}

function addResolution(
  edit: vscode.WorkspaceEdit,
  uri: vscode.Uri,
  change: CriticChange,
  mode: 'accept' | 'reject',
): void {
  edit.replace(uri, change.fullRange, resolveReplacement(change, mode));
}
