#!/usr/bin/env python3
"""The validating merge: raw page + tech-tree captures -> item_facts_1_0.json.

The CEO's card requirements (2026-08-18): stats, how to craft (with the
unlock LEVEL and TECHNOLOGY POINTS), where to find, food effects, honest
descriptions — "a proper proper info for every single item in the game."

Validation doctrine (same as the stats layer — refuse, count, never guess):
- a recipe row ships only if its ingredient hover is Items/<id> with <id>
  in the backbone;
- an item's tech ships only if the page's Technology node id exists in the
  tree capture AND any page-stated level agrees with the tree's level
  (fallback: unique tree-node name match, same agreement rule);
- a rendered description ships only if every Items/<id> anchor's text
  EQUALS the backbone name for <id> (the paldb-rendering cross-check);
  1,306 backbone descriptions carry raw game placeholder tags, so the
  rendered text is the only honest full resolution — its provenance is
  recorded in the payload header;
- Dropped By / Treasure Box / merchant rows ship as the page states them
  (qty strings like "1–2", rates like "7.784%" kept verbatim);
- every refusal is counted and printed; totals go in the run report.

Reads  tools/.cache/item_pages_raw.json  (fetch_item_pages.py)
       tools/.cache/tech_tree_raw.json   (fetch_tech_tree.py)
       data/items_1_0.json               (backbone)
Writes data/item_facts_1_0.json + mobile + app copies (moved together,
       always — the E139 lesson).

    python3 tools/gen_item_facts.py
"""
import html
import json
import re
import urllib.parse
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "tools" / ".cache"
COPIES = [
    ROOT / "data" / "item_facts_1_0.json",
    ROOT / "mobile" / "src" / "data" / "item_facts_1_0.json",
    ROOT / "app" / "public" / "data" / "item_facts_1_0.json",
]

ANCHOR = re.compile(
    r'<a[^>]*data-hover="\?s=([^"]+)"[^>]*>(.*?)</a>', re.S)
TAG = re.compile(r"<[^>]+>")
GAME_TAG = re.compile(r"<[a-zA-Z]+ id=\|[^|]*\|/>")

# Header-chip labels we ship as player-facing effects. Values verbatim;
# a label maps to lightly-spaced player words WITHOUT adding semantics
# (the SneakAttackRate doctrine: raw fact, never interpreted).
EFFECT_LABELS: dict[str, str] = {
    "Nutrition": "Nutrition", "SAN": "SAN", "Work Speed": "Work Speed",
    "Recovery Time": "Recovery Time", "Weight Reduction": "Weight Reduction",
    # bare "Health" is deliberately absent: it is the family pages' per-tier
    # hp chip repeated once per tier, and every carrier already ships hp in
    # the stats layer (verified 2026-08-19: zero items have the chip
    # without the stat) — it flooded armor cards with five Health rows
    "Restores": "Restores", "Stamina": "Stamina",
    "Defense Bonus": "Defense Bonus", "Attack Bonus": "Attack Bonus",
    "Health Recovery": "Health Recovery", "Speed": "Speed",
    "Exp": "EXP", "Exp_Increase": "EXP increase",
    "Technology Points": "Technology Points",
    "Ancient Technology Points": "Ancient Technology Points",
    "Stamina Drain": "Stamina Drain",
    "MaxInventoryWeight": "Max carry weight",
    "WorkSpeed": "Work Speed", "MaxSP": "Max Stamina", "MaxHP": "Max HP",
    "SANResist": "SAN resist", "HungerResist": "Hunger resist",
    "FishingMaxDistance": "Fishing distance",
    "HitBarSizeRate": "Fishing hit bar size",
    "Trust": "Trust", "Power": "Power",
}


def clean_text(s: str) -> str:
    # the game's strings carry \r\n — normalize like the backbone does
    return html.unescape(TAG.sub("", s)).replace("\r\n", "\n").replace("\r", "\n").strip()


# ---- source names in a player's words --------------------------------
# 273 of 1,515 distinct drop/box sources and 33 of 36 shop ids arrive as
# internal tokens (Feybreak02_Fishing, Caravan_Shop_17). The transforms
# below only SPACE and PATTERN them — regions keep the game's own token
# (Feybreak, Sakurajima, World Tree); nothing is renamed to a place the
# data does not state. Shops collapse onto the game's merchant vocabulary
# (the same six families paldb's own navigation uses) and deduplicate.
SHOP_WORDS = [
    ("Caravan_Shop", "Caravan merchant"),
    ("Wander_Shop", "Wandering merchant"),
    ("Bounty_Shop", "Bounty merchant"),
    ("Medal_Shop", "Medal merchant"),
    ("Arena_Shop", "Arena merchant"),
    ("Dungeon_Shop", "Dungeon merchant"),
    ("Vagrant_Trader", "Vagrant trader"),
]
CAMEL = re.compile(r"(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Za-z])(?=\d)")


def spaced(token: str) -> str:
    return CAMEL.sub(" ", token.replace("_", " ")).strip()


ITEM_NAMES: dict[str, str] = {}  # internal id -> display name, set by main


def player_source(src: str) -> str:
    # treasure maps FIRST: all four higher maps wear the family name
    # "Treasure Map" since the 2026-08-19 backbone repair, so the id
    # lookup would collapse the tiers into four identical rows — the
    # numbered form keeps them tellable apart
    if src == "TreasureMap01":
        return "Treasure Map"  # the item's own name in the backbone
    m = re.fullmatch(r"TreasureMap0?(\d+)", src)
    if m:
        return f"Treasure map {m.group(1)}"
    if src in ITEM_NAMES:
        # some source cells carry an ITEM's internal id (a chest that
        # contains the item itself) — exact-identity resolution first
        return ITEM_NAMES[src]
    if "_" not in src and not CAMEL.search(src):
        return src  # already readable text from the page
    m = re.fullmatch(r"(.+?)_Fishing", src)
    if m:
        return f"Fishing spot ({spaced(m.group(1))})"
    m = re.fullmatch(r"(.+?)_Supply", src)
    if m:
        return f"Supply drop ({spaced(m.group(1))})"
    m = re.fullmatch(r"Expedition_(.+?)(_Hard)?", src)
    if m:
        hard = " (Hard)" if m.group(2) else ""
        return f"Expedition: {spaced(m.group(1))}{hard}"
    m = re.fullmatch(r"Salvage_Rank(\d+)", src)
    if m:
        return f"Salvage rank {m.group(1)}"
    return spaced(src)


def player_shop(src: str) -> str:
    for prefix, word in SHOP_WORDS:
        if src.startswith(prefix):
            return word
    return spaced(src) if "_" in src else src


def main() -> None:
    items = json.loads(
        (ROOT / "data" / "items_1_0.json").read_text(encoding="utf-8"))["items"]
    ITEM_NAMES.update({iid: it["name"] for iid, it in items.items()
                       if it.get("name")})
    raw = json.loads(
        (CACHE / "item_pages_raw.json").read_text(encoding="utf-8"))
    tree = json.loads(
        (CACHE / "tech_tree_raw.json").read_text(encoding="utf-8"))["nodes"]
    equip_passives: dict[str, str] = {}
    ep_path = CACHE / "equip_passives_raw.json"
    if ep_path.exists():
        equip_passives = json.loads(
            ep_path.read_text(encoding="utf-8"))["names"]

    tech_by_id = {n["id"]: n for n in tree}
    tech_by_name: dict[str, list[dict]] = {}
    for n in tree:
        tech_by_name.setdefault(n["name"], []).append(n)

    counts = {
        "recipeRows": 0, "recipeRefusals": 0, "withRecipe": 0,
        "tech": 0, "techRefusals": 0, "descs": 0, "descRefusals": 0,
        "drops": 0, "boxes": 0, "shops": 0, "capture": 0,
        "tierCrafts": 0, "tierCraftRefusals": 0,
    }
    name_to_id: dict[str, str] = {}
    for iid, it in items.items():
        if it.get("category") == "Blueprint" or not it.get("name"):
            continue
        prev = name_to_id.get(it["name"])
        if prev is not None:
            # same name on several ids: keep the family base (lowest rarity)
            if (items[prev].get("rarity") or 0) <= (it.get("rarity") or 0):
                continue
        name_to_id[it["name"]] = iid

    MAT_LINE = re.compile(r"^(.+?) (\d[\d,]*)$")

    def parse_tier_craft(row: dict, page_ids: list[str]) -> dict | None:
        """A Production row proves its own tier: the product id and the
        schematic id ride in the row's hovers; materials parse from the
        row text and every name must resolve against the backbone — no
        positional assumptions (those failed on half the catalogue)."""
        hovers = [h[len("Items/"):] for h in row.get("h", [])
                  if h.startswith("Items/")]
        product = next((h for h in hovers
                        if h in items
                        and items[h].get("category") != "Blueprint"
                        and h in page_ids), None)
        schematic = next((h for h in hovers
                          if h in items
                          and items[h].get("category") == "Blueprint"), None)
        if product is None:
            return None
        mats = []
        for line in row.get("c", [""])[0].split("\n"):
            line = line.strip()
            if not line:
                continue
            if line.startswith("Lv.") or "Lv.1:" in line:
                break
            m = MAT_LINE.match(line)
            if not m:
                return None
            mid = name_to_id.get(m.group(1))
            if mid is None:
                return None
            mats.append({"id": mid, "n": int(m.group(2).replace(",", ""))})
        if not mats:
            return None
        out: dict = {"product": product, "mats": mats}
        if schematic:
            out["schematic"] = schematic
        return out
    unknown_chip_labels: dict[str, int] = {}
    map_objects: dict[str, str] = {}
    map_conflicts: set[str] = set()
    facts: dict[str, dict] = {}

    def validate_recipe(block: list[dict]) -> list[dict] | None:
        rows = []
        for r in block:
            hover = r["hover"]
            if not hover.startswith("Items/"):
                counts["recipeRefusals"] += 1
                return None
            iid = hover[len("Items/"):]
            m = re.fullmatch(r"(\d[\d,]*)", r["count"].replace("×", "").strip())
            if iid not in items or not m:
                counts["recipeRefusals"] += 1
                return None
            rows.append({"id": iid, "n": int(m.group(1).replace(",", ""))})
        counts["recipeRows"] += len(rows)
        return rows or None

    for slug, page in raw["pages"].items():
        ids = page["ids"]
        f: dict = {}

        # ---- recipes: block 0 = the base craft; later blocks are the
        # higher-tier crafts (shown unattributed — tier mapping is not
        # stated by the page, so it is not invented here)
        blocks = []
        for block in page.get("recipes", []):
            v = validate_recipe(block)
            if v:
                blocks.append(v)
        if blocks:
            f["recipe"] = blocks[0]
            if len(blocks) > 1:
                f["recipesMore"] = blocks[1:]
            counts["withRecipe"] += len(ids)

        # ---- technology: exact node join, level agreement enforced
        node = None
        page_lvs = page.get("techLv") or []
        tid = page.get("tech")
        if tid and tid in tech_by_id:
            node = tech_by_id[tid]
        elif not tid:
            by_name = tech_by_name.get(items[ids[0]]["name"], [])
            if len(by_name) == 1:
                node = by_name[0]
        if node and page_lvs and node["level"] not in page_lvs:
            counts["techRefusals"] += 1
            node = None
        if node:
            f["tech"] = {"level": node["level"], "cost": node["cost"]}
            if node["ancient"]:
                f["tech"]["ancient"] = True
            counts["tech"] += 1
        elif len(page_lvs) == 1:
            f["tech"] = {"level": page_lvs[0]}  # level known, cost not joined
            counts["tech"] += 1

        # ---- chips: capture power + curated effects
        chips = page.get("chips", [])
        cap = [v for k, v in chips if k == "Capture Power"]
        if cap:
            # first occurrence is the page's own header card — verified on
            # the one two-value page (Pal Sphere): the second sat inside an
            # embedded "Legendary"-variant popup card further down the body
            f["capture"] = cap[0]
            counts["capture"] += 1
        effects = [[EFFECT_LABELS[k], v] for k, v in chips if k in EFFECT_LABELS]
        if effects:
            seen = set()
            f["effects"] = [e for e in effects
                            if not (tuple(e) in seen or seen.add(tuple(e)))]
        for k, _ in chips:
            if k not in EFFECT_LABELS and k not in (
                    "Attack", "Defense", "Technology", "Capture Power",
                    "Durability", "MagazineSize", "Magazine Size", "HP",
                    "Health",  # per-tier chip noise, excluded on purpose
                    "Shield", "Weight", "Gold Coin", "Price", "Rarity",
                    "SneakAttackRate", "Code"):
                unknown_chip_labels[k] = unknown_chip_labels.get(k, 0) + 1

        # ---- per-tier crafts from Production rows (self-proving joins)
        crafts = []
        for sec in page.get("sections", []):
            if sec["title"] != "Production":
                continue
            for row in sec["rows"]:
                tc = parse_tier_craft(row, ids)
                if tc is None:
                    counts["tierCraftRefusals"] += 1
                elif "schematic" in tc and tc not in crafts:
                    # base-tier rows duplicate `recipe`; only the
                    # schematic tiers carry new, provable attribution
                    crafts.append(tc)
        if crafts:
            f["crafts"] = crafts
            counts["tierCrafts"] += len(crafts)

        # ---- sections -> where to find
        for sec in page.get("sections", []):
            title = sec["title"]
            rows = sec["rows"]
            if title == "Dropped By":
                out = []
                seen: set[tuple] = set()
                for r in rows[:60]:
                    c = r.get("c", [])
                    if len(c) >= 3 and c[0]:
                        row = {"src": player_source(c[0]),
                               "n": c[1], "p": c[2]}
                        key = (row["src"], row["n"], row["p"])
                        if key in seen:
                            continue  # NPC variants collapse to one row
                        seen.add(key)
                        out.append(row)
                if out:
                    f["drops"] = out
                    counts["drops"] += len(out)
            elif title == "Treasure Box":
                out = []
                seen = set()
                for r in rows[:40]:
                    c = r.get("c", [])
                    if len(c) >= 4 and c[0]:
                        row = {"src": player_source(c[0]),
                               "n": c[2], "p": c[3]}
                        key = (row["src"], row["n"], row["p"])
                        if key in seen:
                            continue
                        seen.add(key)
                        out.append(row)
                if out:
                    f["boxes"] = out
                    counts["boxes"] += len(out)
            elif "Merchant" in title:
                names = sorted({player_shop(r["c"][-1]) for r in rows
                                if r.get("c") and r["c"][-1]})
                if names:
                    f.setdefault("shops", [])
                    f["shops"] = sorted(set(f["shops"]) | set(names))
                    counts["shops"] += len(names)

        # ---- rendered description (only for tagged backbone descs)
        desc_html = page.get("descHtml")
        base_desc = items[ids[0]].get("description") or ""
        if desc_html and GAME_TAG.search(base_desc):
            ok = True
            for hover, text in ANCHOR.findall(desc_html):
                hover = urllib.parse.unquote(hover)
                text = clean_text(text)
                if hover.startswith("Items/"):
                    ref = hover[len("Items/"):]
                    if ref in items and items[ref]["name"] != text:
                        ok = False  # paldb text disagrees with the backbone
                        break
                elif hover.startswith("MapObjects/"):
                    ref = hover[len("MapObjects/"):]
                    if map_objects.get(ref, text) != text:
                        map_conflicts.add(ref)
                    else:
                        map_objects[ref] = text
            rendered = clean_text(desc_html)
            if ok and rendered and not GAME_TAG.search(rendered):
                f["desc"] = rendered
                counts["descs"] += len(ids)
            else:
                counts["descRefusals"] += len(ids)

        if f:
            for iid in ids:
                facts[iid] = f

    for ref in map_conflicts:
        map_objects.pop(ref, None)

    tagged = sum(1 for it in items.values()
                 if GAME_TAG.search(it.get("description") or ""))
    payload = {
        "source": {
            "backbone": "items_1_0.json (atlas build 24575149)",
            "pages": "paldb.cc item pages, captured "
                     + date.today().isoformat()
                     + " — stats/recipes/tech/sources accepted only at "
                       "exact internal-id identity with the backbone",
            "descriptions": "the game's own strings; where the raw string "
                            "carries placeholder tags, the shipped text is "
                            "paldb's rendering of the game's name tables, "
                            "cross-checked: every item link's text must "
                            "equal the backbone name for its internal id",
            "tech": "paldb /en/Technologies: level, point cost, ancient "
                    "flag per node; joined to items by the node id each "
                    "item page carries",
        },
        "counts": counts | {"taggedDescriptions": tagged},
        "mapObjectNames": dict(sorted(map_objects.items())),
        # equipment-passive id -> the game's display name ("Cold
        # Resistance Lv. 2"), from the item pages' skill bars at exact
        # identity — the stats layer's raw ids resolve through this
        "equipPassiveNames": dict(sorted(equip_passives.items())),
        "techTreeSize": len(tree),
        "facts": dict(sorted(facts.items())),
    }
    out = json.dumps(payload, indent=1, ensure_ascii=False)
    for p in COPIES:
        p.write_text(out, encoding="utf-8")
    print(f"wrote {len(facts)} fact rows -> {len(COPIES)} copies "
          f"({len(out) // 1024} KB each)")
    print("counts:", json.dumps(counts, indent=1))
    print("mapObjectNames:", len(map_objects),
          "conflicts refused:", len(map_conflicts))
    print("unknown chip labels (review):",
          json.dumps(dict(sorted(unknown_chip_labels.items(),
                                 key=lambda kv: -kv[1])[:20]), indent=1))


if __name__ == "__main__":
    main()
