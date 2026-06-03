# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.9.0] - 2026-06-03

### Added
- **Chronological layout for the Changes sidebar.** The Changes view can now list
  every change flat in document order instead of grouped by type. A group/flat
  toggle in the view title (`$(list-tree)` / `$(list-flat)`) switches between the
  two layouts; in the chronological layout each leaf is prefixed with its per-type
  symbol (`⊟ ⊞ ⇄ ☰ 💬`) so the type stays visible without group headers. The choice
  is persisted in the new `kaicrit.changes.grouping` setting (`type` — the default
  — or `chronological`).

## [0.8.0] - 2026-06-03

### Added
- **Double-Pane view (Original | New)** (#46). A new command,
  *CriticMarkup: Open Double-Pane View (Original | New)* (`Alt+K Alt+P`, editor
  title-bar `$(split-horizontal)` icon, editor right-click), splits the active
  CriticMarkup document into two side-by-side editors: **Original** (the reject
  result — deletions and substitution-old kept) on the left and **New** (the
  accept result — additions and substitution-new kept) on the right. Highlights
  and comments show on both sides, plain text is copied to both, and the marker
  delimiters appear on neither — the content keeps the markup colours without the
  syntax. Snapshot on command (no live mode), like Compare. The six content
  decoration types are now produced by a shared `createContentDecorationTypes()`
  factory so the editor and the panes use identical styles from separate instance
  sets.

## [0.7.5] - 2026-06-02

### Fixed
- **Wrapping a selection in a highlight/comment while Track Changes is on no
  longer prepends a spurious deletion** (#44). Using an insert command (e.g.
  *Highlight*, *Comment*) on selected text reached the recorder as a replace whose
  new side already contained a marker, so it tracked the original text as a leading
  `{--…--}` deletion (`foo` → `{--foo--}{==foo==}`). The insert/wrap commands now
  apply their edit through the recorder's per-document re-entrancy guard, so the
  authored markup lands verbatim (`{==foo==}`) — matching the accept/reject fix
  from #42. Affects all insert commands (deletion, addition, highlight, comment,
  substitution).

## [0.7.4] - 2026-06-02

### Fixed
- **Hover Accept/Reject popup now closes after resolving a change** (#42).
  Clicking the hover's `Accept`/`Reject` action resolved the change but left the
  hover widget open over the now-removed marker — VS Code deliberately keeps a
  hover up when a `command:` link is clicked. The resolution now explicitly
  dismisses the hover (`editor.action.hideHover`). The previous 0.7.3 fix only
  addressed the separate Track-Changes-undoes-itself case, not this UI symptom.

## [0.7.3] - 2026-06-02

### Fixed
- **Accept/Reject while Track Changes is on no longer undoes itself** (#42).
  Resolving a change (via the hover actions, CodeLens, the sidebar, or the
  `Alt+A`/`Alt+R` keybindings) applies a `WorkspaceEdit` that removes the marker's
  delimiters. With Track Changes recording, that edit was re-interpreted as the
  #38 "delimiter removed → reject this marker" gesture, so the resolution was
  silently reverted — e.g. accepting a deletion re-inserted the text and the
  change stayed visible. Resolutions now run through the recorder's per-document
  re-entrancy guard, so they are never re-processed.

## [0.7.2] - 2026-06-02

### Added
- **Nesting guard on paste even with Track Changes off.** Pasting CriticMarkup
  *into the content of an existing marker* now flattens the pasted markers to
  plain text (e.g. `{++x++}` pasted inside `{++ab|c++}` yields `{++abxc++}`)
  instead of leaving nested, spec-invalid markup. This reuses the same #34
  accept-form flatten as Track Changes mode. Plain text and standalone pasted
  markup are left exactly as typed — normal mode never creates markup on its own.
  New setting `kaicrit.edit.preventNestingOnPaste` (default `true`) turns the
  guard off so literal CriticMarkup can be pasted verbatim.

## [0.7.1] - 2026-06-02

### Fixed
- **Track Changes: pasting CriticMarkup *inside* an existing marker no longer
  nests.** The #34 absorb path kept inserted text verbatim, so pasting `{++any++}`
  into an addition produced `{++an{++any++}y++}` — the inside-a-marker counterpart
  the #40 plain-text fix did not cover. Absorbed markers are now flattened to
  their accept-form first (addition/highlight keep their text, deletion/comment
  contribute nothing, substitution keeps its new side), so the enclosing marker
  just grows by the resulting plain text (`{++ananyy++}`) instead of nesting.
  Plain typing inside a marker is unaffected.

## [0.7.0] - 2026-06-01

### Changed
- **Track Changes: editing a marker's delimiter now rejects that change** (#38).
  Deleting or replacing any part of a marker's opener/closer — e.g. backspacing
  the leading `{` of `{++a++}` — resolves the whole marker with Reject semantics
  (addition → removed, deletion → text kept, substitution → original, etc.)
  instead of leaving broken or nested markup like `{--{--}++a++}`. Edits *inside*
  a marker's content are still absorbed (#34); a selection spanning content and a
  delimiter rejects the entire marker.
- **Track Changes: pasting text that is already CriticMarkup is kept verbatim**
  (#40). Inserting complete marker(s) no longer re-wraps them into nested markup
  (`{++a++}` stays `{++a++}`, not `{++{++a++}++}`). A paste that mixes plain text
  with markers wraps only the plain runs as additions
  (`foo {++a++} bar` → `{++foo ++}{++a++}{++ bar++}`), and pasting markup over a
  selection tracks the replaced text as a leading `{--…--}` deletion.
  Unterminated input (e.g. `{++a`) still falls through to a normal addition wrap.

## [0.6.1] - 2026-06-01

### Fixed
- **Inserting a markup with multiple cursors now parks each caret inside its
  marker** (#37), matching single-cursor behaviour. Previously every caret
  landed after the closing delimiter instead of inside — before `<<}` for a
  comment, before `~~}` for a substitution, or inside the empty pair for an
  addition/deletion/highlight.

## [0.6.0] - 2026-06-01

### Fixed
- **Inserting a comment now parks the cursor inside the marker** (#35), before
  `<<}`, ready to type the note — even when a selection was wrapped. It no
  longer lands after the closing delimiter.
- **The Changes sidebar now uses the same per-type symbols as the status bar**
  (#36): each group is labelled `⊟ Deletions (3)`, `⊞ Additions (2)`, etc.,
  replacing the previous mismatched codicons.
- **Track Changes no longer nests CriticMarkup inside CriticMarkup** (#34).
  Continuing to type after a substitution — e.g. selecting `stick`, typing
  `Just` — produced corrupt nested markers like
  `{~~stick~>J{++u{++s{++t++}++}++}~~}`. Edits that land inside an existing
  marker's content are now absorbed into that marker (the substitution's new
  side or an addition just grows), so the result is a clean
  `{~~stick~>Just~~}`.

### Changed
- **Inline Accept / Reject actions are now on hover by default.** The boolean
  `kaicrit.edit.codeLens` is replaced by the enum `kaicrit.edit.changeActions`
  (`hover` | `codeLens` | `off`, default `hover`). In `hover` mode the actions
  appear only in the tooltip over a change, keeping the text clean; `codeLens`
  restores the always-on row; `off` hides them entirely.
- The `codeLens` row is now compact and clearly associated with its change: a
  leading info lens shows the change's type symbol plus a short content preview
  (`☰ "impossible f…"`, click to jump to it) followed by ✓ / ✕ icons, so two
  changes on the same line no longer produce ambiguous side-by-side action pairs.
- **The Track Changes status-bar item is now an always-visible two-way toggle.**
  It stays visible in every text editor and shows the current state
  (`$(edit) Track Changes: On/Off`); a click switches recording on **or** off.
  Previously it only appeared while recording and could only turn the mode off.

## [0.5.0] - 2026-06-01

### Added
- **Per-language activation & per-file toggle** — kaicrit's editor features
  (decorations, inline CodeLens, status-bar counts, the Changes view, and
  accept/reject) now run only for the file types you choose. The new
  `kaicrit.enabledLanguages` setting takes a list of language ids and defaults
  to `["markdown", "plaintext"]`; use `"*"` to enable every language. A new
  **`$(eye) CriticMarkup`** status-bar toggle (and the **Toggle CriticMarkup for
  This File** command) overrides the language default for a single file for the
  session — turn kaicrit on for a non-listed file or off for a listed one.
  While a file is off, kaicrit treats it as plain text (no decorations, counts,
  or active accept/reject keybindings).
- **Track Changes (Annotate) mode** — a per-document recorder that captures
  your edits as CriticMarkup instead of changing the text directly: deletions
  become `{--…--}`, insertions `{++…++}`, and selection replacements
  `{~~old~>new~~}`. Toggle it with the new **Toggle Track Changes** command
  (`Alt+K Alt+T`), the editor-title button, or the `kaicrit.edit.trackChanges`
  setting (default `false`); a status-bar item shows while recording. Continued
  typing grows an addition, backspace streaks merge into one deletion, and the
  pure rewrite engine is unit-tested. Undo is two-step by design — see
  `docs/track-changes.md`.
- **Compare with Git HEAD** — a new **Compare Active File with Git HEAD →
  CriticMarkup** command (Command Palette and editor right-click) diffs the
  active editor's contents against the last committed version of the file,
  reading HEAD through the built-in Git extension, so uncommitted edits can be
  reviewed as CriticMarkup.
- **Ignore whitespace in compare** — a new `kaicrit.compare.ignoreWhitespace`
  setting (default `false`) makes the diff treat tokens that differ only in
  whitespace as equal (similar to `git diff -w`); whitespace-only differences
  are no longer marked while rejecting every marker still reproduces file 1.
- **Changes sidebar** — a dedicated **CriticMarkup** view in the Activity Bar
  lists every change of the active document grouped by type with per-group
  counts. Click an entry to jump to the change, resolve it with inline
  Accept / Reject buttons, or Accept-All / Reject-All from the view title. The
  view tracks the active editor and updates live, reusing the existing
  parsed-change cache.
- **Comment metadata** — comments may carry an optional author and date
  (`{>>@kai 2026-05-31: text<<}`). When present, the author/date shows in the
  editor hover and as a distinct label in the Markdown preview; inserting a
  comment pre-fills `@author today:`. The author is configurable via the new
  `kaicrit.edit.commentAuthor` setting (falling back to `git config user.name`),
  and the whole convention can be turned off with `kaicrit.edit.commentMetadata`
  (default `true`). Comments without the prefix are unchanged.
- **Inline CodeLens** — clickable **Accept | Reject** actions appear above every
  CriticMarkup change, so edits can be resolved with the mouse without learning
  the shortcuts. Toggle with the new `kaicrit.edit.codeLens` setting (default
  `true`).
- **Status bar** — a status bar entry summarizes the active editor's open
  changes by type (`⊟ ⊞ ⇄ ☰ 💬`), updating live and hidden when there are no
  changes; clicking it jumps to the first change.
- **Overview ruler markers** — changes are mirrored as colored marks on the
  scrollbar, reusing the existing per-type `kaicrit.*` colors.

### Fixed
- Resolving the comment author from `git config user.name` now runs
  asynchronously (and is cached per workspace folder), so inserting a comment no
  longer risks freezing the editor while git is slow or hanging.
- Arrow-less substitutions (`{~~text~~}` without `~>`) are now treated
  consistently: the Markdown preview no longer renders them as a deletion.
  Both the editor parser and the preview now ignore them, matching the
  CriticMarkup spec where `~>` is required for a substitution.
- Multi-line comments (`{>>line 1\nline 2<<}`) now render in full in the
  Markdown preview, with their line breaks preserved.
- Accepting or rejecting a change now re-parses the document only once instead
  of twice: the explicit refresh cancels the debounced update the edit's change
  event would otherwise also trigger. No visible behavior change.

### Internal
- Unit tests for the edit parser, navigation helpers, accept/reject semantics,
  and additional Markdown-preview cases. The accept/reject mapping moved into a
  VS Code-free `edit/resolve.ts` helper, and parser/navigator tests run outside
  the Extension Host via a small `require('vscode')` stub (`edit/vscodeStub.ts`).
  `npm test` runs them all.

## [0.2.0] - 2026-05-30

### Added
- **Compare** — diff two files into a single CriticMarkup document, via the
  Command Palette or the Explorer context menu. Configurable through
  `kaicrit.compare.granularity`, `kaicrit.compare.combineSubstitutions`, and
  `kaicrit.compare.outputLanguage`. (merged from the former kaicritcompare extension)
- **Markdown preview** — CriticMarkup now renders inline in VS Code's built-in
  Markdown preview, with no webview or build step. (merged from the former
  kaicritview extension)

### Changed
- Source is reorganized by feature into `src/core`, `src/edit`, `src/compare`,
  and `src/preview`, sharing one marker vocabulary in `core/markers.ts`.

## [0.1.3] - 2026-05-29

### Changed
- How to override keybindings via VS Code keyboard shortcuts UI and
  `keybindings.json` documented in docs and README (#4)

## [0.1.2] - 2026-05-28

### Fixed
- Release pipeline now produces a `.vsix` artifact; vsce version
  was passed as `--version` flag (prints tool version) instead of
  as a positional argument

## [0.1.1] - 2026-05-28

### Fixed
- Wrap notification auto-dismisses after 3 seconds instead of
  requiring manual close (#1)
- Comment decoration now has a light gray background (#e0e0e0) and
  dark gray text (#555555) by default (#2)

### Changed
- Extension version at build time always matches the git tag;
  `package.json` is the canonical source for local development (#3)

## [0.1.0] - 2026-05-28

### Added
- All five change-type colors configurable via
  `workbench.colorCustomizations` (#2)
- Highlight defaults to yellow background with dark gray text (#2)

## [0.0.8] - 2026-05-28

### Added
- Next/Previous navigation wraps around at document boundaries with
  a brief notification (#1)

## [0.0.7] - 2026-05-28

### Changed
- Extension now listed under the Formatters marketplace category
- Logo image removed from README

## [0.0.6] - 2026-05-28

### Changed
- README and docs landing page now credit 0x2e6b6169 as the
  author/publisher and link back to the blog
- package.json sets `publisher: 0x2e6b6169` for the VS Code
  Marketplace listing

### Fixed
- Docs site now applies the `{ width=200 }` attribute on the logo
  image (mkdocs `attr_list` extension enabled)

## [0.0.5] - 2026-05-28

### Changed
- README and docs landing page now display the kaicrit logo
- Extension manifest references the icon and repository URL,
  preparing it for a VS Code Marketplace listing

## [0.0.4] - 2026-05-28

### Changed
- README and docs now link to the CriticMarkup-toolkit GitHub
  repository instead of criticmarkup.com for spec references

## [0.0.3] - 2026-05-28

### Changed
- Documentation now hosted as a MkDocs Material site, deployed to
  GitHub Pages on every version tag with mike for per-version URLs

## [0.0.2] - 2026-05-28

### Changed
- Install instructions now point at the prebuilt vsix attached to the
  GitHub release instead of a local `vsce package` build

## [0.0.1] - 2026-05-28

### Added
- Parser for all five CriticMarkup types: deletion, addition, substitution, highlight, comment
- Per-type visual decorations with dimmed marker characters
- Navigation commands: next, previous, first, last change
- Accept / Reject single change at cursor
- Accept All / Reject All in one atomic edit
- Insert commands for all five markup types, with selection-wrap support
- Keybindings under `Alt+K` leader and `Alt+A` / `Alt+R` for resolve-at-cursor
- Commands available via Command Palette under the CriticMarkup category

[Unreleased]: https://github.com/kaijen/kaicrit/compare/v0.9.0...HEAD
[0.9.0]: https://github.com/kaijen/kaicrit/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/kaijen/kaicrit/compare/v0.7.5...v0.8.0
[0.7.5]: https://github.com/kaijen/kaicrit/compare/v0.7.4...v0.7.5
[0.7.4]: https://github.com/kaijen/kaicrit/compare/v0.7.3...v0.7.4
[0.7.3]: https://github.com/kaijen/kaicrit/compare/v0.7.2...v0.7.3
[0.7.2]: https://github.com/kaijen/kaicrit/compare/v0.7.1...v0.7.2
[0.7.1]: https://github.com/kaijen/kaicrit/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/kaijen/kaicrit/compare/v0.6.2...v0.7.0
[0.6.2]: https://github.com/kaijen/kaicrit/compare/v0.6.1...v0.6.2
[0.6.1]: https://github.com/kaijen/kaicrit/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/kaijen/kaicrit/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/kaijen/kaicrit/compare/v0.2.0...v0.5.0
[0.2.0]: https://github.com/kaijen/kaicrit/compare/v0.1.3...v0.2.0
[0.1.3]: https://github.com/kaijen/kaicrit/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/kaijen/kaicrit/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/kaijen/kaicrit/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/kaijen/kaicrit/compare/v0.0.8...v0.1.0
[0.0.8]: https://github.com/kaijen/kaicrit/compare/v0.0.7...v0.0.8
[0.0.7]: https://github.com/kaijen/kaicrit/compare/v0.0.6...v0.0.7
[0.0.6]: https://github.com/kaijen/kaicrit/compare/v0.0.5...v0.0.6
[0.0.5]: https://github.com/kaijen/kaicrit/compare/v0.0.4...v0.0.5
[0.0.4]: https://github.com/kaijen/kaicrit/compare/v0.0.3...v0.0.4
[0.0.3]: https://github.com/kaijen/kaicrit/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/kaijen/kaicrit/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/kaijen/kaicrit/releases/tag/v0.0.1
