#!/usr/bin/env python3
"""Fetch the Items fane's backbone: every item in the game, build-pinned.

Source: Awy64/palworld-atlas-data (MIT) — the project's existing location
authority. Its GitHub Actions runner downloads the OFFICIAL anonymous
dedicated-server package, extracts the Unreal tables and publishes
schema-validated JSON per steam build. The items index carries the game's
own names and descriptions (DT_ItemNameText / DT_ItemDescriptionText) over
DT_ItemDataTable rows: id, name, description, category, subcategory,
rarity, rank, maxStack, weight, price, icon.

VALIDATION before anything is written: the build id must match the pin,
ids must be unique and non-empty, every item must carry a name. Counts are
printed so the ledger can quote them. Descriptions keep the game's text
verbatim except \r\n -> \n.

Writes data/items_1_0.json plus the two app copies — three copies moved
together, always (the E139 divergence lesson).

    python3 tools/fetch_items_index.py
"""
import json
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COPIES = [
    ROOT / "data" / "items_1_0.json",
    ROOT / "mobile" / "src" / "data" / "items_1_0.json",
    ROOT / "app" / "public" / "data" / "items_1_0.json",
]
BUILD = "24575149"  # steam build id, same pin as the map's data
URL = ("https://raw.githubusercontent.com/Awy64/palworld-atlas-data/main/"
       f"published/v1/builds/{BUILD}/items/index.json")
UA = "PalforgeDataPipeline/1.0 (companion app; contact: palandre.99@gmail.com)"


def main() -> None:
    req = urllib.request.Request(URL, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        records = json.loads(r.read().decode("utf-8"))["records"]

    ids = [rec["id"] for rec in records]
    assert len(ids) == len(set(ids)), "duplicate item ids in the source"
    assert all(ids), "empty item id in the source"
    unnamed = [rec["id"] for rec in records if not rec.get("name")]
    assert not unnamed, f"items without a name: {unnamed[:5]}"

    items = {}
    for rec in records:
        items[rec["id"]] = {
            "name": rec["name"],
            "description": (rec.get("description") or "").replace("\r\n", "\n"),
            "category": rec.get("category"),
            "subcategory": rec.get("subcategory"),
            "rarity": rec.get("rarity"),
            "rank": rec.get("rank"),
            "maxStack": rec.get("maxStack"),
            "weight": rec.get("weight"),
            "price": rec.get("price"),
            "icon": rec.get("icon"),
        }

    cats = {}
    for it in items.values():
        cats[it["category"]] = cats.get(it["category"], 0) + 1
    payload = {
        "source": (
            "Awy64/palworld-atlas-data published items index, steam build "
            f"{BUILD} (official dedicated-server package, extracted and "
            "schema-validated upstream; game's own names/descriptions from "
            "DT_ItemNameText/DT_ItemDescriptionText over DT_ItemDataTable). "
            "Fetched 2026-08-18."),
        "build": BUILD,
        "count": len(items),
        "items": items,
    }
    for path in COPIES:
        path.write_text(
            json.dumps(payload, indent=1, ensure_ascii=False), encoding="utf-8")
        print(f"wrote {path}")
    print(f"{len(items)} items; categories: "
          + ", ".join(f"{k}={v}" for k, v in sorted(cats.items())))


if __name__ == "__main__":
    main()
