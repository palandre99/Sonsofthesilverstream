#!/usr/bin/env python3
"""Generates guide/index.html — Eggfabrikken, Pål-Andres Palworld 1.0
breeding-guide som en faneinndelt liten app.

    python3 build_guide.py           # guide/index.html  (ikoner fra guide/icons/)
    python3 build_guide.py --embed   # guide/artifact.html (alt innbakt, én fil)

Faner: Plan (48 steg med klar-status), Paldex (eierskap for alle 299),
Mål (galleri med fremdrift), Drift (mekanikk), Kilder (verifisering).
Avkryssing og eierskap lagres i localStorage; Paldex-eierskap styrer
hvilke steg som lyser «klar nå».
"""
from __future__ import annotations

import base64
import html
import json
import re
import sys
from pathlib import Path

import planner as P

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "guide" / "index.html"
OUT_EMBED = ROOT / "guide" / "artifact.html"

ICON_FILES: dict[str, str] = json.loads(
    (ROOT / "data" / "icon_map.json").read_text())["files"]
EMBED = "--embed" in sys.argv
_DATAURI_CACHE: dict[str, str] = {}

# ----------------------------------------------------------------- plan input

ROSTER = set(P.load_roster())
TARGETS = P.load_targets()
ORDERED, UNREACHABLE, DERIVS = P.plan_for(ROSTER, TARGETS)

IN_PROGRESS_OVERRIDES = {  # han venter på dette egget nå
    "Frostplume": ("Menasting", "Reptyro Cryst"),
}

HISTORY = [  # allerede bredd (ryggraden steg 1-5) — resultatene står i roster.txt
    ("Beakon", "Helzephyr", "Helzephyr Lux"),
    ("Helzephyr Lux", "Verdash", "Reptyro"),
    ("Foxcicle", "Reptyro", "Reptyro Cryst"),
    ("Blazehowl", "Quivern", "Warsect"),
    ("Digtoise", "Warsect", "Warsect Terra"),
]

GOAL_GROUPS = [
    ("Topparbeidere",
     "De beste arbeiderne som kan bres fra rosteret.",
     ["Solenne", "Celesdir Noct", "Renjishi", "Knocklem", "Starryon Primo",
      "Ophydia", "Anubis", "Astegon", "Blazamut", "Sibelyx Primo", "Venusa",
      "Mycora", "Univolt Cryst", "Whalaska Ignis", "Solmora Lux"]),
    ("Aura-pals",
     "Én per arbeidstype: +1 arbeidsnivå til alle andre i basen (stakker ikke, "
     "gjelder ikke bæreren selv).",
     ["Tetroise", "Wumpo", "Amione", "Eikthyrdeer Terra", "Katress Ignis",
      "Puffolt", "Smokie Cryst", "Mycora"]),
    ("Breeding-støtte",
     "Gjør resten av eggfabrikken raskere: egg-fart, inkubasjon, kakeavlinger "
     "og Anubis-parhesten.",
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


def sid_of(a: str, b: str, c: str) -> str:
    return f"{a}+{b}={c}".replace(" ", "_")


def step_parents(s: dict) -> tuple[str, str]:
    return IN_PROGRESS_OVERRIDES.get(s["child"], s["parents"])


def egg_hint(name: str) -> str:
    eggs = pal(name).get("egg_types") or []
    if not eggs:
        return ""
    e = eggs[0]
    if any(w in e for w in ("Scorching", "Flaming")):
        return f"{e} · trenger varme"
    if any(w in e for w in ("Frozen", "Icy")):
        return f"{e} · trenger kulde"
    return e


def safe_alternatives(child: str, tie_pair: tuple[str, str], have: set[str]) -> list[tuple[str, str]]:
    hl = sorted(have)
    out = []
    for i, a in enumerate(hl):
        for b in hl[i:]:
            if {a, b} == set(tie_pair):
                continue
            ch = P.child_of(*sorted((a, b)))
            if ch.species == child and ch.kind == "generic" and not ch.tie_break:
                out.append((a, b))
    return out


def tie_loser_child(a: str, b: str) -> str:
    t = (P.RANKS[a] + P.RANKS[b] + 1) // 2
    near = sorted(P.POOL, key=lambda s: (abs(P.RANKS[s] - t), P.RANKS[s]))
    return near[0]


# ------------------------------------------------------------------ resources

def font_face_css() -> str:
    css = []
    for fam, fname, wrange in [("Manrope", "manrope-sub.woff2", "200 800"),
                               ("Baloo 2", "baloo2-sub.woff2", "400 800")]:
        p = ROOT / "guide" / "fonts" / fname
        if EMBED:
            src = ("url(data:font/woff2;base64,"
                   + base64.b64encode(p.read_bytes()).decode() + ")")
        else:
            src = f"url(fonts/{fname})"
        css.append(f"@font-face{{font-family:'{fam}';font-style:normal;"
                   f"font-weight:{wrange};font-display:swap;"
                   f"src:{src} format('woff2')}}")
    return "".join(css)


def icon_data_uri(name: str) -> str | None:
    """data-URI for a pal icon (cached; embed mode only)."""
    f = ICON_FILES.get(name)
    if not f:
        return None
    if name not in _DATAURI_CACHE:
        raw = (ROOT / "guide" / "icons" / f).read_bytes()
        _DATAURI_CACHE[name] = ("data:image/png;base64,"
                                + base64.b64encode(raw).decode())
    return _DATAURI_CACHE[name]


def icon_html(name: str, size: int = 44) -> str:
    p = pal(name)
    el = (p.get("elements") or ["Neutral"])[0].lower()
    mono = "".join(w[0] for w in name.split()[:2]).upper()
    onerr = ("if(this.dataset.alt){this.src=this.dataset.alt;"
             "delete this.dataset.alt}else{this.parentNode.classList.add('noimg')}")
    if EMBED:
        # src filled in by JS from the deduplicated DATA.icons map
        return (f'<span class="pic el-{el}" style="--s:{size}px" data-mono="{esc(mono)}">'
                f'<img data-pal="{esc(name)}" alt="" loading="lazy" '
                f'onerror="{onerr}"></span>')
    f = ICON_FILES.get(name)
    cdn = pal(name).get("icon") or ""
    src = f"icons/{f}" if f else cdn
    fallback = (f'data-alt="{esc(cdn)}" ' if f and cdn else "")
    return (f'<span class="pic el-{el}" style="--s:{size}px" data-mono="{esc(mono)}">'
            f'<img src="{esc(src)}" alt="" loading="lazy" {fallback}'
            f'onerror="{onerr}"></span>')


def el_chips(name: str) -> str:
    return "".join(
        f'<span class="chip el-{e.lower()}">{esc(ELEMENT_NO.get(e, e))}</span>'
        for e in pal(name).get("elements") or [])


def work_label(j: str) -> str:
    j = j.replace("_", " ")
    return "Electricity" if j == "Generating Electricity" else j


def work_chips(name: str, top: int | None = None) -> str:
    work = sorted((pal(name).get("work") or {}).items(), key=lambda kv: -kv[1])
    if top:
        work = work[:top]
    return "".join(f'<span class="chip work">{esc(work_label(j))} <b>{v}</b></span>'
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


# ------------------------------------------------------------- plan fragments

def step_card(s: dict, have_before: set[str]) -> str:
    child = s["child"]
    a, b = step_parents(s)
    in_prog = child in IN_PROGRESS_OVERRIDES
    alt_note = ""
    if in_prog and {a, b} != set(s["parents"]):
        pa, pb = s["parents"]
        alt_note = f"Alternativ rute med samme resultat: {pa} + {pb}."

    sid = sid_of(a, b, child)
    flags = []
    if s["kind"] == "unique":
        flags.append('<span class="badge unique">unik oppskrift</span>')
    if s["kind"] == "gendered":
        flags.append('<span class="badge lock">'
                     '<svg viewBox="0 0 10 12" aria-hidden="true">'
                     '<rect x="1" y="5" width="8" height="6" rx="1.4"/>'
                     '<path d="M3 5V3.4a2 2 0 0 1 4 0V5" fill="none" '
                     'stroke="currentColor" stroke-width="1.5"/></svg>'
                     'kjønn låst</span>')
    if s["tie_break"]:
        flags.append('<span class="badge warn">tie-break — verifiser</span>')
    if in_prog:
        flags.append('<span class="badge now">egg i farmen nå</span>')
    if s["is_target"]:
        flags.append('<span class="badge goal">Mål</span>')
    reuse = s["reused_as_parent"]
    keep = (f'<span class="badge keep">forelder i {reuse} steg til — '
            f'behold ♂ + ♀</span>') if reuse >= 2 else ""

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
        tie_html = (f'<p class="note warn-note">Utfallet avhenger av tie-break-regelen '
                    f'(datamine-bekreftet, 0 unntak av 14 021 — men test gjerne med én '
                    f'kake). Slår den motsatt vei, klekkes <b>{esc(loser)}</b> i stedet — '
                    f'også en art planen trenger.{esc(alt_txt)}</p>')

    gender_html = ""
    if s["kind"] == "gendered":
        gender_html = (f'<p class="note warn-note">Spillets eneste kjønnslåste par — merkene '
                       f'på ikonene viser fasiten: <b>{esc(s["gender_note"])}</b> gir '
                       f'{esc(child)}. Bytter du kjønnene, får du det andre barnet '
                       f'(Katress Ignis ↔ Wixen Noct). Feil kjønn = feil pal.</p>')

    egg = egg_hint(child)
    egg_html = f'<span class="egg">🥚 {esc(egg)}</span>' if egg else ""

    # gender pins: ONLY where the game locks genders (Katress/Wixen)
    pins: dict[str, str] = {}
    if s["kind"] == "gendered":
        for g in P.BREEDING.get("gendered_combos", []):
            if g["child"] == child:
                pins[g["mother"]] = "f"
                pins[g["father"]] = "m"

    def parent_html(name: str) -> str:
        pin = pins.get(name)
        pin_h = (f'<i class="gpin {pin}" title="må være '
                 f'{"hunn" if pin == "f" else "hann"}">'
                 f'{"♀" if pin == "f" else "♂"}</i>') if pin else ""
        return (f'<span class="parent"><span class="gwrap">{icon_html(name, 40)}'
                f'{pin_h}</span><span class="pn">{esc(name)}</span></span>')

    op_title = ("Kjønnene er LÅST for dette paret — se merkene"
                if pins else
                "Trenger hann av den ene og hunn av den andre — valgfri fordeling")

    return f'''<li class="step{' target' if s['is_target'] else ''}" data-sid="{esc(sid)}" data-a="{esc(a)}" data-b="{esc(b)}" data-c="{esc(child)}">
<label class="tick"><input type="checkbox" aria-label="Fullført: {esc(a)} + {esc(b)} = {esc(child)}"><span></span></label>
<div class="recipe">
  {parent_html(a)}
  <span class="op" title="{esc(op_title)}">+</span>
  {parent_html(b)}
  <span class="op">=</span>
  <span class="child">{icon_html(child, 52)}
    <span class="cn"><b>{esc(child)}</b>
      <span class="meta">{el_chips(child)}{work_chips(child, 3)}</span>
      <span class="meta2">{egg_html}{('<span class="detail">' + detail + '</span>') if detail else ''}</span>
    </span>
  </span>
</div>
<div class="side"><span class="ready-slot"></span>{"".join(flags)}{keep}
  {f'<div class="needs"><span class="nlbl">trengs til</span>{need_chips}</div>' if need else ''}
</div>
{tie_html}
{gender_html}
{f'<p class="note alt-note">{esc(alt_note)}</p>' if alt_note else ''}
</li>'''


def goal_card(name: str, owned: bool = False) -> str:
    p = pal(name)
    ps = p.get("partner_skill") or ""
    pe = p.get("partner_effect") or ""
    bs = p.get("base_support")
    aura = ""
    if bs and bs.get("type") == "suitability":
        aura = (f'<p class="aura">✨ Aura: +{bs["bonus"]} {esc(work_label(bs["task"]))} '
                f'for alle pals i basen</p>')
    elif bs and bs.get("effect"):
        aura = f'<p class="aura">✨ {esc(bs["effect"])}</p>'
    wild = "" if p.get("wild") else '<span class="badge unique">ingen vanlig villspawn</span>'
    own = '<span class="badge own">i rosteret ✓</span>' if owned else ""
    prog = "" if owned else (
        '<div class="gprog" role="img" aria-label="fremdrift">'
        '<div class="gbar"><span></span></div><span class="gtxt">0 av ? steg</span></div>')
    return f'''<article class="goal" data-goal="{esc(name)}">
<header>{icon_html(name, 56)}<div><h4>{esc(name)}</h4>
<div class="meta">{el_chips(name)}{wild}{own}</div></div></header>
<div class="meta">{work_chips(name)}</div>
{stat_bars(name)}
{f'<p class="pskill"><b>{esc(ps)}:</b> {esc(pe)}</p>' if pe else ''}
{aura}
{prog}
</article>'''


# --------------------------------------------------------------------- paldex

def paldex_sort_key(name: str):
    n = pal(name).get("number") or ""
    m = re.fullmatch(r"(\d+)([A-Z]?)", n)
    if m:
        return (0, int(m.group(1)), m.group(2), name)
    return (1, 10**6, "", name)


def paldex_row(name: str) -> str:
    p = pal(name)
    num = p.get("number") or "—"
    owned = name in ROSTER
    known = name in KNOWN_SET
    tags = []
    if name in TARGET_SET:
        tags.append('<span class="badge goal">Mål</span>')
    if name in P.SELF_ONLY:
        tags.append('<span class="badge selfonly">self-breed-only</span>')
    elif not known:
        tags.append('<span class="badge waitb">utenfor rekkevidde</span>')
    work = work_chips(name, 2)
    els = " ".join((p.get("elements") or []))
    return f'''<li class="prow" data-name="{esc(name)}" data-els="{esc(els)}" data-num="{esc(num)}">
<label class="own"><input type="checkbox"{' checked' if owned else ''} aria-label="Eier {esc(name)}"><span></span></label>
{icon_html(name, 36)}
<span class="pxname"><b>{esc(name)}</b><span class="pxnum">#{esc(num)}</span></span>
<span class="pxmeta">{el_chips(name)}{work}</span>
<span class="pxtags"><span class="bred-slot"></span>{"".join(tags)}</span>
</li>'''


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

KNOWN_SET = P.closure(ROSTER)
TARGET_SET = {t for t in TARGETS}


def appdata_json() -> str:
    steps = []
    for s in ORDERED:
        a, b = step_parents(s)
        steps.append({"sid": sid_of(a, b, s["child"]), "a": a, "b": b,
                      "c": s["child"], "wave": s["wave"]})
    goal_steps = {}
    for t in TARGETS:
        if t in DERIVS:
            ids = []
            for (a, b, c) in DERIVS[t]:
                oa, ob = IN_PROGRESS_OVERRIDES.get(c, (a, b))
                ids.append(sid_of(oa, ob, c))
            goal_steps[t] = sorted(ids)
    data = {
        "steps": steps,
        "roster": sorted(ROSTER),
        "goalSteps": goal_steps,
        "allPals": sorted(P.RANKS),
    }
    if EMBED:
        data["icons"] = {n: u for n in P.RANKS
                         if (u := icon_data_uri(n))}
    return json.dumps(data, ensure_ascii=False).replace("</", "<\\/")


def build() -> str:
    n_steps = len(ORDERED)
    n_targets = len([s for s in ORDERED if s["is_target"]])
    ties = [s for s in ORDERED if s["tie_break"]]

    # plan phases
    have = set(ROSTER)
    phases_html = []
    cur_wave, buf, done_children = 0, [], []
    for s in ORDERED + [None]:
        if s is None or s["wave"] != cur_wave:
            if buf:
                phases_html.append(
                    f'<details class="phase" id="fase-{cur_wave}" open>'
                    f'<summary><span class="ph">Fase {cur_wave}</span>'
                    f'<span class="pc phase-count" data-wave="{cur_wave}">{len(buf)} steg</span>'
                    f'<span class="phase-done-slot"></span></summary>'
                    f'<ol class="steps">{"".join(buf)}</ol></details>')
                for x in done_children:
                    have.add(x)
            if s is None:
                break
            cur_wave, buf, done_children = s["wave"], [], []
        buf.append(step_card(s, have))
        done_children.append(s["child"])

    hist = "".join(
        f'<li class="step done"><span class="hcheck">✓</span><div class="recipe">'
        f'<span class="parent">{icon_html(a, 30)}<span class="pn">{esc(a)}</span></span>'
        f'<span class="op">+</span>'
        f'<span class="parent">{icon_html(b, 30)}<span class="pn">{esc(b)}</span></span>'
        f'<span class="op">=</span><span class="child">{icon_html(c, 34)}'
        f'<span class="cn"><b>{esc(c)}</b></span></span></div></li>'
        for a, b, c in HISTORY)

    goals_html = []
    for title, sub, names in GOAL_GROUPS:
        cards = "".join(goal_card(n) for n in names)
        if title.startswith("Aura"):
            cards += "".join(goal_card(n, owned=True) for n in AURA_OWNED)
        goals_html.append(f'<h3>{esc(title)}</h3><p class="hint">{esc(sub)}</p>'
                          f'<div class="goals">{cards}</div>')

    keep_parents: dict[str, int] = {}
    for s in ORDERED:
        for p_ in step_parents(s):
            keep_parents[p_] = keep_parents.get(p_, 0) + 1
    keep_list = "".join(
        f'<li>{icon_html(p_, 28)} <b>{esc(p_)}</b> — {n} steg</li>'
        for p_, n in sorted(keep_parents.items(), key=lambda kv: -kv[1])
        if n >= 2 and p_ not in ROSTER)

    paldex = "".join(paldex_row(n) for n in sorted(P.RANKS, key=paldex_sort_key))

    verif_html = ""
    if VERIF:
        verif_html = f'''<h3>Bekreftet vs. usikkert</h3>
<p class="hint">Kryssjekket {len(VERIF["claims"])} påstander mot uavhengige kilder
({esc(VERIF.get("checked", ""))}).</p>
<div class="tablewrap"><table class="verif">
<thead><tr><th>Påstand</th><th>Status</th><th>Belegg</th></tr></thead>
<tbody>{verification_rows()}</tbody></table></div>'''

    extracted = json.loads((ROOT / "data" / "breeding_1_0.json").read_text())["extracted"]
    fonts = font_face_css()

    logo = '''<svg class="logo" viewBox="0 0 32 40" aria-hidden="true">
<path d="M16 2C9 2 3 14 3 24a13 13 0 0 0 26 0C29 14 23 2 16 2Z" fill="none" stroke="currentColor" stroke-width="2.6"/>
<path d="M10 22l4 4 3-6 3 5 2-3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>'''

    return f'''<title>Eggfabrikken</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>{fonts}{CSS}</style>
<script type="application/json" id="appdata">{appdata_json()}</script>
<header class="top">
  <a class="brand" href="#plan">{logo}<span class="wordmark">Eggfabrikken</span></a>
  <nav class="tabs" role="tablist" aria-label="Innhold">
    <button role="tab" data-tab="plan" aria-selected="true">Plan</button>
    <button role="tab" data-tab="paldex" aria-selected="false">Paldex</button>
    <button role="tab" data-tab="maal" aria-selected="false">Mål</button>
    <button role="tab" data-tab="drift" aria-selected="false">Drift</button>
    <button role="tab" data-tab="kilder" aria-selected="false">Kilder</button>
  </nav>
  <div class="topprog"><div class="prog"><span id="progfill"></span></div>
    <span id="progtxt">0 / {n_steps}</span></div>
</header>
<main>
<section id="tab-plan" class="tab" role="tabpanel">
  <div class="hero">
    <p class="eyebrow">Palworld 1.0 · kun breeding · Pål-Andre · lvl 44</p>
    <h1>Fra roster til toppals,<br>én kake om gangen</h1>
    <p class="lede">Korteste delte breeding-tre fra dine {len(ROSTER)} arter til de
    {n_targets} beste palsene som kan bres. Felles mellomledd telles én gang, og formelen
    bak hvert steg er verifisert mot spillfilenes fasit — alle 44 851 resultater, null avvik.</p>
    <div class="tiles">
      <div class="tile"><b>{n_steps}</b><span>breeding-steg</span></div>
      <div class="tile"><b>{n_targets}</b><span>endemål</span></div>
      <div class="tile"><b>{len(KNOWN_SET)}<i>/299</i></b><span>arter nåbare</span></div>
      <div class="tile"><b id="tile-ready">0</b><span>klare akkurat nå</span></div>
    </div>
  </div>
  <details class="histbox">
    <summary>Ryggraden så langt — 5 steg fullført ✓</summary>
    <ol class="steps hist">{hist}</ol>
  </details>
  <div class="rules">
    <p><b>Slik virker formelen:</b> 134 par har fast fasit, ett par er kjønnsavhengig
    (Katress/Wixen). Ellers blir barnet arten med CombiRank nærmest
    <code>⌊(rank<sub>A</sub> + rank<sub>B</sub> + 1) / 2⌋</code> blant de 183 artene i den
    generiske puljen — varianter og legendariske som kun finnes som oppskriftsbarn kan aldri
    dukke opp av formelen. Ved eksakt uavgjort vinner høyeste CombiRank. De {len(ties)}
    stegene som avhenger av tie-break er merket, med trygge alternativer.</p>
    <p><b>Kjønn:</b> hvert steg trenger ♂ av den ene forelderen og ♀ av den andre (hvilken
    er likegyldig — unntatt Katress/Wixen). Avkom er ~50/50, så mellomledd som gjenbrukes
    bør beholdes i begge kjønn. Kjønn kan byttes med Pal Reverser.</p>
    <p class="hint">Steg med grønn kant er <b>klare nå</b> — begge foreldrene finnes blant
    palsene du eier (Paldex-fanen) eller har bredd (avkryssede steg). Der kjønnet er
    <b>låst</b> (kun Katress/Wixen) viser kortet ♀/♂-merker på foreldrene og en hengelås —
    ellers er fordelingen valgfri, bare det er én hann og én hunn. Alt i samme fase kan
    kjøres parallelt med flere farmer.</p>
  </div>
  <div class="nextbox">
    <h3>Klar nå — legg i farmen</h3>
    <div id="next-list" class="nextlist"></div>
  </div>
  <h2>Planen <span class="pc">{n_steps} steg · 8 faser</span></h2>
  {"".join(phases_html)}
  <h2>Behold begge kjønn</h2>
  <p class="hint">Mellomledd som skal være forelder i to eller flere steg:</p>
  <ul class="keep">{keep_list}</ul>
</section>
<section id="tab-paldex" class="tab" role="tabpanel" hidden>
  <h2>Paldex <span class="pc" id="pdx-count"></span></h2>
  <p class="hint">Huk av palsene du eier — lagres i nettleseren og styrer hvilke steg i
  planen som lyser «klar nå». Avkryssede steg teller automatisk som «bredd».
  Bruk «Kopier roster» for å synce tilbake til <code>roster.txt</code>.</p>
  <div class="pdx-controls">
    <input type="search" id="pdx-search" placeholder="Søk pal …" aria-label="Søk i Paldex">
    <select id="pdx-filter" aria-label="Filter">
      <option value="all">Alle</option>
      <option value="owned">Eier</option>
      <option value="missing">Mangler</option>
      <option value="bred">Bredd i planen</option>
      <option value="goal">Mål</option>
      <option value="selfonly">Self-breed-only</option>
    </select>
    <button id="pdx-export" type="button">Kopier roster</button>
  </div>
  <ul class="paldex">{paldex}</ul>
</section>
<section id="tab-maal" class="tab" role="tabpanel" hidden>
  <h2>Målgalleriet</h2>
  <p class="hint">Dette er de beste artene som faktisk <b>kan bres</b> fra rosteret.
  De få som er naturlig sterkere per jobb (Aegidron Mining 8, Shaolong Watering 8,
  Dandilord Planting 8, Jetragon Gathering 8, Silvance Medicine 8, Bastigor Cooling 8) er
  alle self-breed-only eller alpha-fangst — utenfor rekkevidde med kun breeding.
  Fremdriftslinjen viser hvor mange av artens breeding-steg som er huket av.</p>
  {"".join(goals_html)}
</section>
<section id="tab-drift" class="tab" role="tabpanel" hidden>
  <h2>Drift av eggfabrikken</h2>
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
<section id="tab-kilder" class="tab" role="tabpanel" hidden>
  <h2>Kilder og verifisering</h2>
  {verif_html}
  <h3>Data og oppdatering</h3>
  <div class="rules">
  <p>Data: paldb.cc (CombiRank-tabell + unike kombinasjoner, hentet 2026-07-14) via
  1.0-datasettet <a href="https://github.com/beliarance/palworld-kb">beliarance/palworld-kb</a>,
  kryssvalidert mot <a href="https://github.com/tylercamp/palcalc">palcalc</a> (alle 44 851
  forhåndsberegnede 1.0-resultater, generert fra spillfilene — null avvik) og spillets råtabell
  DT_PalCombiUnique (<a href="https://github.com/Awy64/palworld-atlas-data">palworld-atlas-data</a>).
  Artsformelen er i tillegg testet mot 31 håndplukkede kjente par.</p>
  <p>Ny pal i boksen? <code>python3 planner.py add &lt;navn&gt;</code> og
  <code>python3 build_guide.py</code> → siden regenereres med oppdatert plan.
  Uidentifisert fra gamle lista: «godbin» — mente du Gobfin Ignis? Legg riktig navn i
  <code>roster.txt</code>.</p>
  <p class="foot">Ikoner: game-dump via dbgoodm/PalDex · Typografi: Baloo 2 + Manrope (OFL) ·
  Generert {esc(extracted)} · Palworld 1.0 · nivåtak 80.</p>
  </div>
</section>
</main>
<footer class="pagefoot">
  <span>{logo}</span>
  <span><b>Eggfabrikken</b> · breeding operations for Pål-Andre · data verifisert mot
  spillfilene · 2026-08-14</span>
</footer>
<script>{JS}</script>'''


CSS = r'''
:root{
  --bg:#EDF2F3; --surface:#FFFFFF; --surface2:#E2EAEB; --ink:#182528;
  --muted:#54696E; --line:#C9D6D8; --accent:#17777E; --accent-ink:#0F5A60;
  --accent-soft:#D6E8E9;
  --ok:#2E7D46; --ok-bg:#DDEEE2; --warn:#8A5A0B; --warn-bg:#F5E7C8;
  --bad:#A33B2E; --bad-bg:#F4DCD7; --gold:#B98718; --gold-bg:#F6ECD2;
  --male:#2A6FB0; --female:#C2497D;
  --shadow:0 1px 2px rgba(24,37,40,.05),0 4px 14px rgba(24,37,40,.06);
  --el-neutral:#5F6B70;--el-neutral-bg:#E4E8EA; --el-fire:#B23B24;--el-fire-bg:#F6DDD6;
  --el-water:#20618F;--el-water-bg:#D9E7F2; --el-grass:#3D7A31;--el-grass-bg:#DFEDD9;
  --el-electric:#8A6D0B;--el-electric-bg:#F5ECC8; --el-ice:#1F7186;--el-ice-bg:#D7EDF2;
  --el-ground:#7A5426;--el-ground-bg:#EFE3D2; --el-dark:#5A4380;--el-dark-bg:#E6DFF1;
  --el-dragon:#4A54A8;--el-dragon-bg:#DEE1F4;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --bg:#0F1B1D; --surface:#16252A; --surface2:#1D3036; --ink:#E3EDEE;
    --muted:#94A9AC; --line:#2C4147; --accent:#4FB3BA; --accent-ink:#7BCDD2;
    --accent-soft:#173A3E;
    --ok:#7FC795; --ok-bg:#1C3A28; --warn:#E4B564; --warn-bg:#3C2F13;
    --bad:#E59180; --bad-bg:#42201A; --gold:#E2BC5F; --gold-bg:#3A2F12;
    --male:#5E9FD8; --female:#E07CAC;
    --shadow:none;
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
  --accent-soft:#173A3E;
  --ok:#7FC795; --ok-bg:#1C3A28; --warn:#E4B564; --warn-bg:#3C2F13;
  --bad:#E59180; --bad-bg:#42201A; --gold:#E2BC5F; --gold-bg:#3A2F12;
  --male:#5E9FD8; --female:#E07CAC;
  --shadow:none;
  --el-neutral:#AEB9BD;--el-neutral-bg:#28353A; --el-fire:#EE9A82;--el-fire-bg:#402019;
  --el-water:#8FC1E8;--el-water-bg:#1B3348; --el-grass:#9CCB8B;--el-grass-bg:#22371D;
  --el-electric:#E7CB6A;--el-electric-bg:#3B3112; --el-ice:#88CFE2;--el-ice-bg:#153742;
  --el-ground:#D3A96F;--el-ground-bg:#3A2C18; --el-dark:#C0A9E8;--el-dark-bg:#2E2342;
  --el-dragon:#A6B0F0;--el-dragon-bg:#232A52;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
  font:15.5px/1.55 "Manrope",system-ui,"Segoe UI",sans-serif;
  font-variant-numeric:tabular-nums}
h1,h2,h3,h4,.wordmark,.tabs button,.ph{font-family:"Baloo 2","Manrope",system-ui,sans-serif}
h1,h2,h3,h4{text-wrap:balance;line-height:1.12;margin:0}
code{font:.88em ui-monospace,"Cascadia Mono",Menlo,Consolas,monospace;
  background:var(--surface2);padding:1px 5px;border-radius:4px}
a{color:var(--accent-ink)}
main{max-width:1100px;margin:0 auto;padding:0 20px 40px}
/* ---- top bar ---- */
.top{position:sticky;top:0;z-index:10;display:flex;align-items:center;gap:18px;
  background:var(--surface);border-bottom:1px solid var(--line);
  padding:0 max(20px,calc((100vw - 1100px)/2 + 20px));height:58px}
.brand{display:flex;align-items:center;gap:9px;color:var(--accent-ink);
  text-decoration:none}
.logo{width:22px;height:28px}
.wordmark{font-weight:800;font-size:20px;letter-spacing:.01em}
.tabs{display:flex;gap:2px;height:100%}
.tabs button{appearance:none;background:none;border:none;border-bottom:3px solid transparent;
  border-top:3px solid transparent;padding:0 14px;font-size:15.5px;font-weight:600;
  color:var(--muted);cursor:pointer;height:100%}
.tabs button:hover{color:var(--ink)}
.tabs button[aria-selected="true"]{color:var(--accent-ink);
  border-bottom-color:var(--accent)}
.tabs button:focus-visible{outline:2px solid var(--accent);outline-offset:-2px;border-radius:6px}
.topprog{margin-left:auto;display:flex;align-items:center;gap:9px;font-size:13px;
  color:var(--muted);min-width:150px;justify-content:flex-end}
.prog{width:86px;height:7px;border-radius:4px;background:var(--surface2);overflow:hidden}
.prog span{display:block;height:100%;width:0;background:var(--accent);transition:width .25s}
/* ---- hero ---- */
.hero{padding:40px 0 8px;background:radial-gradient(640px 240px at 12% -10%,
  var(--accent-soft),transparent 72%)}
.eyebrow{text-transform:uppercase;letter-spacing:.14em;font-size:11.5px;
  font-weight:700;color:var(--muted);margin:0 0 6px}
.hero h1{font-size:clamp(32px,4.6vw,46px);font-weight:800;color:var(--accent-ink)}
.lede{max-width:62ch;color:var(--muted);margin:10px 0 18px}
.tiles{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:8px}
.tile{background:var(--surface);border:1px solid var(--line);border-radius:12px;
  padding:12px 18px;min-width:126px;box-shadow:var(--shadow)}
.tile b{display:block;font-size:27px;font-family:"Baloo 2",sans-serif;line-height:1.1;
  color:var(--accent-ink)}
.tile b i{font-style:normal;font-size:15px;color:var(--muted)}
.tile span{font-size:11.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;font-weight:600}
/* ---- sections ---- */
.tab>h2{font-size:26px;margin:30px 0 8px}
h2 .pc{font-size:14px;color:var(--muted);font-family:"Manrope",sans-serif;font-weight:600;margin-left:8px}
h3{font-size:19px;margin:22px 0 6px}
.rules{background:var(--surface);border:1px solid var(--line);border-radius:14px;
  padding:8px 20px;margin:16px 0;box-shadow:var(--shadow)}
.rules p{max-width:78ch}
.hint{color:var(--muted);font-size:14px;max-width:78ch;margin:6px 0 12px}
.histbox{margin:18px 0}
.histbox summary{cursor:pointer;font-weight:700;color:var(--ok);padding:8px 0}
.histbox summary:focus-visible{outline:2px solid var(--accent);border-radius:4px}
/* ---- steps ---- */
.phase{margin:20px 0}
.phase>summary{display:flex;align-items:baseline;gap:12px;margin:0 0 8px;cursor:pointer;
  list-style:none}
.phase>summary::-webkit-details-marker{display:none}
.phase>summary::before{content:"";width:0;height:0;border-left:6px solid var(--muted);
  border-top:5px solid transparent;border-bottom:5px solid transparent;
  transition:transform .15s;align-self:center}
.phase[open]>summary::before{transform:rotate(90deg)}
.phase>summary:focus-visible{outline:2px solid var(--accent);border-radius:6px}
.phase-done-slot .badge{margin-left:2px}
.ph{color:var(--accent-ink);font-size:20px;font-weight:700}
.pc{color:var(--muted);font-size:13px;font-weight:500}
ol.steps{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.step{display:grid;grid-template-columns:auto 1fr auto;gap:6px 14px;align-items:center;
  background:var(--surface);border:1px solid var(--line);border-left:4px solid var(--line);
  border-radius:12px;padding:10px 14px;box-shadow:var(--shadow);transition:border-color .15s}
.step.target{border-left-color:var(--gold)}
.step.ready{border-left-color:var(--ok)}
.step.checked{opacity:.55;border-left-color:var(--line)}
.step.checked .recipe{text-decoration:line-through;text-decoration-color:var(--muted);
  text-decoration-thickness:1px}
.step .note{grid-column:1/-1;margin:2px 0 0;font-size:13px;border-radius:8px;padding:7px 10px}
.warn-note{background:var(--warn-bg);color:var(--warn)}
.alt-note{background:var(--surface2);color:var(--muted)}
.tick input{position:absolute;opacity:0;width:26px;height:26px;cursor:pointer}
.tick span{display:inline-block;width:24px;height:24px;border:2px solid var(--line);
  border-radius:8px;background:var(--surface2);position:relative;cursor:pointer;transition:all .15s}
.tick input:checked+span{background:var(--ok);border-color:var(--ok)}
.tick input:checked+span::after{content:"✓";position:absolute;inset:0;display:grid;
  place-items:center;color:#fff;font-size:15px;font-weight:700}
.tick input:focus-visible+span{outline:2px solid var(--accent);outline-offset:2px}
.recipe{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.parent,.child{display:flex;align-items:center;gap:8px}
.child{flex:1 1 300px;min-width:260px}
.pn{font-size:14px;font-weight:700}
.op{color:var(--muted);font-weight:800}
.cn{display:flex;flex-direction:column;gap:3px}
.cn b{font-size:16px}
.meta,.meta2{display:flex;gap:5px;flex-wrap:wrap;align-items:center}
.meta2{font-size:12.5px;color:var(--muted)}
.egg{white-space:nowrap}
.side{display:flex;flex-direction:column;align-items:flex-end;gap:5px;font-size:12.5px}
.needs{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end;max-width:330px}
.nlbl{color:var(--muted);text-transform:uppercase;font-size:10px;letter-spacing:.07em;
  font-weight:700;align-self:center}
.waitnote{color:var(--muted);font-size:12px;text-align:right}
/* ---- chips & badges ---- */
.chip{display:inline-block;border-radius:20px;padding:1px 9px;font-size:12px;font-weight:600;
  background:var(--surface2);color:var(--muted)}
.chip.work{color:var(--ink)}
.chip.work b{color:var(--accent-ink)}
.chip.need{background:var(--gold-bg);color:var(--gold)}
.badge{display:inline-block;border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700;
  text-transform:uppercase;letter-spacing:.05em}
.badge.unique{background:var(--el-dragon-bg);color:var(--el-dragon)}
.badge.warn,.badge.v-warn{background:var(--warn-bg);color:var(--warn)}
.badge.now,.badge.ready-b{background:var(--ok-bg);color:var(--ok)}
.badge.goal{background:var(--gold-bg);color:var(--gold)}
.badge.keep{background:var(--el-water-bg);color:var(--el-water);text-transform:none}
.badge.own,.badge.v-ok,.badge.bredb{background:var(--ok-bg);color:var(--ok)}
.badge.v-bad{background:var(--bad-bg);color:var(--bad)}
.badge.selfonly{background:var(--bad-bg);color:var(--bad);text-transform:none}
.badge.waitb{background:var(--surface2);color:var(--muted);text-transform:none}
/* ---- pal icons ---- */
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
/* ---- gender pins & lock ---- */
.gwrap{position:relative;display:inline-flex}
.gpin{position:absolute;right:-5px;bottom:-3px;width:17px;height:17px;border-radius:50%;
  display:grid;place-items:center;font-style:normal;font-size:10.5px;font-weight:800;
  color:#fff;border:2px solid var(--surface);line-height:1;cursor:default}
.gpin.f{background:var(--female)}
.gpin.m{background:var(--male)}
.badge.lock{background:var(--warn-bg);color:var(--warn);display:inline-flex;
  align-items:center;gap:4px;text-transform:none}
.badge.lock svg{width:9px;height:11px;fill:currentColor;flex:none}
/* ---- next actions ---- */
.nextbox{background:var(--accent-soft);border:1px solid var(--line);border-radius:14px;
  padding:12px 20px 16px;margin:16px 0}
.nextbox h3{margin:4px 0 10px;color:var(--accent-ink)}
.nextlist{display:flex;flex-wrap:wrap;gap:8px}
.nextchip{appearance:none;border:1px solid var(--line);background:var(--surface);
  border-radius:20px;padding:6px 14px;font:inherit;font-size:13.5px;font-weight:600;
  color:var(--ink);cursor:pointer;transition:border-color .12s,color .12s}
.nextchip b{color:var(--accent-ink)}
.nextchip:hover{border-color:var(--accent);color:var(--accent-ink)}
.nextchip:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.nextmore{align-self:center;color:var(--muted);font-size:13px}
.step.flash{outline:2px solid var(--accent);outline-offset:2px}
/* ---- history & keep ---- */
.hist .step{grid-template-columns:auto 1fr;padding:6px 14px;border-left-width:1px}
.hcheck{color:var(--ok);font-weight:800;font-size:17px}
.keep{list-style:none;padding:0;display:flex;flex-wrap:wrap;gap:10px}
.keep li{display:flex;align-items:center;gap:8px;background:var(--surface);
  border:1px solid var(--line);border-radius:24px;padding:5px 14px 5px 6px;font-size:14px}
/* ---- goals ---- */
.goals{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;margin:12px 0 26px}
.goal{background:var(--surface);border:1px solid var(--line);border-radius:14px;
  padding:14px 16px;box-shadow:var(--shadow)}
.goal header{display:flex;gap:12px;align-items:center;margin-bottom:8px}
.goal h4{font-size:18px}
.goal .meta{margin:4px 0}
.goal.gdone{outline:2px solid var(--ok);outline-offset:-1px}
.pskill{font-size:13px;color:var(--muted);margin:8px 0 0}
.aura{font-size:13px;color:var(--gold);font-weight:700;margin:8px 0 0}
.gprog{display:flex;align-items:center;gap:8px;margin-top:10px}
.gbar{flex:1;height:7px;border-radius:4px;background:var(--surface2);overflow:hidden}
.gbar span{display:block;height:100%;width:0;background:var(--accent);transition:width .25s}
.gtxt{font-size:12px;color:var(--muted);white-space:nowrap}
.stats{display:flex;flex-direction:column;gap:4px;margin-top:10px}
.stat{display:grid;grid-template-columns:34px 1fr 34px;gap:8px;align-items:center;font-size:12px}
.sl{color:var(--muted);font-weight:700;letter-spacing:.05em}
.sb{height:8px;border-radius:4px;background:var(--surface2);overflow:hidden}
.sb span{display:block;height:100%;border-radius:4px 3px 3px 4px;background:var(--accent)}
.sv{text-align:right;color:var(--ink)}
/* ---- paldex ---- */
.pdx-controls{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0 14px;position:sticky;
  top:58px;z-index:5;background:var(--bg);padding:8px 0}
#pdx-search{flex:1 1 220px;max-width:340px;padding:8px 12px;border-radius:9px;
  border:1px solid var(--line);background:var(--surface);color:var(--ink);font:inherit}
#pdx-search:focus-visible,#pdx-filter:focus-visible{outline:2px solid var(--accent)}
#pdx-filter{padding:8px 10px;border-radius:9px;border:1px solid var(--line);
  background:var(--surface);color:var(--ink);font:inherit}
#pdx-export{padding:8px 14px;border-radius:9px;border:1px solid var(--accent);
  background:var(--accent);color:#fff;font:inherit;font-weight:700;cursor:pointer}
#pdx-export:hover{filter:brightness(1.08)}
#pdx-export:focus-visible{outline:2px solid var(--accent-ink);outline-offset:2px}
:root[data-theme="dark"] #pdx-export{color:#0F1B1D}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) #pdx-export{color:#0F1B1D}}
.paldex{list-style:none;margin:0;padding:0;display:grid;
  grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:8px}
.prow{display:flex;align-items:center;gap:9px;background:var(--surface);
  border:1px solid var(--line);border-radius:10px;padding:6px 10px;min-width:0}
.prow.off{opacity:.62}
.pxname{display:flex;flex-direction:column;min-width:86px}
.pxname b{font-size:13.5px;line-height:1.2}
.pxnum{font-size:11px;color:var(--muted)}
.pxmeta{display:flex;gap:4px;flex-wrap:wrap;flex:1;min-width:0}
.pxmeta .chip{font-size:10.5px;padding:0 7px}
.pxtags{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}
.pxtags .badge{font-size:9.5px;padding:1px 6px}
.own input{position:absolute;opacity:0;width:34px;height:20px;cursor:pointer}
.own span{display:inline-block;width:34px;height:20px;border-radius:11px;
  background:var(--surface2);border:1.5px solid var(--line);position:relative;
  cursor:pointer;transition:background .15s;flex:none}
.own span::after{content:"";position:absolute;top:1.5px;left:2px;width:14px;height:14px;
  border-radius:50%;background:var(--muted);transition:transform .15s,background .15s}
.own input:checked+span{background:var(--ok);border-color:var(--ok)}
.own input:checked+span::after{transform:translateX(14px);background:#fff}
.own input:focus-visible+span{outline:2px solid var(--accent);outline-offset:2px}
/* ---- tables ---- */
.tablewrap{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:14px;margin:10px 0}
th{text-align:left;color:var(--muted);text-transform:uppercase;font-size:11px;
  letter-spacing:.07em;border-bottom:2px solid var(--line);padding:6px 10px}
td{border-bottom:1px solid var(--line);padding:8px 10px;vertical-align:top}
tr.now td{background:var(--ok-bg)}
.verif td:first-child{max-width:340px}
/* ---- footer ---- */
.pagefoot{max-width:1100px;margin:0 auto;padding:18px 20px 36px;display:flex;gap:10px;
  align-items:center;color:var(--muted);font-size:13px;border-top:1px solid var(--line)}
.pagefoot .logo{width:15px;height:19px;vertical-align:-3px}
.foot{color:var(--muted);font-size:13px}
@media (max-width:840px){
  .top{flex-wrap:wrap;height:auto;padding-top:8px;padding-bottom:0;gap:6px}
  .tabs{order:3;width:100%;overflow-x:auto}
  .tabs button{padding:8px 12px}
  .topprog{min-width:0}
  .step{grid-template-columns:auto 1fr}
  .side{grid-column:2;align-items:flex-start}
  .needs{justify-content:flex-start}
}
@media (prefers-reduced-motion: reduce){*{transition:none !important}}
@media print{
  .top,.pdx-controls,.pagefoot{display:none}
  .tab[hidden]{display:block !important}
  .step{break-inside:avoid;box-shadow:none}
  body{background:#fff;color:#000}
}
'''

JS = r'''
(function(){
  var DATA = JSON.parse(document.getElementById('appdata').textContent);
  if(DATA.icons){
    [].slice.call(document.querySelectorAll('img[data-pal]')).forEach(function(img){
      var u = DATA.icons[img.dataset.pal];
      if(u) img.src = u;
      else img.parentNode.classList.add('noimg');
    });
  }
  var KEY = 'eggfabrikken-v2';
  var state = null;
  try{ state = JSON.parse(localStorage.getItem(KEY) || 'null'); }catch(e){}
  if(!state){
    state = {steps:{}, owned:{}};
    try{ // migrate v1 (steps only)
      var v1 = JSON.parse(localStorage.getItem('eggfabrikken-v1') || 'null');
      if(v1) state.steps = v1;
    }catch(e){}
  }
  function save(){ try{ localStorage.setItem(KEY, JSON.stringify(state)); }catch(e){} }

  var ROSTER = {};
  DATA.roster.forEach(function(n){ ROSTER[n] = true; });

  function isOwned(n){
    if(Object.prototype.hasOwnProperty.call(state.owned, n)) return !!state.owned[n];
    return !!ROSTER[n];
  }
  function bredSet(){
    var s = {};
    DATA.steps.forEach(function(st){ if(state.steps[st.sid]) s[st.c] = true; });
    return s;
  }

  /* ---------- tabs ---------- */
  var tabs = [].slice.call(document.querySelectorAll('.tabs button'));
  var panels = {};
  tabs.forEach(function(b){ panels[b.dataset.tab] = document.getElementById('tab-' + b.dataset.tab); });
  function showTab(name, push){
    if(!panels[name]) name = 'plan';
    tabs.forEach(function(b){
      var on = b.dataset.tab === name;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      panels[b.dataset.tab].hidden = !on;
    });
    if(push !== false){ try{ history.replaceState(null, '', '#' + name); }catch(e){} }
  }
  tabs.forEach(function(b){ b.addEventListener('click', function(){ showTab(b.dataset.tab); }); });
  document.querySelector('.brand').addEventListener('click', function(e){
    e.preventDefault(); showTab('plan');
  });
  showTab((location.hash || '#plan').slice(1), false);

  /* ---------- steps ---------- */
  var stepEls = [].slice.call(document.querySelectorAll('.step[data-sid]'));
  var fill = document.getElementById('progfill');
  var ptxt = document.getElementById('progtxt');
  var tileReady = document.getElementById('tile-ready');

  stepEls.forEach(function(li){
    var cb = li.querySelector('input[type=checkbox]');
    if(state.steps[li.dataset.sid]){ cb.checked = true; li.classList.add('checked'); }
    cb.addEventListener('change', function(){
      if(cb.checked) state.steps[li.dataset.sid] = true;
      else delete state.steps[li.dataset.sid];
      li.classList.toggle('checked', cb.checked);
      save(); refresh();
    });
  });

  function refresh(){
    var bred = bredSet();
    function have(n){ return isOwned(n) || bred[n]; }
    var done = 0, ready = 0;
    stepEls.forEach(function(li){
      var checked = li.classList.contains('checked');
      if(checked) done++;
      var ok = have(li.dataset.a) && have(li.dataset.b);
      li.classList.toggle('ready', ok && !checked);
      if(ok && !checked) ready++;
      var slot = li.querySelector('.ready-slot');
      if(slot){
        if(checked){ slot.innerHTML = ''; }
        else if(ok){ slot.innerHTML = '<span class="badge ready-b">klar nå</span>'; }
        else {
          var miss = [];
          if(!have(li.dataset.a)) miss.push(li.dataset.a);
          if(!have(li.dataset.b)) miss.push(li.dataset.b);
          slot.innerHTML = '<span class="waitnote">venter på ' + miss.join(' + ') + '</span>';
        }
      }
    });
    if(fill) fill.style.width = (stepEls.length ? 100*done/stepEls.length : 0) + '%';
    if(ptxt) ptxt.textContent = done + ' / ' + stepEls.length;
    if(tileReady) tileReady.textContent = ready;

    // phase counts + done badges
    [].slice.call(document.querySelectorAll('.phase')).forEach(function(ph){
      var els = [].slice.call(ph.querySelectorAll('.step[data-sid]'));
      var d = els.filter(function(e){ return e.classList.contains('checked'); }).length;
      var c = ph.querySelector('.phase-count');
      if(c) c.textContent = d + ' av ' + els.length + ' steg';
      var slot = ph.querySelector('.phase-done-slot');
      if(slot) slot.innerHTML = (d === els.length && els.length)
        ? '<span class="badge ready-b">ferdig ✓</span>' : '';
    });

    // "klar nå" quick actions
    var nl = document.getElementById('next-list');
    if(nl){
      nl.innerHTML = '';
      var readyEls = stepEls.filter(function(li){ return li.classList.contains('ready'); });
      readyEls.slice(0, 6).forEach(function(li){
        var btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'nextchip';
        btn.innerHTML = li.dataset.a + ' + ' + li.dataset.b +
          ' → <b>' + li.dataset.c + '</b>';
        btn.addEventListener('click', function(){
          var det = li.closest('details'); if(det) det.open = true;
          var smooth = !(window.matchMedia &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches);
          li.scrollIntoView({behavior: smooth ? 'smooth' : 'auto', block: 'center'});
          li.classList.add('flash');
          setTimeout(function(){ li.classList.remove('flash'); }, 1600);
        });
        nl.appendChild(btn);
      });
      if(readyEls.length > 6){
        var more = document.createElement('span');
        more.className = 'nextmore';
        more.textContent = '+ ' + (readyEls.length - 6) + ' til lenger ned';
        nl.appendChild(more);
      }
      if(!readyEls.length){
        nl.innerHTML = '<span class="hint">Ingen steg er klare akkurat nå — huk av det du ' +
          'eier i Paldex-fanen, eller fullfør steg som andre venter på.</span>';
      }
    }

    // goal progress
    [].slice.call(document.querySelectorAll('.goal[data-goal]')).forEach(function(g){
      var ids = DATA.goalSteps[g.dataset.goal];
      if(!ids) return;
      var el = g.querySelector('.gprog'); if(!el) return;
      var d = ids.filter(function(id){ return state.steps[id]; }).length;
      el.querySelector('.gbar span').style.width = (ids.length ? 100*d/ids.length : 0) + '%';
      el.querySelector('.gtxt').textContent = d + ' av ' + ids.length + ' steg';
      g.classList.toggle('gdone', d === ids.length);
    });

    // paldex badges + counts
    var owned = 0;
    prowEls.forEach(function(r){
      var n = r.dataset.name;
      var o = isOwned(n);
      if(o) owned++;
      r.classList.toggle('off', !o && !bred[n]);
      var slot = r.querySelector('.bred-slot');
      if(slot) slot.innerHTML = bred[n] ? '<span class="badge bredb">bredd ✓</span>' : '';
      var cb = r.querySelector('.own input');
      if(cb.checked !== o) cb.checked = o;
    });
    var pc = document.getElementById('pdx-count');
    if(pc) pc.textContent = 'eier ' + owned + ' av ' + prowEls.length + ' arter';
  }

  /* ---------- paldex ---------- */
  var prowEls = [].slice.call(document.querySelectorAll('.prow'));
  prowEls.forEach(function(r){
    var cb = r.querySelector('.own input');
    cb.addEventListener('change', function(){
      var n = r.dataset.name;
      if(cb.checked === !!ROSTER[n]) delete state.owned[n];
      else state.owned[n] = cb.checked;
      save(); refresh();
    });
  });

  var search = document.getElementById('pdx-search');
  var filter = document.getElementById('pdx-filter');
  function applyFilter(){
    var q = (search.value || '').toLowerCase();
    var f = filter.value;
    var bred = bredSet();
    prowEls.forEach(function(r){
      var n = r.dataset.name;
      var show = n.toLowerCase().indexOf(q) !== -1;
      if(show){
        if(f === 'owned') show = isOwned(n);
        else if(f === 'missing') show = !isOwned(n) && !bred[n];
        else if(f === 'bred') show = !!bred[n];
        else if(f === 'goal') show = !!r.querySelector('.badge.goal');
        else if(f === 'selfonly') show = !!r.querySelector('.badge.selfonly');
      }
      r.hidden = !show;
    });
  }
  if(search) search.addEventListener('input', applyFilter);
  if(filter) filter.addEventListener('change', applyFilter);

  var exp = document.getElementById('pdx-export');
  if(exp) exp.addEventListener('click', function(){
    var lines = DATA.allPals.filter(isOwned);
    var bred = bredSet();
    DATA.allPals.forEach(function(n){
      if(bred[n] && lines.indexOf(n) === -1) lines.push(n);
    });
    var txt = lines.sort().join('\n') + '\n';
    function done(ok){
      exp.textContent = ok ? 'Kopiert ✓' : 'Kunne ikke kopiere';
      setTimeout(function(){ exp.textContent = 'Kopier roster'; }, 1800);
    }
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(txt).then(function(){ done(true); },
        function(){ done(false); });
    } else { done(false); }
  });

  refresh();
  applyFilter();
})();
'''


if __name__ == "__main__":
    out = OUT_EMBED if EMBED else OUT
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(build())
    print(f"wrote {out} ({out.stat().st_size/1024:.0f} KB)")
