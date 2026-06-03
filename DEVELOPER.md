# Entwicklerdokumentation

Diese Datei richtet sich an Entwicklerinnen und Entwickler, die an **kaicrit**
mitarbeiten oder die Funktionsweise der Extension im Detail verstehen wollen.
Während [README.md](README.md) und der [docs/](docs/)-Ordner die Extension aus
Anwendersicht beschreiben, erklärt dieses Dokument die **technische Umsetzung**:
wie VS-Code-Extensions grundsätzlich aufgebaut sind, wie die Projektziele von
kaicrit auf die aktuelle Architektur abgebildet sind, was jede einzelne
Quelldatei tut, wie der Build lokal und in der CI läuft und wie die Extension
veröffentlicht wird.

Code-Begriffe, Dateinamen, Befehle und Einstellungsschlüssel bleiben im
Original (Englisch), die Erklärungen sind auf Deutsch.

---

## Inhaltsverzeichnis

1. [Wie VS-Code-Extensions aufgebaut und eingebunden werden](#1-wie-vs-code-extensions-aufgebaut-und-eingebunden-werden)
2. [Projektziele und ihre Umsetzung in der Architektur](#2-projektziele-und-ihre-umsetzung-in-der-architektur)
3. [Die Quelldateien im Detail](#3-die-quelldateien-im-detail)
4. [Build-Prozess: lokal und als GitHub-Workflow](#4-build-prozess-lokal-und-als-github-workflow)
5. [Deployment: Microsoft Marketplace und Open-Source-Alternative](#5-deployment-microsoft-marketplace-und-open-source-alternative)

---

## 1. Wie VS-Code-Extensions aufgebaut und eingebunden werden

### Grundidee

Eine VS-Code-Extension ist im Kern ein **Node.js-Modul mit einem Manifest**
([package.json](package.json)). VS Code lädt dieses Manifest, liest daraus,
*was* die Extension beiträgt (Befehle, Tastenkürzel, Einstellungen, Farben,
Views …) und *wann* sie aktiviert werden soll, und führt anschließend das
kompilierte JavaScript in einem separaten Node-Prozess, dem **Extension Host**,
aus. Die Extension selbst spricht ausschließlich über das `vscode`-Modul
(die [Extension-API](https://code.visualstudio.com/api)) mit dem Editor — sie
greift nie direkt auf das UI-Rendering zu.

Es gibt damit zwei grundlegend verschiedene Teile:

| Teil | Wo definiert | Bedeutung |
|---|---|---|
| **Contribution Points** | deklarativ in `package.json` unter `contributes` | Was die Extension dem Editor *anbietet* (Befehle, Keybindings, Settings, Farben, Menüs, Views). VS Code zeigt diese auch ohne aktive Extension an (z. B. in der Befehlspalette). |
| **Activation / Laufzeit** | imperativ im kompilierten Code (`activate()`) | Was tatsächlich *passiert*, sobald die Extension aktiv ist. |

### Das Manifest (`package.json`)

Die für eine Extension wichtigen Felder (alle in kaicrits
[package.json](package.json) vorhanden):

- `name`, `displayName`, `description`, `version`, `publisher` — Identität und
  Versionierung. `publisher` + `name` ergeben die eindeutige Extension-ID
  (`0x2e6b6169.kaicrit`).
- `engines.vscode` — die minimale VS-Code-Version, gegen deren API gebaut wird
  (`^1.85.0`). Das `@types/vscode`-Paket muss dazu passen.
- `main` — der Einsprungpunkt, hier `./out/extension.js` (das aus
  `src/extension.ts` kompilierte Modul).
- `activationEvents` — wann VS Code die Extension laden soll. kaicrit nutzt
  `onStartupFinished`: die Extension wird kurz nach dem Start geladen, ohne den
  Start selbst zu verzögern. (Befehlsbasierte Aktivierung wie
  `onCommand:…` wäre die Alternative, ist für eine Extension mit globalen
  Listenern wie kaicrit aber ungeeignet.)
- `contributes` — der deklarative Teil (siehe oben).
- `scripts` — npm-Skripte für Build und Test.
- `devDependencies` — TypeScript, `@types/node`, `@types/vscode`.

### Der Lebenszyklus: `activate` / `deactivate`

Der `main`-Einsprungpunkt exportiert zwei Funktionen:

```ts
export function activate(context: vscode.ExtensionContext) { … }
export function deactivate() { … }
```

`activate()` wird einmal aufgerufen, sobald eines der `activationEvents`
eintritt. Hier registriert die Extension ihre Befehle, Listener und Provider.
Das übergebene `context.subscriptions`-Array ist der zentrale Mechanismus zur
**Ressourcenfreigabe**: Alles, was ein `dispose()` besitzt (Befehle, Listener,
Status-Bar-Einträge, Decoration-Typen …), wird dort eingetragen und von VS Code
beim Deaktivieren automatisch aufgeräumt. kaicrit nutzt das konsequent — siehe
[src/extension.ts](src/extension.ts).

### Wichtige API-Bausteine, die kaicrit verwendet

- **Commands** (`vscode.commands.registerCommand`) — benannte Aktionen, die per
  Palette, Tastenkürzel, Menü oder Programmcode ausgelöst werden. Müssen
  zusätzlich in `contributes.commands` deklariert werden, um in der Palette zu
  erscheinen.
- **TextEditorDecorationType** (`vscode.window.createTextEditorDecorationType`) —
  rein visuelle Overlays über dem Text (Farben, Durchstreichungen,
  Overview-Ruler-Markierungen), die den Pufferinhalt *nicht* verändern. kaicrit
  färbt damit CriticMarkup ein.
- **Events** (`workspace.onDidChangeTextDocument`,
  `window.onDidChangeActiveTextEditor`, …) — der Editor benachrichtigt die
  Extension über Änderungen. kaicrit hört auf Dokument- und Editorwechsel.
- **Providers** — `registerCodeLensProvider`, `registerHoverProvider`,
  `createTreeView` (für die Sidebar). VS Code fragt sie bei Bedarf nach Inhalten.
- **Configuration** (`workspace.getConfiguration`) — Lesezugriff auf die in
  `contributes.configuration` deklarierten `kaicrit.*`-Einstellungen.
- **Context Keys** (`vscode.commands.executeCommand('setContext', …)`) — boolesche
  Flags, die `when`-Klauseln von Keybindings/Menüs auswerten. kaicrit setzt z. B.
  `kaicrit.hasChanges`, damit `Alt+A`/`Alt+R` nur greifen, wenn das Dokument
  überhaupt Änderungen enthält.
- **Markdown-Preview-Erweiterung** — über das von `activate()` zurückgegebene
  `{ extendMarkdownIt }`-Objekt klinkt sich kaicrit in die eingebaute
  Markdown-Vorschau ein, ganz ohne eigenes Webview.

### Vom Quellcode zur installierten Extension

1. TypeScript in `src/` wird mit `tsc` nach `out/` kompiliert (Konfiguration in
   [tsconfig.json](tsconfig.json)).
2. Zum lokalen Testen startet **F5** in VS Code einen **Extension Development
   Host** — ein zweites VS-Code-Fenster, in dem die Extension aus `out/` läuft.
3. Für die Verteilung packt das CLI-Werkzeug **`vsce`** Manifest + `out/` +
   Assets in eine `.vsix`-Datei (im Grunde ein ZIP). Was *nicht* mitgepackt
   werden soll (z. B. `src/`, `node_modules`-Reste), steht in
   [.vscodeignore](.vscodeignore).
4. Eine `.vsix` kann direkt installiert (`code --install-extension …`) oder in
   einen Marketplace hochgeladen werden (siehe [Abschnitt 5](#5-deployment-microsoft-marketplace-und-open-source-alternative)).

---

## 2. Projektziele und ihre Umsetzung in der Architektur

### Was kaicrit erreichen will

kaicrit ist eine vollständige **CriticMarkup**-Umgebung für VS Code.
[CriticMarkup](https://github.com/CriticMarkup/CriticMarkup-toolkit) ist ein
Klartext-Standard, um Änderungen und Kommentare in beliebigen Textdateien
nachzuverfolgen. Er kennt fünf Markertypen:

| Typ | Syntax | Bedeutung |
|---|---|---|
| Deletion | `{--gelöscht--}` | zu entfernender Text |
| Addition | `{++hinzugefügt++}` | einzufügender Text |
| Substitution | `{~~alt~>neu~~}` | Ersetzung (Pfeil `~>` ist Pflicht) |
| Highlight | `{==hervorgehoben==}` | markierter Text |
| Comment | `{>>Anmerkung<<}` | Inline-Kommentar |

Aus diesem Standard ergeben sich vier Funktionsbereiche (Features), die kaicrit
bündelt:

1. **Edit** — Marker einfügen, zwischen Änderungen navigieren, Änderungen
   annehmen/ablehnen, direkt im Editor einfärben; dazu der **Track-Changes-Modus**,
   der Tipp-Eingaben *live* in CriticMarkup umschreibt.
2. **Compare** — zwei Dateien per Diff in *ein* CriticMarkup-Dokument
   zusammenführen.
3. **Double-Pane** — ein CriticMarkup-Dokument als „Original | Neu" nebeneinander
   anzeigen, eingefärbt, aber ohne die Marker-Syntax.
4. **Preview** — CriticMarkup inline in der eingebauten Markdown-Vorschau rendern.

### Das tragende Architekturprinzip: gemeinsames Vokabular, getrennte Features

Alle vier Features arbeiten mit *denselben* fünf Markertypen. Damit die
Marker-Syntax **genau einmal** definiert ist, gibt es ein gemeinsames
Kern-Vokabular unter [src/core/](src/core/), das von allen Features genutzt wird.
Der Quellcode ist deshalb **nach Feature gruppiert**, mit `core/` als geteilter
Basis:

```
src/
├── core/        Gemeinsames Vokabular (Typen, Marker-Regex, Kommentar-Metadaten)
├── edit/        Editor-Dekorationen, Navigation, Accept/Reject, Track Changes
├── compare/     Zwei Dateien → CriticMarkup (Diff-Engine + Renderer)
├── doublepane/  Original | Neu nebeneinander
├── preview/     markdown-it-Plugin für die eingebaute Vorschau
└── extension.ts Einsprungpunkt: verdrahtet alles in activate()
```

### Zwei durchgehende Entwurfsmuster

Diese beiden Prinzipien ziehen sich durch den gesamten Code und erklären viele
Dateigrenzen:

**(a) Reiner Kern, dünne VS-Code-Hülle.** Die eigentliche Logik wird, wo immer
möglich, in **VS-Code-freie, reine Funktionen** ausgelagert (z. B.
`parseCriticMarkup`, `resolveReplacement`, `computeTrackChanges`, `diff`,
`buildDoublePane`). Diese lassen sich mit Node `--test` **ohne** Extension Host
testen. Die VS-Code-spezifischen Module (`DecoratorManager`,
`TrackChangesManager`, die `commands.ts`-Dateien) sind dünne Wrapper, die
Editor-Ereignisse in Aufrufe dieser reinen Kerne übersetzen und das Ergebnis als
`WorkspaceEdit`/Dekoration zurück in den Editor schreiben.

**(b) Eine Quelle der Wahrheit pro Konzept.** Marker-Delimiter leben nur in
[core/markers.ts](src/core/markers.ts); die Accept/Reject-Semantik nur in
[edit/resolve.ts](src/edit/resolve.ts); die Kommentar-Metadaten-Konvention nur in
[core/comment.ts](src/core/comment.ts); die Dekorationsstile nur in
[edit/decorationTypes.ts](src/edit/decorationTypes.ts). Jeder Konsument
importiert diese statt eigene Kopien anzulegen.

### Wie die Features die gemeinsame Basis nutzen

| Feature | Liest die Marker über | Erzeugt Marker über |
|---|---|---|
| Edit (Parser) | `findMarkers` / `RE_ALL` | `MARKERS` (beim Einfügen/Track Changes) |
| Compare | — | `MARKERS` (Renderer) |
| Double-Pane | `findMarkers` | — (zerlegt nur) |
| Preview | eigener Tokenizer, teilt aber `MARKERS` | erzeugt HTML-Tokens |

Der Datenfluss im Edit-Feature ist das Herzstück und bündelt das (a)/(b)-Muster:
ein Dokument-Edit → `DecoratorManager.scheduleUpdate` (entprellt) →
`parseCriticMarkup` liefert `CriticChange[]` → dieser **eine Cache** speist
*alle* Leser: Dekorationen, Status-Bar-Zähler, Changes-Sidebar, CodeLens/Hover
und das `kaicrit.hasChanges`-Context-Key. Niemand parst das Dokument doppelt.

---

## 3. Die Quelldateien im Detail

Die Reihenfolge folgt dem natürlichen Abhängigkeitsfluss: erst der gemeinsame
Kern, dann das Edit-Feature (mit Abstand das größte), dann Compare, Double-Pane,
Preview und schließlich der Einsprungpunkt, der alles verdrahtet.

### 3.1 `src/core/` — das gemeinsame Vokabular

#### [core/types.ts](src/core/types.ts)
Definiert das `ChangeType`-Enum (die fünf Markertypen) und das zentrale
Interface `CriticChange`. Eine `CriticChange` trägt den Typ, die `fullRange`
(der komplette `{--…--}`-Bereich für Edits), je nach Typ eine `contentRange`
bzw. `oldRange`/`newRange` (für Substitutionen), die extrahierten Strings
(`text`/`oldText`/`newText`) und optional `author`/`date` für
Kommentar-Metadaten. Dieses Interface ist die gemeinsame Währung zwischen Parser
und allen Lesern.

#### [core/markers.ts](src/core/markers.ts)
Die **einzige Quelle der Wahrheit für die Marker-Syntax**. Enthält die
`MARKERS`-Tabelle (open/close/sep-Delimiter pro Typ) und die `RE_ALL`-Regex mit
sechs Capture-Gruppen (eine pro Typ, zwei für Substitution). Der Helfer
`findMarkers(text)` iteriert über `text.matchAll(RE_ALL)` — `matchAll` arbeitet
auf einem internen Klon der Regex, sodass der globale `RE_ALL` nie mutiert wird
und kein `lastIndex`-Zustand zwischen Aufrufern geteilt wird (reentranzsicher).
Alle Aufrufer nutzen `for…of findMarkers(text)` statt `RE_ALL.exec`.

#### [core/comment.ts](src/core/comment.ts)
Reiner Splitter `parseCommentMeta(content)` für das optionale
`@author YYYY-MM-DD:`-Präfix in Kommentaren. Rückwärtskompatibel: ein Kommentar
ohne passendes Präfix (auch `Note: …`) bleibt ein gewöhnlicher Kommentar ohne
Metadaten. Wird sowohl vom Edit-Parser als auch vom Preview-Tokenizer genutzt,
damit die Konvention nur einmal existiert (getestet in `core/comment.test.ts`).

### 3.2 `src/edit/` — Editor-Dekorationen, Navigation, Accept/Reject, Track Changes

Das größte Feature. Es zerfällt in (1) das Parsen + Cachen, (2) das Rendern
(Dekorationen, Status-Bar, Sidebar, CodeLens/Hover), (3) das Auflösen
(Accept/Reject) und (4) den Track-Changes-Recorder.

#### Parsen & Aktivierung

##### [edit/parser.ts](src/edit/parser.ts)
`parseCriticMarkup(doc)` — der Einzeldurchlauf-Scan über `findMarkers`, liefert
`CriticChange[]`. Eine billige Vorprüfung (`text.indexOf('{') === -1`) kehrt früh
zurück, sodass marker-freie Dateien auf dem entprellten Update-Pfad praktisch
nichts kosten. Bei aktiviertem `kaicrit.edit.commentMetadata` extrahiert er
`author`/`date` über `parseCommentMeta`. Nutzt `document.positionAt()`, um
String-Offsets in VS-Code-`Position`en zu wandeln — keine manuelle
Zeilen-/Spaltenarithmetik.

##### [edit/enablement.ts](src/edit/enablement.ts)
`EnablementManager` entscheidet, *auf welchen Dokumenten* kaicrits
Editor-Features überhaupt wirken. `isEnabled(doc)` prüft zuerst eine
sitzungsweite Per-Datei-Überschreibung, sonst die `kaicrit.enabledLanguages`-
Einstellung (Default `["markdown","plaintext"]`, `"*"` = alle). Besitzt den
`$(eye)/$(eye-closed)`-Status-Bar-Umschalter (`kaicrit.toggleFileEnabled`) und ein
`onDidChange`-Event, das `extension.ts` zum Neu-Dekorieren nutzt.

#### Dekorationen rendern

##### [edit/decorationTypes.ts](src/edit/decorationTypes.ts)
Factory `createContentDecorationTypes()` für die sechs **Inhalts**-Dekorationen
(deletion / addition / substitutionOld / substitutionNew / highlight / comment)
samt der `kaicrit.*`-ThemeColor-IDs. Wichtig: **jeder Aufruf liefert frische
Instanzen** — `DecoratorManager` und `registerDoublePaneCommands` rufen die
Factory je einmal auf und besitzen damit getrennte Instanzsätze, sodass das
Leeren der Editor-Dekorationen nie die Double-Pane-Farben mitlöscht.

##### [edit/decorator.ts](src/edit/decorator.ts)
`DecoratorManager` — das Zentrum des Edit-Features. Hält die Dekorationstypen
(die sechs Inhaltstypen aus der Factory plus den lokalen, gedimmten
`markerType` für die Delimiter), wendet sie entprellt pro Editor an
(`scheduleUpdate` liest den Delay aus `kaicrit.edit.decorationDebounce`,
Default 150 ms), setzt Overview-Ruler-Markierungen, liefert den Kommentar-Hover,
feuert nach jedem Cache-Refresh ein `onDidUpdate`-Event und spiegelt die
Änderungszahl über `syncContext` in das `kaicrit.hasChanges`-Context-Key.
`update(editor)` storniert zuerst ein noch ausstehendes entprelltes
`scheduleUpdate` desselben Dokuments, damit ein expliziter Refresh (nach
Accept/Reject) und das Change-Event nicht zwei Parses auslösen. Über den
übergebenen `isEnabled`-Prädikaten wird ein deaktiviertes Dokument zentral
inert: leerer Cache, keine Dekorationen — und damit gehen alle Leser leer aus.

##### [edit/statusBar.ts](src/edit/statusBar.ts)
`StatusBarManager` — Änderungszähler pro Typ für den aktiven Editor
(`⊟ ⊞ ⇄ ☰ 💬`), gespeist aus dem Decorator-Cache über `onDidUpdate`; bei null
Änderungen versteckt, Klick führt `kaicrit.firstChange` aus. Exportiert außerdem
die geteilten Tabellen `ORDER`/`LABELS`/`SYMBOLS` und den Helfer `countByType`,
die die Changes-Sidebar wiederverwendet.

##### [edit/changesView.ts](src/edit/changesView.ts)
`ChangesTreeProvider` (`TreeDataProvider`) — die Sidebar-Ansicht
`kaicrit.changes` im Activity-Bar-Container. Listet die Änderungen des aktiven
Dokuments nach Typ gruppiert, liest denselben Decorator-Cache und aktualisiert
sich über `onDidUpdate`. Gruppenknoten zeigen das Per-Typ-Symbol aus
`statusBar.ts`, Blätter tragen die Startposition + ein
`kaicrit.revealChangeAt`-Klickkommando sowie Inline-Accept/Reject-Buttons.

##### [edit/navigator.ts](src/edit/navigator.ts)
Reine Funktionen über `CriticChange[]`: `findAtCursor`, `findNext`, `findPrev`,
`findFirst`, `findLast`. VS-Code-frei, getestet über den `vscodeStub`.

#### Auflösen (Accept/Reject)

##### [edit/resolve.ts](src/edit/resolve.ts)
`resolveReplacement(change, mode)` — die **reine, VS-Code-freie Accept/Reject-
Abbildung** (siehe Tabelle unten) und damit die einzige Quelle der Wahrheit
dafür, wozu jeder Typ kollabiert. Wird von `commands.ts` (Accept/Reject), von
der Track-Changes-Engine (Reject-bei-Delimiter-Löschung, Flatten-bei-Paste) und
von `buildDoublePane` indirekt gespiegelt verwendet.

| Typ | Accept | Reject |
|---|---|---|
| Deletion `{--T--}` | `""` | `T` |
| Addition `{++T++}` | `T` | `""` |
| Substitution `{~~O~>N~~}` | `N` | `O` |
| Highlight `{==T==}` | `T` | `T` |
| Comment `{>>T<<}` | `""` | `""` |

##### [edit/actions.ts](src/edit/actions.ts)
Reine String-Builder für CodeLens und Hover: `shortText(s, max)`
(whitespace-kollabierte, gekürzte Inhaltsvorschau) und `actionHoverMarkdown(pos)`
(die beiden vertrauenswürdigen `command:`-Links für Accept/Reject mit
URI-kodiertem Positions-Argument). VS-Code-frei, getestet ohne Stub.

##### [edit/codeLens.ts](src/edit/codeLens.ts)
`CriticCodeLensProvider` — aktiv nur bei
`kaicrit.edit.changeActions === 'codeLens'`. Pro Änderung **drei** Lenses am
Änderungsanfang: eine Info-Lens (Symbol + Kurzvorschau, Klick → springt hin)
und `$(check)`/`$(x)`-Aktionen. Liest den Decorator-Cache; ein direkter
Fallback-Parse läuft nur bei wirklich kaltem Cache (`dm.hasCache(doc)`), nicht
bei warm-aber-leer (Code/JSON mit `{`). Teilt das `isEnabled`-Prädikat.

##### [edit/hover.ts](src/edit/hover.ts)
`CriticHoverProvider` — die On-Hover-Alternative zur CodeLens, aktiv bei
`kaicrit.edit.changeActions === 'hover'` (Default). Löst Änderungen
cache-first auf, findet die überfahrene per `findAtCursor` und gibt einen an
`change.fullRange` verankerten `vscode.Hover` mit vertrauenswürdigem
`MarkdownString` zurück. Die Verankerung am Änderungsbereich macht die Aktionen
selbsterklärend, weshalb hier die lesbaren Worte „Accept"/„Reject" bleiben.

##### [edit/commands.ts](src/edit/commands.ts)
`registerEditCommands(ctx, dm, tcm, em)` — registriert alle Edit-Befehle:
Einfügen (Deletion/Addition/Substitution/Highlight/Comment), Navigieren,
Accept/Reject am Cursor bzw. an Position (für CodeLens/Hover) bzw. am
Tree-Knoten, sowie Accept-All/Reject-All. Wichtige Feinheiten:
- `insertComment` füllt bei aktiven Metadaten `@author today:` vor (Autor aus
  `kaicrit.edit.commentAuthor`, sonst per `git config user.name` asynchron
  ermittelt und pro Workspace-Ordner gecacht) und parkt den Cursor *innerhalb*
  des Markers.
- `insertSubstitution` verlangt eine nicht-leere Auswahl (eine leere „alte"
  Seite wäre nur eine Addition) und lehnt sonst mit einem Hinweis ab.
- Alle Einfüge-Befehle laufen über `tcm.applyAuthoringEdit`, damit der
  Track-Changes-Recorder die explizit erzeugte Markup nicht erneut als Edit
  verarbeitet (Issue #44).
- Accept/Reject delegieren an das reine `resolveReplacement` und wenden das
  `WorkspaceEdit` über `tcm.applyResolution` an (damit eine Auflösung bei aktivem
  Track Changes nicht rückgängig gemacht wird — Issue #42); `applyAt` schließt
  zusätzlich den offenen Hover (`dismissHover`).

#### Track Changes (Live-Aufzeichnung)

##### [edit/trackChangesEngine.ts](src/edit/trackChangesEngine.ts)
`computeTrackChanges(preText, rawEdits)` — der **reine, VS-Code-freie Kern** des
Track-Changes-Modus. Klassifiziert jeden Roh-Edit (Einfügen → `{++…++}`,
Löschen → `{--…--}`, Ersetzen → `{~~…~>…~~}`) im Kontext umgebender Marker und
liefert kompensierende Ersetzungen + finale Cursor-Offsets. Vier Regeln
verhindern verschachtelte Markup:
- **#34** Ein Edit *innerhalb* des Inhalts eines Markers wird absorbiert (die
  Seite wächst), statt zu verschachteln; enthält der eingefügte Text selbst
  ganze Marker, werden diese per `flattenInnerMarkers` auf ihre Accept-Form
  abgeflacht.
- **#38** Ein Lösch-/Ersetz-Edit, der einen *Delimiter* eines Markers entfernt,
  wird als **Reject** des ganzen Markers gewertet (über `resolveReplacement`).
- **#40** Eingefügter Text, der bereits *komplette* CriticMarkup enthält, bleibt
  verbatim; nur die umgebenden Klartext-Läufe werden als Additions umschlossen.
- Einfaches Tippen ohne Marker bleibt ein `skip`.

Zusätzlich `computeNormalModeFlatten(preText, rawEdits)` — das Gegenstück für
**Track Changes AUS**, das *nur* die #34-Flatten-Regel beim Einfügen in einen
Marker anwendet (sonst keine Edits). Getestet in `trackChangesEngine.test.ts`.

##### [edit/trackChanges.ts](src/edit/trackChanges.ts)
`TrackChangesManager` — die dünne VS-Code-Hülle um die Engine. Hält den Zustand
pro Dokument (`enabled`-Set + Shadow-Snapshots, da das Change-Event den
gelöschten Text nicht mitliefert) und einen **pro-Dokument** Wiedereintritts-
Schutz (`applyingOwnEdit` als `Set<string>`), damit die eigene kompensierende
`WorkspaceEdit` nicht erneut verarbeitet wird und ein laufender `applyEdit` für
Dokument A keine gleichzeitige Änderung in Dokument B verschluckt. Der Guard
wird in *beiden* Promise-Zweigen (Erfolg/Ablehnung) wieder entfernt, sodass ein
fehlgeschlagener `applyEdit` den Recorder nicht dauerhaft blockiert. Bietet die
Status-Bar-Umschaltung `$(edit) Track Changes: On/Off`, die Einsprungpunkte
`applyResolution` (für Accept/Reject) und `applyAuthoringEdit` (für die
Einfüge-Befehle), und `handleNormalMode` für den Anti-Nesting-Schutz bei
ausgeschaltetem Tracking (über `kaicrit.edit.preventNestingOnPaste`). Getestet
in `trackChanges.test.ts`.

##### [edit/vscodeStub.ts](src/edit/vscodeStub.ts)
Test-only-Fake der VS-Code-API-Teilmenge, die die Edit-Module brauchen
(`Range`/`Position`/`Selection`/`WorkspaceEdit`, ein minimales `TextDocument`,
`workspace.getConfiguration`, ein umschaltbares `workspace.applyEdit`). Installiert
einen `Module._load`-Hook, sodass `require('vscode')` unter `node --test` auf
diesen Fake auflöst. Ein Test muss `import './vscodeStub'` **vor** jedem Modul
stehen haben, das `vscode` zieht. Keine `*.test.ts`-Datei, wird also nicht als
Suite ausgeführt.

### 3.3 `src/compare/` — zwei Dateien in CriticMarkup diffen

#### [compare/diff.ts](src/compare/diff.ts)
Die Diff-Engine: tokenisiert beide Texte auf konfigurierbarer Granularität
(`character`/`word`/`line`, whitespace-erhaltend), berechnet ein kürzestes
Edit-Skript per **Myers' O(ND)-Algorithmus** und gruppiert das Ergebnis in
`DiffOp[]`. Hält die **Rekonstruktionsinvariante**: alle Marker ablehnen ergibt
Datei 1, alle annehmen ergibt Datei 2. Optionales `ignoreWhitespace`
(`git diff -w`-Stil) plus ein Nachlauf, der reine Whitespace-Marker entfernt.
**Größenschutz**: `maxDiffTokens` lässt `diff()` mit `DiffTooLargeError`
abbrechen, *bevor* der Myers-Lauf das Token-Produkt `n·m` überschreitet (Myers
kann gegen O((n+m)²) Speicher entarten und so den Host einfrieren).

#### [compare/criticmarkup.ts](src/compare/criticmarkup.ts)
`render(ops)` — wandelt `DiffOp[]` in einen CriticMarkup-String, mit den
Delimitern aus `MARKERS`, sodass die erzeugten Marker exakt dem entsprechen, was
der Editor-Parser liest.

#### [compare/compare.ts](src/compare/compare.ts)
Orchestrierung: liest die `kaicrit.compare.*`-Einstellungen,
`compareTextToCriticMarkup(originalText, modifiedText, autoLanguageId)` ist der
geteilte Kern, `compareToCriticMarkup(uri, uri)` öffnet beide Dateien und
delegiert. Der Helfer `diffWithGuard` fängt `DiffTooLargeError`: er versucht
automatisch erneut mit `line`-Granularität (mit Hinweis) und bricht andernfalls
mit Warnung ab. Bei identischen Eingaben (nur `equal`-Ops) erscheint „no
differences" statt eines marker-freien Ergebnisdokuments.

#### [compare/commands.ts](src/compare/commands.ts)
`registerCompareCommands()` — die sechs Compare-Befehle.
`compareWithGitHead` liest die HEAD-Version der aktiven Datei über die
eingebaute `vscode.git`-Extension-API und difft sie gegen den Live-Puffer.

#### `compare/*.test.ts`
Node-`--test`-Suiten für Diff und Renderer.

### 3.4 `src/doublepane/` — Original | Neu nebeneinander

#### [doublepane/build.ts](src/doublepane/build.ts)
`buildDoublePane(source)` — reiner, VS-Code-freier Kern (gleiches Muster wie
`resolve.ts`). Läuft über `findMarkers(source)` und zerlegt das Dokument in zwei
`Pane`s: **original** = Reject-Ergebnis (Deletion + Substitution-alt bleiben),
**modified** = Accept-Ergebnis (Addition + Substitution-neu bleiben); Highlights
und Kommentare erscheinen auf **beiden** Seiten, Klartext-Lücken verbatim auf
beiden, Marker-Delimiter auf keiner. Jeder Lauf trägt einen `PaneSpan`
(`category` + Offsets), dessen Kategorien 1:1 zu
`createContentDecorationTypes()` passen — daher trägt diese Funktion (anders als
`resolveReplacement`) zusätzlich Farbe + Offsets. Getestet in `build.test.ts`.

#### [doublepane/commands.ts](src/doublepane/commands.ts)
`registerDoublePaneCommands(ctx)` — registriert `kaicrit.openDoublePane`. Hält
einen **eigenen** `createContentDecorationTypes()`-Satz (getrennt von dem des
`DecoratorManager`). Handler: aktiven Editor lesen, `buildDoublePane(text)`, zwei
untitled-Dokumente nebeneinander öffnen (`ViewColumn.One` + `Beside`), dann pro
Seite die Spans nach Kategorie gruppieren und `editor.setDecorations` anwenden.
Snapshot-basiert, kein Live-Modus.

### 3.5 `src/preview/` — eingebaute Markdown-Vorschau

#### [preview/markdownIt.ts](src/preview/markdownIt.ts)
`criticMarkupPlugin(md, { commentMetadata })` — eine **markdown-it-Inline-Regel**
mit eigenem Tokenizer (anderer Engine als der Editor-Parser, teilt aber die
Delimiter über `MARKERS`), gestylt durch [media/critic.css](media/critic.css).
Der bewusste Entwurf: als *Inline-Regel* (statt als Quelltext-Vor-/Nachbearbeitung
wie die Python-Tools) schiebt sie **balancierte Token-Paare** in den
markdown-it-Strom statt HTML zu konkatenieren — damit ist „invalides HTML"
strukturell unmöglich. Überlappende Spans (eine Markdown-Span öffnet im Marker
und schließt außerhalb) werden *eingedämmt*: der Body wird mit auf den
Schluss-Marker geklemmtem `posMax` neu tokenisiert, sodass eine kreuzende Span
zu Klartext degradiert statt das Dokument zu zerstören. Der Preis: block-
übergreifende Marker sind außerhalb des Geltungsbereichs. Getestet in
`markdownIt.test.ts` mit einem VS-Code-freien Fake-`state`.

### 3.6 Der Einsprungpunkt

#### [extension.ts](src/extension.ts)
`activate()` verdrahtet alles in der richtigen Reihenfolge:
1. `EnablementManager` zuerst (damit Decorator + CodeLens-Provider sein
   `isEnabled`-Prädikat erhalten).
2. `DecoratorManager`, `StatusBarManager`, `TrackChangesManager`.
3. `registerEditCommands`, dann CodeLens- und Hover-Provider registrieren
   (welcher tatsächlich Aktionen zeigt, entscheidet zur Laufzeit
   `kaicrit.edit.changeActions`).
4. Die Changes-`TreeView` erstellen.
5. Bereits offene Editoren dekorieren und die UI synchronisieren.
6. Die globalen Listener registrieren: `onDidChangeActiveTextEditor`,
   `onDidChangeTextDocument` (hier läuft `tcm.handleChange` **vor**
   `dm.scheduleUpdate`), `onDidCloseTextDocument`, `em.onDidChange`,
   `dm.onDidUpdate`.
7. `registerCompareCommands` und `registerDoublePaneCommands`.
8. **Rückgabe** von `{ extendMarkdownIt }`, womit sich kaicrit in die eingebaute
   Markdown-Vorschau einklinkt. Der `commentMetadata`-Wert wird hier einmal
   gelesen und in die gecachte markdown-it-Instanz „eingefroren" — VS Code bietet
   keine stabile API, sie bei Konfigurationsänderung neu zu bauen, weshalb ein
   `kaicrit.edit.commentMetadata`-Toggle die Vorschau erst nach einem Reload
   erreicht (dokumentierte Einschränkung in `docs/preview.md`).

Alles, was ein `dispose()` hat, landet in `ctx.subscriptions` und wird in
`deactivate()` automatisch aufgeräumt.

### 3.7 Tests

kaicrit nutzt ausschließlich den **eingebauten Node-`--test`-Runner**, keine
externen Test-Frameworks. `npm test` kompiliert nach `out/` und führt jede
`*.test.js` unter `out/{compare,core,doublepane,edit,preview}` aus. Suiten, die
VS-Code-only-APIs berühren (Parser, Navigator, Track Changes), laden zuerst
`edit/vscodeStub.js`, der `require('vscode')` shimt — so läuft die gesamte Suite
**ohne** Extension Host. Die reinen Kerne (`diff`, `resolve`,
`trackChangesEngine`, `build`, `actions`, `comment`) brauchen nicht einmal den
Stub. Dieses Test-Setup ist der direkte Nutzen des „reiner Kern, dünne
Hülle"-Musters aus [Abschnitt 2](#zwei-durchgehende-entwurfsmuster).

---

## 4. Build-Prozess: lokal und als GitHub-Workflow

### Lokaler Build

Voraussetzung ist Node.js (die CI verwendet Node 20). Die relevanten Skripte
stehen in [package.json](package.json) unter `scripts`:

```bash
npm install          # nur beim ersten Mal: Abhängigkeiten installieren
npm run compile      # einmaliger TypeScript-Compile → out/
npm run watch        # inkrementeller Watch-Modus (vor F5 starten)
npm test             # compile + Node-Tests (out/**/*.test.js)
```

- `compile` ruft `tsc -p ./` auf und schreibt das kompilierte JS nach `out/`
  (Zielordner, Source-Maps usw. in [tsconfig.json](tsconfig.json)).
- `watch` (`tsc -watch`) kompiliert inkrementell weiter; ideal während der
  Entwicklung mit laufendem Extension Development Host.
- `test` kompiliert zuerst und führt dann den Node-Test-Runner über alle
  kompilierten `*.test.js` aus.

**Im Editor testen:** **F5** startet den **Extension Development Host** — ein
zweites VS-Code-Fenster mit der geladenen Extension. Änderungen am Code werden
nach einem `watch`-Compile mit **Developer: Reload Window** im Host übernommen,
ohne den Debugger neu zu starten.

**Lokal paketieren / installieren:**

```bash
npx vsce package                       # erzeugt kaicrit-<version>.vsix
code --install-extension kaicrit-*.vsix
```

`vsce package` bündelt Manifest, `out/` und Assets zu einer `.vsix`. Was
ausgeschlossen wird, steht in [.vscodeignore](.vscodeignore); `vscode:prepublish`
(in `scripts`) stellt sicher, dass vor dem Paketieren kompiliert wird.

### Release-Workflow in GitHub Actions

Der Build für Veröffentlichungen ist getaggt-getrieben und in
[.github/workflows/build.yml](.github/workflows/build.yml) definiert (Job
`Release`). Er läuft bei jedem Push eines Tags der Form `v*`:

```yaml
on:
  push:
    tags: ["v*"]
```

Ablauf:
1. `actions/checkout@v4` — Repository auschecken.
2. `actions/setup-node@v4` mit Node 20 und npm-Cache.
3. `npm ci` — reproduzierbare Installation aus der Lockfile.
4. `npm run compile` — TypeScript nach `out/`.
5. `npx @vscode/vsce package --no-dependencies "${GITHUB_REF_NAME#v}"` — packt die
   `.vsix`. `${GITHUB_REF_NAME#v}` entfernt das führende `v` aus dem Tag, sodass
   das Paket exakt die Tag-Version trägt. Das ist der Grund für die
   Release-Reihenfolge unten: die **veröffentlichte** `.vsix` spiegelt immer das
   Git-Tag wider, während die `version` in `package.json` die kanonische Quelle
   für die lokale Entwicklung (F5) ist.
6. `softprops/action-gh-release@v2` mit `files: "*.vsix"` — hängt die gebaute
   `.vsix` an das GitHub-Release des Tags.

Der Workflow braucht `permissions: contents: write`, um das Release anlegen zu
können.

### Dokumentations-Workflow

Parallel dazu baut [.github/workflows/docs.yml](.github/workflows/docs.yml) (Job
`Docs`) bei demselben `v*`-Tag-Push die mit
[MkDocs Material](https://squidfunk.github.io/mkdocs-material/) erstellte
Anwender-Dokumentation aus dem [docs/](docs/)-Ordner (Konfiguration in
[mkdocs.yml](mkdocs.yml)). Es nutzt **mike** für versionierte Docs:
`mike deploy <version> latest --update-aliases --push` und
`mike set-default latest --push`. Hinweis: Diese Entwicklerdokumentation
(`DEVELOPER.md`) liegt im Repo-Wurzelverzeichnis und ist bewusst **nicht** Teil
der MkDocs-Navigation, die sich an Anwender richtet.

### Release-Schritte (Checkliste)

1. `"version"` in [package.json](package.json) auf die neue Version setzen.
2. [CHANGELOG.md](CHANGELOG.md) aktualisieren.
3. Committen: `chore(changelog): Prepare release vX.Y.Z`.
4. Passenden Tag pushen: `git tag vX.Y.Z && git push origin vX.Y.Z`.

Der Tag-Push löst beide Workflows aus: `build.yml` veröffentlicht die `.vsix` am
GitHub-Release, `docs.yml` aktualisiert die Doku-Site.

---

## 5. Deployment: Microsoft Marketplace und Open-Source-Alternative

Eine fertige `.vsix` kann auf zwei großen Wegen verteilt werden. Der aktuelle
CI-Stand veröffentlicht die `.vsix` als **GitHub-Release-Asset** (siehe
[Abschnitt 4](#release-workflow-in-github-actions)); die folgenden Abschnitte
beschreiben, wie man von dort in die beiden Registries kommt.

### 5.1 Visual Studio Marketplace (Microsoft)

Der [Visual Studio Marketplace](https://marketplace.visualstudio.com/) ist das
offizielle, von Microsoft betriebene Verzeichnis, aus dem das normale VS Code
Extensions bezieht.

**Einmalige Einrichtung:**
1. Eine **Azure-DevOps-Organisation** anlegen (der Marketplace nutzt Azure DevOps
   zur Authentifizierung).
2. Dort ein **Personal Access Token (PAT)** mit dem Scope
   *Marketplace → Manage* erstellen.
3. Einen **Publisher** im Marketplace-Verwaltungsportal anlegen. Der Publisher-
   Name muss dem `publisher`-Feld in [package.json](package.json) entsprechen
   (hier `0x2e6b6169`).

**Veröffentlichen** geschieht mit demselben `vsce`-Werkzeug, das auch paketiert:

```bash
vsce login <publisher>          # PAT einmalig hinterlegen
vsce publish                    # paketiert UND lädt hoch
# oder eine bereits gebaute .vsix:
vsce publish --packagePath kaicrit-<version>.vsix
```

**In der CI** lässt sich das automatisieren, indem das PAT als
GitHub-Secret (z. B. `VSCE_PAT`) hinterlegt und im Release-Job ein Schritt
ergänzt wird:

```yaml
- run: npx @vscode/vsce publish --no-dependencies -p "$VSCE_PAT" "${GITHUB_REF_NAME#v}"
  env:
    VSCE_PAT: ${{ secrets.VSCE_PAT }}
```

Voraussetzungen für eine erfolgreiche Veröffentlichung sind ein gültiges
`publisher`-Feld, ein `repository`-Link, ein Icon
(`images/icon.png`, bereits gesetzt) und eine `LICENSE`.

### 5.2 Open-Source-Alternative: Open VSX Registry

Der Visual Studio Marketplace ist proprietär und seine Nutzungsbedingungen
erlauben den Bezug **nur** durch Microsoft-Produkte. Open-Source-Distributionen
von VS Code — **VSCodium**, **Gitpod**, **Eclipse Theia**, viele
Cloud-IDEs — dürfen ihn deshalb nicht ansprechen und beziehen Extensions
stattdessen aus der [**Open VSX Registry**](https://open-vsx.org/), einem von der
**Eclipse Foundation** betriebenen, quelloffenen, herstellerneutralen
Verzeichnis. Wer kaicrit auch diesen Nutzern zugänglich machen will,
veröffentlicht zusätzlich dorthin.

**Einmalige Einrichtung:**
1. Bei [open-vsx.org](https://open-vsx.org/) anmelden (über GitHub).
2. Die Publisher-Vereinbarung der Eclipse Foundation signieren.
3. Ein **Access Token** erzeugen.

**Veröffentlichen** mit dem `ovsx`-CLI (dem Open-VSX-Pendant zu `vsce`):

```bash
npx ovsx publish kaicrit-<version>.vsix -p "$OVSX_PAT"
```

**In der CI** analog zum Marketplace-Schritt, mit einem eigenen Secret
(`OVSX_PAT`):

```yaml
- run: npx ovsx publish --no-dependencies -p "$OVSX_PAT" "*.vsix"
  env:
    OVSX_PAT: ${{ secrets.OVSX_PAT }}
```

### 5.3 Zusammenfassung der Vertriebswege

| Weg | Registry / Betreiber | Werkzeug | Zielgruppe |
|---|---|---|---|
| GitHub-Release (aktiv) | GitHub | `vsce package` + `action-gh-release` | manuelle `.vsix`-Installation |
| Visual Studio Marketplace | Microsoft | `vsce publish` | reguläres VS Code |
| Open VSX Registry | Eclipse Foundation | `ovsx publish` | VSCodium, Gitpod, Theia, Cloud-IDEs |

Üblich ist es, alle drei Wege aus demselben getaggten Release-Workflow zu
bedienen: einmal paketieren, dann an GitHub anhängen **und** in beide Registries
veröffentlichen.

---

## Weiterführende Dokumente

- [README.md](README.md) — Funktionsüberblick und Anwenderdoku.
- [CLAUDE.md](CLAUDE.md) — kompakte, stets aktuelle Architekturnotizen pro Datei.
- [docs/](docs/) — vertiefende Anwenderdokumentation (auch als MkDocs-Site).
- [CHANGELOG.md](CHANGELOG.md) — Versionshistorie.
</content>
</invoke>
