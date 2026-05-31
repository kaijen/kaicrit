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
| [core/markers.ts](src/core/markers.ts) | `MARKERS` delimiter table + `RE_ALL` regex — the single source of truth for marker syntax, consumed by the edit parser and the compare renderer. The `findMarkers(text)` helper iterates markers via `text.matchAll(RE_ALL)`, which runs against an internal clone of the regex — so the shared global `RE_ALL` is never mutated and there is no `lastIndex` state shared between callers. Callers iterate with `for…of findMarkers(text)` instead of `RE_ALL.exec` |
| [core/comment.ts](src/core/comment.ts) | `parseCommentMeta(content)` — pure splitter for the optional `@author YYYY-MM-DD:` comment prefix, shared by the edit parser and the preview tokenizer (`core/comment.test.ts` covers it) |

### `src/edit/` — editor decorations, navigation, accept/reject

| File | Role |
|---|---|
| [edit/parser.ts](src/edit/parser.ts) | `parseCriticMarkup(doc)` — single-pass scan via `findMarkers`, returns `CriticChange[]`; a cheap `text.indexOf('{') === -1` pre-check returns early (skipping the regex scan + config read) so marker-free documents cost nothing on the debounced update path; extracts comment `author`/`date` via `parseCommentMeta` when `kaicrit.edit.commentMetadata` is on |
| [edit/decorator.ts](src/edit/decorator.ts) | `DecoratorManager` — decoration types (using `kaicrit.*` ThemeColor IDs from `contributes.colors`), debounced apply/clear per editor, overview-ruler markers, comment author/date hover (`commentHover`), an `onDidUpdate` event fired after each cache refresh, and `syncContext(editor)` which mirrors the active editor's change count into the `kaicrit.hasChanges` context key (gates the `Alt+A`/`Alt+R` keybinding `when` clauses) |
| [edit/statusBar.ts](src/edit/statusBar.ts) | `StatusBarManager` — per-type change counts for the active editor (`⊟ ⊞ ⇄ ☰ 💬`), read from the decorator cache via `onDidUpdate`; hidden when there are no changes, click runs `kaicrit.firstChange`. Also exports the shared `ORDER`/`LABELS`/`SYMBOLS` tables and `countByType` helper, reused by the changes Tree View |
| [edit/changesView.ts](src/edit/changesView.ts) | `ChangesTreeProvider` (`TreeDataProvider`) — sidebar view (`kaicrit.changes` in the `kaicrit` Activity-Bar container) listing the active document's changes grouped by type; reads the decorator cache, refreshes on `onDidUpdate` + active-editor switch. Leaves carry the change start position and a `kaicrit.revealChangeAt` click command; inline `kaicrit.acceptChangeNode`/`rejectChangeNode` buttons + `view/title` Accept-All/Reject-All |
| [edit/navigator.ts](src/edit/navigator.ts) | Pure functions over `CriticChange[]`: findAtCursor, findNext, findPrev, findFirst, findLast |
| [edit/codeLens.ts](src/edit/codeLens.ts) | `CriticCodeLensProvider` — inline `Accept`/`Reject` lenses above each change; reads the decorator cache, refreshes on `onDidUpdate`, honors `kaicrit.edit.codeLens` |
| [edit/commands.ts](src/edit/commands.ts) | `registerEditCommands()` — insert/navigate/accept/reject commands (incl. position-targeted `acceptChangeAt`/`rejectChangeAt` used by CodeLens, plus `revealChangeAt` and node-targeted `acceptChangeNode`/`rejectChangeNode` used by the Tree View); `insertComment` pre-fills `@author today:` from `kaicrit.edit.commentAuthor` (falling back to an async, per-workspace-folder-cached `git config user.name` via `execFile`/`promisify`, so the lookup never blocks the extension host) when metadata is enabled; `toggleTrackChanges` flips the recorder for the active document |
| [edit/trackChangesEngine.ts](src/edit/trackChangesEngine.ts) | `computeTrackChanges(preText, rawEdits)` — pure, VS Code-free core of the Track Changes mode: classifies each raw edit (insert→`{++…++}`, delete→`{--…--}`, replace→`{~~…~>…~~}`) against surrounding markers and returns compensating replacements (post-raw-edit coords) + final caret offsets. Builds marker strings from `MARKERS`; single-edit adjacency-merges deletions, skips edits already inside an addition. Tested by `trackChangesEngine.test.ts` |
| [edit/trackChanges.ts](src/edit/trackChanges.ts) | `TrackChangesManager` — thin VS Code wrapper around the engine. Per-document state (`enabled` set + `shadow` text snapshots, since the change event omits deleted text), a re-entrancy guard so its own compensating `WorkspaceEdit` isn't re-processed, undo/redo left untouched, plus the `$(edit) Track Changes` status-bar item and `kaicrit.trackChanges` context key. `applyDefault` honours the `kaicrit.edit.trackChanges` setting for freshly opened docs |

### `src/compare/` — diff two files into CriticMarkup

| File | Role |
|---|---|
| [compare/diff.ts](src/compare/diff.ts) | Myers diff over tokenized text → `DiffOp[]`; whitespace-preserving tokenizer. Optional `ignoreWhitespace`: matches tokens with whitespace stripped (`git diff -w` style) + a `suppressWhitespaceOps` pass that drops residual whitespace-only markers, while `myers` always emits file-1 tokens on equal so reject→file-1 holds |
| [compare/criticmarkup.ts](src/compare/criticmarkup.ts) | `render(ops)` — emits markers using `MARKERS` from core |
| [compare/compare.ts](src/compare/compare.ts) | Orchestration: reads `kaicrit.compare.*` settings; `compareTextToCriticMarkup(originalText, modifiedText, autoLanguageId)` is the shared core, `compareToCriticMarkup(uri, uri)` opens both files and delegates |
| [compare/commands.ts](src/compare/commands.ts) | `registerCompareCommands()` — 6 compare commands; `compareWithGitHead` reads the active file's HEAD via the built-in `vscode.git` extension API (`getRepository(uri).show('HEAD', path)`) and diffs it against the live buffer |
| `compare/*.test.ts` | Node `--test` suites for diff + render (run via `npm test`) |

### `src/preview/` — built-in Markdown preview

| File | Role |
|---|---|
| [preview/markdownIt.ts](src/preview/markdownIt.ts) | `criticMarkupPlugin(md, { commentMetadata })` — markdown-it inline rule; its own tokenizer (different engine), styled by [media/critic.css](media/critic.css). Splits the comment author/date prefix into a `.critic-comment-meta` span via `parseCommentMeta` when `commentMetadata` is on. Substitution requires the `~>` arrow: an arrow-less `{~~…~~}` makes the rule return `false` so it falls back to markdown-it's normal text rules — matching the edit parser's `RE_ALL`, which ignores it too (per the CriticMarkup spec, arrow-less `{~~…~~}` is neither a substitution nor a deletion). Covered by `markdownIt.test.ts`, which drives the inline rule with a VS Code-free fake markdown-it `state` |

### Entry point

[extension.ts](src/extension.ts) — `activate()` wires the edit listeners + commands, registers the CodeLens provider (`languages.registerCodeLensProvider` for `file`/`untitled` schemes), creates the changes Tree View (`window.createTreeView('kaicrit.changes', …)`), instantiates the `TrackChangesManager` (its `handleChange` runs first in the shared `onDidChangeTextDocument` listener, before `dm.scheduleUpdate`), registers the compare commands, and **returns** `{ extendMarkdownIt }` (passing the current `kaicrit.edit.commentMetadata` value into `criticMarkupPlugin`) so the built-in preview picks up the plugin.

## CriticMarkup Types

The edit parser uses the single `RE_ALL` regex from [core/markers.ts](src/core/markers.ts) — via the `findMarkers(text)` helper (`text.matchAll`, no shared `lastIndex`) — with six capture groups (one per type, two for substitution). `document.positionAt()` converts string offsets to VSCode positions — no manual line/column arithmetic. The preview ([preview/markdownIt.ts](src/preview/markdownIt.ts)) keeps a separate inline tokenizer because it integrates with markdown-it's own parser, but shares the delimiter literals via `MARKERS`.

Each `CriticChange` carries:
- `fullRange` — the entire `{--...--}` span, used for all edits
- `contentRange` — content inside markers (non-substitution types)
- `oldRange` / `newRange` — substitution sub-ranges for separate decoration
- `author?` / `date?` — comment metadata, set only on comments with the optional `@author YYYY-MM-DD:` prefix (and only when `kaicrit.edit.commentMetadata` is enabled). The convention lives in [core/comment.ts](src/core/comment.ts); a comment without the prefix carries neither field and behaves exactly as a plain comment.

Marker characters (`{--`, `--}`, etc.) get a separate dimming decoration (opacity 0.4) via `markerType` in `DecoratorManager`. The five content decorations additionally set `overviewRulerColor`/`overviewRulerLane` (Right) so changes show on the scrollbar; the dimmed `markerType` deliberately omits ruler markers.

Multi-line comments (`{>>line1\nline2<<}`) render fully in the preview: the inline tokenizer matches across newlines via `indexOf`, and `.critic-comment` in [media/critic.css](media/critic.css) sets `white-space: pre-wrap` so the line breaks stay visible.

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
4. Extend the shared `ORDER`/`LABELS`/`SYMBOLS` tables in [edit/statusBar.ts](src/edit/statusBar.ts) and the `ICONS` table in [edit/changesView.ts](src/edit/changesView.ts) so the status bar and sidebar pick up the new type
5. Add insert command and accept/reject case in [edit/commands.ts](src/edit/commands.ts)
6. Render the new type in [preview/markdownIt.ts](src/preview/markdownIt.ts) (+ a `.critic-*` class in [media/critic.css](media/critic.css)) if it should appear in the preview
7. Add command entry to `contributes.commands` in [package.json](package.json)
8. Add one or more `contributes.colors` entries in [package.json](package.json) for the new decoration color(s)
9. Update README.md, docs/markup.md, and CLAUDE.md
