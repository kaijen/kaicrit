// Diese Datei hat die Sprache "javascript" und ist daher standardmäßig
// NICHT in kaicrit.enabledLanguages (["markdown","plaintext"]) enthalten.
// Sie dient zum Testen der Per-Datei-Umschaltung ($(eye) CriticMarkup) und
// der kaicrit.enabledLanguages-Einstellung.

function greet(name) {
  // {--var--}{++const++} würde hier eine Änderung markieren
  const message = "Hallo, " + name;
  return message; // {>>@kai 2026-05-31: Template-Literal wäre schöner<<}
}

// {~~console.log~>logger.info~~}(greet("Welt"));
console.log(greet("Welt"));
