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

## Releasing

1. Bump `"version"` in [package.json](package.json) to the new version (e.g. `0.2.0`)
2. Update [CHANGELOG.md](CHANGELOG.md)
3. Commit: `chore(changelog): Prepare release vX.Y.Z`
4. Push a matching tag: `git tag vX.Y.Z && git push origin vX.Y.Z`

The CI workflow builds the `.vsix` with `vsce package --version <tag>`, so the published package always reflects the git tag. The `package.json` version is the canonical source for local development (shown when pressing F5).

## Documentation

After every code change, update all affected documentation artifacts before closing the task:

- **README.md** — for any user-facing feature, behavior, or configuration change
- **docs/** — mirror README changes; add detail where the README only summarizes
- **CLAUDE.md** — update architecture notes, color/command lists, and the checklist below whenever the internal structure changes

## Architecture

The extension bundles three CriticMarkup features — **edit**, **compare**, and **preview** — around one shared marker vocabulary. Source is grouped by feature under [src/](src/):

### `src/core/` — shared vocabulary

| File | Role |
|---|---|
| [core/types.ts](src/core/types.ts) | `ChangeType` const enum + `CriticChange` interface |
| [core/markers.ts](src/core/markers.ts) | `MARKERS` delimiter table + `RE_ALL` regex — the single source of truth for marker syntax, consumed by the edit parser and the compare renderer |

### `src/edit/` — editor decorations, navigation, accept/reject

| File | Role |
|---|---|
| [edit/parser.ts](src/edit/parser.ts) | `parseCriticMarkup(doc)` — single-pass `RE_ALL` scan, returns `CriticChange[]` |
| [edit/decorator.ts](src/edit/decorator.ts) | `DecoratorManager` — decoration types (using `kaicrit.*` ThemeColor IDs from `contributes.colors`), debounced apply/clear per editor |
| [edit/navigator.ts](src/edit/navigator.ts) | Pure functions over `CriticChange[]`: findAtCursor, findNext, findPrev, findFirst, findLast |
| [edit/commands.ts](src/edit/commands.ts) | `registerEditCommands()` — 13 insert/navigate/accept/reject commands |

### `src/compare/` — diff two files into CriticMarkup

| File | Role |
|---|---|
| [compare/diff.ts](src/compare/diff.ts) | Myers diff over tokenized text → `DiffOp[]`; whitespace-preserving tokenizer |
| [compare/criticmarkup.ts](src/compare/criticmarkup.ts) | `render(ops)` — emits markers using `MARKERS` from core |
| [compare/compare.ts](src/compare/compare.ts) | Orchestration: read two files, diff, open result; reads `kaicrit.compare.*` settings |
| [compare/commands.ts](src/compare/commands.ts) | `registerCompareCommands()` — 5 compare commands |
| `compare/*.test.ts` | Node `--test` suites for diff + render (run via `npm test`) |

### `src/preview/` — built-in Markdown preview

| File | Role |
|---|---|
| [preview/markdownIt.ts](src/preview/markdownIt.ts) | `criticMarkupPlugin(md)` — markdown-it inline rule; its own tokenizer (different engine), styled by [media/critic.css](media/critic.css) |

### Entry point

[extension.ts](src/extension.ts) — `activate()` wires the edit listeners + commands, registers the compare commands, and **returns** `{ extendMarkdownIt }` so the built-in preview picks up the plugin.

## CriticMarkup Types

The edit parser uses the single `RE_ALL` regex from [core/markers.ts](src/core/markers.ts) with six capture groups (one per type, two for substitution). `document.positionAt()` converts string offsets to VSCode positions — no manual line/column arithmetic. The preview ([preview/markdownIt.ts](src/preview/markdownIt.ts)) keeps a separate inline tokenizer because it integrates with markdown-it's own parser, but shares the delimiter literals via `MARKERS`.

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

1. Add to `ChangeType` in [core/types.ts](src/core/types.ts)
2. Add the delimiters to `MARKERS` and a capture group to `RE_ALL` in [core/markers.ts](src/core/markers.ts), plus a branch in the parse loop in [edit/parser.ts](src/edit/parser.ts)
3. Add a `TextEditorDecorationType` and handle it in `applyDecorations()` in [edit/decorator.ts](src/edit/decorator.ts)
4. Add insert command and accept/reject case in [edit/commands.ts](src/edit/commands.ts)
5. Render the new type in [preview/markdownIt.ts](src/preview/markdownIt.ts) (+ a `.critic-*` class in [media/critic.css](media/critic.css)) if it should appear in the preview
6. Add command entry to `contributes.commands` in [package.json](package.json)
7. Add one or more `contributes.colors` entries in [package.json](package.json) for the new decoration color(s)
8. Update README.md, docs/markup.md, and CLAUDE.md
