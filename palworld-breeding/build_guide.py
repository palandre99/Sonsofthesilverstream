#!/usr/bin/env python3
"""Generates guide/index.html — Pål-Andres ultimate Palworld 1.0 breeding-guide.

Reads data/ + roster.txt + targets.txt, computes the plan with planner.py and
renders a self-contained HTML page (inline CSS/JS, checkbox progress in
localStorage, pal icons from cdn.paldb.cc with offline fallback).

    python3 build_guide.py          # -> guide/index.html
"""
from __future__ import annotations

import base64
import html
import json
import sys
from pathlib import Path

import planner as P

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "guide" / "index.html"
OUT_EMBED = ROOT / "guide" / "artifact.html"

# local game-dump icons (see data/icon_map.json for provenance)
ICON_FILES: dict[str, str] = json.loads(
    (ROOT / "data" / "icon_map.json").read_text())["files"]
EMBED = "--embed" in sys.argv
_DATAURI_CACHE: dict[str, str] = {}

# ----------------------------------------------------------------- plan input

ROSTER = set(P.load_roster())
TARGETS = P.load_targets()
ORDERED, UNREACHABLE, _DERIVS = P.plan_for(ROSTER, TARGETS)

# Pål-Andre is mid-breeding Frostplume via Menasting + Reptyro Cryst (same
# child as the optimizer's pair) — show HIS pair, note the alternative.
IN_PROGRESS_OVERRIDES = {
    "Frostplume": ("Menasting", "Reptyro Cryst"),
}

HISTORY = [  # already bred (backbone steps 1-5) — results are in roster.txt
    ("Beakon", "Helzephyr", "Helzephyr Lux"),
    ("Helzephyr Lux", "Verdash", "Reptyro"),
    ("Foxcicle", "Reptyro", "Reptyro Cryst"),
    ("Blazehowl", "Quivern", "Warsect"),
    ("Digtoise", "Warsect", "Warsect Terra"),
]

GOAL_GROUPS = [
    ("Topparbeidere", ["Solenne", "Celesdir Noct", "Renjishi", "Knocklem",
                       "Starryon Primo", "Ophydia", "Anubis", "Astegon",
                       "Blazamut", "Sibelyx Primo", "Venusa", "Mycora",
                       "Univolt Cryst", "Whalaska Ignis", "Solmora Lux"]),
    ("Aura-pals (+1 arbeidsnivå til hele basen)",
     ["Tetroise", "Wumpo", "Amione", "Eikthyrdeer Terra", "Katress Ignis",
      "Puffolt", "Smokie Cryst", "Mycora"]),
    ("Breeding-støtte (gjør resten av planen raskere)",
     ["Braloha", "Dynamoff", "Lullu", "Prunelia", "Sekhmet"]),
]
AURA_OWNED = ["Ribbuny", "Cinnamoth", "Clovee", "Petallia"]

ELEMENT_NO = {"Neutral": "Nøytral", "Fire": "Ild", "Water": "Vann",
              "Grass": "Gress", "Electric": "Elektrisk", "Ice": "Is",
              "Ground": "Jord", "Dark": "Mørke", "Dragon": "Drage"}


def esc(s) -> str:
    return html.escape(str(s), quote=True)


def pal(name: str) -> dict:
    return P.PALS[name]


def egg_hint(name: str) -> str:
    eggs = pal(name).get("egg_types") or []
    if not eggs:
        return ""
    e = eggs[0]
    if any(w in e for w in ("Scorching", "Flaming")):
        temp = " · trenger varme"
    elif any(w in e for w in ("Frozen", "Icy")):
        temp = " · trenger kulde"
    else:
        temp = ""
    return f"{e}{temp}"


def safe_alternatives(child: str, tie_pair: tuple[str, str], have: set[str]) -> list[tuple[str, str]]:
    """Non-tie generic pairs among `have` species that give the same child."""
    hl = sorted(have)
    out = []
    for i, a in enumerate(hl):
        for b in hl[i:]:
            if {a, b} == set(tie_pair):
                continue
            ch = P.child_of(a, b)
            if ch.species == child and ch.kind == "generic" and not ch.tie_break:
                out.append((a, b))
    return out


def tie_loser_child(a: str, b: str) -> str:
    """If the tie-break went the OTHER way (lower rank wins), what hatches?"""
    t = (P.RANKS[a] + P.RANKS[b] + 1) // 2
    near = sorted(P.POOL, key=lambda s: (abs(P.RANKS[s] - t), P.RANKS[s]))
    return near[0]


# ------------------------------------------------------------- html fragments

def icon_src(name: str) -> tuple[str, str]:
    """(primary src, fallback src) for a pal icon."""
    f = ICON_FILES.get(name)
    cdn = pal(name).get("icon") or ""
    if EMBED and f:
        if name not in _DATAURI_CACHE:
            raw = (ROOT / "guide" / "icons" / f).read_bytes()
            _DATAURI_CACHE[name] = ("data:image/png;base64,"
                                    + base64.b64encode(raw).decode())
        return _DATAURI_CACHE[name], ""
    if f:
        return f"icons/{f}", cdn
    return cdn, ""


def icon_html(name: str, size: int = 44) -> str:
    p = pal(name)
    el = (p.get("elements") or ["Neutral"])[0].lower()
    mono = "".join(w[0] for w in name.split()[:2]).upper()
    src, alt = icon_src(name)
    fallback = (f'data-alt="{esc(alt)}" ' if alt else "")
    onerr = ("if(this.dataset.alt){this.src=this.dataset.alt;"
             "delete this.dataset.alt}else{this.parentNode.classList.add('noimg')}")
    return (f'<span class="pic el-{el}" style="--s:{size}px" data-mono="{esc(mono)}">'
            f'<img src="{esc(src)}" alt="" loading="lazy" {fallback}'
            f'onerror="{onerr}"></span>')


def el_chips(name: str) -> str:
    return "".join(
        f'<span class="chip el-{e.lower()}">{esc(ELEMENT_NO.get(e, e))}</span>'
        for e in pal(name).get("elements") or [])


def work_chips(name: str, top: int | None = None) -> str:
    work = sorted((pal(name).get("work") or {}).items(), key=lambda kv: -kv[1])
    if top:
        work = work[:top]
    def lab(j: str) -> str:
        j = j.replace("_", " ")
        return "Electricity" if j == "Generating Electricity" else j
    return "".join(f'<span class="chip work">{esc(lab(j))} <b>{v}</b></span>'
                   for j, v in work)


def stat_bars(name: str) -> str:
    p = pal(name)
    mx = 150
    rows = []
    for lab, key in (("HP", "hp"), ("ATK", "atk"), ("DEF", "def")):
        v = p.get(key) or 0
        pct = min(100, round(v / mx * 100))
        rows.append(
            f'<div class="stat"><span class="sl">{lab}</span>'
            f'<span class="sb"><span style="width:{pct}%"></span></span>'
            f'<span class="sv">{v}</span></div>')
    return f'<div class="stats">{"".join(rows)}</div>'


def step_card(s: dict, have_before: set[str]) -> str:
    child = s["child"]
    a, b = s["parents"]
    in_prog = False
    alt_note = ""
    if child in IN_PROGRESS_OVERRIDES:
        oa, ob = IN_PROGRESS_OVERRIDES[child]
        if {oa, ob} != {a, b}:
            alt_note = (f'Alternativ rute med samme resultat: {esc(a)} + {esc(b)}.')
        a, b = oa, ob
        in_prog = True

    sid = f"{a}+{b}={child}".replace(" ", "_")
    flags = []
    if s["kind"] == "unique":
        flags.append('<span class="badge unique">unik oppskrift</span>')
    if s["kind"] == "gendered":
        flags.append('<span class="badge warn">kjønn avgjør</span>')
    if s["tie_break"]:
        flags.append('<span class="badge warn">tie-break — verifiser!</span>')
    if in_prog:
        flags.append('<span class="badge now">egg i farmen nå</span>')
    if s["is_target"]:
        flags.append('<span class="badge goal">MÅL</span>')
    reuse = s["reused_as_parent"]
    keep = (f'<span class="badge keep">forelder i {reuse} steg til — '
            f'behold hann + hunn</span>') if reuse >= 2 else ""

    need = s["needed_by"]
    need_chips = "".join(f'<span class="chip need">{esc(n)}</span>' for n in need[:5])
    if len(need) > 5:
        need_chips += f'<span class="chip need">+{len(need)-5}</span>'

    detail = ""
    if s["kind"] == "generic":
        t = (P.RANKS[a] + P.RANKS[b] + 1) // 2
        detail = (f'rank-mål {t} → {esc(child)} ({P.RANKS[child]})'
                  + (f' · margin {s["margin"]}' if s["margin"] is not None else ""))
    tie_html = ""
    if s["tie_break"]:
        loser = tie_loser_child(a, b)
        alts = safe_alternatives(child, (a, b), have_before)
        alt_txt = (" Trygg alternativ-rute: " +
                   "; eller ".join(f"{x} + {y}" for x, y in alts[:2]) + "."
                   ) if alts else ""
        tie_html = (f'<p class="tienote">⚠️ Utfallet avhenger av tie-break-regelen '
                    f'(«høyeste CombiRank vinner» — bekreftet av én spillertest). '
                    f'Hvis regelen slår motsatt vei, klekkes <b>{esc(loser)}</b> i stedet '
                    f'— test med én kake før du satser stort.{esc(alt_txt)}</p>')

    gender_html = ""
    if s["kind"] == "gendered":
        gender_html = (f'<p class="tienote">♀♂ Spillets eneste kjønnsavhengige par: '
                       f'<b>{esc(s["gender_note"])}</b> gir {esc(child)} — bytter du '
                       f'kjønnene, får du det andre barnet (Katress Ignis ↔ Wixen Noct). '
                       f'Feil kjønn = feil pal, så dobbeltsjekk paret før kaka legges inn.</p>')

    egg = egg_hint(child)
    egg_html = f'<span class="egg">🥚 {esc(egg)}</span>' if egg else ""

    return f'''<li class="step{' target' if s['is_target'] else ''}" data-sid="{esc(sid)}">
<label class="tick"><input type="checkbox" aria-label="Fullført: {esc(a)} + {esc(b)} = {esc(child)}"><span></span></label>
<div class="recipe">
  <span class="parent">{icon_html(a, 40)}<span class="pn">{esc(a)}</span></span>
  <span class="op">+</span>
  <span class="parent">{icon_html(b, 40)}<span class="pn">{esc(b)}</span></span>
  <span class="op">=</span>
  <span class="child">{icon_html(child, 52)}
    <span class="cn"><b>{esc(child)}</b>
      <span class="meta">{el_chips(child)}{work_chips(child, 3)}</span>
      <span class="meta2">{egg_html}{('<span class="detail">' + detail + '</span>') if detail else ''}</span>
    </span>
  </span>
</div>
<div class="side">{"".join(flags)}{keep}
  {f'<div class="needs"><span class="nlbl">trengs til</span>{need_chips}</div>' if need else ''}
</div>
{tie_html}
{gender_html}
{f'<p class="tienote alt">{alt_note}</p>' if alt_note else ''}
</li>'''


def goal_card(name: str, owned: bool = False) -> str:
    p = pal(name)
    ps = p.get("partner_skill") or ""
    pe = p.get("partner_effect") or ""
    bs = p.get("base_support")
    aura = ""
    if bs and bs.get("type") == "suitability":
        aura = (f'<p class="aura">✨ Aura: +{bs["bonus"]} {esc(bs["task"])} '
                f'for alle pals i basen</p>')
    elif bs and bs.get("effect"):
        aura = f'<p class="aura">✨ {esc(bs["effect"])}</p>'
    wild = "" if p.get("wild") else '<span class="badge unique">ingen vanlig villspawn</span>'
    own = '<span class="badge own">i rosteret ✓</span>' if owned else ""
    return f'''<article class="goal">
<header>{icon_html(name, 56)}<div><h4>{esc(name)}</h4>
<div class="meta">{el_chips(name)}{wild}{own}</div></div></header>
<div class="meta">{work_chips(name)}</div>
{stat_bars(name)}
{f'<p class="pskill"><b>{esc(ps)}:</b> {esc(pe)}</p>' if pe else ''}
{aura}
</article>'''


# ------------------------------------------------------------------ verified?

VERIF = None
vpath = ROOT / "data" / "verification.json"
if vpath.exists():
    VERIF = json.loads(vpath.read_text())


def verification_rows() -> str:
    if not VERIF:
        return ""
    order = {"confirmed": 0, "plausible": 1, "contradicted": 2, "not_found": 3}
    lab = {"confirmed": ("bekreftet", "ok"), "plausible": ("sannsynlig", "warn"),
           "contradicted": ("motsagt", "bad"), "not_found": ("ikke funnet", "warn")}
    rows = []
    for item in sorted(VERIF["claims"], key=lambda c: order.get(c["verdict"], 9)):
        t, cls = lab.get(item["verdict"], (item["verdict"], "warn"))
        rows.append(f'<tr><td>{esc(item["claim"])}</td>'
                    f'<td><span class="badge v-{cls}">{t}</span></td>'
                    f'<td>{esc(item["evidence"])}</td></tr>')
    return "".join(rows)


# --------------------------------------------------------------------- render

def build() -> str:
    n_steps = len(ORDERED)
    n_targets = len([s for s in ORDERED if s["is_target"]])
    known = P.closure(ROSTER)
    ties = [s for s in ORDERED if s["tie_break"]]

    # phases
    have = set(ROSTER)
    phases_html = []
    cur_wave, buf = 0, []
    for s in ORDERED + [None]:
        if s is None or s["wave"] != cur_wave:
            if buf:
                phases_html.append(
                    f'<section class="phase" id="fase-{cur_wave}">'
                    f'<h3><span class="ph">Fase {cur_wave}</span>'
                    f'<span class="pc">{len(buf)} steg</span></h3>'
                    f'<ol class="steps">{"".join(buf)}</ol></section>')
                for x in done_children:
                    have.add(x)
            if s is None:
                break
            cur_wave, buf, done_children = s["wave"], [], []
        buf.append(step_card(s, have))
        done_children.append(s["child"])

    hist = "".join(
        f'<li class="step done"><span class="hcheck">✓</span><div class="recipe">'
        f'<span class="parent">{icon_html(a, 32)}<span class="pn">{esc(a)}</span></span>'
        f'<span class="op">+</span>'
        f'<span class="parent">{icon_html(b, 32)}<span class="pn">{esc(b)}</span></span>'
        f'<span class="op">=</span><span class="child">{icon_html(c, 36)}'
        f'<span class="cn"><b>{esc(c)}</b></span></span></div></li>'
        for a, b, c in HISTORY)

    goals = []
    for title, names in GOAL_GROUPS:
        cards = "".join(goal_card(n) for n in names)
        extra = ""
        if title.startswith("Aura"):
            extra = ("".join(goal_card(n, owned=True) for n in AURA_OWNED))
        goals.append(f'<h3>{esc(title)}</h3><div class="goals">{cards}{extra}</div>')

    keep_list = "".join(
        f'<li>{icon_html(p_, 28)} <b>{esc(p_)}</b> — {n} steg</li>'
        for p_, n in sorted(
            ((p_, sum(1 for s in ORDERED for q in
                      [IN_PROGRESS_OVERRIDES.get(s["child"], s["parents"])] if p_ in q))
             for p_ in {x for s in ORDERED
                        for x in IN_PROGRESS_OVERRIDES.get(s["child"], s["parents"])}),
            key=lambda kv: -kv[1]) if n >= 2 and p_ not in ROSTER)

    verif_html = ""
    if VERIF:
        verif_html = f'''<section id="kilder2">
<h2>Bekreftet vs. usikkert</h2>
<p>Kryssjekket {len(VERIF["claims"])} påstander mot uavhengige kilder ({esc(VERIF.get("checked", ""))}).
Full kildeliste ligger i <code>data/verification.json</code>.</p>
<div class="tablewrap"><table class="verif">
<thead><tr><th>Påstand</th><th>Status</th><th>Belegg</th></tr></thead>
<tbody>{verification_rows()}</tbody></table></div></section>'''

    css = CSS
    js = JS
    return f'''<title>Eggfabrikken</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>{css}</style>
<header class="hero">
  <p class="eyebrow">Palworld 1.0 · kun breeding · Pål-Andre · lvl 44</p>
  <h1>Eggfabrikken</h1>
  <p class="lede">Fra 101 arter i rosteret til de beste palsene i spillet — én kake om gangen.
  Planen er regnet ut som korteste delte tre: felles mellomledd telles bare én gang.</p>
  <div class="tiles">
    <div class="tile"><b>{n_steps}</b><span>breeding-steg</span></div>
    <div class="tile"><b>{n_targets}</b><span>endemål</span></div>
    <div class="tile"><b>{len(known)}<i>/299</i></b><span>arter nåbare</span></div>
    <div class="tile"><b>{len(ties)}</b><span>steg å verifisere</span></div>
  </div>
</header>
<nav class="bar" aria-label="Fremdrift og innhold">
  <div class="prog"><span id="progfill"></span></div>
  <span id="progtxt">0 / {n_steps}</span>
  <a href="#plan">Plan</a><a href="#maal">Mål</a><a href="#drift">Drift</a><a href="#kilder">Kilder</a>
  <button id="reset" type="button" title="Nullstill avkryssing">nullstill</button>
</nav>
<main>
<section id="regler">
  <h2>Slik virker formelen</h2>
  <div class="rules">
    <p><b>Unik oppskrift først.</b> 134 par har fast fasit (f.eks. Frostplume + Univolt =
    Univolt Cryst), og ett par er kjønnsavhengig (Katress/Wixen). Treffer paret ingen oppskrift,
    blir barnet arten med CombiRank nærmest
    <code>⌊(rank<sub>A</sub> + rank<sub>B</sub> + 1) / 2⌋</code> — men bare blant de
    183 artene i den <b>generiske puljen</b>: varianter og legendariske som kun finnes som
    oppskriftsbarn kan aldri dukke opp av formelen.</p>
    <p><b>Ved eksakt uavgjort</b> vinner høyeste CombiRank. Hele modellen (formel, pulje og
    tie-break) er verifisert mot spillfilenes egen fasit: alle 44 851 forhåndsberegnede
    1.0-resultater i palcalc-datasettet replikeres uten ett eneste avvik, og regelen stemmer
    med spillertesten Turtacle + Aegidron → Nitemary. De {len(ties)} stegene som avhenger av
    tie-break er likevel merket <span class="badge warn">tie-break</span> — vil du være
    hundre prosent trygg, test dem med én kake først.</p>
    <p><b>Kjønn:</b> hvert steg trenger hann av den ene forelderen og hunn av den andre
    (hvilken er likegyldig for arten). Avkom er ~50/50 — mellomledd som gjenbrukes bør
    beholdes i begge kjønn. Kjønn kan også byttes med <b>Pal Reverser</b>.</p>
  </div>
</section>
<section id="historikk">
  <h2>Ryggraden så langt <span class="pc">5 steg fullført ✓</span></h2>
  <ol class="steps hist">{hist}</ol>
</section>
<section id="plan">
  <h2>Planen — {n_steps} steg i 8 faser</h2>
  <p class="hint">Innen samme fase kan alt bres parallelt (har du ledige farmer, kjør flere par
  samtidig). Kryss av etter hvert — lagres i nettleseren.</p>
  {"".join(phases_html)}
</section>
<section id="behold">
  <h2>Behold begge kjønn av disse</h2>
  <p class="hint">Mellomledd som skal være forelder i to eller flere steg:</p>
  <ul class="keep">{keep_list}</ul>
</section>
<section id="maal">
  <h2>Målgalleriet</h2>
  <p class="hint">Dette er de beste artene som faktisk <b>kan bres</b> fra rosteret ditt.
  De få som er naturlig sterkere per jobb (Aegidron Mining 8, Shaolong Watering 8, Dandilord
  Planting 8, Jetragon Gathering 8, Silvance Medicine 8, Bastigor Cooling 8) er alle
  self-breed-only eller alpha-fangst — utenfor rekkevidde med kun breeding. De fleste målene
  spawner også vilt i World Tree-regionen (lvl 75+), men på lvl 44 er eggfabrikken veien.</p>
  {"".join(goals)}
</section>
<section id="drift">
  <h2>Drift av eggfabrikken (lvl 44)</h2>
  <div class="rules">
  <p>Breeding Farm er tech 19, standardkaka tech 17 — alt i denne planen kan kjøres på
  standardkaker. Inkubasjonstiden ble halvert i 1.0 (nye verdener), og Ancient Hatchery
  (lvl 76) venter i endgame.</p>
  <h3>Kaker</h3>
  <div class="tablewrap"><table>
  <thead><tr><th>Kake</th><th>Tech</th><th>Stasjon</th><th>Effekt</th><th>Mutasjon</th></tr></thead>
  <tbody>
  <tr class="now"><td><b>Cake</b></td><td>17 ✓</td><td>Cooking Pot</td><td>standard — driver alt i planen</td><td>~1&nbsp;% per egg</td></tr>
  <tr class="now"><td><b>Mushroom Cake</b></td><td>30 ✓</td><td>Cooking Pot</td><td>bedre IV hos avkom</td><td>~1&nbsp;%</td></tr>
  <tr><td><b>Vegetable Cake</b></td><td>47</td><td>Electric Kitchen</td><td><b>2 egg per syklus</b> — nærmeste store oppgradering (3 nivåer unna!)</td><td>1&nbsp;% × 2 egg (≈2&nbsp;%/syklus)</td></tr>
  <tr><td><b>Extravagant Veg. Cake</b></td><td>60</td><td>Large-Scale Stone Oven</td><td>best mutasjonssjanse + IV</td><td>~3&nbsp;% per egg</td></tr>
  <tr><td><b>Special Cake</b></td><td>74</td><td>Ancient Kitchen</td><td>arver flere passiver</td><td>–</td></tr>
  </tbody></table></div>
  <p class="hint">Oppskrift standardkake: 5 mel · 8 røde bær · 7 melk · 8 egg · 2 honning
  (Mozzarina, Chikipi og Beegarde på ranch dekker melk/egg/honning).
  Artsplanen trenger bare standardkaker — spar de dyre til passiv/IV/mutasjonsjakt etterpå.</p>
  <h3>Rekkefølgen for én perfekt pal</h3>
  <p>1) <b>Art</b> (denne planen) → 2) <b>passiver</b> (Pal Surgery Table, tech 38: implanter
  for 10–50k gull per operasjon; standard-implanter forbrukes ikke — chain-breeding for passiver
  er i praksis foreldet) → 3) <b>IV</b> (Mushroom Cake, samme-art-avl; arv per stat: 30&nbsp;% far /
  30&nbsp;% mor / 40&nbsp;% tilfeldig) → 4) <b>kondensering</b> → 5) <b>Awakening</b> til slutt.
  Kjønn byttes med Pal Reverser (forbrukes; kjøpes bl.a. for Bounty Tokens).</p>
  <h3>Kondensering (1.0)</h3>
  <p>4★ koster <b>48 kopier</b> totalt: 4 / 8 / 12 / 24 per stjerne (gamle guider sier 116 —
  utdatert). Hver stjerne løfter én arbeidsegenskap ett nivå; 4★ løfter alle, og
  partner-skill-nivå = stjerner + 1. Mutant-egg klekkes med 2★ — da gjenstår bare 12 + 24 = 36.
  Tips: <b>Starfruit</b> (kjøpes for Dog Coins) kan erstatte kopier i condenseren.</p>
  <h3>Mutasjon</h3>
  <p>~1 % per egg med standardkake (~3 % med Extravagant). Mutanten klekkes som Alpha med 2★,
  IV ~91–100 og fire passiver hvorav minst to regnbue — men <b>arten kan bli en annen</b> (og
  sterkere) enn parets normale barn. Volum vinner: kjør flere farmer, og la Braloha (+20–50 %
  egg-fart) og Dynamoff (−20–40 % inkubasjonstid) jobbe for deg når de er bredd i fase 1.</p>
  </div>
</section>
{verif_html}
<section id="kilder">
  <h2>Kilder og oppdatering</h2>
  <p>Data: paldb.cc (CombiRank-tabell + 164 unike kombinasjoner, hentet 2026-07-14),
  palworld.wiki.gg, palworld.ludbase.com, via 1.0-datasettet
  <a href="https://github.com/beliarance/palworld-kb">beliarance/palworld-kb</a> @ cf9ecbe.
  Mekanikk kryssjekket mot uavhengige kilder 2026-08-14 — se <code>data/verification.json</code>.
  Artsformelen er testet mot 31 kjente par (<code>tests/</code>).</p>
  <p>Ny pal i boksen? <code>python3 planner.py add &lt;navn&gt;</code> og deretter
  <code>python3 build_guide.py</code> → denne siden regenereres med oppdatert plan.
  Uidentifisert fra gamle lista: «godbin» — mente du Gobfin Ignis? Legg til riktig navn i
  <code>roster.txt</code>.</p>
  <p class="foot">Ikoner: cdn.paldb.cc (vises når du er på nett; ellers monogram).
  Generert {esc(json.loads((ROOT / "data" / "breeding_1_0.json").read_text())["extracted"])} ·
  Palworld 1.0 · nivåtak 80.</p>
</section>
</main>
<script>{js}</script>'''


CSS = r'''
:root{
  --bg:#EDF2F3; --surface:#FFFFFF; --surface2:#E2EAEB; --ink:#182528;
  --muted:#54696E; --line:#C9D6D8; --accent:#17777E; --accent-ink:#0F5A60;
  --ok:#2E7D46; --ok-bg:#DDEEE2; --warn:#8A5A0B; --warn-bg:#F5E7C8;
  --bad:#A33B2E; --bad-bg:#F4DCD7; --gold:#B98718; --gold-bg:#F6ECD2;
  --el-neutral:#5F6B70;--el-neutral-bg:#E4E8EA; --el-fire:#B23B24;--el-fire-bg:#F6DDD6;
  --el-water:#20618F;--el-water-bg:#D9E7F2; --el-grass:#3D7A31;--el-grass-bg:#DFEDD9;
  --el-electric:#8A6D0B;--el-electric-bg:#F5ECC8; --el-ice:#1F7186;--el-ice-bg:#D7EDF2;
  --el-ground:#7A5426;--el-ground-bg:#EFE3D2; --el-dark:#5A4380;--el-dark-bg:#E6DFF1;
  --el-dragon:#4A54A8;--el-dragon-bg:#DEE1F4;
}
:root:not([data-theme="light"]){}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --bg:#0F1B1D; --surface:#16252A; --surface2:#1D3036; --ink:#E3EDEE;
    --muted:#94A9AC; --line:#2C4147; --accent:#4FB3BA; --accent-ink:#7BCDD2;
    --ok:#7FC795; --ok-bg:#1C3A28; --warn:#E4B564; --warn-bg:#3C2F13;
    --bad:#E59180; --bad-bg:#42201A; --gold:#E2BC5F; --gold-bg:#3A2F12;
    --el-neutral:#AEB9BD;--el-neutral-bg:#28353A; --el-fire:#EE9A82;--el-fire-bg:#402019;
    --el-water:#8FC1E8;--el-water-bg:#1B3348; --el-grass:#9CCB8B;--el-grass-bg:#22371D;
    --el-electric:#E7CB6A;--el-electric-bg:#3B3112; --el-ice:#88CFE2;--el-ice-bg:#153742;
    --el-ground:#D3A96F;--el-ground-bg:#3A2C18; --el-dark:#C0A9E8;--el-dark-bg:#2E2342;
    --el-dragon:#A6B0F0;--el-dragon-bg:#232A52;
  }
}
:root[data-theme="dark"]{
  --bg:#0F1B1D; --surface:#16252A; --surface2:#1D3036; --ink:#E3EDEE;
  --muted:#94A9AC; --line:#2C4147; --accent:#4FB3BA; --accent-ink:#7BCDD2;
  --ok:#7FC795; --ok-bg:#1C3A28; --warn:#E4B564; --warn-bg:#3C2F13;
  --bad:#E59180; --bad-bg:#42201A; --gold:#E2BC5F; --gold-bg:#3A2F12;
  --el-neutral:#AEB9BD;--el-neutral-bg:#28353A; --el-fire:#EE9A82;--el-fire-bg:#402019;
  --el-water:#8FC1E8;--el-water-bg:#1B3348; --el-grass:#9CCB8B;--el-grass-bg:#22371D;
  --el-electric:#E7CB6A;--el-electric-bg:#3B3112; --el-ice:#88CFE2;--el-ice-bg:#153742;
  --el-ground:#D3A96F;--el-ground-bg:#3A2C18; --el-dark:#C0A9E8;--el-dark-bg:#2E2342;
  --el-dragon:#A6B0F0;--el-dragon-bg:#232A52;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
  font:16px/1.55 system-ui,"Segoe UI",Roboto,-apple-system,sans-serif;}
main,.hero,.bar{max-width:1080px;margin:0 auto;padding:0 20px}
h1,h2,h3,h4{font-family:ui-rounded,"Hiragino Maru Gothic ProN","Trebuchet MS",
  "Segoe UI",system-ui,sans-serif;text-wrap:balance;line-height:1.15}
code{font:0.9em ui-monospace,"Cascadia Mono",Menlo,Consolas,monospace;
  background:var(--surface2);padding:1px 5px;border-radius:4px}
a{color:var(--accent-ink)}
.hero{padding:44px 20px 20px}
.eyebrow{text-transform:uppercase;letter-spacing:.14em;font-size:12px;color:var(--muted);margin:0}
.hero h1{font-size:clamp(38px,6vw,58px);margin:.05em 0 .15em;color:var(--accent-ink)}
.lede{max-width:62ch;color:var(--muted);margin:0 0 18px}
.tiles{display:flex;gap:12px;flex-wrap:wrap}
.tile{background:var(--surface);border:1px solid var(--line);border-radius:10px;
  padding:10px 18px;min-width:120px}
.tile b{display:block;font-size:28px;font-variant-numeric:tabular-nums;color:var(--accent-ink)}
.tile b i{font-style:normal;font-size:16px;color:var(--muted)}
.tile span{font-size:12.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em}
.bar{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:14px;
  background:var(--bg);border-bottom:1px solid var(--line);padding:9px 20px;font-size:14px}
.bar a{color:var(--muted);text-decoration:none;font-weight:600}
.bar a:hover,.bar a:focus-visible{color:var(--accent-ink)}
.prog{flex:0 0 130px;height:8px;border-radius:4px;background:var(--surface2);overflow:hidden}
.prog span{display:block;height:100%;width:0;background:var(--accent);transition:width .25s}
#progtxt{font-variant-numeric:tabular-nums;color:var(--muted);min-width:64px}
#reset{margin-left:auto;background:none;border:1px solid var(--line);border-radius:6px;
  color:var(--muted);padding:3px 10px;cursor:pointer;font-size:12.5px}
#reset:hover{color:var(--bad);border-color:var(--bad)}
section{margin:38px 0}
h2{font-size:26px;border-bottom:2px solid var(--line);padding-bottom:6px}
h2 .pc{font-size:14px;color:var(--ok);margin-left:10px}
.rules{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:6px 20px}
.rules p{max-width:75ch}
.hint{color:var(--muted);font-size:14.5px;max-width:75ch}
.phase{margin:22px 0}
.phase h3{display:flex;align-items:baseline;gap:12px;margin:0 0 8px}
.ph{color:var(--accent-ink);font-size:20px}
.pc{color:var(--muted);font-size:13px;font-weight:400}
ol.steps{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.step{display:grid;grid-template-columns:auto 1fr auto;gap:6px 14px;align-items:center;
  background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:10px 14px}
.step.target{border-left:4px solid var(--gold)}
.step .tienote{grid-column:1/-1;margin:2px 0 0;font-size:13.5px;background:var(--warn-bg);
  color:var(--warn);border-radius:8px;padding:7px 10px;max-width:none}
.step .tienote.alt{background:var(--surface2);color:var(--muted)}
.step.checked{opacity:.55}
.step.checked .recipe{text-decoration:line-through;text-decoration-color:var(--muted);
  text-decoration-thickness:1px}
.tick input{position:absolute;opacity:0;width:26px;height:26px;cursor:pointer}
.tick span{display:inline-block;width:24px;height:24px;border:2px solid var(--line);
  border-radius:7px;background:var(--surface2);position:relative;cursor:pointer;transition:all .15s}
.tick input:checked+span{background:var(--ok);border-color:var(--ok)}
.tick input:checked+span::after{content:"✓";position:absolute;inset:0;display:grid;
  place-items:center;color:#fff;font-size:15px;font-weight:700}
.tick input:focus-visible+span{outline:2px solid var(--accent);outline-offset:2px}
.recipe{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.parent,.child{display:flex;align-items:center;gap:8px}
.child{flex:1 1 300px;min-width:260px}
.pn{font-size:14.5px;font-weight:600}
.op{color:var(--muted);font-weight:700}
.cn{display:flex;flex-direction:column;gap:3px}
.cn b{font-size:16.5px}
.meta,.meta2{display:flex;gap:5px;flex-wrap:wrap;align-items:center}
.meta2{font-size:12.5px;color:var(--muted)}
.detail{font-variant-numeric:tabular-nums}
.egg{white-space:nowrap}
.side{display:flex;flex-direction:column;align-items:flex-end;gap:5px;font-size:12.5px}
.needs{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end;max-width:320px}
.nlbl{color:var(--muted);text-transform:uppercase;font-size:10.5px;letter-spacing:.07em;
  align-self:center}
.chip{display:inline-block;border-radius:20px;padding:1px 9px;font-size:12px;font-weight:600;
  background:var(--surface2);color:var(--muted)}
.chip.work{background:var(--surface2);color:var(--ink)}
.chip.work b{color:var(--accent-ink)}
.chip.need{background:var(--gold-bg);color:var(--gold)}
.badge{display:inline-block;border-radius:6px;padding:2px 8px;font-size:11.5px;font-weight:700;
  text-transform:uppercase;letter-spacing:.05em}
.badge.unique{background:var(--el-dragon-bg);color:var(--el-dragon)}
.badge.warn,.badge.v-warn{background:var(--warn-bg);color:var(--warn)}
.badge.now{background:var(--ok-bg);color:var(--ok)}
.badge.goal{background:var(--gold-bg);color:var(--gold)}
.badge.keep{background:var(--el-water-bg);color:var(--el-water);text-transform:none}
.badge.own,.badge.v-ok{background:var(--ok-bg);color:var(--ok)}
.badge.v-bad{background:var(--bad-bg);color:var(--bad)}
.pic{position:relative;display:inline-grid;place-items:center;width:var(--s);height:var(--s);
  border-radius:50%;background:var(--surface2);border:1.5px solid var(--line);overflow:hidden;
  flex:none}
.pic img{width:100%;height:100%;object-fit:cover;display:block}
.pic.noimg img{display:none}
.pic.noimg::after{content:attr(data-mono);font-size:calc(var(--s)*.34);font-weight:800;
  color:var(--muted)}
.pic.noimg.el-fire::after{color:var(--el-fire)} .pic.noimg.el-fire{background:var(--el-fire-bg)}
.pic.noimg.el-water::after{color:var(--el-water)} .pic.noimg.el-water{background:var(--el-water-bg)}
.pic.noimg.el-grass::after{color:var(--el-grass)} .pic.noimg.el-grass{background:var(--el-grass-bg)}
.pic.noimg.el-electric::after{color:var(--el-electric)} .pic.noimg.el-electric{background:var(--el-electric-bg)}
.pic.noimg.el-ice::after{color:var(--el-ice)} .pic.noimg.el-ice{background:var(--el-ice-bg)}
.pic.noimg.el-ground::after{color:var(--el-ground)} .pic.noimg.el-ground{background:var(--el-ground-bg)}
.pic.noimg.el-dark::after{color:var(--el-dark)} .pic.noimg.el-dark{background:var(--el-dark-bg)}
.pic.noimg.el-dragon::after{color:var(--el-dragon)} .pic.noimg.el-dragon{background:var(--el-dragon-bg)}
.chip.el-neutral{background:var(--el-neutral-bg);color:var(--el-neutral)}
.chip.el-fire{background:var(--el-fire-bg);color:var(--el-fire)}
.chip.el-water{background:var(--el-water-bg);color:var(--el-water)}
.chip.el-grass{background:var(--el-grass-bg);color:var(--el-grass)}
.chip.el-electric{background:var(--el-electric-bg);color:var(--el-electric)}
.chip.el-ice{background:var(--el-ice-bg);color:var(--el-ice)}
.chip.el-ground{background:var(--el-ground-bg);color:var(--el-ground)}
.chip.el-dark{background:var(--el-dark-bg);color:var(--el-dark)}
.chip.el-dragon{background:var(--el-dragon-bg);color:var(--el-dragon)}
.hist .step{grid-template-columns:auto 1fr;padding:6px 14px}
.hcheck{color:var(--ok);font-weight:800;font-size:18px}
.keep{list-style:none;padding:0;display:flex;flex-wrap:wrap;gap:10px}
.keep li{display:flex;align-items:center;gap:8px;background:var(--surface);
  border:1px solid var(--line);border-radius:24px;padding:5px 14px 5px 6px;font-size:14px}
.goals{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;margin:12px 0 26px}
.goal{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.goal header{display:flex;gap:12px;align-items:center;margin-bottom:8px}
.goal h4{margin:0;font-size:18px}
.goal .meta{margin:4px 0}
.pskill{font-size:13.5px;color:var(--muted);margin:8px 0 0}
.aura{font-size:13.5px;color:var(--gold);font-weight:600;margin:8px 0 0}
.stats{display:flex;flex-direction:column;gap:4px;margin-top:10px}
.stat{display:grid;grid-template-columns:34px 1fr 34px;gap:8px;align-items:center;font-size:12px}
.sl{color:var(--muted);font-weight:700;letter-spacing:.05em}
.sb{height:8px;border-radius:4px;background:var(--surface2);overflow:hidden}
.sb span{display:block;height:100%;border-radius:4px 3px 3px 4px;background:var(--accent)}
.sv{text-align:right;font-variant-numeric:tabular-nums;color:var(--ink)}
.tablewrap{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:14px;margin:10px 0}
th{text-align:left;color:var(--muted);text-transform:uppercase;font-size:11.5px;
  letter-spacing:.07em;border-bottom:2px solid var(--line);padding:6px 10px}
td{border-bottom:1px solid var(--line);padding:8px 10px;vertical-align:top}
tr.now td{background:var(--ok-bg)}
.verif td:first-child{max-width:340px}
.foot{color:var(--muted);font-size:13px}
@media (max-width:700px){
  .step{grid-template-columns:auto 1fr}
  .side{grid-column:2;align-items:flex-start}
  .needs{justify-content:flex-start}
  .bar{flex-wrap:wrap}
}
@media (prefers-reduced-motion: reduce){
  *{transition:none !important}
}
'''

JS = r'''
(function(){
  var KEY='eggfabrikken-v1';
  var state={};
  try{state=JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){}
  var steps=[].slice.call(document.querySelectorAll('.step[data-sid]'));
  var fill=document.getElementById('progfill');
  var txt=document.getElementById('progtxt');
  function save(){try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){}}
  function update(){
    var done=steps.filter(function(s){return s.classList.contains('checked')}).length;
    if(fill)fill.style.width=(steps.length?100*done/steps.length:0)+'%';
    if(txt)txt.textContent=done+' / '+steps.length;
  }
  steps.forEach(function(li){
    var sid=li.getAttribute('data-sid');
    var cb=li.querySelector('input[type=checkbox]');
    if(state[sid]){cb.checked=true;li.classList.add('checked');}
    cb.addEventListener('change',function(){
      state[sid]=cb.checked; if(!cb.checked)delete state[sid];
      li.classList.toggle('checked',cb.checked); save(); update();
    });
  });
  var reset=document.getElementById('reset');
  if(reset)reset.addEventListener('click',function(){
    if(!confirm('Nullstille all avkryssing?'))return;
    state={}; save();
    steps.forEach(function(li){li.classList.remove('checked');
      li.querySelector('input').checked=false;});
    update();
  });
  update();
})();
'''


if __name__ == "__main__":
    out = OUT_EMBED if EMBED else OUT
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(build())
    print(f"wrote {out} ({out.stat().st_size/1024:.0f} KB)")
