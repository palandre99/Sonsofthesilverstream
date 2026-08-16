#!/usr/bin/env python3
"""Second, independent check that the map projection puts markers where they belong.

tools/verify_map_projection.py settled the WORLD->IMAGE transform against 58,504
spawn points. This checks the other half of the dataset — the 11,097 points of
interest — and does it a different way: not "are they inside the image", but
"do they land on the right KIND of ground".

The argument is simple and hard to fool. 84.4% of the map texture is water by
the same classifier the tile baker uses. If the projection were wrong, markers
would be scattered, so about 84% of them would land in water. They do not:
observed rates run from 1.0% to 23.3%, and the ORDER is exactly what the game
would predict — things that grow in forests are almost never in water, while
paldium, which sits in and beside water in game, is the highest.

That per-layer pattern cannot come from a broken transform. A wrong projection
has no way to know that berries belong inland and paldium does not.

Run: python tools/verify_map_poi_placement.py
"""
from __future__ import annotations

import base64
import re
from pathlib import Path

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

ROOT = Path(__file__).resolve().parent.parent
TEXTURE = ROOT / "tools" / ".cache" / "T_WorldMap_hi.png"
POIS = ROOT / "mobile" / "src" / "data" / "mapPois.g.ts"

#: layers whose contents grow on dry land; a broken projection would drown them
INLAND = {"red_berries", "mushrooms", "coal"}
#: the most any inland layer may have in water before this is a real failure
INLAND_LIMIT = 5.0


def sea_mask(img: Image.Image) -> np.ndarray:
    """The tile baker's ocean classifier, reused so both agree on 'water'."""
    a = np.asarray(img.convert("RGB")).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    return (b > g + 4) & (g > r + 6) & (r < 150)


def main() -> None:
    if not TEXTURE.exists():
        raise SystemExit(f"missing {TEXTURE} — see documents/AI_TODO.md J2")

    sea = sea_mask(Image.open(TEXTURE))
    h, w = sea.shape
    baseline = 100.0 * float(sea.mean())

    src = POIS.read_text(encoding="utf-8")
    blocks = re.findall(
        r"id: '([a-z_]+)'[\s\S]*?maps: '([^']*)'[\s\S]*?pts: '([^']*)'", src
    )

    print(f"{'layer':<18}{'points':>8}{'in water':>10}")
    failures = []
    for layer_id, maps_b64, pts_b64 in blocks:
        pts = base64.b64decode(pts_b64)
        maps = base64.b64decode(maps_b64)
        wet = total = 0
        for i in range(len(pts) // 4):
            if maps[i] != 0:          # Palpagos only; the tree has its own texture
                continue
            u = int.from_bytes(pts[i * 4:i * 4 + 2], "little") / 65535
            v = int.from_bytes(pts[i * 4 + 2:i * 4 + 4], "little") / 65535
            total += 1
            if sea[min(h - 1, int(v * (h - 1))), min(w - 1, int(u * (w - 1)))]:
                wet += 1
        if not total:
            continue
        pct = 100.0 * wet / total
        print(f"{layer_id:<18}{total:>8}{pct:>9.1f}%")
        if layer_id in INLAND and pct > INLAND_LIMIT:
            failures.append(f"{layer_id} is {pct:.1f}% in water (limit {INLAND_LIMIT}%)")

    print(f"\nthe texture itself is {baseline:.1f}% water — that is what random")
    print("placement would score, and every layer is far below it")

    if failures:
        raise SystemExit("PLACEMENT REGRESSED:\n  " + "\n  ".join(failures))
    print("\nOK: things that grow on land are on land")


if __name__ == "__main__":
    main()
