# yt-dlp Studio

Téléchargeur vidéo 4K / 8K et convertisseur local, piloté depuis le navigateur.
MP4 compatible, MP3, export HAP pour Resolume, extraction de frames — sans ligne de commande.

---

## RENARD.mp3 — l'app de bureau (Windows)

La même app dans sa propre fenêtre (WebView2), en pixel art : paysage de montagne qui suit l'heure du jour, et un petit renard qui dort, court pendant les téléchargements, joue pendant les conversions et laisse des petits mots doux.

**Installer** — téléchargez `RENARD-setup.exe` depuis la [dernière release](https://github.com/elisalien/ytb-dlp-studio/releases/latest) et lancez-le. Installation par utilisateur (pas de droits admin) dans `%LOCALAPPDATA%\RENARD.mp3`, outils inclus (yt-dlp, FFmpeg, Deno : fonctionne hors ligne dès le premier lancement), raccourcis Bureau et menu Démarrer. Les fichiers arrivent dans `Téléchargements\RENARD.mp3`. Nécessite Microsoft Edge WebView2 Runtime (présent sur Windows 10/11 à jour ; l'installateur prévient s'il manque).

**Utiliser** — collez un lien, puis **Vidéo** ou **MP3**. « plus… » affiche tous les formats, l'onglet Convertir, la destination et les options. `Ctrl + M` coupe le son.

**Mettre à jour** — l'app interroge les releases GitHub au lancement puis toutes les 12 h ; le renard brandit alors un panneau « nouvelle version ✦ », un clic installe et redémarre.

**Publier une version** — poussez un tag `v2.x` :

```bash
git tag v2.0.1
```

```bash
git push origin v2.0.1
```

Le workflow *Release* compile `RENARD.mp3.exe` (`desktop/build.ps1`), remplit `bin/` (`update.ps1`), construit `RENARD-setup.exe` (Inno Setup, `desktop/installer.iss`) et `RENARD-update.zip` (l'app sans `bin/`), et les joint à la release à côté des zips habituels. Le numéro du tag devient la version de l'app (`version.txt`).

---

## Fonctionnalités (Windows)

- **Téléchargement direct** — collez ou glissez vos liens, cliquez sur Télécharger : la progression s'affiche dans la file d'attente
- **Formats** — Compatible (H.264 · AAC · MP4), Ultime, 4K, 2K, Full HD, MP3, Frames PNG
- **VJ** — HAP / HAP Q (`.mov`) lus nativement par Resolume et Alley
- **Onglet Convertir** — conversion par lots de fichiers locaux, avec analyse de chaque fichier (résolution, durée, codecs)
  - Formats : MP4 H.264 / H.265, WebM VP9, ProRes 422, HAP / HAP Alpha / HAP Q, MP3, AAC, WAV, FLAC, GIF animé, séquence PNG
  - Réglages : qualité, largeur max, images par seconde, rotation, son (garder, normaliser, supprimer), extrait début / fin, dossier de sortie
  - Un téléchargement terminé s'envoie au convertisseur en un clic
- **Rangement automatique** — dossier par playlist, sous-dossier « Lot » pour plusieurs liens
- **Favori navigateur** — envoie la page vidéo courante vers Studio en un clic
- **Portable** — yt-dlp, FFmpeg et Deno dans `bin/`, mis à jour automatiquement au lancement

---

## Installation

**Windows** — téléchargez `yt-dlp-4k-windows.zip` depuis la [dernière release](https://github.com/elisalien/ytb-dlp-studio/releases/latest), décompressez, puis :

1. Lancez `install.bat` (SmartScreen : *Informations complémentaires* → *Exécuter quand même*)
2. Facultatif : `create-shortcut.bat` pour un raccourci sur le Bureau

**macOS / Linux** — dans `dist-mac/` ou `dist-linux/` (générateur de commandes, sans serveur) :

```bash
chmod +x install.sh launch.sh update.sh
bash install.sh
```

---

## Utilisation (Windows)

1. Lancez `launch.bat` : l'interface s'ouvre dans le navigateur (Firefox en priorité)
2. **Télécharger** — liens, format, dossier de destination → Télécharger (Ctrl + Entrée)
3. **Convertir** — fichiers, format, réglages → Convertir ; les résultats sont créés à côté des sources ou dans le dossier choisi

Une fenêtre « yt-dlp Studio - serveur » reste réduite dans la barre des tâches : c'est elle qui travaille.
Erreur 403 : laissez « Cookies du navigateur » activé avec Firefox connecté à YouTube.

---

## Mise à jour

Automatique au lancement (au plus toutes les 12 h). Pour forcer : `update.bat` / `update.sh`.
Seul ce qui est périmé est retéléchargé. FFmpeg utilise la build *full* de gyan.dev, la seule qui contient l'encodeur HAP.

---

## Structure

```
server.ps1        # serveur local : file d'attente yt-dlp / ffmpeg, API de la page
index.html        # interface
ui/               # paysage et renard (scene.js), sons (sound.js), coque (shell.js), styles
desktop/          # RENARD.mp3 : hôte WebView2 (RenardHost.cs, build.ps1), installateur
version.txt       # version de l'app de bureau
launch.bat        # démarre le serveur et ouvre l'interface
install.bat       # première installation (appelle update.ps1)
update.ps1/.bat   # installe ou met à jour yt-dlp, Deno, FFmpeg dans bin/
terminal.bat      # mode manuel : terminal prêt à coller une commande
extract-frames.bat, create-shortcut.*, assets/
dist-mac/, dist-linux/   # versions macOS et Linux
```

---

## Sécurité

- Le serveur écoute uniquement sur `127.0.0.1` et exige un jeton aléatoire injecté dans la page ; l'en-tête `Host` est vérifié (anti DNS rebinding)
- La page n'envoie jamais de ligne de commande : le serveur construit les arguments à partir d'options en liste blanche, sans shell
- Les titres de vidéos sont affichés via `textContent` uniquement (pas de XSS)
- Binaires téléchargés en HTTPS depuis les sites officiels

Usage personnel et légal uniquement. Respectez le droit d'auteur.

---

## Crédits

| Outil  | Licence   | Lien |
|--------|-----------|------|
| yt-dlp | Unlicense | https://github.com/yt-dlp/yt-dlp |
| FFmpeg | GPL/LGPL  | https://ffmpeg.org |
| Deno   | MIT       | https://deno.com |

| GNU Unifont (police pixel) | OFL 1.1 / GPL 2+ | https://unifoundry.com/unifont/ |

Version dossier : outils téléchargés à l'installation. `RENARD-setup.exe` les inclut tels quels.

---

made with ♥ by **elisalien** — pour Lucien
