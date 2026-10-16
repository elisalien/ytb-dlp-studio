# yt-dlp Studio

> Téléchargeur vidéo 4K / 8K et convertisseur local, piloté depuis le navigateur : MP4 compatible, MP3, export HAP pour Resolume, extraction de frames — sans ligne de commande.

![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-informational) ![Stack](https://img.shields.io/badge/stack-PowerShell%20%2B%20HTML-blue) ![Resolume](https://img.shields.io/badge/export-HAP%20%2F%20Resolume-purple)

**[Télécharger la dernière release](https://github.com/elisalien/ytb-dlp-studio/releases/latest)**

<p align="center"><img src="assets/icon-source.png" width="160" alt="Icône yt-dlp Studio"></p>

## À propos

Interface locale, dans le navigateur, au-dessus de yt-dlp et FFmpeg : on colle des liens, on choisit un format, et un petit serveur local fait le travail. Pensé aussi pour les VJ, avec l'export HAP / HAP Q lu nativement par Resolume et Alley. Portable : yt-dlp, FFmpeg et Deno sont téléchargés dans `bin/` et rien n'est installé ailleurs sur le PC. Fait pour Lucien.

## Fonctionnalités

Version Windows (application complète) :

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

Versions macOS / Linux (`dist-mac/`, `dist-linux/`) : générateur de commandes sans serveur — l'interface construit la commande yt-dlp ou ffmpeg, à copier puis coller dans le Terminal. Compatible Intel et Apple Silicon (macOS), x86_64 et ARM64 (Linux).

## Installation

**Windows** — téléchargez `yt-dlp-4k-windows.zip` depuis la [dernière release](https://github.com/elisalien/ytb-dlp-studio/releases/latest), décompressez, puis :

1. Lancez `install.bat` (SmartScreen : *Informations complémentaires* → *Exécuter quand même*)
2. Facultatif : `create-shortcut.bat` pour un raccourci sur le Bureau

**macOS / Linux** — dans `dist-mac/` ou `dist-linux/` (générateur de commandes, sans serveur) :

```bash
chmod +x install.sh launch.sh update.sh
bash install.sh
```

### Mise à jour

Automatique au lancement (au plus toutes les 12 h). Pour forcer : `update.bat` / `update.sh`.
Seul ce qui est périmé est retéléchargé. FFmpeg utilise la build *full* de gyan.dev, la seule qui contient l'encodeur HAP.

## Utilisation

1. Lancez `launch.bat` : l'interface s'ouvre dans le navigateur (Firefox en priorité)
2. **Télécharger** — liens, format, dossier de destination → Télécharger (Ctrl + Entrée)
3. **Convertir** — fichiers, format, réglages → Convertir ; les résultats sont créés à côté des sources ou dans le dossier choisi

Une fenêtre « yt-dlp Studio - serveur » reste réduite dans la barre des tâches : c'est elle qui travaille.
Erreur 403 : laissez « Cookies du navigateur » activé avec Firefox connecté à YouTube.

Mode manuel : Options avancées → « Commande équivalente » → Copier, puis collez-la dans `terminal.bat`.

Le mode d'emploi détaillé est dans [LISEZ-MOI.txt](LISEZ-MOI.txt) (Windows), [dist-mac/LISEZ-MOI.txt](dist-mac/LISEZ-MOI.txt) et [dist-linux/LISEZ-MOI.txt](dist-linux/LISEZ-MOI.txt).

### Sécurité

- Le serveur écoute uniquement sur `127.0.0.1` et exige un jeton aléatoire injecté dans la page ; l'en-tête `Host` est vérifié (anti DNS rebinding)
- La page n'envoie jamais de ligne de commande : le serveur construit les arguments à partir d'options en liste blanche, sans shell
- Les titres de vidéos sont affichés via `textContent` uniquement (pas de XSS)
- Binaires téléchargés en HTTPS depuis les sites officiels

Usage personnel et légal uniquement. Respectez le droit d'auteur.

## Structure du projet

```
server.ps1        # serveur local : file d'attente yt-dlp / ffmpeg, API de la page
index.html        # interface
launch.bat        # démarre le serveur et ouvre l'interface
install.bat       # première installation (appelle update.ps1)
update.ps1/.bat   # installe ou met à jour yt-dlp, Deno, FFmpeg dans bin/
terminal.bat      # mode manuel : terminal prêt à coller une commande
extract-frames.bat, create-shortcut.*, assets/
dist-mac/, dist-linux/   # versions macOS et Linux
```

Les archives `yt-dlp-4k-windows.zip`, `yt-dlp-4k-mac.zip` et `yt-dlp-4k-linux.zip` sont produites par le workflow GitHub Actions `.github/workflows/release.yml` à chaque tag `v*`.

## Stack technique

PowerShell (serveur local), HTML / CSS / JavaScript (interface), Batch et Bash (lanceurs et scripts d'installation), yt-dlp, FFmpeg (build *full* de gyan.dev), Deno, GitHub Actions.

## Crédits & licence

| Outil  | Licence   | Lien |
|--------|-----------|------|
| yt-dlp | Unlicense | https://github.com/yt-dlp/yt-dlp |
| FFmpeg | GPL/LGPL  | https://ffmpeg.org |
| Deno   | MIT       | https://deno.com |

Non redistribués : téléchargés à l'installation.

made with ♥ by **elisalien** — pour Lucien

Aucune licence n'est spécifiée pour yt-dlp Studio — tous droits réservés.

---

<p align="center">
  Fait par <a href="https://github.com/elisalien">Élisalien</a> ·
  <a href="https://gitlab.com/elisalien/catalog">Catalogue des shaders, sources & logiciels</a>
</p>
