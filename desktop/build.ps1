# Compile RENARD.mp3.exe a la racine du depot, a cote de index.html et server.ps1.
# Aucun outil a installer : csc.exe fait partie du .NET Framework 4.8 de Windows.
# Le SDK WebView2 (3 DLL) est telecharge une fois depuis nuget.org.
# Usage : powershell -ExecutionPolicy Bypass -File desktop\build.ps1

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Here = $PSScriptRoot
$Root = Split-Path $Here -Parent
$WebView2Version = '1.0.2903.40'
$Pkg = Join-Path $Here "packages\webview2-$WebView2Version"

if (-not (Test-Path -LiteralPath (Join-Path $Pkg 'lib'))) {
    Write-Host "Telechargement du SDK WebView2 $WebView2Version..."
    New-Item -ItemType Directory -Force -Path $Pkg | Out-Null
    $zip = Join-Path $Pkg 'pkg.zip'
    Invoke-WebRequest -UseBasicParsing -Uri "https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2/$WebView2Version" -OutFile $zip
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::ExtractToDirectory($zip, $Pkg)
    Remove-Item -LiteralPath $zip
}

$lib = Get-ChildItem -LiteralPath (Join-Path $Pkg 'lib') -Directory | Where-Object { $_.Name -like 'net4*' } | Select-Object -First 1
if (-not $lib) { throw 'SDK WebView2 : dossier lib\net4* introuvable.' }
$core = Join-Path $lib.FullName 'Microsoft.Web.WebView2.Core.dll'
$winforms = Join-Path $lib.FullName 'Microsoft.Web.WebView2.WinForms.dll'
$loader = Join-Path $Pkg 'runtimes\win-x64\native\WebView2Loader.dll'

foreach ($f in @($core, $winforms, $loader)) { Copy-Item -LiteralPath $f -Destination $Root -Force }

$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$out = Join-Path $Root 'RENARD.mp3.exe'
$icon = Join-Path $Root 'assets\renard.ico'
$cscArgs = @(
    '/nologo', '/target:winexe', '/platform:x64', '/optimize+',
    "/out:$out",
    "/win32manifest:$(Join-Path $Here 'app.manifest')",
    '/r:System.Windows.Forms.dll', '/r:System.Drawing.dll', '/r:System.Web.Extensions.dll',
    '/r:System.IO.Compression.dll', '/r:System.IO.Compression.FileSystem.dll',
    "/r:$core", "/r:$winforms"
)
if (Test-Path -LiteralPath $icon) { $cscArgs += "/win32icon:$icon" }
$cscArgs += (Join-Path $Here 'RenardHost.cs')

& $csc @cscArgs
if ($LASTEXITCODE -ne 0) { throw "csc a echoue ($LASTEXITCODE)" }
Write-Host "OK : $out"
