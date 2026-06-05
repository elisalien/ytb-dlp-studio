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
REM
REM Toute la detection se fait DANS PowerShell (un seul appel) :
REM   1) navigateur par defaut lu dans le registre (choix de l'utilisateur),
REM   2) repli sur Edge, puis Chrome, puis Firefox,
REM   3) dernier recours : application associee aux .html.
REM On evite volontairement "for /f (`...`)" : les parentheses du script
REM PowerShell cassent le parseur de cmd ("was unexpected at this time").
powershell -NoProfile -ExecutionPolicy Bypass -Command "$page='%~dp0index.html'; $exe=$null; $p=(Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\https\UserChoice' -EA SilentlyContinue).ProgId; if($p){$c=(Get-ItemProperty ('Registry::HKEY_CLASSES_ROOT\'+$p+'\shell\open\command') -EA SilentlyContinue).'(default)'; if($c -match '\"([^\"]+\.exe)\"'){$exe=$matches[1]}}; if(-not ($exe -and (Test-Path $exe))){foreach($cand in @(\"$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe\",\"${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe\",\"$env:ProgramFiles\Google\Chrome\Application\chrome.exe\",\"$env:ProgramFiles\Mozilla Firefox\firefox.exe\")){if(Test-Path $cand){$exe=$cand;break}}}; if($exe){Start-Process $exe $page}else{Start-Process $page}"

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
