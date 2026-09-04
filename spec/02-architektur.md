# 02 · Architektur

## Verzeichnisse

```
CLAUDE.md / AGENTS.md      Einstieg für KI-Modelle
spec/                      dieses Regelwerk
src/
  core/                    von beiden Anwendungen genutzt
    hz-crypto.js           Primitive: PBKDF2, AES-GCM, ECDSA, ECDH, kanonisches JSON
    hz-license.js          Format HZL2: versiegeln, öffnen, prüfen, neu signieren
    hz-store.js            Dateizugriff, gemerkte Handles, Rückfallwege
    hz-ui.js               Toasts, Dialoge, Farbschema, Escaping, Datumshelfer
    hz-keystore.js         Händler-Schlüsseldatei (nur Generator)
    hz-core.css            Design-System, hell und dunkel
  erp/                     Kundenanwendung
    erp.body.html          Markup
    erp.css                Layout
    erp-shell.js           Anmeldung, Sitzung, Navigation, Speichern
    erp-zeit.js            Modul Zeiterfassung
    erp-hauptbuch.js       Modul Hauptbuch (+ die drei leeren Anmeldungen)
  gen/                     Generator
    gen.body.html / gen.css / gen-app.js
  vendor-key.js            öffentlicher Händlerschlüssel (Platzhalter: null)
test/selbsttest.html       Prüfungen der Krypto-Schicht
tools/serve.ps1            Entwicklungsserver für localhost
build.ps1                  fügt src/ zu den zwei Auslieferungsdateien zusammen
hz-erp-system.html         BAUERGEBNIS — nicht bearbeiten
hz-lizenz-generator.html   BAUERGEBNIS — nicht bearbeiten
```

## Schichten

Von unten nach oben, jede Schicht kennt nur die unter ihr:

1. **`hz-crypto`** — reine Primitive, keine Fachlogik, kennt kein Lizenzformat.
2. **`hz-license` / `hz-keystore`** — Dateiformate. Kennen Krypto, aber keine
   Oberfläche und keine Dateien.
3. **`hz-store` / `hz-ui`** — Umwelt: Dateisystem und Bildschirm. Kennen keine
   Fachlogik.
4. **`erp-shell` / `gen-app`** — Anwendungslogik. Verdrahtet alles.
5. **`erp-zeit` / `erp-hauptbuch`** — Fachmodule. Kennen **nur** `HZ.app` und
   `HZ.ui`, niemals Krypto oder Dateien.

Diese Richtung nicht umkehren. Ein Fachmodul, das `HZ.license` aufruft, ist ein
Fehler; es soll gar nicht wissen, dass es Verschlüsselung gibt.

## Namensraum und Ladereihenfolge

Alles hängt an einem globalen `HZ`. Klassische `<script>`-Blöcke, **keine**
ES-Module: Module funktionieren über `file://` nicht, und die Auslieferung als
Doppelklick-Datei ist wichtiger als moderne Syntax.

Jede Datei beginnt mit `window.HZ = window.HZ || {};` und kapselt sich in einer
sofort ausgeführten Funktion mit `'use strict';`.

Die Reihenfolge steht in `build.ps1` und ist bedeutsam:

```
ERP:        hz-crypto → hz-license → hz-store → hz-ui
            → vendor-key → erp-shell → erp-zeit → erp-hauptbuch
Generator:  hz-crypto → hz-license → hz-store → hz-ui
            → hz-keystore → gen-app
```

`erp-shell` steht **vor** den Fachmodulen, weil es `HZ.app.modul()` bereitstellt,
womit die Module sich anmelden. Der Start läuft trotzdem erst bei
`DOMContentLoaded`, wenn alle Anmeldungen vorliegen.

## Modulvertrag

Ein Fachmodul meldet sich mit einem Objekt an:

```js
HZ.app.modul({
  key:  'lager',              // muss zum Schlüssel in der Lizenz passen
  name: 'Lagerverwaltung',    // Anzeigename in Navigation und Kachel
  gebaut: true,               // false = "Bald verfügbar", oeffnen wird nie gerufen
  icon: '<path d="…"/>',      // SVG-INHALT, ohne <svg>-Hülle, 24x24, stroke
  kachelText: function () { return '3 Artikel'; },   // optional
  oeffnen: function (behaelter) { /* hier rendern */ }
});
```

`oeffnen` bekommt ein leeres `<section>` und füllt es vollständig. Die Schale
leert den Behälter bei jedem Wechsel; ein Modul darf keinen Zustand im DOM
zwischenspeichern.

Was die Schale dem Modul anbietet:

| Aufruf | Bedeutung |
| --- | --- |
| `HZ.app.daten()` | Nutzdatenobjekt der Lizenz, direkt beschreibbar |
| `HZ.app.kunde()` | Kundenname |
| `HZ.app.geaendert()` | „Ich habe etwas geändert" — löst automatisches Speichern aus |
| `HZ.app.jetztSpeichern()` | sofort speichern, gibt eine Zusage zurück |

Jedes Modul legt seinen eigenen Bereich unter `HZ.app.daten()` an und
initialisiert ihn faul beim ersten Öffnen — die Lizenz enthält bei Ausstellung
nur `daten.zeiterfassung = {}`.

**Nach jeder Datenänderung `HZ.app.geaendert()` rufen.** Wird das vergessen,
bemerkt der Anwender den Verlust erst, wenn es zu spät ist.

## Datenfluss beim Speichern

```
Modul ändert HZ.app.daten()
  → HZ.app.geaendert()
  → Anzeige "Nicht gespeichert", Zeitgeber auf 1200 ms
  → HZ.license.inhaltSchreiben()   Nutzdaten neu verschlüsseln, frischer IV
  → JSON.stringify
  → HZ.store.schreiben(handle)     oder Download-Rückfall
  → Anzeige "Gespeichert HH:MM"
```

Die Signatur wird dabei **nicht** angefasst. Sie deckt nur den Anspruchsteil ab,
weshalb normales Arbeiten sie nicht bricht. Siehe `spec/03-lizenzformat.md`.

## Sitzungszustand

Im Speicher der Schale, nie in `localStorage`:

```js
sitzung = {
  datei,       // die Dateistruktur (Chiffrat, Verpackungen, Parameter)
  inhalt,      // entschlüsselter Inhalt, hier arbeiten die Module
  dek,         // Datenschlüssel als CryptoKey, für erneutes Verschlüsseln
  handle,      // FileSystemFileHandle oder null
  dateiname,
  verifyKey    // importierter öffentlicher Schlüssel
}
```

In `localStorage` liegt ausschließlich die Farbschema-Wahl. In IndexedDB liegen
Dateihandles — keine Daten, keine Schlüssel.

## Der Build

`build.ps1` setzt je Anwendung zusammen: Kopf mit Metadaten, alle CSS-Dateien in
einen `<style>`-Block, das Markup, alle JS-Dateien in einen `<script>`-Block.
Es prüft, dass kein JavaScript die Zeichenfolge `</script` enthält, und warnt,
solange `vendor-key.js` der Platzhalter ist.

Neue Quelldatei? In `build.ps1` in die passende Liste eintragen, sonst landet
sie nicht in der Auslieferung.
