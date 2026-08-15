#!/usr/bin/env python3
"""Generate the Palforge DEV icon variants from the shipped Palforge icons.

WHY: once app.config.js gave the development build its own bundle id, both
apps can sit on the CEO's home screen at the same time. With the same artwork
on both, the only difference is the label underneath — too easy to tap the
wrong one. This stamps an orange DEV band across the bottom of the dev icons.

The band spans the full width so iOS's rounded-corner mask can clip its
corners without ever touching the lettering, which stays centred.

Inputs  (mobile/assets/):  icon.png, adaptive-icon.png
Outputs (mobile/assets/):  icon-dev.png, adaptive-icon-dev.png

Run:  python scripts/make-dev-icon.py
Re-run after any change to the base icons, then rebuild — icons are native,
so an OTA update can never change them.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ASSETS = Path(__file__).resolve().parent.parent / "assets"

BAND_RGBA = (255, 159, 28, 255)   # #FF9F1C — the dev accent used on the install hub
TEXT_RGB = (26, 18, 4)            # #1A1204
BAND_FRACTION = 0.24              # share of the icon height taken by the band
LABEL = "DEV"

# Windows ships these; the last entry is a portable fallback.
FONT_CANDIDATES = [
    r"C:\Windows\Fonts\arialbd.ttf",
    r"C:\Windows\Fonts\seguibl.ttf",
    r"C:\Windows\Fonts\segoeuib.ttf",
    r"C:\Windows\Fonts\calibrib.ttf",
    "DejaVuSans-Bold.ttf",
]


def load_font(px: int):
    for path in FONT_CANDIDATES:
        try:
            return ImageFont.truetype(path, px)
        except OSError:
            continue
    raise SystemExit(
        "No bold TrueType font found. Add one to FONT_CANDIDATES in "
        "scripts/make-dev-icon.py and re-run."
    )


def stamp(src_name: str, out_name: str) -> None:
    src = ASSETS / src_name
    if not src.exists():
        raise SystemExit(f"missing input: {src}")

    img = Image.open(src).convert("RGBA")
    w, h = img.size
    band_h = int(h * BAND_FRACTION)
    band_top = h - band_h

    draw = ImageDraw.Draw(img)
    draw.rectangle([0, band_top, w, h], fill=BAND_RGBA)

    # Size the label to ~62% of the band height, then centre it on real metrics
    # (ascender/descender padding makes naive centring sit visibly high).
    font = load_font(max(8, int(band_h * 0.62)))
    left, top, right, bottom = draw.textbbox((0, 0), LABEL, font=font)
    x = (w - (right - left)) / 2 - left
    y = band_top + (band_h - (bottom - top)) / 2 - top
    draw.text((x, y), LABEL, font=font, fill=TEXT_RGB)

    out = ASSETS / out_name
    img.save(out, "PNG")
    print(f"wrote {out.name}  ({w}x{h}, band {band_h}px)")


if __name__ == "__main__":
    stamp("icon.png", "icon-dev.png")
    stamp("adaptive-icon.png", "adaptive-icon-dev.png")
