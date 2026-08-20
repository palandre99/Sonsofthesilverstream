#!/usr/bin/env python3
"""Fetch every item's icon and pack them into sprite sheets.

The CEO's order (2026-08-18): "Everything needs a square for the image of
the item." 722 unique icon names cover the 1,892-item catalogue. They
CANNOT ship as individual files — EAS hard-caps 1000 assets per update
and the cap already broke publishing once — so they ship as a few big
sheets plus a generated coordinate map.

URL discovery is exact, never guessed: for each unique icon name, one
representative item's paldb page is fetched and its og:image meta tag
names the precise texture URL. Icons download once and are composed into
2048x2048 sheets of 96px cells (441 per sheet). Output:
  mobile/assets/itemicons/sheet0.png, sheet1.png ...
  mobile/src/data/itemIcons.g.ts   (icon name -> sheet/cell coordinates)

    python3 tools/fetch_item_icons.py
"""
import io
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "tools" / ".cache" / "itemicons"
SHEET_DIR = ROOT / "mobile" / "assets" / "itemicons"
MAP_OUT = ROOT / "mobile" / "src" / "data" / "itemIcons.g.ts"
UA = "PalforgeDataPipeline/1.0 (companion app; contact: palandre.99@gmail.com)"
OG_IMG = re.compile(r'<meta property="og:image" content="([^"]+)"')
# some pages (Coal, Dog Coin) serve a generic T_icon_unknown og:image while
# the page HEADER still shows the real texture — probed 2026-08-19
HEADER_IMG = re.compile(
    r'<img[^>]*src="([^"]+)"[^>]*class="align-self-center size128"')
CELL = 96
PER_ROW = 21          # 21 * 96 = 2016 <= 2048
PER_SHEET = PER_ROW * PER_ROW

# Six icons the first sweep never resolved, leaving 13 items on the
# placeholder (audited 2026-08-20). Three simply lost their fetch to the
# sweep's own throttling and work on a retry; the other three are filed
# on paldb under a DIFFERENT name than our backbone carries:
#   Shield_05        our "Shield Ultra"  -> page "Ultra Shield"
#   Glider_Legendary our "Glider Tera"   -> page "Glider Legendary"
#   GrapplingGun     our "GrapplingGun"  -> page "Grappling Gun"
# Every one of these was verified by EXACT IDENTITY, not by looking:
# the page's own image filename carries the icon id we are asking for
# (T_itemicon_Armor_Shield_05.webp for Shield_05), and `identity_ok`
# below refuses the download unless it does. A page name is a lookup
# key, never evidence on its own.
PAGE_NAME_OVERRIDES: dict[str, str] = {
    "Octavia001_Armor": "V1 Armor",
    "Octavia002_Armor": "V2 Armor",
    "Launcher_Meteor": "Meteor Launcher",
    "Shield_05": "Ultra Shield",
    "Glider_Legendary": "Glider Legendary",
    "GrapplingGun": "Grappling Gun",
}


def identity_ok(url: str, icon: str) -> bool:
    """The texture must name the very icon we asked for."""
    tail = url.rsplit("/", 1)[-1]
    return tail.endswith(f"_{icon}.webp") or tail == f"{icon}.webp"


def slug_for(name: str) -> str:
    # Full percent-encoding of the underscore slug — same fixes as the page
    # sweep: raw 'é'/':'/'[' URLs failed, the encoded forms all serve
    # pages, and paldb DROPS apostrophes (Anubiss_Talisman, not %27).
    return urllib.parse.quote(
        name.replace("'", "").replace("’", "").replace(" ", "_"), safe="")


def fetch(url: str, referer: bool = False) -> bytes | None:
    headers = {"User-Agent": UA}
    if referer:
        headers["Referer"] = "https://paldb.cc/"
    req = urllib.request.Request(url, headers=headers)
    for attempt in (1, 2):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read()
        except Exception:  # noqa: BLE001
            if attempt == 2:
                return None
            time.sleep(2)
    return None


def main() -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    SHEET_DIR.mkdir(parents=True, exist_ok=True)
    items = json.loads(
        (ROOT / "data" / "items_1_0.json").read_text(encoding="utf-8"))["items"]

    # one representative item per unique icon name
    rep: dict[str, str] = {}
    for iid, it in items.items():
        if it.get("icon") and it["icon"] not in rep:
            rep[it["icon"]] = it["name"]
    print(f"{len(rep)} unique icons to resolve", flush=True)

    resolved: dict[str, Path] = {}
    misses: list[str] = []
    for i, (icon, name) in enumerate(sorted(rep.items()), 1):
        out = CACHE / f"{icon}.webp"
        if out.exists():
            resolved[icon] = out
            continue
        override = PAGE_NAME_OVERRIDES.get(icon)
        page = fetch(f"https://paldb.cc/en/{slug_for(override or name)}")
        url = None
        if page is not None:
            text = page.decode("utf-8", "replace")
            m = OG_IMG.search(text)
            if m and "itemicon" in m.group(1).lower():
                url = m.group(1)
            else:
                m = HEADER_IMG.search(text)
                if m and "InventoryItemIcon" in m.group(1):
                    url = m.group(1)
        # an override sent us to a page this item does not own, so the
        # image has to prove it belongs to this icon before we keep it
        if url and override and not identity_ok(url, icon):
            print(f"  REFUSED {icon}: {override!r} served {url}", flush=True)
            url = None
        if url:
            img = fetch(url, referer=True)
            if img:
                out.write_bytes(img)
                resolved[icon] = out
        if icon not in resolved:
            misses.append(icon)
        if i % 50 == 0:
            print(f"  {i}/{len(rep)} ({len(misses)} misses)", flush=True)
        time.sleep(0.6)

    print(f"resolved {len(resolved)}, missed {len(misses)}", flush=True)

    # compose sheets — deterministic order so reruns are stable
    order = sorted(resolved)
    coords: dict[str, tuple[int, int, int]] = {}
    sheets: list[Image.Image] = []
    for idx, icon in enumerate(order):
        sheet_i, cell_i = divmod(idx, PER_SHEET)
        while len(sheets) <= sheet_i:
            sheets.append(Image.new("RGBA", (PER_ROW * CELL, PER_ROW * CELL), (0, 0, 0, 0)))
        row, col = divmod(cell_i, PER_ROW)
        try:
            img = Image.open(io.BytesIO(resolved[icon].read_bytes())).convert("RGBA")
        except Exception:  # noqa: BLE001 - unreadable file -> treat as miss
            misses.append(icon)
            continue
        img.thumbnail((CELL, CELL), Image.LANCZOS)
        dx = col * CELL + (CELL - img.width) // 2
        dy = row * CELL + (CELL - img.height) // 2
        sheets[sheet_i].paste(img, (dx, dy))
        coords[icon] = (sheet_i, col, row)

    for old in SHEET_DIR.glob("sheet*.png"):
        old.unlink()  # superseded by the webp sheets
    for i, sheet in enumerate(sheets):
        p = SHEET_DIR / f"sheet{i}.webp"
        # webp at q90: the same sheets at roughly a third of the PNG bytes
        # (the first PNG cut was 6.7 MB of OTA download)
        sheet.save(p, quality=90, method=6)
        print(f"wrote {p} ({p.stat().st_size // 1024} KB)", flush=True)

    lines = [
        "/** GENERATED by tools/fetch_item_icons.py — DO NOT EDIT.",
        " *",
        " * Item icons packed into sprite sheets (96px cells, 21 per row) —",
        " * individual files would trip EAS's 1000-asset cap. Each entry is",
        " * [sheet, column, row]; URLs were resolved from each item page's",
        " * own og:image tag, never guessed. Missing icons simply have no",
        " * entry and the UI shows its designed placeholder. */",
        "",
        "/* eslint-disable @typescript-eslint/no-require-imports */",
        f"export const ICON_CELL = {CELL};",
        f"export const ICONS_PER_ROW = {PER_ROW};",
        "export const ITEM_ICON_SHEETS: number[] = [",
        *(f"  require('../../assets/itemicons/sheet{i}.webp')," for i in range(len(sheets))),
        "];",
        "export const ITEM_ICON_COORDS: Record<string, [number, number, number]> = "
        + json.dumps({k: list(v) for k, v in coords.items()}, separators=(",", ":"))
        + ";",
        "",
    ]
    MAP_OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"wrote {MAP_OUT} ({len(coords)} icons on {len(sheets)} sheets); "
          f"{len(set(misses))} missing: {sorted(set(misses))[:10]}", flush=True)


if __name__ == "__main__":
    main()
