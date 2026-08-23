/* =============================================================
   HZ · ERP-System — Schale
   -------------------------------------------------------------
   Anmeldung, Sitzung, Navigation, Speichern. Die Fachmodule
   (Zeiterfassung, Hauptbuch) melden sich ueber HZ.app.modul()
   an und wissen nichts von Krypto oder Dateien.

   Ein neues Modul zu ergaenzen heisst: eine Datei anlegen, sich
   registrieren, in build.ps1 eintragen. Sonst nichts.
   ============================================================= */
(function () {
  'use strict';

  var K = HZ.crypto, L = HZ.license, S = HZ.store, U = HZ.ui;
  var $ = U.$;

  var HANDLE_KEY = 'lizenzdatei';
  var AUTOSPEICHERN_MS = 1200;

  var sitzung = null;   // { datei, inhalt, dek, handle, dateiname, verifyKey }
  var offen = null;     // aktuell geoeffnetes Modul
  var schmutzig = false;
  var speicherTimer = null;
  var speichertGerade = false;

  /* =========================================================
     Modulregister
     ========================================================= */
  var register = [];
  HZ.app = HZ.app || {};
  HZ.app.modul = function (def) { register.push(def); };

  function freigeschaltet(def) {
    return !!(sitzung && sitzung.inhalt.module && sitzung.inhalt.module[def.key]);
  }
  function nutzbar(def) { return def.gebaut && freigeschaltet(def); }

  /* Zugriff fuer die Fachmodule. */
  HZ.app.daten = function () {
    if (!sitzung.inhalt.daten) sitzung.inhalt.daten = {};
    return sitzung.inhalt.daten;
  };
  HZ.app.kunde = function () { return sitzung ? sitzung.inhalt.kunde : ''; };
  HZ.app.geaendert = function () { markieren(); };
  HZ.app.jetztSpeichern = function () { return speichern(true); };

  /* =========================================================
     Anmeldung
     ========================================================= */
  var gewaehlt = null;  // { datei, handle, name }

  function anmeldeFehler(text) {
    var el = $('anmelde-fehler');
    el.textContent = text;
    el.classList.remove('versteckt');
  }
  function anmeldeFehlerWeg() { $('anmelde-fehler').classList.add('versteckt'); }

  async function zuletztAnbieten() {
    var name = await S.gemerkterName(HANDLE_KEY);
    var btn = $('btn-zuletzt');
    if (name) {
      btn.textContent = 'Weiter mit ' + name;
      btn.classList.remove('hz-versteckt');
    } else {
      btn.classList.add('hz-versteckt');
    }
  }

  async function dateiWaehlen(vomHandle) {
    anmeldeFehlerWeg();
    try {
      var ergebnis = vomHandle ? await S.erneutOeffnen(HANDLE_KEY) : await S.oeffnen();
      if (!ergebnis) {
        anmeldeFehler('Die zuletzt verwendete Datei ist nicht mehr erreichbar. Bitte neu auswaehlen.');
        await S.handleVergessen(HANDLE_KEY);
        await zuletztAnbieten();
        return;
      }

      var datei;
      try {
        datei = JSON.parse(ergebnis.text);
      } catch (e) {
        anmeldeFehler('Die Datei laesst sich nicht lesen. Ist es wirklich Ihre Lizenzdatei?');
        return;
      }

      if (L.istAltformat(datei)) {
        anmeldeFehler('Diese Lizenzdatei stammt aus einer aelteren Version und wird aus ' +
          'Sicherheitsgruenden nicht mehr angenommen. Bitte fordern Sie eine neue Datei an - ' +
          'Ihre erfassten Daten werden dabei vollstaendig uebernommen.');
        return;
      }
      if (!L.istHZL2(datei)) {
        anmeldeFehler('Das ist keine HZ-Lizenzdatei.');
        return;
      }

      gewaehlt = { datei: datei, handle: ergebnis.handle, name: ergebnis.name };

      $('anmelde-chip').innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
        '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>' +
        '<span>' + U.esc(ergebnis.name) + '</span>';
      $('anmelde-chip').classList.remove('hz-versteckt');
      $('anmelde-passfeld').classList.remove('hz-versteckt');
      $('btn-anmelden').classList.remove('hz-versteckt');
      $('anmelde-pass').focus();
    } catch (e) {
      if (S.istAbbruch(e)) return;
      anmeldeFehler('Die Datei konnte nicht geoeffnet werden: ' + e.message);
    }
  }

  async function anmelden() {
    anmeldeFehlerWeg();
    if (!gewaehlt) { anmeldeFehler('Bitte zuerst eine Lizenzdatei auswaehlen.'); return; }

    var pass = $('anmelde-pass').value;
    if (!pass) { anmeldeFehler('Bitte Passwort eingeben.'); return; }

    if (!HZ.haendlerSchluessel || !HZ.haendlerSchluessel.signatur) {
      anmeldeFehler('In diesem Programm ist kein Haendlerschluessel hinterlegt. ' +
        'Es kann deshalb nicht pruefen, ob eine Lizenz echt ist. Bitte wenden Sie sich an Ihren Anbieter.');
      return;
    }

    var btn = $('btn-anmelden');
    btn.disabled = true;
    btn.textContent = 'Wird geprueft…';

    try {
      var verifyKey = await K.verifyKeyImportieren(HZ.haendlerSchluessel.signatur);
      var auf;
      try {
        auf = await L.oeffnenMitPasswort(gewaehlt.datei, pass, verifyKey);
      } catch (e) {
        anmeldeFehler(e.code === 'passwort' ? 'Falsches Passwort.' : e.message);
        return;
      }

      /* Ohne gueltige Signatur geht es nicht weiter. Genau hier
         scheitert eine von Hand veraenderte Lizenzdatei. */
      if (!auf.signaturOk) {
        anmeldeFehler('Diese Lizenzdatei ist nicht gueltig signiert. Sie wurde entweder ' +
          'veraendert oder stammt nicht von Ihrem Anbieter. Bitte fordern Sie eine neue Datei an.');
        return;
      }

      if (L.abgelaufen(auf.inhalt)) {
        var bis = auf.inhalt.gueltigBis ? ' am ' + U.datumDe(auf.inhalt.gueltigBis) : '';
        anmeldeFehler('Ihr Abo ist' + bis + ' abgelaufen. Bitte kontaktieren Sie uns zur Verlaengerung.');
        return;
      }

      sitzung = {
        datei: gewaehlt.datei,
        inhalt: auf.inhalt,
        dek: auf.dek,
        handle: gewaehlt.handle,
        dateiname: gewaehlt.name,
        verifyKey: verifyKey
      };
      if (gewaehlt.handle) await S.handleMerken(HANDLE_KEY, gewaehlt.handle);

      $('anmelde-pass').value = '';
      starten();
    } finally {
      btn.disabled = false;
      btn.textContent = 'Anmelden';
    }
  }

  /* =========================================================
     Anwendung starten
     ========================================================= */
  function starten() {
    $('ansicht-anmeldung').classList.add('hz-versteckt');
    $('ansicht-app').classList.remove('hz-versteckt');
    $('schreib-banner').classList.toggle('hz-versteckt', !!sitzung.handle);

    var kunde = sitzung.inhalt.kunde || 'Kunde';
    $('nutzer-kuerzel').textContent = kuerzel(kunde);
    $('nutzer-name').textContent = kunde;
    $('willkommen').textContent = 'Willkommen zurueck, ' + kunde;

    laufzeitAnzeigen();
    navZeichnen();
    kachelnZeichnen();
    zurUebersicht();
    speicherstand('gespeichert');
  }

  function kuerzel(name) {
    var teile = String(name).trim().split(/\s+/).filter(Boolean);
    if (teile.length > 1) return (teile[0][0] + teile[1][0]).toUpperCase();
    return String(name).trim().slice(0, 2).toUpperCase();
  }

  function laufzeitAnzeigen() {
    var tage = L.tageBisAblauf(sitzung.inhalt);
    var bis = U.datumDe(sitzung.inhalt.gueltigBis);
    var text = 'Lizenz gueltig bis ' + bis;
    var art = tage <= 14 ? 'gefahr' : (tage <= 30 ? 'warn' : 'info');

    $('nutzer-lizenz').textContent = text + (tage <= 30 ? ' · noch ' + tage + ' Tage' : '');
    $('sl-lizenz').innerHTML =
      '<span class="hz-marke ' + art + '">' + (tage <= 30 ? 'noch ' + tage + ' Tage' : 'aktiv') + '</span>' +
      '<div class="sl-lizenz-text">' + U.esc(text) + '</div>';

    if (tage <= 30) {
      U.toast('Ihre Lizenz laeuft in ' + tage + ' Tagen ab. Bitte rechtzeitig verlaengern.',
        tage <= 14 ? 'fehler' : 'warn', 9000);
    }
  }

  /* =========================================================
     Navigation
     ========================================================= */
  function navZeichnen() {
    var html = '<button type="button" class="sl-eintrag aktiv" data-ziel="uebersicht">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>' +
      '<rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>' +
      '<span>Uebersicht</span></button>';

    html += register.map(function (def) {
      var frei = nutzbar(def);
      return '<button type="button" class="sl-eintrag' + (frei ? '' : ' gesperrt') + '" data-ziel="' +
        U.esc(def.key) + '"' + (frei ? '' : ' aria-disabled="true"') + '>' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        def.icon + '</svg><span>' + U.esc(def.name) + '</span>' +
        (frei ? '' : '<svg class="schloss" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
          '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>') +
        '</button>';
    }).join('');

    $('sl-nav').innerHTML = html;
    Array.prototype.forEach.call($('sl-nav').children, function (b) {
      b.addEventListener('click', function () { navKlick(b.dataset.ziel); });
    });
  }

  function navKlick(ziel) {
    navSchliessen();
    if (ziel === 'uebersicht') { zurUebersicht(); return; }
    var def = register.filter(function (d) { return d.key === ziel; })[0];
    if (!def) return;
    if (!nutzbar(def)) { gesperrtErklaeren(def); return; }
    modulOeffnen(def);
  }

  function navMarkieren(ziel) {
    Array.prototype.forEach.call($('sl-nav').children, function (b) {
      b.classList.toggle('aktiv', b.dataset.ziel === ziel);
    });
  }

  function zurUebersicht() {
    offen = null;
    $('ansicht-uebersicht').classList.remove('hz-versteckt');
    $('ansicht-modul').classList.add('hz-versteckt');
    $('ansicht-modul').innerHTML = '';
    $('pfad').textContent = 'Uebersicht';
    navMarkieren('uebersicht');
    kachelnZeichnen();
  }

  function modulOeffnen(def) {
    offen = def;
    $('ansicht-uebersicht').classList.add('hz-versteckt');
    $('ansicht-modul').classList.remove('hz-versteckt');
    $('pfad').textContent = def.name;
    navMarkieren(def.key);
    $('ansicht-modul').innerHTML = '';
    def.oeffnen($('ansicht-modul'));
    $('inhalt').scrollTop = 0;
  }

  function gesperrtErklaeren(def) {
    if (!def.gebaut) {
      U.hinweis('Das Modul "' + def.name + '" befindet sich noch in Entwicklung und kommt ' +
        'mit einer der naechsten Versionen.', 'Bald verfuegbar');
    } else {
      U.dialog({
        titel: 'Modul nicht freigeschaltet',
        html: '<p>Das Modul <b>' + U.esc(def.name) + '</b> ist fuer Ihre Lizenz nicht freigeschaltet.</p>' +
          '<p>Wir koennen es jederzeit nachtraeglich aktivieren - Ihre bereits erfassten ' +
          'Daten bleiben dabei vollstaendig erhalten.</p>',
        knoepfe: [
          { text: 'Schliessen', wert: false, stil: 'sekundaer' },
          { text: 'Per WhatsApp anfragen', wert: true, stil: 'primaer' }
        ]
      }).then(function (w) {
        if (w) window.open('https://wa.me/49XXXXXXXXXX', '_blank', 'noopener');
      });
    }
  }

  /* =========================================================
     Kacheln
     ========================================================= */
  function kachelnZeichnen() {
    $('kachel-gitter').innerHTML = register.map(function (def) {
      var frei = nutzbar(def);
      var text = frei
        ? (def.kachelText ? def.kachelText() : '')
        : (!def.gebaut ? 'Kommt mit der naechsten Version' : 'Nicht freigeschaltet');
      var marke = !def.gebaut
        ? '<span class="hz-marke">Bald verfuegbar</span>'
        : (!frei ? '<span class="hz-marke warn">Nicht freigeschaltet</span>' : '');

      return '<button type="button" class="kachel' + (frei ? '' : ' gesperrt') + '" data-ziel="' + U.esc(def.key) + '">' +
        marke +
        '<span class="kachel-symbol"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + def.icon + '</svg></span>' +
        '<span class="kachel-name">' + U.esc(def.name) + '</span>' +
        '<span class="kachel-text">' + text + '</span>' +
        '</button>';
    }).join('');

    Array.prototype.forEach.call($('kachel-gitter').children, function (b) {
      b.addEventListener('click', function () { navKlick(b.dataset.ziel); });
    });
  }

  /* =========================================================
     Speichern
     ========================================================= */
  function speicherstand(zustand, zusatz) {
    var el = $('speicherstand');
    el.dataset.zustand = zustand;
    var text = el.querySelector('.text');
    if (zustand === 'gespeichert') text.textContent = zusatz ? 'Gespeichert ' + zusatz : 'Gespeichert';
    else if (zustand === 'offen') text.textContent = 'Nicht gespeichert';
    else if (zustand === 'laeuft') text.textContent = 'Speichert…';
    else if (zustand === 'fehler') text.textContent = 'Nicht gespeichert';
  }

  function markieren() {
    schmutzig = true;
    speicherstand('offen');
    if (speicherTimer) clearTimeout(speicherTimer);
    speicherTimer = setTimeout(function () { speichern(false); }, AUTOSPEICHERN_MS);
  }

  async function speichern(manuell) {
    if (!sitzung) return false;
    if (speichertGerade) return false;
    if (!schmutzig && !manuell) return true;

    if (speicherTimer) { clearTimeout(speicherTimer); speicherTimer = null; }
    speichertGerade = true;
    speicherstand('laeuft');

    try {
      await L.inhaltSchreiben(sitzung.datei, sitzung.dek, sitzung.inhalt);
      var text = JSON.stringify(sitzung.datei, null, 2);

      if (sitzung.handle) {
        await S.schreiben(sitzung.handle, text);
        schmutzig = false;
        speicherstand('gespeichert', U.uhrzeit());
        if (manuell) U.toast('In ' + sitzung.dateiname + ' gespeichert.', 'erfolg');
        return true;
      }

      /* Ohne Schreibzugriff: nur auf ausdrueckliche Anweisung
         herunterladen, sonst wuerde bei jeder Eingabe eine Datei
         im Download-Ordner landen. */
      if (manuell) {
        S.herunterladen(text, S.dateinameAus(sitzung.inhalt.kunde, 'lizenz'));
        schmutzig = false;
        speicherstand('gespeichert', U.uhrzeit());
        U.toast('Aktualisierte Datei heruntergeladen. Bitte ersetzen Sie damit Ihre bisherige.', 'erfolg', 6000);
        return true;
      }
      speicherstand('offen');
      return false;
    } catch (e) {
      speicherstand('fehler');
      U.toast('Speichern fehlgeschlagen: ' + e.message, 'fehler');
      return false;
    } finally {
      speichertGerade = false;
    }
  }

  async function sicherungHerunterladen() {
    menueZu();
    await L.inhaltSchreiben(sitzung.datei, sitzung.dek, sitzung.inhalt);
    var name = S.dateinameAus(sitzung.inhalt.kunde, 'lizenz', '') + '_' + U.isoTag() + '.json';
    S.herunterladen(JSON.stringify(sitzung.datei, null, 2), name);
    U.toast('Sicherungskopie ' + name + ' erstellt.', 'erfolg');
  }

  /* =========================================================
     Passwort aendern
     ========================================================= */
  async function passwortAendern() {
    menueZu();
    var p = U.dialog({
      titel: 'Passwort aendern',
      html:
        '<p>Das neue Passwort gilt sofort fuer Ihre Lizenzdatei. Ihre erfassten Daten ' +
        'bleiben unveraendert.</p>' +
        '<div class="hz-feld"><label for="pw1">Neues Passwort</label>' +
        '<input type="password" id="pw1" autocomplete="new-password"></div>' +
        '<div class="hz-staerke" id="pw-staerke" data-stufe="leer">' +
        '<div class="hz-staerke-balken"><i></i></div><span class="text">Kein Passwort</span></div>' +
        '<div class="hz-feld" style="margin-top:14px;"><label for="pw2">Neues Passwort wiederholen</label>' +
        '<input type="password" id="pw2" autocomplete="new-password"></div>',
      knoepfe: [
        { text: 'Abbrechen', wert: null, stil: 'sekundaer' },
        { text: 'Aendern und speichern', wert: 'ok', stil: 'primaer' }
      ]
    });

    setTimeout(function () {
      var e1 = $('pw1');
      if (!e1) return;
      e1.addEventListener('input', function () {
        var st = K.passwortStaerke(e1.value);
        var el = $('pw-staerke');
        if (!el) return;
        el.dataset.stufe = st.stufe;
        el.querySelector('.text').textContent = e1.value ? st.text + ' · ' + st.bits + ' Bit' : 'Kein Passwort';
      });
    }, 0);

    var p1 = '', p2 = '';
    p.then(function () {
      var a = $('pw1'), b = $('pw2');
      p1 = a ? a.value : '';
      p2 = b ? b.value : '';
    });

    if ((await p) !== 'ok') return;

    if (!p1 || p1.length < 10) { U.toast('Das Passwort braucht mindestens 10 Zeichen.', 'fehler'); return; }
    if (p1 !== p2) { U.toast('Die Passwoerter stimmen nicht ueberein.', 'fehler'); return; }

    try {
      await L.passwortSetzen(sitzung.datei, sitzung.dek, p1);
      schmutzig = true;
      var ok = await speichern(true);
      U.toast(ok ? 'Passwort geaendert und gespeichert.'
                 : 'Passwort geaendert - bitte die Datei noch speichern.', ok ? 'erfolg' : 'warn');
    } catch (e) {
      U.toast('Passwortwechsel fehlgeschlagen: ' + e.message, 'fehler');
    }
  }

  /* =========================================================
     Abmelden
     ========================================================= */
  async function abmelden() {
    menueZu();
    if (schmutzig) {
      var w = await U.dialog({
        titel: 'Nicht gespeicherte Aenderungen',
        text: 'Es gibt Aenderungen, die noch nicht in der Datei stehen.',
        knoepfe: [
          { text: 'Abbrechen', wert: 'abbruch', stil: 'sekundaer' },
          { text: 'Verwerfen', wert: 'verwerfen', stil: 'gefahr' },
          { text: 'Speichern und abmelden', wert: 'speichern', stil: 'primaer' }
        ]
      });
      if (w === 'abbruch' || w === null) return;
      if (w === 'speichern' && !(await speichern(true))) return;
    }

    sitzung = null; offen = null; schmutzig = false; gewaehlt = null;
    if (speicherTimer) { clearTimeout(speicherTimer); speicherTimer = null; }

    $('ansicht-app').classList.add('hz-versteckt');
    $('ansicht-anmeldung').classList.remove('hz-versteckt');
    $('anmelde-chip').classList.add('hz-versteckt');
    $('anmelde-passfeld').classList.add('hz-versteckt');
    $('btn-anmelden').classList.add('hz-versteckt');
    $('anmelde-pass').value = '';
    anmeldeFehlerWeg();
    zuletztAnbieten();
  }

  /* =========================================================
     Menue und Navigation (klein)
     ========================================================= */
  function menueAuf() {
    $('nutzer-menue').classList.add('offen');
    $('btn-nutzer').setAttribute('aria-expanded', 'true');
  }
  function menueZu() {
    $('nutzer-menue').classList.remove('offen');
    $('btn-nutzer').setAttribute('aria-expanded', 'false');
  }
  function navAuf() {
    $('seitenleiste').classList.add('offen');
    $('seitenleiste-schleier').classList.add('offen');
  }
  function navSchliessen() {
    $('seitenleiste').classList.remove('offen');
    $('seitenleiste-schleier').classList.remove('offen');
  }

  /* =========================================================
     Start
     ========================================================= */
  function start() {
    if (!K.verfuegbar()) {
      document.body.innerHTML =
        '<div class="hz-karte" style="max-width:520px;margin:60px auto;">' +
        '<h3>Verschluesselung nicht verfuegbar</h3>' +
        '<p>Dieser Seite fehlt <span class="hz-mono">crypto.subtle</span>. Bitte oeffnen Sie ' +
        'die Datei direkt im Browser oder ueber eine https-Adresse.</p></div>';
      return;
    }

    zuletztAnbieten();

    $('btn-datei-waehlen').addEventListener('click', function () { dateiWaehlen(false); });
    $('btn-zuletzt').addEventListener('click', function () { dateiWaehlen(true); });
    $('btn-anmelden').addEventListener('click', anmelden);
    $('anmelde-pass').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); anmelden(); }
    });
    $('btn-pass-zeigen').addEventListener('click', function () {
      var f = $('anmelde-pass');
      var zeigen = f.type === 'password';
      f.type = zeigen ? 'text' : 'password';
      this.textContent = zeigen ? 'verbergen' : 'anzeigen';
    });
    $('btn-theme-anmeldung').addEventListener('click', function () { U.themeUmschalten(); });
    $('btn-theme').addEventListener('click', function () { U.themeUmschalten(); });

    $('btn-nutzer').addEventListener('click', function (e) {
      e.stopPropagation();
      $('nutzer-menue').classList.contains('offen') ? menueZu() : menueAuf();
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.nutzer-wrap')) menueZu();
    });

    $('btn-speichern').addEventListener('click', function () { menueZu(); speichern(true); });
    $('btn-passwort').addEventListener('click', passwortAendern);
    $('btn-kopie').addEventListener('click', sicherungHerunterladen);
    $('btn-abmelden').addEventListener('click', abmelden);

    $('btn-nav-auf').addEventListener('click', navAuf);
    $('btn-nav-zu').addEventListener('click', navSchliessen);
    $('seitenleiste-schleier').addEventListener('click', navSchliessen);

    /* Strg+S ist die Geste, die jeder kennt. */
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        if (!sitzung) return;
        e.preventDefault();
        speichern(true);
      }
    });

    /* Letzte Rettung: der Browser fragt nach, wenn ungespeicherte
       Aenderungen offen sind. */
    window.addEventListener('beforeunload', function (e) {
      if (!schmutzig) return;
      e.preventDefault();
      e.returnValue = '';
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
