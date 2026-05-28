# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

```bash
npm install          # first time only
npm run compile      # one-shot TypeScript compile → out/
npm run watch        # incremental watch (run before F5)
```

Press **F5** in VSCode to launch the Extension Development Host. Use **Developer: Reload Window** in the host to pick up changes without restarting the debugger.

Package for local install:
```bash
npx vsce package
code --install-extension kaicrit-*.vsix
```

## Architecture

Six source files in [src/](src/), one responsibility each:

| File | Role |
|---|---|
| [types.ts](src/types.ts) | `ChangeType` const enum + `CriticChange` interface |
| [parser.ts](src/parser.ts) | `parseCriticMarkup(doc)` — single-pass regex, returns `CriticChange[]` |
| [decorator.ts](src/decorator.ts) | `DecoratorManager` — creates decoration types, debounced apply/clear per editor |
| [navigator.ts](src/navigator.ts) | Pure functions over `CriticChange[]`: findAtCursor, findNext, findPrev, findFirst, findLast |
| [commands.ts](src/commands.ts) | Registers all 13 commands; calls navigator + accept/reject helpers |
| [extension.ts](src/extension.ts) | `activate()` / `deactivate()`; wires document listeners + commands |

## CriticMarkup Types

The parser uses a single `RE_ALL` regex in [parser.ts](src/parser.ts) with six capture groups (one per type, two for substitution). `document.positionAt()` converts string offsets to VSCode positions — no manual line/column arithmetic.

Each `CriticChange` carries:
- `fullRange` — the entire `{--...--}` span, used for all edits
- `contentRange` — content inside markers (non-substitution types)
- `oldRange` / `newRange` — substitution sub-ranges for separate decoration

Marker characters (`{--`, `--}`, etc.) get a separate dimming decoration (opacity 0.4) via `markerType` in `DecoratorManager`.

## Accept/Reject Semantics

Every resolution replaces `fullRange` with a computed string via one `WorkspaceEdit`:

| Type | Accept | Reject |
|---|---|---|
| Deletion `{--T--}` | `""` | `T` |
| Addition `{++T++}` | `T` | `""` |
| Substitution `{~~O~>N~~}` | `N` | `O` |
| Highlight `{==T==}` | `T` | `T` |
| Comment `{>>T<<}` | `""` | `""` |

`acceptAll` / `rejectAll` collect all replacements into a single `WorkspaceEdit` and apply atomically — no offset-drift issues.

## Adding a New Markup Type

1. Add to `ChangeType` in [types.ts](src/types.ts)
2. Add a capture group to `RE_ALL` and a branch in the parse loop in [parser.ts](src/parser.ts)
3. Add a `TextEditorDecorationType` and handle it in `applyDecorations()` in [decorator.ts](src/decorator.ts)
4. Add insert command and accept/reject case in [commands.ts](src/commands.ts)
5. Add command entry to `contributes.commands` in [package.json](package.json)
