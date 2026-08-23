/* =============================================================
   HZ · Oeffentlicher Haendlerschluessel
   -------------------------------------------------------------
   PLATZHALTER - noch kein Schluessel hinterlegt.

   So wird er erzeugt (einmalig):

     1. hz-lizenz-generator.html oeffnen
     2. "Schluesselpaar einrichten" -> Hauptpasswort vergeben
     3. Zwei Dateien werden angeboten:
          hz-haendler-schluessel.json  -> privat, NIE ins Repository,
                                          in einen lokalen bzw. lokal
                                          eingebundenen Cloud-Ordner legen
          vendor-key.js                -> diese Datei hier ersetzen
     4. build.ps1 ausfuehren, damit der Schluessel in das
        ausgelieferte ERP-System uebernommen wird.

   Solange hier null steht, weigert sich das ERP-System, eine
   Lizenz zu oeffnen - denn ohne Schluessel liesse sich die
   Echtheit einer Lizenz nicht pruefen, und genau das ist der
   Zweck der ganzen Konstruktion.
   ============================================================= */
window.HZ = window.HZ || {};
HZ.haendlerSchluessel = null;
