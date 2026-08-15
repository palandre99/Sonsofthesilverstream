#!/usr/bin/env python3
"""Generate the Expo app assets for the Palforge sphere mark (pure stdlib).

The mark: an original pal-sphere-style orb — two-tone teal hemispheres,
thin band, small button, highlight arc. Deliberately NOT pokeball
proportions (no fat band, no big ringed center).

Outputs (mobile/assets/):
  icon.png          1024x1024 opaque   — iOS masks its own corners
  adaptive-icon.png 1024x1024 opaque   — Android foreground (safe zone)
  splash-icon.png   512x512  alpha     — orb only, for the splash screen
"""
import struct
import zlib
from pathlib import Path

BG = (12, 22, 24)         # #0C1618

# blue glass (from the in-game sphere: icy translucent blue)
BLUE_XL = (168, 226, 248)  # highlight ice
BLUE_L = (105, 196, 238)
BLUE_M = (52, 154, 214)
BLUE_D = (24, 96, 156)     # depth / rim

# gold ornament (filigree band + pole caps)
GOLD_L = (240, 205, 105)
GOLD_M = (216, 168, 62)
GOLD_D = (150, 108, 34)

OUT = Path(__file__).resolve().parent.parent / "assets"

import math

R = 36.0  # sphere radius in the 100x100 box; caps extend past the poles


def _cap(dx, dy):
    """Gold cone caps at the poles, like the game's sphere. Returns a color
    or None. Top cap is taller with a knob tip; bottom is a short cone."""
    # top: from above the sphere down onto its crown
    if -R - 9 <= dy <= -R + 8:
        h = dy - (-R - 9)              # 0 at the very tip
        half = 1.5 + h * 0.75          # widening cone
        if abs(dx) <= half:
            return GOLD_L if dx < -half * 0.2 else (GOLD_M if dx < half * 0.5 else GOLD_D)
    # bottom: shorter cone
    if R - 7 <= dy <= R + 8:
        h = (R + 8) - dy
        half = 1.2 + h * 0.62
        if abs(dx) <= half:
            return GOLD_M if dx < half * 0.3 else GOLD_D
    return None


def sphere_color(x, y):
    """Palforge mark at (x, y) in a 100x100 box, or None outside.

    The GAME's Pal Sphere: blue glass orb, gold swirl wrapped diagonally
    around it, gold cone caps at the poles. Deliberately NOT pokeball
    grammar — no horizontal band, no center button.
    """
    dx, dy = x - 50.0, y - 50.0

    cap = _cap(dx, dy)
    if cap is not None:
        return cap

    r2 = dx * dx + dy * dy
    if r2 > R * R:
        return None
    r = math.sqrt(r2)

    # diagonal gold swirl: rotate ~35deg, then an S-curved band
    c, sn = 0.819, 0.574
    u = dx * c + dy * sn
    v = -dx * sn + dy * c
    t = v - 7.0 * math.sin(u / 16.0)
    if abs(t) <= 5.0:
        if t < -1.8:
            return GOLD_L
        if t < 2.6:
            return GOLD_M
        return GOLD_D

    # rim depth
    if r >= R - 2.0:
        return BLUE_D
    # glass shading: ice highlight up-left, smoothly deeper away from it
    hx, hy = dx + 13.0, dy + 15.0
    hd = math.sqrt(hx * hx + hy * hy)
    if hd < 8.5:
        return BLUE_XL
    if hd < 19.0:
        return BLUE_L
    if hd > 44.0:
        return BLUE_D
    return BLUE_M


def png_bytes(width, height, rgba):
    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))
    raw = b"".join(
        b"\x00" + bytes(rgba[y * width * 4:(y + 1) * width * 4])
        for y in range(height)
    )
    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9))
            + chunk(b"IEND", b""))


def render(size, egg_scale, opaque_bg, out):
    ss = 3
    img = bytearray(size * size * 4)
    box = 100.0 / egg_scale
    off = (box - 100.0) / 2

    for py in range(size):
        for px in range(size):
            acc = [0, 0, 0, 0]
            for sy in range(ss):
                for sx in range(ss):
                    fx = (px * ss + sx + 0.5) / (size * ss) * box - off
                    fy = (py * ss + sy + 0.5) / (size * ss) * box - off
                    c = sphere_color(fx, fy)
                    if c is None:
                        if opaque_bg:
                            acc[0] += BG[0]; acc[1] += BG[1]; acc[2] += BG[2]; acc[3] += 255
                    else:
                        acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]; acc[3] += 255
            n = ss * ss
            a = acc[3] // n
            if a > 0:
                r, g, b = acc[0] // n, acc[1] // n, acc[2] // n
                # un-premultiply against the samples that actually hit
                hits = acc[3] / 255
                r, g, b = int(acc[0] / hits), int(acc[1] / hits), int(acc[2] / hits)
            else:
                r = g = b = 0
            i = (py * size + px) * 4
            img[i:i + 4] = bytes((min(r, 255), min(g, 255), min(b, 255), a))

    OUT.mkdir(exist_ok=True)
    (OUT / out).write_bytes(png_bytes(size, size, img))
    print(f"wrote assets/{out} ({size}x{size})")


if __name__ == "__main__":
    render(1024, 0.62, True, "icon.png")
    render(1024, 0.42, True, "adaptive-icon.png")
    render(512, 0.92, False, "splash-icon.png")
