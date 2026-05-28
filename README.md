# kaicrit — CriticMarkup for VS Code

CriticMarkup editing support: insert, navigate, and accept or reject tracked changes directly in VS Code.

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
- **Navigation** — jump between changes without scrolling
- **Accept / Reject** — resolve one change at the cursor or all changes at once

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

## About

Made by [0x2e6b6169](https://blog.0x2e6b6169.de). Source on [GitHub](https://github.com/kaijen/kaicrit).

## Installation

Download the latest `kaicrit-*.vsix` from the [Releases page](https://github.com/kaijen/kaicrit/releases), then install it:

```bash
code --install-extension kaicrit-*.vsix
```
