#!/usr/bin/env python3
"""Generate the Expo app assets from the HatchLab egg mark (pure stdlib).

Outputs (all in mobile/assets/):
  icon.png          1024x1024 opaque   — iOS masks its own corners
  adaptive-icon.png 1024x1024 alpha    — Android foreground (egg in safe zone)
  splash-icon.png   512x625 alpha      — egg only, on the splash background color

Same geometry as app/scripts/make-icons.py: bottom circle r=13 centred (16,24)
in a 32x40 box, elliptical top, crack 10,22 14,26 17,20 20,25 22,22.
"""
import struct
import zlib
from pathlib import Path

BG = (12, 22, 24)        # #0C1618
EGG = (63, 193, 201)     # #3FC1C9
CRACK = (12, 22, 24)

OUT = Path(__file__).resolve().parent.parent / "assets"
CRACK_PTS = [(10, 22), (14, 26), (17, 20), (20, 25), (22, 22)]


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


def seg_dist(px, py, ax, ay, bx, by):
    vx, vy = bx - ax, by - ay
    wx, wy = px - ax, py - ay
    L2 = vx * vx + vy * vy
    t = 0.0 if L2 == 0 else max(0.0, min(1.0, (wx * vx + wy * vy) / L2))
    dx, dy = px - (ax + t * vx), py - (ay + t * vy)
    return (dx * dx + dy * dy) ** 0.5


def inside_egg(x, y):
    cx, cy, r = 16.0, 24.0, 13.0
    if y >= cy:
        return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
    if y < 2.0:
        return False
    u = (cy - y) / (cy - 2.0)
    half = r * (1.0 - u * u) ** 0.5
    return abs(x - cx) <= half


def on_crack(x, y, w):
    return any(
        seg_dist(x, y, *CRACK_PTS[i], *CRACK_PTS[i + 1]) <= w
        for i in range(len(CRACK_PTS) - 1)
    )


def render(w_px, h_px, egg_scale, transparent_bg, out):
    ss = 3
    img = bytearray(w_px * h_px * 4)
    # logo space fitted by height; centred horizontally
    box_h = 40.0 / egg_scale
    box_w = box_h * (w_px / h_px)
    off_x = (box_w - 32.0) / 2
    off_y = (box_h - 40.0) / 2
    crack_w = 1.15

    for py in range(h_px):
        for px in range(w_px):
            hits = crack_hits = 0
            for sy in range(ss):
                for sx in range(ss):
                    fx = (px * ss + sx + 0.5) / (w_px * ss) * box_w - off_x
                    fy = (py * ss + sy + 0.5) / (h_px * ss) * box_h - off_y
                    if inside_egg(fx, fy):
                        if on_crack(fx, fy, crack_w):
                            crack_hits += 1
                        else:
                            hits += 1
            total = ss * ss
            bg_hits = total - hits - crack_hits
            if transparent_bg:
                # crack shows through to transparency
                a = round(255 * hits / total)
                r, g, b = EGG
            else:
                r = (EGG[0] * hits + CRACK[0] * crack_hits + BG[0] * bg_hits) / total
                g = (EGG[1] * hits + CRACK[1] * crack_hits + BG[1] * bg_hits) / total
                b = (EGG[2] * hits + CRACK[2] * crack_hits + BG[2] * bg_hits) / total
                a = 255
            i = (py * w_px + px) * 4
            img[i:i + 4] = bytes((int(r), int(g), int(b), int(a)))

    OUT.mkdir(exist_ok=True)
    (OUT / out).write_bytes(png_bytes(w_px, h_px, img))
    print(f"wrote assets/{out} ({w_px}x{h_px})")


if __name__ == "__main__":
    render(1024, 1024, 0.66, False, "icon.png")
    render(1024, 1024, 0.44, False, "adaptive-icon.png")   # Android safe zone
    render(512, 625, 0.94, True, "splash-icon.png")
