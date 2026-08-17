#!/usr/bin/env python3
"""Fetch the GAME's own map symbols so our markers look like the game's.

The CEO's note, with an in-game screenshot: "All symbols should be same as game
use also." He is right — a generic pickaxe glyph where the game draws its own
ore symbol is the difference between "a map" and "the game's map".

Nifrendil/pal-atlas (MIT) bakes the game's UI icons out of the PAK into
public/icons/, and its names line up one-for-one with our 23 POI layers.

Run: python tools/fetch_map_icons.py
"""
from __future__ import annotations

import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = [ROOT / "mobile" / "assets" / "mapicons", ROOT / "app" / "public" / "mapicons"]
BASE = "https://raw.githubusercontent.com/Nifrendil/pal-atlas/main/public/icons"

# Higher-resolution symbols, straight out of the game files.
#
# The CEO: "Icons are also garbage and not accurate game icons images." He was
# right, and it was a resolution problem: pal-atlas's sprites are 14-46 px, and
# a 22 px symbol drawn at ~45 device px on a 3x phone is mush. jeankassio/
# PalMiniMap (MIT) exports the same UI textures at 64-100 px.
#
# ONLY the layers whose symbol genuinely corresponds are listed here. Every
# candidate was rendered side by side against the icon it would replace before
# being accepted, and two were REJECTED on that evidence:
#   - pal_effigy -> T_itemicon_Relic  is a green creature, not the effigy statue
#   - alpha_pals -> T_icon_compass_boss  is a horned head, a different glyph
#     from the alpha marker we ship, and I could not confirm they mean the same
# Those two keep their existing art. A sharper wrong symbol is still wrong.
#
# These are the game's own markers, so most are white/monochrome — which is how
# the in-game map actually draws them.
HI_BASE = ("https://raw.githubusercontent.com/jeankassio/PalMiniMap"
           "/main/PalMiniMap_V2/icons")

# The game's own ITEM icons for the material layers, 256px (MIT,
# mlg404/palworld-paldex-api — measured 2026-08-17, license checked via the
# GitHub API). The in-game map never draws materials at all, so no map
# symbol exists to copy; the inventory icon IS the game's image for the
# thing, and the 17-26px community sprites were the "insanely low quality
# and pixelated" icons in the CEO's screenshots. Resized to 96px at bake:
# a 26px pin on a 3x phone needs ~78 real px, and 96 covers it with margin
# while keeping the bundle small. skill_fruit ships only per-skill fruit
# icons (a specific fruit would be a wrong claim about a random-fruit tree)
# and merchant/pal_merchant/npc/alpha_pals/pal_effigy have no item — those
# keep their art. A sharper wrong symbol is still wrong.
ITEM_BASE = ("https://raw.githubusercontent.com/mlg404/palworld-paldex-api"
             "/main/public/images/items")

ITEM_ICONS = {
    "ore": "ore",
    "coal": "coal",
    "sulfur": "sulfur",
    "paldium": "paldium-fragment",
    "pure_quartz": "pure-quartz",
    "red_berries": "red-berries",
    "mushrooms": "mushroom",
    "crude_oil": "crude-oil",
}
ITEM_SIZE = 96

HI_ICONS = {
    "fast_travel": "T_icon_compass_FTtower",          # 100px
    "syndicate_tower": "T_icon_compass_tower",        # 100px
    "sealed_realm": "T_icon_compass_BossGate",        #  80px
    "bounty_targets": "T_icon_compass_Bounty",        #  80px
    "chest": "T_icon_compass_Search_Treasure",        #  80px
    "dungeon": "T_icon_compass_dungeon",              #  64px
    "egg": "T_itemicon_Material_PalEgg",              #  64px
    "note": "T_minimap_note",                         #  64px
}

# our layer id -> pal-atlas file name
ICONS = {
    "alpha_pals": "alpha-pals",
    "bounty_targets": "bounty-targets",
    "chest": "chest",
    "coal": "coal",
    "crude_oil": "crude-oil",
    "dungeon": "dungeon",
    "egg": "egg",
    "fast_travel": "fast-travel",
    "merchant": "merchant",
    "mushrooms": "mushrooms",
    "note": "note",
    "npc": "npc",
    "ore": "ore",
    "pal_effigy": "pal-effigy",
    "pal_merchant": "pal-merchant",
    "paldium": "paldium",
    "pure_quartz": "pure-quartz",
    "red_berries": "red-berries",
    "sealed_realm": "sealed-realm",
    "skill_fruit": "skill-fruit",
    "soralite": "soralite",
    "sulfur": "sulfur",
    "syndicate_tower": "syndicate-tower",
}


def main() -> None:
    for d in OUT:
        d.mkdir(parents=True, exist_ok=True)
    got = 0
    for layer, name in sorted(ICONS.items()):
        if layer in ITEM_ICONS:
            url = f"{ITEM_BASE}/{ITEM_ICONS[layer]}.png"
            src = "game item art"
        elif layer in HI_ICONS:
            url = f"{HI_BASE}/{HI_ICONS[layer]}.png"
            src = "game files"
        else:
            url = f"{BASE}/{name}.png"
            src = "pal-atlas"
        data = urllib.request.urlopen(url, timeout=30).read()
        if layer in ITEM_ICONS:
            from PIL import Image
            import io as _io
            im = Image.open(_io.BytesIO(data)).convert("RGBA")
            im = im.resize((ITEM_SIZE, ITEM_SIZE), Image.LANCZOS)
            buf = _io.BytesIO()
            im.save(buf, "PNG", optimize=True)
            data = buf.getvalue()
        for d in OUT:
            (d / f"{layer}.png").write_bytes(data)
        got += 1
        print(f"  {layer:<18} {len(data):>6} bytes  ({src})")

    lines = [
        "/** GENERATED by tools/fetch_map_icons.py — DO NOT EDIT.",
        " * The GAME's own map symbols, one per POI layer, so a marker on our",
        " * map reads the same as the marker the player already knows.",
        " * Sources: the game's item art via mlg404/palworld-paldex-api (MIT,",
        " * 96px) for materials the in-game map never draws; jeankassio/",
        " * PalMiniMap (MIT, 64-100px) where a map symbol corresponds;",
        " * otherwise Nifrendil/pal-atlas (MIT). */",
        "/* eslint-disable @typescript-eslint/no-require-imports */",
        "",
        "export const MAP_ICONS: Record<string, number> = {",
    ]
    for layer in sorted(ICONS):
        lines.append(f"  {layer}: require('../../assets/mapicons/{layer}.png'),")
    lines += ["};", ""]
    (ROOT / "mobile" / "src" / "data" / "mapIcons.g.ts").write_text(
        "\n".join(lines), encoding="utf-8")

    web = [
        "/** GENERATED by tools/fetch_map_icons.py — DO NOT EDIT.",
        " * The game's own map symbols; the web app serves them from /mapicons/. */",
        f"export const MAP_ICON_LAYERS = new Set({sorted(ICONS)!r});".replace("'", "'"),
        "",
    ]
    (ROOT / "app" / "src" / "data" / "mapIcons.g.ts").write_text(
        "\n".join(web), encoding="utf-8")
    print(f"\n{got} game symbols written to both platforms")


if __name__ == "__main__":
    main()
