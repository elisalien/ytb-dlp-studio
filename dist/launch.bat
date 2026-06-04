@echo off
chcp 65001 >nul
cd /d "%~dp0"

REM Ajoute le dossier bin au PATH : yt-dlp et ffmpeg deviennent accessibles
REM dans le terminal et sont herites par les fenetres ouvertes ci-dessous.
set "PATH=%~dp0bin;%PATH%"

REM Verifie que install.bat a bien ete lance
if not exist "bin\yt-dlp.exe" goto :missing

REM Ouvre l'interface dans un VRAI navigateur (et non l'editeur eventuellement
REM associe aux fichiers .html). Aucun serveur necessaire : le bouton Copier
REM fonctionne meme en local grace au repli execCommand.
set "PAGE=%~dp0index.html"

REM 1) Navigateur par defaut, detecte via le registre (respecte le choix utilisateur)
set "BROWSER="
for /f "usebackq delims=" %%B in (`powershell -NoProfile -Command "$p=(Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\https\UserChoice' -EA SilentlyContinue).ProgId; if($p){$c=(Get-ItemProperty ('Registry::HKEY_CLASSES_ROOT\'+$p+'\shell\open\command') -EA SilentlyContinue).'(default)'; if($c -match '\"([^\"]+\.exe)\"'){$matches[1]}}"`) do set "BROWSER=%%B"
if defined BROWSER if exist "%BROWSER%" ( start "" "%BROWSER%" "%PAGE%" & goto :opened )

REM 2) Replis explicites : Edge (toujours present sur Win10/11), puis Chrome, puis Firefox
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if exist "%EDGE%" ( start "" "%EDGE%" "%PAGE%" & goto :opened )

set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if exist "%CHROME%" ( start "" "%CHROME%" "%PAGE%" & goto :opened )

set "FIREFOX=%ProgramFiles%\Mozilla Firefox\firefox.exe"
if not exist "%FIREFOX%" set "FIREFOX=%ProgramFiles(x86)%\Mozilla Firefox\firefox.exe"
if exist "%FIREFOX%" ( start "" "%FIREFOX%" "%PAGE%" & goto :opened )

REM 3) Dernier recours : application associee aux .html
start "" "%PAGE%"
:opened

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
