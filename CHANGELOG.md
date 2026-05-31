# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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
- Multi-line comments (`{>>line 1\nline 2<<}`) now render in full in the
  Markdown preview, with their line breaks preserved.

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

[Unreleased]: https://github.com/kaijen/kaicrit/compare/v0.2.0...HEAD
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
