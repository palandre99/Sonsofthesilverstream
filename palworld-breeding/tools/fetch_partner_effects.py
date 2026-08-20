#!/usr/bin/env python3
"""Repair the partner effects the knowledge-base source delivered cut off.

The kb source caps partner_effect near 200 chars: 16 species arrive cut
mid-sentence and 2 (Leezpunk, Leezpunk Ignis) carry a raw game variable.
The app has HANDLED the symptom honestly since E116 (cleanEffect never
prints a broken tail), but the cure was always a data-pipeline job — the
full sentences exist on paldb.cc, this project's trusted game-table
mirror, in each pal page's og:description meta tag.

NEVER-INVENT VALIDATION: a fetched text is accepted only if our truncated
text is a character-prefix of it after normalisation (lowercase, alnum
only) — proving it is the SAME string completed, not a different
description. For the placeholder pair, the text before the {variable}
must be a prefix and the text after it must follow in the fetched string;
the number paldb shows in between is the game's own resolved value.
Anything that fails validation is reported and left untouched.

Writes all three copies of pals_1_0.json (data/, mobile/src/data/,
app/public/data/ — the last is data freshness for the shared tests, not
a website feature).

    python3 tools/fetch_partner_effects.py
"""
import html
import json
import re
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COPIES = [
    ROOT / "data" / "pals_1_0.json",
    ROOT / "mobile" / "src" / "data" / "pals_1_0.json",
    ROOT / "app" / "public" / "data" / "pals_1_0.json",
]
UA = "PalforgeDataPipeline/1.0 (companion app; contact: palandre.99@gmail.com)"

FINISHED = re.compile(r"[.!?)]\s*$")
OG_DESC = re.compile(r'<meta property="og:description" content="([^"]*)"')

# Effects where paldb's CURRENT text is not a completion of ours but a
# REWORD — the 1.0.3 localisation pass rewrote these ("inflict Poison 2~6"
# became "increase Poison buildup by (2~6)"; "improves X damage to enemy
# weak points" became "increases damage dealt ... when hitting the enemy's
# elemental weakness"), and kb's July snapshot predates it. Croajiro's kb
# entry additionally miscopied the Noct variant's name into the base pal.
# Each was DIFFED BY HAND (ledger E139) before earning a place here; the
# tool still prints old/new so a rerun's changes are visible. A name NOT on
# this list must pass the strict prefix rule or it is refused.
EXPLICIT_REFRESH = {
    "Croajiro", "Croajiro Noct", "Dandilord", "Finsider Ignis",
}


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def fetch_desc(name: str) -> str | None:
    slug = name.replace(" ", "_")
    req = urllib.request.Request(
        f"https://paldb.cc/en/{slug}", headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            page = r.read().decode("utf-8", "replace")
    except Exception as ex:  # noqa: BLE001 - report and skip
        print(f"  {name}: fetch failed ({ex})")
        return None
    m = OG_DESC.search(page)
    if not m:
        return None
    text = html.unescape(m.group(1))
    # the og tag appends the page's tech-level word ("Technology29") and
    # carries \r\n linebreaks — strip both; neither is part of the string
    text = re.sub(r"\s*Technology\s*\d+\s*$", "", text)
    return re.sub(r"\s+", " ", text).strip()


def validate(ours: str, theirs: str) -> str | None:
    """None when accepted; otherwise the reason for refusal."""
    if "{" in ours:
        before, _, after = ours.partition("{")
        after = after.partition("}")[2]
        if not norm(theirs).startswith(norm(before)):
            return "text before the placeholder is not a prefix"
        rest = norm(theirs)[len(norm(before)):]
        if norm(after) not in rest:
            return "text after the placeholder not found"
        return None
    if not norm(theirs).startswith(norm(ours)):
        return "our truncated text is not a prefix of the fetched text"
    if not FINISHED.search(theirs):
        return "fetched text is itself unfinished"
    return None


def main() -> None:
    canonical = json.loads(COPIES[0].read_text(encoding="utf-8"))
    pals = canonical["pals"]

    affected = []
    for name, p in pals.items():
        e = p.get("partner_effect")
        if not e:
            continue
        t = re.sub(r"\{[^}]*\}", "a number of", e)
        if not FINISHED.search(t) or "{" in e:
            affected.append(name)
    print(f"{len(affected)} affected effects: {', '.join(affected)}")

    repaired: dict[str, str] = {}
    for name in affected:
        theirs = fetch_desc(name)
        if theirs is None:
            continue
        if name in EXPLICIT_REFRESH:
            reason = None if FINISHED.search(theirs) else "refresh text unfinished"
            if reason is None:
                print(f"  REFRESH {name} (1.0.3 reword; diff recorded)")
                print(f"    old: {pals[name]['partner_effect'][:100]}")
                print(f"    new: {theirs[:100]}")
        else:
            reason = validate(pals[name]["partner_effect"], theirs)
        if reason:
            print(f"  REFUSED {name}: {reason}")
            print(f"    ours:   {pals[name]['partner_effect'][:90]}")
            print(f"    theirs: {theirs[:90]}")
        else:
            repaired[name] = theirs
            print(f"  repaired {name} ({len(theirs)} chars)")
        time.sleep(0.8)

    if not repaired:
        print("nothing repaired")
        return
    for path in COPIES:
        d = json.loads(path.read_text(encoding="utf-8"))
        for name, text in repaired.items():
            d["pals"][name]["partner_effect"] = text
        path.write_text(
            json.dumps(d, indent=1, ensure_ascii=False), encoding="utf-8")
        print(f"wrote {path}")
    print(f"{len(repaired)} of {len(affected)} repaired; "
          f"{len(affected) - len(repaired)} left as delivered")


if __name__ == "__main__":
    main()
