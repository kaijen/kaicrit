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
| Compare the open file with its Git HEAD | Command Palette or editor right-click → **Compare Active File with Git HEAD → CriticMarkup** |
| Two-step compare from the Explorer | Right-click file 1 → **Select for CriticMarkup Compare**, then right-click file 2 → **Compare with Selected → CriticMarkup** |
| Compare two selected files | Select two files in the Explorer → right-click → **Compare Selected Files → CriticMarkup** |

The generated CriticMarkup opens in a new untitled editor; save it wherever you
like. No keybindings are bound to the compare commands by default, to avoid
colliding with the `Alt+K` editing commands.

## Compare with Git HEAD

**Compare Active File with Git HEAD → CriticMarkup** diffs the active editor's
current contents against the version of that file committed at `HEAD`. The
committed version is file 1 (original) and the editor buffer is file 2
(modified), so the result shows your uncommitted edits as CriticMarkup.

The committed contents are read through VS Code's built-in Git extension. If the
file is not inside a Git repository, has no committed `HEAD` version yet, or the
Git extension is unavailable, kaicrit shows a warning and does nothing.

## Reconstruction invariant

The output upholds a strict invariant that mirrors kaicrit's accept/reject
semantics:

- **Reject every marker → file 1** (the original is restored).
- **Accept every marker → file 2** (the modified file is restored).

Unchanged text passes through verbatim, so concatenating the document always
reproduces one of the two source files exactly.

With `kaicrit.compare.ignoreWhitespace` enabled the invariant is relaxed for
whitespace only: rejecting every marker still reproduces file 1 exactly, while
purely whitespace differences are never marked (so accepting the result keeps
file 1's spacing in those spots rather than file 2's).

## Settings

| Setting | Default | Description |
|---|---|---|
| `kaicrit.compare.granularity` | `word` | Diff unit: `character`, `word` (whitespace-preserving), or `line`. |
| `kaicrit.compare.combineSubstitutions` | `true` | Merge an adjacent deletion + addition into one `{~~old~>new~~}` substitution. |
| `kaicrit.compare.ignoreWhitespace` | `false` | Ignore whitespace-only differences (similar to `git diff -w`). Tokens that differ only in whitespace — and pure-whitespace insertions/deletions — are not reported as changes. |
| `kaicrit.compare.outputLanguage` | `auto` | Language mode for the result: `auto` (match file 2), `plaintext`, or `markdown`. |

The diff engine uses Myers' shortest-edit-script algorithm; whitespace is kept
as standalone tokens so the reconstruction invariant holds at every
granularity. When `ignoreWhitespace` is on, tokens are matched after stripping
whitespace and any residual whitespace-only markers are suppressed, while the
original tokens are always emitted verbatim.
