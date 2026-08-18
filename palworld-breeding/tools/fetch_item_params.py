#!/usr/bin/env python3
"""Sweep paldb's raw parameter cards for every stat-carrying item.

Phase I1b of the Items fane (documents/09_ITEMS_PLAN.md). paldb.cc — the
project's trusted game-table mirror — renders each item page with the raw
DT parameter card per rarity variant. This tool CAPTURES; the merge step
validates each card against the atlas backbone (name+rarity+price identity)
before anything ships, in a separate reviewed pass.

Capture format: for each unique display name in the stat categories
(Weapon, SpecialWeapon, Armor, Accessory, Ammo, Glider,
CaptureItemModifier), the page's flat key/value stream chunked into cards
at each "Rarity" key. Raw output goes to tools/.cache/item_params_raw.json
— NOT to data/; nothing here is shipped unreviewed.

    python3 tools/fetch_item_params.py
"""
import html
import json
import re
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "tools" / ".cache" / "item_params_raw.json"
UA = "PalforgeDataPipeline/1.0 (companion app; contact: palandre.99@gmail.com)"

CATEGORIES = [
    "Weapon", "SpecialWeapon", "Armor", "Accessory", "Ammo", "Glider",
    "CaptureItemModifier",
]
ROW_MARK = 'justify-content-between p-2 align-items-center border-bottom'
TEXT_RUN = re.compile(r">([^<>]+)<")


def slug_for(name: str) -> str:
    return (name.replace(" ", "_").replace("&", "%26").replace(",", "%2C"))


def fetch(slug: str) -> tuple[str | None, str | None]:
    req = urllib.request.Request(
        f"https://paldb.cc/en/{slug}", headers={"User-Agent": UA})
    for attempt in (1, 2):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode("utf-8", "replace"), None
        except urllib.error.HTTPError as ex:
            return None, f"HTTP {ex.code}"
        except Exception as ex:  # noqa: BLE001
            if attempt == 2:
                return None, str(ex)
            time.sleep(3)
    return None, "unreachable"


def cards_of(page: str) -> list[dict[str, str]]:
    """The page's param rows as cards, split at each 'Rarity' key. The value
    is texts[1] (the run right after the key), never texts[-1] — trailing
    runs can belong to a neighbouring section (probed on Assault_Rifle)."""
    pairs: list[tuple[str, str]] = []
    for chunk in page.split(ROW_MARK)[1:]:
        texts = [t.strip() for t in TEXT_RUN.findall(chunk[:1200]) if t.strip()]
        if len(texts) >= 2:
            pairs.append((texts[0], texts[1]))
    cards: list[dict[str, str]] = []
    cur: dict[str, str] | None = None
    for k, v in pairs:
        if k == "Rarity":
            cur = {}
            cards.append(cur)
        if cur is not None and k not in cur:
            cur[k] = html.unescape(v)
    return cards


def main() -> None:
    items = json.loads(
        (ROOT / "data" / "items_1_0.json").read_text(encoding="utf-8"))["items"]
    names: dict[str, list[str]] = {}
    for iid, it in items.items():
        if it["category"] in CATEGORIES:
            names.setdefault(it["name"], []).append(iid)
    print(f"{len(names)} unique pages for {sum(len(v) for v in names.values())} items")

    raw: dict[str, dict] = {}
    errors: dict[str, str] = {}
    for i, (name, ids) in enumerate(sorted(names.items()), 1):
        page, err = fetch(slug_for(name))
        if page is None:
            errors[name] = err or "?"
        else:
            raw[name] = {"ids": ids, "cards": cards_of(page)}
        if i % 40 == 0:
            print(f"  {i}/{len(names)} ({len(errors)} errors)", flush=True)
        time.sleep(0.8)

    OUT.write_text(json.dumps(
        {"fetched": len(raw), "errors": errors, "pages": raw},
        indent=1, ensure_ascii=False), encoding="utf-8")
    carded = sum(1 for p in raw.values() if p["cards"])
    print(f"wrote {OUT}: {len(raw)} pages, {carded} with cards, "
          f"{len(errors)} errors")
    for n, e in list(errors.items())[:20]:
        print(f"  ERROR {n}: {e}")


if __name__ == "__main__":
    main()
