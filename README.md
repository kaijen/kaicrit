# kaicrit — CriticMarkup for VS Code

A complete CriticMarkup workflow in one extension:

- **Edit** — insert, navigate, and accept or reject tracked changes directly in the editor.
- **Compare** — diff two files into a single CriticMarkup document.
- **Preview** — render CriticMarkup in VS Code's built-in Markdown preview.

## What is CriticMarkup?

[CriticMarkup](https://github.com/CriticMarkup/CriticMarkup-toolkit) is a plain-text markup standard for tracking changes and comments in documents. It uses simple bracket-based syntax that works in any text file — Markdown, prose, or code. The [full specification](https://github.com/CriticMarkup/CriticMarkup-toolkit/blob/master/README.md) is maintained in the CriticMarkup-toolkit repository.

## Markup Types

| Type | Syntax | Meaning |
|---|---|---|
| Deletion | `{--deleted text--}` | Text marked for removal |
| Addition | `{++added text++}` | Text marked for insertion |
| Substitution | `{~~old~>new~~}` | Replacement pair |
| Highlight | `{==highlighted text==}` | Text marked for attention |
| Comment | `{>>comment text<<}` | Inline annotation |

All five types are rendered with distinct visual decorations in the editor. Marker characters are dimmed to reduce visual noise.

## Features

- **Syntax highlighting** — each change type gets a distinct color; markers are visually de-emphasized
- **Configurable colors** — all decoration colors can be overridden via `workbench.colorCustomizations`
- **Overview ruler markers** — changes are mirrored as colored marks on the scrollbar, so you can see where they sit without scrolling
- **Status bar counts** — the active editor's open changes are summarized by type (`⊟ ⊞ ⇄ ☰ 💬`); click the entry to jump to the first change
- **Changes sidebar** — a dedicated CriticMarkup view in the Activity Bar lists every change of the active document grouped by type; click an entry to jump to it, resolve it inline, or accept/reject all from the view title
- **Navigation** — jump between changes without scrolling
- **Accept / Reject** — resolve one change at the cursor or all changes at once
- **Inline CodeLens actions** — clickable **Accept | Reject** appear above every change, so edits can be resolved with the mouse without learning the shortcuts (toggle with `kaicrit.edit.codeLens`)
- **Comment metadata** — comments may carry an optional author and date (`{>>@kai 2026-05-31: text<<}`), shown in editor hovers and the preview; the author is configurable and the whole convention can be turned off
- **Compare** — turn the differences between two files into a CriticMarkup document you can review change by change
- **Markdown preview** — CriticMarkup renders inline in VS Code's built-in preview, no webview or build step

## Keybindings

### Insert

| Action | Keybinding |
|---|---|
| Insert Deletion | `Alt+K Alt+D` |
| Insert Addition | `Alt+K Alt+A` |
| Insert Substitution | `Alt+K Alt+S` |
| Insert Highlight | `Alt+K Alt+H` |
| Insert Comment | `Alt+K Alt+C` |

Wrap a selection before triggering to mark existing text; trigger without a selection to insert empty markers.

### Navigate

| Action | Keybinding |
|---|---|
| Next Change | `Alt+K Alt+↓` |
| Previous Change | `Alt+K Alt+↑` |
| First Change | `Alt+K Alt+Home` |
| Last Change | `Alt+K Alt+End` |

Next/Previous wrap around at document boundaries with a brief notification.

### Accept / Reject

| Action | Keybinding |
|---|---|
| Accept Change at Cursor | `Alt+A` |
| Reject Change at Cursor | `Alt+R` |
| Accept All Changes | `Alt+K Enter` |
| Reject All Changes | `Alt+K Backspace` |

All commands are also available via the Command Palette (`Ctrl+Shift+P`) under the **CriticMarkup** category.

## Accept / Reject Semantics

| Type | Accept | Reject |
|---|---|---|
| Deletion `{--T--}` | removes `T` | keeps `T` |
| Addition `{++T++}` | keeps `T` | removes `T` |
| Substitution `{~~O~>N~~}` | keeps `N` | keeps `O` |
| Highlight `{==T==}` | keeps `T` (strips markers) | keeps `T` (strips markers) |
| Comment `{>>T<<}` | removes entirely | removes entirely |

Accept All / Reject All apply all resolutions in a single atomic edit — no offset drift.

## Inline actions (CodeLens)

Above every CriticMarkup change, kaicrit shows clickable **Accept | Reject** actions. Clicking one resolves exactly that change using the same logic as the keyboard shortcuts; the lenses update automatically as you edit or resolve changes.

| Setting | Values | Default | Effect |
|---|---|---|---|
| `kaicrit.edit.codeLens` | `true`, `false` | `true` | Show the inline Accept / Reject CodeLens actions |

## Changes sidebar (overview)

kaicrit adds a **CriticMarkup** view to the Activity Bar that lists every change in the active document, grouped by type (Deletions, Additions, Substitutions, Highlights, Comments) with a per-group count. The view tracks the active editor and updates live as you type or resolve changes.

- **Click** a change to jump to it in the editor (it scrolls into view and selects the marker).
- **Inline Accept / Reject** buttons on each entry resolve exactly that change.
- **Accept All / Reject All** buttons in the view title resolve the whole document at once.

Each entry shows a short preview of the change (for substitutions, `old → new`) and its line number; comments with metadata also show the author and date. When the active document has no changes, the view shows a short empty-state hint.

## Comment metadata (author & date)

Comments may optionally start with an author and/or an ISO date, separated from the comment body by a colon:

```text
{>>@kai 2026-05-31: needs a source<<}
{>>@kai: looks good<<}
{>>2026-05-31: revisit later<<}
```

This is a backwards-compatible convention on top of CriticMarkup — a comment **without** this prefix (`{>>plain note<<}`, or even `{>>Note: see above<<}`) is treated exactly as before. When metadata is present, the author/date is shown distinctly in the editor hover and in the Markdown preview, and accept/reject still removes the whole comment.

Inserting a comment (`Alt+K Alt+C`) pre-fills `@author today: ` so the metadata is one keystroke away. The author comes from `kaicrit.edit.commentAuthor`; when that is empty, kaicrit falls back to the repository's `git config user.name`.

| Setting | Values | Default | Effect |
|---|---|---|---|
| `kaicrit.edit.commentMetadata` | `true`, `false` | `true` | Recognize the author/date convention (hover, preview, insert pre-fill). When `false`, comments are plain text. |
| `kaicrit.edit.commentAuthor` | string | `""` | Author pre-filled on insert. Empty falls back to `git config user.name`. |

## Compare two files → CriticMarkup

Generate a CriticMarkup document that describes how a first file (the original) becomes a second file (the modified version). The result is a normal text document you can read, edit, and resolve with the accept/reject commands above.

| Action | How |
|---|---|
| Compare two arbitrary files | Command Palette → **Compare Two Files → CriticMarkup** |
| Compare the open file with another | Command Palette → **Compare Active File With… → CriticMarkup** |
| Two-step compare from the Explorer | Right-click file 1 → **Select for CriticMarkup Compare**, then right-click file 2 → **Compare with Selected → CriticMarkup** |
| Compare two selected files | Select two files in the Explorer → right-click → **Compare Selected Files → CriticMarkup** |

The output upholds a strict reconstruction invariant: rejecting every marker reproduces file 1, accepting every marker reproduces file 2. No keybindings are bound to the compare commands by default.

### Compare settings

| Setting | Default | Description |
|---|---|---|
| `kaicrit.compare.granularity` | `word` | Diff unit: `character`, `word` (whitespace-preserving), or `line`. |
| `kaicrit.compare.combineSubstitutions` | `true` | Merge an adjacent deletion + addition into one `{~~old~>new~~}` substitution. |
| `kaicrit.compare.outputLanguage` | `auto` | Language mode for the result: `auto` (match file 2), `plaintext`, or `markdown`. |

## Markdown preview

Open any Markdown file containing CriticMarkup and launch the built-in preview (`Ctrl+Shift+V` / `Cmd+Shift+V`). CriticMarkup spans render inline — insertions, deletions, highlights, comments, and substitutions — and span bodies are re-parsed as Markdown, so nested formatting such as `{++ **bold** ++}` is preserved. Multi-line comments (`{>>line 1`<br>`line 2<<}`) render in full with their line breaks preserved. CriticMarkup inside inline code or fenced code blocks is left untouched. The preview styling lives in `media/critic.css`.

## Customization

All decoration colors are configurable via `workbench.colorCustomizations` in `settings.json`:

```json
"workbench.colorCustomizations": {
  "kaicrit.highlightBackground": "#ffe066",
  "kaicrit.deletionForeground": "#cc0000"
}
```

| Color ID | Default | Applied to |
|---|---|---|
| `kaicrit.deletionForeground` | `editorError.foreground` | Deletion text |
| `kaicrit.additionForeground` | `gitDecoration.addedResourceForeground` | Addition text |
| `kaicrit.substitutionOldForeground` | `editorError.foreground` | Substitution — removed part |
| `kaicrit.substitutionNewForeground` | `gitDecoration.addedResourceForeground` | Substitution — inserted part |
| `kaicrit.highlightBackground` | `#ffff00` | Highlight background |
| `kaicrit.highlightForeground` | `#333333` | Highlight text |
| `kaicrit.commentBackground` | `#e0e0e0` | Comment background |
| `kaicrit.commentForeground` | `#555555` | Comment text |

### Keybindings

All keybindings can be rebound via **File › Preferences › Keyboard Shortcuts** (search for `kaicrit`) or by editing `keybindings.json` directly. See the [keybindings reference](docs/keybindings.md#customize) for an example.

## About

Made by [0x2e6b6169](https://blog.0x2e6b6169.de). Source on [GitHub](https://github.com/kaijen/kaicrit).

## Installation

Download the latest `kaicrit-*.vsix` from the [Releases page](https://github.com/kaijen/kaicrit/releases), then install it:

```bash
code --install-extension kaicrit-*.vsix
```
