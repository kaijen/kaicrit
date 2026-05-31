# Markup Types

kaicrit supports all five CriticMarkup types. Each type is rendered with a distinct color; marker characters are visually de-emphasized.

In the editor, every change is also mirrored as a colored mark on the **overview ruler** (the scrollbar lane on the right), giving an at-a-glance map of where changes sit in the document. The ruler marks reuse the same `kaicrit.*` colors as the inline decorations (see [Colors](#colors)); the dimmed marker characters themselves are not shown on the ruler.

## Syntax

| Type | Syntax | Purpose |
|---|---|---|
| Deletion | `{--deleted text--}` | Mark text for removal |
| Addition | `{++added text++}` | Mark text for insertion |
| Substitution | `{~~old~>new~~}` | Mark a replacement pair (the `~>` arrow is **required**) |
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

> **Note on substitution syntax:** the `~>` separator is mandatory. An arrow-less
> `{~~text~~}` is **not** a valid CriticMarkup marker (it is neither a substitution
> nor a deletion, per the [CriticMarkup spec](https://github.com/CriticMarkup/CriticMarkup-toolkit)).
> Both the editor and the Markdown preview ignore it: it is left as plain text
> rather than being rendered as a change. Use `{--text--}` to mark a deletion.

> **Inserting a substitution:** with a selection, **Insert Substitution** wraps it
> as the "old" side (`{~~selection~>~~}`) and parks the cursor before `~~}` so you
> type the replacement. With **no** selection it inserts an empty pair
> (`{~~~>~~}`) and parks the cursor on the empty "old" side (before `~>`) — there
> is no literal placeholder to delete; type the original, then move past `~>` for
> the replacement.

## Inline-Aktionen (CodeLens)

Über jeder Änderung erscheinen klickbare **Accept | Reject**-Aktionen. Ein Klick
löst genau diese Änderung auf – dieselbe Logik wie bei den Tastenkürzeln, nur
ohne sie kennen zu müssen. Die Aktionen aktualisieren sich automatisch beim
Tippen und nach dem Auflösen.

Abschaltbar über die Einstellung `kaicrit.edit.codeLens` (Standard `true`).

## Kommentar-Metadaten (Autor & Datum)

Kommentare können optional mit einem Autor und/oder einem ISO-Datum beginnen, durch
einen Doppelpunkt vom Kommentartext getrennt:

```text
{>>@kai 2026-05-31: needs a source<<}
{>>@kai: looks good<<}
{>>2026-05-31: revisit later<<}
```

Das Format lautet `[@autor] [JJJJ-MM-TT]:` – beide Teile sind optional, aber
mindestens einer muss vorhanden und von einem Doppelpunkt gefolgt sein, damit der
Vorspann als Metadaten gilt.

Die Konvention ist **rückwärtskompatibel**: Ein Kommentar **ohne** diesen Vorspann
verhält sich exakt wie bisher. Auch ein gewöhnlicher Doppelpunkt im Fließtext
(`{>>Note: siehe oben<<}`) wird **nicht** als Metadaten interpretiert, da kein
`@autor` und kein Datum davorstehen.

Sind Metadaten vorhanden, werden Autor/Datum

- im Editor als **Hover** über dem Kommentar angezeigt, und
- im Markdown-Preview dem Kommentartext als hervorgehobener Präfix vorangestellt
  (`.critic-comment-meta`).

Accept/Reject entfernt den Kommentar weiterhin vollständig (Metadaten inklusive).

Beim Einfügen eines Kommentars (`Alt+K Alt+C`) wird `@autor heute: ` vorbefüllt. Der
Autor stammt aus der Einstellung `kaicrit.edit.commentAuthor`; ist sie leer, greift
kaicrit auf `git config user.name` des Repositories zurück.

| Einstellung | Standard | Wirkung |
|---|---|---|
| `kaicrit.edit.commentMetadata` | `true` | Autor/Datum-Konvention erkennen (Hover, Preview, Vorbefüllung). Bei `false` sind Kommentare reiner Text. |
| `kaicrit.edit.commentAuthor` | `""` | Beim Einfügen vorbefüllter Autor. Leer ⇒ Rückgriff auf `git config user.name`. |

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
