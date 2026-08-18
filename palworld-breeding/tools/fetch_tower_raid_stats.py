#!/usr/bin/env python3
"""Fetch every tower-boss and summoned-raid encounter from paldb.cc.

WHY: the Bosses & Raids fane (CEO 2026-08-18) needs the real fights — the
per-difficulty level and fight HP the player will face, the boss's element
so counters can be ranked, and its actual attacks so the card can say what
is coming and what resists it. None of that was in our data: the alpha
sweep (E133) covered BOSS_ rows only; GYM_ (tower) and RAID_ (summon) rows
are their own rows in DT_PalMonsterParameter.

SOURCES, both on paldb.cc (this project's trusted raw-table mirror):
- /en/Tower and /en/Raid list every encounter with its own difficulty row
  (Normal / Hard / Ultra / Master), level, fight HP and — on the raid
  page — damage reduction, attack damage and the summoning slab's icon.
  Each entry carries the boss's raw id in data-pal-id.
- each entry's own page carries the raw parameter row (BPClass, elements,
  Enemy* fight multipliers, IsTowerBoss/IsRaidBoss) and the boss's actual
  Active Skills (name, element, cooldown, power, effects).

VALIDATION, not trust (the E133 doctrine; these rows have no CombiRank,
so identity is proven three other ways or the row is dropped):
1. the page's raw BPClass must equal the list entry's data-pal-id;
2. the page must carry IsTowerBoss=1 (tower list) / IsRaidBoss=1 (raids);
3. the page's element (raw enum, mapped) must equal the list entry's
   element tooltip (display name, mapped) — two renderings of the row
   must agree;
4. every skill element must map into our nine (elements_1_0.json), and
   power/cooldown must be numeric.
Where the boss's Tribe resolves to a real species in pals_1_0.json (via
the icon codename), the species name is recorded so the app can
cross-link — and a resolution FAILURE is recorded loudly, never guessed.

Internal consistency spot-proof (kept because it caught nothing wrong,
which is the point): Zoe & Grizzbolt Normal lists 12,900 fight HP; the
raw row says base HP 105 x EnemyMaxHPRate 12 — a Lv-10 pal at base 105
has 1,075 HP, and 1,075 x 12 = 12,900 exactly.

Writes data/tower_raid_1_0.json. tools/gen_tower_raid.py turns it into
the app's tables (both trees).

    python3 tools/fetch_tower_raid_stats.py
"""
import json
import re
import sys
import time
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "tower_raid_1_0.json"
UA = "PalforgeDataPipeline/1.0 (companion app; contact: palandre.99@gmail.com)"

# raw DT enum names AND paldb display names -> our nine element names
# (vocabulary pinned to elements_1_0.json at runtime).
ELEMENT_MAP = {
    "Normal": "Neutral", "Neutral": "Neutral",
    "Fire": "Fire", "Flame": "Fire",
    "Water": "Water",
    "Electricity": "Electric", "Electric": "Electric", "Thunder": "Electric",
    "Leaf": "Grass", "Grass": "Grass",
    "Ice": "Ice",
    "Earth": "Ground", "Ground": "Ground",
    "Dark": "Dark",
    "Dragon": "Dragon",
}

ROW_MARK = 'justify-content-between p-2 align-items-center border-bottom'
TEXT_RUN = re.compile(r">([^<>]+)<")
RAW_KEYS = {
    "BPClass", "Tribe", "ElementType1", "ElementType2", "GenusCategory",
    "IsTowerBoss", "IsRaidBoss", "EnemyMaxHPRate", "EnemyReceiveDamageRate",
    "EnemyInflictDamageRate", "EnemyWazaCoolTimeRate", "Size", "Rarity",
}
BASE_KEYS = {"Health": "hp", "MeleeAttack": "melee", "Attack": "atk",
             "Defense": "def"}


def fetch(path: str) -> str | None:
    req = urllib.request.Request(
        f"https://paldb.cc/en/{path}", headers={"User-Agent": UA})
    for attempt in (1, 2):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError:
            return None
        except Exception:  # noqa: BLE001 - transient; retry once
            if attempt == 2:
                return None
            time.sleep(3)
    return None


ENTRY_RE = re.compile(
    r'data-pal-id="([^"]+)"[^>]*class="itemname"[^>]*href="([^"]+)">', re.S)


def parse_list(html: str, section: str | None) -> list[dict]:
    """One dict per encounter row on a /Tower or /Raid list page.

    The Raid page is tabbed; only the "Summoning Altar" pane is the
    summoned-raid table (the "Raid /240" pane is base-attack events, a
    different feature). Slice between the card headers.
    """
    if section:
        start = html.find(f'card-header">{section}')
        if start < 0:
            sys.exit(f"REFUSED: section header {section!r} not found")
        end = html.find('card-header">', start + len(section) + 20)
        html = html[start:end if end > 0 else len(html)]
    entries = []
    marks = list(ENTRY_RE.finditer(html))
    for i, m in enumerate(marks):
        pal_id, href = m.group(1), m.group(2)
        block = html[m.end():marks[i + 1].start() if i + 1 < len(marks)
                     else m.end() + 4000]
        # anchor text = the display title
        title = re.sub(r"<[^>]+>", "", block.split("</a>")[0]).strip()
        text = re.sub(r"<[^>]+>", " ", block)
        text = re.sub(r"\s+", " ", text)
        elements = re.findall(
            r'data-bs-title="(Neutral|Fire|Water|Electric|Grass|Ice|Ground'
            r'|Dark|Dragon)"', block)
        arena_m = re.search(r"<div>([^<]{3,60}?)\s*<span[^>]*badge",
                            block)
        badge_m = re.search(r'badge[^>]*>([^<]+)</span>', block)
        lv = re.search(r"Level:\s*([\d,]+)", text)
        hp = re.search(r"Hp:\s*([\d,]+)", text)
        dr = re.search(r"Damage Reduction:\s*([\d.]+)%", text)
        ad = re.search(r"Attack Damage:\s*([\d,]+)%", text)
        # the summoning slab icon sits in the entry's ICON anchor, just
        # before the itemname anchor
        lead = html[max(0, m.start() - 900):m.start()]
        slab = re.findall(r"T_itemicon_Consume_(PalSummon_\w+)\.webp", lead)
        arena = (arena_m.group(1).strip() if arena_m else None)
        # the raw id is the authority on the variant: _2 is the second
        # difficulty everywhere; the title/arena names what the game calls
        # that difficulty (tower "(Hard)", raid "(Ultra)" / "[Master]").
        mode = "Normal"
        if pal_id.endswith("_2"):
            mode = ("Ultra" if "(Ultra)" in title
                    else "Master" if title.startswith("[Master]")
                    else "Hard")
        if arena and "(Hard)" in arena:
            arena = arena.replace("(Hard)", "").strip()
        del badge_m  # parsed for completeness; the id decides
        entries.append({
            "title": title, "href": href, "palId": pal_id,
            "listElements": elements, "arena": arena, "mode": mode,
            "lv": int(lv.group(1).replace(",", "")) if lv else None,
            "fightHp": int(hp.group(1).replace(",", "")) if hp else None,
            "damageCutPct": float(dr.group(1)) if dr else None,
            "attackPct": int(ad.group(1).replace(",", "")) if ad else None,
            "slab": slab[-1] if slab else None,
        })
    return entries


def split_variant_sections(page: str) -> dict[str, str]:
    """A boss page carries one SECTION per variant (Normal, Hard, ally…),
    each opened by an x-large header naming its data-pal-id and carrying
    its OWN raw card and its OWN skill list — proven on Zoe & Grizzbolt,
    whose Hard section (GYM_ElecPanda_2) has nine attacks to Normal's
    five. Every section's raw card also repeats its id in a Code row;
    a section only counts when header and Code row agree."""
    marks = []
    for m in re.finditer(r"font-size: x-large", page):
        pid = re.search(r'data-pal-id="([^"]+)"', page[m.start():m.start() + 400])
        if pid:
            marks.append((m.start(), pid.group(1)))
    sections: dict[str, str] = {}
    for i, (pos, pid) in enumerate(marks):
        end = marks[i + 1][0] if i + 1 < len(marks) else len(page)
        seg = page[pos:end]
        code = re.search(r"<div>Code</div>\s*<div>(\w+)</div>", seg)
        if code and code.group(1) == pid:
            sections[pid] = seg
    return sections


def parse_raw_card(page: str) -> dict:
    out: dict[str, str] = {}
    for chunk in page.split(ROW_MARK)[1:]:
        texts = [t.strip() for t in TEXT_RUN.findall(chunk[:1200])
                 if t.strip()]
        if len(texts) < 2:
            continue
        key = texts[0]
        if key in RAW_KEYS and key not in out:
            out[key] = texts[-1]
        elif key in BASE_KEYS and BASE_KEYS[key] not in out:
            # first occurrence is the base-stat block (the later Level-80
            # block repeats the names with range values)
            v = texts[-1]
            if re.fullmatch(r"\d+(\.\d+)?", v):
                out[BASE_KEYS[key]] = v
    return out


SKILL_RE = re.compile(
    r'class="card itemPopup activeSkill">.*?Lv\.\s*(\d+)\s*<a[^>]*'
    r'href="([^"]+)"[^>]*>([^<]+)</a>.*?'
    r'<span style="padding-left: 35px">([A-Za-z]+)</span>.*?'
    r'CoolTime[^:]*:\s*<span[^>]*>(\d+)</span>.*?'
    r'Power:\s*<span[^>]*>(\d+)</span>(.*?)</div>\s*</div>', re.S)
AGG_RE = re.compile(r'Aggregate.*?<span[^>]*>([^<]+)</span>'
                    r'(?:\s*<span[^>]*>([^<]+)</span>)?', re.S)


def parse_skills(page: str) -> list[dict]:
    skills = []
    for m in SKILL_RE.finditer(page):
        lv, _href, name, element, ct, power, tail = m.groups()
        agg = AGG_RE.search(tail)
        effects = " ".join(t.strip() for t in agg.groups() if t) if agg else None
        skills.append({"lv": int(lv), "name": name.strip(),
                       "element": element, "ct": int(ct),
                       "power": int(power), "effects": effects})
    return skills


def main() -> None:
    pals = json.loads(
        (ROOT / "data" / "pals_1_0.json").read_text(encoding="utf-8"))["pals"]
    chart = json.loads(
        (ROOT / "data" / "elements_1_0.json").read_text(encoding="utf-8"))
    our_elements = set(chart["elements"])
    if not set(ELEMENT_MAP.values()) <= our_elements:
        sys.exit("REFUSED: ELEMENT_MAP targets outside our nine elements.")

    # icon codename -> species, for Tribe resolution (T_ElecPanda_icon ->
    # Grizzbolt). Codenames come from the icon URLs we already ship.
    code_to_species = {}
    for name, p in pals.items():
        m = re.search(r"/T_(\w+?)_icon_", p.get("icon") or "")
        if m:
            code_to_species[m.group(1)] = name

    refusals: list[str] = []
    notes: list[str] = []
    sections: dict[str, list[dict]] = {}
    pages: dict[str, str | None] = {}

    for kind, path, section, flag in (
            ("towers", "Tower", None, "IsTowerBoss"),
            ("raids", "Raid", "Summoning Altar /", "IsRaidBoss")):
        html = fetch(path)
        if html is None:
            sys.exit(f"REFUSED: could not fetch /en/{path}")
        entries = parse_list(html, section)
        print(f"{kind}: {len(entries)} encounter rows on the list page")
        rows = []
        for e in entries:
            if e["href"] not in pages:
                pages[e["href"]] = fetch(e["href"])
                time.sleep(1.0)
            page = pages[e["href"]]
            if page is None:
                refusals.append(f"{e['title']}: page fetch failed")
                continue
            variants = split_variant_sections(page)
            seg = variants.get(e["palId"])
            if seg is None:
                refusals.append(
                    f"{e['title']}: no section for {e['palId']} on its page "
                    f"(page has: {sorted(variants)})")
                continue
            raw = parse_raw_card(seg)
            if raw.get(flag) != "1":
                # Dandilord/Silvance-class story fights sit on the Tower
                # list without the flag — identity is already proven by
                # the section's Code row, so record, don't invent a kind.
                notes.append(f"{e['title']}: {e['palId']} carries no "
                             f"{flag}=1 (story-dungeon fight)")
            page_els = [ELEMENT_MAP.get(raw[k]) for k in
                        ("ElementType1", "ElementType2") if raw.get(k)]
            if None in page_els:
                refusals.append(
                    f"{e['title']}: unmapped raw element "
                    f"{raw.get('ElementType1')}/{raw.get('ElementType2')}")
                continue
            if not page_els:
                # Zenara & Astralym are genuinely typeless in the table;
                # nothing is strong or weak against them.
                notes.append(f"{e['title']}: no element on its raw row")
            list_els = [ELEMENT_MAP.get(x) for x in e["listElements"]]
            if list_els and page_els and sorted(list_els) != sorted(page_els):
                refusals.append(
                    f"{e['title']}: list element {list_els} != "
                    f"page element {page_els}")
                continue
            skills, bad_skill = [], None
            for s in parse_skills(seg):
                el = ELEMENT_MAP.get(s["element"])
                if el is None:
                    bad_skill = f"{s['name']}: element {s['element']}"
                    break
                skills.append({**s, "element": el})
            if bad_skill:
                refusals.append(f"{e['title']}: skill unmapped, {bad_skill}")
                continue
            if not skills:
                notes.append(f"{e['title']}: section shows no active skills")
            tribe = raw.get("Tribe")
            species = code_to_species.get(tribe)
            if species is None and tribe:
                notes.append(f"{e['title']}: tribe {tribe} resolves to no "
                             "species in pals_1_0.json")
            rows.append({
                "title": e["title"], "arena": e["arena"], "mode": e["mode"],
                "lv": e["lv"], "fightHp": e["fightHp"],
                "damageCutPct": e["damageCutPct"],
                "attackPct": e["attackPct"], "slab": e["slab"],
                "bp": e["palId"], "tribe": tribe, "species": species,
                "elements": page_els,
                "towerFlag": raw.get("IsTowerBoss") == "1",
                "raidFlag": raw.get("IsRaidBoss") == "1",
                "size": raw.get("Size"),
                "baseHp": raw.get("hp"), "baseAtk": raw.get("atk"),
                "baseDef": raw.get("def"),
                "hpRate": raw.get("EnemyMaxHPRate"),
                "recvRate": raw.get("EnemyReceiveDamageRate"),
                "dealRate": raw.get("EnemyInflictDamageRate"),
                "ctRate": raw.get("EnemyWazaCoolTimeRate"),
                "genus": raw.get("GenusCategory"),
                "moves": skills,
            })
        sections[kind] = rows

    payload = {
        "source": (
            "paldb.cc /en/Tower + /en/Raid list pages (per-difficulty "
            "level/fight-HP/reduction rows) joined to each boss's own page "
            "(raw DT_PalMonsterParameter GYM_/RAID_ row + active skills), "
            f"fetched {date.today().isoformat()}. A row ships only if the "
            "page's BPClass equals the list entry's id, the page carries "
            "the matching IsTowerBoss/IsRaidBoss flag, and the element "
            "agrees between both renderings after enum mapping. Species "
            "resolved from Tribe via our own icon codenames."),
        "counts": {k: len(v) for k, v in sections.items()},
        "refusals": refusals,
        "notes": notes,
        **sections,
    }
    OUT.write_text(json.dumps(payload, indent=1, ensure_ascii=False) + "\n",
                   encoding="utf-8")
    print(f"wrote {OUT}: {payload['counts']}, {len(refusals)} refusals, "
          f"{len(notes)} notes")
    for r in refusals:
        print(f"  REFUSED {r}")
    for n in notes:
        print(f"  NOTE {n}")


if __name__ == "__main__":
    main()
