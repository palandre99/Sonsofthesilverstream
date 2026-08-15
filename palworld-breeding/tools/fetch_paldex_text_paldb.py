#!/usr/bin/env python3
"""Fill the About-text gap from paldb.cc — the pals wiki.gg still lacks.

wiki.gg's Palpedia template covers 272/299 pals; the 27 remaining (mostly
1.0 variants like Univolt Cryst, plus raid bosses like Xenolord) have no
usable wiki page. paldb.cc — already this project's trusted upstream for
icons and the breeding table — mirrors the game's own Paldex entry in its
"Summary" card:  <h5 ...>Summary</h5><div>THE TEXT</div>.

Only names still missing from about_1_0.json are fetched, so the wiki.gg
text keeps priority. Every entry added this way is game text via paldb,
recorded in the payload's `source` field.

    python3 tools/fetch_paldex_text_paldb.py
"""
import html as html_mod
import json
import re
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_MOBILE = ROOT / "mobile" / "src" / "data" / "about_1_0.json"
OUT_WEB = ROOT / "app" / "public" / "data" / "about_1_0.json"
UA = "PalforgeDataPipeline/1.0 (companion app; contact: palandre.99@gmail.com)"

SUMMARY_RE = re.compile(
    r">Summary</h5>\s*<div>(.*?)</div>", re.DOTALL)
TAG_RE = re.compile(r"<[^>]+>")


def clean(fragment: str) -> str:
    """strip tags (keeping link text), unescape entities, collapse space"""
    txt = TAG_RE.sub("", fragment)
    txt = html_mod.unescape(txt)
    txt = re.sub(r"\s+", " ", txt).strip()
    return txt


def fetch(name: str) -> str | None:
    slug = name.replace(" ", "_")
    req = urllib.request.Request(
        f"https://paldb.cc/en/{slug}", headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            page = r.read().decode("utf-8", "replace")
    except Exception as e:  # noqa: BLE001 - report and move on
        print(f"{name}: fetch failed ({e})")
        return None
    m = SUMMARY_RE.search(page)
    if not m:
        print(f"{name}: no Summary card on the page")
        return None
    txt = clean(m.group(1))
    # sanity: real Paldex text is a sentence, not markup junk or a stub
    if len(txt) < 30 or "<" in txt or "{" in txt:
        print(f"{name}: rejected suspicious text: {txt[:60]!r}")
        return None
    return txt


def main() -> int:
    data = json.loads(OUT_MOBILE.read_text(encoding="utf-8"))
    about = data.get("about", {})
    pals = json.loads(
        (ROOT / "data" / "pals_1_0.json").read_text(encoding="utf-8"))["pals"]
    missing = sorted(n for n in pals if n not in about)
    print(f"missing before: {len(missing)}")

    added = 0
    for name in missing:
        txt = fetch(name)
        if txt:
            about[name] = txt
            added += 1
            print(f"{name}: OK ({len(txt)} chars)")
        time.sleep(1.2)  # be a polite guest

    still = sorted(n for n in pals if n not in about)
    data["about"] = dict(sorted(about.items()))
    data["source"] = (
        "palworld.wiki.gg Palpedia template (272) + paldb.cc Summary card "
        "for the wiki gaps (the game's own Paldex text in both cases)")
    data["fetched"] = time.strftime("%Y-%m-%d")
    txt_out = json.dumps(data, indent=1, ensure_ascii=False) + "\n"
    OUT_MOBILE.write_text(txt_out, encoding="utf-8")
    OUT_WEB.write_text(txt_out, encoding="utf-8")
    print(f"added {added}; still missing: {len(still)} {still}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
