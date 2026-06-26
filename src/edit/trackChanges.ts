import * as vscode from 'vscode';
import {
  computeTrackChanges, computeNormalModeFlatten, RawEdit, CompEdit,
  applyRawEdits, applyCompEdits, diffSingleEdit, matchesSelfEdit,
} from './trackChangesEngine';

const CONTEXT_KEY = 'kaicrit.trackChanges';

// Live "track changes" recorder. State is per document: each tracked document
// keeps an entry in `enabled` and a `shadow` snapshot of its text (needed to
// recover deleted text, which the change event does not carry). The compensating
// edit logic lives in the pure trackChangesEngine; this class is the thin VS
// Code wrapper that wires it to document events and the UI.
export class TrackChangesManager {
  private readonly enabled = new Set<string>();
  // `shadow` is kept exactly equal to the live document text by REPLAYING every
  // change event's contentChanges into it (applyRawEdits), rather than reading it
  // back from an asynchronously-refreshed `getText()`. This is what makes the
  // recorder safe under fast typing: the pre-edit text the engine classifies
  // against is always accurate, even when several events arrive before a
  // compensating `applyEdit` settles.
  private readonly shadow = new Map<string, string>();
  private readonly seen = new Set<string>();
  // Re-entrancy guard for the edits kaicrit ITSELF originates outside the recorder
  // loop — accept/reject resolutions (`applyResolution`) and explicit markup
  // authoring (`applyAuthoringEdit`). While a document is in this set, the change
  // event those edits fire is skipped entirely (never tracked). Per-document so an
  // in-flight edit in A can't drop an edit in B (issues #42, #44).
  private readonly applyingOwnEdit = new Set<string>();
  // The recorder's own compensating edit currently in flight, per document. Holds
  // the edits we submitted (to recognise their echo) and the `expected` document
  // text once that echo lands. Presence ⇒ a compensating `applyEdit` is awaiting
  // its result; new compensating edits are serialised behind it.
  private readonly compensating = new Map<string, { edits: CompEdit[]; expected: string }>();
  // Set when a genuine user edit arrives WHILE a compensating edit is in flight.
  // After that edit settles, `reconcile` wraps the text the user typed during the
  // window — so no keystroke is ever dropped (the bug this design fixes).
  private readonly dirty = new Set<string>();
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
    this.compensating.delete(key);
    this.dirty.delete(key);
  }

  handleChange(event: vscode.TextDocumentChangeEvent): void {
    const key = event.document.uri.toString();
    if (!this.enabled.has(key)) { this.handleNormalMode(event, key); return; }

    // Resolution / authoring edits kaicrit originates outside the recorder loop:
    // their change event must never be tracked (issues #42, #44).
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

    // A compensating edit is already in flight for this document. We must NOT
    // start a second one concurrently (the document is mid-transform), but we must
    // also NOT drop this event — that was the fast-typing bug. Two cases:
    //   - It is the echo of our own WorkspaceEdit → consume it: advance the shadow
    //     to the text we expected, and stop. Recognised by matchesSelfEdit.
    //   - It is a genuine user edit racing the in-flight compensation → keep its
    //     text in the shadow (replay) and mark the document dirty, so the wrap is
    //     applied once the in-flight edit settles (see beginCompensating's reconcile).
    const inFlight = this.compensating.get(key);
    if (inFlight) {
      if (matchesSelfEdit(inFlight.edits, raw)) {
        this.shadow.set(key, inFlight.expected);
      } else {
        this.shadow.set(key, applyRawEdits(pre, raw));
        this.dirty.add(key);
      }
      return;
    }

    const result = computeTrackChanges(pre, raw);
    // Keep the shadow equal to the document after the raw edit (markers not yet
    // applied). beginCompensating advances it to the wrapped text on settle.
    this.shadow.set(key, applyRawEdits(pre, raw));

    // Everything was already inside an addition (or removed added text): nothing
    // to wrap.
    if (result.edits.length === 0) { return; }

    this.beginCompensating(key, event.document, result.edits, result.selections);
  }

  // Apply one compensating WorkspaceEdit and manage its in-flight lifecycle. The
  // edit is serialised per document via `compensating`; on settle, if a user edit
  // raced it (`dirty`), the raced text is wrapped by `reconcile` rather than lost.
  private beginCompensating(
    key: string,
    doc: vscode.TextDocument,
    edits: CompEdit[],
    selections: number[],
    restoreSel = true,
  ): void {
    // The text the document should hold once our edit lands. `shadow` currently
    // equals the post-raw-edit (unwrapped) document, which is what the edits apply
    // over. Used both to recognise our echo and as the reconcile baseline.
    const expected = applyCompEdits(this.shadow.get(key) ?? '', edits);

    const we = new vscode.WorkspaceEdit();
    for (const e of edits) {
      const range = new vscode.Range(doc.positionAt(e.start), doc.positionAt(e.end));
      we.replace(doc.uri, range, e.replacement);
    }

    this.compensating.set(key, { edits, expected });
    this.dirty.delete(key);
    void vscode.workspace.applyEdit(we).then(
      (applied) => {
        this.compensating.delete(key);
        const raced = this.dirty.delete(key);
        if (!applied) { return; }
        if (raced) {
          // A user typed while this edit was in flight. The shadow (kept in sync by
          // replaying every event) now holds our markers plus that raw text; wrap
          // the difference from `expected`. Don't restore the caret — the user's
          // own caret position is more current than our computed one.
          this.reconcile(key, doc, expected);
        } else {
          this.shadow.set(key, expected);
          if (restoreSel) { this.restoreSelections(doc, selections); }
        }
      },
      () => {
        // applyEdit rejected (read-only doc, conflicting edit): release the in-flight
        // slot without the success follow-up so recording stays alive.
        this.compensating.delete(key);
        this.dirty.delete(key);
      },
    );
  }

  // Wrap the text a user typed while a compensating edit was in flight. Works
  // purely from two known strings — the `baseline` we expected and the current
  // shadow (kept equal to the live document) — so no stale event coordinate can
  // corrupt it. The single-edit diff is exact for contiguous typing and degrades
  // to one spanning wrap otherwise; either way nothing is dropped. Re-enters
  // beginCompensating, so a burst of races converges over a few cycles.
  private reconcile(key: string, doc: vscode.TextDocument, baseline: string): void {
    const cur = this.shadow.get(key);
    // No net difference (e.g. the echo arrived but no user text actually raced):
    // the shadow already equals the baseline, nothing to wrap.
    if (cur === undefined || cur === baseline) { return; }
    const rawEdit = diffSingleEdit(baseline, cur);
    const result = computeTrackChanges(baseline, [rawEdit]);
    if (result.edits.length === 0) { return; }
    this.beginCompensating(key, doc, result.edits, result.selections, /* restoreSel */ false);
  }

  private restoreSelections(doc: vscode.TextDocument, selections: number[]): void {
    if (selections.length === 0) { return; }
    const editor = vscode.window.visibleTextEditors.find(e => e.document === doc);
    if (!editor) { return; }
    editor.selections = selections.map(off => {
      const p = doc.positionAt(off);
      return new vscode.Selection(p, p);
    });
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
    this.compensating.clear();
    this.dirty.clear();
  }
}
