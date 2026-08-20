#!/usr/bin/env python3
"""Fetch every pal's in-game Paldex description ("about" text).

Source: palworld.wiki.gg MediaWiki API — each pal page carries the game's
Paldex entry verbatim in a {{Palpedia|...}} template. This is the game's own
flavor text (mirrored by the wiki), fetched politely (0.35s between requests,
contact UA). Output: mobile/src/data/about_1_0.json + app/public/data copy.

Run: python tools/fetch_paldex_text.py
"""
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PALS = json.loads((ROOT / "mobile" / "src" / "data" / "pals_1_0.json").read_text(encoding="utf-8"))["pals"]
OUT_MOBILE = ROOT / "mobile" / "src" / "data" / "about_1_0.json"
OUT_WEB = ROOT / "app" / "public" / "data" / "about_1_0.json"

UA = "Palforge-research/1.0 (Palworld companion app; contact palandre.99@gmail.com)"
API = "https://palworld.wiki.gg/api.php?action=parse&prop=wikitext&format=json&page="

def extract_palpedia(wt: str) -> str | None:
    """Balanced-brace extraction: nested templates like {{i|X}} must not
    truncate the capture (they did — reviewer catch 2026-08-15)."""
    start = wt.find("{{Palpedia|")
    if start < 0:
        return None
    i = start + 2
    depth = 1
    while i < len(wt) - 1:
        pair = wt[i:i + 2]
        if pair == "{{":
            depth += 1
            i += 2
        elif pair == "}}":
            depth -= 1
            if depth == 0:
                return wt[start + len("{{Palpedia|"):i]
            i += 2
        else:
            i += 1
    return None


def fetch(page: str) -> str | None:
    url = API + urllib.parse.quote(page)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            d = json.load(r)
    except Exception:
        return None
    wt = d.get("parse", {}).get("wikitext", {}).get("*", "")
    text = extract_palpedia(wt)
    if text is None:
        return None
    text = text.strip()
    # strip wiki markup completely
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)           # editor comments
    text = re.sub(r"</?nowiki>", "", text)
    text = re.sub(r"\{\{i\|([^}]*)\}\}", r"\1", text)          # inline template
    text = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", text)
    text = re.sub(r"<br\s*/?>", " ", text)
    text = re.sub(r"''+", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    # junk gate: anything that still smells of markup is NOT user-ready
    if not text or re.search(r"[{}<>]|\[\[|\]\]", text):
        return None
    return text


def main() -> None:
    existing = {}
    if OUT_MOBILE.exists():
        existing = json.loads(OUT_MOBILE.read_text(encoding="utf-8")).get("about", {})
    about: dict[str, str] = dict(existing)
    missing: list[str] = []
    names = list(PALS)
    for i, name in enumerate(names):
        if name in about:
            continue
        text = fetch(name)
        if text is None:
            # variant pages sometimes use parentheses, e.g. "Jolthog (Cryst)"
            parts = name.rsplit(" ", 1)
            if len(parts) == 2:
                text = fetch(f"{parts[0]} ({parts[1]})")
        if text:
            about[name] = text
        else:
            missing.append(name)
        if (i + 1) % 25 == 0:
            print(f"{i + 1}/{len(names)} fetched, {len(missing)} missing so far")
        time.sleep(0.35)

    payload = {
        "game_version": "1.0",
        "fetched": time.strftime("%Y-%m-%d"),
        "source": "palworld.wiki.gg Palpedia template (the game's own Paldex text)",
        "about": dict(sorted(about.items())),
        "missing": sorted(missing),
    }
    txt = json.dumps(payload, indent=1, ensure_ascii=False) + "\n"
    OUT_MOBILE.write_text(txt, encoding="utf-8")
    OUT_WEB.write_text(txt, encoding="utf-8")
    print(f"done: {len(about)} descriptions, {len(missing)} missing")
    if missing:
        print("missing:", ", ".join(missing[:20]))


if __name__ == "__main__":
    main()
