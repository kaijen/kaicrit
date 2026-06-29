# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- **The Markdown preview no longer freezes the whole extension host on a
  CriticMarkup marker placed inside a Markdown link** — e.g.
  `[label {~~old~>new~~} more](https://…)`. The preview's inline rule returned
  `true` from its *silent* code path without advancing `state.pos`. markdown-it
  runs inline rules in silent mode (via `skipToken`) when it scans the interior
  of another inline construct such as a link label; a rule that reports a match
  but doesn't move the position makes that scan never advance, so older
  markdown-it builds — including the one VS Code bundles — loop forever, blocking
  the extension host thread permanently (every file's hover stuck on "Loading",
  the whole extension unresponsive until a window reload). The rule now advances
  `state.pos` past the marker in both modes and only emits tokens when not
  silent. New tests assert the silent-mode contract for every marker type.

## [0.16.3] - 2026-06-29

### Fixed
- **The extension no longer freezes (hover stuck on "Loading", accept/reject from
  the changes list unresponsive) on documents with unterminated markers** — the
  marker parser scanned the whole document with a single regex whose global-match
  retry across start positions is O(n²) on pathological input: a stray
  unterminated opener (most expensively `{~~`) plus enough surrounding text made
  every parse take seconds, and since parsing runs synchronously on the extension
  host — on each decoration refresh, on cache-cold hovers, and after every
  accept/reject — the whole UI froze. The parser now uses a linear (O(n)) scanner
  that locates each marker by its delimiters in a single forward pass and never
  re-scans the tail once a closer is exhausted, so even multi-megabyte documents
  parse in milliseconds regardless of how malformed the markup is. Marker
  semantics are unchanged (a differential test keeps the scanner match-for-match
  equivalent to the previous regex). The `kaicrit.edit.maxParseLength` guard
  remains as a harmless backstop. (issue #63 follow-up)

## [0.16.2] - 2026-06-26

### Fixed
- **Track Changes no longer drops keystrokes when typing fast** — the recorder
  applies its compensating marker wrap through an asynchronous `applyEdit`, and
  any keystroke that arrived while that edit was still in flight used to be
  silently dropped (it landed in the buffer as untracked plain text). The
  recorder now keeps its shadow snapshot exactly in step with the buffer by
  replaying every change event, serialises its compensating edits per document,
  recognises the echo of its own edit, and reconciles any keystroke that raced an
  in-flight edit once that edit settles — so fast typing stays fully tracked. In
  the rare case where a keystroke and the compensating edit cross at the buffer
  level, the raced text is wrapped as a separate adjacent marker
  (`{++a++}{++b++}`) rather than merged — correct markup, no lost text.

## [0.16.1] - 2026-06-17

### Fixed
- **Files overview, Whole workspace scope, now lists closed Markdown/plaintext
  files on Remote/Server/WSL** — the disk scan resolves each file's language from
  its path (without opening it) to honour the `kaicrit.enabledLanguages`
  whitelist. That resolver only read languages contributed by enumerable
  extensions, but VS Code's "language basics" extensions (which map `.md` →
  markdown, `.txt` → plaintext) aren't always enumerable — notably the
  `markdown-basics` extension is absent in Remote/Server/WSL installs — so every
  *closed* Markdown/plaintext file was dropped and the workspace scan listed
  nothing but the files already open. The resolver now falls back to a built-in
  map for the default prose extensions, so the scan finds them again. Open files
  were never affected (they resolve via VS Code's own `languageId`).

## [0.16.0] - 2026-06-17

### Changed
- **Files overview, Open scope, now lists only files open as editor tabs** — the
  scope previously tried to also include files Git reported as changed in the
  working tree, but that integration never worked reliably (issue #78). It has
  been removed. The Open scope (`kaicrit.files.scope: "open"`) now lists exactly
  the files currently open as editor tabs (foreground or background) — phantom
  buffers without a real text tab (diff/HEAD comparisons, …) are no longer
  listed, and the list refreshes on tab open/close. Closed, Git-modified files
  are no longer surfaced by the Open scope; use the **Whole workspace** scope to
  find marker-bearing files that aren't open.

### Removed
- The built-in `vscode.git` integration of the Files overview (Open scope) and
  all its supporting wiring.

## [0.15.0] - 2026-06-17

### Added
- **`kaicrit.edit.collapseWhitespaceOnResolve` setting (default `true`)** —
  controls whether accepting/rejecting a change that resolves to empty also
  removes orphaned surrounding whitespace. Turn it off for strictly literal
  resolution that never touches text outside the marker (#79).

### Fixed
- **Accept/reject no longer leaves orphaned flanking whitespace** — resolving a
  change that collapses to empty (a comment, an accepted deletion, or a rejected
  addition) left a stray double space when the marker sat between two spaces, or
  a blank line when it sat alone on its own line. The resolution now also removes
  that orphaned whitespace — one trailing space for the double-space case, or the
  marker's line plus one adjacent line break for the blank-line case. Non-empty
  resolutions (substitution, highlight, rejected deletion) stay exact, so the
  Compare round-trip is unaffected; gated by the new
  `kaicrit.edit.collapseWhitespaceOnResolve` setting (#79, #73).
- **Files overview: closed Git-changed files now appear even when the Git
  extension is still initialising (Open scope)** — the v0.14.1 retry made the
  `vscode.git` init recover from a *missing* extension, but not from the more
  common race where the extension is present yet its repository discovery hasn't
  finished: `getAPI(1)` returns with `state: 'uninitialized'` and an **empty**
  `repositories` list, so the first scan (and a manual Refresh) read no
  working-tree changes, and nothing ever re-scanned once the list filled in —
  `onDidOpenRepository` could have fired before kaicrit subscribed, and
  `vscode.extensions.onDidChange` only fires on install/enable, never on
  activation. The init now also subscribes to the Git API's `onDidChangeState`
  and refreshes once discovery completes, watching the repositories that appear
  then. Additionally, the Open scope now reads a repo's **staged** (`indexChanges`),
  **merge**, and **untracked** changes alongside the working-tree changes, so a
  file whose only change is staged also surfaces (#78).

## [0.14.1] - 2026-06-16

### Fixed
- **Files overview: closed Git-changed files now reliably listed (Open scope)** —
  the open scope's Git half initialised the built-in `vscode.git` API with a
  one-shot latch: if the Git extension wasn't registered yet at the first scan
  (or activation threw), the API stayed unset **permanently**, so closed
  CriticMarkup files that Git reported as changed never appeared — not even after
  a manual Refresh. The initialisation is now retry-capable: it retries on a
  later scan and when `vscode.extensions.onDidChange` fires (e.g. once `vscode.git`
  finishes activating after startup), so the working-tree-changed files fill in
  on their own.

## [0.14.0] - 2026-06-16

### Added
- **Files overview display modes** — the **Files with Changes** view can now
  show its files either as the existing flat name **List** (the path shows on
  hover) or as a collapsible folder **Tree** mirroring the directory structure,
  switched with a button in the view title (and the `kaicrit.files.displayMode`
  setting, default `list`). Tree folders carry the aggregate change count of the
  files beneath them and are expanded by default; collapsing or expanding a
  folder is remembered across refreshes and reloads. File leaves stay directly
  clickable (#77).

### Changed
- **Open scope now also lists Git-changed files** — the Files overview's
  *Open & changed files* scope lists the open editor documents **plus** every
  file Git reports as changed in the working tree (modified, added, untracked,
  renamed, …), read from disk when not open. It refreshes live as you modify,
  stage, or revert files, so it tracks your current uncommitted review set even
  for files you haven't opened. Falls back to just the open documents when no
  Git repository is available.
- **Files overview workspace scan now honours `kaicrit.enabledLanguages`** — the
  whole-workspace scope previously listed any text file containing CriticMarkup
  regardless of type. It now resolves each disk file's language from its path
  (extension / `files.associations`) and skips file types kaicrit isn't enabled
  for, so the overview is consistent with the editor features and the open
  scope. Non-enabled files are skipped before any disk read, so the scan is also
  faster.

## [0.13.0] - 2026-06-16

### Added
- **Files with Changes overview** — a new view in the CriticMarkup sidebar,
  shown above the per-file Changes list, lists every file that contains
  CriticMarkup with a per-file change count; click a file to open it. A scope
  button in the view title (and the `kaicrit.files.scope` setting, default
  `open`) switches between listing only the open documents and scanning the
  whole workspace on disk; a Refresh button re-scans on demand (#75).

## [0.12.0] - 2026-06-10

### Changed
- **Type colors in the sidebar and status bar** — the Changes sidebar's group
  nodes (and the leaves in chronological layout) now carry a per-type icon
  tinted in the type's configured `kaicrit.*` color, and each per-type count in
  the status bar is tinted the same way, so the editor decorations, sidebar and
  counts share one color language. Customizations via
  `workbench.colorCustomizations` carry through automatically.

## [0.11.0] - 2026-06-10

### Added
- **Activity-Bar badge** — the kaicrit icon in the Activity Bar now shows a
  number badge with the active document's CriticMarkup change count (like the
  Explorer's unsaved-files badge). Hidden when the document has no changes or
  kaicrit is disabled for it; updates live as you type or resolve changes.

## [0.10.0] - 2026-06-09

A maintenance release closing 19 review issues — correctness, robustness,
security hardening, config scoping and build/CI tooling.

### Fixed
- **Accept/Reject could corrupt the document on a stale cache** (#52). Typing
  within the decoration debounce window and then triggering accept/reject
  (keybinding, CodeLens, hover, sidebar) resolved against pre-edit ranges and
  could replace the wrong span. Resolutions now flush any pending parse and
  verify the cached marker text (`CriticChange.raw`) before editing.
- **Split view decorated only one pane** (#56). The same file open in two panes
  now refreshes decorations in every visible editor, not just the focused one.
- **Changes-view group/flat toggle was inert under a workspace override** (#57).
  The toggle now writes `kaicrit.changes.grouping` into the scope that defines
  it (WorkspaceFolder/Workspace/Global).
- **Comment date used UTC** (#58). `insertComment` now stamps the local calendar
  date, so it no longer records the previous day east of UTC.
- **Cursor jumped after a failed authoring edit** (#59). `wrapSelection` and
  `insertSubstitution` skip the caret correction when the edit didn't apply.
- **Git author ignored multi-root workspaces** (#60). The comment author is now
  resolved from the active document's workspace folder.
- **Word diff fragmented non-ASCII words** (#55). The `word` tokenizer is now
  Unicode-aware (`\p{L}`/`\p{N}`), so umlauts, ß and accented letters stay inside
  their word.
- **Track Changes shadow hardened against external mutations** (#68). An
  inconsistent shadow snapshot is now resynced instead of producing a malformed
  marker.

### Changed
- **Track Changes is now coupled to the enablement gate** (#53, #54). Turning it
  on in a disabled document implicitly enables kaicrit for that file (so recorded
  markup is visible/resolvable), and the normal-mode paste-flatten takes a cheap
  early-out for ordinary typing and stays inert in disabled documents.
- **Configuration is read with a resource scope** (#61), so folder- and
  language-specific overrides (`"[markdown]": { … }`, multi-root settings) are
  honoured across enablement, the parser, decorator, Track Changes and compare.

### Added
- **`kaicrit.edit.maxParseLength`** (#63, default 2 000 000 chars). A size guard
  that disables marker parsing for pathologically large documents to avoid the
  marker regex's O(n²) worst case freezing the host.

### Security
- **Hardened the change-action hover** (#62). `isTrusted` is now scoped to
  kaicrit's own accept/reject commands instead of every `command:` URI, and
  document-sourced comment author/date is escaped so it can't render a link.

### Internal
- **CI now runs lint + tests on every push and pull request** (#51), and the
  release workflow runs the suite before packaging.
- **ESLint added** (#69) — flat config with the typescript-eslint recommended
  set, wired into CI.
- **The extension is bundled with esbuild for packaging** (#65) — the `.vsix`
  now ships a single ~40 KB module instead of ~30 files; the dev/F5 loop is
  unchanged.
- **Packaging cleanups**: dev-only files excluded from the `.vsix` (#64),
  `out/` cleaned before tests so orphaned compiled tests can't run (#67), and the
  docs unified on `@vscode/vsce` (#66).

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

[Unreleased]: https://github.com/kaijen/kaicrit/compare/v0.16.3...HEAD
[0.16.3]: https://github.com/kaijen/kaicrit/compare/v0.16.2...v0.16.3
[0.16.2]: https://github.com/kaijen/kaicrit/compare/v0.16.1...v0.16.2
[0.16.1]: https://github.com/kaijen/kaicrit/compare/v0.16.0...v0.16.1
[0.16.0]: https://github.com/kaijen/kaicrit/compare/v0.15.0...v0.16.0
[0.15.0]: https://github.com/kaijen/kaicrit/compare/v0.14.1...v0.15.0
[0.14.1]: https://github.com/kaijen/kaicrit/compare/v0.14.0...v0.14.1
[0.14.0]: https://github.com/kaijen/kaicrit/compare/v0.13.0...v0.14.0
[0.13.0]: https://github.com/kaijen/kaicrit/compare/v0.12.0...v0.13.0
[0.12.0]: https://github.com/kaijen/kaicrit/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/kaijen/kaicrit/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/kaijen/kaicrit/compare/v0.9.0...v0.10.0
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
