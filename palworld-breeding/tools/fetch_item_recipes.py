#!/usr/bin/env python3
"""Sweep paldb's recipe sections for the whole item catalogue.

Phase I1c capture (documents/09_ITEMS_PLAN.md). Each paldb item page
renders crafting recipes as a `<div class="recipes">` block whose rows
link ingredients with their INTERNAL id in the data-hover attribute
("?s=Items%2FFlour" -> Flour) plus a count — exact identity for every
ingredient, same doctrine as the stats layer. Technology levels are NOT
taken from item pages (the marker proved unstable across fetches); they
come from the single Technology tree page in the merge step.

Capture only: raw recipe rows per unique page slug go to
tools/.cache/item_recipes_raw.json for a reviewed, validated merge.

    python3 tools/fetch_item_recipes.py
"""
import json
import re
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "tools" / ".cache" / "item_recipes_raw.json"
UA = "PalforgeDataPipeline/1.0 (companion app; contact: palandre.99@gmail.com)"

# The first sweep captured ZERO recipes: the old block regex terminated at
# the FIRST `</div>\s*</div>` — which in the pretty-printed HTML is the end
# of the first row, eating the count's closing tag the row regex needed.
# Now: split at each recipes container and take CONTIGUOUS row matches —
# a gap larger than one row's markup means we left the ingredient list
# (which also keeps "recipes that USE this item" lists from bleeding in).
ROW = re.compile(
    r'data-hover="\?s=([^"]+)"[^>]*>(?:<img[^>]*/>)?([^<]*)</a></div>\s*<div>([^<]*)</div>')
ROW_GAP = 900


def slug_for(name: str) -> str:
    return (name.replace(" ", "_").replace("&", "%26").replace(",", "%2C")
            .replace("(", "%28").replace(")", "%29"))


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


def recipes_of(page: str) -> list[list[dict]]:
    out = []
    for seg in page.split('<div class="recipes">')[1:]:
        rows = []
        pos = 0
        for m in ROW.finditer(seg):
            if m.start() - pos > ROW_GAP:
                break  # past the ingredient list
            rows.append({
                "hover": urllib.request.unquote(m.group(1)),
                "name": m.group(2).strip(),
                "count": m.group(3).strip(),
            })
            pos = m.end()
        if rows:
            out.append(rows)
    return out


def main() -> None:
    items = json.loads(
        (ROOT / "data" / "items_1_0.json").read_text(encoding="utf-8"))["items"]
    slugs: dict[str, list[str]] = {}
    for iid, it in items.items():
        slugs.setdefault(slug_for(it["name"]), []).append(iid)
    print(f"{len(slugs)} unique pages for {len(items)} items", flush=True)

    raw: dict[str, dict] = {}
    errors: dict[str, str] = {}
    for i, (slug, ids) in enumerate(sorted(slugs.items()), 1):
        page, err = fetch(slug)
        if page is None:
            errors[slug] = err or "?"
        else:
            rec = recipes_of(page)
            if rec:
                raw[slug] = {"ids": ids, "recipes": rec}
        if i % 100 == 0:
            print(f"  {i}/{len(slugs)} ({len(raw)} with recipes, "
                  f"{len(errors)} errors)", flush=True)
        time.sleep(0.7)

    OUT.write_text(json.dumps(
        {"withRecipes": len(raw), "errors": errors, "pages": raw},
        indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {OUT}: {len(raw)} pages with recipes, {len(errors)} errors",
          flush=True)


if __name__ == "__main__":
    main()
