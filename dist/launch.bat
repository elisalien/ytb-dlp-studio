@echo off
chcp 65001 >nul
cd /d "%~dp0"

REM Ajoute le dossier bin au PATH : yt-dlp et ffmpeg deviennent accessibles
REM dans le terminal et sont herites par les fenetres ouvertes ci-dessous.
set "PATH=%~dp0bin;%PATH%"

REM Verifie que install.bat a bien ete lance
if not exist "bin\yt-dlp.exe" goto :missing

REM Ouvre l'interface directement dans le navigateur (aucun serveur necessaire :
REM le bouton Copier fonctionne meme en local grace au repli execCommand).
start "" "%~dp0index.html"

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
