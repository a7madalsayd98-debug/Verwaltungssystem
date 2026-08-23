/* =============================================================
   HZ · Modul Zeiterfassung
   -------------------------------------------------------------
   Kennt weder Dateien noch Verschluesselung. Es liest und
   schreibt HZ.app.daten().zeiterfassung und meldet Aenderungen
   mit HZ.app.geaendert() an - den Rest erledigt die Schale.
   ============================================================= */
(function () {
  'use strict';

  var U = HZ.ui;
  var $ = U.$;

  var WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  var MONATE = ['Januar', 'Februar', 'Maerz', 'April', 'Mai', 'Juni',
                'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

  var kalJahr, kalMonat;
  var modalKey = null;
  var modalBuchungen = [];

  function daten() {
    var d = HZ.app.daten();
    if (!d.zeiterfassung) d.zeiterfassung = {};
    return d.zeiterfassung;
  }

  /* ---------- Rechnen ---------- */
  function tagKey(j, m, t) { return j + '-' + U.pad(m + 1) + '-' + U.pad(t); }

  function stunden(minuten) {
    if (!minuten || minuten <= 0) return '0,0 Std';
    return (minuten / 60).toFixed(1).replace('.', ',') + ' Std';
  }

  function zeitZuMinuten(t) {
    if (!t) return null;
    var teile = String(t).split(':');
    if (teile.length !== 2) return null;
    var h = Number(teile[0]), m = Number(teile[1]);
    if (isNaN(h) || isNaN(m)) return null;
    return h * 60 + m;
  }

  function nettoMinuten(b) {
    var start = zeitZuMinuten(b.kommen), ende = zeitZuMinuten(b.gehen);
    if (start === null || ende === null) return 0;
    var diff = ende - start;
    if (diff < 0) diff += 24 * 60;   // ueber Mitternacht
    var netto = diff - (Number(b.pause1) || 0) - (Number(b.pause2) || 0);
    return netto > 0 ? netto : 0;
  }

  function tagesSumme(key) {
    return (daten()[key] || []).reduce(function (s, b) { return s + nettoMinuten(b); }, 0);
  }

  function monatsSumme(j, m) {
    var d = daten(), summe = 0;
    Object.keys(d).forEach(function (key) {
      var teile = key.split('-');
      if (Number(teile[0]) === j && Number(teile[1]) === m + 1) summe += tagesSumme(key);
    });
    return summe;
  }

  /* ---------- Ansicht ---------- */
  function oeffnen(behaelter) {
    var jetzt = new Date();
    kalJahr = jetzt.getFullYear();
    kalMonat = jetzt.getMonth();

    behaelter.innerHTML =
      '<h1 class="hz-titel">Zeiterfassung</h1>' +
      '<p class="hz-untertitel">Klicken Sie auf einen Tag, um Kommen und Gehen zu erfassen.</p>' +
      '<div class="monatsleiste">' +
        '<button type="button" class="hz-btn leise rund" id="zt-zurueck" aria-label="Vorheriger Monat">&#8249;</button>' +
        '<div class="monatsname" id="zt-monat"></div>' +
        '<button type="button" class="hz-btn leise rund" id="zt-vor" aria-label="Naechster Monat">&#8250;</button>' +
        '<button type="button" class="hz-btn sekundaer klein" id="zt-heute">Heute</button>' +
        '<div class="hz-dehnen"></div>' +
        '<div class="monatssumme">Monatssumme <b id="zt-summe">0,0 Std</b></div>' +
      '</div>' +
      '<div class="kalender">' +
        '<div class="kal-wochentage">' +
          WOCHENTAGE.map(function (w) { return '<div>' + w + '</div>'; }).join('') +
        '</div>' +
        '<div class="kal-gitter" id="zt-gitter"></div>' +
      '</div>';

    $('zt-zurueck').addEventListener('click', function () { monatWechseln(-1); });
    $('zt-vor').addEventListener('click', function () { monatWechseln(1); });
    $('zt-heute').addEventListener('click', function () {
      var n = new Date();
      kalJahr = n.getFullYear(); kalMonat = n.getMonth();
      kalenderZeichnen();
    });

    kalenderZeichnen();
  }

  function monatWechseln(schritt) {
    kalMonat += schritt;
    if (kalMonat < 0) { kalMonat = 11; kalJahr--; }
    if (kalMonat > 11) { kalMonat = 0; kalJahr++; }
    kalenderZeichnen();
  }

  function kalenderZeichnen() {
    $('zt-monat').textContent = MONATE[kalMonat] + ' ' + kalJahr;
    $('zt-summe').textContent = stunden(monatsSumme(kalJahr, kalMonat));

    var gitter = $('zt-gitter');
    gitter.innerHTML = '';

    var ersterTag = new Date(kalJahr, kalMonat, 1).getDay();
    var startSpalte = (ersterTag === 0) ? 6 : ersterTag - 1;   // Woche beginnt Montag
    var tageImMonat = new Date(kalJahr, kalMonat + 1, 0).getDate();

    var heute = new Date();
    var istAktuellerMonat = heute.getFullYear() === kalJahr && heute.getMonth() === kalMonat;

    for (var i = 0; i < startSpalte; i++) {
      var leer = document.createElement('div');
      leer.className = 'kal-zelle leer';
      gitter.appendChild(leer);
    }

    var d = daten();
    for (var t = 1; t <= tageImMonat; t++) {
      (function (tag) {
        var key = tagKey(kalJahr, kalMonat, tag);
        var datum = new Date(kalJahr, kalMonat, tag);
        var wochenende = datum.getDay() === 0 || datum.getDay() === 6;
        var istHeute = istAktuellerMonat && heute.getDate() === tag;

        var zelle = document.createElement('button');
        zelle.type = 'button';
        zelle.className = 'kal-zelle' + (wochenende ? ' wochenende' : '') + (istHeute ? ' heute' : '');
        zelle.addEventListener('click', function () { modalOeffnen(key); });

        var buchungen = d[key] || [];
        var minuten = tagesSumme(key);
        var html = '<span class="kal-tag">' + tag + '</span>';
        if (buchungen.length > 0) {
          html += '<span class="kal-stunden">' + stunden(minuten) + '</span>' +
                  '<span class="kal-anzahl">' + buchungen.length +
                  ' Buchung' + (buchungen.length > 1 ? 'en' : '') + '</span>';
        }
        zelle.innerHTML = html;
        zelle.setAttribute('aria-label',
          U.pad(tag) + '.' + U.pad(kalMonat + 1) + '.' + kalJahr +
          (buchungen.length ? ', ' + stunden(minuten) : ', keine Buchung'));
        gitter.appendChild(zelle);
      })(t);
    }
  }

  /* ---------- Tagesdialog ---------- */
  function modalOeffnen(key) {
    modalKey = key;
    modalBuchungen = JSON.parse(JSON.stringify(daten()[key] || []));
    if (modalBuchungen.length === 0) modalBuchungen.push(leereBuchung());

    var teile = key.split('-').map(Number);
    var datum = new Date(teile[0], teile[1] - 1, teile[2]);
    var wt = WOCHENTAGE[(datum.getDay() + 6) % 7];

    U.dialog({
      titel: 'Zeitbuchung',
      html:
        '<div class="tages-kopf">' +
          '<span>' + wt + '., ' + U.pad(teile[2]) + '.' + U.pad(teile[1]) + '.' + teile[0] + '</span>' +
          '<b id="zt-tagsumme">0,0 Std</b>' +
        '</div>' +
        '<div id="zt-buchungen"></div>' +
        '<button type="button" class="hz-btn sekundaer breit" id="zt-plus" style="margin-top:10px;">' +
        '+ Weitere Buchung</button>',
      knoepfe: [
        { text: 'Abbrechen', wert: null, stil: 'sekundaer' },
        { text: 'Speichern', wert: 'ok', stil: 'primaer' }
      ]
    }).then(function (w) {
      if (w !== 'ok') return;
      var gueltig = modalBuchungen.filter(function (b) { return b.kommen && b.gehen; });
      var d = daten();
      if (gueltig.length > 0) d[modalKey] = gueltig; else delete d[modalKey];
      HZ.app.geaendert();
      kalenderZeichnen();
      U.toast(gueltig.length ? 'Buchungen uebernommen.' : 'Tag geleert.', 'erfolg');
    });

    setTimeout(function () {
      buchungenZeichnen();
      var plus = $('zt-plus');
      if (plus) plus.addEventListener('click', function () {
        modalBuchungen.push(leereBuchung());
        buchungenZeichnen();
      });
    }, 0);
  }

  function leereBuchung() { return { kommen: '', gehen: '', pause1: '', pause2: '' }; }

  function buchungenZeichnen() {
    var el = $('zt-buchungen');
    if (!el) return;

    el.innerHTML = modalBuchungen.map(function (b, i) {
      return '<div class="buchung">' +
        '<div class="buchung-kopf">' +
          '<span class="buchung-nr">Buchung ' + (i + 1) + '</span>' +
          (modalBuchungen.length > 1
            ? '<button type="button" class="hz-btn gefahr klein" data-weg="' + i + '">Entfernen</button>'
            : '') +
        '</div>' +
        '<div class="hz-feld-reihe">' +
          '<div class="hz-feld"><label>Kommen</label>' +
          '<input type="time" data-idx="' + i + '" data-feld="kommen" value="' + U.esc(b.kommen || '') + '"></div>' +
          '<div class="hz-feld"><label>Gehen</label>' +
          '<input type="time" data-idx="' + i + '" data-feld="gehen" value="' + U.esc(b.gehen || '') + '"></div>' +
        '</div>' +
        '<div class="hz-feld-reihe">' +
          '<div class="hz-feld"><label>Pause 1 (Min.)</label>' +
          '<input type="number" min="0" step="5" placeholder="0" data-idx="' + i + '" data-feld="pause1" value="' + U.esc(b.pause1 || '') + '"></div>' +
          '<div class="hz-feld"><label>Pause 2 (Min.)</label>' +
          '<input type="number" min="0" step="5" placeholder="0" data-idx="' + i + '" data-feld="pause2" value="' + U.esc(b.pause2 || '') + '"></div>' +
        '</div>' +
        '<div class="buchung-netto">Nettozeit <b>' + stunden(nettoMinuten(b)) + '</b></div>' +
      '</div>';
    }).join('');

    Array.prototype.forEach.call(el.querySelectorAll('input[data-idx]'), function (inp) {
      inp.addEventListener('input', function () {
        modalBuchungen[Number(inp.dataset.idx)][inp.dataset.feld] = inp.value;
        summenAktualisieren();
      });
    });
    Array.prototype.forEach.call(el.querySelectorAll('[data-weg]'), function (btn) {
      btn.addEventListener('click', function () {
        modalBuchungen.splice(Number(btn.dataset.weg), 1);
        buchungenZeichnen();
      });
    });

    summenAktualisieren();
  }

  function summenAktualisieren() {
    var gesamt = modalBuchungen.reduce(function (s, b) { return s + nettoMinuten(b); }, 0);
    var el = $('zt-tagsumme');
    if (el) el.textContent = stunden(gesamt);

    Array.prototype.forEach.call(document.querySelectorAll('#zt-buchungen .buchung'), function (k, i) {
      var b = k.querySelector('.buchung-netto b');
      if (b && modalBuchungen[i]) b.textContent = stunden(nettoMinuten(modalBuchungen[i]));
    });
  }

  /* ---------- Anmeldung bei der Schale ---------- */
  HZ.app.modul({
    key: 'zeiterfassung',
    name: 'Zeiterfassung',
    gebaut: true,
    icon: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
    kachelText: function () {
      var jetzt = new Date();
      return stunden(monatsSumme(jetzt.getFullYear(), jetzt.getMonth())) +
             ' im ' + MONATE[jetzt.getMonth()];
    },
    oeffnen: oeffnen
  });
})();
