# Track Changes (Annotate) mode

The **Track Changes** mode turns kaicrit into a live "track changes" recorder:
while it is on for a document, your normal edits are not written verbatim —
they are captured as CriticMarkup instead. Deleting text wraps it in
`{--…--}`, typing wraps it in `{++…++}`, and replacing a selection produces a
substitution `{~~old~>new~~}`. You can then review and resolve the recorded
changes with the usual accept/reject actions.

## Toggling

Track Changes is toggled **per document** with the
`kaicrit.toggleTrackChanges` command (default keybinding `Alt+K Alt+T`). A
status-bar item (`$(edit) Track Changes`) appears while the active editor is
recording; click it to turn recording off again. New documents start with the
value of the `kaicrit.edit.trackChanges` setting (default `false`).

Because the state is per document, you can record changes in one file while
editing another normally.

## How it works

VS Code applies an edit to the buffer *before* extensions are notified, so
kaicrit cannot intercept your keystroke. Instead it reacts to
`workspace.onDidChangeTextDocument`:

1. Your raw edit is applied (`S0 → S1`).
2. kaicrit reconstructs what changed (the inserted text from the event, the
   deleted text from a per-document **shadow snapshot**) and applies a single
   compensating `WorkspaceEdit` that wraps the region in the matching marker
   (`S1 → S2`).
3. A re-entrancy guard makes sure kaicrit never re-processes its own edit, and
   the shadow snapshot is refreshed to `S2`.

To keep continued typing natural, the caret is parked **inside** a freshly
created addition (just before `++}`). The next character therefore lands in
the addition's content and the marker simply grows, instead of producing
`{++a++}{++b++}`.

## Behaviour matrix

| You do… | Result |
|---|---|
| Type into plain text | `{++typed++}`, caret inside before `++}` |
| Type inside an existing addition | The addition grows; no new marker |
| Delete plain text | `{--deleted--}`, caret before `{--` |
| Delete text you just added (inside an addition) | The added text is simply removed — it never "was" |
| Delete next to an existing deletion (single edit) | The deletions merge into one `{--…--}` |
| Replace a selection | `{~~old~>new~~}` |
| Multiple cursors / a multi-edit event | Each edit is wrapped independently (no cross-cursor merge) |
| Undo / Redo | Not re-processed — see below |

## Known limitations

- **Two-step undo.** Each tracked keystroke produces two document edits (your
  raw edit plus the compensating wrap), so one *Undo* removes the marker wrap
  and a second *Undo* removes the original edit. This is intentional: it keeps
  the recorder simple and predictable.
- **Adjacency merge is single-edit only.** Streaks of backspaces merge into one
  deletion, but simultaneous multi-cursor edits each get their own marker.
- **No authorship.** Recorded additions/deletions/substitutions are plain
  CriticMarkup with no author/date metadata (the standard has none for these
  types). Only comments carry the optional
  [author/date convention](markup.md#comment-metadata-author--date).
- **All sources are recorded.** Any buffer edit while recording is on — typing,
  paste, formatters, code actions — is captured. Turn the mode off before bulk
  reformatting if you do not want those edits annotated.
- **Very fast typing** can, in rare cases, race the compensating edit; the
  shadow snapshot is re-synced on every event to recover.
