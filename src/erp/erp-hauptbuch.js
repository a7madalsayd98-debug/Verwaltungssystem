/* =============================================================
   HZ · Modul Hauptbuch
   -------------------------------------------------------------
   Kontenplan, Buchungen, Kontenblatt, Bilanz, GuV.

   Die Rechenlogik ist unveraendert aus der ersten Version
   uebernommen. Neu sind: HTML-Escaping fuer alle Werte aus der
   Lizenzdatei (Kontobezeichnungen und Buchungstexte gehen
   ungeprueft ins Markup) sowie Dialoge statt alert/confirm.
   ============================================================= */
(function () {
  'use strict';

  var U = HZ.ui;
  var $ = U.$;

  var TYP_NAME = { aktiva: 'Aktiva', passiva: 'Passiva', ertrag: 'Ertrag', aufwand: 'Aufwand' };
  var TYP_FOLGE = ['aktiva', 'passiva', 'ertrag', 'aufwand'];

  var HB = null;
  var reiter = 'konten';

  /* Vereinfachter Kontenrahmen, an SKR03 angelehnt. Keine
     steuerlich gepruefte Vorlage - im Zweifel mit dem
     Steuerberater abstimmen. */
  function standardKonten() {
    return [
      { nummer: '0100', name: 'Grundstuecke und Gebaeude', typ: 'aktiva' },
      { nummer: '0200', name: 'Technische Anlagen und Maschinen', typ: 'aktiva' },
      { nummer: '0300', name: 'Betriebs- und Geschaeftsausstattung', typ: 'aktiva' },
      { nummer: '0400', name: 'Fuhrpark', typ: 'aktiva' },
      { nummer: '1000', name: 'Kasse', typ: 'aktiva' },
      { nummer: '1200', name: 'Bank', typ: 'aktiva' },
      { nummer: '1400', name: 'Forderungen aus Lieferungen und Leistungen', typ: 'aktiva' },
      { nummer: '1500', name: 'Vorsteuer', typ: 'aktiva' },
      { nummer: '1600', name: 'Warenbestand', typ: 'aktiva' },
      { nummer: '2000', name: 'Eigenkapital', typ: 'passiva' },
      { nummer: '3000', name: 'Bankdarlehen', typ: 'passiva' },
      { nummer: '3300', name: 'Verbindlichkeiten aus Lieferungen und Leistungen', typ: 'passiva' },
      { nummer: '3500', name: 'Umsatzsteuer', typ: 'passiva' },
      { nummer: '3600', name: 'Rueckstellungen', typ: 'passiva' },
      { nummer: '4000', name: 'Umsatzerloese 19% USt', typ: 'ertrag' },
      { nummer: '4001', name: 'Umsatzerloese 7% USt', typ: 'ertrag' },
      { nummer: '4009', name: 'Sonstige betriebliche Ertraege', typ: 'ertrag' },
      { nummer: '5000', name: 'Wareneinkauf', typ: 'aufwand' },
      { nummer: '6000', name: 'Loehne und Gehaelter', typ: 'aufwand' },
      { nummer: '6100', name: 'Sozialabgaben', typ: 'aufwand' },
      { nummer: '6200', name: 'Miete', typ: 'aufwand' },
      { nummer: '6300', name: 'Nebenkosten (Strom, Wasser, Heizung)', typ: 'aufwand' },
      { nummer: '6400', name: 'Werbekosten', typ: 'aufwand' },
      { nummer: '6500', name: 'Buerobedarf', typ: 'aufwand' },
      { nummer: '6600', name: 'Telefon und Internet', typ: 'aufwand' },
      { nummer: '6700', name: 'Versicherungen', typ: 'aufwand' },
      { nummer: '6800', name: 'Kfz-Kosten', typ: 'aufwand' },
      { nummer: '6900', name: 'Abschreibungen', typ: 'aufwand' },
      { nummer: '7000', name: 'Zinsaufwendungen', typ: 'aufwand' },
      { nummer: '7900', name: 'Sonstige betriebliche Aufwendungen', typ: 'aufwand' }
    ];
  }

  function sicherstellen() {
    var d = HZ.app.daten();
    if (!d.hauptbuch) d.hauptbuch = { konten: standardKonten(), buchungen: [] };
    if (!d.hauptbuch.konten || !d.hauptbuch.konten.length) d.hauptbuch.konten = standardKonten();
    if (!d.hauptbuch.buchungen) d.hauptbuch.buchungen = [];
    HB = d.hauptbuch;
  }

  /* ---------- Rechnen ---------- */
  function findeKonto(nummer) {
    return HB.konten.filter(function (k) { return k.nummer === nummer; })[0];
  }

  function betrag(n) {
    var w = Math.round((n + Number.EPSILON) * 100) / 100;
    return w.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  }

  function saldo(nummer) {
    var konto = findeKonto(nummer);
    if (!konto) return 0;
    var soll = 0, haben = 0;
    HB.buchungen.forEach(function (b) {
      if (b.sollKonto === nummer) soll += b.betrag;
      if (b.habenKonto === nummer) haben += b.betrag;
    });
    return (konto.typ === 'aktiva' || konto.typ === 'aufwand') ? (soll - haben) : (haben - soll);
  }

  function guv() {
    var ertraege = 0, aufwendungen = 0;
    HB.konten.forEach(function (k) {
      if (k.typ === 'ertrag') ertraege += saldo(k.nummer);
      if (k.typ === 'aufwand') aufwendungen += saldo(k.nummer);
    });
    return { ertraege: ertraege, aufwendungen: aufwendungen, ergebnis: ertraege - aufwendungen };
  }

  function kontoOptionen(gewaehlt) {
    return HB.konten.map(function (k) {
      return '<option value="' + U.esc(k.nummer) + '"' + (k.nummer === gewaehlt ? ' selected' : '') + '>' +
        U.esc(k.nummer + ' – ' + k.name) + '</option>';
    }).join('');
  }

  /* ---------- Ansicht ---------- */
  function oeffnen(behaelter) {
    sicherstellen();
    behaelter.innerHTML =
      '<h1 class="hz-titel">Hauptbuch</h1>' +
      '<p class="hz-untertitel">Kontenplan, Buchungen, Kontenblaetter, Bilanz und GuV.</p>' +
      '<nav class="hz-reiter" id="hb-reiter" role="tablist">' +
        '<button type="button" data-r="konten" role="tab">Kontenplan</button>' +
        '<button type="button" data-r="buchen" role="tab">Buchen</button>' +
        '<button type="button" data-r="blatt" role="tab">Kontenblatt</button>' +
        '<button type="button" data-r="bilanz" role="tab">Bilanz</button>' +
        '<button type="button" data-r="guv" role="tab">GuV</button>' +
      '</nav>' +
      '<div id="hb-inhalt"></div>';

    Array.prototype.forEach.call($('hb-reiter').children, function (b) {
      b.addEventListener('click', function () { reiterWechseln(b.dataset.r); });
    });
    reiterWechseln(reiter);
  }

  function reiterWechseln(r) {
    reiter = r;
    Array.prototype.forEach.call($('hb-reiter').children, function (b) {
      b.classList.toggle('aktiv', b.dataset.r === r);
    });
    if (r === 'konten') kontenplan();
    else if (r === 'buchen') buchen();
    else if (r === 'blatt') kontenblatt();
    else if (r === 'bilanz') bilanz();
    else if (r === 'guv') guvAnsicht();
  }

  /* ---------- Kontenplan ---------- */
  function kontenplan() {
    var zeilen = '';
    TYP_FOLGE.forEach(function (typ) {
      var konten = HB.konten.filter(function (k) { return k.typ === typ; });
      if (!konten.length) return;
      zeilen += '<tr class="gruppe"><td colspan="4">' + TYP_NAME[typ] + '</td></tr>';
      konten.forEach(function (k) {
        var benutzt = HB.buchungen.some(function (b) {
          return b.sollKonto === k.nummer || b.habenKonto === k.nummer;
        });
        zeilen += '<tr>' +
          '<td class="hz-mono">' + U.esc(k.nummer) + '</td>' +
          '<td>' + U.esc(k.name) + '</td>' +
          '<td class="zahl">' + betrag(saldo(k.nummer)) + '</td>' +
          '<td class="mitte">' + (benutzt ? '' :
            '<button type="button" class="hz-btn gefahr klein" data-konto-weg="' + U.esc(k.nummer) + '">Loeschen</button>') +
          '</td></tr>';
      });
    });

    $('hb-inhalt').innerHTML =
      '<div class="hz-karte">' +
        '<h3>Kontenplan</h3>' +
        '<div class="hz-tabelle-rahmen"><table class="hz-tabelle">' +
          '<thead><tr><th>Nummer</th><th>Bezeichnung</th><th style="text-align:right;">Saldo</th><th></th></tr></thead>' +
          '<tbody>' + zeilen + '</tbody>' +
        '</table></div>' +
      '</div>' +
      '<div class="hz-karte">' +
        '<h3>Neues Konto anlegen</h3>' +
        '<div class="hz-feld-reihe">' +
          '<div class="hz-feld" style="max-width:130px;"><label>Nummer</label>' +
          '<input type="text" id="hb-nk-nummer" placeholder="z. B. 4500" inputmode="numeric"></div>' +
          '<div class="hz-feld" style="flex:2;"><label>Bezeichnung</label>' +
          '<input type="text" id="hb-nk-name" placeholder="Kontobezeichnung"></div>' +
          '<div class="hz-feld" style="max-width:170px;"><label>Typ</label>' +
          '<select id="hb-nk-typ">' +
            TYP_FOLGE.map(function (t) { return '<option value="' + t + '">' + TYP_NAME[t] + '</option>'; }).join('') +
          '</select></div>' +
        '</div>' +
        '<button type="button" class="hz-btn" id="hb-nk-anlegen">Konto anlegen</button>' +
      '</div>';

    $('hb-nk-anlegen').addEventListener('click', kontoAnlegen);
    Array.prototype.forEach.call(document.querySelectorAll('[data-konto-weg]'), function (b) {
      b.addEventListener('click', function () { kontoLoeschen(b.dataset.kontoWeg); });
    });
  }

  function kontoAnlegen() {
    var nummer = $('hb-nk-nummer').value.trim();
    var name = $('hb-nk-name').value.trim();
    var typ = $('hb-nk-typ').value;

    if (!nummer || !name) { U.toast('Bitte Kontonummer und Bezeichnung eingeben.', 'fehler'); return; }
    if (findeKonto(nummer)) { U.toast('Diese Kontonummer gibt es bereits.', 'fehler'); return; }

    HB.konten.push({ nummer: nummer, name: name, typ: typ });
    HB.konten.sort(function (a, b) {
      return a.nummer.localeCompare(b.nummer, 'de', { numeric: true });
    });
    HZ.app.geaendert();
    kontenplan();
    U.toast('Konto ' + nummer + ' angelegt.', 'erfolg');
  }

  async function kontoLoeschen(nummer) {
    var konto = findeKonto(nummer);
    if (!konto) return;
    var ok = await U.bestaetigen(
      'Konto ' + nummer + ' – ' + konto.name + ' wirklich loeschen?',
      'Konto loeschen', 'Ja, loeschen', true);
    if (!ok) return;
    HB.konten = HB.konten.filter(function (k) { return k.nummer !== nummer; });
    HZ.app.geaendert();
    kontenplan();
    U.toast('Konto geloescht.', 'erfolg');
  }

  /* ---------- Buchen ---------- */
  function buchen() {
    $('hb-inhalt').innerHTML =
      '<div class="hz-karte">' +
        '<h3>Neuen Buchungssatz erfassen</h3>' +
        '<div class="hz-feld-reihe">' +
          '<div class="hz-feld"><label>Datum</label><input type="date" id="hb-b-datum" value="' + U.isoTag() + '"></div>' +
          '<div class="hz-feld"><label>Betrag (€)</label>' +
          '<input type="number" id="hb-b-betrag" min="0" step="0.01" placeholder="0,00" inputmode="decimal"></div>' +
        '</div>' +
        '<div class="hz-feld-reihe">' +
          '<div class="hz-feld"><label>Soll-Konto</label><select id="hb-b-soll">' + kontoOptionen() + '</select></div>' +
          '<div class="hz-feld"><label>Haben-Konto</label><select id="hb-b-haben">' + kontoOptionen() + '</select></div>' +
        '</div>' +
        '<div class="hz-feld"><label>Buchungstext</label>' +
        '<input type="text" id="hb-b-text" placeholder="z. B. Bueromaterial Rechnung Nr. 123"></div>' +
        '<button type="button" class="hz-btn" id="hb-b-buchen">Buchen</button>' +
      '</div>' +
      '<div class="hz-karte">' +
        '<h3>Letzte Buchungen</h3>' +
        '<div id="hb-b-liste"></div>' +
      '</div>';

    $('hb-b-buchen').addEventListener('click', buchungSpeichern);
    buchungslisteZeichnen();
  }

  function buchungslisteZeichnen() {
    var el = $('hb-b-liste');
    if (!el) return;

    var sortiert = HB.buchungen.slice().sort(function (a, b) {
      return b.datum.localeCompare(a.datum) || b.id - a.id;
    }).slice(0, 20);

    if (!sortiert.length) {
      el.innerHTML = '<div class="hz-leerzustand">' +
        '<div class="titel">Noch keine Buchungen</div>' +
        '<div class="text">Erfassen Sie oben Ihren ersten Buchungssatz.</div></div>';
      return;
    }

    el.innerHTML = '<div class="hz-tabelle-rahmen"><table class="hz-tabelle">' +
      '<thead><tr><th>Datum</th><th>Soll</th><th>Haben</th>' +
      '<th style="text-align:right;">Betrag</th><th>Text</th><th></th></tr></thead><tbody>' +
      sortiert.map(function (b) {
        return '<tr>' +
          '<td>' + U.datumDe(b.datum) + '</td>' +
          '<td class="hz-mono">' + U.esc(b.sollKonto) + '</td>' +
          '<td class="hz-mono">' + U.esc(b.habenKonto) + '</td>' +
          '<td class="zahl">' + betrag(b.betrag) + '</td>' +
          '<td>' + U.esc(b.text || '') + '</td>' +
          '<td class="mitte"><button type="button" class="hz-btn gefahr klein" data-buchung-weg="' +
            U.esc(b.id) + '">Loeschen</button></td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>';

    Array.prototype.forEach.call(el.querySelectorAll('[data-buchung-weg]'), function (btn) {
      btn.addEventListener('click', function () { buchungLoeschen(Number(btn.dataset.buchungWeg)); });
    });
  }

  function buchungSpeichern() {
    var datum = $('hb-b-datum').value;
    var wert = parseFloat($('hb-b-betrag').value);
    var soll = $('hb-b-soll').value;
    var haben = $('hb-b-haben').value;
    var text = $('hb-b-text').value.trim();

    if (!datum) { U.toast('Bitte ein Datum waehlen.', 'fehler'); return; }
    if (!wert || wert <= 0 || isNaN(wert)) { U.toast('Bitte einen gueltigen Betrag eingeben.', 'fehler'); return; }
    if (soll === haben) { U.toast('Soll- und Haben-Konto duerfen nicht identisch sein.', 'fehler'); return; }

    HB.buchungen.push({
      id: Date.now(),
      datum: datum, sollKonto: soll, habenKonto: haben, betrag: wert, text: text
    });
    HZ.app.geaendert();

    $('hb-b-betrag').value = '';
    $('hb-b-text').value = '';
    $('hb-b-betrag').focus();
    buchungslisteZeichnen();
    U.toast('Buchung erfasst: ' + betrag(wert), 'erfolg');
  }

  async function buchungLoeschen(id) {
    var b = HB.buchungen.filter(function (x) { return x.id === id; })[0];
    if (!b) return;
    var ok = await U.bestaetigen(
      'Buchung vom ' + U.datumDe(b.datum) + ' ueber ' + betrag(b.betrag) + ' wirklich loeschen?',
      'Buchung loeschen', 'Ja, loeschen', true);
    if (!ok) return;
    HB.buchungen = HB.buchungen.filter(function (x) { return x.id !== id; });
    HZ.app.geaendert();
    buchungslisteZeichnen();
    U.toast('Buchung geloescht.', 'erfolg');
  }

  /* ---------- Kontenblatt ---------- */
  function kontenblatt() {
    $('hb-inhalt').innerHTML =
      '<div class="hz-karte">' +
        '<h3>Kontenblatt</h3>' +
        '<div class="hz-feld" style="max-width:440px;"><label>Konto auswaehlen</label>' +
        '<select id="hb-kb-konto">' + kontoOptionen() + '</select></div>' +
        '<div id="hb-kb-details"></div>' +
      '</div>';

    $('hb-kb-konto').addEventListener('change', function () { kontenblattDetails(this.value); });
    if (HB.konten.length) kontenblattDetails(HB.konten[0].nummer);
  }

  function kontenblattDetails(nummer) {
    var konto = findeKonto(nummer);
    var el = $('hb-kb-details');
    if (!konto || !el) return;

    var sollNormal = (konto.typ === 'aktiva' || konto.typ === 'aufwand');
    var posten = HB.buchungen.filter(function (b) {
      return b.sollKonto === nummer || b.habenKonto === nummer;
    }).sort(function (a, b) {
      return a.datum.localeCompare(b.datum) || a.id - b.id;
    });

    var laufend = 0;
    var zeilen = posten.map(function (b) {
      var istSoll = b.sollKonto === nummer;
      var gegen = istSoll ? b.habenKonto : b.sollKonto;
      var gegenKonto = findeKonto(gegen);
      var vorzeichen = sollNormal ? (istSoll ? 1 : -1) : (istSoll ? -1 : 1);
      laufend += vorzeichen * b.betrag;
      return '<tr>' +
        '<td>' + U.datumDe(b.datum) + '</td>' +
        '<td>' + (istSoll ? 'Soll' : 'Haben') + '</td>' +
        '<td>' + U.esc(gegen + (gegenKonto ? ' – ' + gegenKonto.name : '')) + '</td>' +
        '<td>' + U.esc(b.text || '') + '</td>' +
        '<td class="zahl">' + betrag(b.betrag) + '</td>' +
        '<td class="zahl">' + betrag(laufend) + '</td>' +
      '</tr>';
    }).join('');

    if (!posten.length) {
      zeilen = '<tr><td colspan="6" class="hz-leer">Keine Buchungen auf diesem Konto.</td></tr>';
    }

    el.innerHTML =
      '<div class="konto-kopf">' + U.esc(konto.nummer + ' – ' + konto.name) +
      ' <span class="hz-marke">' + TYP_NAME[konto.typ] + '</span></div>' +
      '<div class="hz-tabelle-rahmen"><table class="hz-tabelle">' +
        '<thead><tr><th>Datum</th><th>S/H</th><th>Gegenkonto</th><th>Text</th>' +
        '<th style="text-align:right;">Betrag</th><th style="text-align:right;">Saldo</th></tr></thead>' +
        '<tbody>' + zeilen + '</tbody>' +
        '<tfoot><tr><td colspan="5">Endsaldo</td><td class="zahl">' + betrag(saldo(nummer)) + '</td></tr></tfoot>' +
      '</table></div>';
  }

  /* ---------- Bilanz ---------- */
  function bilanz() {
    var aktiva = HB.konten.filter(function (k) { return k.typ === 'aktiva'; });
    var passiva = HB.konten.filter(function (k) { return k.typ === 'passiva'; });
    var ergebnis = guv().ergebnis;

    function zeilen(liste) {
      if (!liste.length) return '<tr><td colspan="3" class="hz-leer">Keine Konten.</td></tr>';
      return liste.map(function (k) {
        return '<tr><td class="hz-mono">' + U.esc(k.nummer) + '</td><td>' + U.esc(k.name) +
          '</td><td class="zahl">' + betrag(saldo(k.nummer)) + '</td></tr>';
      }).join('');
    }

    var aktivaSumme = aktiva.reduce(function (s, k) { return s + saldo(k.nummer); }, 0);
    var passivaZeilen = zeilen(passiva) +
      '<tr><td></td><td>' + (ergebnis >= 0 ? 'Jahresueberschuss' : 'Jahresfehlbetrag') +
      '</td><td class="zahl">' + betrag(ergebnis) + '</td></tr>';
    var passivaSumme = passiva.reduce(function (s, k) { return s + saldo(k.nummer); }, 0) + ergebnis;
    var differenz = aktivaSumme - passivaSumme;

    $('hb-inhalt').innerHTML =
      '<div class="hz-karte"><h3>Bilanz</h3>' +
        '<div class="bilanz-spalten">' +
          '<div><div class="seiten-titel">Aktiva</div>' +
            '<div class="hz-tabelle-rahmen"><table class="hz-tabelle"><tbody>' + zeilen(aktiva) + '</tbody>' +
            '<tfoot><tr><td colspan="2">Bilanzsumme</td><td class="zahl">' + betrag(aktivaSumme) +
            '</td></tr></tfoot></table></div></div>' +
          '<div><div class="seiten-titel">Passiva</div>' +
            '<div class="hz-tabelle-rahmen"><table class="hz-tabelle"><tbody>' + passivaZeilen + '</tbody>' +
            '<tfoot><tr><td colspan="2">Bilanzsumme</td><td class="zahl">' + betrag(passivaSumme) +
            '</td></tr></tfoot></table></div></div>' +
        '</div>' +
        (Math.abs(differenz) > 0.01
          ? '<div class="hz-box warn" style="margin:16px 0 0;">Aktiva und Passiva stimmen nicht ueberein. ' +
            'Differenz ' + betrag(differenz) + '. Bitte die Buchungen pruefen.</div>'
          : '<div class="hz-box erfolg" style="margin:16px 0 0;">Aktiva und Passiva stimmen ueberein.</div>') +
      '</div>';
  }

  /* ---------- GuV ---------- */
  function guvAnsicht() {
    var e = guv();
    var ertragKonten = HB.konten.filter(function (k) { return k.typ === 'ertrag'; });
    var aufwandKonten = HB.konten.filter(function (k) { return k.typ === 'aufwand'; });

    function zeilen(liste, leerText) {
      if (!liste.length) return '<tr><td colspan="3" class="hz-leer">' + leerText + '</td></tr>';
      return liste.map(function (k) {
        return '<tr><td class="hz-mono">' + U.esc(k.nummer) + '</td><td>' + U.esc(k.name) +
          '</td><td class="zahl">' + betrag(saldo(k.nummer)) + '</td></tr>';
      }).join('');
    }

    $('hb-inhalt').innerHTML =
      '<div class="hz-karte"><h3>Gewinn- und Verlustrechnung</h3>' +
        '<div class="seiten-titel">Ertraege</div>' +
        '<div class="hz-tabelle-rahmen"><table class="hz-tabelle"><tbody>' +
          zeilen(ertragKonten, 'Keine Ertragskonten.') + '</tbody>' +
          '<tfoot><tr><td colspan="2">Summe Ertraege</td><td class="zahl">' + betrag(e.ertraege) +
          '</td></tr></tfoot></table></div>' +
        '<div class="seiten-titel" style="margin-top:22px;">Aufwendungen</div>' +
        '<div class="hz-tabelle-rahmen"><table class="hz-tabelle"><tbody>' +
          zeilen(aufwandKonten, 'Keine Aufwandskonten.') + '</tbody>' +
          '<tfoot><tr><td colspan="2">Summe Aufwendungen</td><td class="zahl">' + betrag(e.aufwendungen) +
          '</td></tr></tfoot></table></div>' +
        '<div class="ergebnis-box ' + (e.ergebnis >= 0 ? 'gewinn' : 'verlust') + '">' +
          '<span>' + (e.ergebnis >= 0 ? 'Jahresueberschuss' : 'Jahresfehlbetrag') + '</span>' +
          '<span>' + betrag(Math.abs(e.ergebnis)) + '</span>' +
        '</div>' +
      '</div>';
  }

  /* ---------- Anmeldung bei der Schale ---------- */
  HZ.app.modul({
    key: 'hauptbuch',
    name: 'Hauptbuch',
    gebaut: true,
    icon: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    kachelText: function () {
      var d = HZ.app.daten();
      var hb = d.hauptbuch;
      if (!hb || !hb.buchungen || !hb.buchungen.length) return 'Konten, Bilanz und GuV';
      return hb.buchungen.length + ' Buchungen erfasst';
    },
    oeffnen: oeffnen
  });

  /* Die uebrigen Module folgen demselben Muster: eine eigene
     Datei, ein Aufruf von HZ.app.modul(), ein Eintrag in
     build.ps1. Die Schale kuemmert sich um Navigation, Kachel,
     Freischaltung und Speichern. */
  HZ.app.modul({
    key: 'lager', name: 'Lagerverwaltung', gebaut: false,
    icon: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
    oeffnen: function () {}
  });
  HZ.app.modul({
    key: 'lohn', name: 'Lohnabrechnung', gebaut: false,
    icon: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M6 15h4"/>',
    oeffnen: function () {}
  });
  HZ.app.modul({
    key: 'crm', name: 'CRM', gebaut: false,
    icon: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    oeffnen: function () {}
  });
})();
