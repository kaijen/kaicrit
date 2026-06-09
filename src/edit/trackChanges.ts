import * as vscode from 'vscode';
import { computeTrackChanges, computeNormalModeFlatten, RawEdit } from './trackChangesEngine';

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

  // `isDocEnabled` gates the recorder against the same enablement decision the
  // decorator uses (language whitelist + per-file toggle). Both the normal-mode
  // paste-flatten and the `applyDefault` auto-enable consult it so the recorder
  // never produces markers in a document where no decoration / accept-reject can
  // act on them (issues #53, #54). Defaults to always-on so the manager works
  // standalone (e.g. in tests).
  constructor(private readonly isDocEnabled: (doc: vscode.TextDocument) => boolean = () => true) {
    this.statusItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right, 90,
    );
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
    // Don't auto-enable recording in a kaicrit-disabled document (issue #54).
    // Return *without* marking it seen so the default still applies the first
    // time the document later becomes enabled.
    if (!this.isDocEnabled(doc)) { return; }
    this.seen.add(key);
    const on = vscode.workspace
      .getConfiguration('kaicrit', doc)
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
  // (the latter drives keybinding/menu `when` clauses). The status item is a
  // two-way toggle: it stays visible in every regular text editor (file/untitled)
  // and shows the on/off state, so the recorder can be switched on from the bar
  // too — not just turned off while active (mirrors the `$(eye)` enablement
  // toggle). It is hidden only where there is no document to record (no editor,
  // or a non-file/untitled scheme like an output/diff pane).
  syncActiveEditor(editor: vscode.TextEditor | undefined): void {
    const on = !!editor && this.enabled.has(editor.document.uri.toString());
    void vscode.commands.executeCommand('setContext', CONTEXT_KEY, on);

    const scheme = editor?.document.uri.scheme;
    if (!editor || (scheme !== 'file' && scheme !== 'untitled')) {
      this.statusItem.hide();
      return;
    }
    this.statusItem.text = on ? '$(edit) Track Changes: On' : '$(edit) Track Changes: Off';
    this.statusItem.tooltip = on
      ? 'Recording edits as CriticMarkup in this document — click to turn off'
      : 'Records edits as CriticMarkup when on — click to turn on';
    this.statusItem.show();
  }

  // Apply a WorkspaceEdit that kaicrit itself originates when resolving a change
  // (accept/reject, single or all). The recorder must NOT re-process the resulting
  // change event: removing a marker's delimiters looks exactly like the issue-#38
  // "reject this marker" gesture, so the recorder would undo the resolution
  // (accepting {--foo--} would re-insert "foo", accepting a substitution would
  // revert to the old side, …). Reuses the same per-document `applyingOwnEdit`
  // guard as the recorder's own compensating edits so `handleChange` skips the
  // event, then refreshes the shadow snapshot to the post-resolution text so the
  // next real user edit diffs against it. Resolves `false` (never rejects) on a
  // failed `applyEdit` so the caller can still refresh decorations.
  applyResolution(doc: vscode.TextDocument, edit: vscode.WorkspaceEdit): Thenable<boolean> {
    const key = doc.uri.toString();
    this.applyingOwnEdit.add(key);
    return vscode.workspace.applyEdit(edit).then(
      (applied) => {
        this.applyingOwnEdit.delete(key);
        if (applied && this.enabled.has(key)) { this.shadow.set(key, doc.getText()); }
        return applied;
      },
      () => {
        this.applyingOwnEdit.delete(key);
        return false;
      },
    );
  }

  // Apply an edit that *authors* CriticMarkup explicitly — the insert/wrap
  // commands (`kaicrit.insert*`). The user is deliberately writing markup, so it
  // must land verbatim regardless of whether Track Changes is on, and the
  // recorder must NOT re-process the resulting change event. Without this guard a
  // wrap such as "foo" → "{==foo==}" reaches `handleChange` as a replace whose new
  // side already contains a marker; the engine then tracks the replaced text as a
  // leading "{--foo--}" deletion (issue #44). Reuses the same per-document
  // `applyingOwnEdit` guard as `applyResolution`, then refreshes the shadow so the
  // next real user edit diffs against the authored text. `apply` runs the actual
  // edit (an `editor.edit` callback) and resolves with its success flag; the guard
  // is released in both the success and the rejection branch.
  applyAuthoringEdit(doc: vscode.TextDocument, apply: () => Thenable<boolean>): Thenable<boolean> {
    const key = doc.uri.toString();
    this.applyingOwnEdit.add(key);
    return apply().then(
      (applied) => {
        this.applyingOwnEdit.delete(key);
        if (applied && this.enabled.has(key)) { this.shadow.set(key, doc.getText()); }
        return applied;
      },
      () => {
        this.applyingOwnEdit.delete(key);
        return false;
      },
    );
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
    if (!this.enabled.has(key)) { this.handleNormalMode(event, key); return; }

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

    // Defensive: the shadow must be geometrically consistent with this event.
    // The engine extracts the deleted text from `pre` using each change's
    // pre-edit `rangeOffset`/`rangeLength`; if an external mutation (e.g. another
    // formatting provider, `reason === undefined`) ever left the shadow out of
    // sync, those offsets would read the wrong span and could assemble a
    // malformed marker (issue #68). When any change's pre-edit span falls outside
    // the shadow, resync from the live document and skip wrapping this event —
    // never emit a marker built from an inconsistent snapshot.
    const consistent = event.contentChanges.every(
      c => c.rangeOffset >= 0 && c.rangeOffset + c.rangeLength <= pre.length,
    );
    if (!consistent) {
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

  // Track Changes is OFF for this document. We normally do nothing (pure
  // passthrough), with ONE exception: prevent nested CriticMarkup from being
  // created when markup is pasted *into* the content of an existing marker. The
  // engine's computeNormalModeFlatten flattens only that case and returns no edits
  // for everything else, so plain text pasted in normal mode stays plain text.
  private handleNormalMode(event: vscode.TextDocumentChangeEvent, key: string): void {
    // Never re-process our own compensating edit (re-fires as a normal-mode change
    // since tracking is off — the same per-document guard the tracked path uses).
    if (this.applyingOwnEdit.has(key)) { return; }

    // Cheapest possible early-out on the hottest path in the extension (every
    // keystroke in every document). The paste-flatten can only ever do something
    // when the inserted text carries a complete marker, which requires a '{'. For
    // ordinary typing this skips the config read, the full-document getText, the
    // pre-text slice reconstruction and the marker scan entirely (issue #53). An
    // empty contentChanges array also exits here (`some` is false).
    if (!event.contentChanges.some(c => c.text.includes('{'))) { return; }

    // The paste-flatten is an editor feature, so it must stay inert in documents
    // kaicrit is disabled for — matching every other reader (issues #53, #54).
    if (!this.isDocEnabled(event.document)) { return; }

    if (
      event.reason === vscode.TextDocumentChangeReason.Undo ||
      event.reason === vscode.TextDocumentChangeReason.Redo
    ) {
      return;
    }

    const on = vscode.workspace
      .getConfiguration('kaicrit', event.document)
      .get<boolean>('edit.preventNestingOnPaste', true);
    if (!on) { return; }

    // Reconstruct the pre-edit text. The change event reports the post-edit
    // document plus each change's PRE-edit rangeOffset/rangeLength and inserted
    // text — but NOT the deleted text. computeNormalModeFlatten only inspects the
    // intact prefix and marker lengths up to each edit, never the deleted bytes,
    // so a same-length, delimiter-free filler is exact for our purpose.
    const postText = event.document.getText();
    const changes = event.contentChanges.map(c => ({
      offset: c.rangeOffset,
      oldLength: c.rangeLength,
      newText: c.text,
    }));
    const ascending = [...changes].sort((a, b) => a.offset - b.offset);
    let prefixDelta = 0;
    const withPost = ascending.map(c => {
      const postStart = c.offset + prefixDelta;
      prefixDelta += c.newText.length - c.oldLength;
      return { ...c, postStart };
    });
    let preText = postText;
    for (const c of [...withPost].sort((a, b) => b.postStart - a.postStart)) {
      preText =
        preText.slice(0, c.postStart) +
        ' '.repeat(c.oldLength) +
        preText.slice(c.postStart + c.newText.length);
    }

    const raw: RawEdit[] = changes.map(c => ({
      offset: c.offset,
      oldLength: c.oldLength,
      newText: c.newText,
    }));
    const result = computeNormalModeFlatten(preText, raw);
    if (result.edits.length === 0) { return; } // pure passthrough

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
        this.applyingOwnEdit.delete(key);
        if (!applied) { return; }
        const editor = vscode.window.visibleTextEditors.find(e => e.document === event.document);
        if (editor && result.selections.length > 0) {
          editor.selections = result.selections.map(off => {
            const p = event.document.positionAt(off);
            return new vscode.Selection(p, p);
          });
        }
      },
      () => {
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
