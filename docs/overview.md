# Changes sidebar

kaicrit contributes a dedicated **CriticMarkup** view container to the Activity
Bar. Its **Changes** view lists every CriticMarkup change in the *active*
document, grouped by type so you can review a file at a glance without
scrolling through it.

## Layout

The tree has two levels:

- **Type groups** — one node per change type that occurs in the document
  (Deletions, Additions, Substitutions, Highlights, Comments), each labelled
  with its count, e.g. `Deletions (3)`. Groups appear in the same fixed order
  as the [status bar](index.md) summary, and only for types that are actually
  present.
- **Changes** — under each group, one leaf per change. The label is a short,
  whitespace-collapsed preview of the content (for a substitution,
  `old → new`); the description shows the line number, and for comments with
  [metadata](markup.md#comment-metadata-author--date) the author and date.

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

Inline and title actions reuse the same accept/reject logic as the
[editor commands and inline actions](markup.md), so the
[resolution semantics](markup.md) are identical no matter where you trigger
them from.
