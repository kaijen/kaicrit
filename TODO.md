# TODO – Geplante Erweiterungen für kaicrit

Diese Liste enthält ausgearbeitete, einzeln umsetzbare Aufgaben. Jede Aufgabe ist
in sich abgeschlossen und kann in einer eigenen Session / einem eigenen Commit
erledigt werden. Die Reihenfolge ist so gewählt, dass spätere Aufgaben auf den
Mustern und Hilfsfunktionen früherer aufbauen – von risikoarmen, kleinen
Erweiterungen hin zu größeren Features.

**Konventionen für alle Aufgaben**

- Nach jeder Code-Änderung die betroffene Doku aktualisieren (`README.md`,
  passende Datei unter `docs/`, sowie `CLAUDE.md`-Architekturnotizen + Checkliste).
- Neue Befehle in `contributes.commands`, neue Farben in `contributes.colors`,
  neue Settings unter `contributes.configuration` in [package.json](package.json)
  eintragen.
- Der einheitliche Marker-Wortschatz lebt in [src/core/markers.ts](src/core/markers.ts)
  und [src/core/types.ts](src/core/types.ts) – nicht duplizieren, sondern wiederverwenden.
- `npm run compile` muss fehlerfrei durchlaufen, `npm test` grün bleiben.

---

## 1. Statusbar-Statistik der offenen Änderungen ✅ erledigt

**Ziel:** Ein Eintrag in der VSCode-Statusleiste, der die Anzahl der CriticMarkup-Änderungen
im aktiven Editor nach Typ anzeigt, z. B. `⊟3 ⊞5 ⇄2 ☰1 💬4`
(Deletions / Additions / Substitutions / Highlights / Comments).

**Warum zuerst:** Kleinste sinnvolle Erweiterung, nutzt den bestehenden Parser
unverändert und etabliert das Muster „auf Parser-Ergebnis reagieren", auf dem
spätere Aufgaben (Sidebar, CodeLens) aufbauen.

**Betroffene Dateien**
- Neu: `src/edit/statusBar.ts` – `StatusBarManager` mit `vscode.window.createStatusBarItem`.
- [src/extension.ts](src/extension.ts) – Manager instanziieren, an die bestehenden
  Editor-/Dokument-Listener hängen, zu `context.subscriptions` hinzufügen.
- Wiederverwenden: `parseCriticMarkup(doc)` aus [src/edit/parser.ts](src/edit/parser.ts)
  (idealerweise den bereits im `DecoratorManager` vorhandenen Change-Cache nutzen,
  statt erneut zu parsen).

**Umsetzungsschritte**
1. Statusbar-Item (Alignment `Left`, niedrige Priorität) erstellen.
2. Bei aktivem Editor-Wechsel und Dokument-Änderung (debounced, analog Decorator)
   die Changes zählen und Text setzen.
3. Item nur anzeigen, wenn ≥ 1 Änderung vorhanden ist (sonst `hide()`).
4. Klick auf das Item führt `kaicrit.firstChange` aus (`command`-Property setzen).
5. Bei Dokumenten ohne unterstützte Sprache / leerem Editor ausblenden.

**Akzeptanzkriterien**
- Zahlen aktualisieren sich live beim Tippen/Einfügen/Auflösen.
- Kein Item bei Dokumenten ohne Änderungen.
- Keine zusätzlichen Vollscans, wenn der Decorator-Cache wiederverwendet wird.

**Doku:** README-Feature-Liste; ggf. kurzer Absatz in `docs/index.md`.

---

## 2. Änderungen im Overview-Ruler / in der Minimap markieren ✅ erledigt

**Ziel:** Farbige Marker am Scrollbalken (Overview Ruler), die zeigen, wo im
Dokument Änderungen liegen – Überblick ohne Scrollen.

**Warum hier:** Reine Erweiterung des bestehenden `DecoratorManager`, keine neue
Infrastruktur. Logische Fortsetzung von Aufgabe 1 (beides „Sichtbarkeit").

**Betroffene Dateien**
- [src/edit/decorator.ts](src/edit/decorator.ts) – bei den `TextEditorDecorationType`s
  jeweils `overviewRulerColor` und `overviewRulerLane` ergänzen.
- [package.json](package.json) – bestehende `kaicrit.*Foreground`-Farben werden
  wiederverwendet; falls separat steuerbar gewünscht, neue Farb-IDs ergänzen.

**Umsetzungsschritte**
1. Pro Änderungstyp `overviewRulerColor` (passende `ThemeColor`) und
   `overviewRulerLane` (z. B. `Right`) in den Decoration-Optionen setzen.
2. Substitution: alten und neuen Teil sinnvoll abbilden (eine Lane genügt).
3. Marker-Dimmung (opacity-0.4-Typ) **nicht** im Ruler anzeigen.

**Akzeptanzkriterien**
- Marker erscheinen im Overview-Ruler an den korrekten Zeilen.
- Farben folgen dem aktiven Theme bzw. den bestehenden `kaicrit.*`-Farben.

**Doku:** README-Abschnitt zu Decorations/Farben; `docs/markup.md`.

---

## 3. Mehrzeilige Kommentare im Preview robust rendern ✅ erledigt

**Ziel:** Sicherstellen, dass Kommentare `{>>…<<}` mit Zeilenumbrüchen im
Markdown-Preview sauber und vollständig dargestellt werden.

**Warum hier:** Kleiner, abgegrenzter Robustheits-Fix im Preview-Bereich. Schafft
eine verlässliche Basis, bevor in Aufgabe 5 die Kommentar-Semantik erweitert wird.

**Betroffene Dateien**
- [src/preview/markdownIt.ts](src/preview/markdownIt.ts) – Tokenizer-Logik für den
  Comment-Span; Verhalten bei eingebetteten Zeilenumbrüchen prüfen.
- [media/critic.css](media/critic.css) – ggf. `white-space`/Block-Darstellung der
  `.critic-comment`-Klasse anpassen.
- Test (siehe Aufgabe 9): Mehrzeilen-Kommentar als Rendering-Fall aufnehmen.

**Umsetzungsschritte**
1. Reproduzieren: Dokument mit `{>>Zeile1\nZeile2<<}` im Preview prüfen
   (aktuelles Verhalten dokumentieren).
2. Falls der Inline-Tokenizer am Zeilenumbruch abbricht: Tokenizer so anpassen,
   dass der gesamte Span bis `<<}` erfasst wird (analog zur Behandlung anderer Typen).
3. CSS so wählen, dass mehrzeiliger Kommentartext lesbar bleibt (kein Abschneiden).
4. Geschachteltes Markdown im Kommentar weiterhin korrekt rendern.

**Akzeptanzkriterien**
- Mehrzeilige Kommentare erscheinen vollständig und korrekt formatiert im Preview.
- Einzeilige Kommentare und andere Typen bleiben unverändert.

**Doku:** `docs/preview.md` (Hinweis zu mehrzeiligen Kommentaren).

---

## 4. Inline-Aktionen via CodeLens ✅ erledigt

**Ziel:** Über jeder Änderung erscheinen klickbare „Accept | Reject"-Aktionen
(CodeLens), sodass Auflösen ohne Tastenkürzel-Kenntnis möglich ist.

**Warum hier:** Nutzt die vorhandene Auflöse-Logik und den Parser. Mittlerer
Aufwand, stark verbesserte Auffindbarkeit der Funktionen; bereitet die
Inline-Aktionen vor, die später auch die Sidebar (Aufgabe 6) verwendet.

**Betroffene Dateien**
- Neu: `src/edit/codeLens.ts` – `CriticCodeLensProvider implements vscode.CodeLensProvider`.
- [src/extension.ts](src/extension.ts) – Provider via `languages.registerCodeLensProvider`
  registrieren (sinnvolles `DocumentSelector`, z. B. `markdown`, `plaintext`, ggf. `*`).
- Wiederverwenden: `parseCriticMarkup`, vorhandene `kaicrit.acceptChange` /
  `kaicrit.rejectChange` (per Position als Argument), bzw. die `applyAtCursor`-Logik
  aus [src/edit/commands.ts](src/edit/commands.ts).
- [package.json](package.json) – Setting `kaicrit.edit.codeLens` (boolean, Default `true`)
  zum Ein-/Ausschalten.

**Umsetzungsschritte**
1. `provideCodeLenses(doc)` parst das Dokument und erzeugt pro Change eine
   `CodeLens` am Beginn der `fullRange`.
2. Pro Change zwei Commands (Accept / Reject), die an die vorhandene Auflöse-Logik
   delegieren (Position/Range als Argument übergeben).
3. `onDidChangeCodeLenses`-Event bei Dokument-Änderungen feuern (debounced).
4. Setting `kaicrit.edit.codeLens` respektieren; bei `false` keine Lenses liefern.

**Akzeptanzkriterien**
- Über jeder Änderung erscheinen „Accept"/„Reject"; Klick löst genau diese Änderung auf.
- Lenses verschwinden/aktualisieren nach Auflösung.
- Per Setting abschaltbar.

**Doku:** README (Edit-Feature) + `docs/markup.md`; Setting in `docs/`-Settings-Tabelle.

---

## 5. Kommentar-Metadaten (Autor & Datum)

**Ziel:** Kommentare optional mit Autor und Datum versehen, z. B.
`{>>@kai 2026-05-31: Text<<}`, und diese Metadaten in Editor-Hover und Preview
gesondert anzeigen.

**Warum hier:** Erweitert die Kommentar-Semantik (Parser + Preview + Decorator).
Sollte nach dem Preview-Fix (Aufgabe 3) und vor der Sidebar (Aufgabe 6) erfolgen,
damit die Übersicht die Metadaten direkt mit anzeigen kann.

> Hinweis: Dies erweitert den CriticMarkup-Standard um eine Konvention. Die
> Konvention muss rückwärtskompatibel sein – ein Kommentar **ohne** Metadaten
> muss weiterhin als reiner Kommentar gelten.

**Betroffene Dateien**
- [src/core/types.ts](src/core/types.ts) – `CriticChange` um optionale Felder
  `author?` / `date?` ergänzen.
- [src/edit/parser.ts](src/edit/parser.ts) – Kommentarinhalt optional in
  `@author`, `date:` und Resttext zerlegen (z. B. via Zusatz-Regex auf den Inhalt).
- [src/edit/decorator.ts](src/edit/decorator.ts) – Hover-Message mit Autor/Datum
  (über `DecorationOptions.hoverMessage`).
- [src/preview/markdownIt.ts](src/preview/markdownIt.ts) + [media/critic.css](media/critic.css)
  – Autor/Datum im Comment-Span gesondert auszeichnen.
- Wiederverwenden: Autor-Default aus `git config user.name` bzw. der Insert-Befehl
  in [src/edit/commands.ts](src/edit/commands.ts) (`insertComment` füllt Metadaten vor).

**Umsetzungsschritte**
1. Konvention festlegen und in `docs/markup.md` dokumentieren (Format, Optionalität).
2. Parser: Metadaten aus dem Kommentarinhalt extrahieren, ohne andere Typen zu berühren.
3. `insertComment` erweitern: aktuelles Datum + Autor (Git/Setting) optional vorbefüllen.
4. Hover und Preview-Darstellung umsetzen.
5. Tests (Aufgabe 9): Kommentare mit/ohne Metadaten abdecken.

**Akzeptanzkriterien**
- Kommentare ohne Metadaten verhalten sich exakt wie bisher.
- Mit Metadaten werden Autor/Datum erkannt und in Hover + Preview angezeigt.
- Accept/Reject (Kommentar entfernen) funktioniert unverändert.

**Doku:** `docs/markup.md`, README (Comment-Beschreibung), `CLAUDE.md` (CriticChange-Felder).

---

## 6. Sidebar-Übersicht aller Änderungen (Tree View)

**Ziel:** Eine eigene View im Explorer/Activity-Bar, die alle Änderungen des
aktiven Dokuments auflistet – gruppiert nach Typ, klickbar zum Anspringen,
mit Inline-Aktionen für Accept/Reject.

**Warum hier:** Größtes UI-Feature der „Edit"-Seite; profitiert von Parser-Nutzung,
den Inline-Aktionen aus Aufgabe 4, einem Zähl-Helfer aus Aufgabe 1 und den
Metadaten aus Aufgabe 5.

**Betroffene Dateien**
- Neu: `src/edit/changesView.ts` – `ChangesTreeProvider implements vscode.TreeDataProvider<…>`.
- [src/extension.ts](src/extension.ts) – `window.registerTreeDataProvider` /
  `window.createTreeView`, Listener für aktiven Editor und Dokument-Änderungen.
- [package.json](package.json) – `contributes.views` (+ optional eigener
  `viewsContainers`-Activity-Bar-Eintrag), `contributes.menus` für
  `view/item/context` (Accept/Reject) und `view/title` (Accept-All/Reject-All).
- Wiederverwenden: `parseCriticMarkup`, `revealChange` aus
  [src/edit/navigator.ts](src/edit/navigator.ts), `ChangeType`.

**Umsetzungsschritte**
1. Baumstruktur: Top-Level je Typ (mit Count), Kinder = einzelne Änderungen
   (Label = gekürzter Inhalt, Description = Zeilennummer; bei Kommentaren Autor/Datum).
2. `command` je Blatt → springt zur Änderung (`revealChange` / `revealRange`).
3. Inline-Item-Buttons (Icons) für Accept/Reject, delegiert an vorhandene Befehle.
4. `onDidChangeTreeData` bei aktivem Editor-Wechsel und Dokument-Änderung feuern (debounced).
5. Leerzustand sinnvoll behandeln (Welcome-View-Text via `viewsWelcome`).

**Akzeptanzkriterien**
- View spiegelt das aktive Dokument live wider.
- Klick auf Eintrag scrollt zur korrekten Stelle und selektiert sie.
- Inline-Accept/Reject funktioniert und aktualisiert die View.

**Doku:** README (neuer Abschnitt „Übersicht"), neue Datei `docs/overview.md`,
`CLAUDE.md`-Architektur (`src/edit/`-Tabelle erweitern).

---

## 7. Compare-Optionen erweitern

**Ziel:** Den Datei-Vergleich praxistauglicher machen mit (a) „Whitespace ignorieren",
(b) Vergleich der aktiven Datei gegen ihren Git-HEAD-Stand.

**Warum hier:** Eigener Feature-Bereich (`src/compare/`), unabhängig von den
Edit-Aufgaben; sinnvoll, sobald die Edit-Seite ausgereift ist.

**Betroffene Dateien**
- [src/compare/diff.ts](src/compare/diff.ts) – optionales „ignore whitespace"
  in Tokenisierung/Vergleich (Whitespace-Token beim Matching ignorieren, aber
  für die Rekonstruktion erhalten).
- [src/compare/compare.ts](src/compare/compare.ts) – Setting lesen und durchreichen.
- [src/compare/commands.ts](src/compare/commands.ts) – neuer Befehl
  `kaicrit.compareWithGitHead` (aktive Datei vs. HEAD-Inhalt).
- [package.json](package.json) – Setting `kaicrit.compare.ignoreWhitespace`
  (boolean, Default `false`); neuer Befehl + Menü-/Palette-Eintrag.

**Umsetzungsschritte**
1. `ignoreWhitespace`-Pfad in `diff()` ergänzen, **ohne** die
   Reconstruction-Invariante zu brechen (Tests in
   [src/compare/diff.test.ts](src/compare/diff.test.ts) entsprechend erweitern).
2. Git-HEAD-Inhalt über die eingebaute Git-Extension-API
   (`vscode.extensions.getExtension('vscode.git')`) beziehen; Fallback/Fehlermeldung,
   wenn Datei nicht in Git ist.
3. Ergebnis wie gehabt als untitled-Dokument öffnen (Sprache aus Setting).

**Akzeptanzkriterien**
- Bei aktivem „ignoreWhitespace" werden reine Whitespace-Unterschiede nicht als
  Änderung markiert; `acceptAll`/`rejectAll` rekonstruieren weiterhin korrekt.
- Git-HEAD-Vergleich erzeugt korrektes CriticMarkup gegen den committeten Stand.
- Bestehende Compare-Tests bleiben grün; neue Tests decken beide Optionen ab.

**Doku:** README (Compare-Settings-Tabelle), `docs/compare.md`.

---

## 8. Live-„Track-Changes"-Modus (Annotate)

**Ziel:** Ein umschaltbarer Modus, in dem Bearbeitungen am Dokument automatisch
als CriticMarkup festgehalten werden (Löschungen → `{--…--}`, Einfügungen →
`{++…++}`, Ersetzungen → `{~~…~>…~~}`), statt den Text direkt zu überschreiben –
analog zu „Änderungen nachverfolgen" in Textverarbeitungen.

**Warum hier (spät):** Größter und risikoreichster Umfang; greift tief in das
Editier-Verhalten ein. Profitiert von allen vorherigen Bausteinen (Parser,
Sichtbarkeit, Übersicht) und sollte erst nach deren Stabilisierung angegangen werden.

> Hinweis: Vor der Umsetzung ein kurzes Design-Dokument anlegen (Verhalten bei
> Mehrfach-Cursor, Undo/Redo, Einfügen mitten in bestehende Marker, Performance).

**Betroffene Dateien**
- Neu: `src/edit/trackChanges.ts` – Listener auf `workspace.onDidChangeTextDocument`,
  der Roh-Edits in CriticMarkup-Edits umwandelt (mit Re-Entrancy-Schutz, um die
  eigenen Edits nicht erneut zu verarbeiten).
- [src/edit/commands.ts](src/edit/commands.ts) – Toggle-Befehl `kaicrit.toggleTrackChanges`.
- [src/extension.ts](src/extension.ts) – Modus-Zustand verwalten und Listener
  bedingt aktivieren.
- [package.json](package.json) – Befehl, Statusbar-/Context-Key für den Modus,
  Setting `kaicrit.edit.trackChanges` (Default `false`).
- Wiederverwenden: `MARKERS` aus [src/core/markers.ts](src/core/markers.ts),
  Parser zum Erkennen bestehender Marker an der Edit-Position.

**Umsetzungsschritte**
1. Design-Dokument + Entscheidungen festhalten.
2. Toggle-Befehl + sichtbarer Zustand (Statusbar/Context-Key) umsetzen.
3. `onDidChangeTextDocument` auswerten: Einfüge-/Lösch-/Ersetzungs-Edits in
   entsprechende Marker umwandeln; eigene programmgesteuerte Edits per Flag ausschließen.
4. Edit innerhalb/angrenzend an bestehende Marker sinnvoll zusammenführen.
5. Verhalten bei Undo/Redo prüfen; auf große Dateien/Performance achten.

**Akzeptanzkriterien**
- Bei aktivem Modus erzeugen normale Bearbeitungen korrekte CriticMarkup-Marker.
- Kein Doppelt-Verarbeiten der eigenen Edits; Undo bleibt nutzbar.
- Modus lässt sich verlässlich ein-/ausschalten; bei `off` normales Editieren.

**Doku:** README (neuer Abschnitt), neue Datei `docs/track-changes.md`,
`CLAUDE.md`-Architektur + Checkliste.

---

## 9. Tests für Edit & Preview

**Ziel:** Test-Abdeckung für die bisher ungetesteten Bereiche: Parser,
Navigator, Accept/Reject-Semantik und Preview-Rendering – inkl. der in
Aufgaben 3 und 5 ergänzten Kommentar-Fälle.

**Warum zuletzt:** Sinnvollerweise erst, wenn die neuen Features (Aufgaben 1–8)
das Verhalten von Befehlen/Logik finalisiert haben – so testet man den Zielzustand,
nicht ein Zwischenstadium. Härtet die Codebasis vor einem Release ab.

**Betroffene Dateien**
- Neu: `src/edit/parser.test.ts`, `src/edit/navigator.test.ts`,
  `src/preview/markdownIt.test.ts` (Node-`--test`-Stil wie unter `src/compare/`).
- Für die Accept/Reject-Semantik die reine Transformationslogik (String → String
  pro Typ) ggf. aus [src/edit/commands.ts](src/edit/commands.ts) in eine testbare,
  VSCode-API-freie Hilfsfunktion extrahieren.
- `package.json` `test`-Script ggf. auf weitere Verzeichnisse erweitern
  (z. B. `out/**/*.test.js`).

**Umsetzungsschritte**
1. Parser: alle 5 Typen, geschachtelte/aneinandergrenzende Marker, Substitution
   mit/ohne `~>`, Kommentare mit/ohne Metadaten, korrekte Offsets.
2. Navigator: findAtCursor/Next/Prev/First/Last inkl. Wrap-around-Grenzfälle.
3. Accept/Reject: Mapping je Typ gemäß Tabelle in `CLAUDE.md` (Deletion, Addition,
   Substitution, Highlight, Comment).
4. Preview: markdown-it-Plugin gegen `md.render(...)`-Strings prüfen
   (`<ins>`, `<del>`, `<mark>`, Comment-Span; geschachteltes + mehrzeiliges Markdown).
5. Wo VSCode-Typen (`Range`, `Position`) nötig sind: schlanke Fakes/Helfer nutzen,
   damit Tests ohne Extension-Host laufen.

**Akzeptanzkriterien**
- `npm test` führt die neuen Suites mit aus und ist grün.
- Edit-Logik und Preview-Rendering sind ohne laufenden Extension-Host testbar.

**Doku:** `CLAUDE.md` (Test-Abschnitt erweitern); ggf. Notiz im README zu `npm test`.

---

## Bewusst (vorerst) ausgeklammert

- **Selektives Accept/Reject nach Typ** (z. B. „alle Additions annehmen") – die
  bestehenden `acceptAll`/`rejectAll` decken den häufigsten Fall bereits ab; der
  zusätzliche Typ-Filter wurde auf Wunsch zurückgestellt und kann später leicht
  auf Basis der vorhandenen atomaren `WorkspaceEdit`-Logik ergänzt werden.
