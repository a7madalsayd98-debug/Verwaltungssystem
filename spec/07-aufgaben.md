# 07 · Offene Aufgaben

Nach Dringlichkeit geordnet. Jede Aufgabe nennt Abnahmekriterien — erst wenn
die erfüllt sind, gilt sie als fertig. Was hier erledigt wird, wird hier
gestrichen.

---

## A1 · Händlerschlüssel einrichten · blockierend

`src/vendor-key.js` steht auf `null`. Das ERP weist **jede** Lizenz ab. Bis das
erledigt ist, ist das Produkt nicht auslieferbar.

Kein Programmierauftrag, sondern ein Handgriff des Eigentümers: im Generator
ein Schlüsselpaar erzeugen, die private Datei sichern, die erzeugte
`vendor-key.js` übernehmen, neu bauen.

**Abnahme:** Eine ausgestellte Testlizenz meldet sich im gebauten ERP an. Die
private Schlüsseldatei liegt außerhalb des Repositorys.

---

## A2 · WhatsApp-Nummer eintragen · klein

An zwei Stellen steht der Platzhalter `49XXXXXXXXXX`:
`src/erp/erp.body.html:35` und `src/erp/erp-shell.js:296`.

Kunden, die auf „Per WhatsApp anfragen" klicken, landen im Nichts.

**Abnahme:** Beide Stellen tragen die echte Nummer, beide Wege im Browser
geklickt.

---

## A3 · Buchungen bearbeiten statt nur löschen · mittel

Im Hauptbuch lässt sich eine Buchung nur löschen und neu erfassen. Bei einem
Zahlendreher im Buchungstext ist das unnötig umständlich.

**Umsetzung:** Knopf „Bearbeiten" je Zeile, öffnet `HZ.ui.dialog` mit denselben
Feldern wie die Erfassungsmaske. `id` bleibt erhalten, damit Verweise stimmen.

**Abnahme:** Betrag, Konten, Datum und Text sind änderbar; Kontenblatt, Bilanz
und GuV rechnen danach richtig; Prüfungen wie beim Erfassen (Soll ungleich
Haben, Betrag größer null); `HZ.app.geaendert()` wird gerufen.

---

## A4 · Ausgaben zum Weitergeben · mittel

Der Steuerberater bekommt derzeit nichts aus dem System heraus.

**Umsetzung:** CSV-Ausgabe für Buchungsliste, Kontenblatt und Monatsjournal
sowie für den Zeiterfassungs-Monat. Über `HZ.store.herunterladen`. Trennzeichen
Semikolon und BOM, damit Excel deutsche Umlaute und Spalten richtig erkennt.
Kein PDF — das hieße eine Fremdbibliothek und verstieße gegen K2; für Papier
reicht ein sauberes Druck-Stylesheet.

**Abnahme:** Erzeugte Datei öffnet in Excel mit korrekten Spalten und Umlauten;
Beträge in deutschem Zahlenformat; Druckansicht ohne Navigation lesbar.

---

## A5 · Zeiterfassung: Sollzeiten und Abwesenheiten · groß

Erfasst wird nur Anwesenheit. Für eine brauchbare Monatsabrechnung fehlen
Sollstunden, Urlaub, Krankheit und Feiertage.

**Umsetzung:** Wochensollzeit in den Moduldaten; je Tag eine Art
(Arbeit, Urlaub, Krank, Feiertag); Monatsübersicht mit Soll, Ist und Saldo.
Feiertage nach Bundesland berechnen, **nicht** aus dem Netz laden (K1).

**Abnahme:** Ein Monat mit gemischten Tagesarten ergibt eine nachvollziehbare
Salden­rechnung; Altbestände ohne Tagesart gelten weiter als Arbeitstage.

---

## A6 · Lagerverwaltung · groß

Modul `lager` ist angemeldet, aber leer. Kunden sehen „Bald verfügbar".

**Umsetzung:** Nach `spec/08-rezepte.md`, Rezept 1. Artikel mit Nummer,
Bezeichnung, Einheit, Bestand, Mindestbestand; Zu- und Abgänge mit Datum und
Grund; Warnung bei Unterschreitung.

**Abnahme:** `gebaut: true`, Kachel zeigt eine sinnvolle Kennzahl, Daten liegen
unter `HZ.app.daten().lager`, alle Texte durch `esc()`, Bestand ergibt sich aus
den Bewegungen statt separat gepflegt zu werden.

---

## A7 · Lohnabrechnung · groß, rechtlich heikel

Modul `lohn` ist angemeldet, aber leer.

**Vorher klären:** Eine echte deutsche Lohnabrechnung verlangt Lohnsteuer,
Sozialversicherung, Beitragssätze und Meldeverfahren — das ist ein eigenes
Produkt mit Haftungsfragen und jährlichen Änderungen. Wahrscheinlich ist eine
Vorerfassung sinnvoller, die Daten für den Steuerberater aufbereitet, statt
selbst zu rechnen.

**Abnahme:** Erst wenn der Umfang mit dem Eigentümer festgelegt ist. Ohne diese
Klärung nicht anfangen.

---

## A8 · CRM · mittel

Modul `crm` ist angemeldet, aber leer. Kunden, Ansprechpartner, Notizen,
Wiedervorlage. Vom Umfang her das einfachste der drei offenen Module und daher
ein guter erster Kandidat nach A6.

---

## A9 · Schlüsselwechsel vorbereiten · vorsorglich

Es gibt keinen Weg, den Händlerschlüssel zu wechseln, ohne dass alle Kunden
gleichzeitig neues Programm und neue Lizenz brauchen. Bei einem Verdacht auf
Kompromittierung wäre das ein Kaltstart.

**Umsetzung:** `HZ.haendlerSchluessel` als **Liste** akzeptierter öffentlicher
Schlüssel statt eines einzelnen. Das ERP prüft der Reihe nach. So kann ein neuer
Schlüssel eingeführt werden, während alte Lizenzen weiter gelten, und der alte
fällt weg, wenn alle umgestellt sind.

**Abnahme:** Lizenzen zweier verschiedener Schlüsselpaare melden sich am selben
Programm an; ein entfernter Schlüssel wird abgewiesen; Selbsttest erweitert;
`vendor-key.js` bleibt für den Einzelfall abwärtskompatibel lesbar.

---

## Bekannte Grenzen — kein Handlungsbedarf

**Zurückspielen einer älteren Kopie.** Ein Kunde kann eine frühere Fassung
seiner eigenen Datei wiederherstellen und damit eine Herabstufung rückgängig
machen. Ein Gegenmittel bräuchte einen Server, der Zähler führt — das
widerspricht K1. Bewusst hingenommen.

**Herausschneiden der Prüfung.** Das Programm läuft im Browser des Kunden. Wer
JavaScript beherrscht, entfernt die Signaturprüfung. Ohne Server nicht lösbar.
Diese Grenze wird benannt, nicht kaschiert (K10).
