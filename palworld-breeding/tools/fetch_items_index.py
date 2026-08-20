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

    # The upstream name table is BROKEN for rarity-variant rows: 44 read
    # "en Text" (a parse artifact) and ~310 read "{BaseId} N" (unlocalized).
    # The game itself shows every rarity tier under the FAMILY's name,
    # distinguished by rarity colour — paldb presents them the same way —
    # so a variant INHERITS its base row's clean name and is flagged
    # `nameFromBase`. This is derivation from the game's own presentation,
    # not invention; anything the rule cannot resolve is reported loudly.
    import re as _re

    def broken(name: str, iid: str) -> bool:
        if name == "en Text":
            return True
        if name == iid and (_re.search(r"\d$", iid) or "_" in iid):
            # an id-shaped string (trailing digits / underscores) is never
            # a display name — but single clean words (Cake, Egg, Flour)
            # ARE their own ids legitimately and stay untouched
            return True
        if name == iid.replace("_", " ") and _re.search(r"\d$", iid):
            # the multi-token spaced-id shape ("Octavia001 Armor 5" for
            # Octavia001_Armor_5) — trailing digit required, otherwise
            # legitimate names like "Baked Berries" (id Baked_Berries)
            # get flagged (that over-catch cost 11 derivations on the
            # first cut, caught by the run report)
            return True
        m = _re.fullmatch(r"([A-Za-z0-9]+) \d", name)
        return bool(m and m.group(1) in iid)

    # The name table's parse artifact also lands in DESCRIPTIONS, and there
    # it is a PRESENT string rather than an empty one — so the inheritance
    # below, which only asked `not it["description"]`, sailed straight past
    # it and 16 cards showed the player the literal words "en Text"
    # (IL37; found by auditing what the CARD displays, since the facts
    # sweep already covers the other 28). Measured before writing the rule:
    # all 44 occurrences are that exact string, never part of a real
    # sentence, so matching it exactly cannot eat a genuine description.
    def broken_text(d: str | None) -> bool:
        return not d or d.strip() == "en Text"

    # A run-together code name is never something the game shows a player.
    # Measured across the catalogue: 53 items carry a name equal to their
    # id, and 52 are legitimately ONE word (Cake, Coal, Bone, Katana,
    # Sword) — those must not be touched. Exactly one is a code name,
    # "GrapplingGun", on 5 rows, and it is the only name in all 1,892 with
    # a capital letter inside a word. Splitting it at that boundary is a
    # typographic transform of the id, not an invented name, and it lands
    # on "Grappling Gun" — which is independently what paldb's own page
    # for the item is titled (checked 2026-08-20 while chasing its icon).
    # Runs BEFORE the family pass so the numbered variants then inherit a
    # clean base name instead of five copies of the code name.
    def camel_split(s: str) -> str:
        return _re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", s)

    # ONLY the base row: a trailing digit means this is a rarity variant,
    # and splitting those produced "Grappling Gun2" / "Treasure Map02" on
    # the first cut — names that LOOK valid, so the family pass below
    # stopped flagging them and they never inherited. Caught by reading
    # the run's own output instead of trusting the count.
    code_named = 0
    for iid, it in items.items():
        if it["name"] == iid and _re.search(r"[a-z0-9][A-Z]", iid) \
                and "_" not in iid and not _re.search(r"\d$", iid):
            it["name"] = camel_split(iid)
            it["nameFromCodeName"] = True
            code_named += 1
    print(f"split {code_named} run-together code names into display names")

    unresolved = []
    derived = 0
    for iid, it in items.items():
        if not broken(it["name"], iid):
            continue
        base_id = _re.sub(r"_?(Default)?\d+$", "", iid)
        cand = None
        for c in (base_id, base_id + "_Default1", base_id + "_1",
                  base_id + "1", base_id + "01"):
            hit = items.get(c)
            if hit and not broken(hit["name"], c):
                cand = hit
                break
        if cand is None:
            unresolved.append(iid)
            continue
        it["name"] = cand["name"]
        it["nameFromBase"] = True
        if broken_text(it["description"]) and not broken_text(cand["description"]):
            it["description"] = cand["description"]
            it["descriptionFromBase"] = True
        derived += 1
    print(f"derived {derived} variant names from their families; "
          f"{len(unresolved)} unresolved: {unresolved[:8]}")

    # Today every broken description belongs to an item whose NAME was
    # broken too, so the pass above reaches all of them. That is a
    # coincidence of this build, not a guarantee — say so out loud if a
    # future refresh ships one the pass cannot reach.
    left = [iid for iid, it in items.items() if broken_text(it["description"])]
    print(f"{len(left)} items left without a usable description: {left[:8]}")

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
