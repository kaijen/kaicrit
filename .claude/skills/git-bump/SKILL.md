---
name: git-bump
description: >
  Erhöht die Version eines Projekts nach Semantic Versioning, aktualisiert
  optional CHANGELOG.md und löst /git-newcommit aus.
  Aktivieren wenn der User die Version erhöhen oder bumpen möchte, ein Release
  vorbereiten will, oder /git-bump eingibt.
  Sprache folgt dem User – Commit-Message immer auf Englisch.
metadata:
  version: "1.0"
  language: follow_user
allowed-tools:
  - AskUserQuestion
  - Bash
  - Read
  - Edit
  - Skill
---

# Version bumpen

Du erhöhst die Versionsnummer eines Projekts nach Semantic Versioning,
pflegst CHANGELOG.md und übergibst dann an /git-newcommit.

---

## Schritt 1 – Versionsdatei erkennen

Prüfe, welche Versionsdatei im aktuellen Verzeichnis vorhanden ist:

```bash
ls package.json pyproject.toml Cargo.toml 2>/dev/null
```

Unterstützte Dateien und wie die aktuelle Version daraus gelesen wird:

| Datei | Befehl |
|---|---|
| `package.json` | `node -p "require('./package.json').version"` |
| `pyproject.toml` | `grep '^version' pyproject.toml` |
| `Cargo.toml` | `grep '^version' Cargo.toml` |

Wenn keine Versionsdatei gefunden wird: User informieren und abbrechen.

Zeige dem User die aktuell erkannte Version, bevor du fragst.

---

## Schritt 2 – Bump-Typ erfragen

Erkläre Semantic Versioning kurz und frage nach dem Typ:

| Typ | Bedeutung | Beispiel (von 1.2.3) |
|---|---|---|
| `patch` | Bugfix, kein API-Bruch | → 1.2.4 |
| `minor` | Neues Feature, abwärtskompatibel | → 1.3.0 |
| `major` | Breaking Change | → 2.0.0 |

Schlage anhand des Gesprächskontexts (welche Änderungen wurden gemacht?) den
passenden Typ vor. Wenn der Kontext unklar ist, nicht raten – fragen.

---

## Schritt 3 – Version erhöhen

**Für `package.json`** — nutze npm, damit auch `package-lock.json` synchron bleibt:

```bash
npm version <patch|minor|major> --no-git-tag-version
```

`--no-git-tag-version` verhindert, dass npm selbst einen Commit oder Tag erstellt.

**Für `pyproject.toml` / `Cargo.toml`** — bearbeite die Datei direkt mit dem
Edit-Tool. Berechne die neue Versionsnummer manuell nach SemVer.

Zeige dem User die neue Version nach dem Bump.

---

## Schritt 4 – CHANGELOG.md aktualisieren (wenn vorhanden)

Prüfe, ob `CHANGELOG.md` existiert:

```bash
ls CHANGELOG.md 2>/dev/null
```

Wenn ja: Lies die Datei. Suche nach einem `## [Unreleased]`-Abschnitt.

**Wenn `[Unreleased]` vorhanden und nicht leer ist:**

Transformiere nach Keep-a-Changelog-Format:

Vorher:
```markdown
## [Unreleased]

### Added
- Feature X

## [1.2.3] - 2026-01-15
```

Nachher:
```markdown
## [Unreleased]

## [1.3.0] - 2026-05-28

### Added
- Feature X

## [1.2.3] - 2026-01-15
```

Regel: Einen neuen leeren `## [Unreleased]`-Block einfügen, den alten Inhalt
unter die neue Versionszeile `## [X.Y.Z] - YYYY-MM-DD` verschieben.
Das aktuelle Datum (`YYYY-MM-DD`) aus dem Gesprächskontext oder via Bash ermitteln:

```bash
date +%Y-%m-%d
```

**Wenn `[Unreleased]` leer oder nicht vorhanden ist:** Keine Änderung vornehmen.

---

## Schritt 5 – /git-newcommit aufrufen

Rufe den Skill `/git-newcommit` auf. Dieser übernimmt ab hier das Stagen,
die Commit-Message-Generierung und das Pushen.

Hinweise für git-newcommit, die aus dem Kontext bereits bekannt sind:
- Typ: `chore`
- Scope: abhängig vom Projekt (z. B. `release`, `version`, oder leer)
- Breaking Change: nur wenn Bump-Typ `major`
- Warum: Versionserhöhung zur Vorbereitung des nächsten Releases

