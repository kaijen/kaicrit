# Markdown preview

kaicrit renders CriticMarkup in VS Code's **built-in** Markdown preview. There
is no custom webview and no build step — the extension hooks the `markdown-it`
instance the preview already uses, so it stays fast and works with every
preview theme.

## Usage

1. Open any `.md` file containing CriticMarkup, for example:

   ```markdown
   The quick {--brown--}{++red++} fox {==jumps==} over the lazy dog.

   This sentence needs {~~clarifcation~>clarification~~}. {>>fixed a typo<<}
   ```

2. Open the built-in Markdown preview with `Ctrl+Shift+V` (`Cmd+Shift+V` on
   macOS), or **Markdown: Open Preview to the Side** (`Ctrl+K V` / `Cmd+K V`).

## Rendering

| Syntax | Rendered as | Meaning |
|---|---|---|
| `{++ … ++}` | `<ins>` insertion | insertion |
| `{-- … --}` | `<del>` deletion | deletion |
| `{== … ==}` | `<mark>` highlight | highlight |
| `{>> … <<}` | comment | editor comment |
| `{~~ old ~> new ~~}` | `<del>old</del><ins>new</ins>` | substitution |

Span bodies are re-parsed as inline Markdown, so nested formatting such as
`{++ **bold** text ++}` is preserved. CriticMarkup inside inline code or fenced
code blocks is left untouched.

## Why this rendering approach (and what it can't do)

Rendering CriticMarkup to HTML is the historically hard half of the format.
Two problems are well documented in the wider ecosystem:

1. **Invalid HTML.** Accepting/rejecting markers is trivial, but *visually*
   rendering edits — especially inside lists, or when a marker breaks Markdown
   syntax — can emit malformed HTML. (See the
   [PyMdown Critic extension notes](https://facelessuser.github.io/pymdown-extensions/extensions/critic/).)
2. **Span overlap.** A Markdown span can begin *inside* a CriticMarkup structure
   and end *outside* it. A "correct" converter would have to handle a huge
   number of special cases — Fletcher Penney tried several approaches in
   MultiMarkdown and
   [left it unsolved](https://fletcher.github.io/MultiMarkdown-6/syntax/critic.html).

kaicrit deliberately trades full coverage for **well-formed output**, by hooking
markdown-it as an *inline rule* (`md.inline.ruler.before('emphasis', …)`) rather
than pre-/post-processing the source string the way the Python tooling does:

| Problem | How kaicrit handles it |
|---|---|
| Invalid HTML | **Structurally impossible** — the rule pushes balanced token *pairs* (`ins_open`/`ins_close`, `span_open`/`span_close`) into markdown-it's token stream; markdown-it owns the nesting. We never concatenate HTML strings, so there is no malformed output to clean up afterwards. |
| Markers inside code | The inline rule never runs inside fenced/inline code, so markers there stay verbatim. |
| Markdown *inside* a marker | Correct — the marker body is re-tokenized as its own inline run (`{++ **bold** ++}` → `<ins><strong>bold</strong></ins>`). |
| Span overlap (Penney's case) | **Contained, not solved.** The body is tokenized with `posMax` clamped to the closing marker, so a `**` that opens inside a marker and closes outside it finds no partner and degrades to literal `**` — never to broken HTML. |

### Known limitation: markers must stay within one block

The inline rule only ever sees a **single block's** source (`state.src` is one
paragraph's content), and it matches the closing marker with `indexOf` within
that chunk. A marker that straddles block boundaries — an opening `{++` in one
paragraph or list item and its `++}` in another — is therefore **not rendered**
as an edit in the preview. This is exactly the "lists / markers breaking block
structure" class of cases that produces invalid HTML elsewhere; kaicrit leaves
it out of scope rather than trying to render it. (The multi-line *comment* case
above is the same constraint: a blank line ends the paragraph and the span.)

## Multi-line comments

Comments may span several lines, for example:

```markdown
Some text {>>First line of the note.
Second line, still part of the same comment.<<} more text.
```

The inline tokenizer matches the whole span up to the closing `<<}` even when it
contains newlines, and the comment styling sets `white-space: pre-wrap`, so the
line breaks stay visible in the preview instead of collapsing onto one line.
Keep a multi-line comment within a single paragraph — a fully blank line ends the
Markdown paragraph and therefore the comment span.

## Comment metadata

When a comment carries the optional `@author YYYY-MM-DD:` prefix
(see [Markup Types → Kommentar-Metadaten](markup.md#kommentar-metadaten-autor-datum)),
the preview renders the author/date as a distinct `.critic-comment-meta` label
ahead of the comment body; the body itself is still re-parsed as inline Markdown.
A plain comment renders unchanged. Set `kaicrit.edit.commentMetadata` to `false`
to render the whole comment body verbatim (the prefix is then shown as ordinary
text).

### Known limitation: setting changes need a reload

The preview reads `kaicrit.edit.commentMetadata` **once**, when VS Code first
builds the `markdown-it` instance (via the extension's `extendMarkdownIt` hook),
and then caches that instance. There is no stable VS Code API to discard and
rebuild the preview's `markdown-it` instance on demand, so **toggling
`kaicrit.edit.commentMetadata` only affects the preview after a window reload**
(**Developer: Reload Window**) — reopening the preview pane alone is not enough
once the instance is cached.

This is a preview-only quirk: the **editor** decorations re-read the setting on
every parse, so there a change takes effect on the next edit (or any action that
re-triggers a parse) without a reload.

## Styling

Preview colors are defined in `media/critic.css` and are intentionally
semi-transparent so they read well on both light and dark preview themes. To
customize them, override the `.critic-ins`, `.critic-del`, `.critic-mark`,
`.critic-comment`, and `.critic-comment-meta` classes in your own
[Markdown preview stylesheet](https://code.visualstudio.com/docs/languages/markdown#_using-your-own-css).
