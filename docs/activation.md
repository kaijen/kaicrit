# Where kaicrit is active

kaicrit's editor features — decorations, the dimmed markers, the inline
**Accept · Reject** [actions](markup.md), the [status-bar counts](index.md),
the [Changes sidebar](overview.md), and the accept/reject keybindings — don't
run in every file. They run for the **file types you choose**, with a per-file
status-bar toggle for one-off exceptions.

The [Compare](compare.md) commands and the [Markdown preview](preview.md) are
independent of this setting: compare always works on the files you pick, and the
preview renders CriticMarkup wherever VS Code renders Markdown.

## Enabled languages

The `kaicrit.enabledLanguages` setting is a list of
[language ids](https://code.visualstudio.com/docs/languages/identifiers) for
which kaicrit activates. It defaults to Markdown and plain text:

```json
"kaicrit.enabledLanguages": ["markdown", "plaintext"]
```

A document is matched by its language id (shown in the bottom-right of the
status bar), not by its file extension — so `.md`, `.markdown`, and any file you
have associated with the Markdown language all count as `markdown`. Add more
ids to cover other prose formats:

```json
"kaicrit.enabledLanguages": ["markdown", "plaintext", "latex", "asciidoc"]
```

Use the wildcard `"*"` to enable kaicrit for **every** language:

```json
"kaicrit.enabledLanguages": ["*"]
```

## Per-file toggle

Some files are the exception to your language rule — a code file you're
reviewing as CriticMarkup, or a Markdown file where the markers are just noise.
The status bar carries a **`$(eye) CriticMarkup`** item (right side, next to the
[Track Changes](track-changes.md) indicator):

- **`$(eye) CriticMarkup`** — kaicrit is active for this file. Click to turn it
  off.
- **`$(eye-closed) CriticMarkup`** — kaicrit is inactive for this file. Click to
  turn it on.

The same action is available as the **Toggle CriticMarkup for This File**
command in the Command Palette.

The toggle sets a **per-file override** that wins over the language list. It is
**session-only**: it is dropped when the file is closed, after which the file
follows the `kaicrit.enabledLanguages` default again. (This mirrors how
[Track Changes](track-changes.md) keeps its per-document state.)

## What "off" means

While a file is disabled — whether by language or by an explicit toggle —
kaicrit treats it as plain text:

- no decorations, dimmed markers, or overview-ruler marks,
- no status-bar counts and an empty Changes view,
- no inline Accept · Reject actions (hover or CodeLens),
- the `Alt+A` / `Alt+R` accept/reject keybindings stay dormant (their
  `kaicrit.hasChanges` guard is false), and navigation/accept commands report
  that there are no changes.

Turn the file back on from the status bar and everything re-appears
immediately — nothing about the document's text is changed by toggling.
