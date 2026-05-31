# kaicrit – Beispiel mit allen Markup-Typen

Dieses Dokument enthält **alle fünf** CriticMarkup-Typen. Es dient zum Testen
der Editor-Dekorationen, der Overview-Ruler-Markierungen, der Statusleisten-
Zähler, der Changes-Sidebar, der Inline-CodeLens, der Accept/Reject-Befehle und
der Markdown-Preview.

## Deletion (⊟)

Der schnelle braune {--und flinke --}Fuchs springt über den faulen Hund.

## Addition (⊞)

Der schnelle {++braune ++}Fuchs springt über den {++sehr ++}faulen Hund.

## Substitution (⇄)

Dieser Satz braucht eine {~~Klarstelung~>Klarstellung~~}, danke.

Eine zweite Ersetzung: heute ist {~~Montag~>Sonntag~~}.

## Highlight (☰)

Dieser {==Abschnitt ist besonders wichtig==} und sollte gelesen werden.

## Kommentare (💬)

Hier ein einfacher Kommentar. {>>Bitte noch eine Quelle ergänzen.<<}

### Kommentar mit Metadaten (Autor + Datum)

Dieser Befund ist unklar. {>>@kai 2026-05-31: Bitte mit der Statistik abgleichen.<<}

Nur Autor: {>>@kai: sieht gut aus<<}

Nur Datum: {>>2026-05-31: später nochmal prüfen<<}

Gewöhnlicher Doppelpunkt ist KEINE Metadaten: {>>Hinweis: siehe oben<<}

### Mehrzeiliger Kommentar

Ein längerer Hinweis. {>>Erste Zeile der Notiz.
Zweite Zeile, gehört noch zum selben Kommentar.<<} und weiter im Text.

## Pfeilloses `{~~ ~~}` (KEIN gültiger Marker)

Dieser Ausdruck {~~ohne Pfeil~~} ist laut Spezifikation kein Marker und muss als
ganz normaler Text dargestellt werden – weder im Editor noch in der Preview als
Änderung.

## Verschachteltes Markdown in Markern

Eine Ergänzung mit {++**fetter** und *kursiver* Formatierung++} zum Testen der
Preview-Inline-Verarbeitung.
