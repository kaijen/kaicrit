# Changes sidebar

kaicrit contributes a dedicated **CriticMarkup** view container to the Activity
Bar. It holds two views: a **Files with Changes** overview on top and the
**Changes** view below. The Changes view lists every CriticMarkup change in the
*active* document so you can review a file at a glance without scrolling through
it. The Activity Bar icon carries a **number badge** with the active document's
change count — like the Explorer's unsaved-files badge — and disappears when
the document has no changes (or kaicrit is disabled for it).

## Files with changes

Above the per-file change list, the **Files with Changes** view lists every file
that contains CriticMarkup, each with its change count after the file name.
**Click** a file to open it. A scope button in the view title (and the
`kaicrit.files.scope` setting) switches what gets listed:

- **Open files** (`open`, the default) — only the files currently open as editor
  tabs, whether in the foreground or a background tab. Phantom buffers without a
  real text tab (diff/HEAD comparisons and the like) are not listed. Open
  documents read the same parsed-change cache as the Changes view (no extra
  scan). The list refreshes live as you open or close tabs. Honours the
  [enablement gate](activation.md).
- **Whole workspace** (`workspace`) — additionally scans every file on disk
  (up to 5000 files; oversized/binary files are skipped), preferring the
  in-memory text of any unsaved open file so edits show before a save. Like the
  open scope it honours the [enablement gate](activation.md): a disk file's
  language is resolved from its path (its extension, or a `files.associations`
  override) and matched against `kaicrit.enabledLanguages`, so only the enabled
  file types are read and listed — the workspace scan never surfaces a file type
  kaicrit isn't active for. A **Refresh** button in the view title re-scans on
  demand; the view also refreshes (debounced) on edits, file open/close, and
  save.

A second button in the view title (and the `kaicrit.files.displayMode` setting)
switches how the files are presented — handy when a change set spans many nested
folders:

- **List** (`list`, the default) — a flat, alphabetically-sorted list of file
  names; the file's relative path shows on hover.
- **Tree** (`tree`) — a collapsible folder tree mirroring the directory
  structure. Each folder carries the aggregate change count of the files beneath
  it and is **expanded by default**; collapsing or expanding a folder is
  remembered (persisted in workspace state) so a refresh or window reload keeps
  your layout instead of snapping back to fully expanded. File leaves stay
  directly clickable to open the file.

## Changes view layout

Two layouts, switched by the group/flat button in the view title and persisted
in the `kaicrit.changes.grouping` setting (`type` — the default — or
`chronological`):

**Grouped by type** (`type`) — a two-level tree:

- **Type groups** — one node per change type that occurs in the document
  (Deletions, Additions, Substitutions, Highlights, Comments), each carrying a
  per-type icon **tinted in the type's configured color** (the same `kaicrit.*`
  [theme colors](markup.md#colors) that style the editor
  decorations and the status-bar counts) plus the group's count, e.g.
  `Deletions (3)`. Groups appear in the same fixed order as the status bar
  summary, and only for types that are actually present.
- **Changes** — under each group, one leaf per change. The label is a short,
  whitespace-collapsed preview of the content (for a substitution,
  `old → new`); the description shows the line number, and for comments with
  [metadata](markup.md#comment-metadata-author--date) the author and date.

**Chronological** (`chronological`) — a flat list, no group headers: every
change in document order, each leaf carrying its color-tinted per-type icon so
the type stays visible. Labels and descriptions are otherwise identical to the
grouped leaves.

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
| Open a file | Click a file in the Files overview | Opens that file in the editor |
| Open files ⇄ Whole workspace | Scope button in the Files view title | Switches the overview scope (writes `kaicrit.files.scope`) |
| List ⇄ Tree | List/tree button in the Files view title | Switches the overview between a flat name list and a folder tree (writes `kaicrit.files.displayMode`) |
| Refresh files | Refresh button in the Files view title | Re-scans the workspace for files with changes |

Inline and title actions reuse the same accept/reject logic as the
[editor commands and inline actions](markup.md), so the
[resolution semantics](markup.md) are identical no matter where you trigger
them from.
