#!/usr/bin/env python3
"""Second pass for pals whose wiki page name differs from the dataset name:
ask the wiki's own search for the page title, then pull its Palpedia text.
Merges results into about_1_0.json (both copies). Run after fetch_paldex_text."""
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

import importlib.util

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("fp", ROOT / "tools" / "fetch_paldex_text.py")
fp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fp)  # reuse fetch() and paths

SEARCH = "https://palworld.wiki.gg/api.php?action=query&list=search&format=json&srlimit=3&srsearch="


def find_page(name: str) -> str | None:
    req = urllib.request.Request(SEARCH + urllib.parse.quote(name), headers={"User-Agent": fp.UA})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            d = json.load(r)
    except Exception:
        return None
    hits = d.get("query", {}).get("search", [])
    return hits[0]["title"] if hits else None


def main() -> None:
    data = json.loads(fp.OUT_MOBILE.read_text(encoding="utf-8"))
    about, missing = data["about"], data["missing"]
    still: list[str] = []
    for name in missing:
        page = find_page(name)
        text = fp.fetch(page) if page else None
        if text:
            about[name] = text
            print(f"{name} <- '{page}': ok")
        else:
            still.append(name)
            print(f"{name}: STILL MISSING (search gave {page!r})")
        time.sleep(0.4)
    data["about"] = dict(sorted(about.items()))
    data["missing"] = sorted(still)
    txt = json.dumps(data, indent=1, ensure_ascii=False) + "\n"
    fp.OUT_MOBILE.write_text(txt, encoding="utf-8")
    fp.OUT_WEB.write_text(txt, encoding="utf-8")
    print(f"done: {len(about)} total, {len(still)} still missing")


if __name__ == "__main__":
    main()
