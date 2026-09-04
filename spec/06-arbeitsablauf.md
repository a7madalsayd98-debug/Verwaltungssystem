# 06 · Arbeitsablauf

## Umgebung

Windows. **Kein Node, kein Python, kein npm.** Werkzeuge sind PowerShell.
Ein Versuch mit `python -m http.server` scheitert mit Exit-Code 9009 — nicht
wiederholen.

## Bauen

```bash
powershell -ExecutionPolicy Bypass -File build.ps1
```

Läuft in unter einer Sekunde und schreibt beide Auslieferungsdateien neu. Nach
**jeder** Quelländerung ausführen, sonst prüft man den alten Stand.

Die Ausgabe nennt die Dateigrößen und warnt, solange `src/vendor-key.js` der
Platzhalter ist.

## Im Browser prüfen

Lokale Dateien lassen sich nicht sinnvoll über `file://` prüfen: Die
Browser-Vorschau wandelt sie in `data:`-URLs um, dort fehlen relative
Skriptpfade **und** `crypto.subtle`. Deshalb der eigene Server:

```bash
powershell -ExecutionPolicy Bypass -File tools/serve.ps1
```

`http://localhost` gilt im Browser als sicherer Kontext, WebCrypto funktioniert
also genauso wie später unter `https://`.

| Adresse | Inhalt |
| --- | --- |
| `http://localhost:8123/hz-erp-system.html` | Kundenanwendung |
| `http://localhost:8123/hz-lizenz-generator.html` | Generator |
| `http://localhost:8123/test/selbsttest.html` | Selbsttest |

Für Claude Code ist der Server in `.claude/launch.json` als `hz-dev` hinterlegt
und lässt sich über `preview_start` starten.

## Selbsttest

`test/selbsttest.html` prüft die Krypto-Schicht gegen die Quelldateien, nicht
gegen das Bauergebnis. Am Seitentitel steht das Ergebnis, `window.__testErgebnis`
enthält es maschinenlesbar.

**Nach jeder Änderung an `hz-crypto.js`, `hz-license.js` oder `hz-keystore.js`
muss er vollständig grün sein.** Ein roter Fall ist ein Auslieferungsstopp, kein
Diskussionspunkt.

Geprüft werden neben den Grundlagen sechs Angriffe, die alle auffallen müssen:

- Laufzeit im entschlüsselten Inhalt verlängern
- Module selbst freischalten
- `gueltigBis` löschen
- `sig` entfernen
- Signatur einer anderen Lizenz einsetzen
- Lizenz mit einem selbst erzeugten Schlüsselpaar ausstellen

Dazu die Gegenprobe, die genauso wichtig ist: **normales Speichern von Nutzdaten
darf die Signatur nicht brechen.**

Neue Sicherheitsaussage? Neuer Prüffall (K10).

## Die Oberfläche prüfen

Die nativen Dateidialoge lassen sich nicht automatisieren. Für einen
Durchlauf von Anmeldung bis Speichern wird `window.showOpenFilePicker` von außen
durch ein Testdoppel ersetzt, das ein Handle auf einen Text im Speicher liefert:

```js
window.showOpenFilePicker = async () => [{
  kind: 'file', name: 'Test.json',
  getFile: async () => new File([TEXT], 'Test.json', {type:'application/json'}),
  queryPermission: async () => 'granted',
  requestPermission: async () => 'granted',
  createWritable: async () => ({
    write: async (t) => { window.__geschrieben = t; },
    close: async () => {}
  })
}];
```

Damit lässt sich der vollständige Weg prüfen: anmelden, erfassen, automatisch
speichern, das Geschriebene wieder öffnen und die Signatur nachprüfen.

Dieses Doppel wird **von außen** eingespielt. Niemals eine Testklappe in den
Produktivcode einbauen.

Zum Schluss immer die Konsole auf Fehler ansehen.

## Der Händlerschlüssel beim Prüfen

Das ERP weist mit dem Platzhalter jede Lizenz ab — richtig so, aber unbrauchbar
zum Prüfen. Vorgehen:

1. Im Generator ein Testschlüsselpaar erzeugen und eine Testlizenz ausstellen.
2. `src/vendor-key.js` **vorübergehend** durch den Testschlüssel ersetzen,
   den Platzhalter vorher wegsichern.
3. Bauen und prüfen.
4. **Platzhalter wiederherstellen, neu bauen**, erst dann committen.

Schritt 4 nicht vergessen. Ein eingecheckter Testschlüssel wäre ein echter
Fehler: Kunden bekämen ein Programm, das Lizenzen eines Schlüssels anerkennt,
dessen privaten Teil niemand kontrolliert.

Testschlüssel und Testlizenzen gehören in ein Arbeitsverzeichnis außerhalb des
Repositorys.

## Abnahme

Bevor etwas als fertig gilt:

- [ ] `build.ps1` gelaufen, beide Ausgabedateien aktuell
- [ ] Bei Krypto-Änderung: Selbsttest vollständig grün
- [ ] Betroffener Weg im Browser durchgespielt, Konsole ohne Fehler
- [ ] Hell **und** dunkel angesehen
- [ ] Schmales Fenster angesehen, kein waagerechter Seitenlauf
- [ ] `src/vendor-key.js` ist der Platzhalter
- [ ] Konstitution durchgegangen, besonders K1, K4, K7

## Committen

Nachrichten auf Deutsch ohne Umlaute, weil sie durch verschiedene Werkzeuge
laufen. Erst was sich geändert hat, dann **warum**. Bei Sicherheitsänderungen
gehört die vorherige Lücke in den Text — wer später sucht, findet sie darüber.

```
Lizenzdateien signieren und verschluesseln, ERP-Oberflaeche neu

Bisher war die Lizenzdatei Klartext und pruefte sich selbst: wer sie im
Editor oeffnete, konnte Laufzeit und Module beliebig setzen.

Neues Format HZL2:
- Inhalt vollstaendig AES-256-GCM-verschluesselt
- Anspruchsteil ECDSA-P-256-signiert
...
```

Sowohl `src/` als auch die Bauergebnisse gehören in denselben Commit — sonst
liefert GitHub Pages einen Stand aus, der nicht zur Quelle passt.

## Veröffentlichen

Das Repository ist öffentlich, GitHub Pages ist eingeschaltet und baut bei jedem
Push von `main` aus dem Wurzelverzeichnis.

```
https://a7madalsayd98-debug.github.io/Verwaltungssystem/hz-erp-system.html
https://a7madalsayd98-debug.github.io/Verwaltungssystem/hz-lizenz-generator.html
```

Dass der Generator dort öffentlich liegt, ist unbedenklich, **solange K4 gilt**:
Er enthält kein Geheimnis, und eine mit fremdem Schlüssel ausgestellte Lizenz
erkennt das ERP an der falschen Signatur. Wer diese Eigenschaft aufgibt, muss
den Generator aus dem öffentlichen Verzeichnis nehmen.
