#!/usr/bin/env python3
"""Eye-verification render: draw the generated datasets onto the real texture.

CEO standing order is to look at every change with my own eyes. For a map that
means: before any UI exists, project the shipped data onto the shipped image and
check that fast-travel statues sit on land, tower bosses sit on their towers,
and a species' spawn cloud covers the biome it actually lives in.

Writes tools/.cache/qa_<name>.jpg — QA output, never shipped.

Run: python tools/qa_map_render.py [PalName ...]
"""
from __future__ import annotations

import base64
import re
import struct
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "tools" / ".cache"
DATA = ROOT / "mobile" / "src" / "data"
SIDE = 2048  # QA canvas; the shipped pyramid is 4096


def unpack(b64: str) -> list[tuple[float, float]]:
    raw = base64.b64decode(b64)
    return [
        (u / 65535.0, v / 65535.0)
        for u, v in struct.iter_unpack("<HH", raw)
    ]


def load_pois() -> dict[str, tuple[list, list]]:
    """layer id -> (points, per-point map index). Parsed from the generated TS."""
    src = (DATA / "mapPois.g.ts").read_text(encoding="utf-8")
    out = {}
    for block in re.finditer(
        r"id: '([a-z_]+)'.*?maps: '([^']*)',\s*pts: '([^']*)'", src, re.S
    ):
        layer, maps_b64, pts_b64 = block.groups()
        out[layer] = (unpack(pts_b64), list(base64.b64decode(maps_b64)))
    return out


def load_spawns(name: str) -> list[tuple[int, int, int, bool, list]]:
    src = (DATA / "mapSpawns.g.ts").read_text(encoding="utf-8")
    m = re.search(rf'^  {re.escape(chr(34) + name + chr(34))}: \[(.*?)^  \],', src, re.S | re.M)
    if not m:
        return []
    groups = []
    for g in re.finditer(
        r"\{ m: (\d+), lo: (\d+), hi: (\d+), night: (true|false), n: \d+, pts: '([^']*)' \}",
        m.group(1),
    ):
        mi, lo, hi, night, pts = g.groups()
        groups.append((int(mi), int(lo), int(hi), night == "true", unpack(pts)))
    return groups


def canvas(region: str) -> Image.Image:
    src = "palpagos.webp" if region == "palpagos" else "worldtree.webp"
    return Image.open(CACHE / src).convert("RGB").resize((SIDE, SIDE), Image.LANCZOS)


def dot(d: ImageDraw.ImageDraw, u: float, v: float, r: int, fill, outline=None) -> None:
    x, y = u * SIDE, v * SIDE
    d.ellipse([x - r, y - r, x + r, y + r], fill=fill, outline=outline, width=2)


def main() -> None:
    pois = load_pois()

    # 1. POI sanity: statues, towers, dungeons on Palpagos.
    img = canvas("palpagos")
    d = ImageDraw.Draw(img, "RGBA")
    for layer, colour, r in (
        ("dungeon", (120, 160, 255, 210), 3),
        ("fast_travel", (95, 230, 170, 235), 4),
        ("syndicate_tower", (255, 90, 90, 255), 9),
        ("alpha_pals", (240, 180, 65, 255), 7),
    ):
        pts, maps = pois.get(layer, ([], []))
        for (u, v), mi in zip(pts, maps):
            if mi == 0:
                dot(d, u, v, r, colour, (10, 20, 24, 255) if r > 5 else None)
    img.save(CACHE / "qa_pois.jpg", quality=90)
    print("wrote qa_pois.jpg — statues (green), towers (red), alphas (gold), dungeons (blue)")

    # 2. Spawn clouds for a few species with distinctive, checkable habitats.
    for name in sys.argv[1:] or ["Foxparks", "Penking", "Jormuntide", "Anubis"]:
        groups = load_spawns(name)
        if not groups:
            print(f"  {name}: no spawn data")
            continue
        for region_idx, region in ((0, "palpagos"), (1, "tree")):
            gs = [g for g in groups if g[0] == region_idx]
            if not gs:
                continue
            img = canvas(region)
            d = ImageDraw.Draw(img, "RGBA")
            for _, lo, hi, night, pts in gs:
                colour = (150, 130, 255, 170) if night else (95, 230, 210, 170)
                for u, v in pts:
                    dot(d, u, v, 5, colour)
            total = sum(len(g[4]) for g in gs)
            lv = f"Lv {min(g[1] for g in gs)}-{max(g[2] for g in gs)}"
            out = CACHE / f"qa_{name.replace(' ', '_')}_{region}.jpg"
            img.save(out, quality=90)
            print(f"  {name} [{region}]: {total} points, {lv} -> {out.name}")


if __name__ == "__main__":
    main()
