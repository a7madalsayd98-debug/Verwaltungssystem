/* =============================================================
   HZ · Lizenzformat HZL2
   -------------------------------------------------------------
   Aufbau einer Lizenzdatei:

   {
     "format": "HZL2",
     "erstelltAm": "2026-08-23T12:00:00.000Z",
     "kdf":     { name, hash, iterations, salt },
     "wrap": {
       "passwort": { iv, ct },              <- DEK, mit Kundenpasswort verpackt
       "haendler": { epk, iv, ct }          <- DEK, fuer den Haendler verpackt
     },
     "payload": { iv, ct }                  <- AES-256-GCM ueber den Inhalt
   }

   Entschluesselter Inhalt (payload):

   {
     lizenzId, kunde, ausgestelltAm, aktualisiertAm,
     gueltigBis, module, sig, daten
   }

   Zwei getrennte Schutzmechanismen:

   1. Verschluesselung schuetzt den Inhalt auf dem Transportweg.
      Ohne Kundenpasswort oder Haendlerschluessel ist die Datei
      nicht lesbar.

   2. Die Signatur schuetzt die Berechtigungen. Signiert wird nur
      der Anspruchsteil (Kunde, Laufzeit, Module) - nicht "daten".
      Deshalb bleibt die Signatur gueltig, wenn der Kunde arbeitet
      und speichert, aber sie bricht, sobald jemand die Laufzeit
      oder die Modulfreigabe veraendert.
   ============================================================= */
window.HZ = window.HZ || {};
HZ.license = (function () {
  'use strict';

  var K = HZ.crypto;

  var FORMAT = 'HZL2';
  var AAD_PAYLOAD = 'HZ-Lizenz-Inhalt-v2';
  var AAD_WRAP_PW = 'HZ-Lizenz-Passwortverpackung-v2';
  var INFO_HAENDLER = 'HZ-Lizenz-Haendlerverpackung-v2';

  /* Module in fester, normalisierter Form. Generator und ERP muessen
     hier bitgleich rechnen, sonst schlaegt die Signaturpruefung fehl -
     deshalb steht diese Funktion im gemeinsamen Kern. */
  function moduleNormalisieren(m) {
    var out = {};
    Object.keys(m || {}).sort().forEach(function (k) { out[k] = !!m[k]; });
    return out;
  }

  /* Genau dieser Ausschnitt wird signiert. */
  function signaturAnsicht(inhalt) {
    return {
      v: 2,
      lizenzId: inhalt.lizenzId,
      kunde: inhalt.kunde,
      gueltigBis: inhalt.gueltigBis,
      module: moduleNormalisieren(inhalt.module),
      ausgestelltAm: inhalt.ausgestelltAm
    };
  }

  function signaturNachricht(inhalt) {
    return K.canonical(signaturAnsicht(inhalt));
  }

  /* ---------- Format erkennen ---------- */
  function istHZL2(obj) {
    return !!(obj && obj.format === FORMAT && obj.payload && obj.wrap && obj.kdf);
  }

  /* Altes Klartextformat: {lizenzId, kunde, gueltigBis, auth:{salt,hash}, module, daten} */
  function istAltformat(obj) {
    return !!(obj && !obj.format && obj.auth && obj.auth.salt && obj.auth.hash);
  }

  /* ---------- Fehlertypen ----------
     Damit die Oberflaeche "falsches Passwort" von "manipuliert"
     unterscheiden kann, ohne Fehlertexte zu vergleichen. */
  function LizenzFehler(code, nachricht) {
    var e = new Error(nachricht);
    e.name = 'LizenzFehler';
    e.code = code;
    return e;
  }

  /* ---------- Neue Lizenz versiegeln ---------- */
  /*  inhalt: { lizenzId, kunde, gueltigBis, module, daten, ... }
      opts:   { passwort, signKey, haendlerPubJwk } */
  async function versiegeln(inhalt, opts) {
    if (!opts.passwort) throw LizenzFehler('kein-passwort', 'Es wurde kein Passwort uebergeben.');
    if (!opts.signKey) throw LizenzFehler('kein-signaturschluessel', 'Es wurde kein Signaturschluessel uebergeben.');

    var voll = JSON.parse(JSON.stringify(inhalt));
    voll.module = moduleNormalisieren(voll.module);
    voll.sig = await K.signieren(opts.signKey, signaturNachricht(voll));

    var dek = await K.dekErzeugen();
    var datei = { format: FORMAT, erstelltAm: new Date().toISOString(), kdf: null, wrap: {}, payload: null };

    if (opts.haendlerPubJwk) {
      var dekRoh = await K.dekExportieren(dek);
      datei.wrap.haendler = await K.fuerEmpfaengerVerpacken(opts.haendlerPubJwk, dekRoh, INFO_HAENDLER);
    }

    await passwortSetzen(datei, dek, opts.passwort);
    await inhaltSchreiben(datei, dek, voll);
    return { datei: datei, dek: dek, inhalt: voll };
  }

  /* ---------- Passwort setzen bzw. wechseln ----------
     Verpackt denselben DEK unter einem neuen Passwort neu. Die
     Haendlerverpackung und die Nutzdaten bleiben unberuehrt. */
  async function passwortSetzen(datei, dek, passwort) {
    var salt = K.randomBytes(16);
    datei.kdf = {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: K.PBKDF2_RUNDEN,
      salt: K.bytesToB64u(salt)
    };
    var pwKey = await K.keyAusPasswort(passwort, salt, datei.kdf.iterations);
    var dekRoh = await K.dekExportieren(dek);
    datei.wrap.passwort = await K.aesEncryptBytes(pwKey, dekRoh, AAD_WRAP_PW);
    return datei;
  }

  /* ---------- Nutzdaten schreiben ----------
     Wird bei jedem Speichern im ERP aufgerufen. Signatur und
     Verpackungen bleiben unveraendert, nur der Inhalt wird mit
     frischem IV neu verschluesselt. */
  async function inhaltSchreiben(datei, dek, inhalt) {
    datei.payload = await K.aesEncryptText(dek, JSON.stringify(inhalt), AAD_PAYLOAD);
    return datei;
  }

  /* ---------- Oeffnen mit Kundenpasswort ---------- */
  async function oeffnenMitPasswort(datei, passwort, verifyKey) {
    if (!istHZL2(datei)) throw LizenzFehler('format', 'Diese Datei ist keine HZ-Lizenzdatei im aktuellen Format.');

    var salt = K.b64uToBytes(datei.kdf.salt);
    var pwKey = await K.keyAusPasswort(passwort, salt, datei.kdf.iterations || K.PBKDF2_RUNDEN);

    var dekRoh;
    try {
      dekRoh = await K.aesDecryptBytes(pwKey, datei.wrap.passwort, AAD_WRAP_PW);
    } catch (e) {
      /* AES-GCM schlaegt fehl, sobald der Schluessel nicht passt.
         Das ist hier der Test auf das richtige Passwort. */
      throw LizenzFehler('passwort', 'Falsches Passwort.');
    }

    var dek = await K.dekImportieren(dekRoh);
    return inhaltLesen(datei, dek, verifyKey);
  }

  /* ---------- Oeffnen mit Haendlerschluessel ---------- */
  async function oeffnenAlsHaendler(datei, haendlerPrivJwk, verifyKey) {
    if (!istHZL2(datei)) throw LizenzFehler('format', 'Diese Datei ist keine HZ-Lizenzdatei im aktuellen Format.');
    if (!datei.wrap || !datei.wrap.haendler) {
      throw LizenzFehler('keine-haendlerverpackung',
        'Diese Lizenzdatei enthaelt keine Haendlerverpackung und kann nur mit dem Kundenpasswort geoeffnet werden.');
    }

    var dekRoh;
    try {
      dekRoh = await K.alsEmpfaengerAuspacken(haendlerPrivJwk, datei.wrap.haendler, INFO_HAENDLER);
    } catch (e) {
      throw LizenzFehler('falscher-haendlerschluessel',
        'Diese Lizenz wurde mit einem anderen Haendlerschluessel ausgestellt.');
    }

    var dek = await K.dekImportieren(dekRoh);
    return inhaltLesen(datei, dek, verifyKey);
  }

  /* ---------- Inhalt entschluesseln und Signatur pruefen ---------- */
  async function inhaltLesen(datei, dek, verifyKey) {
    var text;
    try {
      text = await K.aesDecryptText(dek, datei.payload, AAD_PAYLOAD);
    } catch (e) {
      throw LizenzFehler('inhalt-beschaedigt', 'Der Inhalt der Lizenzdatei ist beschaedigt.');
    }

    var inhalt;
    try {
      inhalt = JSON.parse(text);
    } catch (e) {
      throw LizenzFehler('inhalt-beschaedigt', 'Der Inhalt der Lizenzdatei ist beschaedigt.');
    }

    var signaturOk = false;
    if (verifyKey && inhalt.sig) {
      signaturOk = await K.pruefen(verifyKey, inhalt.sig, signaturNachricht(inhalt));
    }

    return { inhalt: inhalt, dek: dek, signaturOk: signaturOk };
  }

  /* ---------- Berechtigungen neu ausstellen ----------
     Verlaengerung oder Modulwechsel: der Anspruchsteil wird
     geaendert und neu signiert, "daten" bleibt unangetastet. */
  async function neuSignieren(inhalt, signKey) {
    inhalt.module = moduleNormalisieren(inhalt.module);
    inhalt.aktualisiertAm = new Date().toISOString();
    inhalt.sig = await K.signieren(signKey, signaturNachricht(inhalt));
    return inhalt;
  }

  /* ---------- Laufzeit ---------- */
  function abgelaufen(inhalt) {
    /* Kein Datum heisst hier abgelaufen, nicht unbegrenzt. Eine
       Lizenz ohne Laufzeit darf es nicht geben; wer das Feld
       entfernt, kommt damit nicht durch. */
    if (!inhalt || !inhalt.gueltigBis) return true;
    var heute = new Date(); heute.setHours(0, 0, 0, 0);
    var ablauf = new Date(inhalt.gueltigBis + 'T00:00:00');
    if (isNaN(ablauf.getTime())) return true;
    return heute > ablauf;
  }

  function tageBisAblauf(inhalt) {
    if (!inhalt || !inhalt.gueltigBis) return -1;
    var heute = new Date(); heute.setHours(0, 0, 0, 0);
    var ablauf = new Date(inhalt.gueltigBis + 'T00:00:00');
    if (isNaN(ablauf.getTime())) return -1;
    return Math.round((ablauf - heute) / 86400000);
  }

  return {
    FORMAT: FORMAT,
    istHZL2: istHZL2,
    istAltformat: istAltformat,
    moduleNormalisieren: moduleNormalisieren,
    signaturNachricht: signaturNachricht,
    versiegeln: versiegeln,
    passwortSetzen: passwortSetzen,
    inhaltSchreiben: inhaltSchreiben,
    oeffnenMitPasswort: oeffnenMitPasswort,
    oeffnenAlsHaendler: oeffnenAlsHaendler,
    neuSignieren: neuSignieren,
    abgelaufen: abgelaufen,
    tageBisAblauf: tageBisAblauf
  };
})();
