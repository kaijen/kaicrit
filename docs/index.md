# kaicrit — CriticMarkup for VS Code

![kaicrit logo](assets/kaicrit_logo.png){ width=200 }

kaicrit brings a complete [CriticMarkup](https://github.com/CriticMarkup/CriticMarkup-toolkit) workflow to VS Code:

- **Edit** — insert change markers, navigate between them, and accept or reject changes without leaving the editor — including inline **Accept | Reject** CodeLens actions above each change. Changes are mirrored on the overview ruler and summarized by type in the status bar.
- **[Compare](compare.md)** — diff two files into a single CriticMarkup document.
- **[Preview](preview.md)** — render CriticMarkup in VS Code's built-in Markdown preview.

## What is CriticMarkup?

[CriticMarkup](https://github.com/CriticMarkup/CriticMarkup-toolkit) is a plain-text standard for tracking changes and inline comments. It works in any text file using simple bracket syntax. The [full specification](https://github.com/CriticMarkup/CriticMarkup-toolkit/blob/master/README.md) is maintained in the CriticMarkup-toolkit repository on GitHub.

## About

Made by [0x2e6b6169](https://blog.0x2e6b6169.de). Source on [GitHub](https://github.com/kaijen/kaicrit).

## Installation

Download the latest `kaicrit-*.vsix` from the [Releases page](https://github.com/kaijen/kaicrit/releases), then install it:

```bash
code --install-extension kaicrit-*.vsix
```

The extension activates automatically on VS Code startup.
