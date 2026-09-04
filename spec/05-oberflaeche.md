# 05 · Oberfläche

## Grundhaltung

Die Anwender sind Handwerks- und Kleinbetriebe, keine Softwareleute. Daraus
folgt: sichtbarer Zustand statt stiller Annahmen, verständliche Sätze statt
Fachbegriffen, und nichts, was ohne Rückfrage Daten verwirft.

Zu jeder Zeit sichtbar: ob gespeichert ist, wie lange die Lizenz noch läuft,
welches Modul offen ist, und was gerade nicht geht und warum.

## Farbmerkmale

Definiert in `hz-core.css`, gesteuert über `data-theme="hell"` oder `"dunkel"`
am Wurzelelement. Drei Wahlmöglichkeiten: hell, dunkel, System.

```
--shell --shell-dark --shell-text     Kopfleiste und Seitenleiste
--primary --primary-dark
--primary-weich --primary-rand        Flächen und Ränder in Primärfarbe
--bg --flaeche --flaeche-2
--flaeche-hover                       Hintergrundstufen
--rand --rand-stark                   Trennlinien, Eingabefeldränder
--text --text-leise --text-aus        Textstufen
--erfolg --warn --gefahr              je zusätzlich mit -weich und -rand
--schatten-1 --schatten-2 --schatten-3   Karte, Menü, Dialog
--radius --radius-s --radius-xs
```

Ein Merkmal, das nur im dunklen Block steht, fehlt im hellen. Die Regel aus
`04-code-stil.md` gilt hier strikt.

## Bausteine

| Klasse | Zweck |
| --- | --- |
| `hz-karte` | abgesetzter Abschnitt mit Rand und Schatten |
| `hz-feld` | Beschriftung plus Eingabe, `hz-feld-reihe` für nebeneinander |
| `hz-btn` | Zusätze `sekundaer` `leise` `gefahr` `breit` `klein` `rund` |
| `hz-box` | stehende Meldung, Zusätze `info` `erfolg` `warn` `gefahr` |
| `hz-marke` | kleine Statusmarke |
| `hz-tabelle` | immer in `hz-tabelle-rahmen` wegen Querlauf |
| `hz-reiter` | Reiterleiste |
| `hz-leerzustand` | erklärt, was zu tun ist, statt Leere zu zeigen |
| `hz-staerke` | Passwortstärke, `data-stufe` steuert Balken und Farbe |
| `hz-ergebnis` | Wertzeile mit Kopierknopf |

## Rückmeldung an den Anwender

**Toast** über `HZ.ui.toast` für Bestätigungen, die niemanden aufhalten sollen:
„Buchung erfasst", „In Datei gespeichert". Arten `erfolg` `fehler` `warn` `info`.

**Dialog** über `HZ.ui.dialog`, `hinweis`, `bestaetigen` für Entscheidungen.
Immer zusagenbasiert und mit `await` verwendbar. Escape schließt jeweils nur den
obersten Dialog.

**Stehende Meldungsbox** `hz-box` für Zustände, die bleiben müssen: der
Anmeldefehler, das Schreibbanner, der Hinweis auf die Modulhaken im Generator.

Faustregel: Wer weiterarbeiten kann, bekommt einen Toast. Wer entscheiden muss,
einen Dialog. Was dauerhaft gilt, wird zur Box.

## Speicheranzeige

In der Kopfleiste, `data-zustand` steuert Farbe und Text:

| Zustand | Anzeige |
| --- | --- |
| `gespeichert` | grün, „Gespeichert HH:MM" |
| `offen` | gelb, „Nicht gespeichert" |
| `laeuft` | blau pulsierend, „Speichert…" |
| `fehler` | rot, „Nicht gespeichert" |

Diese Anzeige darf nie stillschweigend falsch stehen. Schlägt das Speichern
fehl, bleibt sie auf `fehler` und ein Toast nennt den Grund.

## Bedienbarkeit

- Jedes bedienbare Element ist ein Knopf oder ein Verweis, kein Behälter mit
  Klickbehandlung. Auch Kalenderzellen und Kacheln sind Schaltflächen.
- `:focus-visible` ist global gesetzt und wird nicht entfernt.
- Beschriftungen gehören über `for` und `id` an ihr Feld.
- Dialoge tragen `role="dialog"` und `aria-modal`, Toasts `aria-live="polite"`.
- Kalenderzellen bekommen ein `aria-label` mit Datum und Stundensumme.
- Tastatur: `Strg+S` speichert, `Escape` schließt Dialoge, `Enter` in
  Passwortfeldern bestätigt.
- `prefers-reduced-motion` schaltet Übergänge ab.

## Schmale Fenster

Umbrüche bei 900, 768 und 620 Pixeln. Unter 768 wird die Seitenleiste zur
ausfahrbaren Schublade mit Schleier, die Kopfleiste bekommt den Menüknopf.

Breite Inhalte — Tabellen, der Kalender — laufen **in ihrem eigenen Rahmen**
quer. Der Seitenkörper darf niemals waagerecht scrollen.

## Texte

Vollständige Sätze, Sie-Form, kein Fachjargon. Eine Fehlermeldung nennt das
Problem und den nächsten Schritt.

Im Sperrhinweis für ein nicht freigeschaltetes Modul steht bewusst, dass bereits
erfasste Daten bei einer späteren Freischaltung erhalten bleiben. Das ist die
Frage, die der Anwender in diesem Moment wirklich hat.
