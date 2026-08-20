#!/usr/bin/env python3
"""Capture paldb's /en/Technologies tree raw: every unlockable with its
level, POINT COST and ancient flag.

The CEO's requirement (2026-08-18): "Crafting often requires lvl and
technology pts etc also. Everything should be here." The tree page is
fully server-rendered (probed 2026-08-18: 588 nodes, each with a
hoverTechCost badge; 51 carry the BossTechnology class = Ancient
Technology, i.e. paid with ancient tech points). Node ids join EXACTLY to
the Technology ids item pages carry (probed: Battle_RangeWeapon_
AssaultRifle appears in both).

Capture only — raw nodes to tools/.cache/tech_tree_raw.json; the
validating merge is a separate reviewed step.

    python3 tools/fetch_tech_tree.py
"""
import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "tools" / ".cache" / "tech_tree_raw.json"
UA = "PalforgeDataPipeline/1.0 (companion app; contact: palandre.99@gmail.com)"

LEVEL = re.compile(r'style="width:32px;"><div>(\d+)</div>')
NODE = re.compile(
    r'<div class="d-inline-block hoverTech([^"]*)"[^>]*'
    r'data-hover="\?s=Technology/([^"]+)">\s*'
    r'<div class="hoverTechCost badge">(\d+)</div>\s*'
    r'<div class="hoverTechHeader">([^<]*)</div>\s*'
    r'<div class="hoverTechFooter">([^<]*)</div>', re.S)


def main() -> None:
    req = urllib.request.Request(
        "https://paldb.cc/en/Technologies", headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        page = r.read().decode("utf-8", "replace")

    # walk level markers and nodes in document order — each node belongs
    # to the most recent level row above it
    events: list[tuple[int, str, tuple]] = []
    for m in LEVEL.finditer(page):
        events.append((m.start(), "level", (int(m.group(1)),)))
    for m in NODE.finditer(page):
        events.append((m.start(), "node", m.groups()))
    events.sort()

    nodes = []
    level = None
    for _, kind, g in events:
        if kind == "level":
            level = g[0]
        else:
            cls, tid, cost, header, footer = g
            nodes.append({
                "id": tid.strip(),
                "name": footer.strip(),
                "header": header.strip(),
                "level": level,
                "cost": int(cost),
                "ancient": "BossTechnology" in cls,
            })

    assert nodes, "no tech nodes parsed — markup changed"
    no_level = [n["id"] for n in nodes if n["level"] is None]
    assert not no_level, f"nodes before any level row: {no_level[:5]}"
    dup = len(nodes) - len({n["id"] for n in nodes})
    OUT.write_text(json.dumps(
        {"count": len(nodes), "ancient": sum(n["ancient"] for n in nodes),
         "duplicateIds": dup, "nodes": nodes},
        indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {OUT}: {len(nodes)} nodes "
          f"({sum(n['ancient'] for n in nodes)} ancient, {dup} duplicate ids), "
          f"levels {min(n['level'] for n in nodes)}-{max(n['level'] for n in nodes)}",
          flush=True)


if __name__ == "__main__":
    main()
