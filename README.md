# HZ Erp-System

Ein dezentrales Verwaltungssystem für kleine Betriebe. Es gibt keinen Server und
keine Datenbank: Programm und Daten liegen als Dateien beim Anwender, auf der
lokalen Platte, einem USB-Stick oder in einem lokal eingebundenen Cloud-Ordner
(OneDrive, Dropbox, Google Drive, Nextcloud). Wer die Datei hat, hat alles –
und wer sie nicht hat, kommt an nichts.

| Datei | Für wen |
| --- | --- |
| [hz-erp-system.html](hz-erp-system.html) | Kunde |
| [hz-lizenz-generator.html](hz-lizenz-generator.html) | intern |

Beide Dateien sind Bauergebnisse. Bearbeitet wird `src/`, siehe [Entwicklung](#entwicklung).

---

## Wie die Lizenzdatei geschützt ist

Eine Lizenzdatei (`.json`) ist zugleich Zugangsschlüssel, Freischaltung und
Datenspeicher. Sie ist deshalb doppelt abgesichert, und zwar gegen zwei ganz
verschiedene Dinge.

**Verschlüsselung schützt den Inhalt.** Die gesamte Datei – Kundenname, Laufzeit,
Module und sämtliche erfassten Daten – liegt als AES-256-GCM-Chiffrat vor. Im
Klartext steht nur, dass es sich um eine HZ-Lizenzdatei handelt. Wer sie auf dem
Transportweg abfängt, sieht nichts. Der Schlüssel dazu wird mit PBKDF2-HMAC-SHA256
über 310.000 Runden aus dem Kundenpasswort abgeleitet.

**Die Signatur schützt die Berechtigungen.** Laufzeit, Kundenname und Modulfreigabe
sind mit ECDSA über P-256 signiert. Das ERP-System prüft diese Signatur bei jeder
Anmeldung gegen den öffentlichen Händlerschlüssel und verweigert den Start, wenn
sie nicht stimmt. Ein Kunde kann seine Datei zwar entschlüsseln – er hat ja das
Passwort – aber er kann sie nicht neu signieren. Verlängert er die Laufzeit oder
hakt Module an, bricht die Signatur und die Datei ist wertlos.

Signiert wird bewusst nur der Anspruchsteil, nicht die erfassten Daten. Deshalb
bleibt die Signatur gültig, während der Kunde ganz normal arbeitet und speichert.

### Warum es zwei Verpackungen für denselben Schlüssel gibt

Der eigentliche Datenschlüssel wird zufällig erzeugt und dann zweimal verpackt:
einmal mit dem Kundenpasswort und einmal für den Händler (ECDH P-256 mit HKDF).

Das löst zwei Probleme auf einmal. Der Kunde kann sein Passwort jederzeit selbst
ändern, ohne dass die Daten neu verschlüsselt werden müssen – es wird nur die eine
Verpackung ausgetauscht. Und der Händler kann eine Lizenz zur Verlängerung öffnen,
auch wenn der Kunde sein Passwort inzwischen geändert hat, ohne dieses Passwort je
zu kennen.

### Was dieser Aufbau nicht leistet

Das ERP-System läuft vollständig im Browser des Kunden; der Quelltext liegt bei
ihm. Wer JavaScript beherrscht, kann die Prüffunktion herausschneiden. Die
Signatur hebt die Hürde von „Editor öffnen, Datum ändern" auf „Programm umbauen" –
weiter kommt man ohne Server prinzipiell nicht. Für den praktischen Fall ist genau
dieser Unterschied entscheidend.

---

## Einrichtung (einmalig)

Der private Signaturschlüssel ist das einzige echte Geheimnis des Systems. Er
steht bewusst **nicht** im Programmcode, sondern in einer eigenen Datei, die nur
Sie besitzen. Deshalb darf der Generator auch öffentlich erreichbar sein: ohne
Ihre Schlüsseldatei erzeugt er nichts, was das ERP-System anerkennen würde.

1. `hz-lizenz-generator.html` öffnen.
2. **Neues Schlüsselpaar einrichten** und ein Hauptpasswort vergeben.
   Es gibt keinen Wiederherstellungsweg.
3. Zwei Dateien entstehen:
   - `hz-haendler-schluessel.json` – **privat.** In einen lokalen oder lokal
     eingebundenen Cloud-Ordner legen und sichern. Niemals weitergeben, niemals
     ins Repository (`.gitignore` hält das ab).
   - `vendor-key.js` – nur der öffentliche Anteil. Damit `src/vendor-key.js`
     ersetzen.
4. `build.ps1` ausführen und die neuen Dateien einchecken.

Solange in `src/vendor-key.js` der Platzhalter steht, weist das ERP-System jede
Lizenz ab – es könnte deren Echtheit sonst nicht prüfen. `build.ps1` weist darauf hin.

---

## Täglicher Betrieb

**Neue Lizenz.** Schlüsseldatei entsperren, Kundenname, Passwort erzeugen lassen,
Laufzeit und Module wählen. Datei und Passwort danach über **getrennte Wege**
zustellen – etwa die Datei per WhatsApp, das Passwort telefonisch.

**Verlängern oder Module nachrüsten.** Reiter *Lizenz verlängern*. Ihr
Händlerschlüssel öffnet die Datei ohne Kundenpasswort. Die erfassten Daten des
Kunden bleiben dabei vollständig erhalten.

Die Modulhaken zeigen den Stand aus der eingelesenen Datei. Ist die Signatur
ungültig, warnt der Generator ausdrücklich – dann bitte gegen die eigenen
Unterlagen prüfen, statt die Haken zu übernehmen.

**Alte Lizenzen umstellen.** Dateien der ersten Version sind unverschlüsselt und
unsigniert; das ERP-System nimmt sie nicht mehr an. Der Reiter *Altformat
übernehmen* liest sie ein und stellt sie mitsamt allen erfassten Daten neu aus.
Das Passwort lässt sich nicht übernehmen – gespeichert war nur dessen Hashwert –
der Kunde erhält also ein neues.

---

## Für den Kunden

Anmeldung mit Lizenzdatei und Passwort. In Chrome und Edge schreibt das Programm
über die File System Access API direkt in die geöffnete Datei zurück und merkt sie
sich, sodass beim nächsten Start ein Klick genügt. Gespeichert wird automatisch,
kurz nach jeder Änderung; `Strg+S` erzwingt es sofort.

In Firefox und Safari fehlt diese Schnittstelle. Dort wird beim Speichern eine
aktualisierte Datei heruntergeladen, die die bisherige ersetzt; ein Hinweisbanner
erklärt das im Programm.

Enthalten sind Zeiterfassung und Hauptbuch (Kontenplan, Buchungen, Kontenblatt,
Bilanz, GuV). Lagerverwaltung, Lohnabrechnung und CRM sind vorbereitet, aber noch
nicht gebaut.

---

## Weiterentwickeln durch andere (SpecKit)

Wer an diesem Projekt weiterarbeitet — Mensch oder KI-Modell — beginnt bei
[CLAUDE.md](CLAUDE.md). Von dort führt ein Wegweiser in `spec/`, wo Prinzipien,
Architektur, Lizenzformat, Code-Stil, Oberfläche, Arbeitsablauf, offene Aufgaben
und Schritt-für-Schritt-Rezepte getrennt abgelegt sind. Die Aufteilung ist
Absicht: für eine Textänderung muss niemand das gesamte Regelwerk lesen.

`spec/00-konstitution.md` ist dabei bindend und gilt vor allem anderen.

## Entwicklung

```
CLAUDE.md            Einstieg für alle, die weiterentwickeln
spec/                Regelwerk: Konstitution, Architektur, Format, Stil, Rezepte
src/
  core/          gemeinsam genutzt von beiden Anwendungen
    hz-crypto.js      Primitive: PBKDF2, AES-GCM, ECDSA, ECDH, kanonisches JSON
    hz-license.js     Lizenzformat HZL2: versiegeln, öffnen, prüfen, neu signieren
    hz-store.js       Dateizugriff, gemerkte Dateihandles, Rückfallwege
    hz-ui.js          Toasts, Dialoge, Farbschema, HTML-Escaping
    hz-keystore.js    Händler-Schlüsseldatei (nur Generator)
    hz-core.css       Design-System, hell und dunkel
  erp/           Kundenanwendung: Schale + je ein Modul pro Datei
  gen/           Generator
  vendor-key.js  öffentlicher Händlerschlüssel
test/
  selbsttest.html   23 Prüfungen der Krypto-Schicht, inklusive Angriffsfälle
tools/
  serve.ps1         Entwicklungsserver für localhost
build.ps1           fügt src/ zu den beiden Einzeldateien zusammen
```

Ausgeliefert wird bewusst je eine Einzeldatei – der Kunde soll doppelklicken
können. Bearbeitet wird bewusst modular, damit eine kleine Änderung nicht das
Lesen einer 1500-Zeilen-Datei erzwingt.

```bash
powershell -ExecutionPolicy Bypass -File build.ps1
```

### Prüfen

Der Selbsttest braucht einen sicheren Kontext. Über `file://` scheitert er, weil
relative Skriptpfade und `crypto.subtle` dort nicht greifen – daher der kleine
Entwicklungsserver:

```bash
powershell -ExecutionPolicy Bypass -File tools/serve.ps1
```

Dann `http://localhost:8123/test/selbsttest.html` öffnen. Geprüft werden unter
anderem: Verlängern der Laufzeit, Selbstfreischaltung von Modulen, Löschen von
Feldern, Entfernen der Signatur, Einsetzen einer fremden Signatur und Ausstellen
mit einem eigenen Schlüssel – jeder dieser Fälle muss auffallen.

### Ein Modul ergänzen

Eine Datei unter `src/erp/` anlegen, sich bei der Schale anmelden, in `build.ps1`
eintragen. Navigation, Kachel, Freischaltung und Speichern erledigt die Schale.

```js
HZ.app.modul({
  key: 'lager', name: 'Lagerverwaltung', gebaut: true,
  icon: '<path d="…"/>',
  kachelText: function () { return '…'; },
  oeffnen: function (behaelter) { /* hier rendern */ }
});
```

Daten liegen unter `HZ.app.daten()`; nach einer Änderung `HZ.app.geaendert()`
aufrufen, den Rest übernimmt die Schale.

---

## نظام الفلاشة المعزول (ältere arabische Fassung)

Die frühere, mehrseitige Variante desselben Konzepts. Sie nutzt weder Signatur
noch Verschlüsselung und wird nicht weiterentwickelt.

[index.html](index.html) · [dashboard.html](dashboard.html) ·
[customers.html](customers.html) · [employees.html](employees.html) ·
[inventory.html](inventory.html) · [common.js](common.js)
