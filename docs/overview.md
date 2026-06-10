# Changes sidebar

kaicrit contributes a dedicated **CriticMarkup** view container to the Activity
Bar. Its **Changes** view lists every CriticMarkup change in the *active*
document so you can review a file at a glance without scrolling through it.
The Activity Bar icon carries a **number badge** with the active document's
change count — like the Explorer's unsaved-files badge — and disappears when
the document has no changes (or kaicrit is disabled for it).

## Layout

Two layouts, switched by the group/flat button in the view title and persisted
in the `kaicrit.changes.grouping` setting (`type` — the default — or
`chronological`):

**Grouped by type** (`type`) — a two-level tree:

- **Type groups** — one node per change type that occurs in the document
  (Deletions, Additions, Substitutions, Highlights, Comments), each labelled
  with the same per-type symbol as the [status bar](index.md) and its count,
  e.g. `⊟ Deletions (3)`. Groups appear in the same fixed order as the status
  bar summary, and only for types that are actually present.
- **Changes** — under each group, one leaf per change. The label is a short,
  whitespace-collapsed preview of the content (for a substitution,
  `old → new`); the description shows the line number, and for comments with
  [metadata](markup.md#comment-metadata-author--date) the author and date.

**Chronological** (`chronological`) — a flat list, no group headers: every
change in document order, each leaf prefixed with its per-type symbol
(`⊟ ⊞ ⇄ ☰ 💬`) so the type stays visible. Labels and descriptions are otherwise
identical to the grouped leaves.

The view tracks the active editor and refreshes live as you type, insert, or
resolve changes — it reads the same parsed-change cache that powers the editor
decorations, so it adds no extra document scans. When the active document has
no CriticMarkup, the view shows a short empty-state hint.

## Actions

| Action | Where | Effect |
|---|---|---|
| Jump to a change | Click a leaf | Reveals the change in the editor and selects its marker |
| Accept / Reject one | Inline buttons on a leaf (hover) | Resolves exactly that change |
| Accept All / Reject All | Buttons in the view title | Resolves every change in the document in one atomic edit |
| Group ⇄ Chronological | Toggle button in the view title | Switches between the grouped and flat layouts (writes `kaicrit.changes.grouping`) |

Inline and title actions reuse the same accept/reject logic as the
[editor commands and inline actions](markup.md), so the
[resolution semantics](markup.md) are identical no matter where you trigger
them from.
