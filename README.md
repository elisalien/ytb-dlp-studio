# 🎬 yt-dlp Studio

> Interface graphique minimaliste pour générer des commandes **yt-dlp** (téléchargement vidéo haute qualité 4K / 8K, fusion audio/vidéo, MP3, export VJ HAP) **et** des commandes **FFmpeg** pour monter un dossier d'images (frames) en vidéo.

Aucune ligne de commande à connaître : on colle ses liens (ou on choisit un dossier de frames), on sélectionne un profil, on copie la commande, on la colle dans le terminal fourni. Tout est portable et reste dans le dossier de l'outil.

---

## ✨ Fonctionnalités

- 🧭 **Deux modes** — un onglet **Télécharger** et un onglet **Frames → vidéo**, dans une interface unique.
- 🛡️ **Compatibilité maximale (par défaut)** — profil **H.264 · AAC · MP4** sélectionné d'office : la vidéo se lit partout (mobiles, lecteurs anciens, logiciels de montage).
- 📥 **Téléchargement multi-URLs** — une ou plusieurs vidéos d'un coup (une URL par ligne).
- 🌟 **Qualité au choix** — Ultime (4K/8K sans limite), 4K (2160p), 2K (1440p), Full HD (1080p).
- 🎞️ **Frames → vidéo** — fusionne un **dossier d'images** (PNG, JPEG, TIFF, BMP, EXR) en vidéo, avec choix du débit d'images (fps) et du format de sortie : **MP4 compatibilité maximale**, **ProRes 422 HQ** ou **HAP** (VJ).
- 🎵 **Audio seul** — extraction MP3 en qualité maximale.
- 🎛️ **Export VJ** — ré-encodage en codec **HAP** / **HAP Q** (`.mov`) lu nativement par Resolume Arena/Avenue et Alley.
- 📚 **Playlists** — téléchargement complet avec sous-dossier par playlist.
- 📁 **Rangement automatique** — les vidéos atterrissent dans `Téléchargements/` ; les montages dans le dossier des images.
- 🔌 **100 % portable** — yt-dlp, FFmpeg et Deno sont téléchargés dans un sous-dossier `bin/` ; rien n'est installé ailleurs sur le PC.

---

## 📦 Prérequis

- **Windows** 10 / 11
- Une **connexion internet** (uniquement pour la première installation)

Aucune installation manuelle de yt-dlp, FFmpeg ou Deno : le script s'en charge.

---

## 🚀 Installation

> À faire **une seule fois**.

1. Téléchargez ce dépôt (bouton **Code → Download ZIP**) et décompressez-le, ou clonez-le :
   ```bash
   git clone https://github.com/elisalien/ytb-dlp-generator.git
   ```
2. Ouvrez le dossier `dist/`.
3. Double-cliquez sur **`install.bat`**.
   - Il télécharge automatiquement depuis les **sites officiels** : yt-dlp, FFmpeg et Deno, dans le sous-dossier `bin/`.
   - Si Windows SmartScreen apparaît : *Informations complémentaires* → *Exécuter quand même*.

> Pour **mettre à jour** les outils plus tard, relancez simplement `install.bat`.

---

## 🕹️ Utilisation

1. Double-cliquez sur **`launch.bat`**.
   - L'interface s'ouvre directement dans votre navigateur.
   - Une fenêtre « Terminal » noire s'ouvre aussi : **c'est là que les vidéos se téléchargent** (ne la fermez pas).
2. Dans l'interface, onglet **⬇️ Télécharger** :
   - Collez vos liens YouTube (un par ligne).
   - Choisissez un **profil** (par défaut : *Compatibilité maximale*) et, si besoin, cochez **playlist**.
   - Cliquez sur **Copier la commande**.
   - *(Le champ **FFmpeg**, dans « Options avancées », reste vide : il est déjà inclus.)*
3. Cliquez dans la fenêtre « Terminal », faites un **clic droit** (= coller), puis **Entrée**.
4. La vidéo est enregistrée dans `dist/Téléchargements/`.

### 🎞️ Monter un dossier d'images en vidéo

1. Dans l'interface, onglet **🎞️ Frames → vidéo**.
2. Renseignez le **dossier des images**, le **format** (PNG, JPEG…), le **nommage**, les **images/seconde** et le **format de sortie**.
   - **Séquence** (`0001`, `0002`, …) fonctionne sur **toutes les plateformes** ; **Noms libres** (glob) est réservé à **macOS / Linux**.
3. Copiez la commande, collez-la dans le Terminal, puis **Entrée**.
4. La vidéo (`montage.mp4` par défaut) est créée **dans le dossier des images**.

---

## 🛠️ Comment ça marche

```
dist/
├── install.bat     # Télécharge yt-dlp + FFmpeg + Deno dans bin/
├── launch.bat      # Ouvre l'interface + un terminal prêt à l'emploi
├── index.html      # L'interface : génère la commande yt-dlp
└── bin/            # Outils téléchargés (non versionnés)
```

- `index.html` **ne télécharge rien lui-même** : c'est un générateur de commande. Il construit la ligne `yt-dlp …` (téléchargement) ou `ffmpeg …` (montage de frames) adaptée à vos choix.
- La page s'ouvre directement en local (`file://`) — **aucun serveur requis**. Le bouton « Copier » utilise l'API presse-papier moderne quand elle est disponible, avec un repli `execCommand` qui fonctionne en double-clic.
- Le téléchargement réel est fait par `yt-dlp` + `FFmpeg` dans le terminal, sur **votre** machine.
- **Deno** est présent dans `bin/` uniquement comme **moteur JavaScript** : yt-dlp l'utilise pour extraire les formats YouTube haute qualité (sans lui, YouTube est dégradé à ~1080p). Il **ne tourne pas en serveur** — yt-dlp le lance ponctuellement lui-même, car `launch.bat` ajoute `bin/` au PATH.

---

## 🔐 Sécurité

- **Aucun serveur, aucun port ouvert** — l'interface tourne en local (`file://`) ; rien n'écoute sur le réseau.
- **Anti-injection shell renforcé** — la commande générée est destinée à être collée dans un terminal. À l'intérieur de guillemets doubles, un shell Unix (bash/zsh) interprète **encore** `$(…)`, les backticks `` ` `` et `$VAR` : retirer seulement les guillemets **ne suffit pas**. L'interface neutralise donc, selon le contexte, **tous** les métacaractères réellement dangereux :
  - **URLs** : validation `http(s)` stricte, puis suppression des espaces, guillemets (`"` `'`), backtick, `$`, `\` et `< > |` — aucun n'est légitime dans une URL bien formée, donc les vrais liens ne sont pas altérés (les `&`, `?`, `%` des URL YouTube sont conservés).
  - **Chemins** (dossier de frames, FFmpeg) : suppression de `$`, backtick, guillemets et d'un `\` final (qui pourrait échapper le guillemet fermant).
  - **Nom de sortie** : liste blanche stricte (`A-Z a-z 0-9 . _ -`).
  - **fps** : entier borné (1–240).
  - Aucune donnée utilisateur n'est insérée en HTML via `innerHTML` (uniquement `textContent`) → pas de XSS.
- **Téléchargements officiels en HTTPS** — `install.bat` force TLS 1.2 et récupère les binaires depuis les dépôts officiels uniquement.

---

## ⚠️ Avertissement

Cet outil est destiné à un usage **personnel et légal**. Respectez les conditions d'utilisation des plateformes et le droit d'auteur. Vous êtes responsable des contenus que vous téléchargez.

---

## 📜 Crédits & licences

Cet outil télécharge et utilise des logiciels tiers gratuits (**non redistribués** ici) :

| Outil   | Rôle                                   | Licence    | Lien |
|---------|----------------------------------------|------------|------|
| yt-dlp  | Téléchargeur vidéo                      | Unlicense  | <https://github.com/yt-dlp/yt-dlp> |
| FFmpeg  | Fusion audio/vidéo, conversion MP3/HAP | GPL/LGPL   | <https://ffmpeg.org> |
| Deno    | Moteur JavaScript pour l'extraction YouTube | MIT     | <https://deno.com> |

---

<p align="center">made with ♥ by <b>elisalien</b> — pour Lucien</p>
