"""Police pixel de RENARD.mp3 : sous-ensemble de GNU Unifont 15 (8x16 px).

Genere ui/pixel-font.css (polices WOFF2 en base64 : l'app reste 100 % locale).
Unifont est sous double licence SIL OFL 1.1 / GPL 2+ avec exception de police.
Usage : python assets/make_font.py [dossier_unifont]
  (necessite fonttools + brotli ; Debian/Ubuntu : paquet fonts-unifont)
"""
import base64
import io
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/usr/share/fonts/opentype/unifont")

# Latin de base + Latin-1 + Latin etendu A (oe, OE...), ponctuation typographique,
# fleches, formes et symboles utilises dans l'interface.
BMP = (list(range(0x20, 0x7F)) + list(range(0xA0, 0x180)) + list(range(0x2010, 0x2027))
       + [0x2030, 0x2039, 0x203A, 0x20AC, 0x2122, 0x2190, 0x2191, 0x2192, 0x2193, 0x21BB, 0x2212,
          0x2026, 0x2022, 0x25B2, 0x25B6, 0x25BC, 0x25C0, 0x25CF, 0x25CB, 0x2605, 0x2606, 0x2661,
          0x2665, 0x266A, 0x266B, 0x2713, 0x2714, 0x2715, 0x2716, 0x2726, 0x2727, 0x23F8, 0x23F9,
          0x2302, 0x2318, 0x2328, 0x2600, 0x263A, 0x263E, 0x2601, 0x2744, 0x2764])
UPPER = [0x1F3AC, 0x1F3B5, 0x1F3B6, 0x1F98A, 0x1F4C1, 0x1F4BE, 0x1F50A, 0x1F507, 0x2728]


def woff2(path, codes):
    font = TTFont(path)
    cmap = font.getBestCmap()
    codes = [c for c in codes if c in cmap]
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.name_IDs = ["*"]
    opts.notdef_outline = True
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=codes)
    sub.subset(font)
    font["name"].setName("Renard Pixel (Unifont 15)", 1, 3, 1, 0x409)
    buf = io.BytesIO()
    font.flavor = "woff2"
    font.save(buf)
    return base64.b64encode(buf.getvalue()).decode("ascii"), codes


def unicode_range(codes):
    return ", ".join("U+%X" % c for c in sorted(codes))


def main():
    base, _ = woff2(SRC / "unifont.otf", BMP)
    upper, ucodes = woff2(SRC / "unifont_upper.otf", UPPER)
    css = (
        "/* Police pixel de RENARD.mp3 : sous-ensemble de GNU Unifont 15.1 (unifoundry.com),\n"
        "   double licence SIL OFL 1.1 / GPL 2+ avec exception de police.\n"
        "   Fichier genere par assets/make_font.py : ne pas modifier a la main.\n"
        "   Nette a 16 px, 32 px, 48 px (grille 8x16). */\n"
        "@font-face { font-family: \"Renard Pixel\"; font-display: block;\n"
        "  src: url(data:font/woff2;base64," + base + ") format(\"woff2\"); }\n"
        "@font-face { font-family: \"Renard Pixel\"; font-display: block; unicode-range: " + unicode_range(ucodes) + ";\n"
        "  src: url(data:font/woff2;base64," + upper + ") format(\"woff2\"); }\n"
    )
    out = ROOT / "ui" / "pixel-font.css"
    out.write_text(css, encoding="ascii")
    print("OK", out, len(css) // 1024, "Ko")


if __name__ == "__main__":
    main()
