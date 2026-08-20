#!/usr/bin/env python3
"""Merge the captured paldb parameter cards into the shipped item stats.

VALIDATION DOCTRINE (documents/09_ITEMS_PLAN.md): a card ships only when
its identity is EXACT — the card's own `Code` field must equal the atlas
backbone id — and its Rank and price must agree with the backbone row.
Any disagreement is refused and reported, never shipped. The 13 items
whose pages the name-sweep missed get targeted retries with alternate
slugs, accepted only on the same Code match.

Emits data/item_stats_1_0.json (three copies moved together): per item —
atk, durability, magazine, def, hp, shield, passives[], sneak. Fields the
card does not carry stay absent, never invented.

    python3 tools/gen_item_stats.py
"""
import html
import json
import re
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "tools" / ".cache" / "item_params_raw.json"
COPIES = [
    ROOT / "data" / "item_stats_1_0.json",
    ROOT / "mobile" / "src" / "data" / "item_stats_1_0.json",
    ROOT / "app" / "public" / "data" / "item_stats_1_0.json",
]
UA = "PalforgeDataPipeline/1.0 (companion app; contact: palandre.99@gmail.com)"
CATS = {"Weapon", "SpecialWeapon", "Armor", "Accessory", "Ammo", "Glider",
        "CaptureItemModifier"}
ROW_MARK = 'justify-content-between p-2 align-items-center border-bottom'
TEXT_RUN = re.compile(r">([^<>]+)<")


def cards_of(page: str) -> list[dict[str, str]]:
    pairs = []
    for chunk in page.split(ROW_MARK)[1:]:
        texts = [t.strip() for t in TEXT_RUN.findall(chunk[:1200]) if t.strip()]
        if len(texts) >= 2:
            pairs.append((texts[0], texts[1]))
    cards, cur = [], None
    for k, v in pairs:
        if k == "Rarity":
            cur = {}
            cards.append(cur)
        if cur is not None and k not in cur:
            cur[k] = html.unescape(v)
    return cards


def fetch_cards(slug: str) -> list[dict[str, str]]:
    req = urllib.request.Request(
        f"https://paldb.cc/en/{slug}", headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return cards_of(r.read().decode("utf-8", "replace"))
    except Exception:  # noqa: BLE001
        return []


def retry_slugs(iid: str, name: str) -> list[str]:
    out = []
    if "(" in name:  # Beginner Fishing Rod (Chillet)
        out.append(name.replace(" ", "_").replace("(", "%28").replace(")", "%29"))
    # GrapplingGun2 -> Grappling_Gun_2 / Grappling_Gun2 ; GliderTera etc.
    spaced = re.sub(r"(?<=[a-z])(?=[A-Z])", "_", name)
    spaced = re.sub(r"(?<=[A-Za-z])(?=\d)", "_", spaced)
    for cand in {spaced, spaced.replace("_", " ").strip().replace(" ", "_")}:
        if cand and cand != name.replace(" ", "_"):
            out.append(cand)
    return out


def num(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        try:
            return float(v)
        except (TypeError, ValueError):
            return None


def main() -> None:
    raw = json.loads(RAW.read_text(encoding="utf-8"))
    backbone = json.loads(
        (ROOT / "data" / "items_1_0.json").read_text(encoding="utf-8"))["items"]
    target = {i for i, it in backbone.items() if it["category"] in CATS}

    by_code: dict[str, dict] = {}
    for page in raw["pages"].values():
        for card in page["cards"]:
            code = card.get("Code")
            if code and code not in by_code:
                by_code[code] = card

    # targeted retries for ids the sweep missed
    missing = sorted(target - set(by_code))
    print(f"retrying {len(missing)} missing ids")
    for iid in missing:
        for slug in retry_slugs(iid, backbone[iid]["name"]):
            got = False
            for card in fetch_cards(slug):
                code = card.get("Code")
                if code and code not in by_code:
                    by_code[code] = card
                    got = got or code == iid
            time.sleep(0.8)
            if iid in by_code:
                print(f"  recovered {iid} via {slug}")
                break

    stats: dict[str, dict] = {}
    refused: list[str] = []
    for iid in sorted(target & set(by_code)):
        card = by_code[iid]
        b = backbone[iid]
        rank = num(card.get("Rank"))
        price = num(card.get("Gold Coin"))
        if rank is not None and b["rank"] is not None and rank != b["rank"]:
            refused.append(f"{iid}: rank {rank} != backbone {b['rank']}")
            continue
        if price is not None and b["price"] is not None and price != b["price"]:
            refused.append(f"{iid}: price {price} != backbone {b['price']}")
            continue
        row: dict = {}
        # the card's Rarity WORD (Common..Legendary) — the game's own tier
        # naming, which the numeric backbone rarity does not carry
        if card.get("Rarity"):
            row["tier"] = card["Rarity"]
        for src, dst in [("Attack", "atk"), ("Durability", "durability"),
                         ("MagazineSize", "magazine"), ("Defense", "def"),
                         ("Health", "hp"), ("Shield", "shield"),
                         ("SneakAttackRate", "sneak")]:
            v = num(card.get(src))
            if v is not None:
                row[dst] = v
        passives = [card[k] for k in
                    ("PassiveSkillName", "PassiveSkillName2", "PassiveSkillName3")
                    if card.get(k)]
        if passives:
            row["passives"] = passives
        if row:
            stats[iid] = row

    payload = {
        "source": (
            "paldb.cc per-item raw parameter cards (live game-table mirror, "
            "fetched 2026-08-18); each row shipped only when the card's own "
            "Code equals the atlas backbone id AND its Rank/price agree with "
            "build 24575149. Refusals are counted, never shipped."),
        "count": len(stats),
        "refused": refused,
        "stillMissing": sorted(target - set(by_code)),
        "stats": stats,
    }
    for path in COPIES:
        path.write_text(
            json.dumps(payload, indent=1, ensure_ascii=False), encoding="utf-8")
        print(f"wrote {path}")
    print(f"{len(stats)} stat rows | refused {len(refused)} | "
          f"still missing {len(payload['stillMissing'])}")
    for x in refused[:10]:
        print("  REFUSED", x)
    for x in payload["stillMissing"][:10]:
        print("  MISSING", x, backbone[x]["name"])


if __name__ == "__main__":
    main()
