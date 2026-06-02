# Double-Pane view (Original | New)

The Double-Pane view turns a single CriticMarkup document into **two parallel
texts** shown side by side, so you can read the *before* and *after* of a set of
changes without mentally stripping the marker syntax:

- **Left — "Original"**: the state *before* the changes — what you would get by
  **rejecting** every marker. Deleted and substituted-old text stays visible in
  its markup colour; additions are absent.
- **Right — "New"**: the state *after* the changes — what you would get by
  **accepting** every marker. Added and substituted-new text stays visible in
  its markup colour; deletions are absent.

**Highlights** and **comments** appear on **both** sides. Plain text between
markers is copied verbatim to both. The marker delimiters themselves (`{--`,
`++}`, `~>`, `{==`, `{>>`, …) appear on **neither** side: you get coloured
content with the exact look of the editor decorations, just without the syntax.

## Running it

Open a document containing CriticMarkup and trigger
**CriticMarkup: Open Double-Pane View (Original | New)** via any of:

| How | |
|---|---|
| Command Palette | **CriticMarkup: Open Double-Pane View (Original \| New)** |
| Editor title bar | the `$(split-horizontal)` icon |
| Editor right-click | **Open Double-Pane View (Original \| New)** |
| Keyboard | `Alt+K Alt+P` |

kaicrit takes a **snapshot** of the active document (like the
[Compare](compare.md) feature — there is no live mode) and opens the two panes
side by side: Original in the left editor column, New beside it.

The `Alt+K Alt+P` shortcut is just the default and is fully configurable: rebind
`kaicrit.openDoublePane` to any key via **File › Preferences › Keyboard
Shortcuts** (search for `kaicrit`) or in `keybindings.json` — see
[Keybindings › Customize](keybindings.md#customize).

## Mapping per markup type

| Type | Left (Original) | Right (New) |
|---|---|---|
| Deletion `{--T--}` | `T` — red, struck through | — (nothing) |
| Addition `{++T++}` | — (nothing) | `T` — green, underlined |
| Substitution `{~~O~>N~~}` | `O` — red (old) | `N` — green (new) |
| Highlight `{==T==}` | `T` — highlighted | `T` — highlighted |
| Comment `{>>T<<}` | `T` — comment style | `T` — comment style |

The colours and styles are exactly the editor's content decorations (and use the
same `kaicrit.*` theme-colour IDs), so the panes match what you already see while
editing. Comment content is shown verbatim, including any optional
`@author YYYY-MM-DD:` prefix.

## Known limits (v1, deliberate)

- **No line alignment** between the panes. Deletions only push the left text and
  additions only the right, so the two sides run independently — each is a
  self-contained, readable document, but corresponding lines do not necessarily
  sit at the same height. True alignment would need padding or a webview and is
  out of scope.
- **Editable untitled documents with generic tab titles.** The two panes open as
  ordinary untitled editors, consistent with the Compare feature. They are
  snapshots — editing them does not change the source document, and re-running
  the command produces a fresh pair.

## How it works

The split is computed by a small pure function (`src/doublepane/build.ts`,
mirroring `src/edit/resolve.ts`): it walks the markers, sends each piece to the
appropriate side(s) with a colour category, and records the offset spans. The
command layer (`src/doublepane/commands.ts`) opens the two untitled documents and
re-applies the spans as decorations using its **own** set of decoration types
(from the shared `src/edit/decorationTypes.ts` factory) — kept separate from the
editor's `DecoratorManager` instances so focusing a pane editor can't clear the
pane colours.
