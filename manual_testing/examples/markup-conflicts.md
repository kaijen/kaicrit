# kaicrit – Konflikte: das eigentliche Markup gewinnt

**Designprinzip:** CriticMarkup ist eine Schicht **über** Markdown. Wo eine Marke
gültiges Markdown aufbrechen würde, gewinnt das echte Markdown: die Preview
degradiert die Marke **zu Klartext**, statt kaputtes HTML zu erzeugen. Keiner
dieser Fälle sollte beim sauberen Schreiben je nötig sein – sie entstehen nur
durch fehlerhaftes Von-Hand-Tippen (die Insert-Befehle, Track Changes und
Compare erzeugen so etwas nie).

**Wichtig für alle Abschnitte:** Die Preview darf **niemals** kaputtes HTML
zeigen – keine abgeschnittenen Tags, keine Formatierung, die „ausblutet" und den
Rest des Dokuments mitreißt. Das Dokument bleibt immer wohlgeformt.

> Beobachte jeden Abschnitt **doppelt**: einmal im **Editor** (Dekorationen) und
> einmal in der **Preview** (`Ctrl+Shift+V`). Editor und Preview verhalten sich
> bei block-übergreifenden Marken **unterschiedlich** – das ist gewollt (siehe
> §13 der Anleitung).

## A. Span-Overlap – Markdown-Span öffnet in der Marke, schließt außerhalb

Ein {++**fett++} und hier geht der Text weiter**.

Erwartung Preview: Das `**` findet innerhalb der Marke keinen Partner und steht
als **literales** `**` da. Die Einfügung wird zwar als Einfügung gerendert, aber
die Fett-Formatierung blutet **nicht** in den restlichen Absatz aus.

## B. Block-übergreifende Marke – öffnet in einem Absatz, schließt im nächsten

Dieser Absatz beginnt eine Einfügung {++hier oben

und schließt sie erst nach einer Leerzeile++} im nächsten Absatz.

Erwartung: **Editor** dekoriert dies als **eine** Einfügung über die Leerzeile
hinweg (der Parser ist block-agnostisch). **Preview** rendert es **nicht** als
Edit – `{++` / `++}` bleiben Klartext, beide Absätze rendern als normales
Markdown.

## C. Block-übergreifender Kommentar – Leerzeile beendet den Absatz

Ein Kommentar mit Leerzeile {>>Erste Zeile.

Zweite Zeile nach der Leerzeile.<<} und weiter im Text.

Erwartung: **Editor** dekoriert den ganzen Bereich als **einen** Kommentar.
**Preview** rendert **keinen** durchgehenden Kommentar (die Leerzeile beendet
den Markdown-Absatz und damit die Spanne); `{>>` / `<<}` bleiben Klartext.
(Mehrzeilige Kommentare **ohne** Leerzeile funktionieren in beiden – siehe
`all-markers.md`.)

## D. Unbalancierte / nicht geschlossene Marke

Diese Einfügung {++ wird nie geschlossen und läuft bis zum Zeilenende.

Erwartung: **Weder** Editor **noch** Preview rendern einen Edit; `{++` bleibt
Klartext, das Dokument bleibt wohlgeformt.

## E. Marke bricht Block-Syntax (über Listenelemente hinweg)

- Erster Punkt {--überflüssig
- Zweiter Punkt--} bleibt

Erwartung: Die Liste rendert in der **Preview** als normale Liste; die `{--` /
`--}` erscheinen als Text **innerhalb** der Listenpunkte, nicht als Löschung über
die Listengrenze hinweg. Der **Editor** darf die Löschung über die Zeilen hinweg
dekorieren. In keinem Fall werden die `<li>`-Strukturen zerrissen.
