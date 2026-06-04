# 🎬 yt-dlp 4K Pro Generator

> Interface graphique simple pour générer des commandes **yt-dlp** de téléchargement vidéo haute qualité (4K / 8K), avec fusion audio/vidéo automatique, conversion MP3 et export VJ (codec HAP pour Resolume / Alley).

Aucune ligne de commande à connaître : on colle ses liens, on choisit la qualité, on copie la commande, on la colle dans le terminal fourni. Tout est portable et reste dans le dossier de l'outil.

---

## ✨ Fonctionnalités

- 📥 **Téléchargement multi-URLs** — une ou plusieurs vidéos d'un coup (une URL par ligne).
- 🌟 **Qualité au choix** — Ultra (4K/8K sans limite), 4K (2160p), 2K (1440p), Full HD (1080p).
- 🎵 **Audio seul** — extraction MP3 en qualité maximale.
- 🎛️ **Export VJ** — ré-encodage en codec **HAP** / **HAP Q** (`.mov`) lu nativement par Resolume Arena/Avenue et Alley.
- 📚 **Playlists** — téléchargement complet avec sous-dossier par playlist.
- 📁 **Rangement automatique** — les vidéos atterrissent dans un dossier `Téléchargements/` créé tout seul.
- 🔌 **100 % portable** — yt-dlp et FFmpeg sont téléchargés dans un sous-dossier `bin/` ; rien n'est installé ailleurs sur le PC.

---

## 📦 Prérequis

- **Windows** 10 / 11
- Une **connexion internet** (uniquement pour la première installation)

Aucune installation manuelle de yt-dlp ou FFmpeg : le script s'en charge.

---

## 🚀 Installation

> À faire **une seule fois**.

1. Téléchargez ce dépôt (bouton **Code → Download ZIP**) et décompressez-le, ou clonez-le :
   ```bash
   git clone https://github.com/elisalien/ytb-dlp-generator.git
   ```
2. Ouvrez le dossier `dist/`.
3. Double-cliquez sur **`install.bat`**.
   - Il télécharge automatiquement depuis les **sites officiels** : yt-dlp et FFmpeg, dans le sous-dossier `bin/`.
   - Si Windows SmartScreen apparaît : *Informations complémentaires* → *Exécuter quand même*.

> Pour **mettre à jour** les outils plus tard, relancez simplement `install.bat`.

---

## 🕹️ Utilisation

1. Double-cliquez sur **`launch.bat`**.
   - L'interface s'ouvre directement dans votre navigateur.
   - Une fenêtre « Terminal » noire s'ouvre aussi : **c'est là que les vidéos se téléchargent** (ne la fermez pas).
2. Dans l'interface :
   - Collez vos liens YouTube (un par ligne).
   - Laissez le champ **FFmpeg** vide (il est déjà inclus).
   - Choisissez la **qualité** et, si besoin, cochez **playlist**.
   - Cliquez sur **Copier la commande**.
3. Cliquez dans la fenêtre « Terminal », faites un **clic droit** (= coller), puis **Entrée**.
4. La vidéo est enregistrée dans `dist/Téléchargements/`.

---

## 🛠️ Comment ça marche

```
dist/
├── install.bat     # Télécharge yt-dlp + FFmpeg dans bin/
├── launch.bat      # Ouvre l'interface + un terminal prêt à l'emploi
├── index.html      # L'interface : génère la commande yt-dlp
└── bin/            # Outils téléchargés (non versionnés)
```

- `index.html` **ne télécharge rien lui-même** : c'est un générateur de commande. Il construit la ligne `yt-dlp …` adaptée à vos choix.
- La page s'ouvre directement en local (`file://`) — **aucun serveur requis**. Le bouton « Copier » utilise l'API presse-papier moderne quand elle est disponible, avec un repli `execCommand` qui fonctionne en double-clic.
- Le téléchargement réel est fait par `yt-dlp` + `FFmpeg` dans le terminal, sur **votre** machine.

---

## 🔐 Sécurité

- **Aucun serveur, aucun port ouvert** — l'interface tourne en local (`file://`) ; rien n'écoute sur le réseau.
- **Anti-injection** — l'interface n'accepte que de vraies URLs `http(s)` et retire tout guillemet / saut de ligne des entrées, pour qu'une « URL » piégée ne puisse pas injecter de commande shell dans le terminal au moment du collage.
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

---

<p align="center">made with ♥ by <b>elisalien</b> — pour Lucien</p>
