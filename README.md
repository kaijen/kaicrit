# kaicrit — CriticMarkup for VS Code

A complete CriticMarkup workflow in one extension:

- **Edit** — insert, navigate, and accept or reject tracked changes directly in the editor.
- **Compare** — diff two files into a single CriticMarkup document.
- **Double-Pane** — view a CriticMarkup document as Original | New side by side, coloured but without the marker syntax.
- **Preview** — render CriticMarkup in VS Code's built-in Markdown preview.

## What is CriticMarkup?

[CriticMarkup](https://github.com/CriticMarkup/CriticMarkup-toolkit) is a plain-text markup standard for tracking changes and comments in documents. It uses simple bracket-based syntax that works in any text file — Markdown, prose, or code. The [full specification](https://github.com/CriticMarkup/CriticMarkup-toolkit/blob/master/README.md) is maintained in the CriticMarkup-toolkit repository.

## Markup Types

| Type | Syntax | Meaning |
|---|---|---|
| Deletion | `{--deleted text--}` | Text marked for removal |
| Addition | `{++added text++}` | Text marked for insertion |
| Substitution | `{~~old~>new~~}` | Replacement pair (the `~>` arrow is required) |
| Highlight | `{==highlighted text==}` | Text marked for attention |
| Comment | `{>>comment text<<}` | Inline annotation |

All five types are rendered with distinct visual decorations in the editor. Marker characters are dimmed to reduce visual noise.

## Features

- **Syntax highlighting** — each change type gets a distinct color; markers are visually de-emphasized
- **Configurable colors** — all decoration colors can be overridden via `workbench.colorCustomizations`
- **Overview ruler markers** — changes are mirrored as colored marks on the scrollbar, so you can see where they sit without scrolling
- **Status bar counts** — the active editor's open changes are summarized by type (`⊟ ⊞ ⇄ ☰ 💬`), each count tinted in its type's configured color; click the entry to jump to the first change
- **Changes sidebar** — a dedicated CriticMarkup view in the Activity Bar lists every change of the active document, grouped by type or flat in document order (toggle in the view title); click an entry to jump to it, resolve it inline, or accept/reject all from the view title. The Activity Bar icon carries a number badge with the active document's change count
- **Navigation** — jump between changes without scrolling
- **Accept / Reject** — resolve one change at the cursor or all changes at once
- **Inline actions** — clickable **Accept · Reject** so edits can be resolved with the mouse without learning the shortcuts; shown **on hover** by default, or as an always-on **CodeLens** row, or off (`kaicrit.edit.changeActions`)
- **Track Changes mode** — record your edits live as CriticMarkup instead of changing the text directly, like "track changes" in a word processor; toggled per document (`Alt+K Alt+T`)
- **Comment metadata** — comments may carry an optional author and date (`{>>@kai 2026-05-31: text<<}`), shown in editor hovers and the preview; the author is configurable and the whole convention can be turned off
- **Compare** — turn the differences between two files into a CriticMarkup document you can review change by change
- **Double-Pane view** — split the active CriticMarkup document into two side-by-side editors, **Original** (the reject result) and **New** (the accept result); the change content stays in the markup colours but the marker delimiters are gone (`Alt+K Alt+P`)
- **Markdown preview** — CriticMarkup renders inline in VS Code's built-in preview, no webview or build step
- **Per-language activation & per-file toggle** — editor features run only for the file types you choose (`kaicrit.enabledLanguages`, default Markdown + plain text), and a status-bar toggle turns kaicrit on or off for the current file on the fly

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

`Alt+A` / `Alt+R` are only active while the current document actually contains CriticMarkup changes, so they don't shadow those keys in ordinary files. When the cursor isn't inside a change, the command is a quiet no-op (a brief status-bar notice, no modal dialog).

### View

| Action | Keybinding |
|---|---|
| Open Double-Pane View (Original \| New) | `Alt+K Alt+P` |

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

## Inline actions

kaicrit offers clickable **Accept · Reject** actions for each change, resolving exactly that change with the same logic as the keyboard shortcuts. How they appear is controlled by `kaicrit.edit.changeActions`:

| Setting | Values | Default | Effect |
|---|---|---|---|
| `kaicrit.edit.changeActions` | `hover`, `codeLens`, `off` | `hover` | Where the Accept / Reject actions appear |

- **`hover`** (default) — the actions appear only in the **hover tooltip** over a change, keeping the text clean. The tooltip anchors to the change, so it is always clear which change you are resolving.
- **`codeLens`** — an always-on **CodeLens** row above each change. Each change shows its type symbol plus a short content preview (`☰ "impossible f…"`, click to jump to it) followed by ✓ / ✕ icons, so two changes on the same line stay distinguishable.
- **`off`** — no inline actions; use the keyboard shortcuts, status bar, or Changes sidebar.

## Changes sidebar (overview)

kaicrit adds a **CriticMarkup** view to the Activity Bar that lists every change in the active document. The Activity Bar icon shows a **number badge** with the active document's change count (like the Explorer's unsaved-files badge); it disappears when the document has no changes. The view tracks the active editor and updates live as you type or resolve changes. Two layouts, switched by the group/flat button in the view title (and persisted in `kaicrit.changes.grouping`):

- **Grouped by type** (default) — changes sit under per-type parents (Deletions, Additions, Substitutions, Highlights, Comments) with a per-group count, each group sorted by position and carrying a type icon tinted in the type's configured color.
- **Chronological** — every change listed flat in document order, each carrying its color-tinted type icon.

- **Click** a change to jump to it in the editor (it scrolls into view and selects the marker).
- **Inline Accept / Reject** buttons on each entry resolve exactly that change.
- **Accept All / Reject All** buttons in the view title resolve the whole document at once.

Each entry shows a short preview of the change (for substitutions, `old → new`) and its line number; comments with metadata also show the author and date. When the active document has no changes, the view shows a short empty-state hint.

| Setting | Values | Default | Effect |
|---|---|---|---|
| `kaicrit.changes.grouping` | `type`, `chronological` | `type` | Sidebar layout: group changes by type, or list them flat in document order with a per-type symbol. Also toggled by the group/flat button in the view title. |

## Comment metadata (author & date)

Comments may optionally start with an author and/or an ISO date, separated from the comment body by a colon:

```text
{>>@kai 2026-05-31: needs a source<<}
{>>@kai: looks good<<}
{>>2026-05-31: revisit later<<}
```

This is a backwards-compatible convention on top of CriticMarkup — a comment **without** this prefix (`{>>plain note<<}`, or even `{>>Note: see above<<}`) is treated exactly as before. When metadata is present, the author/date is shown distinctly in the editor hover and in the Markdown preview, and accept/reject still removes the whole comment.

Inserting a comment (`Alt+K Alt+C`) pre-fills `@author today: ` so the metadata is one keystroke away, and parks the cursor **inside** the marker (before `<<}`) ready to type the note — even when a selection was wrapped. The author comes from `kaicrit.edit.commentAuthor`; when that is empty, kaicrit falls back to the repository's `git config user.name`.

| Setting | Values | Default | Effect |
|---|---|---|---|
| `kaicrit.edit.commentMetadata` | `true`, `false` | `true` | Recognize the author/date convention (hover, preview, insert pre-fill). When `false`, comments are plain text. |
| `kaicrit.edit.commentAuthor` | string | `""` | Author pre-filled on insert. Empty falls back to `git config user.name`. |

## Track Changes (Annotate)

Turn on **Track Changes** to record your edits as CriticMarkup instead of writing them verbatim — like "track changes" in a word processor. While it is on, deleting wraps text in `{--…--}`, typing wraps it in `{++…++}`, and replacing a selection produces `{~~old~>new~~}`. Review and resolve the result with the usual accept/reject actions.

The mode is **per document**: toggle it with **Toggle Track Changes** (`Alt+K Alt+T`), the editor-title button, or the **`$(edit) Track Changes: On/Off`** status-bar item, which stays visible in every text editor and shows the current state — click it to switch recording on or off. New documents start from the `kaicrit.edit.trackChanges` setting.

Editing an existing marker behaves predictably: edits *inside* a marker's content are absorbed into it (no nested markup), while deleting any part of a marker's delimiter — e.g. backspacing the `{` of `{++a++}` — **rejects** that whole change instead of leaving broken markup. Pasting text that is *already* CriticMarkup into plain text (`{++a++}`) is kept verbatim rather than re-wrapped into `{++{++a++}++}`; pasting it *inside* an existing marker flattens it to its accept-form so it can't nest either. To accept a change, use the accept action.

Because VS Code applies edits before extensions are notified, each tracked keystroke produces two document edits (your edit plus the marker wrap), so **Undo is two-step**. See [docs/track-changes.md](docs/track-changes.md) for the full behaviour matrix and limitations.

Even with Track Changes **off**, one narrow nesting guard still applies: pasting CriticMarkup *into the content of an existing marker* flattens the pasted markers to plain text (e.g. `{++x++}` pasted inside `{++ab|c++}` yields `{++abxc++}`) so no nested, spec-invalid markup is created. Plain text and standalone pasted markup are left exactly as typed — normal mode never creates markup on its own. Turn this off with `kaicrit.edit.preventNestingOnPaste` when you want to paste literal CriticMarkup verbatim (e.g. while documenting the syntax).

| Setting | Values | Default | Effect |
|---|---|---|---|
| `kaicrit.edit.trackChanges` | `true`, `false` | `false` | Start newly opened documents with Track Changes recording on. |
| `kaicrit.edit.preventNestingOnPaste` | `true`, `false` | `true` | Even with Track Changes off, flatten CriticMarkup pasted *into* an existing marker so no nested markup forms. |

## Compare two files → CriticMarkup

Generate a CriticMarkup document that describes how a first file (the original) becomes a second file (the modified version). The result is a normal text document you can read, edit, and resolve with the accept/reject commands above.

| Action | How |
|---|---|
| Compare two arbitrary files | Command Palette → **Compare Two Files → CriticMarkup** |
| Compare the open file with another | Command Palette → **Compare Active File With… → CriticMarkup** |
| Compare the open file with its Git HEAD | Command Palette / editor right-click → **Compare Active File with Git HEAD → CriticMarkup** |
| Two-step compare from the Explorer | Right-click file 1 → **Select for CriticMarkup Compare**, then right-click file 2 → **Compare with Selected → CriticMarkup** |
| Compare two selected files | Select two files in the Explorer → right-click → **Compare Selected Files → CriticMarkup** |

The **Git HEAD** comparison diffs the active editor's current contents against the last committed version of that file (HEAD is file 1 / original, the buffer is file 2 / modified), so you can review your uncommitted edits as CriticMarkup.

The output upholds a strict reconstruction invariant: rejecting every marker reproduces file 1, accepting every marker reproduces file 2. (With `ignoreWhitespace` on, whitespace-only differences are not marked, so the reconstruction is exact up to whitespace.) No keybindings are bound to the compare commands by default.

When the two inputs are identical (no differences — also possible with `ignoreWhitespace` on, where only whitespace differs), kaicrit reports "no differences" and does **not** open a marker-free result document.

### Compare settings

| Setting | Default | Description |
|---|---|---|
| `kaicrit.compare.granularity` | `word` | Diff unit: `character`, `word` (whitespace-preserving), or `line`. |
| `kaicrit.compare.combineSubstitutions` | `true` | Merge an adjacent deletion + addition into one `{~~old~>new~~}` substitution. |
| `kaicrit.compare.ignoreWhitespace` | `false` | Ignore whitespace-only differences (similar to `git diff -w`); rejecting every marker still reproduces file 1. |
| `kaicrit.compare.outputLanguage` | `auto` | Language mode for the result: `auto` (match file 2), `plaintext`, or `markdown`. |
| `kaicrit.compare.maxDiffTokens` | `4000000` | Safety guard against pathological diffs: max token product (file 1 × file 2 tokens) before a compare falls back to `line` granularity or aborts with a warning. `0` disables it. |

## Double-Pane view (Original | New)

Read a CriticMarkup document as two parallel texts instead of one marked-up file. Run **CriticMarkup: Open Double-Pane View (Original | New)** from the Command Palette, the editor title bar (`$(split-horizontal)`), the editor right-click menu, or `Alt+K Alt+P`. kaicrit opens two side-by-side editors built from a snapshot of the active document (like Compare — no live mode):

- **Left — "Original"**: the state *before* the changes (the reject result). Deletions and the old side of substitutions stay visible in their markup colours; additions are gone.
- **Right — "New"**: the state *after* the changes (the accept result). Additions and the new side of substitutions stay visible in their markup colours; deletions are gone.

**Highlights** and **comments** appear on **both** sides; plain text between markers is copied verbatim to both. The marker delimiters themselves (`{--`, `++}`, `~>`, …) appear on **neither** side — you get coloured content with the same look as the editor decorations, just without the syntax.

| Type | Left (Original) | Right (New) |
|---|---|---|
| Deletion `{--T--}` | `T` (red, struck through) | — |
| Addition `{++T++}` | — | `T` (green, underlined) |
| Substitution `{~~O~>N~~}` | `O` (red) | `N` (green) |
| Highlight `{==T==}` | `T` (highlighted) | `T` (highlighted) |
| Comment `{>>T<<}` | `T` (comment style) | `T` (comment style) |

Known limits (v1, deliberate): there is **no line alignment** between the panes — deletions only push the left side, additions only the right, so the two texts run independently (each is a readable document on its own). The two panes open as editable untitled documents with generic tab titles, consistent with the Compare feature. See [docs/doublepane.md](docs/doublepane.md) for details.

## Markdown preview

Open any Markdown file containing CriticMarkup and launch the built-in preview (`Ctrl+Shift+V` / `Cmd+Shift+V`). CriticMarkup spans render inline — insertions, deletions, highlights, comments, and substitutions — and span bodies are re-parsed as Markdown, so nested formatting such as `{++ **bold** ++}` is preserved. Multi-line comments (`{>>line 1`<br>`line 2<<}`) render in full with their line breaks preserved. CriticMarkup inside inline code or fenced code blocks is left untouched. The preview styling lives in `media/critic.css`.

The renderer is a markdown-it *inline rule* that emits balanced tokens (not raw HTML), so it can't produce the malformed HTML that has historically dogged CriticMarkup-to-HTML rendering, and a Markdown span that overlaps a marker degrades to literal text rather than breaking the document. The trade-off: a marker that straddles block boundaries (an opening `{++` in one paragraph and its `++}` in another) is not rendered as an edit. See [docs/preview.md](docs/preview.md#why-this-rendering-approach-and-what-it-cant-do) for the rationale and the full limitation.

## Where kaicrit is active

By default kaicrit's editor features — decorations, the inline Accept · Reject actions, the status-bar counts, the Changes view, and accept/reject — run only in **Markdown** and **plain-text** files. Adjust the list with the `kaicrit.enabledLanguages` setting, which matches a document's [language id](https://code.visualstudio.com/docs/languages/identifiers):

```json
"kaicrit.enabledLanguages": ["markdown", "plaintext", "latex"]
```

Use `"*"` to enable kaicrit for every language.

For one-off exceptions there's a **`$(eye) CriticMarkup`** toggle in the status bar (right side, next to Track Changes): click it to turn kaicrit on for a file whose language isn't listed, or off for one that is. The override applies to that single file and lasts only for the session — reopening the file falls back to the language default. While a file is toggled off, kaicrit treats it as plain text: no decorations, no counts, and the accept/reject keybindings stay dormant until you turn it back on. The same toggle is available as the **Toggle CriticMarkup for This File** command.

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

The same colors also tint the per-type counts in the status bar and the type icons in the Changes sidebar (deletion/addition/substitution via their foreground, highlight/comment via their background), so a customization carries through every surface.

### Performance

| Setting | Default | Effect |
|---|---|---|
| `kaicrit.edit.decorationDebounce` | `150` | Milliseconds to wait after an edit before re-parsing the document to refresh decorations, the status bar, and the Changes view. Higher values coalesce bursts of typing into one parse (helpful in large documents that already contain markers); accept/reject still refresh immediately regardless of this value. `0` parses on the next tick. |
| `kaicrit.edit.maxParseLength` | `2000000` | Safety guard for the marker parser: the maximum document length (in characters) kaicrit will scan. Above it, decorations and the Changes view go inert for that document (with a status-bar hint) to avoid the marker regex's O(n²) worst case on pathological input (many unterminated `{--` openers). `0` disables the guard. |

### Keybindings

All keybindings can be rebound via **File › Preferences › Keyboard Shortcuts** (search for `kaicrit`) or by editing `keybindings.json` directly. See the [keybindings reference](docs/keybindings.md#customize) for an example.

## Development

```bash
npm install        # first time only
npm run compile    # one-shot TypeScript compile → out/
npm run watch      # incremental watch (run before F5)
npm test           # compile + run the unit-test suites
```

`npm test` runs the Node `--test` suites (parser, navigation, accept/reject
semantics, Markdown preview, compare, and the Track Changes engine) without an
Extension Host. Press **F5** in VS Code to launch the Extension Development Host.

For a deep dive into the architecture, a file-by-file walkthrough, the build
pipeline, and the publishing/deployment options, see [DEVELOPER.md](DEVELOPER.md).

## About

Made by [0x2e6b6169](https://blog.0x2e6b6169.de). Source on [GitHub](https://github.com/kaijen/kaicrit).

## License

Released under the [MIT License](LICENSE).

## Installation

Download the latest `kaicrit-*.vsix` from the [Releases page](https://github.com/kaijen/kaicrit/releases), then install it:

```bash
code --install-extension kaicrit-*.vsix
```
