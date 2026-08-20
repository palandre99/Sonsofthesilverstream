# BREEDING FANE — HANDOFF (written 2026-08-17, night; facts refreshed 2026-08-18)

> **2026-08-18 refresh:** E128-E134 landed since this was written — gender-gap
> advice rows (Plan + Calculator, shared component), Paldex as Breeding's
> home tab, the spawn-map pageSheet fix, fixed-boss stats on the pal card
> (205/207 datamined, CombiRank-validated), the "?"-mark durability fixes
> (plan ticks, share/import), press-time gender-tap reads, and the brutal
> eval at 131-owned scale. Tests are **722**; `npm run build` in app/ is a
> REAL gate (it was silently red for a day — vitest does not typecheck).
> The open queue below is superseded by AI_TODO.md / E134's verdict:
> on-device measurement pass and world-save import (CEO-gated) are the two
> big remaining items; the plateau retry stays rejected on E108's numbers.

You are taking over the **breeding fane of the iPhone app**. This file is the
short orientation; the workspace carries the detail. Read in this order:

1. `CLAUDE.md` (repo root) — the law. Lane rules, quality bar, publish ritual.
2. `documents/00_START_HERE.md` → `07_WORKING_AGREEMENT.md` → `08_TOOLS_AND_COMMANDS.md`.
3. `documents/02_PROGRESS.md` — audited state, newest entry covers 2026-08-17.
4. `documents/AI_TODO.md` — the ledger. **E100–E127 are the last two days**;
   every entry says what changed, what was measured, and how it is guarded.

## Where the product stands

- **The pal card has been read aloud end to end** (E115–E126): every section's
  copy audited like a player would read it, every gate's empty side counted,
  every printed number tied to the data that makes it true. The Calculator,
  Odds Lab, picker, Settings and Paldex had the same treatment (E103–E113).
- **The planner beats the old Python reference** (127 vs 152 steps across the
  twelve benchmark boxes, E102). The Python `planner.py` is 3 steps behind
  ON PURPOSE — do not "fix" it.
- **Suggestions think now** (E119–E121, all from the CEO's own feedback):
  rows name both routes (catch AND breed), owned pals sink instead of being
  recommended, mounts rank by stat block vs distance, and every scored
  category has a Best-first/Closest-first toggle.
- **The gender-"?" feature** (E122–E123): a third box beside ♂/♀ for "caught
  it, couldn't tell". It counts as OWNED but never as a known gender — if it
  ever counts as a parent, plans become lies. His bug report taught the rule:
  per-species flags are AGGREGATES; "?" coexists with known ticks.
- Tests **655 passing** including the 44,851-row oracle replay. Both trees
  typecheck. Published to both channels through E127.

## The five rules that will fire you

1. **Never invent game numbers.** Datamined or labelled community-measured.
2. **The engine is sacred**: `src/engine/*` AND `src/logic/recommend.ts` are
   byte-identical in app/ and mobile/. Edit app/, `cp` to mobile/, `cmp`,
   say so in the commit. The oracle must pass.
3. **Stay in the lane.** The Map fane is another worker's. Their files
   (MapScreen/MapCanvas/MapViewer/ReferenceScreen, `mobile/src/map/`,
   `app/src/map/`, map tests, `qa-shot.js`, `build_map_tiles.py`, tiles):
   importing is fine, editing is never fine. The website is ON HOLD — build
   only in `mobile/`; web-only findings get LOGGED under the web backlog.
4. **Publishing is part of "done"** — every finished item, both channels,
   plain-language message (he reads it on the About screen). Read
   `git status --porcelain` in its OWN command first and LOOK at it: if the
   other lane has uncommitted files, do not publish (this was violated once
   on 2026-08-17 — incident note in the ledger — because status and publish
   were chained in one command).
5. **Verify with your own eyes, in the state the CEO will meet it.** The QA
   render is tab "seed" at `http://localhost:8086` (start with
   `npx expo start --web --port 8086 --offline` in mobile/, background).
   Two of this week's bugs existed only on his phone because the harness
   state differed — the harness save is Lv 42 / 26 pals; his phone is
   Lv 80 / 131.

## Hard-won mechanics (cost real hours this week — believe them)

- **RN-web modals do not survive between `javascript_tool` calls.** Open,
  drill and read in ONE call. Find controls by locating a leaf text node and
  walking up to `[role="button"]`. Virtualised lists need incremental
  scrolling to mount.
- **Write Python with the Write tool, never a bash heredoc** (one hung the
  shell for 600 s). Never inline `python -c` with `$`, `\b`, regex or
  unicode — the shell eats them and you measure your own escaping. Every
  scripted source edit asserts its anchors before writing.
- **Mutation-prove guards**: back up the file, break the code, watch the one
  test fail via `subprocess`, restore in `finally`. But know its limit: a
  guard proves the code matches YOUR model, not that your model matches the
  player (the gender-"?" bug shipped with green mutation-proofs).
- **The app's vitest cannot import `.tsx`** — guard screens with source
  assertions. A plain `.ts` in `mobile/src/` CAN be imported — prefer real
  behavioural tests and rebuilding a screen's predicate on the engine.
- **vitest `console.log` is invisible** — write measurements to a file from
  inside the test and `cat` it.
- **The comment-stripper in source-reading tests** must not cross `*/` —
  the old regex swallowed 6,672 chars once and `not.toContain` passes
  vacuously against truncated reads (all 16 files already fixed; keep the
  safe form if you write a new one).
- **His real save may be loaded in the QA harness.** Any test that touches
  the box uses the snapshot protocol (ledger has it verbatim): snapshot all
  `/hatchlab|palforge/` keys, test, restore key-by-key, remove extras,
  reload, re-verify. NEVER press Apply/Add in the import sheet, "+" or
  "Add these N" in suggestions, and never delete profiles.

## Open queue (in order)

1. **Plateau-planner cheap directions** — E108 rejected the full version on
   measured cost (10.7 s/plan); any retry must beat those numbers.
2. **The suggestions-sheet first open** — decomposed at E127: 1.0 s modal
   mount + 5.6 s reachability fixpoint on the DEV harness, but ~335 ms on
   record for a real device. PARKED until someone measures on a real build
   (pairs with the About-screen `Updates.manifest` probe, also open).
   Do not restructure on the harness number.
3. **Brutal self-eval every few work blocks** — the CEO mandates it: audit
   your own recent work first, measure the worst interaction, report
   negative results honestly.
4. **WAITING ON THE CEO — do not start, do not nag:** world-save import
   (Worlds tab), so suggestions see his real Paldex instead of box ticks.
   It is the single biggest win available and he knows it.

## Known and deliberate (do not "fix")

- Data contradictions stay as-is; the UI explains them instead (Astralym ×3,
  Panthalus, Petallia Ignis, Bellanoir's notes, the game's own "SAN
  dreceases" typo). 17 partner effects are truncated UPSTREAM in the source
  data — `cleanEffect` handles the symptom; re-fetching is a data-pipeline
  job.
- "Health" vs "HP", `planner.py`'s 3-step lag, the Special/Mushroom Cake
  unmodelled bonuses — all deliberate, all in the ledger.
- ~5 "Unexpected text node" warnings at boot + 1 on first card open —
  pre-existing, logged.
- The tunnel dev server (PID 27216) burns CPU and the CEO was told once —
  do not nag him again, and do not kill it (it may be his phone's live DEV
  connection).

## Working with the CEO

Plain language, lead with what changed for HIM, proof over promises, end
every report with landed / next / blockers. He judges by looking at the app.
When he reports a bug, `06_TROUBLESHOOTING.md` first — but this week broke
that pattern twice: his reports on MY work were real code bugs both times.
Turn his complaints into measurements before designing the fix; both of his
big ones ("engine is not thinking", "it takes me out of the paldex") became
one-line facts once measured.
