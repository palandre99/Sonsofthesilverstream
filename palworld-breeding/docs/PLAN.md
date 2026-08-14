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
