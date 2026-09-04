# 08 · Rezepte

Schritt-für-Schritt-Anleitungen für die Änderungen, die wiederkehren. Wer ein
Rezept befolgt, braucht die übrigen Spezifikationsdateien nicht zu lesen.

---

## Rezept 1 · Ein Fachmodul bauen

Beispiel Lagerverwaltung. Das Modul ist bereits angemeldet, aber leer — die
Anmeldung steht am Ende von `src/erp/erp-hauptbuch.js`.

**Schritt 1.** Leere Anmeldung dort entfernen.

**Schritt 2.** `src/erp/erp-lager.js` anlegen:

```js
/* =============================================================
   HZ · Modul Lagerverwaltung
   -------------------------------------------------------------
   Kennt weder Dateien noch Verschluesselung. Liest und schreibt
   HZ.app.daten().lager und meldet Aenderungen mit
   HZ.app.geaendert() an.
   ============================================================= */
(function () {
  'use strict';

  var U = HZ.ui;
  var $ = U.$;

  function daten() {
    var d = HZ.app.daten();
    if (!d.lager) d.lager = { artikel: [], bewegungen: [] };
    return d.lager;
  }

  function oeffnen(behaelter) {
    behaelter.innerHTML =
      '<h1 class="hz-titel">Lagerverwaltung</h1>' +
      '<p class="hz-untertitel">Artikel und Bestaende.</p>' +
      '<div id="lg-inhalt"></div>';
    listeZeichnen();
  }

  function listeZeichnen() { /* … */ }

  HZ.app.modul({
    key: 'lager',
    name: 'Lagerverwaltung',
    gebaut: true,
    icon: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
    kachelText: function () { return daten().artikel.length + ' Artikel'; },
    oeffnen: oeffnen
  });
})();
```

**Schritt 3.** In `build.ps1` in die ERP-Liste eintragen, **nach** `erp-shell.js`:

```powershell
'erp/erp-shell.js',
'erp/erp-zeit.js',
'erp/erp-hauptbuch.js',
'erp/erp-lager.js'
```

**Schritt 4.** Bauen, über `tools/serve.ps1` prüfen.

Zu beachten:

- Der `key` muss zum Schlüssel in der Lizenz passen, sonst bleibt das Modul
  gesperrt.
- `daten()` legt seinen Bereich faul an — bei Ausstellung enthält die Lizenz nur
  `daten.zeiterfassung`.
- Nach **jeder** Datenänderung `HZ.app.geaendert()` rufen.
- Alle Werte aus den Daten durch `U.esc()` (K7).
- Kein Zustand im DOM: Die Schale leert den Behälter bei jedem Wechsel.

---

## Rezept 2 · Ein Feld in der Lizenz ergänzen

Beispiel: eine Kundennummer, die der Kunde nicht ändern können soll.

**Entscheidung zuerst:** Gehört das Feld in den signierten Bereich? Zwei Fälle:

- **Ja**, wenn es eine Berechtigung oder eine Zusage ist, die der Kunde nicht
  ändern darf. Dann in die Signaturansicht aufnehmen.
- **Nein**, wenn es Nutzdaten sind. Dann gehört es unter `daten` und es ist
  nichts weiter zu tun.

Bei **ja**:

**Schritt 1.** In `src/core/hz-license.js` die Funktion `signaturAnsicht`
erweitern und `v` auf `3` erhöhen:

```js
function signaturAnsicht(inhalt) {
  return {
    v: 3,
    lizenzId: inhalt.lizenzId,
    kunde: inhalt.kunde,
    kundennummer: inhalt.kundennummer || null,
    gueltigBis: inhalt.gueltigBis,
    module: moduleNormalisieren(inhalt.module),
    ausgestelltAm: inhalt.ausgestelltAm
  };
}
```

**Achtung:** Das ändert **alle** Signaturen. Bereits ausgestellte Lizenzen
gelten danach als ungültig. Deshalb gilt K6: neue Formatkennung, Lesepfad für
das alte Format, Migrationsweg im Generator.

**Schritt 2.** Feld im Generator erfassen und in `versiegeln` mitgeben.

**Schritt 3.** Selbsttest um einen Fall erweitern: Feld nachträglich ändern
muss `signaturOk === false` ergeben.

**Schritt 4.** Bauen, Selbsttest grün, im Browser prüfen.

---

## Rezept 3 · Einen Text ändern

Alle sichtbaren Texte stehen in den Quelldateien, nicht in den Bauergebnissen.

```bash
grep -rn "gesuchter Text" src/
```

Ändern, `build.ps1` laufen lassen, fertig. Die Bauergebnisse **nie** direkt
bearbeiten — beim nächsten Build ist die Änderung weg.

---

## Rezept 4 · Einen Fehler suchen

**Schritt 1.** Server starten und die betroffene Seite über `localhost` öffnen.
Nicht über `file://` — dort fehlt `crypto.subtle`, und man sucht dann den
falschen Fehler.

**Schritt 2.** Browserkonsole ansehen.

**Schritt 3.** Betrifft es Krypto oder das Lizenzformat, zuerst den Selbsttest
laufen lassen. Ist er rot, liegt der Fehler dort und nicht in der Oberfläche.

**Schritt 4.** Zustand im Browser abfragen:

```js
HZ.app.daten()                 // aktuelle Nutzdaten
HZ.ui.themeLesen()             // Farbschemawahl
HZ.haendlerSchluessel          // null bedeutet Platzhalter
document.getElementById('speicherstand').dataset.zustand
```

**Schritt 5.** Korrigiert wird immer in `src/`, danach bauen.

---

## Rezept 5 · Einen Baustein zum Design-System hinzufügen

Wird der Baustein von **beiden** Anwendungen gebraucht, gehört er mit Präfix
`hz-` in `hz-core.css`. Sonst ohne Präfix in `erp.css` oder `gen.css`.

Farben nur über Merkmale. Neues Merkmal? Immer beide Blöcke bedienen:

```css
:root, :root[data-theme="hell"] { --neu: #123456; }
:root[data-theme="dunkel"]      { --neu: #abcdef; }
```

Danach in beiden Farbschemata ansehen, bevor es als fertig gilt.

---

## Rezept 6 · Vom ERP aus etwas Verschlüsseltes prüfen

Für einen vollständigen Durchlauf ohne native Dateidialoge das Testdoppel aus
`spec/06-arbeitsablauf.md` einspielen, dann:

```js
// Nach dem Speichern: geschriebene Datei nachprüfen
const vk = await HZ.crypto.verifyKeyImportieren(HZ.haendlerSchluessel.signatur);
const auf = await HZ.license.oeffnenMitPasswort(
  JSON.parse(window.__geschrieben), 'passwort', vk);
console.log(auf.signaturOk, auf.inhalt.daten);
```

`signaturOk` muss nach normalem Speichern `true` bleiben. Wird es `false`, hat
jemand den Signaturumfang verletzt und Nutzdaten mit einbezogen.

---

## Rezept 7 · Eine Sicherheitsaussage belegen

Behauptung: „Angriff X wird erkannt." Dann gehört Angriff X als Prüffall in
`test/selbsttest.html` (K10).

Muster:

```js
await pruefe('ANGRIFF Beschreibung wird erkannt', async function () {
  var auf = await L.oeffnenMitPasswort(lizenz.datei, KUNDENPASSWORT, verifyKey);
  auf.inhalt.irgendwas = 'manipuliert';
  var kopie = JSON.parse(JSON.stringify(lizenz.datei));
  await L.inhaltSchreiben(kopie, auf.dek, auf.inhalt);
  var erneut = await L.oeffnenMitPasswort(kopie, KUNDENPASSWORT, verifyKey);
  behaupte(erneut.signaturOk === false, 'Wurde NICHT erkannt');
  return 'signaturOk = false';
});
```

Gegenprobe nicht vergessen: Der erlaubte Fall muss weiterhin `true` ergeben.
Ein Test, der nur Verbote prüft, übersieht eine Prüfung, die alles ablehnt.
