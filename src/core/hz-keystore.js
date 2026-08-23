/* =============================================================
   HZ · Haendler-Schluesselspeicher
   -------------------------------------------------------------
   Der private Signaturschluessel ist das einzige echte Geheimnis
   des ganzen Systems. Wer ihn hat, kann Lizenzen ausstellen.

   Deshalb steht er nirgends im Programmcode, sondern in einer
   eigenen Datei, die nur der Haendler besitzt und die selbst mit
   einem Hauptpasswort verschluesselt ist. Der Generator darf
   dadurch bedenkenlos oeffentlich liegen - ohne diese Datei kann
   er keine gueltige Lizenz erzeugen.

   Aufbau von hz-haendler-schluessel.json:

   {
     "format": "HZK1",
     "erstelltAm": "...",
     "kdf":  { name, hash, iterations, salt },
     "box":  { iv, ct },          <- verschluesselt: die privaten Schluessel
     "oeffentlich": { signatur: {jwk}, transport: {jwk} }
   }
   ============================================================= */
window.HZ = window.HZ || {};
HZ.keystore = (function () {
  'use strict';

  var K = HZ.crypto;
  var FORMAT = 'HZK1';
  var AAD = 'HZ-Haendlerschluessel-v1';
  var HANDLE_KEY = 'haendler-schluesseldatei';

  /* ---------- Neues Schluesselpaar ----------
     Zwei getrennte Paare mit klar getrennten Aufgaben:
       signatur  ECDSA - beweist, dass eine Lizenz von uns stammt
       transport ECDH  - oeffnet spaeter Lizenzen ohne Kundenpasswort */
  async function erzeugen(hauptpasswort) {
    var sign = await K.signaturSchluesselpaar();
    var transport = await K.ecdhSchluesselpaar();

    var privat = {
      signatur: await crypto.subtle.exportKey('jwk', sign.privateKey),
      transport: await crypto.subtle.exportKey('jwk', transport.privateKey)
    };
    var oeffentlich = {
      signatur: K.nurOeffentlich(await crypto.subtle.exportKey('jwk', sign.publicKey)),
      transport: K.nurOeffentlich(await crypto.subtle.exportKey('jwk', transport.publicKey))
    };

    var datei = await verschluesseln(privat, oeffentlich, hauptpasswort);
    return { datei: datei, privat: privat, oeffentlich: oeffentlich };
  }

  async function verschluesseln(privat, oeffentlich, hauptpasswort) {
    var salt = K.randomBytes(16);
    var key = await K.keyAusPasswort(hauptpasswort, salt, K.PBKDF2_RUNDEN);
    return {
      format: FORMAT,
      erstelltAm: new Date().toISOString(),
      kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: K.PBKDF2_RUNDEN, salt: K.bytesToB64u(salt) },
      box: await K.aesEncryptText(key, JSON.stringify(privat), AAD),
      oeffentlich: oeffentlich
    };
  }

  function istKeystore(obj) {
    return !!(obj && obj.format === FORMAT && obj.box && obj.kdf && obj.oeffentlich);
  }

  /* ---------- Oeffnen ---------- */
  async function oeffnen(datei, hauptpasswort) {
    if (!istKeystore(datei)) {
      throw new Error('Diese Datei ist keine HZ-Schluesseldatei.');
    }
    var salt = K.b64uToBytes(datei.kdf.salt);
    var key = await K.keyAusPasswort(hauptpasswort, salt, datei.kdf.iterations || K.PBKDF2_RUNDEN);

    var text;
    try {
      text = await K.aesDecryptText(key, datei.box, AAD);
    } catch (e) {
      var f = new Error('Falsches Hauptpasswort.');
      f.code = 'passwort';
      throw f;
    }

    var privat = JSON.parse(text);
    return {
      privat: privat,
      oeffentlich: datei.oeffentlich,
      signKey: await K.signKeyImportieren(privat.signatur)
    };
  }

  /* ---------- Hauptpasswort wechseln ---------- */
  async function passwortWechseln(datei, altesPasswort, neuesPasswort) {
    var offen = await oeffnen(datei, altesPasswort);
    return verschluesseln(offen.privat, offen.oeffentlich, neuesPasswort);
  }

  /* ---------- Baustein fuer das ERP ----------
     Der oeffentliche Signaturschluessel muss ins ERP. Diese Funktion
     erzeugt genau den Dateiinhalt, der dafuer eingecheckt wird. */
  function oeffentlichenSchluesselAlsJs(oeffentlich) {
    return [
      '/* =============================================================',
      '   HZ · Oeffentlicher Haendlerschluessel',
      '   -------------------------------------------------------------',
      '   Erzeugt vom HZ-Lizenz-Generator am ' + new Date().toLocaleString('de-DE') + '.',
      '',
      '   Diese Datei enthaelt ausschliesslich oeffentliche Schluessel.',
      '   Sie darf und soll im Repository liegen - damit prueft das',
      '   ERP-System, ob eine Lizenz wirklich von Ihnen stammt.',
      '',
      '   Der zugehoerige private Schluessel steht in Ihrer Datei',
      '   hz-haendler-schluessel.json und gehoert NICHT ins Repository.',
      '   ============================================================= */',
      'window.HZ = window.HZ || {};',
      'HZ.haendlerSchluessel = ' + JSON.stringify(oeffentlich, null, 2) + ';',
      ''
    ].join('\n');
  }

  /* ---------- Dateihandle merken ---------- */
  function handleKey() { return HANDLE_KEY; }

  return {
    FORMAT: FORMAT,
    erzeugen: erzeugen,
    verschluesseln: verschluesseln,
    istKeystore: istKeystore,
    oeffnen: oeffnen,
    passwortWechseln: passwortWechseln,
    oeffentlichenSchluesselAlsJs: oeffentlichenSchluesselAlsJs,
    handleKey: handleKey
  };
})();
