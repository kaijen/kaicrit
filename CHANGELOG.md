# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/kaijen/kaicrit/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/kaijen/kaicrit/releases/tag/v0.0.1
