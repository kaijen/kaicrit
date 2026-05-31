import * as vscode from 'vscode';
import { computeTrackChanges, RawEdit } from './trackChangesEngine';

const CONTEXT_KEY = 'kaicrit.trackChanges';

// Live "track changes" recorder. State is per document: each tracked document
// keeps an entry in `enabled` and a `shadow` snapshot of its text (needed to
// recover deleted text, which the change event does not carry). The compensating
// edit logic lives in the pure trackChangesEngine; this class is the thin VS
// Code wrapper that wires it to document events and the UI.
export class TrackChangesManager {
  private readonly enabled = new Set<string>();
  private readonly shadow = new Map<string, string>();
  private readonly seen = new Set<string>();
  // Re-entrancy guard, keyed per document: a document is added before its own
  // compensating `applyEdit` and removed once that edit settles (success OR
  // failure). A per-document set — rather than a single process-wide flag — keeps
  // an edit in document B from being dropped while document A's async `applyEdit`
  // is still in flight.
  private readonly applyingOwnEdit = new Set<string>();
  private readonly statusItem: vscode.StatusBarItem;

  constructor() {
    this.statusItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right, 90,
    );
    this.statusItem.text = '$(edit) Track Changes';
    this.statusItem.tooltip = 'Track Changes is recording this document — click to turn off';
    this.statusItem.command = 'kaicrit.toggleTrackChanges';
  }

  isEnabled(doc: vscode.TextDocument): boolean {
    return this.enabled.has(doc.uri.toString());
  }

  // Enable recording for a not-yet-seen document when the setting opts in. Called
  // when an editor becomes active so freshly opened files honour the default.
  applyDefault(doc: vscode.TextDocument): void {
    const key = doc.uri.toString();
    if (this.enabled.has(key) || this.seen.has(key)) { return; }
    this.seen.add(key);
    const on = vscode.workspace
      .getConfiguration('kaicrit')
      .get<boolean>('edit.trackChanges', false);
    if (on) {
      this.enabled.add(key);
      this.shadow.set(key, doc.getText());
    }
  }

  // Flip recording for a document. On enable we snapshot the current text so the
  // first deletion can recover its content.
  toggle(doc: vscode.TextDocument): void {
    const key = doc.uri.toString();
    if (this.enabled.has(key)) {
      this.enabled.delete(key);
      this.shadow.delete(key);
    } else {
      this.enabled.add(key);
      this.shadow.set(key, doc.getText());
    }
    this.syncActiveEditor(vscode.window.activeTextEditor);
  }

  // Reflect the active editor's recording state in the status bar + context key
  // (the latter drives keybinding/menu `when` clauses).
  syncActiveEditor(editor: vscode.TextEditor | undefined): void {
    const on = !!editor && this.enabled.has(editor.document.uri.toString());
    if (on) { this.statusItem.show(); } else { this.statusItem.hide(); }
    void vscode.commands.executeCommand('setContext', CONTEXT_KEY, on);
  }

  // Drop per-document state when a document closes.
  forget(doc: vscode.TextDocument): void {
    const key = doc.uri.toString();
    this.enabled.delete(key);
    this.shadow.delete(key);
    this.seen.delete(key);
    this.applyingOwnEdit.delete(key);
  }

  handleChange(event: vscode.TextDocumentChangeEvent): void {
    const key = event.document.uri.toString();
    if (!this.enabled.has(key)) { return; }

    // Never re-process our own compensating edit (checked per document).
    if (this.applyingOwnEdit.has(key)) { return; }

    // Undo/redo is deliberately left untouched (the two-step undo design); just
    // keep the shadow in sync with the result.
    if (
      event.reason === vscode.TextDocumentChangeReason.Undo ||
      event.reason === vscode.TextDocumentChangeReason.Redo
    ) {
      this.shadow.set(key, event.document.getText());
      return;
    }

    const pre = this.shadow.get(key);
    if (pre === undefined || event.contentChanges.length === 0) {
      this.shadow.set(key, event.document.getText());
      return;
    }

    const raw: RawEdit[] = event.contentChanges.map(c => ({
      offset: c.rangeOffset,
      oldLength: c.rangeLength,
      newText: c.text,
    }));
    const result = computeTrackChanges(pre, raw);

    // Everything was already inside an addition (or removed added text): nothing
    // to wrap, just record the new state.
    if (result.edits.length === 0) {
      this.shadow.set(key, event.document.getText());
      return;
    }

    const we = new vscode.WorkspaceEdit();
    for (const e of result.edits) {
      const range = new vscode.Range(
        event.document.positionAt(e.start),
        event.document.positionAt(e.end),
      );
      we.replace(event.document.uri, range, e.replacement);
    }

    this.applyingOwnEdit.add(key);
    void vscode.workspace.applyEdit(we).then(
      (applied) => {
        // Always clear the guard so a single failure can't wedge the recorder.
        this.applyingOwnEdit.delete(key);
        if (!applied) { return; }
        this.shadow.set(key, event.document.getText());
        const editor = vscode.window.visibleTextEditors.find(e => e.document === event.document);
        if (editor && result.selections.length > 0) {
          editor.selections = result.selections.map(off => {
            const p = event.document.positionAt(off);
            return new vscode.Selection(p, p);
          });
        }
      },
      () => {
        // applyEdit rejected (e.g. read-only doc, conflicting edit): release the
        // guard without the success follow-up so recording stays alive.
        this.applyingOwnEdit.delete(key);
      },
    );
  }

  dispose(): void {
    this.statusItem.dispose();
    this.enabled.clear();
    this.shadow.clear();
    this.seen.clear();
    this.applyingOwnEdit.clear();
  }
}
