# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/kaijen/kaicrit/compare/v0.0.7...HEAD
[0.0.7]: https://github.com/kaijen/kaicrit/compare/v0.0.6...v0.0.7
[0.0.6]: https://github.com/kaijen/kaicrit/compare/v0.0.5...v0.0.6
[0.0.5]: https://github.com/kaijen/kaicrit/compare/v0.0.4...v0.0.5
[0.0.4]: https://github.com/kaijen/kaicrit/compare/v0.0.3...v0.0.4
[0.0.3]: https://github.com/kaijen/kaicrit/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/kaijen/kaicrit/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/kaijen/kaicrit/releases/tag/v0.0.1
