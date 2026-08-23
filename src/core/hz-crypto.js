/* =============================================================
   HZ · Krypto-Grundlagen
   -------------------------------------------------------------
   Reine Primitive, keine Fachlogik. Alles ueber die native
   WebCrypto-API des Browsers, keine Fremdbibliotheken.

   Verwendete Verfahren:
     Passwortableitung  PBKDF2-HMAC-SHA256, 310.000 Runden
     Verschluesselung   AES-256-GCM
     Signatur           ECDSA P-256 mit SHA-256
     Schluesseltransport ECDH P-256 + HKDF-SHA256
   ============================================================= */
window.HZ = window.HZ || {};
HZ.crypto = (function () {
  'use strict';

  var C = (window.crypto && window.crypto.subtle) || null;
  var te = new TextEncoder();
  var td = new TextDecoder();

  /* WebCrypto gibt es nur im "secure context": https:// oder file://.
     Ueber einfaches http:// auf einer fremden Domain fehlt subtle. */
  function verfuegbar() { return !!C; }

  /* ---------- base64url ---------- */
  function bytesToB64u(input) {
    var arr = input instanceof Uint8Array ? input : new Uint8Array(input);
    var s = '';
    for (var i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function b64uToBytes(str) {
    var s = String(str).replace(/-/g, '+').replace(/_/g, '/');
    var rest = s.length % 4;
    if (rest) s += new Array(5 - rest).join('=');
    var bin = atob(s);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function randomBytes(n) {
    var a = new Uint8Array(n);
    crypto.getRandomValues(a);
    return a;
  }

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    var b = randomBytes(16);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    var hex = Array.prototype.map.call(b, function (x) {
      return ('0' + x.toString(16)).slice(-2);
    }).join('');
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) +
           '-' + hex.slice(16, 20) + '-' + hex.slice(20);
  }

  /* ---------- Kanonische JSON-Form ----------
     Signiert wird nie das rohe JSON, sondern diese Darstellung mit
     fest sortierten Schluesseln. Sonst wuerde eine andere Reihenfolge
     derselben Daten eine andere Signatur ergeben. */
  function canonical(value) {
    if (value === undefined) return 'null';
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) {
      return '[' + value.map(canonical).join(',') + ']';
    }
    var keys = Object.keys(value).filter(function (k) {
      return value[k] !== undefined;
    }).sort();
    return '{' + keys.map(function (k) {
      return JSON.stringify(k) + ':' + canonical(value[k]);
    }).join(',') + '}';
  }

  /* ---------- Passwort -> Schluessel ---------- */
  var PBKDF2_RUNDEN = 310000;

  async function keyAusPasswort(passwort, saltBytes, runden) {
    var basis = await C.importKey('raw', te.encode(passwort), 'PBKDF2', false, ['deriveKey']);
    return C.deriveKey(
      { name: 'PBKDF2', salt: saltBytes, iterations: runden || PBKDF2_RUNDEN, hash: 'SHA-256' },
      basis,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /* ---------- AES-256-GCM ----------
     Jeder Aufruf erzeugt einen frischen 96-Bit-IV. Ein IV darf mit
     demselben Schluessel niemals zweimal verwendet werden. */
  async function aesEncryptBytes(key, bytes, aad) {
    var iv = randomBytes(12);
    var p = { name: 'AES-GCM', iv: iv };
    if (aad) p.additionalData = te.encode(aad);
    var ct = await C.encrypt(p, key, bytes);
    return { iv: bytesToB64u(iv), ct: bytesToB64u(ct) };
  }

  async function aesDecryptBytes(key, box, aad) {
    var p = { name: 'AES-GCM', iv: b64uToBytes(box.iv) };
    if (aad) p.additionalData = te.encode(aad);
    var pt = await C.decrypt(p, key, b64uToBytes(box.ct));
    return new Uint8Array(pt);
  }

  async function aesEncryptText(key, text, aad) {
    return aesEncryptBytes(key, te.encode(text), aad);
  }

  async function aesDecryptText(key, box, aad) {
    return td.decode(await aesDecryptBytes(key, box, aad));
  }

  /* ---------- Datenschluessel (DEK) ----------
     Der eigentliche Inhalt wird immer mit einem zufaelligen DEK
     verschluesselt. Passwort und Haendlerschluessel verpacken nur
     diesen DEK - deshalb kann das Passwort gewechselt werden, ohne
     die Nutzdaten neu zu verschluesseln. */
  async function dekErzeugen() {
    return C.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  }

  async function dekExportieren(key) {
    return new Uint8Array(await C.exportKey('raw', key));
  }

  async function dekImportieren(rohBytes) {
    return C.importKey('raw', rohBytes, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
  }

  /* ---------- Signatur: ECDSA P-256 ---------- */
  async function signaturSchluesselpaar() {
    return C.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  }

  async function signieren(privateKey, nachricht) {
    var sig = await C.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, te.encode(nachricht));
    return bytesToB64u(sig);
  }

  async function pruefen(publicKey, signaturB64u, nachricht) {
    try {
      return await C.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        publicKey,
        b64uToBytes(signaturB64u),
        te.encode(nachricht)
      );
    } catch (e) {
      return false;
    }
  }

  async function signKeyImportieren(jwk) {
    return C.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  }

  async function verifyKeyImportieren(jwk) {
    return C.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  }

  /* ---------- Schluesseltransport: ECDH P-256 + HKDF ----------
     Damit verpackt der Generator den DEK zusaetzlich fuer den
     Haendler. So kann eine Lizenz spaeter verlaengert werden, ohne
     dass der Haendler das Kundenpasswort kennt. */
  async function ecdhSchluesselpaar() {
    return C.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits']);
  }

  async function hkdfWrapKey(sharedBits, info) {
    var basis = await C.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
    return C.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: te.encode(info) },
      basis,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  function nurOeffentlich(jwk) {
    return { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };
  }

  async function fuerEmpfaengerVerpacken(empfaengerPubJwk, dekRoh, info) {
    var empf = await C.importKey('jwk', empfaengerPubJwk, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    var eph = await C.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    var shared = await C.deriveBits({ name: 'ECDH', public: empf }, eph.privateKey, 256);
    var wrapKey = await hkdfWrapKey(shared, info);
    var box = await aesEncryptBytes(wrapKey, dekRoh);
    var epk = await C.exportKey('jwk', eph.publicKey);
    return { epk: nurOeffentlich(epk), iv: box.iv, ct: box.ct };
  }

  async function alsEmpfaengerAuspacken(empfaengerPrivJwk, wrap, info) {
    var priv = await C.importKey('jwk', empfaengerPrivJwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
    var epk = await C.importKey('jwk', wrap.epk, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    var shared = await C.deriveBits({ name: 'ECDH', public: epk }, priv, 256);
    var wrapKey = await hkdfWrapKey(shared, info);
    return aesDecryptBytes(wrapKey, wrap);
  }

  /* ---------- Passwoerter ---------- */
  /* Ohne aehnlich aussehende Zeichen (I, l, 1, O, 0). 56 Zeichen
     Alphabet, 14 Stellen -> rund 81 Bit Entropie. */
  var PW_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

  function passwortErzeugen(laenge) {
    var n = laenge || 14;
    var out = '';
    var arr = new Uint32Array(n);
    /* Rejection sampling: ein einfaches Modulo wuerde die ersten
       Zeichen des Alphabets minimal bevorzugen. */
    var grenze = Math.floor(4294967296 / PW_ALPHABET.length) * PW_ALPHABET.length;
    var i = 0;
    while (i < n) {
      crypto.getRandomValues(arr);
      for (var j = 0; j < arr.length && i < n; j++) {
        if (arr[j] < grenze) { out += PW_ALPHABET[arr[j] % PW_ALPHABET.length]; i++; }
      }
    }
    return out;
  }

  /* Grobe Entropieschaetzung in Bit - nur fuer die Anzeige gedacht. */
  function passwortStaerke(pw) {
    if (!pw) return { bits: 0, stufe: 'leer', text: 'Kein Passwort' };
    var raum = 0;
    if (/[a-z]/.test(pw)) raum += 26;
    if (/[A-Z]/.test(pw)) raum += 26;
    if (/[0-9]/.test(pw)) raum += 10;
    if (/[^a-zA-Z0-9]/.test(pw)) raum += 33;
    var einzigartig = new Set(pw.split('')).size;
    var bits = Math.round(pw.length * Math.log2(raum || 1) * Math.min(1, einzigartig / Math.max(1, pw.length) + 0.35));
    var stufe, text;
    if (bits < 40) { stufe = 'schwach'; text = 'Zu schwach'; }
    else if (bits < 60) { stufe = 'mittel'; text = 'Brauchbar'; }
    else if (bits < 80) { stufe = 'gut'; text = 'Gut'; }
    else { stufe = 'stark'; text = 'Sehr stark'; }
    return { bits: bits, stufe: stufe, text: text };
  }

  return {
    verfuegbar: verfuegbar,
    bytesToB64u: bytesToB64u,
    b64uToBytes: b64uToBytes,
    randomBytes: randomBytes,
    uuid: uuid,
    canonical: canonical,
    PBKDF2_RUNDEN: PBKDF2_RUNDEN,
    keyAusPasswort: keyAusPasswort,
    aesEncryptBytes: aesEncryptBytes,
    aesDecryptBytes: aesDecryptBytes,
    aesEncryptText: aesEncryptText,
    aesDecryptText: aesDecryptText,
    dekErzeugen: dekErzeugen,
    dekExportieren: dekExportieren,
    dekImportieren: dekImportieren,
    signaturSchluesselpaar: signaturSchluesselpaar,
    signieren: signieren,
    pruefen: pruefen,
    signKeyImportieren: signKeyImportieren,
    verifyKeyImportieren: verifyKeyImportieren,
    ecdhSchluesselpaar: ecdhSchluesselpaar,
    nurOeffentlich: nurOeffentlich,
    fuerEmpfaengerVerpacken: fuerEmpfaengerVerpacken,
    alsEmpfaengerAuspacken: alsEmpfaengerAuspacken,
    passwortErzeugen: passwortErzeugen,
    passwortStaerke: passwortStaerke
  };
})();
