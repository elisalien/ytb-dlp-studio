@echo off
chcp 65001 >nul
cd /d "%~dp0"

REM Ajoute le dossier bin au PATH : yt-dlp et ffmpeg deviennent accessibles
REM dans le terminal et sont herites par les fenetres ouvertes ci-dessous.
set "PATH=%~dp0bin;%PATH%"

REM Verifie que install.bat a bien ete lance
if not exist "bin\yt-dlp.exe" goto :missing
if not exist "bin\deno.exe"   goto :missing

REM Demarre le mini serveur local (necessaire pour le bouton Copier).
REM Securite : permissions Deno limitees au strict minimum :
REM   --allow-read="%~dp0"        -> lecture du seul dossier de l'outil (pour index.html)
REM   --allow-net=127.0.0.1:8000  -> ecoute uniquement en local, port 8000
start "yt-dlp - serveur (ne pas fermer)" /min "%~dp0bin\deno.exe" run --allow-read="%~dp0" --allow-net=127.0.0.1:8000 "%~dp0server.ts"

REM Laisse le serveur demarrer, puis ouvre l'interface dans le navigateur
timeout /t 2 /nobreak >nul
start "" http://localhost:8000

REM Ouvre un terminal pret a l'emploi : collez la commande generee ici
start "yt-dlp - COLLEZ VOTRE COMMANDE ICI (clic droit = coller)" cmd /k "cd /d "%~dp0" && echo. && echo === Collez la commande copiee (clic droit pour coller) puis Entree === && echo === Les videos seront enregistrees dans ce dossier. === && echo."

exit /b 0

:missing
echo.
echo  Les dependances ne sont pas installees.
echo  Double-cliquez d'abord sur  install.bat
echo.
pause
exit /b 1
