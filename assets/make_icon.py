"""Icone de RENARD.mp3 : orbe brillant facon Frutiger Aero / Vista, en pixel art.

Orbe aqua -> vert d'eau avec reflet blanc en arc et ombre douce, tete de renard
pixel au centre, pastille chromee en bas a droite avec un triangle lecture et une
note. Les petites tailles (16, 24, 32) sont simplifiees : tete + note.

Genere dans ce dossier :
  renard.ico          16, 24, 32, 48, 64, 128, 256 px
  renard-source.png   1024 px (grille 64 agrandie x16, pixels nets)
Les anciens yt-dlp-studio.ico / icon-source.png restent pour mac et linux.
Usage : python assets/make_icon.py   (necessite Pillow)
"""
from pathlib import Path

from PIL import Image

ASSETS = Path(__file__).parent

# Matrice de Bayer 4x4 : tramage ordonne entre deux teintes (rendu pixel, pas de flou).
BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]

FOX_COLORS = {
    "O": (74, 38, 34, 255),     # contour brun
    "F": (240, 138, 60, 255),   # pelage orange
    "f": (206, 100, 46, 255),   # ombre orange
    "h": (255, 184, 112, 255),  # reflet orange
    "W": (255, 246, 232, 255),  # creme
    "w": (236, 220, 204, 255),  # ombre creme
    "K": (43, 29, 26, 255),     # yeux, nez
    "P": (247, 176, 190, 255),  # interieur des oreilles
    "B": (255, 170, 170, 255),  # joues
    "L": (255, 255, 255, 255),  # eclat des yeux
}

# Demi-tetes (cote gauche), recopiees en miroir. Une ligne = une rangee de pixels.
FOX_L = [  # 24 x 20 -> tailles 48 a 256
    "..OO........",
    ".OhFO.......",
    ".OhPFO......",
    ".OFPPFO.....",
    ".OFPPFFOOOOO",
    ".OFPPFhhhhFF",
    "OFFPFhFFFFFF",
    "OFFFFFFFFFFF",
    "OFFFFFFFFFFF",
    "OFFFLKFFFFFF",
    "OFFFKKFFFFFF",
    "OWFFFFFFFFFF",
    "OWBWFFFFFFFF",
    ".OWWWWFFFFFW",
    "..OWWWWWWWWW",
    "...OwWWWWWWW",
    "....OwWWWWWW",
    ".....OOwWWWK",
    "......OOOwWW",
    ".........OOO",
]
FOX_M = [  # 16 x 13 -> 32
    ".OO.....",
    ".OPO....",
    ".OPFOOOO",
    "OFFFhhFF",
    "OFFFFFFF",
    "OFLKFFFF",
    "OFKKFFFF",
    "OWBFFFFF",
    ".OWWFFFW",
    "..OWWWWW",
    "...OwWWW",
    "....OOWK",
    "......OO",
]
FOX_S = [  # 10 x 7 -> 16, 24
    "OO...",
    "OPOOO",
    "OFFFF",
    "OKFFF",
    "OWFFF",
    ".OWWW",
    "..OOK",
]

NOTE_S = [  # croche 4 x 6
    "..XX",
    "..XX",
    "..X.",
    "..X.",
    "XXX.",
    "XX..",
]
NOTE_L = [  # croche 6 x 9
    "...XXX",
    "...XXX",
    "...X.X",
    "...X..",
    "...X..",
    ".XXX..",
    "XXXX..",
    "XXXX..",
    ".XX...",
]
PLAY = [  # triangle lecture 5 x 7
    "X....",
    "XXX..",
    "XXXX.",
    "XXXXX",
    "XXXX.",
    "XXX..",
    "X....",
]


def mirror(half):
    """Recopie la demi-tete en miroir ; l'eclat des yeux reste en haut a gauche."""
    return [r + r[::-1].replace("KL", "LK") for r in half]


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))


def quant(t, x, y, steps):
    """Gradient quantifie en `steps` bandes, tramage Bayer entre deux bandes."""
    v = max(0.0, min(1.0, t)) * (steps - 1)
    lo = int(v)
    frac = v - lo
    if lo < steps - 1 and frac * 16 > BAYER[y % 4][x % 4] + 0.5:
        lo += 1
    return lo / (steps - 1)


def put(img, x, y, color):
    if 0 <= x < img.width and 0 <= y < img.height and color[3] > 0:
        base = img.getpixel((x, y))
        a = color[3] / 255
        if base[3] == 0:
            img.putpixel((x, y), color)
        else:
            img.putpixel((x, y), tuple(round(color[i] * a + base[i] * (1 - a)) for i in range(3)) + (max(base[3], color[3]),))


def stamp(img, rows, ox, oy, palette, scale=1):
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch in palette:
                for dy in range(scale):
                    for dx in range(scale):
                        put(img, ox + x * scale + dx, oy + y * scale + dy, palette[ch])


def orb(n, cx, cy, r, steps):
    """Orbe aqua -> vert d'eau, contour sombre, lueur basse et arc brillant blanc."""
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    top, bottom = (138, 232, 240), (36, 160, 128)
    rim = (22, 104, 98, 255)

    # Ombre portee douce (deux anneaux) sous l'orbe.
    sh_y, sh_rx, sh_ry = cy + r * 0.92, r * 0.8, max(1.5, r * 0.16)
    for y in range(n):
        for x in range(n):
            d = ((x + 0.5 - cx) / sh_rx) ** 2 + ((y + 0.5 - sh_y) / sh_ry) ** 2
            if d < 1:
                put(img, x, y, (20, 60, 70, 90 if d < 0.45 else 45))

    for y in range(n):
        for x in range(n):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            d = (dx * dx + dy * dy) ** 0.5
            if d > r:
                continue
            if d > r - 1:
                img.putpixel((x, y), rim)
                continue
            t = quant((dy + r) / (2 * r), x, y, steps)
            c = lerp(top, bottom, t)
            # Lueur claire en bas (reflet de la lumiere a travers le verre).
            glow = max(0.0, (dy / r) - 0.35) * 1.4 * max(0.0, 1 - abs(dx) / (r * 0.85))
            if glow > 0:
                c = lerp(c, (190, 255, 230), quant(glow, x, y, 3) * 0.7)
            img.putpixel((x, y), c + (255,))

    # Arc brillant : ellipse en haut, opacite decroissante vers le bas.
    hx, hy, hrx, hry = cx, cy - r * 0.5, r * 0.7, r * 0.38
    for y in range(n):
        for x in range(n):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            if (dx * dx + dy * dy) ** 0.5 > r - 1.6:
                continue
            e = ((x + 0.5 - hx) / hrx) ** 2 + ((y + 0.5 - hy) / hry) ** 2
            if e < 1:
                t = (y + 0.5 - (hy - hry)) / (2 * hry)
                a = quant(1 - t, x, y, 4)
                if a > 0:
                    put(img, x, y, (255, 255, 255, round(25 + 200 * a)))
    return img


def badge(img, cx, cy, r):
    """Pastille chromee avec triangle lecture et note."""
    for y in range(img.height):
        for x in range(img.width):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            d = (dx * dx + dy * dy) ** 0.5
            if d > r:
                continue
            if d > r - 1:
                img.putpixel((x, y), (70, 86, 102, 255))
                continue
            t = quant((dy + r) / (2 * r), x, y, 5)
            c = lerp((255, 255, 255), (150, 166, 182), t)
            # Bande sombre au milieu : effet metal poli.
            if abs(dy) < r * 0.12:
                c = lerp(c, (120, 136, 152), 0.35)
            if dy < -r * 0.35 and abs(dx) < r * 0.6:
                c = lerp(c, (255, 255, 255), 0.6)
            img.putpixel((x, y), c + (255,))
    ink = {"X": (26, 122, 150, 255)}
    pink = {"X": (232, 92, 150, 255)}
    s = max(1, round(r / 11))
    pw, nw = 5 * s, 6 * s
    gap = s
    total = pw + gap + nw
    ox = round(cx - total / 2)
    stamp(img, PLAY, ox, round(cy - 3.5 * s), ink, s)
    stamp(img, NOTE_L, ox + pw + gap, round(cy - 4.5 * s), pink, s)


def make_big(n):
    """Tailles 48 a 256 : grille de n/scale pixels."""
    grid = 64 if n >= 64 else 48
    scale = n // grid
    g = orb(grid, grid / 2, grid * 0.47, grid * 0.42, 6)
    fox = mirror(FOX_L)
    stamp(g, fox, (grid - 24) // 2, round(grid * 0.47 - 9), FOX_COLORS)
    if grid == 64:
        badge(g, 50.5, 50.5, 11.5)
    else:
        badge(g, 38, 38, 9.5)
    return g.resize((n, n), Image.NEAREST)


def make_small(n):
    g = orb(n, n / 2, n * 0.47, n * 0.44 if n > 16 else n * 0.47, 4)
    white = {"X": (255, 255, 255, 255)}
    pink = {"X": (232, 92, 150, 255)}
    if n >= 32:
        fox = mirror(FOX_M)
        stamp(g, fox, (n - 16) // 2, round(n * 0.47 - 6.5), FOX_COLORS)
        stamp(g, NOTE_S, n - 7, n - 9, pink)
    else:
        fox = mirror(FOX_S)
        stamp(g, fox, (n - 10) // 2, round(n * 0.47 - 3.5), FOX_COLORS)
        stamp(g, NOTE_S, n - 5, n - 7, white if n < 20 else pink)
    return g


def main():
    images = {}
    for n in (16, 24, 32):
        images[n] = make_small(n)
    for n in (48, 64, 128, 256):
        images[n] = make_big(n)
    order = [256, 128, 64, 48, 32, 24, 16]
    images[256].save(ASSETS / "renard.ico", format="ICO", sizes=[(s, s) for s in order],
                     append_images=[images[s] for s in order[1:]])
    make_big(64).resize((1024, 1024), Image.NEAREST).save(ASSETS / "renard-source.png", optimize=True)
    # Planche de controle (non versionnee) : python assets/make_icon.py --sheet
    import sys
    if "--sheet" in sys.argv:
        sheet = Image.new("RGBA", (600, 300), (240, 236, 228, 255))
        x = 10
        for s in [16, 24, 32, 48, 64, 128, 256]:
            sheet.alpha_composite(images[s], (x, 10))
            sheet.alpha_composite(images[s].resize((s * (4 if s <= 32 else 2 if s <= 64 else 1),) * 2, Image.NEAREST), (x, 280 - s * (4 if s <= 32 else 2 if s <= 64 else 1)))
            x += max(s * (4 if s <= 32 else 2 if s <= 64 else 1), s) + 10
            if x > 600:
                break
        sheet.save(ASSETS.parent / "icon-sheet.png")
    print("OK :", ASSETS / "renard.ico")


if __name__ == "__main__":
    main()
