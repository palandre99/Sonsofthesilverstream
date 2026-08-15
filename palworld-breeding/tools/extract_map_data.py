#!/usr/bin/env python3
"""Generate the Map fane's datasets — spawns, POIs and map metadata.

SOURCES (both MIT, both fan projects unaffiliated with Pocketpair):

1. Awy64/palworld-atlas-data — a GitHub Actions runner downloads the OFFICIAL
   anonymous Palworld dedicated-server package every 6h, extracts the Unreal
   tables, schema-validates and publishes build-tagged JSON. Gives us 68,707
   wild + alpha spawn points with world coords, LEVEL RANGES and DAY/NIGHT.
   This is the location authority.
2. Nifrendil/pal-atlas — ships POI layers (chests, eggs, ore, dungeons,
   fast-travel, ...) derived from the same game tables, plus the game's own
   T_WorldMap / T_TreeMap textures.

PROJECTION: world -> normalized map-image coords via the game's own
DT_WorldMapUIData bounds. That choice is not an assumption — it is proved
against 58,504 datamined spawn points by tools/verify_map_projection.py,
which also bounds the residual error at 6 px of 4096. Run that first.

TRAPS THIS SCRIPT HANDLES (each one found by cross-checking, not guessed):
- atlas-data does NOT project the World Tree region: its mapX/mapY/imageX/
  imageY are raw copies of worldY/worldX there. We always project ourselves
  from worldX/worldY and ignore its precomputed columns entirely.
- atlas-data synthesises variant names from the internal id suffix, which
  produces "Snock Terra" for ElecSnail_Ground. The game's English name in 1.0
  is "Snock Lux" (paldb, game8, wiki agree). Variant names therefore go
  through PAL_ID_OVERRIDES, never through a suffix rule.
- weight is 1 on every row in this build, so it carries no information. We do
  not ship a "spawn rarity" derived from it.
- atlas-data does NOT say whether a spawner is open-world or inside a dungeon,
  and roughly half of some species' points are DUNGEON spawners. Drawing those
  as open-world areas would send the player to a hillside where the pal is not.
  pal-atlas filters to Field placements, and the two projects' world coords
  match exactly, so an exact-coordinate join classifies every point. Foxparks:
  93 field / 96 dungeon, and the split falls cleanly on its level bands.
- 115 Pengullet rows carry LvMin 35 > LvMax 34 in the GAME's own spawner table
  (a designer typo, faithfully reproduced upstream). We order the pair and
  count it, so the UI reads "Lv 34-35" instead of nonsense — and so the fix is
  visible in this script's output rather than hidden in a comparison.

Run: python tools/extract_map_data.py
"""
from __future__ import annotations

import base64
import json
import struct
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "tools" / ".cache"
OUT_DIRS = [ROOT / "mobile" / "src" / "data", ROOT / "app" / "src" / "data"]

ATLAS_BUILD = "24575149"  # steam build id; generated 2026-08-12 (patch 1.0.3)

# The game's own map-UI bounds. Both regions are exactly square, matching the
# square map textures. See tools/verify_map_projection.py for the proof.
REGIONS = {
    "palpagos": dict(minX=-1_099_400.0, maxX=349_400.0, minY=-724_400.0, maxY=724_400.0),
    "tree": dict(minX=347_351.5, maxX=689_148.5, minY=-818_197.0, maxY=-476_400.0),
}

# In-game map coordinate readout (the numbers the game shows the player).
# Confirmed identical across palcalc's WorldToMapMatrix, pal-atlas's
# GAME_READOUT and atlas-data's own mapX/mapY for Palpagos.
READOUT = dict(translX=123_930.0, translY=157_935.0, scale=458.52)

# Variant display names the upstream gets wrong (see module docstring).
PAL_ID_OVERRIDES = {"ElecSnail_Ground": "Snock Lux"}

# pal-atlas layer id -> (our label, icon, category, colour). Layers we
# deliberately do not ship are absent, not silently renamed.
#
# Colour is PER LAYER, not per category: on a map with a dozen layers switched
# on, "which of these blue dots is the tower" is the whole question. Each hue is
# picked to read against the map's teal ocean and green/snow/ash land.
POI_LAYERS = {
    "fast_travel":     ("Fast travel", "map-marker-star", "places", "#5FE3C0"),
    "syndicate_tower": ("Tower boss", "chess-rook", "places", "#FF6B6B"),
    "dungeon":         ("Dungeon", "door", "places", "#8AA6FF"),
    "sealed_realm":    ("Sealed realm", "shield-star-outline", "places", "#C79BFF"),
    "merchant":        ("Merchant", "storefront-outline", "places", "#FFC46B"),
    "pal_merchant":    ("Pal merchant", "paw-outline", "places", "#FF9ED2"),
    "npc":             ("NPC", "account-outline", "places", "#A9C0CC"),
    "alpha_pals":      ("Alpha boss", "crown-outline", "pals", "#F0B441"),
    "bounty_targets":  ("Bounty target", "target-account", "pals", "#FF8A5C"),
    "egg":             ("Egg", "egg-outline", "collect", "#FFEFC2"),
    "chest":           ("Chest", "treasure-chest", "collect", "#E8B860"),
    "pal_effigy":      ("Effigy", "candle", "collect", "#B6F0A8"),
    "skill_fruit":     ("Skill fruit", "fruit-cherries", "collect", "#FF8FB0"),
    "note":            ("Note", "note-text-outline", "collect", "#D7E3E8"),
    "ore":             ("Ore", "pickaxe", "resources", "#B7C4CC"),
    "paldium":         ("Paldium", "diamond-stone", "resources", "#6FD2FF"),
    "coal":            ("Coal", "fire", "resources", "#8E9AA3"),
    "sulfur":          ("Sulfur", "flask-outline", "resources", "#E9DE6A"),
    "pure_quartz":     ("Pure quartz", "hexagon-outline", "resources", "#CFE9FF"),
    "soralite":        ("Soralite", "star-four-points-outline", "resources", "#B79BFF"),
    "crude_oil":       ("Crude oil", "oil", "resources", "#A79A6B"),
    "red_berries":     ("Red berries", "food-apple-outline", "resources", "#FF7C6B"),
    "mushrooms":       ("Mushrooms", "mushroom-outline", "resources", "#E0A277"),
}


def project(wx: float, wy: float, region: str) -> tuple[float, float] | None:
    """World XY -> normalized [0,1] map-image coords, or None if out of region."""
    b = REGIONS[region]
    u = (wy - b["minY"]) / (b["maxY"] - b["minY"])
    v = 1.0 - (wx - b["minX"]) / (b["maxX"] - b["minX"])
    if not (0.0 <= u <= 1.0 and 0.0 <= v <= 1.0):
        return None
    return u, v


def pack(points: list[tuple[float, float]]) -> str:
    """uint16 u,v pairs -> base64. 4 bytes/point, sub-pixel at 4096."""
    buf = bytearray()
    for u, v in points:
        buf += struct.pack(
            "<HH",
            min(65535, max(0, round(u * 65535))),
            min(65535, max(0, round(v * 65535))),
        )
    return base64.b64encode(bytes(buf)).decode("ascii")


def ts_header(title: str, extra: str = "") -> list[str]:
    return [
        f"/** GENERATED by tools/extract_map_data.py — DO NOT EDIT.",
        f" * {title}",
        f" * Locations: Awy64/palworld-atlas-data build {ATLAS_BUILD} (official",
        f" * dedicated-server package, 2026-08-12) + Nifrendil/pal-atlas POIs.",
        f" * Projected with the game's own DT_WorldMapUIData bounds; proof and",
        f" * residual bound in tools/verify_map_projection.py.{extra} */",
    ]


def field_zone_coords() -> set[tuple[float, float]]:
    """World coords of every OPEN-WORLD spawner, from pal-atlas.

    pal-atlas keeps only EPalSpawnerPlacementType::Field placements, so the
    presence of a zone at a coordinate is our field/dungeon discriminator.
    """
    zones = json.loads((CACHE / "spawn-zones.json").read_text(encoding="utf-8"))
    return {(round(z["x"], 1), round(z["y"], 1)) for z in zones}


def our_pals() -> set[str]:
    return set(json.loads((ROOT / "data" / "pals_1_0.json").read_text(encoding="utf-8"))["pals"])


def build_spawns(known: set[str]) -> tuple[str, dict]:
    """Per-species spawn points, grouped by level band + day/night.

    Alpha (fixed boss) spots come out of the same pass into their own table:
    they carry a real level and belong to a specific map, neither of which the
    old alphaSpots.g.ts could express — it had no region field at all, so a
    World Tree boss would have been drawn on the Palpagos map.
    """
    groups: dict[str, dict[tuple, list]] = defaultdict(lambda: defaultdict(list))
    alphas: dict[str, list] = {}
    field = field_zone_coords()
    stats = {"points": 0, "dropped_unknown": 0, "dropped_offmap": 0,
             "level_swapped": 0, "dungeon": 0, "unknown": set()}

    for region, fname in (("palpagos", "palpagos_spawns.json"), ("tree", "tree_spawns.json")):
        data = json.loads((CACHE / fname).read_text(encoding="utf-8"))
        for s in data["spawns"]:
            if s["kind"] == "alpha":
                name = PAL_ID_OVERRIDES.get(s["palId"]) or s.get("palName")
                uv = project(s["worldX"], s["worldY"], region)
                if name in known and uv is not None:
                    alphas.setdefault(name, []).append(
                        (0 if region == "palpagos" else 1, s["maxLevel"], uv)
                    )
                continue
            if s["kind"] != "wild":
                continue
            name = PAL_ID_OVERRIDES.get(s["palId"]) or s.get("palName")
            if name not in known:
                stats["dropped_unknown"] += 1
                stats["unknown"].add(f'{s.get("palName")} ({s["palId"]})')
                continue
            uv = project(s["worldX"], s["worldY"], region)
            if uv is None:
                stats["dropped_offmap"] += 1
                continue
            lo, hi = s["minLevel"], s["maxLevel"]
            if lo > hi:
                lo, hi = hi, lo
                stats["level_swapped"] += 1
            dungeon = (round(s["worldX"], 1), round(s["worldY"], 1)) not in field
            if dungeon:
                stats["dungeon"] += 1
            key = (region, lo, hi, s["availability"], dungeon)
            groups[name][key].append(uv)
            stats["points"] += 1

    lines = ts_header("Wild spawn points per pal, as normalized map coords.")
    lines += [
        "export interface SpawnGroup {",
        "  /** which map: 0 = Palpagos Islands, 1 = The World Tree */",
        "  m: 0 | 1;",
        "  lo: number;",
        "  hi: number;",
        "  /** true when this band only spawns at night */",
        "  night: boolean;",
        "  /** true when these are DUNGEON spawners, not open-world ones —",
        "   *  the player will not meet this pal standing on that hillside */",
        "  dun: boolean;",
        "  n: number;",
        "  /** base64 uint16 pairs: u,v in 0..65535 of the map image */",
        "  pts: string;",
        "}",
        "",
        "export const MAP_SPAWNS: Record<string, SpawnGroup[]> = {",
    ]
    for name in sorted(groups):
        parts = []
        for (region, lo, hi, avail, dungeon), pts in sorted(groups[name].items()):
            parts.append(
                "{ m: %d, lo: %d, hi: %d, night: %s, dun: %s, n: %d, pts: '%s' }"
                % (0 if region == "palpagos" else 1, lo, hi,
                   "true" if avail == "night" else "false",
                   "true" if dungeon else "false", len(pts), pack(pts))
            )
        lines.append("  %s: [\n    %s,\n  ]," % (json.dumps(name), ",\n    ".join(parts)))
    lines.append("};")

    lines += [
        "",
        "export interface AlphaSpot {",
        "  /** 0 = Palpagos Islands, 1 = The World Tree */",
        "  m: 0 | 1;",
        "  lv: number;",
        "  u: number;",
        "  v: number;",
        "}",
        "",
        "/** Fixed boss spots — projected with the verified transform AND tagged",
        " *  with their map, which the old alphaSpots.g.ts could not express. */",
        "export const MAP_ALPHAS: Record<string, AlphaSpot[]> = {",
    ]
    for name in sorted(alphas):
        rows = ", ".join(
            "{ m: %d, lv: %d, u: %.5f, v: %.5f }" % (m, lv, uv[0], uv[1])
            for m, lv, uv in sorted(alphas[name])
        )
        lines.append("  %s: [%s]," % (json.dumps(name), rows))
    lines.append("};")

    stats["alphas"] = sum(len(v) for v in alphas.values())
    return "\n".join(lines) + "\n", stats


def build_pois() -> tuple[str, dict]:
    """POI layers, plus alpha pins carrying their level from atlas-data."""
    pois = json.loads((CACHE / "pois.json").read_text(encoding="utf-8"))
    by_layer: dict[str, list] = defaultdict(list)
    stats = {"points": 0, "dropped_offmap": 0, "skipped_layers": set()}

    for p in pois:
        layer = p["layerId"]
        if layer not in POI_LAYERS:
            if not layer.startswith("pal_"):  # per-species zones: we use atlas-data instead
                stats["skipped_layers"].add(layer)
            continue
        region = "tree" if p["mapId"] == "worldtree" else "palpagos"
        uv = project(p["x"], p["y"], region)
        if uv is None:
            stats["dropped_offmap"] += 1
            continue
        by_layer[layer].append((region, uv, p.get("name") or ""))
        stats["points"] += 1

    lines = ts_header("Points of interest, grouped by layer.")
    lines += [
        "export interface PoiLayer {",
        "  id: string;",
        "  label: string;",
        "  icon: string;",
        "  group: 'places' | 'pals' | 'collect' | 'resources';",
        "  /** the layer's own hue, so a tower never reads as a statue */",
        "  colour: string;",
        "  n: number;",
        "  /** parallel to pts: 0 = Palpagos, 1 = World Tree */",
        "  maps: string;",
        "  pts: string;",
        "  /** present only where the name carries information (a dungeon's",
        "   *  name helps; 1,405 markers all called \"Ore\" do not) */",
        "  names?: string[];",
        "}",
        "",
        "export const MAP_POIS: PoiLayer[] = [",
    ]
    order = list(POI_LAYERS)
    for layer in sorted(by_layer, key=order.index):
        rows = by_layer[layer]
        label, icon, group, colour = POI_LAYERS[layer]
        names = [n for _, _, n in rows]
        keep_names = len(set(names)) > max(1, len(names) // 10)
        maps = base64.b64encode(
            bytes(0 if r == "palpagos" else 1 for r, _, _ in rows)
        ).decode("ascii")
        entry = [
            "  {",
            f"    id: '{layer}', label: {json.dumps(label)}, icon: '{icon}',",
            f"    group: '{group}', colour: '{colour}', n: {len(rows)},",
            f"    maps: '{maps}',",
            f"    pts: '{pack([uv for _, uv, _ in rows])}',",
        ]
        if keep_names:
            entry.append(f"    names: {json.dumps(names, ensure_ascii=False)},")
        entry.append("  },")
        lines += entry
    lines.append("];")
    return "\n".join(lines) + "\n", stats


def build_meta() -> str:
    lines = ts_header("Map regions, projection constants and provenance.")
    lines += [
        "export interface MapRegion {",
        "  id: 'palpagos' | 'tree';",
        "  name: string;",
        "  /** world bounds from the game's DT_WorldMapUIData (exactly square) */",
        "  minX: number; maxX: number; minY: number; maxY: number;",
        "  /** native texture size we tile from */",
        "  size: number;",
        "  /** deepest tile zoom level in the bundled pyramid */",
        "  maxZ: number;",
        "}",
        "",
        "export const MAP_REGIONS: MapRegion[] = [",
        "  { id: 'palpagos', name: 'Palpagos Islands',",
        "    minX: %(minX)r, maxX: %(maxX)r, minY: %(minY)r, maxY: %(maxY)r,"
        % REGIONS["palpagos"],
        "    size: 4096, maxZ: 3 },",
        "  { id: 'tree', name: 'The World Tree',",
        "    minX: %(minX)r, maxX: %(maxX)r, minY: %(minY)r, maxY: %(maxY)r,"
        % REGIONS["tree"],
        "    size: 4096, maxZ: 3 },",
        "];",
        "",
        "/** The coordinate readout the GAME shows the player, so our numbers",
        " *  match the ones on his screen. Confirmed identical across palcalc,",
        " *  pal-atlas and atlas-data. */",
        "export const MAP_READOUT = { translX: %(translX)r, translY: %(translY)r,"
        " scale: %(scale)r } as const;" % READOUT,
        "",
        f"export const MAP_DATA_BUILD = '{ATLAS_BUILD}';",
    ]
    return "\n".join(lines) + "\n"


def main() -> None:
    known = our_pals()
    spawns_ts, sstats = build_spawns(known)
    pois_ts, pstats = build_pois()
    meta_ts = build_meta()

    for d in OUT_DIRS:
        (d / "mapSpawns.g.ts").write_text(spawns_ts, encoding="utf-8")
        (d / "mapPois.g.ts").write_text(pois_ts, encoding="utf-8")
        (d / "mapMeta.g.ts").write_text(meta_ts, encoding="utf-8")

    print(f"spawns: {sstats['points']:,} points")
    print(f"  dropped, off-map:      {sstats['dropped_offmap']:,}")
    print(f"  dropped, unknown pal:  {sstats['dropped_unknown']:,}")
    print(f"  level bands re-ordered: {sstats['level_swapped']:,} "
          f"(upstream LvMin > LvMax)")
    print(f"  alpha boss spots:      {sstats['alphas']:,}")
    print(f"  dungeon spawners:      {sstats['dungeon']:,} "
          f"(kept, but flagged so they are never drawn as open-world areas)")
    for u in sorted(sstats["unknown"]):
        print(f"      {u}")
    print(f"pois:   {pstats['points']:,} points across {len(POI_LAYERS)} layers")
    print(f"  dropped, off-map:      {pstats['dropped_offmap']:,}")
    if pstats["skipped_layers"]:
        print(f"  layers not shipped:    {', '.join(sorted(pstats['skipped_layers']))}")
    for d in OUT_DIRS:
        kb = sum((d / f).stat().st_size for f in
                 ("mapSpawns.g.ts", "mapPois.g.ts", "mapMeta.g.ts")) / 1024
        print(f"wrote {d.relative_to(ROOT)}  ({kb:,.0f} KB total)")


if __name__ == "__main__":
    main()
