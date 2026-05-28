# Markup Types

kaicrit supports all five CriticMarkup types. Each type is rendered with a distinct color; marker characters are visually de-emphasized.

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
