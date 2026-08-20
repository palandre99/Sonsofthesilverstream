#!/usr/bin/env python3
"""Fetch every fixed boss's own parameter row from paldb.cc.

WHY: the CEO, 2026-08-17 23:24 — "should show alpha version? Does it not
have different stats?" It does: the game's DT_PalMonsterParameter carries a
separate row per boss variant (753 rows; the atlas manifest proves the
table, but no pinned upstream publishes the raw BOSS_ rows). paldb.cc —
already this project's trusted upstream for icons, the breeding table,
Paldex text and saddle levels — mirrors that row verbatim on each boss's
own page, e.g. Holy_Knight_of_Legend_Paladius shows HP 156 /
EnemyMaxHPRate 1.8552631 / Size XL where base Paladius is HP 130 / L.

PARSING (learned from the first run's 100% failure, 2026-08-18):
- a stat row is `<div>KEY</div> [progress bar] <div>VALUE</div>` — the key
  may be wrapped in a link and the value sits AFTER the bar, so pairs are
  read per ROW container: first text run is the key, last is the value;
- boss titles in alpha_locations can carry level RANGES ("(Lv. 17-19)")
  and legitimate hyphens ("Self-Serving Seer Flaracle") — the title regex
  accepts a range, and no dash-based fallback is allowed to bite a title.

VALIDATION, not trust: a page only counts if its CombiRank equals our
oracle-tested combi_rank for the species — a wrong or renamed page can
never ship a number under the wrong pal. Drops are printed with their
reason (404 vs unparsed) so a systematic failure is visible, not vague.

Writes data/alpha_stats_1_0.json. tools/gen_alpha_stats.py turns it into
the app's table.

    python3 tools/fetch_alpha_stats.py
"""
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_tower_raid_stats import (  # noqa: E402
    ELEMENT_MAP, parse_drops, parse_skills, split_variant_sections,
)

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "alpha_stats_1_0.json"
UA = "PalforgeDataPipeline/1.0 (companion app; contact: palandre.99@gmail.com)"

# the fields worth keeping from the raw row (page key -> our key).
# HP and ShotAttack render under their DISPLAY names ("Health"/"Attack");
# the rest keep their raw table names — both spellings are accepted.
KEEP = {
    "HP": "hp",
    "Health": "hp",
    "MeleeAttack": "melee",
    "ShotAttack": "atk",
    "Attack": "atk",
    "Defense": "def",
    "Size": "size",
    "Rarity": "rarity",
    "CraftSpeed": "craft",
    "CombiRank": "combi",
    "MaleProbability": "maleProb",
    "CaptureRateCorrect": "capture",
    "ExpRatio": "exp",
    "EnemyMaxHPRate": "hpRate",
    "EnemyReceiveDamageRate": "recvRate",
    "EnemyInflictDamageRate": "dealRate",
}

ROW_MARK = 'justify-content-between p-2 align-items-center border-bottom'
TEXT_RUN = re.compile(r">([^<>]+)<")
TITLE_RE = re.compile(r"^(.*?)\s*\(Lv\.\s*(\d+)(?:\s*[-–]\s*\d+)?\)")


def slug_for(title: str) -> str:
    """paldb keeps apostrophes and bangs literal but needs & and , encoded
    (Plump_%26_Juicy_Chikipi, No_Dance%2C_No_Life_Palumba — both proven)."""
    return title.replace(" ", "_").replace("&", "%26").replace(",", "%2C")


def fetch(slug: str) -> tuple[str | None, str | None]:
    """(page, error) — a 404 is an answer, not a retry case."""
    req = urllib.request.Request(
        f"https://paldb.cc/en/{slug}", headers={"User-Agent": UA})
    for attempt in (1, 2):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode("utf-8", "replace"), None
        except urllib.error.HTTPError as ex:
            return None, f"HTTP {ex.code}"
        except Exception as ex:  # noqa: BLE001 - transient; retry once
            if attempt == 2:
                return None, str(ex)
            time.sleep(3)
    return None, "unreachable"


def parse_params(page: str) -> dict[str, str]:
    """KEY/VALUE per stat row: first text run is the key (may be inside a
    link), the last is the value (bar rows put it after the progress bar)."""
    out: dict[str, str] = {}
    for chunk in page.split(ROW_MARK)[1:]:
        # stop at the next row's opening tag run; the marker split leaves the
        # rest of the page in the final chunk otherwise
        texts = [t.strip() for t in TEXT_RUN.findall(chunk[:1200]) if t.strip()]
        if len(texts) < 2:
            continue
        key = texts[0]
        if key in KEEP and KEEP[key] not in out:
            out[KEEP[key]] = texts[-1].rstrip("%")
    return out


def num(v: str | None) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except ValueError:
        return None


def main() -> None:
    pals = json.loads(
        (ROOT / "data" / "pals_1_0.json").read_text(encoding="utf-8"))["pals"]

    jobs: list[tuple[str, str, int | None]] = []
    seen: set[tuple[str, str]] = set()
    unparsed_lines: list[str] = []
    for name, p in pals.items():
        for line in p.get("alpha_locations") or []:
            m = TITLE_RE.match(line)
            if not m:
                # a line with no "(Lv." tail: title is everything before the
                # spaced dash that separates it from the place — never a
                # mid-word hyphen
                t = re.split(r"\s+-\s+", line)[0].strip()
                if not t:
                    unparsed_lines.append(f"{name}: {line}")
                    continue
                title, lv = t, None
            else:
                title, lv = m.group(1).strip(), int(m.group(2))
            if (name, title) in seen:
                continue
            seen.add((name, title))
            jobs.append((name, title, lv))

    print(f"{len(jobs)} boss pages to fetch"
          + (f" ({len(unparsed_lines)} lines unparsed)" if unparsed_lines else ""))
    rows: dict[str, list[dict]] = {}
    dropped: list[str] = []
    unmapped_skills: list[str] = []
    for i, (name, title, lv) in enumerate(jobs, 1):
        page, err = fetch(slug_for(title))
        if page is None:
            dropped.append(f"{title}: {err}")
            continue
        params = parse_params(page)
        if "combi" not in params:
            dropped.append(f"{title}: param card fetched but unparsed")
            continue
        ours = pals[name].get("combi_rank")
        theirs = num(params["combi"])
        if ours is None or theirs is None or int(theirs) != int(ours):
            dropped.append(
                f"{title}: CombiRank {params.get('combi')} != ours {ours}")
            continue
        # the boss's OWN section carries its attacks and its drop table;
        # a page also renders the plain species, so pick the BOSS_ one
        # and fall back to the whole page rather than inventing a kit
        sections = split_variant_sections(page)
        seg = next((v for k, v in sections.items() if k.startswith("BOSS_")),
                   page)
        skills, bad = [], None
        for sk in parse_skills(seg):
            el = ELEMENT_MAP.get(sk["element"])
            if el is None:
                bad = f"{sk['name']}: element {sk['element']}"
                break
            skills.append({**sk, "element": el})
        if bad:
            unmapped_skills.append(f"{title}: {bad}")
            skills = []
        rows.setdefault(name, []).append({
            "title": title, "lv": lv, **params,
            "moves": skills, "drops": parse_drops(seg),
        })
        if i % 20 == 0:
            print(f"  {i}/{len(jobs)} fetched, {len(dropped)} dropped so far",
                  flush=True)
        time.sleep(1.0)

    payload = {
        "source": (
            "paldb.cc per-boss pages (raw DT_PalMonsterParameter row per "
            "variant), fetched 2026-08-18; validated per row: page CombiRank "
            "must equal our oracle-tested combi_rank or the row is dropped. "
            "Each boss's own section also yields its attack kit and its "
            "drop table, parsed by the same code the tower/raid fetcher "
            "uses; a skill whose element does not map into our nine is "
            "reported and that boss ships without a kit, never with a "
            "guessed one."),
        "fetched": len(rows),
        "unparsed_lines": unparsed_lines,
        "dropped": dropped,
        "unmapped_skills": unmapped_skills,
        "bosses": rows,
    }
    OUT.write_text(
        json.dumps(payload, indent=1, ensure_ascii=False), encoding="utf-8")
    total = sum(len(v) for v in rows.values())
    print(f"wrote {OUT} ({len(rows)} species, {total} boss rows, "
          f"{len(dropped)} dropped)")
    for d in dropped:
        print(f"  DROPPED {d}")
    if not rows:
        sys.exit(1)


if __name__ == "__main__":
    main()
