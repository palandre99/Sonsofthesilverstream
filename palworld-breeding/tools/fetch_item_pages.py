#!/usr/bin/env python3
"""Sweep every paldb item page and capture ALL its facts raw, in one pass.

Grew out of fetch_item_recipes.py (I1c) on the CEO's 2026-08-18 order:
"Crafting often requires lvl and technology pts etc also. Everything
should be here. A proper proper info for every single item in the game."
One sweep now captures, per page, everything the item card needs:

  chips     header stat chips as [label, value] pairs — Attack, Defense,
            Technology, Capture Power, Nutrition, SAN, Work Speed... —
            kept raw, interpreted only at the validating merge
  tech      the page's Technology node id (?s=Technology%2F<id>) — joins
            EXACTLY to /en/Technologies' node list (level + point cost +
            ancient flag), probed 2026-08-18: 588 nodes, all costed
  techLv    every "Technology Lv. N" string (crafting table, validation)
  recipes   ingredient rows with INTERNAL ids from data-hover — the
            contiguous-row parser proven on the live Cake page (5 Flour /
            8 Red Berries / 7 Milk / 8 Egg / 2 Honey, matches the
            Reference tab's verified recipe)
  sections  every titled card table raw: Treasure Box (source / map /
            qty / DROP RATE), shop listings, dropped-by, used-in — row
            cells as text plus any internal ids found in the row
  icon      the page's og:image texture URL (backs up the icon pipeline)
  descHtml  the rendered description block RAW — 1,306 backbone
            descriptions carry the game's placeholder tags (<itemName
            id=|Pan|/>...); paldb renders them substituted AND keeps each
            substitution's internal id in data-hover (Items/Pan -> Bread,
            MapObjects/WeaponFactory_Dirty_02 -> Weapon Assembly Line), so
            the merge can both validate the Items subset against the
            backbone and harvest the map-object names we lack

Capture only — no interpretation here. The validating merge is a separate
reviewed step. Raw output: tools/.cache/item_pages_raw.json

    python3 tools/fetch_item_pages.py
"""
import html
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "tools" / ".cache" / "item_pages_raw.json"
UA = "PalforgeDataPipeline/1.0 (companion app; contact: palandre.99@gmail.com)"

# The first sweep captured ZERO recipes: the old block regex terminated at
# the FIRST `</div>\s*</div>` — the end of the first ROW in pretty-printed
# HTML. Now: contiguous row matches per recipes container; a gap larger
# than one row's markup means we left the ingredient list.
ROW = re.compile(
    r'data-hover="\?s=([^"]+)"[^>]*>(?:<img[^>]*/>)?([^<]*)</a></div>\s*<div>([^<]*)</div>')
ROW_GAP = 900

CHIP = re.compile(
    r'<span class="bg-dark bg-gradient p-1">(?:<span[^>]*>)?([^<]+?)(?:</span>)?'
    r'</span><span class="border p-1">([^<]+)</span>')
TECH_ID = re.compile(r'\?s=Technology%2F([^"&]+)')
TECH_LV = re.compile(r'Technology Lv\. (\d+)')
OG_IMG = re.compile(r'<meta property="og:image" content="([^"]+)"')
DESC = re.compile(r'<div class="card-body py-2">\s*<div>(.*?)</div>', re.S)
H5 = re.compile(r'<h5 class="card-title[^"]*"[^>]*>(.*?)</h5>', re.S)
TAG = re.compile(r'<[^>]+>')
HOVER_ID = re.compile(r'data-hover="\?s=([^"]+)"')
MAX_ROWS = 150


def slug_for(name: str) -> str:
    # Full percent-encoding of the underscore slug: urllib refuses raw
    # non-ASCII URLs (Sauté) and paldb 404s bare ':' and '[' — probing all
    # three first-run failure classes encoded showed 200 + a recipes block.
    # Apostrophes are DROPPED by paldb ("Anubis's Talisman" lives at
    # Anubiss_Talisman; %27 is a 404) — probed 2026-08-19, all 104
    # second-run errors were this one pattern.
    return urllib.parse.quote(
        name.replace("'", "").replace("’", "").replace(" ", "_"), safe="")


def fetch(slug: str) -> tuple[str | None, str | None]:
    req = urllib.request.Request(
        f"https://paldb.cc/en/{slug}", headers={"User-Agent": UA})
    err = "unreachable"
    for attempt in (1, 2, 3):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode("utf-8", "replace"), None
        except urllib.error.HTTPError as ex:
            err = f"HTTP {ex.code}"
            if ex.code == 404:
                return None, err  # a missing page won't appear on retry
            time.sleep(6 * attempt)  # 429/5xx: back off and try again
        except Exception as ex:  # noqa: BLE001
            err = str(ex)
            time.sleep(3)
    return None, err


def recipes_of(page: str) -> list[list[dict]]:
    out = []
    for seg in page.split('<div class="recipes">')[1:]:
        rows = []
        pos = 0
        for m in ROW.finditer(seg):
            if m.start() - pos > ROW_GAP:
                break  # past the ingredient list
            rows.append({
                "hover": urllib.parse.unquote(m.group(1)),
                "name": m.group(2).strip(),
                "count": m.group(3).strip(),
            })
            pos = m.end()
        if rows:
            out.append(rows)
    return out


def clean(cell: str) -> str:
    return html.unescape(TAG.sub("", cell)).strip()


def sections_of(page: str) -> list[dict]:
    """Every titled card table: header cells + rows (text cells + internal
    ids). Raw — the merge decides what each section means."""
    out = []
    parts = H5.split(page)  # [pre, title1, chunk1, title2, chunk2, ...]
    for i in range(1, len(parts) - 1, 2):
        title = clean(parts[i])
        chunk = parts[i + 1]
        t0 = chunk.find("<table")
        if t0 < 0:
            continue
        table = chunk[t0:chunk.find("</table>", t0)]
        head: list[str] = []
        rows: list[dict] = []
        for rhtml in table.split("<tr")[1:]:
            if "<th" in rhtml and not rows:
                head = [clean(c) for c in re.split(r"<th[^>]*>", rhtml)[1:]]
                continue
            cells = [clean(c) for c in re.split(r"<td[^>]*>", rhtml)[1:]]
            hovers = [urllib.parse.unquote(h) for h in HOVER_ID.findall(rhtml)]
            if cells:
                rows.append({"c": cells, "h": hovers} if hovers else {"c": cells})
        if rows:
            sec = {"title": title, "rows": rows[:MAX_ROWS]}
            if head:
                sec["head"] = head
            if len(rows) > MAX_ROWS:
                sec["truncated"] = len(rows) - MAX_ROWS
            out.append(sec)
    return out


def main() -> None:
    import sys
    items = json.loads(
        (ROOT / "data" / "items_1_0.json").read_text(encoding="utf-8"))["items"]
    slugs: dict[str, list[str]] = {}
    for iid, it in items.items():
        slugs.setdefault(slug_for(it["name"]), []).append(iid)
    print(f"{len(slugs)} unique pages for {len(items)} items", flush=True)

    raw: dict[str, dict] = {}
    errors: dict[str, str] = {}
    if "--retry-errors" in sys.argv and OUT.exists():
        # errata mode: keep everything already captured, re-fetch only the
        # pages whose slugs failed last run (fixed slug_for gives them new
        # slugs, so "not yet in raw" is exactly the retry set)
        prev = json.loads(OUT.read_text(encoding="utf-8"))
        raw = prev["pages"]
        slugs = {s: ids for s, ids in slugs.items() if s not in raw}
        print(f"errata mode: {len(slugs)} pages to retry", flush=True)
    for i, (slug, ids) in enumerate(sorted(slugs.items()), 1):
        page, err = fetch(slug)
        if page is None:
            errors[slug] = err or "?"
        else:
            rec: dict = {"ids": ids}
            chips = CHIP.findall(page)
            if chips:
                rec["chips"] = [[html.unescape(a).strip(), html.unescape(b).strip()]
                                for a, b in chips]
            m = TECH_ID.search(page)
            if m:
                rec["tech"] = urllib.parse.unquote(m.group(1))
            lv = TECH_LV.findall(page)
            if lv:
                rec["techLv"] = sorted(set(int(x) for x in lv))
            recipes = recipes_of(page)
            if recipes:
                rec["recipes"] = recipes
            sections = sections_of(page)
            if sections:
                rec["sections"] = sections
            m = OG_IMG.search(page)
            if m:
                rec["icon"] = m.group(1)
            m = DESC.search(page)
            if m:
                rec["descHtml"] = m.group(1)[:4000]
            raw[slug] = rec
        if i % 100 == 0:
            print(f"  {i}/{len(slugs)} ({len(errors)} errors)", flush=True)
        time.sleep(0.8)

    n_rec = sum(1 for r in raw.values() if r.get("recipes"))
    n_tech = sum(1 for r in raw.values() if "tech" in r or "techLv" in r)
    n_src = sum(1 for r in raw.values() if r.get("sections"))
    OUT.write_text(json.dumps(
        {"pages": raw, "errors": errors,
         "counts": {"pages": len(raw), "withRecipes": n_rec,
                    "withTech": n_tech, "withSections": n_src}},
        indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {OUT}: {len(raw)} pages ({n_rec} recipes, {n_tech} tech, "
          f"{n_src} sectioned), {len(errors)} errors", flush=True)


if __name__ == "__main__":
    main()
