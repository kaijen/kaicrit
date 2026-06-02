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
status-bar item (`$(edit) Track Changes: On/Off`) stays visible in every text
editor and shows the current state; click it to switch recording on or off for
the active document. New documents start with the value of the
`kaicrit.edit.trackChanges` setting (default `false`).

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

The **insert commands** (*Highlight*, *Comment*, *Addition*, …) are an exception:
they author markup explicitly, so their edit is applied through the same
re-entrancy guard and the recorder leaves it verbatim. Wrapping a selection in a
highlight or comment yields `{==foo==}` / `{>>foo<<}` directly — without a
spurious leading `{--foo--}` deletion that the replace would otherwise look like.

## Behaviour matrix

| You do… | Result |
|---|---|
| Type into plain text | `{++typed++}`, caret inside before `++}` |
| Type inside an existing addition | The addition grows; no new marker |
| Delete plain text | `{--deleted--}`, caret before `{--` |
| Delete text you just added (inside an addition) | The added text is simply removed — it never "was" |
| Delete next to an existing deletion (single edit) | The deletions merge into one `{--…--}` |
| Replace a selection | `{~~old~>new~~}` |
| Edit *inside* an existing marker's content | Absorbed into that marker — no nested markup |
| Paste markup *inside* a marker's content | Inner markers flattened to accept-form, then absorbed (no nesting) |
| Delete/replace a marker's *delimiter* (e.g. a `{`, `+` or `}`) | The whole marker is **rejected** (resolved) |
| Paste markup into *plain* text | Kept as-is, not re-wrapped (no `{++{++a++}++}`) |
| Use an insert command (e.g. *Highlight*, *Comment*) on a selection | The selection is wrapped verbatim (`{==foo==}`) — no recorded edit, no leading `{--foo--}` deletion |
| Multiple cursors / a multi-edit event | Each edit is wrapped independently (no cross-cursor merge) |
| Undo / Redo | Not re-processed — see below |

## Editing an existing marker

Three rules keep you from accidentally producing markup-inside-markup while
recording:

- **Edits inside a marker's content are absorbed.** Typing or deleting between
  the delimiters just grows or shrinks that marker (an addition's body, a
  substitution's new side, etc.) instead of wrapping a new change inside it. If
  the inserted text *itself* contains complete markers (e.g. you paste `{++any++}`
  into an addition), they are flattened to their accept-form before being absorbed
  — the addition keeps `any`, a pasted deletion or comment contributes nothing, a
  pasted substitution keeps its new side — so the enclosing marker simply grows by
  the resulting plain text instead of nesting (`{++an{++any++}y++}`).
- **Removing a marker's delimiter rejects the whole marker.** If a deletion (or
  a replacement) takes out any part of an opener or closer — for example you
  backspace the leading `{` of `{++a++}` — kaicrit treats the gesture as
  *rejecting* that change and resolves the marker with the same semantics as the
  Reject action, rather than leaving broken or nested markup like
  `{--{--}++a++}`. A selection that spans both content and a delimiter rejects
  the entire marker, not just the selected slice. A pure insertion never removes
  a delimiter, so it does not trigger a reject.
- **Pasting text that is already CriticMarkup is kept as-is.** If the inserted
  text *is itself* one or more complete markers — pasting `{++a++}`, or
  `{--x--}{++y++}` — kaicrit leaves it verbatim instead of wrapping it into
  `{++{++a++}++}`. When the paste mixes plain text with embedded markers (e.g.
  `foo {++a++} bar`), only the plain runs are tracked as additions and the
  embedded markers stay literal (`{++foo ++}{++a++}{++ bar++}`). Pasting markup
  *over a selection* additionally tracks the replaced text as a leading deletion
  (`foo` → `{++a++}` records `{--foo--}{++a++}`). Partial/unterminated input
  such as `{++a` is not valid markup, so it falls through to the normal addition
  wrap. (Pasting markup *inside* an existing marker is governed by the first rule
  above — its inner markers are flattened to their accept-form and absorbed, never
  kept literal, so no nesting forms.)

What "reject" yields depends on the marker type (it mirrors the
[accept/reject table](markup.md)):

| Marker | Removing a delimiter resolves to | Effect |
|---|---|---|
| `{++a++}` addition | `` (empty) | the proposed insertion disappears |
| `{--T--}` deletion | `T` | the deleted text is kept |
| `{~~O~>N~~}` substitution | `O` | reverts to the original |
| `{==T==}` highlight | `T` | highlight removed, text kept |
| `{>>T<<}` comment | `` (empty) | the comment is removed |

To **accept** a change, use the accept action/command — there is no
delete-to-accept gesture.

## Normal mode (Track Changes off)

With Track Changes **off**, editing is otherwise pure passthrough — kaicrit only
decorates the buffer, it never rewrites it, and markers are created only
explicitly (via the insert commands or by typing them). One narrow exception
guards against accidentally producing nested, spec-invalid markup:

- **Pasting CriticMarkup into the content of an existing marker flattens the
  pasted markers.** If you paste `{++x++}` between the `b` and `c` of `{++abc++}`,
  the inner addition is flattened to its accept-form and absorbed, yielding
  `{++abxc++}` instead of the nested `{++ab{++x++}c++}`. This reuses the same
  accept-form flatten as the first rule above (deletion/comment → nothing,
  substitution → its new side).

Everything else stays verbatim: plain text pasted in normal mode stays plain (it
is **not** wrapped as an addition), and standalone markup pasted into *plain* text
is left literal (`{++a++}` stays `{++a++}`). The guard fires only for the
paste-into-a-marker case, so nesting created another way — a stray typed `{`, the
insert commands, or pasting *already*-nested literal text — is not caught.

Disable the guard with the `kaicrit.edit.preventNestingOnPaste` setting (default
`true`) when you want to paste literal CriticMarkup verbatim, e.g. while
documenting the syntax.

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
