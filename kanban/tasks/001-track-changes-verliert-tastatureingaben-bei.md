---
id: 1
title: Track Changes verliert Tastatureingaben bei schnellem Tippen
status: done
priority: high
created: 2026-06-26T10:40:16.349946689+02:00
updated: 2026-06-26T12:46:40.799876493+02:00
started: 2026-06-26T12:46:40.799875393+02:00
completed: 2026-06-26T12:46:40.799875393+02:00
tags:
    - bug
    - track-changes
    - v0.16.2
claimed_by: self
claimed_at: 2026-06-26T12:46:40.799876293+02:00
class: standard
---

## Symptom

Im Track-Changes-Modus werden bei schnellem Tippen Editor-Änderungen NICHT als CriticMarkup gewrappt. Die getippten Zeichen landen als unverfolgter Klartext im Dokument. Bei langsamem Tippen funktioniert alles korrekt.

## Ursache (Root Cause)

Race Condition zwischen synchronen Tastatureingaben und dem asynchronen `applyEdit` in `edit/trackChanges.ts`.

Ablauf pro Tastendruck (`handleChange`):
1. Event feuert, `applyingOwnEdit` ist leer -> wird verarbeitet.
2. Kompensierender WorkspaceEdit wird berechnet, `applyingOwnEdit.add(key)` (Zeile 220).
3. `vscode.workspace.applyEdit(we)` ist ASYNC -> liefert ein Promise, `handleChange` kehrt sofort zurueck.
4. `applyingOwnEdit` bleibt gesetzt, BIS das Promise aufgeloest ist.

Tippt der Nutzer das naechste Zeichen, BEVOR das Promise resolved:
- `handleChange` feuert erneut.
- Zeile 163: `if (this.applyingOwnEdit.has(key)) { return; }` -> Event wird KOMMENTARLOS verworfen.
- Das Zeichen wird nie gewrappt; der `shadow`-Snapshot wird fuer dieses Event NICHT aktualisiert.

Wenn das applyEdit-Promise schliesslich resolved:
- `applyingOwnEdit.delete(key)`, `shadow` = aktueller Dokumenttext (inkl. des unverfolgten Zeichens).
- Das Zeichen bleibt dauerhaft unverfolgter Klartext.

Kernproblem: Der Guard `applyingOwnEdit` ist ein ZEITFENSTER, kein Event-Zaehler. Er kann nicht zwischen
(a) dem vom Recorder selbst ausgeloesten Kompensations-Event (soll verworfen werden) und
(b) einer echten neuen Nutzereingabe, die im selben Fenster eintrifft (soll verarbeitet werden)
unterscheiden. Beide werden verworfen. Es gibt keine Queue.

## Sekundaerer Faktor

Die Shadow-Konsistenzpruefung (Zeile 189-195, issue #68) verstaerkt das Problem: Da `shadow` erst nach dem async applyEdit aktualisiert wird, kann bei schnellem Tippen die Pre-Edit-Geometrie eingehender Events nicht zum veralteten Shadow passen -> Event wird uebersprungen (`consistent === false`) und nur resynct, nicht getrackt.

## Warum bei langsamem Tippen ok

Jedes applyEdit-Promise resolved (kurzer Async-Hop) bevor der naechste Tastendruck eintrifft -> das Guard-Fenster ist leer, wenn das naechste Event feuert.

## Loesungsvorschlaege

### Option A (empfohlen): Event-Queue + synchrone Shadow-Pflege
- Boolean-Guard durch eine Per-Dokument-Warteschlange ersetzen.
- Eingehende Events nicht verwerfen: pruefen, ob das Event der eigene Kompensations-Edit ist (Geometrie/Replacement gegen den eingereichten `we` matchen). Falls ja -> konsumieren. Falls nein -> echte Nutzereingabe: Shadow sofort in-memory per RawEdit fortschreiben und Edit einreihen.
- Kompensierende applyEdits serialisieren (nur eines in flight); nach Resolve den naechsten gequeueten Batch gegen den aktuellen Shadow berechnen.
- Vorteil: kein Event geht je verloren. Aufwand: hoeher, neue Concurrency-Logik + Tests.

### Option B (einfacher): Debounce + Batch wie der Decorator
- Recorder nicht synchron pro Event reagieren lassen, sondern RawEdits in einem Per-Doc-Puffer sammeln und nach kurzer Idle-Phase (analog `decorationDebounce`, 150ms) EINEN Kompensations-Edit fuer den ganzen Batch berechnen (Diff shadow -> live).
- Vorteil: strukturell race-arm (alle schnellen Tastendruecke werden gesammelt, bevor ueberhaupt ein applyEdit feuert); wiederverwendet ein vorhandenes Muster.
- Nachteil: Marker erscheinen erst nach Tipp-Pause (minimaler visueller Versatz); Batch-Diff ist komplexer als die diskrete Per-Edit-Klassifikation der Engine.

### Option C (Mitigation): self-edit per Event-Zaehler statt Zeitfenster konsumieren
- Guard so umbauen, dass er genau das EINE erwartete Kompensations-Event konsumiert (Match gegen den eingereichten Edit) und alle anderen Events im Fenster regulaer verarbeitet.
- Teilloesung; bei mehreren parallelen in-flight Edits weiterhin fragil. Sinnvoll als Baustein von Option A.

## Reproduktion / Test

`vscodeStub` erlaubt via `setApplyEditImpl` ein PENDING-Promise. Ein Regressionstest sollte: applyEdit pending halten, ein zweites Nutzer-Event feuern und pruefen, dass es nach Resolve nicht verloren ist. Aktuell gibt es keinen Concurrency-Test, der das in-flight-Fenster mit echten Folge-Eingaben abdeckt.

## Betroffene Artefakte

- src/edit/trackChanges.ts (handleChange Zeile 158-241; Guard Zeile 163, 220-240)
- src/edit/trackChangesEngine.ts (ggf. Batch-Diff fuer Option B)
- src/edit/trackChanges.test.ts (+ Concurrency-Regressionstest)
- src/edit/vscodeStub.ts (pending applyEdit ist bereits vorhanden)
- CLAUDE.md / docs (Architektur-Notiz zur Serialisierung)

[[2026-06-26]] Fri 11:09
Option A umgesetzt.

Engine (trackChangesEngine.ts) — neue pure, getestete Helfer:
- applyRawEdits / applyCompEdits: Replay von Roh-/Kompensations-Edits in einen String (Shadow == Dokument).
- diffSingleEdit: minimaler Single-Edit (Prefix/Suffix) für den koordinatenfreien Reconcile.
- matchesSelfEdit: erkennt das Echo des eigenen WorkspaceEdit.

Recorder (trackChanges.ts):
- shadow wird jetzt durch Replay JEDES Change-Events synchron == Dokument gehalten (statt async getText()).
- Eigene Kompensations-Edits werden pro Dokument serialisiert (compensating-Map mit edits+expected).
- Während ein Edit in flight ist: Echo -> per matchesSelfEdit konsumiert; echte Nutzereingabe -> in Shadow gespiegelt + dirty.
- Bei Settle mit dirty: reconcile() wrappt den geracten Text via diffSingleEdit(expected, shadow) (koordinatenfrei, keine Korruption) -> KEINE Eingabe geht verloren.
- applyingOwnEdit bleibt als separater Guard nur noch fuer applyResolution/applyAuthoringEdit (#42/#44).

Tests: 172/172 gruen. Neu: Race-Test (geracte Eingabe wird gewrappt, nicht verworfen), Clean-Settle-ohne-Reconcile, 9 Helfer-Tests. tsc strict sauber.

Doku: docs/track-changes.md (How it works + Known limitations), CLAUDE.md (beide Engine-/Recorder-Eintraege).

Caveats: ESLint lokal nicht lauffaehig (devdeps @eslint/js/eslint v10 fehlen im node_modules — vorbestehend). Manuelle F5-Verifikation im Extension Host empfohlen. Rare cross-at-buffer-Race kann getrennte statt zusammengefasste Marker erzeugen ({++a++}{++b++}) — korrekt, kein Verlust.

[[2026-06-26]] Fri 12:46
Released in v0.16.2 (commit 946beb6, tag v0.16.2 gepusht). Bugfix-Bump 0.16.1 -> 0.16.2, CHANGELOG + Compare-Links gepflegt.
