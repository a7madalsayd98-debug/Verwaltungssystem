/* =============================================================
   HZ · Dezentrale Speicherung
   -------------------------------------------------------------
   Es gibt keinen Server. Eine Datei liegt dort, wo der Anwender
   sie hinlegt: auf der lokalen Platte, einem USB-Stick oder in
   einem lokal eingebundenen Cloud-Ordner (OneDrive, Dropbox,
   Google Drive, Nextcloud). Fuer die Anwendung ist das alles
   dasselbe - ein Dateihandle.

   Drei Wege, in absteigender Qualitaet:

   1. File System Access API (Chrome, Edge, Opera)
      Echtes Zurueckschreiben in dieselbe Datei. Das Handle wird
      in IndexedDB gemerkt, damit die Datei beim naechsten Start
      mit einem Klick wieder geoeffnet werden kann.

   2. Datei-Auswahldialog zum Lesen + Download zum Schreiben
      (Firefox, Safari). Funktioniert ueberall, der Anwender muss
      die Datei aber selbst ersetzen.

   3. Reiner Download als Notausgang.
   ============================================================= */
window.HZ = window.HZ || {};
HZ.store = (function () {
  'use strict';

  var DB_NAME = 'hz-store';
  var DB_STORE = 'handles';

  function unterstuetzt() {
    return typeof window.showOpenFilePicker === 'function';
  }

  /* ---------- IndexedDB: Dateihandles merken ---------- */
  function db() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        if (!req.result.objectStoreNames.contains(DB_STORE)) {
          req.result.createObjectStore(DB_STORE);
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  async function handleMerken(schluessel, handle) {
    try {
      var d = await db();
      await new Promise(function (resolve, reject) {
        var tx = d.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).put(handle, schluessel);
        tx.oncomplete = resolve;
        tx.onerror = function () { reject(tx.error); };
      });
      d.close();
      return true;
    } catch (e) {
      /* Privater Modus oder blockierte IndexedDB - kein Grund,
         die Anwendung anzuhalten. */
      return false;
    }
  }

  async function handleAbrufen(schluessel) {
    try {
      var d = await db();
      var wert = await new Promise(function (resolve, reject) {
        var tx = d.transaction(DB_STORE, 'readonly');
        var req = tx.objectStore(DB_STORE).get(schluessel);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
      d.close();
      return wert;
    } catch (e) {
      return null;
    }
  }

  async function handleVergessen(schluessel) {
    try {
      var d = await db();
      await new Promise(function (resolve) {
        var tx = d.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).delete(schluessel);
        tx.oncomplete = resolve;
        tx.onerror = resolve;
      });
      d.close();
    } catch (e) { /* egal */ }
  }

  /* Ein gemerktes Handle darf nicht ungefragt gelesen werden -
     der Browser verlangt beim naechsten Start eine Freigabe. */
  async function rechtePruefen(handle, schreiben) {
    if (!handle || !handle.queryPermission) return false;
    var opts = { mode: schreiben ? 'readwrite' : 'read' };
    if ((await handle.queryPermission(opts)) === 'granted') return true;
    return (await handle.requestPermission(opts)) === 'granted';
  }

  /* ---------- Oeffnen ---------- */
  var JSON_TYP = [{
    description: 'HZ-Lizenzdatei',
    accept: { 'application/json': ['.json', '.hzl'] }
  }];

  /* Ergebnis immer: { handle, name, text } - handle kann null sein. */
  async function oeffnen(typen) {
    if (unterstuetzt()) {
      var handles = await window.showOpenFilePicker({
        multiple: false,
        types: typen || JSON_TYP,
        excludeAcceptAllOption: false
      });
      var handle = handles[0];
      var file = await handle.getFile();
      return { handle: handle, name: file.name, text: await file.text() };
    }
    return oeffnenPerInput(typen);
  }

  function oeffnenPerInput(typen) {
    return new Promise(function (resolve, reject) {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,.hzl,application/json';
      input.style.display = 'none';
      document.body.appendChild(input);

      /* Bricht der Anwender den Systemdialog ab, feuert change nie.
         focus auf dem Fenster ist das einzige verlaessliche Signal. */
      var erledigt = false;
      function aufraeumen() { if (input.parentNode) document.body.removeChild(input); }

      input.addEventListener('change', function () {
        erledigt = true;
        var file = input.files && input.files[0];
        aufraeumen();
        if (!file) { reject(abbruch()); return; }
        var reader = new FileReader();
        reader.onload = function () {
          resolve({ handle: null, name: file.name, text: String(reader.result) });
        };
        reader.onerror = function () { reject(new Error('Die Datei konnte nicht gelesen werden.')); };
        reader.readAsText(file);
      });

      window.addEventListener('focus', function pruefen() {
        window.removeEventListener('focus', pruefen);
        setTimeout(function () {
          if (!erledigt) { aufraeumen(); reject(abbruch()); }
        }, 500);
      });

      input.click();
    });
  }

  function abbruch() {
    var e = new Error('Auswahl abgebrochen.');
    e.name = 'AbortError';
    return e;
  }

  function istAbbruch(e) {
    return e && (e.name === 'AbortError' || e.code === 20);
  }

  /* Gemerkte Datei erneut oeffnen, ohne Dateidialog. */
  async function erneutOeffnen(schluessel) {
    var handle = await handleAbrufen(schluessel);
    if (!handle) return null;
    if (!(await rechtePruefen(handle, true))) return null;
    try {
      var file = await handle.getFile();
      return { handle: handle, name: file.name, text: await file.text() };
    } catch (e) {
      /* Datei wurde verschoben oder geloescht. */
      await handleVergessen(schluessel);
      return null;
    }
  }

  async function gemerkterName(schluessel) {
    var handle = await handleAbrufen(schluessel);
    return handle ? handle.name : null;
  }

  /* ---------- Speichern ---------- */
  async function speicherZielWaehlen(vorschlag, typen) {
    if (!unterstuetzt()) return null;
    return window.showSaveFilePicker({
      suggestedName: vorschlag,
      types: typen || JSON_TYP,
      excludeAcceptAllOption: false
    });
  }

  async function schreiben(handle, text) {
    if (!(await rechtePruefen(handle, true))) {
      throw new Error('Der Schreibzugriff auf die Datei wurde nicht erteilt.');
    }
    var w = await handle.createWritable();
    await w.write(text);
    await w.close();
  }

  function herunterladen(text, dateiname) {
    var blob = new Blob([text], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = dateiname;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ---------- Dateinamen ----------
     Umlaute und nicht lateinische Namen bleiben erhalten; entfernt
     werden nur Zeichen, die Dateisysteme wirklich stoeren. Bleibt
     nichts uebrig, greift der Ersatzname. */
  function dateinameAus(text, ersatz, endung) {
    var name = String(text || '')
      .replace(/[\\/:*?"<>|]/g, '')            // von Dateisystemen verbotene Zeichen
      .replace(/[\u0000-\u001f\u007f]/g, '')  // Steuerzeichen
      .replace(/\s+/g, '_')
      .replace(/^[._]+|[._]+$/g, '')
      .slice(0, 80);
    if (!name) name = ersatz || 'lizenz';
    return name + (endung || '.json');
  }

  return {
    unterstuetzt: unterstuetzt,
    oeffnen: oeffnen,
    erneutOeffnen: erneutOeffnen,
    gemerkterName: gemerkterName,
    handleMerken: handleMerken,
    handleAbrufen: handleAbrufen,
    handleVergessen: handleVergessen,
    rechtePruefen: rechtePruefen,
    speicherZielWaehlen: speicherZielWaehlen,
    schreiben: schreiben,
    herunterladen: herunterladen,
    dateinameAus: dateinameAus,
    istAbbruch: istAbbruch
  };
})();
