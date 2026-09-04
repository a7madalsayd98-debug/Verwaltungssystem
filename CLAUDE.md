# HZ Erp-System — Arbeitsanweisung für KI-Modelle

Dezentrales, dateibasiertes ERP-System. Es gibt keinen Server: die verschlüsselte
Lizenzdatei des Kunden ist zugleich Zugang, Freischaltung und Datenspeicher.

Die beiden HTML-Dateien im Wurzelverzeichnis sind **Bauergebnisse**. Niemals von
Hand bearbeiten — jede Änderung dort geht beim nächsten Build verloren. Quelle
ist `src/`, zusammengefügt von `build.ps1`.

## Vorgehen

1. **Immer zuerst** `spec/00-konstitution.md` lesen. Die Regeln dort sind nicht
   verhandelbar und überstimmen jede andere Überlegung.
2. Danach **nur** das Dokument laden, das zur konkreten Aufgabe gehört:

| Aufgabe | Dokument |
| --- | --- |
| Verstehen, was das Produkt tut und für wen | `spec/01-produkt.md` |
| Datei anlegen, Modul ergänzen, Ladereihenfolge, Schichten | `spec/02-architektur.md` |
| Lizenzformat, Kryptografie, Signaturumfang, Migration | `spec/03-lizenzformat.md` |
| Code schreiben: Namen, Sprache, Kommentare, Muster | `spec/04-code-stil.md` |
| Oberfläche: CSS, Farben, Komponenten, Bedienbarkeit | `spec/05-oberflaeche.md` |
| Bauen, testen, im Browser prüfen, committen | `spec/06-arbeitsablauf.md` |
| Was als Nächstes ansteht, mit Abnahmekriterien | `spec/07-aufgaben.md` |
| Schritt-für-Schritt-Rezepte für häufige Änderungen | `spec/08-rezepte.md` |

Diese Aufteilung existiert, damit nicht bei jeder Kleinigkeit das gesamte
Regelwerk gelesen werden muss. Nicht alles auf einmal laden.

## Kürzestfassung

- Kein Server, keine Fremdbibliothek, kein npm, kein Node, kein Python.
  Werkzeuge sind PowerShell-Skripte.
- Nach **jeder** Quelländerung bauen:
  `powershell -ExecutionPolicy Bypass -File build.ps1`
- Wurde etwas an der Kryptografie geändert: `test/selbsttest.html` über
  `tools/serve.ps1` starten und grün bekommen, bevor committet wird.
- Der private Händlerschlüssel steht **niemals** im Code oder im Repository.
- Oberfläche auf Deutsch, Bezeichner und Kommentare im Code ohne Umlaute.
