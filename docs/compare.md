# Compare two files → CriticMarkup

kaicrit can diff two files and generate a single CriticMarkup document that
describes how the **first** file (the original) becomes the **second** file
(the modified version). The result is a normal text document you can read,
edit, and resolve marker by marker with the
[accept / reject commands](keybindings.md#accept-reject).

## Commands

| Action | How |
|---|---|
| Compare two arbitrary files | Command Palette → **Compare Two Files → CriticMarkup** |
| Compare the open file with another | Command Palette → **Compare Active File With… → CriticMarkup** |
| Two-step compare from the Explorer | Right-click file 1 → **Select for CriticMarkup Compare**, then right-click file 2 → **Compare with Selected → CriticMarkup** |
| Compare two selected files | Select two files in the Explorer → right-click → **Compare Selected Files → CriticMarkup** |

The generated CriticMarkup opens in a new untitled editor; save it wherever you
like. No keybindings are bound to the compare commands by default, to avoid
colliding with the `Alt+K` editing commands.

## Reconstruction invariant

The output upholds a strict invariant that mirrors kaicrit's accept/reject
semantics:

- **Reject every marker → file 1** (the original is restored).
- **Accept every marker → file 2** (the modified file is restored).

Unchanged text passes through verbatim, so concatenating the document always
reproduces one of the two source files exactly.

## Settings

| Setting | Default | Description |
|---|---|---|
| `kaicrit.compare.granularity` | `word` | Diff unit: `character`, `word` (whitespace-preserving), or `line`. |
| `kaicrit.compare.combineSubstitutions` | `true` | Merge an adjacent deletion + addition into one `{~~old~>new~~}` substitution. |
| `kaicrit.compare.outputLanguage` | `auto` | Language mode for the result: `auto` (match file 2), `plaintext`, or `markdown`. |

The diff engine uses Myers' shortest-edit-script algorithm; whitespace is kept
as standalone tokens so the reconstruction invariant holds at every
granularity.
