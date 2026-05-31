# Markup Types

kaicrit supports all five CriticMarkup types. Each type is rendered with a distinct color; marker characters are visually de-emphasized.

In the editor, every change is also mirrored as a colored mark on the **overview ruler** (the scrollbar lane on the right), giving an at-a-glance map of where changes sit in the document. The ruler marks reuse the same `kaicrit.*` colors as the inline decorations (see [Colors](#colors)); the dimmed marker characters themselves are not shown on the ruler.

## Syntax

| Type | Syntax | Purpose |
|---|---|---|
| Deletion | `{--deleted text--}` | Mark text for removal |
| Addition | `{++added text++}` | Mark text for insertion |
| Substitution | `{~~old~>new~~}` | Mark a replacement pair |
| Highlight | `{==highlighted text==}` | Mark text for attention |
| Comment | `{>>comment text<<}` | Inline annotation |

## Accept / Reject Semantics

Accepting or rejecting a change strips the markup and resolves the content:

| Type | Accept | Reject |
|---|---|---|
| Deletion `{--T--}` | removes `T` | keeps `T` |
| Addition `{++T++}` | keeps `T` | removes `T` |
| Substitution `{~~O~>N~~}` | keeps `N` | keeps `O` |
| Highlight `{==T==}` | keeps `T` (strips markers) | keeps `T` (strips markers) |
| Comment `{>>T<<}` | removes entirely | removes entirely |

Accept All / Reject All apply all resolutions atomically in a single edit.

## Colors

Each change type uses a configurable decoration color. Defaults follow the active theme; override any color via `workbench.colorCustomizations` in `settings.json`:

```json
"workbench.colorCustomizations": {
  "kaicrit.highlightBackground": "#ffe066",
  "kaicrit.deletionForeground": "#cc0000"
}
```

| Color ID | Default | Applied to |
|---|---|---|
| `kaicrit.deletionForeground` | `editorError.foreground` | Deletion text |
| `kaicrit.additionForeground` | `gitDecoration.addedResourceForeground` | Addition text |
| `kaicrit.substitutionOldForeground` | `editorError.foreground` | Substitution — removed part |
| `kaicrit.substitutionNewForeground` | `gitDecoration.addedResourceForeground` | Substitution — inserted part |
| `kaicrit.highlightBackground` | `#ffff00` | Highlight background |
| `kaicrit.highlightForeground` | `#333333` | Highlight text |
| `kaicrit.commentBackground` | `#e0e0e0` | Comment background |
| `kaicrit.commentForeground` | `#555555` | Comment text |

## Status bar

When the active editor contains CriticMarkup, a status bar entry summarizes the open changes by type:

```
⊟3 ⊞5 ⇄2 ☰1 💬4
```

| Glyph | Type |
|---|---|
| `⊟` | Deletions |
| `⊞` | Additions |
| `⇄` | Substitutions |
| `☰` | Highlights |
| `💬` | Comments |

The counts update live as you type, insert, or accept/reject changes. The entry is hidden when the active editor has no changes, and clicking it jumps to the first change (`kaicrit.firstChange`).
