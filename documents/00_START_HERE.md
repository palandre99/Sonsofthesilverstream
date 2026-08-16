# START HERE — Palforge project constitution

*You are picking up a live product. Read this, then `02_PROGRESS.md`, then
take the top item in `AI_TODO.md`. The workspace law in the root
`CLAUDE.md` binds every session.*

## The document set — what to read, in order

| File | What it is | Read when |
|---|---|---|
| `00_START_HERE.md` | this file — the constitution | first, always |
| `01_LINKS.md` | **every link the CEO asks for** + the launchers | he asks for the app, or a build finishes |
| `02_PROGRESS.md` | audited state, dated entries | before planning work |
| `03_MARKET_RESEARCH.md` | competitor landscape | product decisions |
| `04_PRODUCT_BLUEPRINT.md` | the master plan / vision | product decisions |
| `05_ARCHITECTURE.md` | how it's built + how code reaches the phone | before touching build/delivery |
| `06_TROUBLESHOOTING.md` | symptom → cause → fix, with post-mortems | the moment anything "is broken" |
| `07_WORKING_AGREEMENT.md` | how the CEO works, his mandates, reporting style | before your first reply to him |
| `08_TOOLS_AND_COMMANDS.md` | every command, gate, script, deploy step | session start, and before shipping |
| `AI_TODO.md` | the live queue + CEO feedback ledger | every work block |

**New here? The 10-minute onboarding is:** `00` (this file) → `07` (how he
works) → `08` § "Session start" (run the checks) → `02` (where the project
is) → `AI_TODO.md` (take the top item). `01`, `05` and `06` are references
you open when the moment calls for them.

**If the CEO reports a problem, open `06_TROUBLESHOOTING.md` before reading
any app code.** Every incident so far turned out to be environment or
delivery, never the app itself.

## The product in one paragraph

Palforge answers the only questions a Palworld breeder actually has: *what
do these two parents make, how do I get species X from what I own, what
will the passives/IVs cost me in eggs, and in what order do I breed toward
my goals?* It answers them **provably** — the species engine replays all
44,851 precomputed 1.0 outcomes from the game files with zero mismatches,
and every probability comes from the game's own inheritance weights.
Nothing else on the web or the App Store does route planning from an owned
box, and nothing is verified to this standard.

## The three delivery targets

| Target | Folder | Stack | Status |
|---|---|---|---|
| iPhone app (**priority**) | `palworld-breeding/mobile/` | Expo SDK 54, RN 0.81, TS | All 6 modules built; first dev build 2026-08-14 |
| Website / PWA | `palworld-breeding/app/` | Vite, Preact, TS | Complete; 278 tests; offline-capable |
| Reference + pipeline | `palworld-breeding/` (py, tools, guide) | Python 3 stdlib | Frozen as oracle + data refresh path |

One engine, copied verbatim between `app/src/engine/` and
`mobile/src/engine/` (formula.ts, planner.ts, odds.ts, types.ts). If you
change one copy you change both and re-run the oracle suite.

## The data (all versioned, all sourced)

`palworld-breeding/data/`: `breeding_1_0.json` (CombiRanks, 134 unique combos,
pool exclusions, and the single gender-locked pair — Katress×Wixen — stored as
**2 directional entries**, since each direction yields a different child:
Katress♀×Wixen♂ → Katress Ignis, Wixen♀×Katress♂ → Wixen Noct), `pals_1_0.json` (stats, work,
spawns), `passives_1_0.json` (114 passives with tiers/exclusivity),
`oracle_pairs.json.gz` (the 44,851-row test oracle), `verification.json`
(36 sourced claims). Regenerate after a game patch with
`tools/extract_from_kb.py` + `tools/extract_passives.py` against a fresh
clone of beliarance/palworld-kb, then run the tests — the oracle exposes
any mechanic change.

## Quality gates (all must be green before "done")

```
cd palworld-breeding/app    && npx vitest run     # 278 tests, oracle replay exact
cd palworld-breeding/app    && npm run build      # typecheck + PWA + sw.js
cd palworld-breeding/mobile && npx tsc --noEmit   # native app typecheck
```

CI (`.github/workflows/ci.yml`) runs the app gates on every push.

## How the CEO uses this project

Double-click launchers at the root (`README-PHONE.md` explains them in his
language, `01_LINKS.md` in ours): `BUILD-DEV.cmd` (EAS build),
`START-APP.cmd` (tunnel dev server — must work on 5G), `PUSH-UPDATE.cmd`
(OTA update), `COPY-INSTALL-LINK.cmd` (install URL to clipboard). He reads
progress reports in plain language and clicks things. He never runs
terminals by hand beyond these.

**He has BOTH apps on his phone: "Palforge" (full) and "Palforge DEV" (live,
orange DEV badge).** They have separate bundle ids since 2026-08-15, so
installing one no longer deletes the other. That separation lives in
`mobile/app.config.js` — if a change ever collapses it back to one bundle id,
the app-deleting bug returns. Re-verify on every DEV build; check in
`01_LINKS.md`.

## History you should not re-litigate

- 2026-08-15: "the app is broken, no metro stuff" was **never the app**. It
  was three orphaned Expo servers eating ~7.5 CPU cores plus a FAST install
  that overwrote the DEV client. `START-APP.cmd` now self-cleans and takes
  over safely. Full post-mortem in `06_TROUBLESHOOTING.md` — read it before
  diagnosing any "broken app" report.
- 2026-08-14: M0–M6 shipped for the web app; adversarial review found 2
  criticals (deep-link boot crash, SW partial-content hashing) — all fixed
  same day, commit 656ac8b. Don't reintroduce.
- The community's 40/24/12/10 passive table is DERIVED by our model from
  game weights — treat any source that contradicts it as wrong.
- "Deluxe Vegetable Cake" doesn't exist in 1.0 (EA-era name). Condensing
  is 48 copies, not 116. Katress/Wixen is the only gender-locked pair.
