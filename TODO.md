# TODO – Geplante Verbesserungen für kaicrit

Diese Liste enthält ausgearbeitete, einzeln umsetzbare Aufgaben. Jede Aufgabe ist
in sich abgeschlossen und kann in einer eigenen Session / einem eigenen Commit
erledigt werden. Die Reihenfolge ist so gewählt, dass risikoarme, kleine Fixes
zuerst kommen und größere/strukturelle Arbeiten später.

Die Aufgaben 1–8 stammen aus dem Code-Review der bestehenden Extension
(Verbesserungspotenzial & Fehler); Aufgabe 9 härtet die Codebasis mit Tests ab.
Die Aufgaben 10–12 stammen aus einem Folge-Review (Aufgaben 1–9 alle erledigt):
10 ist der einzige wirklich lohnende Robustheits-Fix, 11–12 sind kleinere Punkte.

**Konventionen für alle Aufgaben**

- Nach jeder Code-Änderung die betroffene Doku aktualisieren (`README.md`,
  passende Datei unter `docs/`, sowie `CLAUDE.md`-Architekturnotizen + Checkliste).
- Neue Befehle in `contributes.commands`, neue Farben in `contributes.colors`,
  neue Settings unter `contributes.configuration` in [package.json](package.json)
  eintragen.
- Der einheitliche Marker-Wortschatz lebt in [src/core/markers.ts](src/core/markers.ts)
  und [src/core/types.ts](src/core/types.ts) – nicht duplizieren, sondern wiederverwenden.
- `npm run compile` muss fehlerfrei durchlaufen, `npm test` grün bleiben.
- **Erledigte Aufgaben markieren:** Sobald eine Aufgabe vollständig umgesetzt,
  getestet und dokumentiert ist, wird ihre Überschrift mit einem vorangestellten
  ✅ gekennzeichnet (z. B. `## ✅ 3. …`). So bleibt auf einen Blick erkennbar,
  was noch offen ist.

---

## ✅ 1. Accept/Reject-Keybindings kapern jeden Editor

**Problem:** Die Tastenkürzel für `kaicrit.acceptChange` (`alt+a`) und
`kaicrit.rejectChange` (`alt+r`) sind in [package.json](package.json) nur mit
`"when": "editorTextFocus"` gebunden. Dadurch greifen sie in **jedem** Textdokument –
auch in Dateien ohne CriticMarkup. Steht der Cursor nicht in einer Änderung,
erscheint zudem die modale Info-Box „Cursor is not inside a CriticMarkup change."
([src/edit/commands.ts](src/edit/commands.ts):212), was als Tastendruck-Rauschen stört.

**Warum zuerst:** Kleiner, klar abgegrenzter Fix mit spürbarer Alltagswirkung;
keine neue Infrastruktur nötig.

**Betroffene Dateien**
- [package.json](package.json) – `when`-Klauseln der beiden Keybindings einschränken.
- [src/edit/commands.ts](src/edit/commands.ts) – Setzen eines Context-Keys
  `kaicrit.hasChanges`; nicht-modale Rückmeldung statt `showInformationMessage`.
- [src/edit/decorator.ts](src/edit/decorator.ts) – im `onDidUpdate`/`update`-Pfad
  den Context-Key `kaicrit.hasChanges` für den aktiven Editor pflegen.

**Umsetzungsschritte**
1. Context-Key `kaicrit.hasChanges` einführen, der widerspiegelt, ob das aktive
   Dokument ≥ 1 Änderung hat (aus dem Decorator-Cache, analog zum bestehenden
   `kaicrit.trackChanges`-Key).
2. `when` der Keybindings auf `editorTextFocus && kaicrit.hasChanges` anheben.
3. In `applyAtCursor` die „kein Treffer"-Rückmeldung auf
   `vscode.window.setStatusBarMessage(...)` (zeitlich begrenzt) umstellen.

**Akzeptanzkriterien**
- `Alt+A`/`Alt+R` lösen nur in Dokumenten mit Änderungen aus.
- Keine modale Box mehr, wenn der Cursor nicht in einer Änderung steht.
- Accept/Reject bei Cursor-in-Änderung funktioniert unverändert.

**Doku:** README (Keybinding-Tabelle), `docs/markup.md`.

---

## ✅ 2. Blockierende Git-Autorabfrage asynchron machen

**Problem:** `resolveAuthor` in [src/edit/commands.ts](src/edit/commands.ts):123
ruft `execFileSync('git', ['config', 'user.name'], { timeout: 1000 })` **synchron**
auf dem Extension-Host auf. Beim Einfügen eines Kommentars kann das die UI bis zu
einer Sekunde einfrieren, falls Git langsam/hängend ist.

**Warum hier:** Punktueller Robustheits-Fix ohne API-Oberflächenänderung.

**Betroffene Dateien**
- [src/edit/commands.ts](src/edit/commands.ts) – `insertComment`/`resolveAuthor`
  auf eine asynchrone Auflösung umstellen (`execFile` als Promise) und das
  Ergebnis (pro Workspace-Folder) cachen.

**Umsetzungsschritte**
1. `resolveAuthor` async machen (`util.promisify(execFile)` oder `child_process`
   mit Callback/Promise) und `insertComment` entsprechend `await`-fähig gestalten.
2. Den ermittelten Namen einmalig cachen, damit nicht bei jedem Kommentar erneut
   ein Git-Prozess gestartet wird.
3. Fehler/Timeout weiterhin still abfangen (Fallback: leerer Autor → nur Datum).

**Akzeptanzkriterien**
- Das Einfügen eines Kommentars blockiert den Extension-Host nicht mehr.
- Autor wird weiterhin korrekt aus Setting bzw. `git config user.name` befüllt.

**Doku:** `CLAUDE.md` (Hinweis zu `insertComment`), falls Verhalten beschrieben.

---

## ✅ 3. Preview und Parser bei pfeilloser Substitution angleichen

**Problem:** Ein malformes `{~~x~~}` (ohne `~>`) wird vom Editor-Parser ignoriert –
`RE_ALL` ([src/core/markers.ts](src/core/markers.ts):31) verlangt das `~>`, also
keine Dekoration und kein Accept/Reject. Die Preview
([src/preview/markdownIt.ts](src/preview/markdownIt.ts):56-58) rendert denselben
Text dagegen als Deletion. Beide Engines sollten sich identisch verhalten.

**Warum hier:** Kleiner Konsistenz-Fix; betrifft nur eine Randform.

**Betroffene Dateien**
- [src/preview/markdownIt.ts](src/preview/markdownIt.ts) – Substitutionszweig.
- Alternativ/zusätzlich [src/core/markers.ts](src/core/markers.ts) +
  [src/edit/parser.ts](src/edit/parser.ts), falls die pfeillose Form bewusst
  erkannt werden soll.

**Umsetzungsschritte**
1. Entscheidung festhalten: pfeilloses `{~~…~~}` ist entweder (a) **kein** gültiger
   Marker (Preview ignoriert es ebenfalls) oder (b) ein gültiger Marker, dann auch
   im Parser erfassen.
2. Gewählte Variante in beiden Engines konsistent umsetzen.
3. Test ergänzen (siehe Aufgabe 9), der Parser- und Preview-Verhalten gegen
   denselben Eingabe-String prüft.

**Akzeptanzkriterien**
- Parser und Preview behandeln `{~~x~~}` identisch (beide ignorieren oder beide
  behandeln es gleich).

**Doku:** `docs/markup.md` (Hinweis zur Substitutionssyntax).

---

## ✅ 4. Cursor-Positionierung von `insertSubstitution` robust machen

**Problem:** `insertSubstitution` ([src/edit/commands.ts](src/edit/commands.ts):151-158)
sucht das `~>` per `lastIndexOf` nur in der **aktuellen Zeile** vor dem Cursor.
Bei mehrzeiliger Auswahl oder wenn der ersetzte Text selbst `~>` enthält, landet
der Cursor an der falschen Stelle (oder gar nicht zwischen `~>` und `~~}`).

**Warum hier:** Reiner Korrektheits-Fix der Einfüge-Logik; klein und lokal.

**Betroffene Dateien**
- [src/edit/commands.ts](src/edit/commands.ts) – `insertSubstitution`.

**Umsetzungsschritte**
1. Den Ziel-Offset direkt aus dem bekannten Einfüge-Punkt berechnen (analog zur
   Offset-Arithmetik in `wrapSelection`), statt das `~>` im Text zu suchen.
2. Mehrzeilige Auswahl korrekt behandeln (Position via `document.positionAt`).

**Akzeptanzkriterien**
- Nach dem Einfügen steht der Cursor zuverlässig zwischen `~>` und `~~}`, auch bei
  mehrzeiliger Auswahl und bei `~>` im ersetzten Text.

**Doku:** keine externe Doku nötig (internes Verhalten).

---

## ✅ 5. Geteilten globalen `RE_ALL`-Regex entschärfen

**Problem:** `RE_ALL` ([src/core/markers.ts](src/core/markers.ts):31) trägt die
Flags `g`/`s` und wird als **geteilter, mutierbarer** Zustand an mehreren Stellen
genutzt: [src/edit/parser.ts](src/edit/parser.ts):18 und
[src/edit/trackChangesEngine.ts](src/edit/trackChangesEngine.ts):57 (`scanMarkers`).
Beide setzen `lastIndex = 0`, doch der geteilte `lastIndex` ist bei künftiger
reentranter Nutzung eine Fehlerquelle.

**Warum hier:** Vorbeugender Robustheits-/Wartbarkeits-Fix ohne Verhaltensänderung.

**Betroffene Dateien**
- [src/core/markers.ts](src/core/markers.ts) – Quelle des Regex.
- [src/edit/parser.ts](src/edit/parser.ts), [src/edit/trackChangesEngine.ts](src/edit/trackChangesEngine.ts)
  – Aufrufstellen.

**Umsetzungsschritte**
1. Variante wählen: entweder `text.matchAll(RE_ALL)` (kein gemeinsamer `lastIndex`)
   oder pro Aufruf einen frischen `new RegExp(RE_ALL.source, RE_ALL.flags)` klonen,
   bzw. eine kleine Helper-/Generator-Funktion `findMarkers(text)` in `core`.
2. Beide Aufrufstellen darauf umstellen; `lastIndex`-Reset entfällt.

**Akzeptanzkriterien**
- Parser- und Track-Changes-Verhalten unverändert; alle Tests grün.
- Kein geteilter `lastIndex`-Zustand mehr zwischen Aufrufern.

**Doku:** `CLAUDE.md` (Hinweis zur Regex-Nutzung anpassen).

---

## ✅ 6. ESLint einrichten (oder tote Direktive entfernen)

**Problem:** [src/compare/commands.ts](src/compare/commands.ts):77 enthält
`// eslint-disable-next-line @typescript-eslint/no-explicit-any`, aber es gibt
weder eine ESLint-Konfiguration noch ESLint in den `devDependencies` noch ein
`lint`-Script. Die Direktive ist damit wirkungslos.

**Warum hier:** Tooling-/Qualitäts-Fundament; für eine veröffentlichte Extension
empfehlenswert, aber unabhängig vom Laufzeitverhalten.

**Betroffene Dateien**
- [package.json](package.json) – ESLint + `@typescript-eslint/*` als
  `devDependencies`, `lint`-Script.
- Neu: ESLint-Konfiguration (`eslint.config.js` flat config oder `.eslintrc.json`).

**Umsetzungsschritte**
1. Entweder ESLint mit TypeScript-Parser einrichten und `npm run lint` ergänzen
   (dann bleibt die Disable-Direktive sinnvoll),
2. **oder** ESLint bewusst weglassen und die tote `eslint-disable`-Zeile entfernen.
3. Optional in CI integrieren.

**Akzeptanzkriterien**
- Entweder `npm run lint` läuft sauber durch, **oder** die Codebasis enthält keine
  wirkungslosen ESLint-Direktiven mehr.

**Doku:** `CLAUDE.md` (Build/Run-Abschnitt: Lint erwähnen, falls eingeführt).

---

## ✅ 7. Parser-Vorabprüfung gegen unnötige Vollscans

**Problem:** `onDidChangeTextDocument` ([src/extension.ts](src/extension.ts):67)
löst `scheduleUpdate` aus, das bei jedem (debounced) Tastendruck einen Vollscan
mit `getText()` + `RE_ALL` über das gesamte Dokument fährt –
unabhängig davon, ob die Datei je Marker enthielt. Für große Quelldateien ohne
CriticMarkup ist das verschenkte Arbeit.

**Warum hier:** Performance-Optimierung; messbarer Nutzen erst bei großen Dateien,
daher nach den Korrektheits-Fixes.

**Betroffene Dateien**
- [src/edit/parser.ts](src/edit/parser.ts) bzw. [src/edit/decorator.ts](src/edit/decorator.ts)
  – günstiger Pre-Check vor dem Aufbau der `Range`-Objekte.

**Umsetzungsschritte**
1. Vor dem eigentlichen Parsen prüfen, ob der Text überhaupt ein `{`/Markeransatz
   enthält (z. B. `text.indexOf('{') === -1` ⇒ leeres Ergebnis), und früh zurückkehren.
2. Sicherstellen, dass der Cache dabei korrekt geleert wird, wenn der letzte Marker
   entfernt wurde (Übergang „hatte Änderungen → keine").
3. Messen/gegentesten, dass das Verhalten identisch bleibt.

**Akzeptanzkriterien**
- Dokumente ohne CriticMarkup verursachen keinen vollständigen Marker-Scan-Aufbau.
- Live-Aktualisierung von Dekorationen/Status/Sidebar bleibt korrekt.

**Doku:** `CLAUDE.md` (Architekturnotiz zum Update-Pfad), falls relevant.

---

## ✅ 8. Doppeltes Re-Parse nach Accept/Reject vermeiden

**Problem:** `applyAt`/`applyAll` rufen nach `applyEdit` explizit `dm.update(editor)`
auf ([src/edit/commands.ts](src/edit/commands.ts):217 und :232), während die durch
die Bearbeitung ausgelöste `onDidChangeTextDocument` zusätzlich ein
`scheduleUpdate` anstößt – das Dokument wird zweimal geparst. Funktional harmlos,
aber redundant.

**Warum hier:** Kosmetische Optimierung; geringe Priorität.

**Betroffene Dateien**
- [src/edit/commands.ts](src/edit/commands.ts) – Auflöse-Befehle.

**Umsetzungsschritte**
1. Entweder das explizite `dm.update` entfernen und auf den debounced
   `scheduleUpdate`-Pfad vertrauen (sofortige UI-Reaktion prüfen),
2. **oder** das explizite `update` beibehalten und den nachfolgenden geplanten
   Update für denselben Tick unterdrücken.
3. Sicherstellen, dass CodeLens/Sidebar/Statusbar weiterhin unmittelbar reagieren.

**Akzeptanzkriterien**
- Nach Accept/Reject wird das Dokument nur einmal neu geparst.
- Keine sichtbare Verzögerung der UI-Aktualisierung.

**Doku:** keine externe Doku nötig.

---

## ✅ 9. Tests für Edit & Preview

**Ziel:** Test-Abdeckung für die bisher ungetesteten Bereiche: Parser,
Navigator, Accept/Reject-Semantik und Preview-Rendering – inkl. der Edge-Cases,
die im Code-Review aufgefallen sind.

**Warum zuletzt:** Sinnvollerweise erst, wenn die obigen Fixes (Aufgaben 1–8) das
Verhalten finalisiert haben – so testet man den Zielzustand, nicht ein
Zwischenstadium. Härtet die Codebasis vor einem Release ab.

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
   mit/ohne `~>` (siehe Aufgabe 3), **leerer Content** (`{----}`, `{++++}`),
   Substitution mit leerer Seite (`{~~~>neu~~}`, `{~~alt~>~~}`), Kommentare
   mit/ohne Metadaten, sowie korrekte Offsets bei Unicode/Surrogate-Paaren vor
   und in Markern (UTF-16-Code-Units in `parser.ts`).
2. Navigator: findAtCursor/Next/Prev/First/Last inkl. Wrap-around-Grenzfälle und
   Cursor exakt an Marker-Start/-Ende.
3. Accept/Reject: Mapping je Typ gemäß Tabelle in `CLAUDE.md` (Deletion, Addition,
   Substitution, Highlight, Comment).
4. Preview: markdown-it-Plugin gegen `md.render(...)`-Strings prüfen
   (`<ins>`, `<del>`, `<mark>`, Comment-Span; geschachteltes + mehrzeiliges Markdown;
   pfeillose Substitution analog zum Parser, siehe Aufgabe 3).
5. Wo VSCode-Typen (`Range`, `Position`) nötig sind: schlanke Fakes/Helfer nutzen,
   damit Tests ohne Extension-Host laufen.

**Akzeptanzkriterien**
- `npm test` führt die neuen Suites mit aus und ist grün.
- Edit-Logik und Preview-Rendering sind ohne laufenden Extension-Host testbar.

**Doku:** `CLAUDE.md` (Test-Abschnitt erweitern); ggf. Notiz im README zu `npm test`.

---

## ✅ 10. Größen-Guard für den Myers-Diff (Selbst-DoS verhindern)

**Problem:** `myers` in [src/compare/diff.ts](src/compare/diff.ts):96 schnappschießt
in **jedem** Schritt das vollständige `v`-Array (`trace.push(v.slice())`). Speicher-
und Zeitbedarf sind damit **O((N+M)·D)**; bei zwei großen, stark unterschiedlichen
Dateien geht die Editierdistanz D gegen N+M, also **O((N+M)²)**. Es gibt **keinerlei
Obergrenze** – [src/compare/compare.ts](src/compare/compare.ts):39 ruft `diff()`
ungebremst auf, ebenso `compareWithGitHead` auf einer großen Datei. Bei
`character`-Granularität (oder zwei sehr verschiedenen Dateien mit zehntausenden
Tokens) kann das den **Extension-Host einfrieren oder zum OOM bringen** – ein
Selbst-DoS, der den ganzen VS-Code-Workspace blockiert.

**Warum lohnend:** Einziger echter Robustheits-Gap der bestehenden Features.
Normalfall (ähnliche Dateien, `word`-Granularität) bleibt unberührt; nur die
pathologische Eingabe wird abgefangen.

**Betroffene Dateien**
- [src/compare/diff.ts](src/compare/diff.ts) – Kosten-/Größenabschätzung vor dem
  Myers-Lauf (Tokenzahl nach `tokenize`), Schwellwert + Rückgabe-/Fehlersignal.
- [src/compare/compare.ts](src/compare/compare.ts) – Reaktion auf den Guard
  (Fallback bzw. Warnung an die UI).

**Umsetzungsschritte**
1. Nach dem Tokenisieren die Produktgröße `n*m` (oder `n+m` als günstigere Heuristik)
   gegen einen Schwellwert prüfen.
2. Variante festlegen: (a) bei Überschreitung automatisch auf `line`-Granularität
   zurückfallen (deutlich weniger Tokens) und den Diff erneut versuchen, oder
   (b) abbrechen und via `vscode.window.showWarningMessage(...)` melden, dass die
   Dateien für den gewählten Vergleich zu groß sind.
3. Schwellwert dokumentieren und ggf. als Setting (`kaicrit.compare.maxDiffTokens`)
   konfigurierbar machen.
4. Test ergänzen: synthetische große, vollständig unterschiedliche Eingaben lösen
   den Guard aus (Fallback bzw. Abbruch), kleine Eingaben unverändert.

**Akzeptanzkriterien**
- Zwei große, stark unterschiedliche Dateien blockieren den Extension-Host nicht
  mehr; entweder erscheint ein Zeilen-Diff oder eine klare Warnung.
- Reconstruction-Invariante (reject→Datei 1, accept→Datei 2) bleibt für den
  tatsächlich gewählten Pfad erhalten.

**Doku:** `docs/compare.md` (Grenze/Verhalten), `README.md` (falls Setting),
`CLAUDE.md` (Architekturnotiz zum Diff-Guard).

---

## ✅ 11. CodeLens-Fallback parst markerlose Dateien zu oft

**Problem:** `provideCodeLenses` ([src/edit/codeLens.ts](src/edit/codeLens.ts):52-55)
fällt bei `changes.length === 0` auf `parseCriticMarkup(doc)` zurück. „Cache kalt"
und „Cache warm, aber 0 Änderungen" sind so **nicht unterscheidbar**: eine markerlose
Datei, die aber `{` enthält (Code/JSON), führt bei *jeder* CodeLens-Anfrage – die
VS Code häufig stellt – einen vollständigen Regex-Vollscan aus, obwohl der
Decorator-Cache bereits „leer" weiß.

**Warum hier:** Reine Performance-Optimierung, kleiner und lokaler Eingriff,
geringe Priorität (der `indexOf('{')`-Pre-Check aus Aufgabe 7 entschärft den
Fall ohne `{` bereits).

**Betroffene Dateien**
- [src/edit/decorator.ts](src/edit/decorator.ts) – kleine API, um „Cache für dieses
  Dokument vorhanden?" zu beantworten (z. B. `hasChanges(doc)`/`has(key)` über die
  `changeCache`-Map).
- [src/edit/codeLens.ts](src/edit/codeLens.ts) – Fallback-Parse nur noch, wenn der
  Cache wirklich kalt ist (kein Eintrag), nicht bei einem warmen leeren Eintrag.

**Umsetzungsschritte**
1. Im `DecoratorManager` eine Methode ergänzen, die `changeCache.has(key)` zurückgibt.
2. In `provideCodeLenses` den Fallback an `!dm.hasCache(doc)` knüpfen statt an
   `changes.length === 0`.

**Akzeptanzkriterien**
- Eine markerlose, aber `{`-haltige Datei löst bei wiederholten CodeLens-Anfragen
  keinen erneuten Vollscan mehr aus, sobald der Cache einmal warm ist.
- CodeLens-Verhalten für Dokumente mit Änderungen unverändert.

**Doku:** keine externe Doku nötig (internes Verhalten).

---

## ✅ 12. Preview-`commentMetadata` reagiert nicht auf Settingwechsel

**Problem:** `extendMarkdownIt` ([src/extension.ts](src/extension.ts):110-114) liest
`kaicrit.edit.commentMetadata` beim Aufbau der markdown-it-Instanz und friert den
Wert ein. Ein Umschalten des Settings wirkt sich erst nach einem Reload auf die
Vorschau aus (Editor-Dekorationen ziehen ohnehin erst beim nächsten Edit nach, weil
der Parser den Wert pro Parse frisch liest). Inkonsistent, aber funktional harmlos.

**Warum hier:** Geringe Priorität; entweder kleiner UX-Fix oder bewusst nur als
dokumentierte Grenze festhalten.

**Betroffene Dateien**
- [src/extension.ts](src/extension.ts) – Preview-Aktualisierung bei
  `onDidChangeConfiguration('kaicrit.edit.commentMetadata')` anstoßen, falls die
  VS-Code-Preview-API ein Neuaufbauen des markdown-it-Plugins erlaubt.
- alternativ `docs/preview.md` – die Reload-Notwendigkeit als bekannte Grenze
  dokumentieren.

**Umsetzungsschritte**
1. Prüfen, ob VS Code `extendMarkdownIt` nach einem Config-Change erneut aufruft
   (ggf. über `markdown.api`/Reload-Trigger). Wenn ja: Auslöser ergänzen.
2. Wenn kein sauberer Trigger existiert: Verhalten als bekannte Grenze in
   `docs/preview.md` dokumentieren statt zu implementieren.

**Akzeptanzkriterien**
- Entweder spiegelt die Vorschau einen `commentMetadata`-Wechsel ohne Reload, oder
  die Reload-Notwendigkeit ist dokumentiert.

**Doku:** `docs/preview.md`.

---

## Bewusst (vorerst) ausgeklammert

- **Selektives Accept/Reject nach Typ** (z. B. „alle Additions annehmen") – die
  bestehenden `acceptAll`/`rejectAll` decken den häufigsten Fall bereits ab; der
  zusätzliche Typ-Filter wurde auf Wunsch zurückgestellt und kann später leicht
  auf Basis der vorhandenen atomaren `WorkspaceEdit`-Logik ergänzt werden.
