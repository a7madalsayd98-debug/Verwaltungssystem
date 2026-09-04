# 03 · Lizenzformat HZL2 (normativ)

Dieses Dokument ist bindend. Abweichungen machen bestehende Kundenlizenzen
unlesbar. Änderungen nur unter den Bedingungen aus K6 der Konstitution.

## Verfahren und Parameter

| Zweck | Verfahren | Festlegung |
| --- | --- | --- |
| Passwortableitung | PBKDF2-HMAC-SHA256 | 310.000 Runden, 16 Byte Salz |
| Verschlüsselung | AES-256-GCM | 12 Byte IV, **je Aufruf neu** |
| Signatur | ECDSA P-256 mit SHA-256 | über kanonisches JSON |
| Schlüsseltransport | ECDH P-256 + HKDF-SHA256 | leeres Salz, Domänenstring als `info` |
| Kodierung | base64url | ohne Auffüllzeichen |

Domänenstrings, exakt so und nicht anders:

```
HZ-Lizenz-Inhalt-v2                 AAD des Nutzdaten-Chiffrats
HZ-Lizenz-Passwortverpackung-v2     AAD der Passwortverpackung
HZ-Lizenz-Haendlerverpackung-v2     HKDF-info der Händlerverpackung
HZ-Haendlerschluessel-v1            AAD der Schlüsseldatei
```

## Aufbau der Datei

```json
{
  "format": "HZL2",
  "erstelltAm": "2026-08-23T14:33:47.646Z",
  "kdf":  { "name": "PBKDF2", "hash": "SHA-256",
            "iterations": 310000, "salt": "<base64url>" },
  "wrap": {
    "passwort": { "iv": "<b64u>", "ct": "<b64u>" },
    "haendler": { "epk": { "kty":"EC","crv":"P-256","x":"…","y":"…" },
                  "iv": "<b64u>", "ct": "<b64u>" }
  },
  "payload": { "iv": "<b64u>", "ct": "<b64u>" }
}
```

Mehr steht **nicht** im Klartext. Kein Kundenname, keine Module, keine Laufzeit
(K9). Der Selbsttest prüft das.

## Entschlüsselter Inhalt

```json
{
  "lizenzId": "<uuid>",
  "kunde": "Müller & Söhne GmbH",
  "ausgestelltAm": "<ISO>",
  "aktualisiertAm": "<ISO>",
  "gueltigBis": "2027-08-23",
  "module": { "crm": false, "hauptbuch": true, "lager": false,
              "lohn": false, "zeiterfassung": true },
  "sig": "<base64url>",
  "daten": { "zeiterfassung": {}, "hauptbuch": { … } }
}
```

`gueltigBis` ist ein **lokales** Kalenderdatum, kein Zeitstempel. Niemals über
`toISOString()` erzeugen — das rechnet nach UTC um und springt in deutschen
Zeitzonen nachts einen Tag zurück. Dafür gibt es `HZ.ui.isoTag()` und
`HZ.ui.isoTagPlus()`.

## Zwei Verpackungen für einen Schlüssel

Der Datenschlüssel (DEK) wird zufällig erzeugt und zweimal verpackt:

- **`wrap.passwort`** — mit dem aus dem Kundenpasswort abgeleiteten Schlüssel.
- **`wrap.haendler`** — per ECDH gegen den öffentlichen Transportschlüssel des
  Händlers. Der flüchtige öffentliche Schlüssel liegt als `epk` dabei.

Das löst zwei Dinge zugleich: Der Kunde kann sein Passwort wechseln, ohne dass
Nutzdaten neu verschlüsselt werden — es wird nur `wrap.passwort` ersetzt. Und
der Händler kann eine Lizenz verlängern, ohne das Kundenpasswort zu kennen.

`wrap.haendler` ist optional; fehlt sie, ist die Lizenz nur mit dem
Kundenpasswort zu öffnen. Der Generator legt sie immer an.

## Signaturumfang — der wichtigste Punkt

Signiert wird **nicht** die ganze Datei und **nicht** die Nutzdaten, sondern
genau dieser Ausschnitt, kanonisch serialisiert:

```js
{ v: 2, lizenzId, kunde, gueltigBis, module, ausgestelltAm }
```

`daten` bleibt bewusst außen vor. Sonst würde jede gespeicherte Zeitbuchung die
Signatur brechen und der Kunde käme am nächsten Tag nicht mehr hinein.

Zwei Fallen, die dabei zu beachten sind:

**Kanonische Form.** `HZ.crypto.canonical()` sortiert Schlüssel und lässt
`undefined` weg. Ohne das ergäbe dieselbe Information je nach
Eigenschaftsreihenfolge eine andere Signatur. Niemals `JSON.stringify` zum
Signieren verwenden.

**Modulnormalisierung.** `HZ.license.moduleNormalisieren()` sortiert die
Schlüssel und wandelt jeden Wert in einen echten Booleschen. Generator und ERP
müssen bitgleich rechnen — deshalb steht die Funktion im gemeinsamen Kern und
darf nicht dupliziert werden.

## Regeln für die Gültigkeit

| Lage | Ergebnis |
| --- | --- |
| `gueltigBis` fehlt | **abgelaufen** |
| `gueltigBis` unsinnig | **abgelaufen** |
| `gueltigBis` ist heute | gültig (der letzte Tag zählt noch) |
| `sig` fehlt | ungültig |
| `sig` passt nicht | ungültig |
| kein Händlerschlüssel im Programm | Anmeldung verweigert |

Durchgehend fail-closed (K5). Die erste Fassung machte hier den Kardinalfehler,
fehlende Felder als „unbegrenzt" zu lesen.

## Schnittstelle von `HZ.license`

```js
versiegeln(inhalt, { passwort, signKey, haendlerPubJwk })
          → { datei, dek, inhalt }         // signiert und verschlüsselt neu
oeffnenMitPasswort(datei, passwort, verifyKey)
          → { inhalt, dek, signaturOk }    // wirft bei falschem Passwort
oeffnenAlsHaendler(datei, haendlerPrivJwk, verifyKey)
          → { inhalt, dek, signaturOk }
inhaltSchreiben(datei, dek, inhalt)        // Nutzdaten neu verschlüsseln
passwortSetzen(datei, dek, passwort)       // nur wrap.passwort ersetzen
neuSignieren(inhalt, signKey)              // nach Änderung der Berechtigungen
abgelaufen(inhalt) / tageBisAblauf(inhalt)
istHZL2(obj) / istAltformat(obj)
```

`signaturOk` wird **zurückgegeben, nicht geworfen**. Der Generator zeigt damit
eine Warnung an und arbeitet weiter; das ERP bricht ab. Diese Rollenteilung
beibehalten — der Anbieter muss eine manipulierte Datei ansehen können, um sie
zu reparieren.

Fehler tragen einen `code`, damit die Oberfläche unterscheiden kann, ohne
Fehlertexte zu vergleichen: `passwort`, `format`, `inhalt-beschaedigt`,
`falscher-haendlerschluessel`, `keine-haendlerverpackung`.

## Schlüsseldatei HZK1

```json
{
  "format": "HZK1",
  "erstelltAm": "<ISO>",
  "kdf": { "name":"PBKDF2","hash":"SHA-256","iterations":310000,"salt":"<b64u>" },
  "box": { "iv":"<b64u>", "ct":"<b64u>" },
  "oeffentlich": { "signatur": {jwk}, "transport": {jwk} }
}
```

`box` enthält verschlüsselt die beiden privaten JWK. Zwei getrennte
Schlüsselpaare mit getrennten Aufgaben: `signatur` (ECDSA) beweist die Herkunft,
`transport` (ECDH) öffnet Lizenzen ohne Kundenpasswort. Nicht zusammenlegen —
ein Schlüssel, zwei Zwecke ist ein bekanntes Muster für Fehler.

Öffentliche JWK werden mit `HZ.crypto.nurOeffentlich()` auf `kty/crv/x/y`
beschnitten, damit kein privater Anteil und keine `key_ops` durchrutschen.

## Altformat und Migration

Erkennungsmerkmal: kein `format`, aber `auth.salt` und `auth.hash`. Diese
Dateien sind unverschlüsselt und unsigniert.

Das ERP **weist sie ab** — sie anzunehmen hieße, die Lücke offen zu lassen. Der
Generator hat dafür den Reiter *Altformat übernehmen*: liest die alte Datei,
übernimmt `daten` vollständig und stellt im neuen Format aus. Das alte Passwort
lässt sich nicht mitnehmen, gespeichert war nur dessen Hashwert.

Bei einem künftigen Format HZL3 ist derselbe Weg zu gehen: neue Kennung, das
ERP liest nur die neueste, der Generator migriert.

## Passwörter

Erzeugt werden 14 Zeichen aus einem 56er-Alphabet ohne `I`, `l`, `1`, `O`, `0`
— rund 81 Bit. Mit Zurückweisungs-Stichprobe, weil ein einfaches Modulo die
ersten Zeichen des Alphabets leicht bevorzugen würde.

Mindestlänge überall 10 Zeichen, auch für das Hauptpasswort der Schlüsseldatei.
Diese Grenze nicht senken: Die Lizenzdatei reist über WhatsApp, ein Angreifer
kann also offline probieren. Die 310.000 PBKDF2-Runden bremsen ihn, ersetzen
aber kein ordentliches Passwort.
