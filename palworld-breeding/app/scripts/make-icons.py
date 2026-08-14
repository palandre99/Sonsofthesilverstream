#!/usr/bin/env python3
"""Generate the PWA PNG icons (192/512/maskable) from the HatchLab egg mark.

Pure stdlib — a tiny PNG writer plus supersampled rasterization of the same
egg the sidebar logo draws (app.tsx): bottom circle r=13 centred (16,24),
tapering to a point at (16,2), crack zigzag 10,22 14,26 17,20 20,25 22,22
in a 32x40 viewBox. Colors are the dark-theme tokens.

Run from app/:  python scripts/make-icons.py
"""
import struct
import zlib
from pathlib import Path

BG = (12, 22, 24)        # --bg dark
EGG = (63, 193, 201)     # --accent
CRACK = (12, 22, 24)     # crack shows the background through the shell

OUT = Path(__file__).resolve().parent.parent / "public"


def png_bytes(width: int, height: int, rgba: bytearray) -> bytes:
    def chunk(tag: bytes, data: bytes) -> bytes:
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


CRACK_PTS = [(10, 22), (14, 26), (17, 20), (20, 25), (22, 22)]


def seg_dist(px: float, py: float, ax: float, ay: float, bx: float, by: float) -> float:
    vx, vy = bx - ax, by - ay
    wx, wy = px - ax, py - ay
    L2 = vx * vx + vy * vy
    t = 0.0 if L2 == 0 else max(0.0, min(1.0, (wx * vx + wy * vy) / L2))
    dx, dy = px - (ax + t * vx), py - (ay + t * vy)
    return (dx * dx + dy * dy) ** 0.5


def inside_egg(x: float, y: float) -> bool:
    """(x, y) in the 32x40 logo coordinate space."""
    cx, cy, r = 16.0, 24.0, 13.0
    if y >= cy:
        return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
    if y < 2.0:
        return False
    # top: half-ellipse (vertical radius cy-2) — blunt like a real egg
    u = (cy - y) / (cy - 2.0)
    half = r * (1.0 - u * u) ** 0.5
    return abs(x - cx) <= half


def on_crack(x: float, y: float, w: float) -> bool:
    return any(
        seg_dist(x, y, *CRACK_PTS[i], *CRACK_PTS[i + 1]) <= w
        for i in range(len(CRACK_PTS) - 1)
    )


def render(size: int, egg_scale: float, rounded: bool, out: str) -> None:
    ss = 4  # supersampling
    S = size * ss
    img = bytearray(size * size * 4)
    # logo space is 32 wide x 40 high; fit by height
    box_h = 40.0 / egg_scale
    box_w = box_h  # square canvas in logo units
    off_x = (box_w - 32.0) / 2
    off_y = (box_h - 40.0) / 2
    corner = size * (0.22 if rounded else 0.0)
    crack_w = 1.15

    for py in range(size):
        for px in range(size):
            hits = 0
            crack_hits = 0
            for sy in range(ss):
                for sx in range(ss):
                    fx = (px * ss + sx + 0.5) / S * box_w - off_x
                    fy = (py * ss + sy + 0.5) / S * box_h - off_y
                    if inside_egg(fx, fy):
                        if on_crack(fx, fy, crack_w):
                            crack_hits += 1
                        else:
                            hits += 1
            total = ss * ss
            bg_hits = total - hits - crack_hits
            r = (EGG[0] * hits + CRACK[0] * crack_hits + BG[0] * bg_hits) / total
            g = (EGG[1] * hits + CRACK[1] * crack_hits + BG[1] * bg_hits) / total
            b = (EGG[2] * hits + CRACK[2] * crack_hits + BG[2] * bg_hits) / total
            a = 255
            if rounded and corner:
                # rounded-rect alpha mask
                x0 = min(px + 0.5, size - px - 0.5)
                y0 = min(py + 0.5, size - py - 0.5)
                if x0 < corner and y0 < corner:
                    d = ((corner - x0) ** 2 + (corner - y0) ** 2) ** 0.5
                    if d > corner:
                        a = 0
                    elif d > corner - 1.5:
                        a = int(255 * (corner - d) / 1.5)
            i = (py * size + px) * 4
            img[i:i + 4] = bytes((int(r), int(g), int(b), a))

    (OUT / out).write_bytes(png_bytes(size, size, img))
    print(f"wrote public/{out} ({size}x{size})")


if __name__ == "__main__":
    render(192, 0.72, True, "icon-192.png")
    render(512, 0.72, True, "icon-512.png")
    # maskable: the egg stays inside the 80% safe zone, background bleeds
    render(512, 0.52, False, "icon-maskable-512.png")
