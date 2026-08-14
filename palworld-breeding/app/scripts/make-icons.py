#!/usr/bin/env python3
"""Generate the PWA icons for the Palforge sphere mark (pure stdlib).

The mark: an original stylized capture-sphere — teal orb, dark equator band,
dark center ring with a teal button. Flat, geometric, ours (not the game's
sphere asset).

Outputs (app/public/):
  icon.png          1024x1024 opaque   — iOS masks its own corners
  adaptive-icon.png 1024x1024 opaque   — Android foreground (safe zone)
  splash-icon.png   512x512  alpha     — orb only, for the splash screen
"""
import struct
import zlib
from pathlib import Path

BG = (12, 22, 24)        # #0C1618
TEAL = (63, 193, 201)    # #3FC1C9
DARK = (12, 22, 24)      # band + ring, same as bg for a die-cut look

OUT = Path(__file__).resolve().parent.parent / "public"


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


def sphere_color(x, y):
    """Color of the mark at (x, y) in a 100x100 box, or None outside.

    Geometry: orb center (50,50) R=40; equator band half-height 7.5;
    center ring outer r=15.5, button r=9.
    """
    dx, dy = x - 50.0, y - 50.0
    r2 = dx * dx + dy * dy
    if r2 > 40.0 * 40.0:
        return None
    if dx * dx + dy * dy <= 9.0 * 9.0:
        return TEAL                    # button
    if r2 <= 15.5 * 15.5:
        return DARK                    # ring around the button
    if abs(dy) <= 7.5:
        return DARK                    # equator band
    return TEAL                        # shell


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
    render(192, 0.62, True, "icon-192.png")
    render(512, 0.62, True, "icon-512.png")
    render(512, 0.42, True, "icon-maskable-512.png")
