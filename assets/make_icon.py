"""Icone pixel art kawaii pastel de yt-dlp Studio : petite tele qui avale une fleche.

Genere yt-dlp-studio.ico (16 a 256 px) et icon-source.png (1024 px) dans ce dossier.
Chaque taille est un multiple entier d'une grille dessinee a la main : pixels nets partout.
Usage : python assets/make_icon.py   (necessite Pillow)
"""
from pathlib import Path
from PIL import Image

ASSETS = Path(__file__).parent

PALETTE = {
    ".": (0, 0, 0, 0),
    "O": (90, 74, 110, 255),    # contour prune doux
    "E": (90, 74, 110, 255),    # yeux / bouche
    "P": (255, 198, 220, 255),  # corps rose
    "p": (247, 168, 198, 255),  # ombre rose
    "C": (255, 247, 238, 255),  # ecran creme
    "B": (255, 173, 200, 255),  # joues
    "M": (168, 236, 210, 255),  # fleche menthe
    "W": (255, 255, 255, 255),  # reflet
}

ICON32 = [
    "................................",
    ".............OOOOOO.............",
    ".............OMMMMO.............",
    ".............OMMMMO.............",
    ".............OMMMMO.............",
    ".........OOOOOMMMMOOOOO.........",
    ".........OMMMMMMMMMMMMO.........",
    "..........OMMMMMMMMMMO..........",
    "...........OMMMMMMMMO...........",
    "....OOOOOOOOOMMMMMMOOOOOOOOO....",
    "...OPPPPPPPPPOMMMMOPPPPPPPPPO...",
    "..OPPPPPPPPPPPOMMOPPPPPPPPPPPO..",
    "..OPPPPPPPPPPPPOOPPPPPPPPPPPPO..",
    "..OPPPPOOOOOOOOOOOOOOOOOOPPPPO..",
    "..OPPPOCCCCCCCCCCCCCCCCCCOPPPO..",
    "..OPPPOCWWCCCCCCCCCCCCCCCOPPPO..",
    "..OPPPOCWCCCCCCCCCCCCCCCCOPPPO..",
    "..OPPPOCCCCCCCCCCCCCCCCCCOPPPO..",
    "..OPPPOCCCCEECCCCCCEECCCCOPPPO..",
    "..OPPPOCCCCEECCCCCCEECCCCOPPPO..",
    "..OPPPOCCCCEECCCCCCEECCCCOPPPO..",
    "..OPPPOCCBBCCCECCECCCBBCCOPPPO..",
    "..OPPPOCCCCCCCCEECCCCCCCCOPPPO..",
    "..OPPPOCCCCCCCCCCCCCCCCCCOPPPO..",
    "..OPPPOCCCCCCCCCCCCCCCCCCOPPPO..",
    "..OPPPPOOOOOOOOOOOOOOOOOOPPPPO..",
    "..OPPPPPPPPPPPPPPPPPPPPPPPPPPO..",
    "...OppppppppppppppppppppppppO...",
    "....OOOOOOOOOOOOOOOOOOOOOOOO....",
    ".......OpO............OpO.......",
    ".......OOO............OOO.......",
    "................................",
]

# 24 px : taille de la barre des taches a 100 %.
ICON24 = [
    ".........OOOOOO.........",
    ".........OMMMMO.........",
    "......OOOOMMMMOOOO......",
    "......OMMMMMMMMMMO......",
    ".......OMMMMMMMMO.......",
    "..OOOOOOOMMMMMMOOOOOOO..",
    ".OPPPPPPPOMMMMOPPPPPPPO.",
    "OPPPPPPPPPOMMOPPPPPPPPPO",
    "OPPPPPPPPPPOOPPPPPPPPPPO",
    "OPPPOOOOOOOOOOOOOOOOPPPO",
    "OPPOCCCCCCCCCCCCCCCCOPPO",
    "OPPOCWCCCCCCCCCCCCCCOPPO",
    "OPPOCCCCEECCCCEECCCCOPPO",
    "OPPOCCCCEECCCCEECCCCOPPO",
    "OPPOCCBBCCECCECCBBCCOPPO",
    "OPPOCCCCCCCEECCCCCCCOPPO",
    "OPPOCCCCCCCCCCCCCCCCOPPO",
    "OPPOCCCCCCCCCCCCCCCCOPPO",
    "OPPPOOOOOOOOOOOOOOOOPPPO",
    "OPPPPPPPPPPPPPPPPPPPPPPO",
    ".OppppppppppppppppppppO.",
    "..OOOOOOOOOOOOOOOOOOOO..",
    ".....OpO........OpO.....",
    ".....OOO........OOO.....",
]

# 16 px : une reduction de la grille 32 perdrait le visage.
ICON16 = [
    "......OOOO......",
    "......OMMO......",
    "....OMMMMMMO....",
    ".OOOOOMMMMOOOOO.",
    "OPPPPPOMMOPPPPPO",
    "OPPPPPPOOPPPPPPO",
    "OPPOOOOOOOOOOPPO",
    "OPPOCCCCCCCCOPPO",
    "OPPOCECCCCECOPPO",
    "OPPOCECCCCECOPPO",
    "OPPOBCCEECCBOPPO",
    "OPPOCCCCCCCCOPPO",
    "OPPOOOOOOOOOOPPO",
    ".OppppppppppppO.",
    "..OOOOOOOOOOOO..",
    "...OO......OO...",
]


def render(rows, scale):
    size = len(rows)
    assert all(len(r) == size for r in rows), [len(r) for r in rows]
    img = Image.new("RGBA", (size, size))
    img.putdata([PALETTE[ch] for row in rows for ch in row])
    return img.resize((size * scale, size * scale), Image.NEAREST)


def main():
    sizes = {16: render(ICON16, 1), 24: render(ICON24, 1), 32: render(ICON32, 1),
             48: render(ICON24, 2), 64: render(ICON32, 2), 128: render(ICON32, 4), 256: render(ICON32, 8)}
    order = sorted(sizes)
    sizes[256].save(ASSETS / "yt-dlp-studio.ico", format="ICO", sizes=[(s, s) for s in order],
                    append_images=[sizes[s] for s in order if s != 256])
    render(ICON32, 32).save(ASSETS / "icon-source.png", optimize=True)
    print("Icone generee :", ", ".join(f"{s}px" for s in order))


if __name__ == "__main__":
    main()
