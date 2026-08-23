/* =============================================================
   HZ · Lizenz-Generator (intern)
   -------------------------------------------------------------
   Diese Datei enthaelt bewusst KEIN Geheimnis. Der private
   Signaturschluessel kommt aus einer separaten Datei, die nur der
   Haendler besitzt. Ohne sie kann dieses Programm keine gueltige
   Lizenz erzeugen - deshalb ist es unbedenklich, wenn es
   oeffentlich erreichbar ist.
   ============================================================= */
(function () {
  'use strict';

  var K = HZ.crypto, L = HZ.license, S = HZ.store, U = HZ.ui, KS = HZ.keystore;
  var $ = U.$;

  var MODULE = [
    { key: 'zeiterfassung', name: 'Zeiterfassung', fertig: true },
    { key: 'hauptbuch', name: 'Hauptbuch', fertig: true },
    { key: 'lager', name: 'Lagerverwaltung', fertig: false },
    { key: 'lohn', name: 'Lohnabrechnung', fertig: false },
    { key: 'crm', name: 'CRM', fertig: false }
  ];

  /* Nur im Speicher, nie in localStorage - beim Neuladen ist der
     Schluessel wieder gesperrt. */
  var schluessel = null;      // { privat, oeffentlich, signKey }
  var keystoreDatei = null;
  var keystoreHandle = null;

  var neuErgebnis = null;     // { datei, dateiname, passwort }
  var beaZustand = null;      // { datei, inhalt, dek, handle, dateiname }
  var altZustand = null;      // { alt, dateiname }

  /* =========================================================
     Schluesselverwaltung
     ========================================================= */
  async function fingerabdruck(jwk) {
    var roh = new TextEncoder().encode(K.canonical(jwk));
    var hash = await crypto.subtle.digest('SHA-256', roh);
    var hex = Array.from(new Uint8Array(hash)).slice(0, 8)
      .map(function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    return hex.toUpperCase().replace(/(.{4})/g, '$1 ').trim();
  }

  async function schluesselAnzeigen() {
    var offen = !!schluessel;
    $('schluessel-karte').classList.toggle('offen', offen);
    $('schluessel-aktionen').classList.toggle('hz-versteckt', offen);
    $('schluessel-aktionen-offen').classList.toggle('hz-versteckt', !offen);

    if (offen) {
      $('schluessel-titel').textContent = 'Haendlerschluessel entsperrt';
      $('schluessel-text').innerHTML =
        'Fingerabdruck <span class="hz-mono">' + U.esc(await fingerabdruck(schluessel.oeffentlich.signatur)) + '</span>' +
        ' &middot; Dieser Wert muss zu dem im ERP hinterlegten Schluessel passen.';
    } else {
      $('schluessel-titel').textContent = 'Haendlerschluessel nicht geladen';
      $('schluessel-text').textContent =
        'Ohne Ihren privaten Schluessel koennen keine gueltigen Lizenzen ausgestellt werden.';
      var name = await S.gemerkterName(KS.handleKey());
      var btn = $('btn-schluessel-zuletzt');
      btn.classList.toggle('hz-versteckt', !name);
      if (name) btn.textContent = 'Zuletzt verwendet: ' + name;
    }
    aktionenFreigeben();
  }

  function aktionenFreigeben() {
    var offen = !!schluessel;
    ['btn-neu-erstellen', 'btn-bea-oeffnen', 'btn-alt-oeffnen', 'btn-alt-erstellen', 'btn-bea-speichern']
      .forEach(function (id) { if ($(id)) $(id).disabled = !offen; });
  }

  async function hauptpasswortAbfragen(titel, text, zweifach) {
    var html =
      '<p>' + U.esc(text) + '</p>' +
      '<div class="hz-feld"><label for="dlg-mp1">Hauptpasswort</label>' +
      '<input type="password" id="dlg-mp1" autocomplete="current-password"></div>' +
      (zweifach
        ? '<div class="hz-feld"><label for="dlg-mp2">Hauptpasswort wiederholen</label>' +
          '<input type="password" id="dlg-mp2" autocomplete="new-password"></div>' +
          '<div class="hz-staerke" id="dlg-mp-staerke" data-stufe="leer">' +
          '<div class="hz-staerke-balken"><i></i></div><span class="text">Kein Passwort</span></div>'
        : '');

    var p = U.dialog({
      titel: titel, html: html,
      knoepfe: [
        { text: 'Abbrechen', wert: null, stil: 'sekundaer' },
        { text: 'Weiter', wert: 'ok', stil: 'primaer' }
      ]
    });

    if (zweifach) {
      setTimeout(function () {
        var e1 = $('dlg-mp1');
        if (e1) e1.addEventListener('input', function () { staerkeMalen('dlg-mp-staerke', e1.value); });
      }, 0);
    }
    /* Enter im Feld soll bestaetigen, nicht das Formular abschicken. */
    setTimeout(function () {
      var felder = document.querySelectorAll('#dlg-mp1, #dlg-mp2');
      Array.prototype.forEach.call(felder, function (f) {
        f.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            var ok = document.querySelector('.hz-dialog-overlay.offen .hz-btn.primaer');
            if (ok) ok.click();
          }
        });
      });
    }, 0);

    /* Die Felder muessen ausgelesen werden, solange der Dialog noch
       im DOM haengt - HZ.ui.dialog raeumt ihn erst nach dem Aufloesen
       der Zusage ab. */
    var p1 = '', p2 = '';
    p.then(function () {
      var a = $('dlg-mp1'), b = $('dlg-mp2');
      p1 = a ? a.value : '';
      p2 = b ? b.value : '';
    });

    var wert = await p;
    if (wert !== 'ok') return null;
    if (zweifach) {
      if (!p1 || p1.length < 10) { U.toast('Das Hauptpasswort braucht mindestens 10 Zeichen.', 'fehler'); return null; }
      if (p1 !== p2) { U.toast('Die Passwoerter stimmen nicht ueberein.', 'fehler'); return null; }
    } else if (!p1) { return null; }
    return p1;
  }

  async function schluesselOeffnen(vomHandle) {
    try {
      var ergebnis;
      if (vomHandle) {
        ergebnis = await S.erneutOeffnen(KS.handleKey());
        if (!ergebnis) { U.toast('Die zuletzt verwendete Schluesseldatei ist nicht mehr erreichbar.', 'warn'); return; }
      } else {
        ergebnis = await S.oeffnen();
      }

      var datei = JSON.parse(ergebnis.text);
      if (!KS.istKeystore(datei)) {
        U.toast('Das ist keine HZ-Schluesseldatei.', 'fehler');
        return;
      }

      var mp = await hauptpasswortAbfragen('Schluesseldatei entsperren',
        'Datei: ' + ergebnis.name, false);
      if (mp === null) return;

      try {
        schluessel = await KS.oeffnen(datei, mp);
      } catch (e) {
        U.toast(e.code === 'passwort' ? 'Falsches Hauptpasswort.' : e.message, 'fehler');
        return;
      }

      keystoreDatei = datei;
      keystoreHandle = ergebnis.handle;
      if (ergebnis.handle) await S.handleMerken(KS.handleKey(), ergebnis.handle);

      await schluesselAnzeigen();
      U.toast('Haendlerschluessel entsperrt.', 'erfolg');
    } catch (e) {
      if (!S.istAbbruch(e)) U.toast('Die Datei konnte nicht gelesen werden: ' + e.message, 'fehler');
    }
  }

  async function schluesselNeu() {
    var bestaetigt = await U.bestaetigen(
      'Sie erzeugen ein neues Schluesselpaar. Lizenzen, die mit einem frueheren ' +
      'Schluessel ausgestellt wurden, werden vom ERP-System danach nicht mehr ' +
      'anerkannt, solange dort der alte oeffentliche Schluessel hinterlegt ist. ' +
      'Beim allerersten Einrichten ist das unproblematisch.',
      'Neues Schluesselpaar einrichten', 'Ja, Schluesselpaar erzeugen');
    if (!bestaetigt) return;

    var mp = await hauptpasswortAbfragen('Hauptpasswort vergeben',
      'Mit diesem Passwort wird Ihre Schluesseldatei verschluesselt. Es gibt keinen ' +
      'Wiederherstellungsweg - ohne dieses Passwort ist der Schluessel verloren.', true);
    if (mp === null) return;

    var erzeugt = await KS.erzeugen(mp);
    schluessel = await KS.oeffnen(erzeugt.datei, mp);
    keystoreDatei = erzeugt.datei;

    var text = JSON.stringify(erzeugt.datei, null, 2);
    var gespeichert = false;
    if (S.unterstuetzt()) {
      try {
        var handle = await S.speicherZielWaehlen('hz-haendler-schluessel.json');
        await S.schreiben(handle, text);
        keystoreHandle = handle;
        await S.handleMerken(KS.handleKey(), handle);
        gespeichert = true;
      } catch (e) {
        if (!S.istAbbruch(e)) U.toast('Speichern fehlgeschlagen: ' + e.message, 'fehler');
      }
    }
    if (!gespeichert) S.herunterladen(text, 'hz-haendler-schluessel.json');

    await schluesselAnzeigen();
    await oeffentlichenSchluesselExportieren(true);

    U.dialog({
      titel: 'Schluesselpaar eingerichtet',
      html:
        '<p><b>hz-haendler-schluessel.json</b> ist Ihr privater Schluessel. ' +
        'Legen Sie ihn in einen lokalen Ordner oder einen lokal eingebundenen ' +
        'Cloud-Ordner, sichern Sie ihn - und geben Sie ihn niemals weiter.</p>' +
        '<p><b>vendor-key.js</b> enthaelt nur den oeffentlichen Anteil. Diese Datei ' +
        'ersetzt <span class="hz-mono">src/vendor-key.js</span> im Projekt. Danach ' +
        '<span class="hz-mono">build.ps1</span> ausfuehren, damit das ausgelieferte ' +
        'ERP-System Ihre Lizenzen anerkennt.</p>',
      knoepfe: [{ text: 'Verstanden', wert: true, stil: 'primaer' }]
    });
  }

  async function oeffentlichenSchluesselExportieren(still) {
    if (!schluessel) return;
    var inhalt = KS.oeffentlichenSchluesselAlsJs(schluessel.oeffentlich);
    var gespeichert = false;
    if (S.unterstuetzt()) {
      try {
        var handle = await S.speicherZielWaehlen('vendor-key.js', [{
          description: 'JavaScript', accept: { 'text/javascript': ['.js'] }
        }]);
        await S.schreiben(handle, inhalt);
        gespeichert = true;
      } catch (e) {
        if (!S.istAbbruch(e)) { /* faellt unten auf Download zurueck */ }
      }
    }
    if (!gespeichert) {
      var blob = new Blob([inhalt], { type: 'text/javascript' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = 'vendor-key.js';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }
    if (!still) U.toast('vendor-key.js erzeugt.', 'erfolg');
  }

  function schluesselSperren() {
    schluessel = null;
    beaZustand = null;
    schluesselAnzeigen();
    U.toast('Schluessel gesperrt.', 'info');
  }

  /* =========================================================
     Gemeinsame Bausteine
     ========================================================= */
  function moduleZeichnen(behaelterId, praefix, vorbelegung) {
    $(behaelterId).innerHTML = MODULE.map(function (m) {
      var an = vorbelegung ? !!vorbelegung[m.key] : (m.key === 'zeiterfassung');
      return '<label class="modul-zeile">' +
        '<input type="checkbox" id="' + praefix + m.key + '"' + (an ? ' checked' : '') + '>' +
        '<span class="modul-name">' + U.esc(m.name) + '</span>' +
        '<span class="hz-marke' + (m.fertig ? ' erfolg' : '') + '">' +
        (m.fertig ? 'nutzbar' : 'in Entwicklung') + '</span>' +
        '</label>';
    }).join('');
  }

  function moduleLesen(praefix) {
    var out = {};
    MODULE.forEach(function (m) {
      var el = $(praefix + m.key);
      out[m.key] = !!(el && el.checked);
    });
    return out;
  }

  function staerkeMalen(id, pw) {
    var el = $(id);
    if (!el) return;
    var st = K.passwortStaerke(pw);
    el.dataset.stufe = st.stufe;
    el.querySelector('.text').textContent = pw ? st.text + ' · ' + st.bits + ' Bit' : 'Kein Passwort';
  }

  function fehlerZeigen(id, text) {
    var el = $(id);
    el.textContent = text;
    el.classList.remove('versteckt');
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function fehlerWeg(id) { $(id).classList.add('versteckt'); }

  function reiterWechseln(name) {
    Array.prototype.forEach.call($('gen-reiter').children, function (b) {
      b.classList.toggle('aktiv', b.dataset.reiter === name);
    });
    ['neu', 'bearbeiten', 'altformat'].forEach(function (r) {
      $('reiter-' + r).classList.toggle('hz-versteckt', r !== name);
    });
  }

  async function dateiSpeichern(text, dateiname, handle) {
    if (handle) {
      try {
        await S.schreiben(handle, text);
        U.toast('In ' + handle.name + ' gespeichert.', 'erfolg');
        return;
      } catch (e) {
        U.toast('Direktes Speichern fehlgeschlagen: ' + e.message, 'warn');
      }
    }
    if (S.unterstuetzt()) {
      try {
        var ziel = await S.speicherZielWaehlen(dateiname);
        await S.schreiben(ziel, text);
        U.toast('Gespeichert unter ' + ziel.name + '.', 'erfolg');
        return;
      } catch (e) {
        if (S.istAbbruch(e)) return;
      }
    }
    S.herunterladen(text, dateiname);
    U.toast('Datei heruntergeladen.', 'erfolg');
  }

  /* =========================================================
     Neue Lizenz
     ========================================================= */
  async function neueLizenzErstellen() {
    fehlerWeg('neu-fehler');
    if (!schluessel) { fehlerZeigen('neu-fehler', 'Bitte zuerst den Haendlerschluessel entsperren.'); return; }

    var kunde = $('neu-kunde').value.trim();
    var pass = $('neu-pass').value;
    var gueltig = $('neu-gueltig').value;

    if (!kunde) { fehlerZeigen('neu-fehler', 'Bitte einen Kundennamen eingeben.'); return; }
    if (!pass || pass.length < 10) {
      fehlerZeigen('neu-fehler', 'Das Kundenpasswort braucht mindestens 10 Zeichen. Am besten erzeugen lassen.');
      return;
    }
    if (!gueltig) { fehlerZeigen('neu-fehler', 'Bitte ein Ablaufdatum waehlen.'); return; }

    var module = moduleLesen('neu-mod-');
    if (!Object.keys(module).some(function (k) { return module[k]; })) {
      fehlerZeigen('neu-fehler', 'Bitte mindestens ein Modul freischalten.');
      return;
    }

    var btn = $('btn-neu-erstellen');
    btn.disabled = true;
    btn.textContent = 'Wird verschluesselt…';
    try {
      var inhalt = {
        lizenzId: K.uuid(),
        kunde: kunde,
        ausgestelltAm: new Date().toISOString(),
        gueltigBis: gueltig,
        module: module,
        daten: { zeiterfassung: {} }
      };
      var versiegelt = await L.versiegeln(inhalt, {
        passwort: pass,
        signKey: schluessel.signKey,
        haendlerPubJwk: schluessel.oeffentlich.transport
      });

      neuErgebnis = {
        text: JSON.stringify(versiegelt.datei, null, 2),
        dateiname: S.dateinameAus(kunde, 'lizenz'),
        passwort: pass
      };

      $('neu-res-datei').textContent = neuErgebnis.dateiname;
      $('neu-res-pass').textContent = pass;
      $('neu-res-id').textContent = inhalt.lizenzId;
      $('neu-res-gueltig').textContent = U.datumDe(gueltig);
      $('neu-ergebnis').classList.remove('hz-versteckt');
      $('neu-ergebnis').scrollIntoView({ behavior: 'smooth', block: 'start' });
      U.toast('Lizenz erstellt und signiert.', 'erfolg');
    } catch (e) {
      fehlerZeigen('neu-fehler', 'Fehler beim Erstellen: ' + e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Lizenzdatei erstellen';
      aktionenFreigeben();
    }
  }

  /* =========================================================
     Verlaengern
     ========================================================= */
  async function lizenzOeffnen() {
    fehlerWeg('bea-fehler');
    if (!schluessel) { fehlerZeigen('bea-fehler', 'Bitte zuerst den Haendlerschluessel entsperren.'); return; }

    try {
      var ergebnis = await S.oeffnen();
      var datei = JSON.parse(ergebnis.text);

      if (L.istAltformat(datei)) {
        fehlerZeigen('bea-fehler',
          'Diese Datei stammt aus der alten Version. Bitte den Reiter "Altformat uebernehmen" benutzen.');
        return;
      }
      if (!L.istHZL2(datei)) { fehlerZeigen('bea-fehler', 'Das ist keine HZ-Lizenzdatei.'); return; }

      var verifyKey = await K.verifyKeyImportieren(schluessel.oeffentlich.signatur);
      var auf = await L.oeffnenAlsHaendler(datei, schluessel.privat.transport, verifyKey);

      beaZustand = {
        datei: datei, inhalt: auf.inhalt, dek: auf.dek,
        handle: ergebnis.handle, dateiname: ergebnis.name
      };

      $('bea-chip').innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
        '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>' +
        '<span>' + U.esc(ergebnis.name) + '</span>';
      $('bea-chip').classList.remove('hz-versteckt');

      $('bea-kunde').value = auf.inhalt.kunde || '';
      $('bea-gueltig').value = auf.inhalt.gueltigBis || '';
      $('bea-pass').value = '';
      moduleZeichnen('bea-module', 'bea-mod-', auf.inhalt.module);
      $('bea-formular').classList.remove('hz-versteckt');
      $('bea-ergebnis').classList.add('hz-versteckt');

      if (!auf.signaturOk) {
        fehlerZeigen('bea-fehler',
          'Achtung: Die Signatur dieser Datei ist ungueltig. Der Inhalt wurde nach dem ' +
          'Ausstellen veraendert. Pruefen Sie Laufzeit und Module besonders sorgfaeltig.');
      } else {
        U.toast('Lizenz geoeffnet, Signatur gueltig.', 'erfolg');
      }
    } catch (e) {
      if (S.istAbbruch(e)) return;
      fehlerZeigen('bea-fehler', e.message);
    }
  }

  async function lizenzNeuAusstellen() {
    fehlerWeg('bea-fehler');
    if (!schluessel || !beaZustand) { fehlerZeigen('bea-fehler', 'Bitte zuerst eine Lizenzdatei oeffnen.'); return; }

    var kunde = $('bea-kunde').value.trim();
    var gueltig = $('bea-gueltig').value;
    var neuesPass = $('bea-pass').value;

    if (!kunde) { fehlerZeigen('bea-fehler', 'Bitte einen Kundennamen eingeben.'); return; }
    if (!gueltig) { fehlerZeigen('bea-fehler', 'Bitte ein Ablaufdatum waehlen.'); return; }
    if (neuesPass && neuesPass.length < 10) {
      fehlerZeigen('bea-fehler', 'Das neue Passwort braucht mindestens 10 Zeichen.');
      return;
    }

    try {
      var inhalt = beaZustand.inhalt;
      inhalt.kunde = kunde;
      inhalt.gueltigBis = gueltig;
      inhalt.module = moduleLesen('bea-mod-');
      await L.neuSignieren(inhalt, schluessel.signKey);

      var datei = beaZustand.datei;
      if (neuesPass) await L.passwortSetzen(datei, beaZustand.dek, neuesPass);
      await L.inhaltSchreiben(datei, beaZustand.dek, inhalt);

      beaZustand.text = JSON.stringify(datei, null, 2);
      beaZustand.neuerName = S.dateinameAus(kunde, 'lizenz');

      $('bea-res-datei').textContent = beaZustand.neuerName;
      $('bea-res-gueltig').textContent = U.datumDe(gueltig);
      $('bea-res-pass-zeile').classList.toggle('hz-versteckt', !neuesPass);
      if (neuesPass) $('bea-res-pass').textContent = neuesPass;
      $('bea-ergebnis').classList.remove('hz-versteckt');
      $('bea-ergebnis').scrollIntoView({ behavior: 'smooth', block: 'start' });
      U.toast('Lizenz neu ausgestellt und signiert.', 'erfolg');
    } catch (e) {
      fehlerZeigen('bea-fehler', 'Fehler: ' + e.message);
    }
  }

  /* =========================================================
     Altformat uebernehmen
     ========================================================= */
  async function altformatOeffnen() {
    fehlerWeg('alt-fehler');
    if (!schluessel) { fehlerZeigen('alt-fehler', 'Bitte zuerst den Haendlerschluessel entsperren.'); return; }

    try {
      var ergebnis = await S.oeffnen();
      var alt = JSON.parse(ergebnis.text);

      if (L.istHZL2(alt)) {
        fehlerZeigen('alt-fehler',
          'Diese Datei ist bereits im neuen Format. Bitte den Reiter "Lizenz verlaengern" benutzen.');
        return;
      }
      if (!L.istAltformat(alt)) { fehlerZeigen('alt-fehler', 'Das ist keine Lizenzdatei der alten Version.'); return; }

      altZustand = { alt: alt, dateiname: ergebnis.name };

      $('alt-chip').innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
        '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>' +
        '<span>' + U.esc(ergebnis.name) + '</span>';
      $('alt-chip').classList.remove('hz-versteckt');

      $('alt-kunde').value = alt.kunde || '';
      $('alt-gueltig').value = alt.gueltigBis || U.isoTagPlus(365);
      $('alt-pass').value = K.passwortErzeugen(14);
      moduleZeichnen('alt-module', 'alt-mod-', alt.module);

      var daten = alt.daten || {};
      var tage = Object.keys(daten.zeiterfassung || {}).length;
      var buchungen = (daten.hauptbuch && daten.hauptbuch.buchungen) ? daten.hauptbuch.buchungen.length : 0;
      var konten = (daten.hauptbuch && daten.hauptbuch.konten) ? daten.hauptbuch.konten.length : 0;
      $('alt-daten-uebersicht').innerHTML =
        '<div class="hz-ergebnis"><div><div class="marke-klein">Zeiterfassung</div>' +
        '<div class="wert">' + tage + ' erfasste Tage</div></div></div>' +
        '<div class="hz-ergebnis"><div><div class="marke-klein">Hauptbuch</div>' +
        '<div class="wert">' + buchungen + ' Buchungen auf ' + konten + ' Konten</div></div></div>';

      $('alt-formular').classList.remove('hz-versteckt');
      $('alt-ergebnis').classList.add('hz-versteckt');
      U.toast('Alte Lizenz eingelesen.', 'erfolg');
    } catch (e) {
      if (S.istAbbruch(e)) return;
      fehlerZeigen('alt-fehler', 'Die Datei konnte nicht gelesen werden: ' + e.message);
    }
  }

  async function altformatAusstellen() {
    fehlerWeg('alt-fehler');
    if (!schluessel || !altZustand) { fehlerZeigen('alt-fehler', 'Bitte zuerst eine alte Lizenzdatei einlesen.'); return; }

    var kunde = $('alt-kunde').value.trim();
    var gueltig = $('alt-gueltig').value;
    var pass = $('alt-pass').value;

    if (!kunde) { fehlerZeigen('alt-fehler', 'Bitte einen Kundennamen eingeben.'); return; }
    if (!gueltig) { fehlerZeigen('alt-fehler', 'Bitte ein Ablaufdatum waehlen.'); return; }
    if (!pass || pass.length < 10) { fehlerZeigen('alt-fehler', 'Das Passwort braucht mindestens 10 Zeichen.'); return; }

    try {
      var inhalt = {
        lizenzId: altZustand.alt.lizenzId || K.uuid(),
        kunde: kunde,
        ausgestelltAm: altZustand.alt.erstelltAm || new Date().toISOString(),
        uebernommenAm: new Date().toISOString(),
        gueltigBis: gueltig,
        module: moduleLesen('alt-mod-'),
        daten: altZustand.alt.daten || { zeiterfassung: {} }
      };
      var versiegelt = await L.versiegeln(inhalt, {
        passwort: pass,
        signKey: schluessel.signKey,
        haendlerPubJwk: schluessel.oeffentlich.transport
      });

      altZustand.text = JSON.stringify(versiegelt.datei, null, 2);
      altZustand.neuerName = S.dateinameAus(kunde, 'lizenz');

      $('alt-res-datei').textContent = altZustand.neuerName;
      $('alt-res-pass').textContent = pass;
      $('alt-ergebnis').classList.remove('hz-versteckt');
      $('alt-ergebnis').scrollIntoView({ behavior: 'smooth', block: 'start' });
      U.toast('Lizenz im neuen Format ausgestellt.', 'erfolg');
    } catch (e) {
      fehlerZeigen('alt-fehler', 'Fehler: ' + e.message);
    }
  }

  /* =========================================================
     Verdrahtung
     ========================================================= */
  function themeKnopfAktualisieren() {
    var w = U.themeLesen();
    $('theme-text').textContent = w === 'hell' ? 'Hell' : (w === 'dunkel' ? 'Dunkel' : 'System');
  }

  function start() {
    if (!K.verfuegbar()) {
      document.body.innerHTML =
        '<div class="hz-karte" style="max-width:520px;margin:60px auto;">' +
        '<h3>Verschluesselung nicht verfuegbar</h3>' +
        '<p>Dieser Seite fehlt <span class="hz-mono">crypto.subtle</span>. Bitte oeffnen Sie sie ' +
        'direkt als Datei oder ueber eine https-Adresse - ueber einfaches http:// sperrt der ' +
        'Browser die Verschluesselung.</p></div>';
      return;
    }

    moduleZeichnen('neu-module', 'neu-mod-');
    $('neu-gueltig').value = U.isoTagPlus(365);
    schluesselAnzeigen();
    themeKnopfAktualisieren();

    $('theme-btn').addEventListener('click', function () { U.themeUmschalten(); themeKnopfAktualisieren(); });

    $('btn-schluessel-oeffnen').addEventListener('click', function () { schluesselOeffnen(false); });
    $('btn-schluessel-zuletzt').addEventListener('click', function () { schluesselOeffnen(true); });
    $('btn-schluessel-neu').addEventListener('click', schluesselNeu);
    $('btn-schluessel-export').addEventListener('click', function () { oeffentlichenSchluesselExportieren(false); });
    $('btn-schluessel-sperren').addEventListener('click', schluesselSperren);

    Array.prototype.forEach.call($('gen-reiter').children, function (b) {
      b.addEventListener('click', function () { reiterWechseln(b.dataset.reiter); });
    });

    /* Neue Lizenz */
    $('btn-neu-pass').addEventListener('click', function () {
      $('neu-pass').value = K.passwortErzeugen(14);
      staerkeMalen('neu-staerke', $('neu-pass').value);
    });
    $('neu-pass').addEventListener('input', function () { staerkeMalen('neu-staerke', this.value); });
    $('btn-neu-erstellen').addEventListener('click', neueLizenzErstellen);
    $('btn-neu-download').addEventListener('click', function () {
      if (neuErgebnis) dateiSpeichern(neuErgebnis.text, neuErgebnis.dateiname, null);
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-tage]'), function (b) {
      b.addEventListener('click', function () {
        var basis = $('neu-gueltig').value ? new Date($('neu-gueltig').value + 'T00:00:00') : null;
        if (!basis || basis < new Date()) basis = null;
        $('neu-gueltig').value = U.isoTagPlus(Number(b.dataset.tage), basis);
      });
    });

    /* Verlaengern */
    $('btn-bea-oeffnen').addEventListener('click', lizenzOeffnen);
    $('btn-bea-pass').addEventListener('click', function () { $('bea-pass').value = K.passwortErzeugen(14); });
    $('btn-bea-speichern').addEventListener('click', lizenzNeuAusstellen);
    $('btn-bea-download').addEventListener('click', function () {
      if (beaZustand && beaZustand.text) dateiSpeichern(beaZustand.text, beaZustand.neuerName, beaZustand.handle);
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-tage-bea]'), function (b) {
      b.addEventListener('click', function () {
        var basis = $('bea-gueltig').value ? new Date($('bea-gueltig').value + 'T00:00:00') : null;
        if (!basis || basis < new Date()) basis = null;
        $('bea-gueltig').value = U.isoTagPlus(Number(b.dataset.tageBea), basis);
      });
    });

    /* Altformat */
    $('btn-alt-oeffnen').addEventListener('click', altformatOeffnen);
    $('btn-alt-pass').addEventListener('click', function () { $('alt-pass').value = K.passwortErzeugen(14); });
    $('btn-alt-erstellen').addEventListener('click', altformatAusstellen);
    $('btn-alt-download').addEventListener('click', function () {
      if (altZustand && altZustand.text) dateiSpeichern(altZustand.text, altZustand.neuerName, null);
    });

    /* Kopierknoepfe */
    document.addEventListener('click', async function (e) {
      var btn = e.target.closest('[data-kopieren]');
      if (!btn) return;
      var el = $(btn.dataset.kopieren);
      if (!el) return;
      var ok = await U.inZwischenablage(el.textContent);
      U.toast(ok ? 'In die Zwischenablage kopiert.' : 'Kopieren nicht moeglich.', ok ? 'erfolg' : 'fehler');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
