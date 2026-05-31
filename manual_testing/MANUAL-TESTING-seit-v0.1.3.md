# Manuelle Verifikation – alle Änderungen seit v0.1.3

Diese Anleitung führt durch alle Funktionen, die **seit dem letzten v0.1.x-Tag
(`v0.1.3`, 2026‑05‑29)** dazugekommen sind – also das Release **v0.2.0** plus
die heutigen, noch nicht veröffentlichten Änderungen (`[Unreleased]` im
[CHANGELOG.md](../CHANGELOG.md)).

Jeder Abschnitt nennt das **Beispielmaterial**, die **Schritte** und das
**erwartete Ergebnis** (✅). Hake jeden Punkt ab, dann ist die ganze Spanne
verifiziert.

---

## 0. Vorbereitung

1. Abhängigkeiten installieren und kompilieren:
   ```bash
   npm install
   npm test          # automatisierte Suiten – muss grün sein, bevor du manuell testest
   npm run watch     # Watch-Compiler laufen lassen
   ```
   > `npm test` deckt Parser, Navigation, Accept/Reject-Semantik, Preview,
   > Compare und Track-Changes-Engine automatisiert ab. Die manuelle
   > Verifikation unten konzentriert sich daher auf das Laufzeit-/UI-Verhalten
   > im Extension Host, das die Unit-Tests nicht erfassen.
2. In VS Code **F5** drücken → es startet ein **Extension Development Host**.
3. Im Development-Host den Ordner `manual_testing/examples` öffnen
   (oder das ganze Repo). Alle Beispieldateien liegen dort.
4. Bei jeder Code-Änderung im Host **Developer: Reload Window** ausführen.

> Tipp: Die Sprache eines Dokuments steht unten rechts in der Statusleiste.
> kaicrit aktiviert seine Editor-Funktionen standardmäßig nur für `markdown`
> und `plaintext`.

Übersicht der Beispieldateien:

| Datei | Wofür |
|---|---|
| `examples/all-markers.md` | Dekorationen, Statusleiste, Sidebar, CodeLens, Preview, Accept/Reject, Kommentar‑Metadaten |
| `examples/compare-original.md` + `examples/compare-modified.md` | Compare zweier Dateien |
| `examples/whitespace-a.txt` + `examples/whitespace-b.txt` | Compare mit `ignoreWhitespace` |
| `examples/track-changes-playground.md` | Track‑Changes‑Modus |
| `examples/activation-sample.js` | Per‑Sprache‑Aktivierung & Per‑Datei‑Umschaltung |

---

## 1. v0.2.0 – Compare: zwei Dateien → CriticMarkup

**Beispiel:** `compare-original.md`, `compare-modified.md`

### 1a. Zwei beliebige Dateien vergleichen
1. Befehlspalette (`Ctrl+Shift+P`) → **Compare Two Files → CriticMarkup**.
2. Als Datei 1 `compare-original.md`, als Datei 2 `compare-modified.md` wählen.

✅ Ein neues, ungespeichertes Dokument öffnet sich mit CriticMarkup, das
zeigt, wie Datei 1 zu Datei 2 wird, z. B.:
- `{~~braune~>rote~~}` Fuchs, `springt {++elegant ++}über`
- `{~~Montag~>Dienstag~~}`, `{~~neun~>zehn~~}`, `{~~großen~>kleinen~~}`
- Die Zeile „Diese Zeile wird … gelöscht.“ als `{--…--}`
- `{++- Viertes Element++}` als Ergänzung
- Der identische Absatz bleibt **unverändert** (kein Marker).

### 1b. Rekonstruktions-Invariante
1. Im Ergebnis **Accept All Changes** (`Alt+K Enter`).
   ✅ Das Dokument ist nun **identisch zu `compare-modified.md`**.
2. Rückgängig machen (Undo). Dann **Reject All Changes** (`Alt+K Backspace`).
   ✅ Das Dokument ist nun **identisch zu `compare-original.md`**.

### 1c. Aktive Datei vergleichen
1. `compare-original.md` öffnen → Befehlspalette → **Compare Active File
   With… → CriticMarkup** → `compare-modified.md` wählen.
   ✅ Gleiches Ergebnis wie 1a.

### 1d. Aus dem Explorer (zwei Schritte)
1. Rechtsklick auf `compare-original.md` → **Select for CriticMarkup Compare**.
2. Rechtsklick auf `compare-modified.md` → **Compare with Selected →
   CriticMarkup**.
   ✅ Gleiches Ergebnis.

### 1e. Aus dem Explorer (Mehrfachauswahl)
1. Beide Dateien im Explorer markieren (Strg/Cmd‑Klick) → Rechtsklick →
   **Compare Selected Files → CriticMarkup**.
   ✅ Vergleich öffnet sich.

### 1f. Einstellungen
Teste in `settings.json` jeweils und vergleiche erneut:
- `kaicrit.compare.granularity`: `"character"`, `"word"` (Default), `"line"`.
  ✅ Marker werden feiner (Zeichen) bzw. gröber (ganze Zeilen).
- `kaicrit.compare.combineSubstitutions`: `false`.
  ✅ Aus `{~~alt~>neu~~}` werden getrennte `{--alt--}{++neu++}`.
- `kaicrit.compare.outputLanguage`: `"plaintext"` / `"markdown"` / `"auto"`.
  ✅ Sprachmodus des Ergebnisses (unten rechts) ändert sich entsprechend.

---

## 2. v0.2.0 – Markdown-Preview

**Beispiel:** `all-markers.md`

1. `all-markers.md` öffnen → `Ctrl+Shift+V` (Preview) bzw. **Markdown: Open
   Preview to the Side** (`Ctrl+K V`).

✅ In der **eingebauten** Preview (kein Webview, kein Build-Schritt):
- `{++…++}` → unterstrichen/eingefügt (`<ins>`)
- `{--…--}` → durchgestrichen (`<del>`)
- `{==…==}` → hervorgehoben (`<mark>`)
- `{~~alt~>neu~~}` → durchgestrichenes `alt` + eingefügtes `neu`
- `{>>…<<}` → als Kommentar gestylt
- `{++**fett** …++}` → verschachteltes Markdown bleibt erhalten (fett/kursiv).

**Wichtige Sonderfälle (Fixes):**
- Das pfeillose `{~~ohne Pfeil~~}` wird **als normaler Text** dargestellt,
  **nicht** als Löschung. ✅
- Der **mehrzeilige Kommentar** wird vollständig angezeigt, die Zeilenumbrüche
  bleiben erhalten (nicht zu einer Zeile zusammengezogen). ✅

---

## 3. Inline-CodeLens (Accept | Reject)

**Beispiel:** `all-markers.md`

1. Datei öffnen.
   ✅ Über **jeder** Änderung erscheint eine klickbare Zeile **Accept | Reject**.
2. Bei einer Addition auf **Accept** klicken.
   ✅ Der Text bleibt, die Marker verschwinden; die CodeLens aktualisiert sich.
3. Bei einer Deletion auf **Reject** klicken.
   ✅ Der Text bleibt erhalten.
4. In `settings.json` `"kaicrit.edit.codeLens": false` setzen.
   ✅ Die CodeLens-Zeilen verschwinden. Wieder auf `true` setzen → kehren zurück.

---

## 4. Statusleisten-Zähler

**Beispiel:** `all-markers.md`

1. Datei öffnen.
   ✅ In der Statusleiste erscheint eine Zusammenfassung pro Typ, z. B.
   `⊟ ⊞ ⇄ ☰ 💬` mit Zahlen (Deletions, Additions, Substitutions, Highlights,
   Comments).
2. Auf den Eintrag klicken.
   ✅ Der Cursor springt zur **ersten** Änderung.
3. Eine Änderung per Accept/Reject auflösen.
   ✅ Der entsprechende Zähler sinkt **live**.
4. Alle Änderungen auflösen (oder eine leere Markdown-Datei öffnen).
   ✅ Der Statusleisten-Eintrag wird **ausgeblendet**.

---

## 5. Overview-Ruler-Markierungen

**Beispiel:** `all-markers.md`

1. Datei öffnen, evtl. Fenster verkleinern, damit gescrollt werden muss.
   ✅ Rechts in der Scrollbar-Spur erscheinen **farbige Marken** an den
   Positionen der Änderungen (gleiche `kaicrit.*`-Farben wie inline).
   Die gedimmten Marker-Zeichen selbst erzeugen **keine** Ruler-Marke.

---

## 6. Changes-Sidebar (Activity-Bar-View „CriticMarkup“)

**Beispiel:** `all-markers.md`

1. In der Activity Bar das **CriticMarkup**-Icon öffnen.
   ✅ Die View listet alle Änderungen des aktiven Dokuments, **gruppiert nach
   Typ**, mit Anzahl pro Gruppe.
2. Auf einen Eintrag klicken.
   ✅ Der Editor springt zur jeweiligen Änderung.
3. Inline-Buttons **Accept** / **Reject** an einem Eintrag nutzen.
   ✅ Genau diese Änderung wird aufgelöst; die View aktualisiert sich.
4. In der View-Titelleiste **Accept All** / **Reject All** nutzen.
   ✅ Alle Änderungen werden aufgelöst.
5. Zu einer anderen Datei (z. B. `compare-original.md`) wechseln.
   ✅ Die View folgt dem **aktiven** Editor und zeigt dessen Änderungen.

---

## 7. Kommentar-Metadaten (Autor & Datum)

**Beispiel:** `all-markers.md` (Abschnitt „Kommentar mit Metadaten“)

1. Voraussetzung: `kaicrit.edit.commentMetadata` ist `true` (Default).
2. Mauszeiger über `{>>@kai 2026-05-31: …<<}` halten.
   ✅ Ein **Hover** zeigt Autor (`@kai`) und Datum (`2026-05-31`).
3. Auch `{>>@kai: …<<}` (nur Autor) und `{>>2026-05-31: …<<}` (nur Datum)
   prüfen. ✅ Jeweils das vorhandene Feld erscheint.
4. `{>>Hinweis: siehe oben<<}` prüfen.
   ✅ Wird **nicht** als Metadaten interpretiert (kein `@autor`, kein Datum) –
   verhält sich wie ein gewöhnlicher Kommentar.
5. Preview öffnen (`Ctrl+Shift+V`).
   ✅ Bei Metadaten-Kommentaren steht Autor/Datum als hervorgehobener Präfix
   (`.critic-comment-meta`) vor dem Kommentartext.
6. **Einfügen mit Vorbefüllung:** In einer Markdown-Datei `Alt+K Alt+C`
   (Insert Comment).
   ✅ Der Kommentar wird mit `@autor heute: ` vorbefüllt. Der Autor stammt aus
   `kaicrit.edit.commentAuthor`; ist diese leer, greift kaicrit auf
   `git config user.name` zurück (siehe auch §11 – darf den Editor **nicht**
   einfrieren).
7. `kaicrit.edit.commentMetadata` auf `false` setzen, Preview neu laden.
   ✅ Der `@autor:`-Präfix wird als ganz normaler Text dargestellt, kein Hover.

---

## 8. Track-Changes-Modus (Annotate)

**Beispiel:** `track-changes-playground.md`

1. Datei öffnen → **Toggle Track Changes** (`Alt+K Alt+T`) oder den
   Editor-Titel-Button.
   ✅ In der Statusleiste erscheint **`$(edit) Track Changes`**.
2. **Tippen in Plain-Text:** an „Tippe hier etwas dazu“ ein Wort ergänzen.
   ✅ Das getippte Wort wird zu `{++…++}`, der Cursor steht **innerhalb** vor
   `++}`. Weiterschreiben lässt die **selbe** Addition wachsen (kein
   `{++a++}{++b++}`).
3. **Löschen von Plain-Text:** in „Dieses überflüssige Wort hier“ ein Wort
   löschen.
   ✅ Der gelöschte Text wird zu `{--…--}`.
4. **Backspace-Streak:** mehrere Zeichen in Folge per Backspace löschen.
   ✅ Sie verschmelzen zu **einer** `{--…--}`-Markierung (Single-Edit-Merge).
5. **Auswahl ersetzen:** in „Ich mag Tee.“ das Wort `Tee` markieren und
   `Kaffee` tippen.
   ✅ Ergebnis `{~~Tee~>Kaffee~~}`.
6. **Eben Getipptes wieder löschen:** innerhalb einer frischen Addition tippen
   und sofort per Backspace entfernen.
   ✅ Der Text verschwindet einfach – er „war nie da“ (kein Deletion-Marker).
7. **Zwei-Schritt-Undo (gewollt):** nach einer aufgezeichneten Eingabe einmal
   **Undo**.
   ✅ Der Marker-Wrap wird entfernt; ein **zweites** Undo entfernt die
   ursprüngliche Eingabe (dokumentiert in `docs/track-changes.md`).
8. **Per-Dokument-Zustand:** eine zweite Markdown-Datei daneben öffnen.
   ✅ Dort ist Track Changes **aus** – die Aufzeichnung gilt nur pro Dokument.
9. Mit `Alt+K Alt+T` wieder ausschalten.
   ✅ Statusleisten-Indikator verschwindet; Bearbeitungen sind wieder normal.

**Default-Einstellung:** `kaicrit.edit.trackChanges` auf `true` setzen, eine
**neu** geöffnete Datei prüfen. ✅ Sie startet bereits im Aufzeichnungsmodus.

---

## 9. Compare mit Git HEAD

**Voraussetzung:** Das Repo ist ein Git-Repo und die eingebaute Git-Extension
ist aktiv.

1. Eine **versionierte** Datei öffnen (z. B. `README.md` im Repo) und ein paar
   Zeichen ändern, **ohne** zu committen.
2. Befehlspalette **oder** Editor-Rechtsklick → **Compare Active File with Git
   HEAD → CriticMarkup**.
   ✅ Ein neues Dokument zeigt die **uncommitteten** Änderungen als
   CriticMarkup (HEAD-Version = Datei 1, Editor-Puffer = Datei 2).
3. **Fehlerfälle:** den Befehl auf einer Datei **außerhalb** eines Git-Repos
   ausführen (z. B. eine neue ungespeicherte Datei).
   ✅ kaicrit zeigt eine **Warnung** und tut nichts (kein Crash).

---

## 10. Compare: Whitespace ignorieren

**Beispiel:** `whitespace-a.txt`, `whitespace-b.txt` (Unterschiede sind **nur**
Leerzeichen, z. B. `a, b` → `a,b`, `a + b` → `a+b`, `=` mit/ohne Spaces).

1. `kaicrit.compare.ignoreWhitespace` = `false` (Default). Beide Dateien
   vergleichen (§1a).
   ✅ Die reinen Whitespace-Unterschiede **werden** als Marker angezeigt.
2. `kaicrit.compare.ignoreWhitespace` = `true` setzen, erneut vergleichen.
   ✅ Whitespace-only-Unterschiede werden **nicht** mehr markiert (Verhalten wie
   `git diff -w`).
3. Invariante prüfen: im Ergebnis aus Schritt 2 **Reject All**.
   ✅ Es entsteht exakt **`whitespace-a.txt`** (Datei 1 wird vollständig
   wiederhergestellt).

---

## 11. Per-Sprache-Aktivierung & Per-Datei-Umschaltung

**Beispiele:** `activation-sample.js` (Sprache `javascript`), `all-markers.md`
(Sprache `markdown`).

### 11a. Sprach-Whitelist
1. Default `kaicrit.enabledLanguages` = `["markdown","plaintext"]`.
2. `activation-sample.js` öffnen.
   ✅ **Keine** Dekorationen, keine CodeLens, keine Statusleisten-Zähler, leere
   Changes-View – obwohl die Datei Marker enthält. `Alt+A`/`Alt+R` behalten ihr
   normales Verhalten.
3. `all-markers.md` öffnen.
   ✅ Voll aktiv (Dekorationen etc.).

### 11b. Per-Datei-Umschaltung (Auge)
1. Bei geöffneter `activation-sample.js` in der Statusleiste rechts auf
   **`$(eye-closed) CriticMarkup`** klicken (oder Befehl **Toggle CriticMarkup
   for This File**).
   ✅ Das Icon wird zu **`$(eye) CriticMarkup`**; die Datei wird **sofort**
   dekoriert, CodeLens/Zähler/Sidebar erscheinen.
2. Bei geöffneter `all-markers.md` auf **`$(eye) CriticMarkup`** klicken.
   ✅ Wird zu **`$(eye-closed)`**; kaicrit behandelt die Datei wie Plain-Text –
   alles wird inert (keine Dekorationen, leere View, `Alt+A`/`Alt+R` dormant).
   Der Datei-**Text** ändert sich nicht.
3. Override ist **session-only:** die umgeschaltete Datei schließen und wieder
   öffnen.
   ✅ Sie folgt wieder dem Sprach-Default.

### 11c. Whitelist erweitern
1. `"kaicrit.enabledLanguages": ["*"]` setzen.
   ✅ `activation-sample.js` ist **ohne** Per-Datei-Toggle aktiv.
2. Auf Default zurücksetzen.

---

## 12. Fixes verifizieren

- **Async git config (kein Einfrieren):** `kaicrit.edit.commentAuthor` leeren,
  in einer Markdown-Datei `Alt+K Alt+C` (Insert Comment).
  ✅ Der Editor bleibt **flüssig** bedienbar, auch wenn das Ermitteln des Autors
  über git etwas dauert (asynchron, pro Workspace-Ordner gecacht).
- **Pfeillose Substitution:** siehe §2 – `{~~ohne Pfeil~~}` wird **weder** im
  Editor **noch** in der Preview als Löschung gerendert. ✅
- **Mehrzeilige Kommentare in der Preview:** siehe §2 – vollständig mit
  Zeilenumbrüchen. ✅
- **Einfaches Re-Parse nach Accept/Reject:** in `all-markers.md` eine Änderung
  per CodeLens/Sidebar/`Alt+A`/`Alt+R` auflösen.
  ✅ Marker verschwinden, und Statusleisten-Zähler, Sidebar und CodeLens
  aktualisieren sich **sofort und ohne Flackern** (das Dokument wird intern nur
  noch **einmal** statt doppelt neu geparst – rein interne Optimierung, kein
  sichtbarer Verhaltensunterschied).

---

## Abschluss-Checkliste

- [ ] §1 Compare (alle 5 Einstiegswege + Invariante + Einstellungen)
- [ ] §2 Markdown-Preview (alle Typen, pfeillos, mehrzeilig)
- [ ] §3 Inline-CodeLens
- [ ] §4 Statusleisten-Zähler
- [ ] §5 Overview-Ruler
- [ ] §6 Changes-Sidebar
- [ ] §7 Kommentar-Metadaten (Hover, Preview, Vorbefüllung, Toggle)
- [ ] §8 Track-Changes-Modus
- [ ] §9 Compare mit Git HEAD (inkl. Fehlerfall)
- [ ] §10 Compare ignoreWhitespace (inkl. Invariante)
- [ ] §11 Per-Sprache-Aktivierung & Per-Datei-Umschaltung
- [ ] §12 Fixes
