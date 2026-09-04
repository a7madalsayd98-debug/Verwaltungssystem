# 04 · Code-Stil

Ziel ist, dass eine Änderung von außen nicht als solche auffällt. Wer diese
Datei gelesen hat, schreibt Code, der zum Bestand passt.

## Sprache

**Oberfläche: Deutsch.** Alle sichtbaren Texte, Fehlermeldungen und Beschriftungen.

**Code: Deutsch ohne Umlaute.** Bezeichner und Kommentare verwenden `ae oe ue ss`.
Also `passwortStaerke`, `oeffnen`, `gueltigBis`, `schluessel`.

*Warum:* Der Code läuft durch PowerShell-Skripte und wird auf Systemen mit
wechselnden Codepages bearbeitet. Umlaute in Bezeichnern sind ein Risiko ohne
Gegenwert. In Markdown-Dateien wie dieser sind Umlaute dagegen erwünscht.

Englisch bleibt nur, wo es feststehende Fachbegriffe sind: `iv`, `ct`, `salt`,
`jwk`, `kdf`, `dek`, `sig`, `payload`, `wrap`.

## JavaScript

`var` statt `let`/`const`, `function` statt Pfeilfunktionen, keine
Zerlegungszuweisungen, keine Vorlagenliterale mit Einbettung. Ausnahme:
`async`/`await` wird verwendet, weil WebCrypto ohne Zusagen unlesbar wäre.

*Warum diese Zurückhaltung:* Die Auslieferung ist eine Einzeldatei ohne
Transpiler. Konservative Syntax läuft überall und altert nicht.

```js
window.HZ = window.HZ || {};
HZ.beispiel = (function () {
  'use strict';

  var K = HZ.crypto, U = HZ.ui;
  var $ = U.$;

  function machEtwas(wert) { /* … */ }

  return { machEtwas: machEtwas };
})();
```

Weitere Festlegungen:

- Zwei Leerzeichen Einrückung, Semikolons immer, einfache Anführungszeichen.
- Kurzformen der Kernmodule oben in der Datei: `K` Krypto, `L` Lizenz,
  `S` Speicher, `U` Oberfläche.
- Ereignisse werden mit `addEventListener` verdrahtet, **nicht** über
  `onclick`-Attribute im Markup. Die erste Fassung tat das; es zwingt Funktionen
  ins globale Objekt und verträgt sich schlecht mit Escaping.
- Bei erzeugtem Markup Daten über `data-`-Attribute übergeben und nach dem
  Einsetzen verdrahten.

## Kommentare

Kommentiert wird das **Warum**, nie das Was. Ein Kommentar, der die darunter
stehende Zeile nacherzählt, ist zu löschen.

```js
/* Rejection sampling: ein einfaches Modulo wuerde die ersten
   Zeichen des Alphabets minimal bevorzugen. */

/* Kein Datum heisst hier abgelaufen, nicht unbegrenzt. Eine
   Lizenz ohne Laufzeit darf es nicht geben. */
```

Jede Datei beginnt mit einem Kopfkommentar in diesem Rahmen:

```js
/* =============================================================
   HZ · Kurztitel
   -------------------------------------------------------------
   Was diese Datei tut und was sie bewusst nicht tut.
   ============================================================= */
```

Abschnitte innerhalb einer Datei werden so getrennt:

```js
  /* ---------- Kurzer Abschnittstitel ---------- */
```

## Fehlerbehandlung

Fehler tragen einen `code`, damit Aufrufer unterscheiden können, ohne
Fehlertexte zu vergleichen. Meldungen an den Anwender sagen, was schiefging
**und** was zu tun ist:

> Diese Lizenzdatei ist nicht gueltig signiert. Sie wurde entweder veraendert
> oder stammt nicht von Ihrem Anbieter. Bitte fordern Sie eine neue Datei an.

Nicht: „Signaturfehler." Damit weiß kein Anwender etwas anzufangen.

Ein abgebrochener Dateidialog ist **kein** Fehler. Immer mit
`HZ.store.istAbbruch(e)` abfangen und still zurückkehren.

## Verbotene Muster

| Nicht verwenden | Stattdessen |
| --- | --- |
| `alert()` | `HZ.ui.hinweis()` |
| `confirm()` | `await HZ.ui.bestaetigen()` |
| `prompt()` | `HZ.ui.dialog()` mit Eingabefeld |
| `onclick` im Markup | `addEventListener` |
| `innerHTML` mit Lizenzdaten | `HZ.ui.esc()` oder `textContent` |
| `toISOString().slice(0,10)` | `HZ.ui.isoTag()` |
| `JSON.stringify` zum Signieren | `HZ.crypto.canonical()` |
| `fetch`, `XMLHttpRequest` | gar nicht, siehe K1 |
| `localStorage` für Nutzdaten | die Lizenzdatei |

`alert` und `confirm` halten den ganzen Tab an und lassen sich nicht gestalten;
in der Browser-Vorschau blockieren sie sogar die automatisierte Prüfung.

## CSS

Farben ausschließlich über die Merkmale aus `hz-core.css`, nie fest verdrahtet.
Ein Merkmal wird immer im hellen Grundsatz definiert und im dunklen
überschrieben — nie ausschließlich in einem der beiden.

Klassen im Kern tragen das Präfix `hz-`, anwendungseigene nicht. Neue
allgemeine Bausteine gehören in `hz-core.css`, Layout in `erp.css` bzw.
`gen.css`. Einzelheiten in `spec/05-oberflaeche.md`.

## Was eine Funktion tun soll

Eine Aufgabe, wenige Zeilen, sprechender Name. Wenn ein Kommentar erklären muss,
was der zweite Teil einer Funktion tut, ist es die zweite Funktion.

Wiederholung, die beide Anwendungen betrifft, gehört in den Kern. Das ist nicht
Ästhetik, sondern Sicherheit: `moduleNormalisieren` doppelt zu pflegen hieße,
irgendwann zwei verschiedene Signaturen zu rechnen.
