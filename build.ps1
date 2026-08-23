<#
    HZ · Build
    -------------------------------------------------------------
    Fuegt die Quelldateien aus src/ zu je einer eigenstaendigen
    HTML-Datei zusammen.

    Warum ueberhaupt getrennte Quelldateien?
      Der Kunde bekommt am liebsten EINE Datei, die er doppelklickt.
      Beim Weiterentwickeln ist eine 1500-Zeilen-Datei aber teuer -
      jede kleine Aenderung zwingt dazu, das ganze Monster zu lesen.
      Quelle also modular, Auslieferung als Einzeldatei.

    Aufruf:  powershell -ExecutionPolicy Bypass -File build.ps1
#>
param(
    [switch]$Leise
)

$ErrorActionPreference = 'Stop'
$wurzel = $PSScriptRoot
$src    = Join-Path $wurzel 'src'

function Lies($relativerPfad) {
    $p = Join-Path $src $relativerPfad
    if (-not (Test-Path -LiteralPath $p)) { throw "Quelldatei fehlt: $relativerPfad" }
    return [System.IO.File]::ReadAllText($p, [System.Text.UTF8Encoding]::new($false))
}

function Baue($ziel, $titel, $beschreibung, $cssListe, $bodyDatei, $jsListe) {

    $css = ($cssListe | ForEach-Object {
        "/* ===== $_ ===== */`n" + (Lies $_)
    }) -join "`n`n"

    $body = Lies $bodyDatei

    $js = ($jsListe | ForEach-Object {
        "/* ===== $_ ===== */`n" + (Lies $_)
    }) -join "`n`n"

    # Ein "</script>" im JavaScript wuerde den Block vorzeitig beenden.
    if ($js -match '</script') { throw "JavaScript enthaelt </script> - das bricht die Einzeldatei." }

    $stempel = Get-Date -Format 'yyyy-MM-dd HH:mm'

    $html = @"
<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light dark">
<meta name="description" content="$beschreibung">
<title>$titel</title>
<!--
  Erzeugt von build.ps1 am $stempel - NICHT von Hand bearbeiten.
  Die Quelldateien liegen unter src/, siehe README.md.
-->
<style>
$css
</style>
</head>
<body>
$body
<script>
$js
</script>
</body>
</html>
"@

    $zielPfad = Join-Path $wurzel $ziel
    [System.IO.File]::WriteAllText($zielPfad, $html, [System.Text.UTF8Encoding]::new($false))

    $kb = [math]::Round((Get-Item -LiteralPath $zielPfad).Length / 1KB, 1)
    if (-not $Leise) { Write-Output ("  {0,-32} {1,7} KB" -f $ziel, $kb) }
}

if (-not $Leise) { Write-Output 'HZ Build' }

$kern = @(
    'core/hz-crypto.js',
    'core/hz-license.js',
    'core/hz-store.js',
    'core/hz-ui.js'
)

Baue -ziel 'hz-erp-system.html' `
     -titel 'HZ Erp-System' `
     -beschreibung 'HZ Erp-System - Zeiterfassung und Hauptbuch, vollstaendig lokal.' `
     -cssListe @('core/hz-core.css', 'erp/erp.css') `
     -bodyDatei 'erp/erp.body.html' `
     -jsListe ($kern + @(
        'vendor-key.js',
        # Die Schale muss vor den Fachmodulen stehen: sie stellt
        # HZ.app.modul() bereit, womit die Module sich anmelden.
        'erp/erp-shell.js',
        'erp/erp-zeit.js',
        'erp/erp-hauptbuch.js'
     ))

Baue -ziel 'hz-lizenz-generator.html' `
     -titel 'HZ Lizenz-Generator (intern)' `
     -beschreibung 'Interner Generator fuer signierte und verschluesselte HZ-Lizenzdateien.' `
     -cssListe @('core/hz-core.css', 'gen/gen.css') `
     -bodyDatei 'gen/gen.body.html' `
     -jsListe ($kern + @(
        'core/hz-keystore.js',
        'gen/gen-app.js'
     ))

# Warnen, wenn noch kein echter Haendlerschluessel hinterlegt ist.
$vk = Lies 'vendor-key.js'
if ($vk -match 'haendlerSchluessel\s*=\s*null') {
    Write-Output ''
    Write-Output '  HINWEIS: src/vendor-key.js ist noch ein Platzhalter.'
    Write-Output '  Das ERP-System weist jede Lizenz ab, bis Sie im Generator'
    Write-Output '  ein Schluesselpaar einrichten und vendor-key.js ersetzen.'
}

if (-not $Leise) {
    Write-Output ''
    Write-Output 'Fertig.'
}
