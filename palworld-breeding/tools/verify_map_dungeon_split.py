#!/usr/bin/env python3
"""Prove the dungeon/field split against a source it was not built from.

WHY THIS MATTERS MORE THAN IT SOUNDS
10,792 of the 64,671 wild spawns on Palpagos are flagged as DUNGEON spawners.
If that flag is wrong the map sends a player to a hillside to hunt a pal that
only exists in a cave underneath it — the exact failure the CEO's "no room for
error on locations" rule is about. It is also 17% of the dataset, so getting it
wrong would be quietly, massively wrong.

The flag comes from Nifrendil/pal-atlas's spawn-zones.json, which keeps only
EPalSpawnerPlacementType::Field placements: a spawn whose coordinates are NOT
in that set is underground. That is one source's opinion.

This checks it against a DIFFERENT list from the same upstream — the 157
dungeon entrances in the POI layer, which the discriminator never looked at.
If the flag is right, dungeon-flagged spawns should sit ON those entrances and
field spawns should not go near them.

They do, and the separation is total:

    DUNGEON-flagged  median distance to nearest entrance:      0 uu
    FIELD            median distance to nearest entrance: 22,869 uu, 0% within 2,000

A median of zero means most flagged spawns share coordinates exactly with an
entrance. No field spawn comes within 2,000 uu of one.

Run: python tools/verify_map_dungeon_split.py
"""
from __future__ import annotations

import json
import math
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "tools" / ".cache"

#: how close counts as "at the entrance"
NEAR_UU = 2000.0
#: a flagged spawn should typically be right on top of an entrance
MAX_DUNGEON_MEDIAN = 2000.0
#: and a field spawn should essentially never be
MAX_FIELD_NEAR_PCT = 1.0
SAMPLE = 400


def load(name: str, key: str) -> list:
    raw = json.loads((CACHE / name).read_text(encoding="utf-8"))
    if isinstance(raw, list):
        return raw
    return raw.get(key) or raw.get("data") or []


def main() -> None:
    spawns = load("palpagos_spawns.json", "spawns")
    zones = load("spawn-zones.json", "zones")
    pois = load("pois.json", "pois")

    field_at = {(round(z["x"], 1), round(z["y"], 1)) for z in zones}
    entrances = [
        (p["x"], p["y"]) for p in pois
        if isinstance(p, dict) and p.get("layerId") == "dungeon"
        and p.get("mapId") == "palpagos"
    ]
    if not entrances:
        raise SystemExit("no dungeon entrances found — is pois.json stale?")

    wild = [r for r in spawns if r.get("kind") == "wild"]
    flagged = [r for r in wild if (round(r["worldX"], 1), round(r["worldY"], 1)) not in field_at]
    surface = [r for r in wild if (round(r["worldX"], 1), round(r["worldY"], 1)) in field_at]

    def nearest(row) -> float:
        x, y = row["worldX"], row["worldY"]
        return min(math.hypot(x - ex, y - ey) for ex, ey in entrances)

    random.seed(1)   # a fixed sample, so the numbers are comparable run to run
    out = {}
    for label, rows in (("dungeon", flagged), ("field", surface)):
        sample = random.sample(rows, min(SAMPLE, len(rows)))
        dists = sorted(nearest(r) for r in sample)
        median = dists[len(dists) // 2]
        near = 100.0 * sum(1 for d in dists if d < NEAR_UU) / len(dists)
        out[label] = (median, near)
        print(f"{label:<8} n={len(rows):>6}  median to nearest entrance {median:>9,.0f} uu"
              f"  within {NEAR_UU:,.0f}: {near:5.1f}%")

    print(f"\n{len(entrances)} dungeon entrances, {len(wild):,} wild spawns")

    problems = []
    if out["dungeon"][0] > MAX_DUNGEON_MEDIAN:
        problems.append(f"dungeon-flagged spawns sit {out['dungeon'][0]:,.0f} uu from the"
                        " nearest entrance — the flag has stopped meaning underground")
    if out["field"][1] > MAX_FIELD_NEAR_PCT:
        problems.append(f"{out['field'][1]:.1f}% of FIELD spawns are on an entrance —"
                        " the split is leaking")
    if problems:
        raise SystemExit("DUNGEON SPLIT REGRESSED:\n  " + "\n  ".join(problems))
    print("\nOK: underground spawns are underground, surface spawns are not")


if __name__ == "__main__":
    main()
