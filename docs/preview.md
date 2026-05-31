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

## Styling

Preview colors are defined in `media/critic.css` and are intentionally
semi-transparent so they read well on both light and dark preview themes. To
customize them, override the `.critic-ins`, `.critic-del`, `.critic-mark`, and
`.critic-comment` classes in your own
[Markdown preview stylesheet](https://code.visualstudio.com/docs/languages/markdown#_using-your-own-css).
