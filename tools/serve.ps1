<#
    HZ · Kleiner Entwicklungsserver
    -------------------------------------------------------------
    Nur fuer die Entwicklung gedacht. Er wird gebraucht, weil die
    Browser-Vorschau lokale Dateien in data:-URLs umwandelt - dort
    gibt es weder relative Skriptpfade noch crypto.subtle.

    http://localhost gilt im Browser als sicherer Kontext, deshalb
    funktioniert WebCrypto hier genauso wie spaeter unter https://.

    Aufruf:  powershell -ExecutionPolicy Bypass -File tools\serve.ps1 [-Port 8123]
#>
param(
    [int]$Port = 8123
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

$typen = @{
    '.html' = 'text/html; charset=utf-8'
    '.js'   = 'text/javascript; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.svg'  = 'image/svg+xml'
    '.png'  = 'image/png'
    '.ico'  = 'image/x-icon'
    '.map'  = 'application/json; charset=utf-8'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Output "HZ-Entwicklungsserver laeuft auf http://localhost:$Port/"
Write-Output "Wurzelverzeichnis: $root"

try {
    while ($listener.IsListening) {
        $ctx = $listener.GetContext()
        $req = $ctx.Request
        $res = $ctx.Response

        try {
            $pfad = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath)
            if ($pfad -eq '/') { $pfad = '/index.html' }
            $pfad = $pfad.TrimStart('/').Replace('/', [System.IO.Path]::DirectorySeparatorChar)

            $ziel = Join-Path $root $pfad
            $zielVoll = [System.IO.Path]::GetFullPath($ziel)

            # Ausbruch aus dem Wurzelverzeichnis verhindern
            if (-not $zielVoll.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
                $res.StatusCode = 403
                $bytes = [System.Text.Encoding]::UTF8.GetBytes('403 - ausserhalb des Wurzelverzeichnisses')
            }
            elseif (Test-Path -LiteralPath $zielVoll -PathType Leaf) {
                $res.StatusCode = 200
                $endung = [System.IO.Path]::GetExtension($zielVoll).ToLowerInvariant()
                if ($typen.ContainsKey($endung)) { $res.ContentType = $typen[$endung] }
                else { $res.ContentType = 'application/octet-stream' }
                # Beim Entwickeln nie cachen, sonst sieht man Aenderungen nicht
                $res.Headers.Add('Cache-Control', 'no-store, no-cache, must-revalidate')
                $bytes = [System.IO.File]::ReadAllBytes($zielVoll)
            }
            else {
                $res.StatusCode = 404
                $res.ContentType = 'text/plain; charset=utf-8'
                $bytes = [System.Text.Encoding]::UTF8.GetBytes("404 - nicht gefunden: $pfad")
            }

            $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
            Write-Output ("{0} {1} {2}" -f $res.StatusCode, $req.HttpMethod, $pfad)
        }
        catch {
            Write-Output ("FEHLER {0}: {1}" -f $req.Url.AbsolutePath, $_.Exception.Message)
            try { $res.StatusCode = 500 } catch { }
        }
        finally {
            try { $res.OutputStream.Close() } catch { }
        }
    }
}
finally {
    $listener.Stop()
    $listener.Close()
}
