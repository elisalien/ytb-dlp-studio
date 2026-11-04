@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ============================================================
echo    yt-dlp Studio - Installation des outils
echo ============================================================
echo.
echo        *      .             .          *       .
echo            .           _____           .
echo     .            _.--""     ""--._         *
echo          *     .'   o   o   o     '.      .
echo        _.----._/_______________________\_.----._
echo       '--..__________________________________..--'
echo            *    \^|   \^|   \^|   \^|   \^|   /      .
echo         .        \^|    \^|   \^|   \^|    /     *
echo      *       .     '.   made with love   .'      .
echo            .          by elisalien - a Lucien
echo        *       .            *          .       *
echo.
echo  Ce script telecharge depuis les sites officiels :
echo    - yt-dlp   (telechargeur video)
echo    - FFmpeg   (fusion video/audio, conversions MP4/MP3/HAP)
echo    - Deno     (moteur JavaScript requis par YouTube)
echo.
echo  Tout est installe dans le sous-dossier "bin".
echo  Une connexion internet est requise.
echo.
pause
echo.

REM Meme script que update.bat : il installe ce qui manque.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0update.ps1"

if not exist "bin\yt-dlp.exe" goto :error
if not exist "bin\ffmpeg.exe" goto :error
if not exist "bin\deno.exe"   goto :error

echo.
echo  Creation du raccourci "yt-dlp Studio" sur le Bureau...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0create-shortcut.ps1"

echo.
echo ============================================================
echo    Installation terminee.
echo    Double-cliquez sur le raccourci "yt-dlp Studio" du Bureau
echo    (ou sur launch.bat dans ce dossier).
echo ============================================================
echo.
pause
exit /b 0

:error
echo.
echo  *** ERREUR pendant le telechargement ou l'extraction. ***
echo  Verifiez votre connexion internet puis relancez install.bat
echo.
pause
exit /b 1
