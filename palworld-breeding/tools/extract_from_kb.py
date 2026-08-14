#!/usr/bin/env python3
"""Extract the versioned Palworld 1.0 dataset used by the breeding planner.

Source: local clone of github.com/beliarance/palworld-kb (1.0 dataset,
itself scraped from paldb.cc / palworld.wiki.gg / palworld.ludbase.com,
fetched 2026-07-14..20). Run:

    python3 tools/extract_from_kb.py /path/to/palworld-kb

Writes data/breeding_1_0.json and data/pals_1_0.json next to this project.
Re-run after a game patch with a refreshed palworld-kb clone.
"""
import json
import sys
from datetime import date
from pathlib import Path

KB = Path(sys.argv[1] if len(sys.argv) > 1 else "/workspace/beliarance/palworld-kb")
OUT = Path(__file__).resolve().parent.parent / "data"


def main() -> None:
    b = json.loads((KB / "data/breeding.json").read_text())
    idx = json.loads((KB / "data/index.json").read_text())["pals"]
    icons = json.loads((KB / "data/icons.json").read_text())["pals"]
    loc = json.loads((KB / "data/pal_locations.json").read_text())["pals"]

    ranks = b["combi_ranks"]
    combos = b["special_combos"]
    cross = [c for c in combos if not (c["parent_a"] == c["parent_b"] == c["child"])]
    self_only = sorted({c["child"] for c in combos if c["parent_a"] == c["parent_b"] == c["child"]})
    excluded = sorted({c["child"] for c in cross} | set(self_only))

    # The ONE gender-dependent pair in the game (palcalc breeding.json, game8):
    # female Katress + male Wixen -> Katress Ignis; male Katress + female Wixen
    # -> Wixen Noct. paldb lists both rows with unordered parents; split them out.
    gendered_pair = {"Katress", "Wixen"}
    gendered = [c for c in cross if {c["parent_a"], c["parent_b"]} == gendered_pair]
    cross = [c for c in cross if {c["parent_a"], c["parent_b"]} != gendered_pair]
    assert {c["child"] for c in gendered} == {"Katress Ignis", "Wixen Noct"}, gendered
    gendered_combos = [
        {"mother": "Katress", "father": "Wixen", "child": "Katress Ignis"},
        {"mother": "Wixen", "father": "Katress", "child": "Wixen Noct"},
    ]
    # no other parent pair may map to two different children
    seen: dict[frozenset, str] = {}
    for c in cross:
        k = frozenset((c["parent_a"], c["parent_b"]))
        assert seen.setdefault(k, c["child"]) == c["child"], f"collision: {c}"

    breeding = {
        "game_version": "1.0",
        "extracted": date.today().isoformat(),
        "source": {
            "dataset": "github.com/beliarance/palworld-kb @ cf9ecbe (2026-07-20)",
            "upstream": [
                "paldb.cc/en/Breeding_Farm (CombiRank table + 164 unique combos, fetched 2026-07-14)",
                "palworld.wiki.gg/wiki/Breeding (formula wording)",
                "palworld.ludbase.com (1.0 formula + ~135 overrides confirmation)",
                "github.com/tylercamp/palcalc db.json v27 + breeding.json (44 851 precomputed "
                "1.0 results; formula/tie-break/pool verified at code+data level 2026-08-14)",
                "github.com/Awy64/palworld-atlas-data DT_PalCombiUnique (raw game table, "
                "builds 24088465..24575149; gendered Katress/Wixen rows)",
            ],
        },
        "formula": {
            "target": "floor((rankA + rankB + 1) / 2)",
            "pool": "generic pool = all species EXCEPT unique-combo children and self-breed-only species",
            "tie_break": "closest CombiRank; on exact tie the HIGHER CombiRank wins",
            "tie_break_status": (
                "CONFIRMED at dataset level 2026-08-14: all 14 021 exact-tie pairs in palcalc's "
                "1.0 breeding.json resolve to the higher CombiRank (0 exceptions; the game field "
                "is CombiDuplicatePriority = CombiRank*100 for pool species). Also player-verified "
                "in-game (Turtacle 2410 + Aegidron 30 -> Nitemary 1230, not Quivern 1210). "
                "Old wiki text ('lowest index wins') is stale pre-1.0 wording."
            ),
            "pool_status": (
                "CONFIRMED: palcalc filters every DT_PalCombiUnique child out of the generic pool "
                "('pals produced by a special combo can _only_ be produced by that combo') -> pool "
                "of 183 species, no duplicate ranks; replaying formula+pool+tie-break reproduces "
                "all 44 851 palcalc results. palworld.gg's ignoreCombi-39 model is wrong for 1.0."
            ),
            "gendered_note": (
                "Katress+Wixen is the game's ONLY gender-dependent pair: female Katress + male "
                "Wixen -> Katress Ignis; male Katress + female Wixen -> Wixen Noct."
            ),
            "same_species": "X + X always yields X",
            "order_insensitive": True,
        },
        "combi_ranks": ranks,
        "unique_combos": [
            {"parents": sorted([c["parent_a"], c["parent_b"]]), "child": c["child"]} for c in cross
        ],
        "gendered_combos": gendered_combos,
        "self_breed_only": self_only,
        "excluded_from_generic_pool": excluded,
    }

    pals = {}
    for name, p in idx.items():
        l = loc.get(name, {})
        regions = l.get("regions") or []
        other = l.get("other_sources") or []
        wild = bool(regions)
        pals[name] = {
            "number": p.get("number"),
            "elements": p.get("elements") or [],
            "work": p.get("work") or {},
            "rarity": p.get("rarity"),
            "hp": p.get("hp"),
            "atk": p.get("atk"),
            "def": p.get("def"),
            "combi_rank": ranks.get(name),
            "partner_skill": p.get("partner_skill"),
            "partner_effect": p.get("partner_effect"),
            "base_support": p.get("base_support"),
            "nocturnal": p.get("nocturnal"),
            "size": p.get("size"),
            "mount": p.get("mount"),
            "icon": icons.get(name),
            "wild": wild,
            "regions": regions[:4],
            "alpha_locations": (l.get("alpha_locations") or [])[:2],
            "obtain_notes": other[:3],
            "egg_types": l.get("egg_types") or [],
        }

    meta = {
        "game_version": "1.0",
        "extracted": date.today().isoformat(),
        "source": breeding["source"],
        "pals": pals,
    }

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "breeding_1_0.json").write_text(json.dumps(breeding, indent=1, ensure_ascii=False))
    (OUT / "pals_1_0.json").write_text(json.dumps(meta, indent=1, ensure_ascii=False))
    print(f"wrote {OUT}/breeding_1_0.json ({len(ranks)} pals, {len(cross)} cross combos, "
          f"{len(self_only)} self-only, pool {len(ranks) - len(excluded)})")
    print(f"wrote {OUT}/pals_1_0.json ({len(pals)} pals)")


if __name__ == "__main__":
    main()
