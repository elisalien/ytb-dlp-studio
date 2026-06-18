@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ============================================================
echo    yt-dlp Studio - Mise a jour des outils
echo ============================================================
echo.
echo  Verifie et met a jour, uniquement si necessaire :
echo    - yt-dlp   (auto-mise a jour native)
echo    - Deno     (auto-mise a jour native)
echo    - FFmpeg   (re-telecharge seulement si une version plus recente existe)
echo.

if not exist "bin\yt-dlp.exe" (
    echo  Les outils ne sont pas installes.
    echo  Double-cliquez d'abord sur  install.bat
    echo.
    pause
    exit /b 1
)

set "PATH=%~dp0bin;%PATH%"
set "PS=powershell -NoProfile -ExecutionPolicy Bypass -Command"
set "TLS=[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12;$ProgressPreference='SilentlyContinue';"

echo [1/3] yt-dlp...
"%~dp0bin\yt-dlp.exe" --update
echo.

echo [2/3] Deno...
"%~dp0bin\deno.exe" upgrade
echo.

echo [3/3] FFmpeg...
%PS% "%TLS% $local = & '.\bin\ffmpeg.exe' -version 2>$null | Select-Object -First 1; if($local -match 'ffmpeg version (\S+)'){$lv=$matches[1]}else{$lv='inconnue'}; try{$rv=((Invoke-WebRequest -Uri 'https://www.gyan.dev/ffmpeg/builds/release-version' -UseBasicParsing).Content).Trim()}catch{$rv=''}; Write-Host ('       Version installee : ' + $lv); if(-not $rv){Write-Host '       Impossible de verifier la derniere version en ligne. FFmpeg conserve.'; exit 0}; Write-Host ('       Derniere version  : ' + $rv); if($lv -like ('*'+$rv+'*')){Write-Host '       FFmpeg est a jour.'; exit 0}; Write-Host '       Mise a jour de FFmpeg...'; Invoke-WebRequest -Uri 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip' -OutFile 'ffmpeg.zip'; Expand-Archive -Path 'ffmpeg.zip' -DestinationPath 'ffmpeg_tmp' -Force; Get-ChildItem -Path 'ffmpeg_tmp' -Recurse -Filter 'ffmpeg.exe' | Select-Object -First 1 | %% { Copy-Item $_.FullName 'bin\ffmpeg.exe' -Force }; Get-ChildItem -Path 'ffmpeg_tmp' -Recurse -Filter 'ffprobe.exe' | Select-Object -First 1 | %% { Copy-Item $_.FullName 'bin\ffprobe.exe' -Force }; Remove-Item 'ffmpeg.zip' -Force -EA SilentlyContinue; Remove-Item 'ffmpeg_tmp' -Recurse -Force -EA SilentlyContinue; Write-Host '       FFmpeg mis a jour.'"
echo.

echo ============================================================
echo    Mise a jour terminee.
echo ============================================================
echo.
pause
exit /b 0
