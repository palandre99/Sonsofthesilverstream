#!/usr/bin/env python3
"""Extract the 1.0 passive-skill database used by the Odds Lab.

Source: local clone of github.com/beliarance/palworld-kb (data/passives.json,
itself scraped from paldb.cc / palworld.wiki.gg, fetched 2026-07-14). Run:

    python3 tools/extract_passives.py /path/to/palworld-kb

Writes data/passives_1_0.json. Re-run after a game patch with a refreshed clone.

Only fields the app actually uses are kept, so the shipped file stays small:
name, tier, category, effect text, and the flags that change breeding advice
(breedable, mutation-exclusive, boss/legendary-exclusive, World Tree tier).
"""
import json
import sys
from datetime import date
from pathlib import Path

KB = Path(sys.argv[1] if len(sys.argv) > 1 else "/workspace/beliarance/palworld-kb")
OUT = Path(__file__).resolve().parent.parent / "data"


def main() -> None:
    src = json.loads((KB / "data/passives.json").read_text(encoding="utf-8"))
    rows = src["passives"]

    passives = []
    for p in rows:
        name = p["name"]
        exclusive = p.get("exclusive_source") or []
        entry = {
            "name": name,
            "tier": p.get("tier"),
            "category": p.get("category"),
            "effects": (p.get("effects") or "").strip(),
            # breedable is None for a handful of rows the source never confirmed;
            # treat unknown as breedable but keep the distinction for the UI.
            "breedable": p.get("breedable") is not False,
            "breedable_known": p.get("breedable") is not None,
            "mutation_exclusive": bool(p.get("mutation_exclusive")),
            "world_tree": bool(p.get("world_tree_set")),
            "exclusive_to": exclusive,
        }
        native = p.get("native_pals") or []
        if native:
            entry["native_pals"] = native
        passives.append(entry)

    passives.sort(key=lambda x: (-(x["tier"] or 0), x["name"]))

    meta = {
        "game_version": src.get("game_version", "1.0"),
        "extracted": date.today().isoformat(),
        "source": {
            "dataset": "github.com/beliarance/palworld-kb data/passives.json",
            "dataset_updated": src.get("updated"),
            "upstream": src.get("sources"),
            "tier_scale": src.get("tier_scale"),
        },
        "passives": passives,
    }

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "passives_1_0.json").write_text(
        json.dumps(meta, indent=1, ensure_ascii=False), encoding="utf-8"
    )

    tiers = {}
    for p in passives:
        tiers[p["tier"]] = tiers.get(p["tier"], 0) + 1
    print(
        f"wrote {OUT}/passives_1_0.json ({len(passives)} passives, "
        f"{sum(1 for p in passives if p['mutation_exclusive'])} mutation-exclusive, "
        f"{sum(1 for p in passives if p['exclusive_to'])} boss-exclusive, "
        f"{sum(1 for p in passives if 'native_pals' in p)} with native pal lists)"
    )
    print("  by tier: " + ", ".join(f"{t}:{n}" for t, n in sorted(tiers.items(), reverse=True)))


if __name__ == "__main__":
    main()
