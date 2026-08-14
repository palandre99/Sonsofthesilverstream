# HatchLab — Palworld 1.0 breeding, solved

The best Palworld breeding app on the web: a provably-correct engine, a
versioned 1.0 dataset, and **the app** (`app/`) — an installable, offline-first
PWA with six modules: Calculator (pair→child and child→parents), Route Planner
(shortest shared breeding tree from *your* box, in a Web Worker, with per-goal
progress), Odds Lab (passive/IV/mutation probabilities from the game's own
inheritance weights), Paldex, My Box (gendered ownership, import/export) and a
Reference handbook with 29 verified claims.

All six milestones (M0–M6) are done — see [`docs/PLAN.md`](docs/PLAN.md).
Left before public launch: the name decision + a Pages deploy + an on-device pass.

```bash
cd app
npm install
npm test           # 60 tests incl. the exact 44,851-row oracle replay
npm run build      # dist/ — static PWA, deployable anywhere
npm run build:single  # dist/HatchLab-app.html — the whole app as ONE file
```

The original Python planner + generated guide below remain as the reference
implementation and data pipeline.

## Quick start

Only needs Python 3 (no packages, no network after cloning):

```bash
python3 planner.py plan                 # the whole plan in your terminal
python3 planner.py what Katress Wixen   # what does one pair produce?
python3 planner.py path Anubis          # cheapest route to one species
python3 planner.py reachable            # which species can be reached?
python3 planner.py add Frostplume       # new pal in the box -> updated plan
python3 build_guide.py                  # regenerate guide/index.html
python3 -m unittest discover tests      # run the test suite
```

Edit `roster.txt` (your pals) and `targets.txt` (your goals) freely —
both are plain text files.

## Files

| File | What |
|---|---|
| `planner.py` | the engine: species formula, reachability, shortest shared tree, CLI |
| `build_guide.py` | generates the guide (`--embed` builds the standalone single file) |
| `roster.txt` / `targets.txt` | your pals and goals — editable |
| `guide/index.html` | **the guide** — tabbed app: Plan (ready-states per step), Paldex (tick what you own), Goals (progress per pal), Operations, Sources |
| `guide/artifact.html` | the same guide as one standalone file (everything embedded) |
| `guide/icons/` | 298 real game icons (github.com/dbgoodm/PalDex, game dump) |
| `guide/fonts/` | Baloo 2 + Manrope, subset woff2 (OFL, via google/fonts) |
| `data/breeding_1_0.json` | CombiRanks, 134 unique + 2 gender-locked combos, pool exclusions |
| `data/pals_1_0.json` | stats, work suitabilities, partner skills, spawn info per species |
| `data/oracle_pairs.json.gz` | the oracle: all 44,851 1.0 results (palcalc, generated from game files) |
| `data/verification.json` | 23 cross-checked claims with status and sources |
| `docs/PLAN.md` | the master plan for the public app |
| `tools/extract_from_kb.py` | regenerates the data files from beliarance/palworld-kb |
| `tools/validate_against_palcalc.py` | replays the full oracle against the engine |
| `tests/` | 10 tests: 31 known pairs + structural properties + full oracle replay |

## Why it's correct

The species formula (target `⌊(rankA+rankB+1)/2⌋`, generic pool of 183 species,
tie-break to the higher CombiRank) is **replayed against all 44,851 precomputed
1.0 results** from palcalc — zero mismatches — and cross-checked by 8
independent research agents (see `data/verification.json`).
Katress+Wixen is the game's only gender-locked pair and is handled explicitly.

## The guide as an app

Checked steps and Paldex ownership are saved in your browser and work together:
a step lights up **"ready now"** when both parents exist among what you own or
have bred, goal cards show per-species progress, and "Copy roster" exports your
ownership list straight into `roster.txt` format.

## Technology choices

Python 3 with no dependencies: preinstalled almost everywhere, one file to run,
and the data lives in versioned JSON files with source and date. The guide is
plain static HTML with no build tools — works offline, in every browser, and
deploys straight to GitHub Pages. The public app (see the plan) moves to
TypeScript with the same oracle-tested engine.

## On a game patch

1. Refresh the clone of `beliarance/palworld-kb` (or an equivalent dataset).
2. `python3 tools/extract_from_kb.py <path>` — new data files with a new date.
3. `python3 -m unittest discover tests` — the oracle exposes formula changes.
4. `python3 build_guide.py` — a fresh guide.

Dated 2026-08-14 · Palworld 1.0 (released 10 July 2026) · level cap 80.
