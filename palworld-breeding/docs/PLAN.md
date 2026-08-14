<title>HatchLab Master Plan</title>

# HatchLab — Master Plan

*Working title — final name is Pål-Andre's call. Candidates: HatchLab, EggWorks, BreedPath, Palcubator.*

**Mission:** build the best Palworld breeding app on the web — provably correct, genuinely useful, beautiful — then expand into the definitive Palworld companion (map, spawns, and more).

Version 1 focuses on breeding only. Everything else is v2+.

---

## 1. Why we will win — competitive analysis

What exists today (August 2026, all checked during research):

| Competitor | What it is | Weakness we exploit |
|---|---|---|
| **palcalc** (tylercamp) | Desktop C# app, save-file import, powerful solver | Windows-only, technical, no web presence. *Its dataset is our oracle — we match its correctness on the web.* |
| **palsbreeding.com, palworldpals.com, palbreeder.com** | Web calculators | Single-pair lookups only; SEO content farms; some still use the wrong pre-1.0 tie-break; ads everywhere |
| **palmods.gg, palsphere.app** | Calculator + guides | Solid pair math, but no route planning, no box awareness, no offline |
| **paldb.cc** | Database | Reference tables, not a planner |

**Nobody on the web does:** multi-target route planning (shortest shared breeding tree), box-aware "ready now" states, or provable correctness. We already have all three working.

**Our five unique selling points:**
1. **Provably correct** — every result replayed against 44,851 precomputed outcomes generated from the game files. Zero mismatches, publicly documented. A "verified against game data" badge with receipts.
2. **Route planner, not just a calculator** — "I want Anubis, Astegon and all aura pals" → one optimal shared breeding tree from *your* box, phased, with parallel tracks.
3. **Box-aware** — the app knows what you own; every step shows *ready now* or *waiting for X*.
4. **Offline-first PWA** — installable, works with zero network, no ads, no tracking.
5. **Honest data** — provenance and confidence level on every claim; gender-locked pairs and tie-break steps explicitly flagged.

---

## 2. Product spec — v1 (Breeding)

Six modules, one shared state (your box):

### 2.1 Calculator
- **Pair → child**: pick two parents, see the child instantly, with the math shown (ranks, target, margin, tie-break, unique-recipe override, gender lock).
- **Child → parents**: pick a target species, see *every* parent pair that produces it — sorted by "cheapest given your box" (owned pairs first, then 1-step-away, then all), with wild-catch info as fallback.
- Every result carries flags: unique recipe / gender locked (♀♂ pins) / tie-break / margin.

### 2.2 Route Planner (the killer feature)
- Select any set of target species → shortest shared breeding tree from your box.
- Phased dependency view (what can run in parallel), keep-both-genders warnings, per-target progress, "ready now" quick actions.
- Egg type + incubation hints per step; total step/cake estimates.
- Presets: "Best workers", "All aura pals", "Breeding support", custom.

### 2.3 My Box
- Ownership toggles for all 299 species (search, filters, bulk actions).
- Import/export: plain text list, JSON backup. (Save-file import is v2 — see §9.)
- Everything persists locally; one click wipes it (privacy: no accounts, no server).

### 2.4 Paldex
- A page per species: icons, stats, work suitabilities, partner skill, egg type, all breeding recipes it appears in (as parent and child), CombiRank neighborhood ("what does it average with?").
- Deep links (`/pal/anubis`) for sharing.

### 2.5 Odds Lab
- Passive inheritance calculator (parents' passives → probability of desired set; Special Cake effect).
- IV inheritance (30/30/40 model) — expected outcomes, probability of triple-100.
- Mutation planner: expected eggs per mutation by cake tier; cost in cake ingredients.
- Egg/cake economics: how many Wheat Plantations/Mozzarina/Chikipi/Beegarde per always-on farm.

### 2.6 Reference
- Breeding mechanics explained (the formula, pool, tie-break, gender lock) with the verification table (claims + status + sources).
- Condenser, cakes, surgery table, mutation — the current guide's Operations content, generalized.

**Non-goals for v1:** map/spawn layers, combat tier lists, account sync, mobile native apps.

---

## 3. Architecture

**Static site, no backend.** Nothing here needs a server; static means free hosting, perfect caching, zero downtime, full offline.

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript** (strict) | The engine is real logic; types prevent the bugs that plague other calculators |
| Build | **Vite** | Fast, standard, static output |
| UI | **Preact + signals** | React ergonomics at 4 KB; fine-grained reactivity fits box-state → ready-state propagation |
| Routing | File-based SPA routes (`/calc`, `/plan`, `/box`, `/pal/:id`, `/odds`, `/reference`) | Deep-linkable, shareable |
| State | localStorage (box, checks, settings) via a versioned store with migrations | Privacy + offline; schema version key from day one |
| Compute | Engine in a **Web Worker** | Route planning is ~2s of CPU; never block the UI |
| PWA | Service worker, precached data + icons | Installable, offline-first |
| i18n | String catalog, `en` base | `nb` later — we already have the Norwegian copy |
| Hosting | **GitHub Pages** | Already in Pål-Andre's stack; custom domain optional later |

**Engine port:** the Python planner (formula, closure, cheapest-derivation fixpoint) ports 1:1 to TypeScript. The Python stays as the data pipeline + reference implementation; the TS engine must pass the same oracle replay in CI before any release.

**Repo layout** (everything stays in the `palworld-breeding/` folder; the app is `palworld-breeding/app/`, splittable into its own repo when it goes public):

```
palworld-breeding/
  app/                  # the product (Vite + TS + Preact)
    src/engine/         # formula, closure, route planner (worker)
    src/modules/        # calc, plan, box, paldex, odds, reference
    src/design/         # tokens, components
    public/data/        # versioned JSON from the pipeline
    tests/              # vitest: unit + oracle replay
  pipeline/             # Python: extract, validate, oracle refresh (exists as tools/)
  data/                 # canonical versioned datasets (exists)
  guide/                # the personal guide (kept; becomes a Planner preset)
  docs/PLAN.md          # this plan
```

---

## 4. Data pipeline

Already built, kept in Python:

1. **Sources:** paldb-derived kb dataset (ranks, recipes, stats, icons) + palcalc db/breeding.json (oracle) + palworld-atlas-data (raw DT_PalCombiUnique) + verified claims file.
2. **Per-patch runbook:** refresh clones → `extract_from_kb.py` → `validate_against_palcalc.py` → full test suite → if the oracle disagrees, the *data* changed: regenerate, bump `game_build`, changelog entry.
3. **Outputs:** `pals.json` (species, stats, work, partner skills, eggs, spawn summary), `breeding.json` (ranks, 134 unique + 2 gendered combos, exclusions), `oracle_pairs.json.gz` (test fixture only, not shipped to clients), `icon_map.json` + 298 game-dump icons, `verification.json`.
4. Every file carries `game_version`, `game_build`, `extracted` date, and source list.

---

## 5. Design system

- **Brand:** egg logomark + wordmark (exists); name final call with Pål-Andre before public launch.
- **Type:** Baloo 2 (display) + Manrope (UI/body), subset woff2, self-hosted (~34 KB total).
- **Tokens:** the current light/dark palette (lagoon teal accent, gold for goals, semantic ok/warn/bad, 9 element colors, ♀/♂ pair) — extracted into `design/tokens.css` as the single source.
- **Components:** step card, pal chip, gender pin, stat bar, progress ring, toggle, tab bar, search/filter bar — documented in one gallery page.
- **Rules:** mobile-first; WCAG AA contrast in both themes; visible focus states; `prefers-reduced-motion` respected; gender info never color-only (♀/♂ glyphs + labels).

---

## 6. Correctness & QA — how we keep 10/10 honest

| Gate | Tool | Bar |
|---|---|---|
| Engine correctness | Vitest oracle replay (all 44,851 rows) | 0 mismatches, runs in CI on every commit |
| Edge cases | Unit tests: tie-break, gendered pair, self-only, excluded pool, order-insensitivity | All green |
| UI flows | Playwright: calc lookup, plan check-off → ready-state cascade, box toggle → plan update, export/import | All green, light + dark |
| Performance | Lighthouse budgets | Perf ≥ 90, A11y ≥ 95, first load ≤ 200 KB JS (icons lazy) |
| Data freshness | Pipeline runbook per game patch | Oracle replay green against new build |
| Visual | Screenshot review both themes, 360px/768px/1280px | Every milestone |

---

## 7. Roadmap

**M0 — Foundation** ✅ *done*
Research, verified dataset, oracle, Python engine, personal guide (now English).

**M1 — Scaffold + Engine (first code milestone)**
Vite/TS/Preact scaffold in `app/`; engine ported; **oracle replay green in Vitest**; CI on the repo; design tokens extracted; app shell with tabs + theme.
*Accept: `npm test` replays 44,851 rows with 0 mismatches; empty shell deploys.*

**M2 — Calculator + Paldex**
Pair→child and child→parents with full flags; per-pal pages with recipes; search everywhere; data + icons wired.
*Accept: any pair matches oracle; child→parents lists complete; Playwright flows green.*

**M3 — My Box**
Ownership UI, filters, text/JSON import-export, versioned store with migrations.
*Accept: box round-trips through export/import; survives refresh; drives calculator sorting.*

**M4 — Route Planner**
Worker-based multi-target planner; phases, ready-states, keep-genders, per-target progress; presets incl. Pål-Andre's plan.
*Accept: reproduces the 48-step plan from his box exactly; plans arbitrary target sets < 3 s.*

**M5 — Odds Lab** ✅ *done 2026-08-14*
Passive/IV/mutation math with sources for every formula; cake economics.
*Delivered: closed-form model on the game's own GameSettings weights (via palcalc's game-file dump) — reproduces the community's 40/24/12/10 table as a derived result, verified against an independent 200k-egg Monte Carlo simulation; real 114-passive database with mutation/boss-exclusive warnings; IV odds matching palcalc's reference; honest cake table (community numbers labelled as such).*

**M6 — Polish + PWA + Launch** ✅ *shipped to the branch 2026-08-14 (public deploy pending name decision)*
Service worker, installable, offline; reference module; final visual pass.
*Delivered: web manifest + real egg icons (192/512/maskable), build-generated service worker (versioned precache of shell+data, cache-first runtime icons, offline navigation fallback), production-only registration; Reference rebuilt as a full mechanics handbook with the 29-claim verification table; error boundary, Escape-close drawer, per-page titles, calc deep links (#/calc/Anubis), scroll restore; My Box got a real import/export panel (text+JSON round-trip, merge/replace preview), ownership/element filters and bulk actions; planning moved to a Web Worker with persisted plans and per-goal progress bars. 60 vitest tests including the exact 44,851-row oracle replay and DOM-level UI tests.*

**What's left before public launch:** the name decision (CEO call), a GitHub Pages
deploy of `app/dist/`, and an on-device pass (install prompt, airplane mode,
Lighthouse) — everything testable without a phone is done and green.

**v2 backlog (post-launch):** interactive map + spawn layers (the data is already in `pal_locations.json`), save-file import (palworld-save-tools → WASM or drag-drop JSON), Norwegian i18n, shareable plan links (URL-encoded state), passive-aware route planning (Odds Lab × Route Planner: plan to a species *with* a passive set, costed in eggs), community presets, Special Cake exact override value once datamined.

---

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Game patches change breeding data | Pipeline runbook + oracle replay; data files carry build stamps; fast re-extract |
| Fan-content/IP compliance | Follow Pocketpair's fan content policy: non-commercial, no ads, clear "not affiliated" notice, credit sources (paldb, palcalc, PalDex icons) |
| Name collision with existing sites | Decide name at M6, check domains/trademarks then; "HatchLab" is a working title |
| Scope creep (map, combat…) | v1 = breeding only; backlog is written down, not started |
| Solo-user bias (built for one box) | M3 makes the box generic; Pål-Andre's roster becomes just a preset |
| Big assets (6.5 MB icons) | Lazy-load icons per view; precache in SW; first paint stays < 200 KB |

---

## 9. Working agreement

- Everything lives in the **`palworld-breeding/` folder** (mirrored to Pål-Andre's desktop folder via chat file drops after every milestone).
- Every milestone ships something usable: pushed to the branch, published to the artifact link, and delivered as a downloadable file.
- English is the product language from now on. Norwegian returns as a translation in v2.
- The personal guide stays alive during the build — it is the daily driver until M4 supersedes it.

*Plan written 2026-08-14. Palworld 1.0 (build 24575149 data), level cap 80, 299 species.*

---

## 10. v2 roadmap (research-backed)

*Added 2026-08-15. This section supersedes the gut-feel "v2 backlog" list in
§7. Ordering is now evidence-ranked from two research rounds:
`documents/03_MARKET_RESEARCH.md` (the Palworld market) and
`documents/04_PRODUCT_BLUEPRINT.md` (design/IA blueprints from Dododex,
Poke Genie, HoYoLAB, paimon.moe, Genshin Optimizer, MapGenie, MH/Terraria
companions). Every rank cites its proof. The strategic model is Dododex:
a single calculator that grew into a 12M-download definitive companion by
keeping the calculator first and attaching everything else to it.*

**R0 — Data refresh + verified badge surfaced in-app.** *(precondition, days)*
Re-extract against the newest build (paldb.gg was serving build 4797106687,
Aug 12 — newer than our July extraction; possible Terraria-collab roster
changes), re-run the 44,851-row oracle, then put the build number + "verified"
badge on every result screen and a public /verification page.
*Evidence: Round 1 §12 (stale-data kill list: PalSphere died stuck at Pal
#111, XGamingServer still advertises EA numbers); Dododex's v2.8 headline
feature was per-entity game-version badges — the best companion in any genre
treats version-stamping as product, not plumbing.*

**R1 — Navigation restructure: 4 tabs + hub, global search.** *(structural,
do before adding sections)* Move to [Today] [Breed] [Paldex] [Box] [More-hub];
unified fuzzy search (pals + items + reference) in every header; deep links
kept. Ship the Today tab shell (active plans, timers placeholder, patch news
row) even before its full content exists.
*Evidence: Apple HIG 3–5 tab rule; NN/g hamburger-discoverability findings;
HoYoLAB's Tools-hub pattern; Dododex's search-first IA (3 menus + search
covers 200+ creatures). Adding sections before fixing nav is how paldb.cc
became five disconnected tools.*

**R2 — Paldex completion tracker (caught / alpha / lucky + catch bonus).**
Offline, per-profile, exportable; filter chips for owned/missing/alpha/lucky;
completion snapshot card on Today.
*Evidence: the most-requested feature across three competing Palworld apps'
reviews (Round 1 §8); Paltopia Collector Mode is the incumbent bar; MapGenie
made found-markers core; cheap to build on the existing Paldex.*

**R3 — Profiles (multi-world/save).** Profile = box + plans + tracker +
settings; invisible until a second profile is created; switcher in Box/Today
headers; per-profile JSON export with documented schema; whole-app backup.
*Evidence: Dododex server-rate presets, ARK Smart Breeding per-server
libraries, paimon.moe per-account profiles, Genshin Optimizer database
export (04_PRODUCT_BLUEPRINT §4 has the full spec). Must land BEFORE save
import so imports have somewhere to go.*

**R4 — Box import via desktop handoff.** Web drop-zone parses .sav read-only
(palworld-save-tools stack, incl. 1.0 GlobalPalStorage) → QR/link → "import
into profile X" with merge/replace preview.
*Evidence: Round 1 flagship #2 — PalSphere proved demand then died; PalCalc
proves feasibility but is trapped on Windows; import friction is the reach
ceiling (Poke Genie's 20M installs came from frictionless import).*

**R5 — Execution mode + timers + widget.** Per-step check-offs with live egg
counters, expected-vs-actual, incubation timers with notifications, then a
home-screen/lock-screen widget ("next egg / next step"). This is the
daily-retention engine.
*Evidence: PalCalc added step checkboxes Aug 2026 (market moving plan→execute);
HoYoLAB's resin widget is the genre's strongest daily-open device; Dododex
ships starve/torpor/breeding timers as core, not extras.*

**R6 — Spawns-in-routes ("catch this parent here").** Spawn cards inline in
route steps + a spawn block on each Paldex page. Not a map product.
*Evidence: data already in `pal_locations.json`; Dododex links spawn maps
from every creature page rather than making the map the product; MapGenie's
paywall resentment + blank-map 1★s mark the full-map trap (Round 1 §5.6).*

**R7 — Items & Tech, breeding-adjacent slice first.** Cakes, eggs, incubator,
condenser, key materials — each cross-linked from the calculators that use
them; full item/tech DB only after the slice proves out.
*Evidence: Dododex's Items menu exists to serve its calculator (kibble = ARK's
cake); Pocket Wiki for Terraria (4.7★, $6.99, offline, no ads) proves the
paid-quality bar for a full crafting DB; Paltopia's stale post-1.0 tech tree
is the incumbent weakness on record.*

**R8 — Odds Lab v2.5: telemetry.** Opt-in anonymous hatch telemetry to settle
the contested mutation rates (0.6% vs 1% vs 3%); publish aggregates openly.
*Evidence: Dododex industrialized exactly this (2.5M crowdsourced gathering
ratings from 180K users); PinDrop/OP.GG/PalCalc all publicly punt on these
numbers — first measured answer becomes the citation (Round 1 §9 #3).*

**R9+ (v3 horizon, in evidence order):** team builder + capture calc from the
owned box (Marriland archetype; Pal Analyzer demand signal) → bosses/raids
pages with check-offs (Dododex bosses category; Paltopia review requests) →
community benchmarking (akasha.cv/Pikalytics pattern) → screenshot OCR import
moonshot (Poke Genie's 20M-install mechanic).

**Standing quality gates for every R-item:** the 15-point AAA checklist in
`04_PRODUCT_BLUEPRINT.md` §5 (data badge, unified search, fixed detail
anatomy, offline-complete, no ads/free dark mode, taught empty states,
fenced community content, patch-day news, native citizenship) plus the
existing §6 gates (oracle replay, Playwright, Lighthouse). Monetization stays
Round-1 doctrine: facts free forever; at most one $4.99–9.99 supporter unlock
(Paltopia's proven anchor; PalCodex's 1.0★ is the tombstone of the
alternative).
