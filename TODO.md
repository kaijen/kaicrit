# TODO – Geplante Erweiterungen für kaicrit

Diese Liste enthält ausgearbeitete, einzeln umsetzbare Aufgaben. Jede Aufgabe ist
in sich abgeschlossen und kann in einer eigenen Session / einem eigenen Commit
erledigt werden. Die Reihenfolge ist so gewählt, dass spätere Aufgaben auf den
Mustern und Hilfsfunktionen früherer aufbauen – von risikoarmen, kleinen
Erweiterungen hin zu größeren UI-Features.

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

## 1. Statusbar-Statistik der offenen Änderungen

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

## 2. Änderungen im Overview-Ruler / in der Minimap markieren

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

## 3. Selektives Accept/Reject nach Typ

**Ziel:** Befehle wie „Accept all Additions", „Reject all Deletions",
„Resolve all Comments" – also `acceptAll`/`rejectAll`, aber gefiltert auf einen Typ.

**Warum hier:** Baut direkt auf der vorhandenen atomaren `WorkspaceEdit`-Logik
in [src/edit/commands.ts](src/edit/commands.ts) auf; geringe Komplexität, hoher Nutzen.

**Betroffene Dateien**
- [src/edit/commands.ts](src/edit/commands.ts) – `applyAll()` so refaktorieren,
  dass es einen optionalen Typ-Filter (`ChangeType`) akzeptiert; neue Befehle registrieren.
- [package.json](package.json) – neue `contributes.commands`-Einträge (+ optional Keybindings/Menüs).
- Wiederverwenden: `ChangeType` aus [src/core/types.ts](src/core/types.ts).

**Umsetzungsschritte**
1. `applyAll(editor, mode, filter?)` einführen – `filter` schränkt auf einen Typ ein.
2. Befehle ergänzen: `kaicrit.acceptAllOfType` / `kaicrit.rejectAllOfType`.
   - Variante A (empfohlen): ein Befehl je Richtung, der per `showQuickPick`
     den Typ abfragt (kompakte Command-Palette).
   - Variante B: feste Befehle je Typ (mehr Einträge, schneller zugänglich).
3. Bestehende `acceptAll`/`rejectAll` rufen `applyAll` ohne Filter auf (kein Duplikat).
4. Statusmeldung „N Änderungen vom Typ X aufgelöst".

**Akzeptanzkriterien**
- Genau die Änderungen des gewählten Typs werden in **einem** `WorkspaceEdit` aufgelöst.
- Andere Typen bleiben unangetastet.
- Reconstruction-Verhalten bestehender Befehle unverändert.

**Doku:** README + `docs/markup.md` (Accept/Reject-Tabelle) + `docs/keybindings.md`.

---

## 4. Inline-Aktionen via CodeLens

**Ziel:** Über jeder Änderung erscheinen klickbare „Accept | Reject"-Aktionen
(CodeLens), sodass Auflösen ohne Tastenkürzel-Kenntnis möglich ist.

**Warum hier:** Nutzt die in Aufgabe 3 vereinheitlichte Auflöse-Logik und den
Parser. Mittlerer Aufwand, stark verbesserte Auffindbarkeit der Funktionen.

**Betroffene Dateien**
- Neu: `src/edit/codeLens.ts` – `CriticCodeLensProvider implements vscode.CodeLensProvider`.
- [src/extension.ts](src/extension.ts) – Provider via `languages.registerCodeLensProvider`
  registrieren (sinnvolles `DocumentSelector`, z. B. `markdown`, `plaintext`, ggf. `*`).
- Wiederverwenden: `parseCriticMarkup`, vorhandene `kaicrit.acceptChange` /
  `kaicrit.rejectChange` (per Position als Argument), bzw. die `applyAtCursor`-Logik.
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

## 5. Sidebar-Übersicht aller Änderungen (Tree View)

**Ziel:** Eine eigene View im Explorer/Activity-Bar, die alle Änderungen des
aktiven Dokuments auflistet – gruppiert nach Typ, klickbar zum Anspringen,
mit Inline-Aktionen für Accept/Reject.

**Warum hier:** Größtes UI-Feature; profitiert von allen vorigen Aufgaben
(Parser-Nutzung, vereinheitlichte Auflöse-Logik aus Aufgabe 3, ggf. Zähl-Helfer
aus Aufgabe 1).

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
   (Label = gekürzter Inhalt, Description = Zeilennummer).
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

## 6. Compare-Optionen erweitern

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

## 7. Tests für Edit & Preview

**Ziel:** Test-Abdeckung für die bisher ungetesteten Bereiche: Parser,
Navigator, Accept/Reject-Semantik und Preview-Rendering.

**Warum zuletzt:** Sinnvollerweise erst, wenn die neuen Features (Aufgaben 1–6)
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
   mit/ohne `~>`, korrekte Offsets.
2. Navigator: findAtCursor/Next/Prev/First/Last inkl. Wrap-around-Grenzfälle.
3. Accept/Reject: Mapping je Typ gemäß Tabelle in `CLAUDE.md` (Deletion, Addition,
   Substitution, Highlight, Comment).
4. Preview: markdown-it-Plugin gegen `md.render(...)`-Strings prüfen
   (`<ins>`, `<del>`, `<mark>`, Comment-Span; geschachteltes Markdown).
5. Wo VSCode-Typen (`Range`, `Position`) nötig sind: schlanke Fakes/Helfer nutzen,
   damit Tests ohne Extension-Host laufen.

**Akzeptanzkriterien**
- `npm test` führt die neuen Suites mit aus und ist grün.
- Edit-Logik und Preview-Rendering sind ohne laufenden Extension-Host testbar.

**Doku:** `CLAUDE.md` (Test-Abschnitt erweitern); ggf. Notiz im README zu `npm test`.

---

## Bewusst (vorerst) ausgeklammert

Diese Ideen wurden absichtlich **nicht** in die TODO-Liste aufgenommen:

- **Kommentar-Metadaten (Autor/Datum)** – würde den CriticMarkup-Standard um eine
  proprietäre Konvention erweitern; erst klären, ob standardkonform machbar.
- **Voller Live-„Track-Changes"-Modus beim Tippen** – sehr großer Umfang, eigenes
  Teilprodukt; separates Design nötig.
- **Mehrzeilige Kommentare im Preview „glätten"** – kleiner Robustheits-Fix,
  zunächst zu verifizieren, ob das Problem real auftritt.
