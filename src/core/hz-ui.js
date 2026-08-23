/* =============================================================
   HZ · Gemeinsame Oberflaechen-Bausteine
   -------------------------------------------------------------
   Ersetzt alert(), confirm() und die frueheren Status-Zeilen durch
   Elemente, die den Arbeitsfluss nicht unterbrechen.
   ============================================================= */
window.HZ = window.HZ || {};
HZ.ui = (function () {
  'use strict';

  /* ---------- HTML-Escaping ----------
     Jede Zeichenkette, die aus einer Lizenzdatei stammt - Kundenname,
     Kontobezeichnung, Buchungstext - muss hier durch, bevor sie in
     innerHTML landet. */
  function esc(wert) {
    return String(wert === null || wert === undefined ? '' : wert)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function $(id) { return document.getElementById(id); }

  /* ---------- Toasts ---------- */
  function toastBehaelter() {
    var el = $('hz-toasts');
    if (!el) {
      el = document.createElement('div');
      el.id = 'hz-toasts';
      el.className = 'hz-toasts';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    return el;
  }

  function toast(text, art, dauer) {
    var el = document.createElement('div');
    el.className = 'hz-toast ' + (art || 'info');
    el.textContent = text;
    toastBehaelter().appendChild(el);
    requestAnimationFrame(function () { el.classList.add('sichtbar'); });
    var ms = dauer || (art === 'fehler' ? 7000 : 3200);
    setTimeout(function () {
      el.classList.remove('sichtbar');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 250);
    }, ms);
    return el;
  }

  /* ---------- Dialoge ----------
     Versprechen-basiert, damit der Aufrufer await benutzen kann.
     confirm() blockiert sonst den ganzen Browser-Tab. */
  var offeneDialoge = [];

  function dialog(opts) {
    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.className = 'hz-dialog-overlay';

      var knoepfe = (opts.knoepfe || [{ text: 'OK', wert: true, stil: 'primaer' }]);
      overlay.innerHTML =
        '<div class="hz-dialog" role="dialog" aria-modal="true" aria-labelledby="hz-dlg-titel">' +
          '<div class="hz-dialog-kopf">' +
            '<h3 id="hz-dlg-titel">' + esc(opts.titel || 'Hinweis') + '</h3>' +
          '</div>' +
          '<div class="hz-dialog-koerper">' +
            (opts.html ? opts.html : '<p>' + esc(opts.text || '') + '</p>') +
          '</div>' +
          '<div class="hz-dialog-fuss">' +
            knoepfe.map(function (b, i) {
              return '<button type="button" class="hz-btn ' + (b.stil || 'sekundaer') +
                     '" data-idx="' + i + '">' + esc(b.text) + '</button>';
            }).join('') +
          '</div>' +
        '</div>';

      document.body.appendChild(overlay);
      offeneDialoge.push(overlay);

      function schliessen(wert) {
        var i = offeneDialoge.indexOf(overlay);
        if (i >= 0) offeneDialoge.splice(i, 1);
        overlay.classList.remove('offen');
        setTimeout(function () { if (overlay.parentNode) document.body.removeChild(overlay); }, 180);
        resolve(wert);
      }

      overlay.addEventListener('click', function (e) {
        if (e.target === overlay && opts.schliessbar !== false) schliessen(null);
      });
      Array.prototype.forEach.call(overlay.querySelectorAll('[data-idx]'), function (btn) {
        btn.addEventListener('click', function () {
          schliessen(knoepfe[Number(btn.dataset.idx)].wert);
        });
      });

      overlay._schliessen = schliessen;
      requestAnimationFrame(function () {
        overlay.classList.add('offen');
        var fokus = overlay.querySelector('input, select, textarea') ||
                    overlay.querySelector('.hz-btn.primaer') ||
                    overlay.querySelector('.hz-btn');
        if (fokus) fokus.focus();
      });
    });
  }

  function hinweis(text, titel) {
    return dialog({ titel: titel || 'Hinweis', text: text,
      knoepfe: [{ text: 'Verstanden', wert: true, stil: 'primaer' }] });
  }

  function bestaetigen(text, titel, bestaetigenText, gefaehrlich) {
    return dialog({
      titel: titel || 'Bitte bestaetigen',
      text: text,
      knoepfe: [
        { text: 'Abbrechen', wert: false, stil: 'sekundaer' },
        { text: bestaetigenText || 'Ja, fortfahren', wert: true, stil: gefaehrlich ? 'gefahr' : 'primaer' }
      ]
    }).then(function (w) { return w === true; });
  }

  /* Escape schliesst immer nur den obersten Dialog. */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || offeneDialoge.length === 0) return;
    var oben = offeneDialoge[offeneDialoge.length - 1];
    if (oben._schliessen) { e.preventDefault(); oben._schliessen(null); }
  });

  /* ---------- Farbschema ----------
     hell / dunkel / system. Die Auswahl ist geraetebezogen und
     landet in localStorage, nicht in der Lizenzdatei. */
  var THEME_KEY = 'hz_theme';

  function themeSetzen(wert) {
    var w = (wert === 'hell' || wert === 'dunkel') ? wert : 'system';
    try { localStorage.setItem(THEME_KEY, w); } catch (e) { /* privater Modus */ }
    themeAnwenden();
    return w;
  }

  function themeLesen() {
    try { return localStorage.getItem(THEME_KEY) || 'system'; } catch (e) { return 'system'; }
  }

  function themeAnwenden() {
    var w = themeLesen();
    var dunkel = w === 'dunkel' ||
      (w === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dunkel ? 'dunkel' : 'hell');
    document.documentElement.setAttribute('data-theme-wahl', w);
  }

  function themeUmschalten() {
    var reihenfolge = ['system', 'hell', 'dunkel'];
    var i = reihenfolge.indexOf(themeLesen());
    return themeSetzen(reihenfolge[(i + 1) % reihenfolge.length]);
  }

  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var beiWechsel = function () { if (themeLesen() === 'system') themeAnwenden(); };
    if (mq.addEventListener) mq.addEventListener('change', beiWechsel);
    else if (mq.addListener) mq.addListener(beiWechsel);
  }
  themeAnwenden();

  /* ---------- Kleinkram ---------- */
  function pad(n) { return String(n).padStart(2, '0'); }

  /* Lokales Datum als ISO-Tag. toISOString() wuerde nach UTC
     umrechnen und in deutschen Zeitzonen nachts einen Tag
     zurueckspringen. */
  function isoTag(d) {
    var x = d || new Date();
    return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate());
  }

  function isoTagPlus(tage, ab) {
    var d = ab ? new Date(ab.getTime()) : new Date();
    d.setDate(d.getDate() + tage);
    return isoTag(d);
  }

  function datumDe(iso) {
    if (!iso) return '';
    var t = String(iso).split('-');
    if (t.length !== 3) return String(iso);
    return t[2] + '.' + t[1] + '.' + t[0];
  }

  function uhrzeit(d) {
    var x = d || new Date();
    return pad(x.getHours()) + ':' + pad(x.getMinutes());
  }

  async function inZwischenablage(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      /* Ohne https oder ohne Berechtigung greift der alte Weg. */
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      document.body.removeChild(ta);
      return ok;
    }
  }

  return {
    esc: esc,
    $: $,
    toast: toast,
    dialog: dialog,
    hinweis: hinweis,
    bestaetigen: bestaetigen,
    themeSetzen: themeSetzen,
    themeLesen: themeLesen,
    themeAnwenden: themeAnwenden,
    themeUmschalten: themeUmschalten,
    pad: pad,
    isoTag: isoTag,
    isoTagPlus: isoTagPlus,
    datumDe: datumDe,
    uhrzeit: uhrzeit,
    inZwischenablage: inZwischenablage
  };
})();
