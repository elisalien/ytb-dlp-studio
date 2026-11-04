"""Images pixel de l'installateur RENARD.mp3 (Inno Setup).

Genere dans desktop/out/ :
  wizard-164.bmp, wizard-328.bmp            grand bandeau a gauche (164 x 314, x2)
  wizard-small-55.bmp, wizard-small-110.bmp petite image en haut a droite
Paysage au crepuscule (ciel lavande / peche, montagnes en couches, colline,
etoiles), l'orbe de l'icone et le nom en lettres pixel.
Usage : python desktop/make_installer_art.py   (necessite Pillow)
"""
import math
import random
import sys
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "assets"))
import make_icon  # noqa: E402  (orbe et tete de renard)

OUT = HERE / "out"
BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]

# Lettres pixel 5 x 7 pour « RENARD.mp3 ».
GLYPHS = {
    "R": ["XXXX.", "X...X", "X...X", "XXXX.", "X.X..", "X..X.", "X...X"],
    "E": ["XXXXX", "X....", "X....", "XXXX.", "X....", "X....", "XXXXX"],
    "N": ["X...X", "XX..X", "X.X.X", "X..XX", "X...X", "X...X", "X...X"],
    "A": [".XXX.", "X...X", "X...X", "XXXXX", "X...X", "X...X", "X...X"],
    "D": ["XXXX.", "X...X", "X...X", "X...X", "X...X", "X...X", "XXXX."],
    ".": [".....", ".....", ".....", ".....", ".....", ".XX..", ".XX.."],
    "m": [".....", ".....", "XX.X.", "X.X.X", "X.X.X", "X.X.X", "X.X.X"],
    "p": [".....", ".....", "XXXX.", "X...X", "XXXX.", "X....", "X...."],
    "3": ["XXXX.", "....X", "....X", ".XXX.", "....X", "....X", "XXXX."],
}


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def band(t, x, y, n):
    v = max(0.0, min(1.0, t)) * (n - 1)
    lo = int(v)
    if lo < n - 1 and (v - lo) * 16 > BAYER[y % 4][x % 4] + 0.5:
        lo += 1
    return lo / (n - 1)


def text(img, s, x, y, color, shadow=None):
    for ch in s:
        rows = GLYPHS[ch]
        for j, row in enumerate(rows):
            for i, c in enumerate(row):
                if c == "X":
                    if shadow:
                        img.putpixel((x + i + 1, y + j + 1), shadow)
                    img.putpixel((x + i, y + j), color)
        x += len(rows[0]) + 1
    return x


def landscape(w, h):
    img = Image.new("RGB", (w, h))
    top, mid, hor = (52, 62, 108), (122, 110, 160), (238, 182, 166)
    horizon = int(h * 0.74)
    for y in range(h):
        for x in range(w):
            t = y / horizon
            c = lerp(top, mid, band(t / 0.6, x, y, 6)) if t < 0.6 else lerp(mid, hor, band((t - 0.6) / 0.4, x, y, 6))
            img.putpixel((x, y), c)
    rnd = random.Random(4)
    for _ in range(w * h // 90):
        x, y = rnd.randrange(w), rnd.randrange(int(h * 0.45))
        img.putpixel((x, y), lerp(img.getpixel((x, y)), (250, 244, 230), 0.4 + rnd.random() * 0.6))
    layers = [((150, 138, 180), 0.55, 0.16, 7), ((112, 108, 150), 0.64, 0.12, 9), ((86, 88, 124), 0.72, 0.09, 12)]
    for li, (col, base, amp, period) in enumerate(layers):
        rim = lerp(col, hor, 0.45)
        for x in range(w):
            v = (math.sin(x / period + li * 2) * 0.5 + math.sin(x / (period * 0.43) + li) * 0.3 + 0.8) / 1.6
            top_y = int(h * base - v * amp * h)
            for y in range(top_y, h):
                c = rim if y == top_y else lerp(col, (40, 44, 76), band((y - top_y) / (h - top_y), x, y, 4) * 0.6)
                img.putpixel((x, y), c)
    hill = (96, 120, 104)
    for x in range(w):
        top_y = int(h - 10 - 3 * math.exp(-((x - w * 0.3) / (w * 0.35)) ** 2) + math.sin(x / 5) * 0.7)
        for y in range(top_y, h):
            img.putpixel((x, y), lerp(hill, (150, 176, 140), 0.4) if y == top_y else lerp(hill, (50, 60, 64), band((y - top_y) / 10, x, y, 3) * 0.5))
    return img


def paste_icon(img, icon, x, y):
    img.paste(icon.convert("RGB"), (x, y), icon)


def wizard(scale):
    w, h = 82, 157
    img = landscape(w, h)
    icon = make_icon.make_big(48)
    paste_icon(img, icon, (w - 48) // 2, 18)
    # Nom en lettres pixel (59 px de large pour « RENARD.mp3 » : centre).
    width = sum(len(GLYPHS[c][0]) + 1 for c in "RENARD.mp3") - 1
    text(img, "RENARD.mp3", (w - width) // 2, 74, (250, 244, 233), shadow=(52, 46, 80))
    # Petite note et coeur.
    for (dx, dy) in [(0, 0), (1, 0), (0, 1), (1, 1), (2, -1), (2, -2), (2, -3), (3, -3)]:
        img.putpixel((60 + dx, 100 + dy), (244, 166, 200))
    return img.resize((w * 2 * scale, h * 2 * scale), Image.NEAREST)


def small(size):
    img = Image.new("RGB", (size, size), (250, 244, 233))
    if size >= 100:
        icon = make_icon.make_big(48).resize((96, 96), Image.NEAREST)
    else:
        icon = make_icon.make_big(48)
    paste_icon(img, icon, (size - icon.width) // 2, (size - icon.height) // 2)
    return img


def main():
    OUT.mkdir(exist_ok=True)
    wizard(1).save(OUT / "wizard-164.bmp")
    wizard(2).save(OUT / "wizard-328.bmp")
    small(55).save(OUT / "wizard-small-55.bmp")
    small(110).save(OUT / "wizard-small-110.bmp")
    print("OK :", OUT)


if __name__ == "__main__":
    main()
