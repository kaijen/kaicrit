import * as vscode from 'vscode';
import { ChangeType, CriticChange } from '../core/types';
import { parseCriticMarkup } from './parser';
import { createContentDecorationTypes } from './decorationTypes';

// Context key reflecting whether the active editor's document has ≥ 1 change.
// Drives the `when` clauses of the accept/reject keybindings so they don't fire
// in documents without CriticMarkup.
const HAS_CHANGES_KEY = 'kaicrit.hasChanges';

// Default debounce (ms) between a document change and the re-parse that refreshes
// decorations. A single frame (~16 ms) effectively meant a full `RE_ALL` scan on
// every keystroke in a large document that already contains markers (where the
// `indexOf('{')` early-out doesn't apply); 150 ms coalesces bursts of typing into
// one parse while staying visually immediate. Configurable via
// `kaicrit.edit.decorationDebounce`.
const DEFAULT_DEBOUNCE_MS = 150;

export class DecoratorManager {
  private readonly deletionType: vscode.TextEditorDecorationType;
  private readonly additionType: vscode.TextEditorDecorationType;
  private readonly substitutionOldType: vscode.TextEditorDecorationType;
  private readonly substitutionNewType: vscode.TextEditorDecorationType;
  private readonly highlightType: vscode.TextEditorDecorationType;
  private readonly commentType: vscode.TextEditorDecorationType;
  private readonly markerType: vscode.TextEditorDecorationType;

  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private changeCache = new Map<string, CriticChange[]>();

  // Fires after `update()` refreshes the cache + decorations for an editor, so
  // observers (e.g. the status bar) can react without re-parsing the document.
  private readonly _onDidUpdate = new vscode.EventEmitter<vscode.TextEditor>();
  readonly onDidUpdate = this._onDidUpdate.event;

  // `isEnabled` gates parsing per document: when a document is disabled (via the
  // language whitelist or the per-file status-bar toggle) `update` caches an
  // empty change list and clears decorations, so every downstream reader goes
  // inert. Defaults to always-on so the manager works standalone (e.g. in tests).
  constructor(private readonly isEnabled: (doc: vscode.TextDocument) => boolean = () => true) {
    // The six content decoration types come from the shared factory (one fresh
    // instance set per call) — the same styles + `kaicrit.*` ThemeColor IDs the
    // Double-Pane view reuses. Each content decoration also paints a marker in
    // the overview ruler so the location of changes is visible on the scrollbar.
    const t = createContentDecorationTypes();
    this.deletionType = t.deletion;
    this.additionType = t.addition;
    this.substitutionOldType = t.substitutionOld;
    this.substitutionNewType = t.substitutionNew;
    this.highlightType = t.highlight;
    this.commentType = t.comment;
    // Dim the marker characters themselves — local to the editor, no ruler marker.
    this.markerType = vscode.window.createTextEditorDecorationType({
      opacity: '0.4',
    });
  }

  scheduleUpdate(doc: vscode.TextDocument): void {
    const key = doc.uri.toString();
    const existing = this.timers.get(key);
    if (existing) { clearTimeout(existing); }
    this.timers.set(key, setTimeout(() => {
      this.timers.delete(key);
      const editor = vscode.window.visibleTextEditors.find(e => e.document === doc);
      if (editor) { this.update(editor); }
    }, this.debounceMs()));
  }

  // Debounce interval read fresh from the setting each schedule, so a config edit
  // takes effect on the next keystroke without needing a reload. Negative values
  // are clamped to 0 (parse on the next tick).
  private debounceMs(): number {
    const ms = vscode.workspace
      .getConfiguration('kaicrit.edit')
      .get<number>('decorationDebounce', DEFAULT_DEBOUNCE_MS);
    return Math.max(0, ms);
  }

  update(editor: vscode.TextEditor): void {
    // An explicit update parses the document's *current* text, so any debounced
    // update still pending for it (e.g. the one scheduled by the change event an
    // accept/reject edit fires) would only re-parse the same text. Cancel it so
    // the document is parsed once per resolution, not twice.
    const key = editor.document.uri.toString();
    const pending = this.timers.get(key);
    if (pending) { clearTimeout(pending); this.timers.delete(key); }

    const changes = this.isEnabled(editor.document)
      ? parseCriticMarkup(editor.document)
      : [];
    this.changeCache.set(key, changes);
    // Apply the freshly parsed decorations to *every* visible editor showing
    // this document, not just the one passed in: the same file can be open in a
    // split, and decorating only one pane leaves the other showing stale markers
    // until it regains focus (issue #56). The cache is per document, so this is
    // one parse fanned out across panes.
    let decorated = false;
    for (const ed of vscode.window.visibleTextEditors) {
      if (ed.document === editor.document) {
        this.applyDecorations(ed, changes);
        decorated = true;
      }
    }
    // Fallback for a passed editor that isn't in the visible set (defensive;
    // callers normally pass a visible editor).
    if (!decorated) { this.applyDecorations(editor, changes); }
    this._onDidUpdate.fire(editor);
  }

  clear(doc: vscode.TextDocument): void {
    const key = doc.uri.toString();
    this.changeCache.delete(key);
    const timer = this.timers.get(key);
    if (timer) { clearTimeout(timer); this.timers.delete(key); }
  }

  getChanges(doc: vscode.TextDocument): CriticChange[] {
    return this.changeCache.get(doc.uri.toString()) ?? [];
  }

  // Whether a debounced re-parse is still queued for this document. When true,
  // the cached changes predate the latest edit, so a reader that is about to act
  // on `fullRange` offsets (accept/reject) should flush via `update` first to
  // avoid resolving against stale spans (issue #52).
  hasPending(doc: vscode.TextDocument): boolean {
    return this.timers.has(doc.uri.toString());
  }

  // Whether this document's parse result is already cached (warm), regardless of
  // how many changes it holds. Lets readers distinguish "cache cold" from "cache
  // warm but empty" so they don't re-scan a marker-free document on every query.
  hasCache(doc: vscode.TextDocument): boolean {
    return this.changeCache.has(doc.uri.toString());
  }

  // Keep the `kaicrit.hasChanges` context key in sync with the given editor's
  // change count. Called for the active editor on update + editor switches.
  syncContext(editor: vscode.TextEditor | undefined): void {
    const has = !!editor && this.getChanges(editor.document).length > 0;
    void vscode.commands.executeCommand('setContext', HAS_CHANGES_KEY, has);
  }

  private applyDecorations(editor: vscode.TextEditor, changes: CriticChange[]): void {
    const deletionRanges: vscode.Range[] = [];
    const additionRanges: vscode.Range[] = [];
    const substOldRanges: vscode.Range[] = [];
    const substNewRanges: vscode.Range[] = [];
    const highlightRanges: vscode.Range[] = [];
    // Comments carry an optional hover (author/date), so they use the richer
    // DecorationOptions shape instead of a bare Range.
    const commentDecorations: vscode.DecorationOptions[] = [];
    const markerRanges: vscode.Range[] = [];

    for (const c of changes) {
      switch (c.type) {
        case ChangeType.Deletion:
          if (c.contentRange) { deletionRanges.push(c.contentRange); }
          collectMarkers(c, markerRanges, editor.document, 3, 3);
          break;
        case ChangeType.Addition:
          if (c.contentRange) { additionRanges.push(c.contentRange); }
          collectMarkers(c, markerRanges, editor.document, 3, 3);
          break;
        case ChangeType.Substitution:
          if (c.oldRange) { substOldRanges.push(c.oldRange); }
          if (c.newRange) { substNewRanges.push(c.newRange); }
          // markers: {~~ (3 chars), ~> (2 chars), ~~} (3 chars)
          collectSubstitutionMarkers(c, markerRanges, editor.document, c.oldText ?? '', c.newText ?? '');
          break;
        case ChangeType.Highlight:
          if (c.contentRange) { highlightRanges.push(c.contentRange); }
          collectMarkers(c, markerRanges, editor.document, 3, 3);
          break;
        case ChangeType.Comment:
          if (c.contentRange) {
            commentDecorations.push({
              range: c.contentRange,
              hoverMessage: commentHover(c),
            });
          }
          collectMarkers(c, markerRanges, editor.document, 3, 3);
          break;
      }
    }

    editor.setDecorations(this.deletionType,       deletionRanges);
    editor.setDecorations(this.additionType,       additionRanges);
    editor.setDecorations(this.substitutionOldType, substOldRanges);
    editor.setDecorations(this.substitutionNewType, substNewRanges);
    editor.setDecorations(this.highlightType,      highlightRanges);
    editor.setDecorations(this.commentType,        commentDecorations);
    editor.setDecorations(this.markerType,         markerRanges);
  }

  dispose(): void {
    this.deletionType.dispose();
    this.additionType.dispose();
    this.substitutionOldType.dispose();
    this.substitutionNewType.dispose();
    this.highlightType.dispose();
    this.commentType.dispose();
    this.markerType.dispose();
    this._onDidUpdate.dispose();
    for (const t of this.timers.values()) { clearTimeout(t); }
  }
}

// Build the hover for a comment: shows author/date when present, otherwise
// undefined (no hover) so plain comments behave exactly as before.
//
// author/date come straight from the document content. The author pattern
// (`@\S+`) would otherwise allow markup like `@[Name](https://evil.example)` to
// render as a clickable link in the hover (relevant for shared, third-party-
// annotated files). Escape the interpolated values so they render as literal
// text (issue #62); the surrounding `**`/`·` are our own and stay markup.
function commentHover(c: CriticChange): vscode.MarkdownString | undefined {
  if (c.author === undefined && c.date === undefined) { return undefined; }
  const parts: string[] = [];
  if (c.author !== undefined) { parts.push(`**@${escapeMarkdown(c.author)}**`); }
  if (c.date !== undefined) { parts.push(escapeMarkdown(c.date)); }
  return new vscode.MarkdownString(parts.join(' · '));
}

// Escape characters that markdown (and the hover's link/image syntax) treats as
// special, so document-sourced text renders literally.
function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+\-.!<>|~]/g, '\\$&');
}

function collectMarkers(
  c: CriticChange,
  out: vscode.Range[],
  doc: vscode.TextDocument,
  openLen: number,
  closeLen: number,
): void {
  const fullStart = doc.offsetAt(c.fullRange.start);
  const fullEnd   = doc.offsetAt(c.fullRange.end);
  out.push(new vscode.Range(
    doc.positionAt(fullStart),
    doc.positionAt(fullStart + openLen),
  ));
  out.push(new vscode.Range(
    doc.positionAt(fullEnd - closeLen),
    doc.positionAt(fullEnd),
  ));
}

function collectSubstitutionMarkers(
  c: CriticChange,
  out: vscode.Range[],
  doc: vscode.TextDocument,
  oldText: string,
  newText: string,
): void {
  const fullStart = doc.offsetAt(c.fullRange.start);
  const fullEnd   = doc.offsetAt(c.fullRange.end);
  // opening {~~
  out.push(new vscode.Range(doc.positionAt(fullStart), doc.positionAt(fullStart + 3)));
  // separator ~>
  const sepOffset = fullStart + 3 + oldText.length;
  out.push(new vscode.Range(doc.positionAt(sepOffset), doc.positionAt(sepOffset + 2)));
  // closing ~~}
  out.push(new vscode.Range(doc.positionAt(fullEnd - 3), doc.positionAt(fullEnd)));
}
