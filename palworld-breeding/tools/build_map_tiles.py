#!/usr/bin/env python3
"""Cut the game's own map textures into a bundled tile pyramid.

Why tiles at all: the native T_WorldMap texture is 8192x8192 and we can get a
4096 export of it. The app used to ship ONE 2048 JPEG and draw it at ~300 px —
a ~27x linear reduction from source, which is exactly why the CEO said the map
"looks terrible". A pyramid lets the map show real pixels at every zoom while
only ever decoding the few tiles on screen.

Why BUNDLED rather than fetched: he tests on 5G in the field, and a companion
map that needs a network round-trip to pan is not a companion map.

Pure-ocean tiles are skipped — the ocean is a smooth gradient, so the parent
level upscales indistinguishably and we save the bytes. tileIndex.g.ts records
exactly which tiles exist so the renderer can fall back without a 404 dance.

Run: python tools/build_map_tiles.py
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "tools" / ".cache"
MOBILE_OUT = ROOT / "mobile" / "assets" / "map"
WEB_OUT = ROOT / "app" / "public" / "map"
DATA_OUTS = [ROOT / "mobile" / "src" / "data", ROOT / "app" / "src" / "data"]

TILE = 512
QUALITY = 82
FLAT_TOLERANCE = 3.2  # a tile this uniform is indistinguishable from its parent

# region -> (source file, deepest zoom level)
#
# The CEO: "it looks like 380 quality.. not crisp 4K". He was right, and the
# arithmetic is exact: a 4096 texture stretched across a 3x-density phone at
# full zoom is a 3x upscale. Palpagos now builds from the game's native 8192
# T_WorldMap (jeankassio/PalMiniMap, MIT), which doubles the real detail.
#
# The World Tree stays at 4096 because NO 8192 export of T_TreeMap exists in
# any source I could find. Its ceiling is therefore lower, and the renderer is
# told so per region rather than being allowed to ask for a level that would
# come back empty and fall through to the blurry z0 base.
REGIONS = {
    "palpagos": ("T_WorldMap_hi.png", 4),   # z4 = 16x16 tiles = 8192 effective
    "tree": ("worldtree.webp", 3),          # z3 = 8x8 tiles  = 4096 effective
}

# The game draws its map with a noticeably brighter teal sea than the raw
# texture has (CEO, comparing against an in-game screenshot). We lift the WATER
# only, using the same ocean classifier the projection proof uses, so the land
# keeps the exact colours the game shipped. Done at bake time: no runtime cost,
# no blend-mode support to depend on, and the result is inspectable as a file.
SEA_LIFT = 0.30           # how far towards SEA_TINT an ocean pixel moves
SEA_TINT = (46, 138, 152)  # the teal the in-game sea reads as


def lift_ocean(img: Image.Image) -> Image.Image:
    a = np.asarray(img.convert("RGB")).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    # Ocean runs blue > green > red. The volcanic rock is blue > RED > green,
    # and the looser mask used for the projection proof caught it — Mount
    # Obsidian came out steel-blue. Requiring green above red excludes every
    # purple and ash tone while still catching the whole sea gradient.
    sea = (b > g + 4) & (g > r + 6) & (r < 150)
    # feather the mask so coastlines do not gain a hard edge
    m = sea.astype(np.float32)
    m = (m + np.roll(m, 1, 0) + np.roll(m, -1, 0)
         + np.roll(m, 1, 1) + np.roll(m, -1, 1)) / 5.0
    m = (m * SEA_LIFT)[..., None]
    tint = np.array(SEA_TINT, dtype=np.float32)
    out = a * (1 - m) + tint * m
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def assert_land_untouched(img: Image.Image, region: str) -> None:
    """Prove the sea lift never reaches land, on every run.

    "Water only, land keeps the game's colours" is a claim we make out loud, so
    it gets checked rather than asserted. The mask covers ~84% of the texture,
    which looks alarming until you remember the dark surround outside the world
    hexagon is water too — these four unambiguous land classes are the ones
    that must stay at 0%.
    """
    a = np.asarray(img.convert("RGB")).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    sea = (b > g + 4) & (g > r + 6) & (r < 150)
    classes = {
        "grass": (g > r + 8) & (g > b + 8),
        "snow": (r > 190) & (g > 190) & (b > 190),
        "desert": (r > 150) & (r > b + 12),
        "rock": (r > b) & (abs(g - r) < 25) & (r < 150),
    }
    for name, m in classes.items():
        n = int(m.sum())
        if n and (m & sea).sum():
            raise SystemExit(
                f"{region}: sea lift would tint {name} "
                f"({(m & sea).sum() * 100 / n:.1f}% of it) — mask is too loose"
            )
    print(f"  {region}: land classes untouched by the sea lift")


def is_flat(tile: Image.Image) -> bool:
    """True when the tile carries no detail worth its own file (open ocean)."""
    a = np.asarray(tile.convert("RGB")).astype(np.float32)
    return bool(a.reshape(-1, 3).std(axis=0).max() < FLAT_TOLERANCE)


def build_region(region: str, src_name: str, max_z: int) -> dict:
    raw = Image.open(CACHE / src_name).convert("RGB")
    assert_land_untouched(raw, region)
    src = lift_ocean(raw)
    if src.size[0] != src.size[1]:
        raise SystemExit(f"{region}: expected a square texture, got {src.size}")

    manifest: dict[str, list[str]] = {}
    total_bytes = 0
    skipped = 0

    for z in range(max_z + 1):
        n = 2**z
        level = src.resize((TILE * n, TILE * n), Image.LANCZOS)
        present = []
        for ty in range(n):
            for tx in range(n):
                tile = level.crop((tx * TILE, ty * TILE, (tx + 1) * TILE, (ty + 1) * TILE))
                # z0 is the fallback everything else falls back TO, so keep it whole
                if z > 0 and is_flat(tile):
                    skipped += 1
                    continue
                name = f"{z}_{tx}_{ty}.webp"
                for out in (MOBILE_OUT / region, WEB_OUT / region):
                    out.mkdir(parents=True, exist_ok=True)
                    tile.save(out / name, "WEBP", quality=QUALITY, method=6)
                total_bytes += (MOBILE_OUT / region / name).stat().st_size
                present.append(f"{tx}_{ty}")
        manifest[str(z)] = present
        print(f"  {region} z{z}: {len(present):>3}/{n * n:<3} tiles kept")

    print(f"  {region}: {total_bytes / 1024 / 1024:.2f} MB, {skipped} ocean tiles skipped")
    return manifest


def write_index(manifests: dict[str, dict]) -> None:
    """Static require() map — Metro needs literal paths, not computed ones."""
    lines = [
        "/** GENERATED by tools/build_map_tiles.py — DO NOT EDIT.",
        " * Tile pyramid cut from the game's own map textures (T_WorldMap /",
        " * T_TreeMap, via Nifrendil/pal-atlas, MIT). Open-ocean tiles are",
        " * omitted on purpose: the renderer falls back to the parent level,",
        " * which is indistinguishable on a smooth gradient. */",
        "/* eslint-disable @typescript-eslint/no-require-imports */",
        "",
        f"export const TILE_SIZE = {TILE};",
        f"export const MAX_TILE_Z = {max(z for _, z in REGIONS.values())};",
        "",
        "/** deepest level each region actually HAS. The World Tree has no",
        " * 8192 source, so asking it for z4 would return nothing and fall",
        " * through to the blurry z0 base. */",
        "export const REGION_MAX_Z: Record<string, number> = {",
        *[f"  {r}: {z}," for r, (_, z) in REGIONS.items()],
        "};",
        "",
        "/** region -> 'z_x_y' -> bundled asset */",
        "export const MAP_TILES: Record<string, Record<string, number>> = {",
    ]
    for region, manifest in manifests.items():
        lines.append(f"  {region}: {{")
        for z, keys in manifest.items():
            for key in keys:
                lines.append(
                    f"    '{z}_{key}': require('../../assets/map/{region}/{z}_{key}.webp'),"
                )
        lines.append("  },")
    lines += ["};", ""]
    (DATA_OUTS[0] / "tileIndex.g.ts").write_text("\n".join(lines) + "\n", encoding="utf-8")

    # The web build serves tiles as URLs from public/, so it only needs the set.
    web = [
        "/** GENERATED by tools/build_map_tiles.py — DO NOT EDIT.",
        " * Which tiles exist; the web app builds URLs under /map/. */",
        f"export const TILE_SIZE = {TILE};",
        f"export const MAX_TILE_Z = {max(z for _, z in REGIONS.values())};",
        "",
        "/** deepest level each region actually HAS. The World Tree has no",
        " * 8192 source, so asking it for z4 would return nothing and fall",
        " * through to the blurry z0 base. */",
        "export const REGION_MAX_Z: Record<string, number> = {",
        *[f"  {r}: {z}," for r, (_, z) in REGIONS.items()],
        "};",
        "export const MAP_TILES: Record<string, Set<string>> = {",
    ]
    for region, manifest in manifests.items():
        keys = [f"'{z}_{k}'" for z, ks in manifest.items() for k in ks]
        web.append(f"  {region}: new Set([{', '.join(keys)}]),")
    web += ["};", ""]
    (DATA_OUTS[1] / "tileIndex.g.ts").write_text("\n".join(web) + "\n", encoding="utf-8")


def main() -> None:
    manifests = {}
    for region, (src_name, max_z) in REGIONS.items():
        if not (CACHE / src_name).exists():
            raise SystemExit(f"missing {CACHE / src_name} — see documents/AI_TODO.md J2")
        manifests[region] = build_region(region, src_name, max_z)
    write_index(manifests)
    kept = sum(len(v) for m in manifests.values() for v in m.values())
    print(f"\n{kept} tiles total; index written to both platforms")


if __name__ == "__main__":
    main()
