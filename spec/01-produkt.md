# 01 · Produkt

## Was es ist

Ein Verwaltungssystem für kleine Betriebe, das ohne Server auskommt. Was sonst
in einer Datenbank läge — Zugang, Freischaltung, Laufzeit und sämtliche
erfassten Daten — steckt in **einer verschlüsselten Datei**, die der Kunde
besitzt. Das Programm ist nur die Anwendung, die diese Datei öffnet, anzeigt und
zurückschreibt.

Zwei Kunden mit demselben Programm sehen völlig Verschiedenes, weil sie
verschiedene Dateien haben. Ohne Datei zeigt das Programm einen Anmeldebildschirm
und sonst nichts.

## Drei Rollen

| Rolle | Programm | Besitzt |
| --- | --- | --- |
| Anbieter | `hz-lizenz-generator.html` | `hz-haendler-schluessel.json` (privat) |
| Kunde | `hz-erp-system.html` | seine Lizenzdatei + Passwort |
| Das ERP selbst | — | den **öffentlichen** Händlerschlüssel |

Die dritte Rolle ist die entscheidende: Weil der öffentliche Schlüssel fest im
ERP-Programm steckt, kann es die Echtheit einer Lizenz beurteilen, ohne
irgendwo nachzufragen. Genau das ersetzt den Lizenzserver.

## Lebenslauf einer Lizenz

**Einmalig beim Anbieter.** Schlüsselpaar im Generator erzeugen. Der private
Teil bleibt beim Anbieter, der öffentliche wird als `src/vendor-key.js` ins
Projekt übernommen und mit eingebaut.

**Ausstellen.** Anbieter entsperrt seine Schlüsseldatei, trägt Kundenname,
Laufzeit und Module ein, lässt ein Passwort erzeugen. Der Generator verschlüsselt
und signiert. Datei und Passwort gehen über **getrennte Wege** zum Kunden.

**Arbeiten.** Der Kunde meldet sich mit Datei und Passwort an, erfasst Zeiten
oder bucht. Jede Änderung wird gut eine Sekunde später automatisch in seine Datei
zurückgeschrieben.

**Verlängern oder nachrüsten.** Der Kunde schickt die Datei zurück. Der Anbieter
öffnet sie mit seinem Händlerschlüssel — ohne Kundenpasswort —, ändert Laufzeit
oder Module, signiert neu und schickt zurück. Die erfassten Daten bleiben.

## Was beim Anmelden passiert

Fünf Schritte, in dieser Reihenfolge, jeder mit eigener Fehlermeldung:

1. **Format erkennen.** Altformat und Fremddateien werden hier abgewiesen.
2. **Schlüssel aus dem Passwort ableiten und Datenschlüssel auspacken.**
   Schlägt das fehl, war das Passwort falsch. Es gibt kein gespeichertes
   Passwort, das verglichen würde — die Entschlüsselung *ist* die Prüfung.
3. **Inhalt entschlüsseln.** Erst jetzt existieren Kundenname, Laufzeit und
   Module als lesbarer Text.
4. **Signatur prüfen.** Schlägt sie fehl, bricht die Anmeldung ab. Hier
   scheitert jede von Hand veränderte Datei.
5. **Laufzeit prüfen.** Fehlendes oder unsinniges Datum gilt als abgelaufen.

Erst danach erscheint die Oberfläche. Kacheln und Navigationseinträge richten
sich nach den freigeschalteten Modulen.

## Module

| Schlüssel | Name | Zustand |
| --- | --- | --- |
| `zeiterfassung` | Zeiterfassung | gebaut |
| `hauptbuch` | Hauptbuch | gebaut |
| `lager` | Lagerverwaltung | angemeldet, leer |
| `lohn` | Lohnabrechnung | angemeldet, leer |
| `crm` | CRM | angemeldet, leer |

Ein Modul hat zwei unabhängige Zustände: **gebaut** (existiert der Code?) und
**freigeschaltet** (steht es in der Lizenz?). Nur wenn beides zutrifft, ist es
benutzbar. Die drei leeren Module sind absichtlich schon angemeldet, damit
Kunden sehen, was kommt, und der Anbieter sie vorab verkaufen kann.

### Zeiterfassung

Monatskalender, Klick auf einen Tag öffnet dessen Buchungen. Pro Tag mehrere
Kommen/Gehen-Paare mit je zwei Pausen. Berechnet Nettozeit je Buchung, Tages-
und Monatssumme. Schichten über Mitternacht werden korrekt behandelt (negative
Differenz plus 24 Stunden).

### Hauptbuch

Doppelte Buchführung. Kontenrahmen in Anlehnung an SKR03, eigene Konten
ergänzbar, benutzte Konten sind nicht löschbar. Fünf Ansichten: Kontenplan mit
Salden, Buchungsmaske, Kontenblatt mit laufendem Saldo, Bilanz, GuV.

Salden richten sich nach dem Kontotyp: Bei `aktiva` und `aufwand` gilt
Soll minus Haben, bei `passiva` und `ertrag` umgekehrt. Das Jahresergebnis aus
der GuV wandert automatisch auf die Passivseite der Bilanz. Weichen Aktiva und
Passiva um mehr als einen Cent ab, wird gewarnt.

Der Kontenrahmen ist eine praktische Vorlage, ausdrücklich keine steuerlich
geprüfte. Dieser Hinweis gehört in den Code und darf nicht verschwinden.

## Speicherverhalten

**Chrome und Edge** beherrschen die File System Access API: Das Programm
schreibt direkt in dieselbe Datei zurück und merkt sich das Handle in IndexedDB,
sodass beim nächsten Start ein Klick genügt. Automatisches Speichern rund eine
Sekunde nach der letzten Änderung, `Strg+S` erzwingt es sofort.

**Firefox und Safari** haben diese Schnittstelle nicht. Dort wird beim
Speichern eine aktualisierte Datei heruntergeladen, die die bisherige ersetzt;
ein Banner erklärt das. Automatisch geschieht das dort **nicht** — sonst läge
nach einer Stunde Arbeit ein Dutzend Dateien im Download-Ordner.

Dieser Unterschied ist bewusst und darf nicht „vereinheitlicht" werden.

## Betriebsfälle, die bedacht sein wollen

**Kunde vergisst sein Passwort.** Eingeplant: Der Anbieter öffnet die Datei mit
seinem Händlerschlüssel und vergibt im Reiter *Lizenz verlängern* ein neues.
Daten bleiben vollständig.

**Anbieter verliert Hauptpasswort oder Schlüsseldatei.** Kein
Wiederherstellungsweg. Bestehende Kunden arbeiten weiter, weil ihr Programm die
alten Signaturen weiter anerkennt. Aber nichts kann mehr verlängert oder neu
ausgestellt werden. Nach einem neuen Schlüsselpaar brauchen alle Kunden ein
neues Programm **und** eine neu ausgestellte Lizenz.

**Lizenz läuft bald ab.** Ab 30 Tagen Restlaufzeit erscheint beim Anmelden ein
Hinweis, ab 14 Tagen in Rot.

**Datei wurde verändert.** Anmeldung wird mit klarer Meldung verweigert.
