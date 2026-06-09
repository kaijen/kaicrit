# Projekt-Review: kaicrit

- **Stand:** 2026-06-09, Commit `709a16e` (v0.9.0), Branch `main`
- **Scope:** Vollständige Durchsicht von `src/` (alle Module), `package.json`, `tsconfig.json`, CI-Workflows, `.vscodeignore` sowie Stichproben der Doku (README, DEVELOPER.md, CLAUDE.md, TODO.md)
- **Verifikation:** `npm test` läuft grün (134/134 Tests)
- **Abgrenzung:** Die in `TODO.md` bereits dokumentierten offenen Punkte 17 (Shadow-Härtung) und 19 (ESLint) werden hier nicht erneut ausgearbeitet, sondern nur referenziert. Alle übrigen Findings sind neu.

**Prioritäten:** 🔴 Hoch (Fehler mit Daten-/Prozessrisiko) · 🟠 Mittel (spürbare Fehler, Inkonsistenzen, Performance) · 🟡 Niedrig (Härtung, Best Practices, Kleinigkeiten)

---

## Zusammenfassung

Die Codebasis ist für ein Projekt dieser Größe ungewöhnlich gut strukturiert: klare Feature-Trennung (`core`/`edit`/`compare`/`doublepane`/`preview`), konsequent extrahierte pure Kerne (`resolve.ts`, `trackChangesEngine.ts`, `build.ts`, `diff.ts`) mit guter Testabdeckung ohne Extension-Host, eine einzige Marker-Quelle (`core/markers.ts`) und ausführliche, meist akkurate Doku. Sicherheitskritisches ist solide gelöst (`execFile` statt Shell, Größen-Guard im Diff, Re-Entrancy-Guards pro Dokument).

Die wichtigsten Schwachstellen: **CI führt keine Tests aus** (F1), ein **Race zwischen Debounce-Cache und Accept/Reject kann Text korrumpieren** (F2), und der **Normal-Mode-Hook läuft ungebremst bei jedem Tastendruck in jedem Dokument** (F3). Dazu kommen mehrere mittlere Konsistenz- und Qualitätspunkte sowie eine Reihe von Härtungs-Empfehlungen.

| Prio | Anzahl | IDs |
|---|---|---|
| 🔴 Hoch | 2 | F1, F2 |
| 🟠 Mittel | 5 | F3–F7 |
| 🟡 Niedrig | 10 | F8–F17 |

---

## 🔴 Hoch

### F1 — CI führt niemals Tests aus
**Kategorie:** Prozess / Best Practice
**Dateien:** [.github/workflows/build.yml](.github/workflows/build.yml), [.github/workflows/docs.yml](.github/workflows/docs.yml)

Beide Workflows triggern ausschließlich auf Tag-Pushes (`v*`). Es gibt **keinen CI-Lauf für Pushes oder Pull Requests**, und selbst der Release-Workflow ruft nur `npm run compile` auf — `npm test` wird nirgends ausgeführt. Die 134 Tests existieren also nur lokal; ein Commit, der die Suite bricht, fällt erst auf, wenn jemand lokal testet. Für ein Projekt, das aktiv über PRs entwickelt wird (siehe Merge-Historie #42/#44/#49), ist das die größte Prozesslücke.

**Empfehlung (actionable):**
1. Neuen Workflow `ci.yml` anlegen: `on: [push, pull_request]`, Steps `npm ci` → `npm test` (kompiliert implizit mit).
2. Im Release-Workflow `npm run compile` durch `npm test` ersetzen, damit kein Release aus einem roten Stand gebaut werden kann.
3. Sobald TODO 19 (ESLint) umgesetzt ist, `npm run lint` in denselben Workflow aufnehmen.

### F2 — Accept/Reject auf veraltetem Cache kann Dokumenttext korrumpieren
**Kategorie:** Fehler (Race Condition)
**Dateien:** [src/edit/commands.ts](src/edit/commands.ts):265–277, 293–306; [src/edit/decorator.ts](src/edit/decorator.ts):58–67

`applyAt`/`applyAll` lesen die Änderungen aus dem Decorator-Cache (`dm.getChanges`). Dieser Cache wird aber nur **debounced** aktualisiert (Default 150 ms, konfigurierbar auch höher). Tippt der Nutzer und drückt innerhalb des Debounce-Fensters `Alt+A`/`Alt+R` (oder klickt eine CodeLens), enthält der Cache noch die **Ranges von vor dem Tastendruck**. Liegt die Eingabe vor einem Marker, sind alle nachfolgenden `fullRange`-Offsets verschoben — der `WorkspaceEdit` ersetzt dann einen falschen Textbereich und beschädigt das Dokument still. Je größer `kaicrit.edit.decorationDebounce` konfiguriert ist, desto größer das Fenster.

**Empfehlung (actionable):**
1. Beim Parsen den rohen Marker-Text (`match[0]`) als `raw` im `CriticChange` mitführen.
2. In `addResolution` (bzw. vor dem `applyEdit`) validieren: `editor.document.getText(change.fullRange) === change.raw`. Bei Abweichung statt zu schreiben `dm.update(editor)` aufrufen, die Änderung über `findAtCursor` neu suchen und erst dann auflösen (oder den Vorgang mit Statusbar-Hinweis abbrechen).
3. Alternativ/zusätzlich: In `applyAt`/`applyAll` bei anstehendem Debounce-Timer (`timers.has(key)`) zuerst synchron `dm.update(editor)` ausführen — der Mechanismus existiert bereits für den umgekehrten Fall (Update nach Resolution).

---

## 🟠 Mittel

### F3 — `handleNormalMode` läuft ungebremst bei jedem Tastendruck in jedem Dokument
**Kategorie:** Performance / Konsistenz
**Dateien:** [src/edit/trackChanges.ts](src/edit/trackChanges.ts):148–150, 222–300; [src/extension.ts](src/extension.ts):97–102

`tcm.handleChange` hängt am globalen `onDidChangeTextDocument`. Für jedes Dokument ohne Track Changes (also den Normalfall, Default `preventNestingOnPaste: true`) läuft `handleNormalMode` — und das ist **nicht** durch den `EnablementManager` gegattet und hat **keinen** Cheap-Early-Out wie der Parser (`indexOf('{')`). Pro Tastendruck in *jedem* Dokument (auch große Quelldateien, Logs, JSON …) passiert: Config-Read, `event.document.getText()` (vollständige Kopie), Rekonstruktion des Prä-Texts über String-Slices (weitere Kopien) und ein Marker-Regex-Scan bis zum Edit-Offset. Das ist die teuerste Operation auf dem heißesten Pfad der Extension — und sie kann nur dann überhaupt etwas bewirken, wenn der eingefügte Text einen kompletten Marker enthält.

Zudem eine Design-Inkonsistenz: Laut Architektur sollen *alle* Editor-Features über `EnablementManager` inert gehen, der Paste-Flatten greift aber auch in deaktivierten Dokumenten ein (z. B. beim Editieren einer Code-Datei, die zufällig CriticMarkup-Syntax in Fixtures/Strings enthält).

**Empfehlung (actionable):**
1. Früh in `handleNormalMode` abbrechen, wenn keine der `contentChanges` einen Marker enthalten kann: `if (!event.contentChanges.some(c => c.text.includes('{')))` — `flattenInnerMarkers` kann ohne kompletten Marker im eingefügten Text nie Edits liefern. Das eliminiert die Kosten für normales Tippen vollständig.
2. `TrackChangesManager` ein `isEnabled`-Prädikat geben (wie `DecoratorManager`/`CriticCodeLensProvider`) und `handleNormalMode` für deaktivierte Dokumente überspringen.
3. Den Config-Read hinter den Cheap-Check ziehen.

### F4 — Track Changes ist nicht an die Enablement-Logik gekoppelt
**Kategorie:** Inkonsistenz / UX
**Dateien:** [src/edit/commands.ts](src/edit/commands.ts):45–48; [src/edit/trackChanges.ts](src/edit/trackChanges.ts)

`kaicrit.toggleTrackChanges` und `applyDefault` prüfen `em.isEnabled(doc)` nicht. In einem per Sprach-Whitelist oder `$(eye)`-Toggle deaktivierten Dokument kann der Nutzer Track Changes einschalten: Der Recorder wickelt dann jeden Edit in Marker, aber Decorations, Statusbar, Sidebar, CodeLens und Accept/Reject bleiben inert (leerer Parse). Ergebnis: unsichtbare, nicht auflösbare Marker im Text — für den Nutzer wirkt das wie Textmüll.

**Empfehlung:** Beim Toggle in einem deaktivierten Dokument entweder (a) ablehnen mit Statusbar-Hinweis („kaicrit ist für diese Datei deaktiviert"), oder (b) das Dokument implizit per Override aktivieren (`em.toggle`) — Variante (b) ist vermutlich die erwartete Geste. `applyDefault` sollte nur für aktivierte Dokumente greifen.

### F5 — Word-Tokenizer ist nicht Unicode-fähig (deutsche Texte!)
**Kategorie:** Qualität / Fehler im Kernanwendungsfall
**Datei:** [src/compare/diff.ts](src/compare/diff.ts):54

Die `word`-Granularität nutzt `/\w+|\s+|[^\w\s]/g`. `\w` ist ASCII-only: Umlaute, ß und alle akzentuierten Buchstaben fallen in die Einzelzeichen-Klasse `[^\w\s]`. „schön" tokenisiert als `sch`·`ö`·`n`, „Müller" als `M`·`ü`·`ller`. Für deutschsprachige Prosa (die primäre Zielgruppe, siehe deutschsprachige Doku) erzeugt der Diff dadurch unnötig fragmentierte, schwer lesbare Substitutionen mitten in Wörtern — die `word`-Granularität verhält sich faktisch wie eine Mischform.

**Empfehlung:** Unicode-Property-Klassen verwenden (Target ES2020 unterstützt das):
```ts
return text.match(/[\p{L}\p{N}_]+|\s+|[^\p{L}\p{N}_\s]/gu) ?? [];
```
Tests mit Umlaut-Wörtern ergänzen (`diff.test.ts`). Die Rekonstruktions-Invariante bleibt unberührt (Tokens bleiben verlustfrei konkatenierbar).

### F6 — Splitansicht desselben Dokuments: nur ein Editor wird dekoriert
**Kategorie:** Fehler (UI)
**Datei:** [src/edit/decorator.ts](src/edit/decorator.ts):62–66; [src/extension.ts](src/extension.ts):90–96

`scheduleUpdate` sucht nach Ablauf des Timers mit `visibleTextEditors.find(...)` genau **einen** Editor zum Dokument und ruft `update(editor)` nur für diesen auf. Ist dieselbe Datei in zwei Panes geöffnet (Split-Editing ist beim Review-Workflow naheliegend), bekommt nur eine Pane frische Decorations; die andere zeigt veraltete Markierungen, bis sie den Fokus erhält. Der `em.onDidChange`-Pfad macht es richtig (iteriert alle sichtbaren Editoren).

**Empfehlung:** In `scheduleUpdate` (und ggf. `update`) alle passenden Editoren behandeln: `visibleTextEditors.filter(e => e.document === doc)`, einmal parsen, Decorations auf jeden Editor anwenden. Der Cache ist ohnehin pro Dokument, nur `applyDecorations` muss pro Editor laufen.

### F7 — Sidebar-Gruppierungs-Toggle schreibt stur in den Global-Scope
**Kategorie:** Fehler (Konfiguration)
**Datei:** [src/extension.ts](src/extension.ts):70–75

`setGrouping` schreibt `kaicrit.changes.grouping` immer mit `ConfigurationTarget.Global`. Hat der Nutzer das Setting auf Workspace-Ebene gesetzt (z. B. via `.vscode/settings.json`), überdeckt der Workspace-Wert den geschriebenen Global-Wert — der Toggle-Button in der Changes-View ist dann wirkungslos (Klick ohne sichtbaren Effekt, Button wechselt nicht).

**Empfehlung:** Vor dem Schreiben mit `config.inspect('changes.grouping')` prüfen, in welchem Scope ein Wert definiert ist, und in genau diesen Scope schreiben (Fallback: Global). Das ist das übliche Muster für UI-Toggles, die Settings spiegeln.

---

## 🟡 Niedrig

### F8 — Kommentar-Datum nutzt UTC statt lokaler Zeit
**Datei:** [src/edit/commands.ts](src/edit/commands.ts):172–174

`isoToday()` = `new Date().toISOString().slice(0, 10)` liefert das UTC-Datum. Östlich von UTC (z. B. Deutschland abends) stempelt `insertComment` damit das **gestrige** Datum in die Metadaten. Empfehlung: lokal formatieren, z. B. über `getFullYear`/`getMonth`/`getDate` oder `new Intl.DateTimeFormat('sv-SE').format(new Date())`.

### F9 — Caret-Korrektur läuft auch nach fehlgeschlagenem Edit
**Datei:** [src/edit/commands.ts](src/edit/commands.ts):108–124, 193–211

`wrapSelection` und `insertSubstitution` ignorieren in `.then(...)` den `applied`-Boolean von `applyAuthoringEdit`. Schlägt `editor.edit` fehl (z. B. Read-only-Dokument), werden die Selektionen trotzdem um `close.length` nach links verschoben — der Cursor springt grundlos. Empfehlung: `.then(applied => { if (!applied) return; … })`.

### F10 — Git-Autor-Lookup ignoriert Multi-Root-Workspaces
**Datei:** [src/edit/commands.ts](src/edit/commands.ts):152–170

`resolveAuthor` nimmt immer `workspaceFolders[0]`, obwohl das aktive Dokument in einem anderen Folder (mit anderem `git config user.name`) liegen kann; der Kommentar „per-workspace-folder-cached" suggeriert mehr, als der Code tut. Empfehlung: `vscode.workspace.getWorkspaceFolder(doc.uri)` verwenden (Dokument-URI bis `insertComment` durchreichen).

### F11 — Konfigurations-Reads ohne Resource-Scope
**Dateien:** [src/edit/enablement.ts](src/edit/enablement.ts):48–51, [src/edit/parser.ts](src/edit/parser.ts):22–24, [src/edit/decorator.ts](src/edit/decorator.ts):72–77, [src/edit/trackChanges.ts](src/edit/trackChanges.ts):235–237, [src/compare/compare.ts](src/compare/compare.ts):16

Alle `getConfiguration('kaicrit')`-Aufrufe erfolgen ohne Scope-URI. Folder- oder sprachspezifische Overrides (`[markdown]: { … }`, Multi-Root) werden dadurch nicht berücksichtigt. Empfehlung: wo ein Dokument verfügbar ist, `getConfiguration('kaicrit', doc)` verwenden — besonders relevant für `enabledLanguages` und `commentMetadata`.

### F12 — Hover-`isTrusted = true` breiter als nötig; Markdown-Injection im Kommentar-Hover
**Kategorie:** Security-Härtung
**Dateien:** [src/edit/hover.ts](src/edit/hover.ts):37–40; [src/edit/decorator.ts](src/edit/decorator.ts):188–194

Zwei verwandte Punkte:
1. Der Accept/Reject-Hover setzt `md.isTrusted = true` und erlaubt damit **alle** Commands als `command:`-Links. Der Inhalt ist zwar selbst generiert, aber Defense-in-Depth ist billig: `md.isTrusted = { enabledCommands: ['kaicrit.acceptChangeAt', 'kaicrit.rejectChangeAt'] }`.
2. `commentHover` interpoliert `author`/`date` **aus dem Dokumentinhalt** ungeschützt in einen `MarkdownString`. `@(\S+)` lässt z. B. `@[Name](https://evil.example)` als Autor zu — der Hover rendert dann einen klickbaren Link aus fremdem Dokumentinhalt (relevant bei geteilten, von Dritten annotierten Dateien; Command-URIs bleiben durch `isTrusted`-Default blockiert, Web-Links nicht). Empfehlung: Markdown-Sonderzeichen escapen oder den Hover als Plaintext bauen.

### F13 — Marker-Scan ohne Größen-Guard: quadratisches Verhalten bei pathologischem Input
**Dateien:** [src/core/markers.ts](src/core/markers.ts):30–31, [src/edit/parser.ts](src/edit/parser.ts)

`RE_ALL` scannt bei jedem unvollständigen Opener (`{--` ohne Closer) lazy bis zum Dokumentende. Ein Dokument mit vielen unabgeschlossenen Openern (z. B. 100 k × `{--`) kostet O(n²) und kann den Extension-Host pro (debounced) Parse einfrieren — dieselbe Klasse Selbst-DoS, gegen die der Compare bereits `maxDiffTokens` hat (TODO 10). Eintrittswahrscheinlichkeit gering, aber der Fix ist klein. Empfehlung: im Parser eine Dokumentgrößen-Obergrenze (Setting, analog `maxDiffTokens`) oder einen Zähler unabgeschlossener Opener als Abbruchkriterium einziehen; oberhalb der Grenze Decorations deaktivieren statt zu parsen.

### F14 — `.vscodeignore`-Lücken: Paket enthält Unnötiges
**Datei:** [.vscodeignore](.vscodeignore)

Nicht ausgeschlossen und damit Teil der `.vsix`: `manual_testing/**` (inkl. Beispiel-Dateien), `assets/**` (Logo-Duplikat; das Manifest-Icon liegt unter `images/`), `TODO.md`, `DEVELOPER.md`, `.claude/**` sowie `out/edit/vscodeStub.js` (Test-Infrastruktur, matcht nicht `*.test.js`). Empfehlung: diese Pfade ergänzen; danach mit `npx @vscode/vsce ls` den Paketinhalt verifizieren.

### F15 — Kein Bundling
**Dateien:** [package.json](package.json), Build-Setup

Die Extension shippt ~30 einzelne JS-Module aus `out/`. VS-Code-Best-Practice ist ein Bundle (esbuild), was Startzeit und Paketgröße verbessert und `vsce`-Warnungen vermeidet. Aufwand gering (keine Runtime-Dependencies, `vscode` als external). Empfehlung: esbuild-Script für `vscode:prepublish`, `tsc` weiterhin für Typprüfung und Tests.

### F16 — Doku-Inkonsistenzen rund um `vsce`
**Dateien:** [CLAUDE.md](CLAUDE.md), [DEVELOPER.md](DEVELOPER.md):557, [.github/workflows/build.yml](.github/workflows/build.yml):25

CLAUDE.md und DEVELOPER.md empfehlen `npx vsce package` — das `vsce`-npm-Paket ist deprecated; die CI nutzt korrekt `@vscode/vsce`. CLAUDE.md beschreibt zudem `vsce package --version <tag>`, die CI übergibt die Version positional. Empfehlung: Doku auf `npx @vscode/vsce package` vereinheitlichen.

### F17 — `npm test` ohne Clean: verwaiste Testdateien in `out/` laufen weiter
**Datei:** [package.json](package.json):613

`tsc` räumt `out/` nicht auf. Wird eine `*.test.ts` umbenannt oder gelöscht, bleibt die alte `out/**/*.test.js` liegen und wird von den Globs weiterhin ausgeführt — im schlimmsten Fall testet sie gelöschtes Verhalten grün. Empfehlung: `"pretest": "rm -rf out"` (bzw. `rimraf` für Windows-Kompatibilität) oder `tsc --build --clean` vor dem Compile.

---

## Bereits bekannt (offen in TODO.md — hier nur referenziert)

- **TODO 17:** Track-Changes-`shadow` gegen externe Mutationen härten (Konsistenzprüfung vor `computeTrackChanges`). Einschätzung aus diesem Review: weiterhin gültig, Priorität Niedrig.
- **TODO 19:** ESLint-Setup. Einschätzung: gewinnt durch F1 an Wert (Lint als CI-Step), Priorität Mittel statt Niedrig, sobald CI existiert.

## Positivbefunde (beibehalten)

- Konsequente Trennung pure Logik ↔ VS-Code-Wrapper; dadurch 134 hostfreie Tests, die echte Regressionen (#34/#38/#40/#42/#44) abdecken.
- `execFile` mit Argument-Array statt Shell für den Git-Lookup (keine Injection-Fläche), mit Timeout und Cache.
- Per-Dokument-Re-Entrancy-Guard mit Release in Erfolgs- **und** Fehlerpfad — sauber gegen Wedging.
- `maxDiffTokens`-Guard mit automatischem Fallback auf `line`-Granularität verhindert Selbst-DoS im Compare.
- Atomare `WorkspaceEdit`s für `acceptAll`/`rejectAll` (keine Offset-Drift).
- Doku (CLAUDE.md/DEVELOPER.md/docs/) ist außergewöhnlich detailliert und beim Stichproben-Abgleich fast durchgehend deckungsgleich mit dem Code.

## Empfohlene Reihenfolge der Umsetzung

1. **F1** (CI mit Tests) — kleinster Aufwand, größter Prozessgewinn; Voraussetzung, um alle weiteren Fixes abgesichert zu landen.
2. **F2** (Stale-Cache-Validierung) — einziges Finding mit Datenverlust-Potenzial.
3. **F3 + F4** (Normal-Mode-Early-Out + Enablement-Kopplung) — gehören zusammen, gleiche Stelle.
4. **F5** (Unicode-Tokenizer) — kleiner Fix, direkt sichtbare Qualitätsverbesserung für den Kernanwendungsfall.
5. **F6, F7** — eng umrissene UI-Fixes.
6. **F8–F17** nach Gelegenheit, F12/F13 bevorzugt vor einer Marketplace-Veröffentlichung.
