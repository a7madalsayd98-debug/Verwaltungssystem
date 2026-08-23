# Verwaltungssystem

Zwei eigenständige, browserbasierte Verwaltungssysteme. Beide laufen komplett lokal
ohne Server oder Datenbank – die Daten liegen in einer Lizenz-/Datendatei (JSON),
die der Anwender selbst auswählt und speichert.

## HZ Erp-System (deutsch)

| Datei | Zweck |
| --- | --- |
| [hz-erp-system.html](hz-erp-system.html) | Die Anwendung für den Kunden |
| [hz-lizenz-generator.html](hz-lizenz-generator.html) | Interner Generator für Lizenzdateien |

**Anmeldung:** Lizenzdatei (`.json`) auswählen und Passwort eingeben. Das Passwort wird
als SHA-256-Hash mit Salt geprüft (`crypto.subtle`), es wird nie im Klartext gespeichert.

**Module:** Freigeschaltet wird pro Kunde über die Lizenzdatei.

- Zeiterfassung – fertig
- Hauptbuch – fertig
- Lagerverwaltung, Lohnabrechnung, CRM – geplant

**Speichern:** In Chrome/Edge schreibt die Anwendung über die File System Access API
direkt in die geöffnete Datei zurück; in anderen Browsern wird die Datei als Download
neu ausgegeben.

**Hinweis zur Lizenzprüfung:** Die Konstante `GAS_WEBAPP_URL` in `hz-erp-system.html`
enthält noch den Platzhalter `DEINE_APPS_SCRIPT_WEBAPP_URL`. Ohne echte Apps-Script-URL
findet keine Online-Prüfung des Geräte-Check-ins statt.

## نظام الفلاشة المعزول (arabisch)

Die ältere, mehrseitige Variante desselben Konzepts:

- [index.html](index.html) – Anmeldung
- [dashboard.html](dashboard.html) – Übersicht
- [customers.html](customers.html) – Kundenverwaltung
- [employees.html](employees.html) – Mitarbeiterverwaltung
- [inventory.html](inventory.html) – Lager und Rechnungen
- [common.js](common.js) – gemeinsame Funktionen

## Benutzung

Die jeweilige HTML-Datei im Browser öffnen. Für Passwort-Hashing und das direkte
Zurückschreiben in die Datei ist ein sicherer Kontext nötig – `file://` und `https://`
funktionieren, einfaches `http://` auf einer fremden Domain nicht.
