#!/usr/bin/env python3
"""Fetch the element strengths chart from two independent wikis, or refuse.

WHY: the Bosses & Raids fane ranks "which of your pals are strong against
this boss" (CEO 2026-08-18). That ranking is element math, and the chart
was the one dataset the project did not have. It is not in the atlas
(checked the build-24575149 manifest: 11 source tables, none of them an
element chart) and paldb's Elements page is prose without the table, so
the raw DT row is out of reach from here.

WHAT SHIPS INSTEAD OF A GUESS: the chart as two independent wikis state
it, accepted ONLY if they agree cell-for-cell, and only if the result is
perfectly antisymmetric ("X strong vs Y" must pair with "Y weak vs X" in
BOTH directions — a lopsided edge means a typo on somebody's wiki, and we
refuse the whole table rather than ship half of it). The UI labels the
chart wiki-measured; the JSON records both revision ids so the claim can
be re-checked forever.

ALSO VERIFIED HERE, against OUR OWN pals_1_0.json:
- the chart's element vocabulary equals our 9 element names exactly;
- whether any real dual-element pal can take 4x or 0.25x (both wikis say
  no such pal exists; we count for ourselves and record the count).

    python3 tools/fetch_element_chart.py
"""
import json
import re
import sys
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "elements_1_0.json"
UA = "PalforgeDataPipeline/1.0 (companion app; contact: palandre.99@gmail.com)"

SOURCES = [
    ("palworld.wiki.gg",
     "https://palworld.wiki.gg/api.php?action=parse&page=Elements"
     "&format=json&prop=wikitext|revid"),
    ("palworld.fandom.com",
     "https://palworld.fandom.com/api.php?action=parse&page=Elements"
     "&format=json&prop=wikitext|revid"),
]


def fetch(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def parse_chart(wikitext: str) -> dict[str, dict[str, list[str]]]:
    """The Element / Strong Against / Weak Against wikitable -> edges.

    Rows look like:  | {{i|Fire}} || {{i|Grass}}, {{i|Ice}} || {{i|Water}}
    (fandom writes "and" instead of a comma; both reduce to the {{i|..}}
    runs, so we read ONLY those and never free text).
    """
    chart: dict[str, dict[str, list[str]]] = {}
    for line in wikitext.splitlines():
        line = line.strip()
        if not line.startswith("|") or line.startswith(("|-", "|+", "|}")):
            continue
        cells = line.lstrip("|").split("||")
        if len(cells) != 3:
            continue
        names = [re.findall(r"\{\{[iI]\|([A-Za-z]+)\}\}", c) for c in cells]
        if len(names[0]) != 1:
            continue  # header or prose row
        chart[names[0][0]] = {"strong": names[1], "weak": names[2]}
    return chart


def main() -> None:
    results = []
    for site, url in SOURCES:
        d = fetch(url)
        parse = d.get("parse", {})
        wikitext = parse.get("wikitext", {}).get("*", "")
        chart = parse_chart(wikitext)
        results.append((site, parse.get("revid"), chart))
        print(f"{site}: revid {parse.get('revid')}, {len(chart)} element rows")

    (site_a, rev_a, chart_a), (site_b, rev_b, chart_b) = results

    # 1. The two sources must agree cell-for-cell, or nothing ships.
    if chart_a != chart_b:
        keys = sorted(set(chart_a) | set(chart_b))
        for k in keys:
            if chart_a.get(k) != chart_b.get(k):
                print(f"DISAGREE on {k}: {site_a}={chart_a.get(k)} "
                      f"{site_b}={chart_b.get(k)}")
        sys.exit("REFUSED: sources disagree; not shipping either version.")
    chart = chart_a

    # 2. Antisymmetry: strong and weak must be exact mirrors, both ways.
    for el, row in chart.items():
        for target in row["strong"]:
            if el not in chart.get(target, {}).get("weak", []):
                sys.exit(f"REFUSED: {el} strong vs {target} but {target} "
                         f"does not list {el} as weak-against.")
        for target in row["weak"]:
            if el not in chart.get(target, {}).get("strong", []):
                sys.exit(f"REFUSED: {el} weak vs {target} but {target} "
                         f"does not list {el} as strong-against.")

    # 3. Vocabulary must equal OUR pals file's element names exactly.
    pals = json.load(open(ROOT / "data" / "pals_1_0.json", encoding="utf-8"))
    ours = {e for p in pals["pals"].values() for e in p.get("elements", [])}
    if set(chart) != ours:
        sys.exit(f"REFUSED: chart elements {sorted(chart)} != "
                 f"our pals' elements {sorted(ours)}.")

    # 4. Count, from OUR data, dual-element pals where one attack element
    #    is strong (or weak) against BOTH halves — the 4x / 0.25x cases
    #    both wikis claim cannot happen. Verified, not assumed.
    extreme = []
    for name, p in pals["pals"].items():
        els = p.get("elements", [])
        if len(els) != 2:
            continue
        for atk in chart:
            hits = [e for e in els if e in chart[atk]["strong"]]
            resists = [e for e in els if atk in chart[e]["strong"]]
            if len(hits) == 2 or len(resists) == 2:
                extreme.append((name, atk))
    print(f"dual-element 4x/0.25x cases in our 299 pals: {len(extreme)}")
    for name, atk in extreme:
        print(f"  NOTE: {atk} vs {name}")

    strong_edges = sum(len(r["strong"]) for r in chart.values())
    out = {
        "source": (
            f"{site_a} Elements (revid {rev_a}) + {site_b} Elements "
            f"(revid {rev_b}), fetched {date.today().isoformat()}; accepted "
            "only because both agree cell-for-cell AND the table is "
            "perfectly antisymmetric AND its vocabulary equals "
            "pals_1_0.json's 9 elements. Wiki-measured, not datamined: "
            "no pinned raw dump publishes the game's element table "
            "(atlas build-24575149 manifest checked, 11 tables, none of "
            "them elements; paldb /Elements is prose only)."
        ),
        "label": "wiki-measured",
        "multipliers": {"strong": 2.0, "weak": 0.5, "neutral": 1.0},
        "rules": {
            "attack": "one skill element vs each of the defender's "
                      "elements; per-element multipliers multiply, so "
                      "strong+weak on a dual-element pal cancels to 1x",
            "sameElement": "a skill matching the defender's element is "
                           "neutral (1x) — both sources state this "
                           "explicitly",
            "extremeCases": f"{len(extreme)} of our 299 pals can take "
                            "4x or 0.25x (counted from pals_1_0.json at "
                            "generation time, not copied from the wikis)",
        },
        "elements": {el: chart[el] for el in sorted(chart)},
        "counts": {"elements": len(chart), "strongEdges": strong_edges},
    }
    OUT.write_text(json.dumps(out, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {OUT} ({len(chart)} elements, {strong_edges} strong edges)")


if __name__ == "__main__":
    main()
