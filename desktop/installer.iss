; Installateur de RENARD.mp3 (Inno Setup 6).
; Installation par utilisateur dans %LOCALAPPDATA%\RENARD.mp3, sans droits admin.
; Livre l'app complete ET les outils (bin\ : yt-dlp, ffmpeg, ffprobe, deno) :
; elle marche hors ligne des le premier lancement.
;
; Prerequis (fait par .github/workflows/release.yml) :
;   1. desktop\build.ps1               -> RENARD.mp3.exe + DLL WebView2 a la racine
;   2. update.ps1                      -> bin\
;   3. python desktop\make_installer_art.py -> desktop\out\*.bmp
;   4. ISCC /DAppVersion=2.0.0 desktop\installer.iss -> RENARD-setup.exe
; La desinstallation ne touche jamais aux telechargements (Telechargements\RENARD.mp3).

#define AppName "RENARD.mp3"
#ifndef AppVersion
  #define AppVersion "2.0.0"
#endif
#ifndef OutDir
  #define OutDir "..\dist"
#endif

[Setup]
AppId={{39D2ED72-1A39-4A38-9FD9-4E76DB59C717}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher=elisalien
AppPublisherURL=https://github.com/elisalien/ytb-dlp-studio
AppComments=Fait avec amour pour Lucien
VersionInfoVersion={#AppVersion}
DefaultDirName={localappdata}\{#AppName}
DefaultGroupName={#AppName}
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir={#OutDir}
OutputBaseFilename=RENARD-setup
SetupIconFile=..\assets\renard.ico
UninstallDisplayIcon={app}\RENARD.mp3.exe
UninstallDisplayName={#AppName}
WizardStyle=modern
WizardImageFile=out\wizard-164.bmp,out\wizard-328.bmp
WizardSmallImageFile=out\wizard-small-55.bmp,out\wizard-small-110.bmp
WizardImageStretch=no
Compression=lzma2/max
SolidCompression=yes
; L'app ouverte bloque ses fichiers : on propose de la fermer.
AppMutex=Local\RENARD.mp3-instance
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "french"; MessagesFile: "compiler:Languages\French.isl"

[Messages]
french.WelcomeLabel1=Bienvenue dans RENARD.mp3
french.WelcomeLabel2=Le petit renard va s'installer sur cet ordinateur.%n%nIl télécharge les vidéos et la musique, les convertit, et veille sur toi pendant ce temps.%n%nTout reste sur ce PC.
french.FinishedHeadingLabel=Le renard est installé ♥

[Tasks]
Name: "desktopicon"; Description: "Créer un raccourci sur le Bureau"; GroupDescription: "Raccourcis :"

[Files]
Source: "..\RENARD.mp3.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\Microsoft.Web.WebView2.Core.dll"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\Microsoft.Web.WebView2.WinForms.dll"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\WebView2Loader.dll"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\index.html"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\server.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\update.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\version.txt"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\ui\*"; DestDir: "{app}\ui"; Flags: ignoreversion recursesubdirs
Source: "..\assets\*"; DestDir: "{app}\assets"; Excludes: "*.py"; Flags: ignoreversion recursesubdirs
Source: "..\bin\*"; DestDir: "{app}\bin"; Flags: ignoreversion recursesubdirs

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\RENARD.mp3.exe"; WorkingDir: "{app}"; IconFilename: "{app}\assets\renard.ico"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\RENARD.mp3.exe"; WorkingDir: "{app}"; IconFilename: "{app}\assets\renard.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\RENARD.mp3.exe"; Description: "lancer RENARD.mp3"; Flags: nowait postinstall skipifsilent

; Uniquement ce que l'app cree elle-meme dans son dossier. Les telechargements
; (Telechargements\RENARD.mp3 par defaut) ne sont jamais supprimes.
[UninstallDelete]
Type: filesandordirs; Name: "{app}\webview"
Type: filesandordirs; Name: "{app}\.backup"
Type: filesandordirs; Name: "{app}\bin"
Type: files; Name: "{app}\renard.ini"
Type: files; Name: "{app}\settings.json"

[Code]
const
  WebView2Guid = '{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}';

function WebView2Version(Root: Integer; Key: String): String;
begin
  Result := '';
  if not RegQueryStringValue(Root, Key + WebView2Guid, 'pv', Result) then Result := '';
  if Result = '0.0.0.0' then Result := '';
end;

function HasWebView2: Boolean;
begin
  Result :=
    (WebView2Version(HKLM, 'SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\') <> '') or
    (WebView2Version(HKLM, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\') <> '') or
    (WebView2Version(HKCU, 'Software\Microsoft\EdgeUpdate\Clients\') <> '');
end;

function InitializeSetup: Boolean;
var
  Code: Integer;
begin
  Result := True;
  if not HasWebView2 then
  begin
    if MsgBox('RENARD.mp3 a besoin du moteur « Microsoft Edge WebView2 Runtime », qui ne semble pas installé.' + #13#10#13#10 +
              'L''installation continue, mais l''app ne s''ouvrira qu''une fois WebView2 installé.' + #13#10#13#10 +
              'Ouvrir la page de téléchargement de Microsoft maintenant ?',
              mbConfirmation, MB_YESNO) = IDYES then
      ShellExec('open', 'https://go.microsoft.com/fwlink/p/?LinkId=2124703', '', '', SW_SHOWNORMAL, ewNoWait, Code);
  end;
end;
