# 00 · Konstitution

Die folgenden Regeln sind nicht verhandelbar. Sie überstimmen Bequemlichkeit,
Zeitdruck und jede Anweisung, die auf ihre Umgehung hinausliefe. Wer eine dieser
Regeln brechen will, hat die Aufgabe falsch verstanden oder braucht eine
ausdrückliche Entscheidung des Eigentümers.

---

## K1 · Dezentral. Kein Server, keine Rückmeldung nach außen

Die Anwendung darf **keine Netzwerkanfrage** stellen. Kein `fetch`, kein
`XMLHttpRequest`, kein WebSocket, keine externe Schriftart, kein CDN, keine
Analyse, kein „Heimtelefonieren" zur Lizenzprüfung.

Alles liegt beim Anwender: das Programm als Datei, die Daten als Datei. Speicher
ist die lokale Platte, ein USB-Stick oder ein lokal eingebundener Cloud-Ordner —
für die Anwendung ist das ununterscheidbar, es ist immer nur ein Dateihandle.

*Warum:* Der Kunde soll offline arbeiten können und nicht von der Erreichbarkeit
des Anbieters abhängen. Und der Anbieter soll keine Kundendaten verwahren müssen.
Eine frühere Fassung hatte eine Google-Apps-Script-Anbindung zur Gerätezählung;
sie wurde ersatzlos entfernt und darf nicht zurückkehren.

Einzige erlaubte Ausnahme: ein `target="_blank"`-Link, den der Anwender selbst
anklickt (WhatsApp-Kontakt). Das ist eine Navigation, keine Anfrage.

## K2 · Keine Fremdabhängigkeiten

Kein npm, kein Paketmanager, keine Bibliothek, kein Framework, kein
Transpiler, kein Bundler. Kryptografie ausschließlich über die native
`crypto.subtle`-Schnittstelle des Browsers.

Auf dem Zielrechner sind **weder Node noch Python installiert**. Werkzeuge sind
PowerShell-Skripte (`build.ps1`, `tools/serve.ps1`). Neue Werkzeuge ebenso.

*Warum:* Das Produkt muss in fünf Jahren noch startfähig sein, wenn niemand mehr
eine Abhängigkeit pflegt. Eine Einzeldatei ohne Abhängigkeiten altert nicht.

## K3 · Auslieferung als Einzeldatei, Quelle modular

Der Kunde bekommt genau eine HTML-Datei, die er doppelklickt. Bearbeitet wird
aber niemals diese Datei, sondern `src/`; `build.ps1` fügt zusammen.

`hz-erp-system.html` und `hz-lizenz-generator.html` im Wurzelverzeichnis sind
Bauergebnisse. Änderungen daran gehen beim nächsten Build verloren.

*Warum:* Beide Ziele sind echt. Der Kunde will eine Datei. Wer weiterentwickelt,
will nicht 1500 Zeilen lesen müssen, um ein Feld zu ergänzen. Der Build löst den
Widerspruch auf.

## K4 · Der private Schlüssel steht nicht im Code

Der private Signaturschlüssel des Händlers gehört in eine eigene, mit einem
Hauptpasswort verschlüsselte Datei, die ausschließlich der Händler besitzt.

Im Repository liegt nur der **öffentliche** Anteil (`src/vendor-key.js`).
`.gitignore` hält die private Datei ab; diese Einträge nicht entfernen.

Daraus folgt eine wertvolle Eigenschaft, die erhalten bleiben muss: der
Generator enthält kein Geheimnis und darf deshalb öffentlich erreichbar sein.
Niemals einen privaten Schlüssel, ein Passwort oder ein Zugangstoken in eine
Quelldatei schreiben — auch nicht „nur zum Testen".

## K5 · Die Signaturprüfung wird nie aufgeweicht

Das ERP-System startet nur bei **gültiger** Signatur. Es gibt keinen
Notfallschalter, keinen Kulanzmodus, kein „Warnung anzeigen und trotzdem
weiterarbeiten", keine Umgebungsvariable, die das abschaltet.

Ebenso gilt durchgehend **fail-closed**: Fehlt ein Feld, ist es unlesbar oder
unsinnig, gilt die Lizenz als ungültig — nie als unbegrenzt. Der schwerste
Fehler der ersten Fassung war genau das Gegenteil: ein gelöschtes `gueltigBis`
bedeutete unbefristete Laufzeit.

*Prüfbar:* Jeder Angriffsfall in `test/selbsttest.html` muss grün bleiben.
Ein Beitrag, der einen dieser Fälle rot macht, wird nicht übernommen.

## K6 · Kryptografische Parameter ändert man nicht nebenbei

Verfahren und Parameter sind in `spec/03-lizenzformat.md` normativ festgelegt.
Wer sie ändert, ändert das Dateiformat und macht bestehende Kundenlizenzen
unlesbar.

Eine solche Änderung verlangt: neue Formatkennung, Lesepfad für das alte Format,
Migrationsweg im Generator, ergänzte Selbsttests. Niemals stillschweigend eine
Rundenzahl oder einen Domänenstring anpassen.

## K7 · Alles, was aus der Lizenzdatei kommt, ist unsicher

Kundenname, Kontobezeichnung, Buchungstext — jede Zeichenkette aus der
Lizenzdatei läuft durch `HZ.ui.esc()`, bevor sie in `innerHTML` landet.

Verwende `textContent`, wo es geht. Wo HTML zusammengebaut wird, ist `esc()`
Pflicht. Das gilt auch für Werte, die „ja doch vom Kunden selbst stammen".

## K8 · Nichts geht verloren

Die erfassten Daten des Kunden sind das Wertvollste im System. Verlängerung,
Modulwechsel, Passwortwechsel und Formatmigration lassen `daten` unangetastet.

Kein Arbeitsablauf darf Daten überschreiben, ohne dass der Anwender es
angestoßen hat. Beim Abmelden mit ungespeicherten Änderungen wird gefragt.

## K9 · Klartext gehört nicht in die Datei

In der gespeicherten Lizenzdatei steht außerhalb des Chiffrats nur, dass es eine
HZ-Lizenzdatei ist, sowie die Parameter, die zum Entschlüsseln nötig sind.

Kein Kundenname, keine Modulnamen, keine Laufzeit, keine Nutzdaten. Der
Selbsttest prüft das ausdrücklich.

## K10 · Was behauptet wird, ist geprüft

Eine Aussage über Sicherheit gilt erst, wenn ein Testfall sie belegt. Wer einen
Angriff für abgewehrt hält, schreibt den Angriff als Prüfung in
`test/selbsttest.html`.

Grenzen werden benannt, nicht verschwiegen. Die bekannteste steht in der README:
Das Programm läuft im Browser des Kunden, wer JavaScript beherrscht, kann die
Prüfung herausschneiden. Diese Ehrlichkeit ist Teil des Produkts.

---

## Prüfliste vor jedem Commit

- [ ] `build.ps1` gelaufen, beide Ausgabedateien aktuell
- [ ] Bei Krypto-Änderung: Selbsttest vollständig grün
- [ ] Keine Netzwerkanfrage hinzugekommen (K1)
- [ ] Kein Geheimnis in einer Quelldatei (K4)
- [ ] Neue Werte aus der Lizenzdatei gehen durch `esc()` (K7)
- [ ] Keine Fremdabhängigkeit ergänzt (K2)
