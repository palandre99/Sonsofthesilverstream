# AI TODO — the shared backlog

*Take from the top unless the CEO redirects. Tick with a date when done.
Add everything you find; finding nothing means you didn't look.*

## NOW (app-first)

- [ ] **URGENT — data refresh**: research (03_MARKET_RESEARCH.md) found the game
      updated Aug 12 (build 4797106687, Terraria collab content) — NEWER than our
      July 20 extraction. Re-clone palworld-kb / re-extract, re-run the oracle;
      roster and combos may have moved. Everything data-related waits on this.
- [ ] **On-device verification pass** once the dev build installs: planner
      speed on hardware (the 27-target plan), list scrolling with 298
      icons, haptics, safe areas, OTA round-trip. Fix what's found.
- [ ] **Mobile: per-goal progress bars** on the Planner (web parity).
- [ ] **Mobile: My Box JSON backup** import/export (web parity) — the CEO
      should be able to move his box between phone and website.
- [ ] **Mobile: Paldex work-suitability filter** (web parity).
- [ ] **Cross-device box sync** (bigger): the phone box and website box are
      separate stores today. Simplest honest v1: manual JSON via clipboard
      both ways (already half-exists). Evaluate a real sync later — no
      accounts, so maybe iCloud/file-based. Design before building.
- [ ] **First OTA update flow test**: land a visible change, `eas update
      --branch development`, confirm pickup on reopen.

## SMART PLANNING (CEO strategic direction, 2026-08-15)

- [x] 2026-08-15: v1 "Make it faster" card on the Plan: cake/ingredient math
      from the verified recipe, ranch-producer coverage from real
      ranch_produce data, accelerator scheduling hints (Braloha/Dynamoff).
- [ ] RESEARCH before modeling (CEO mentioned, unverified): Grintale
      "more eggs" claim; pals that raise alpha/mutation odds ("the two
      dinosaurs"); any other breeding-economy partner skills. Verify against
      datamines/community measurements; only then add to the card.
- [ ] Booster-aware planning v2: option to weight the route so accelerator
      subtrees complete first (true reordering, not just a hint); "add
      producer as target" one-tap action.
- [ ] Cake economics v2: expected eggs (not minimum) from the Odds Lab
      model per step; ranch throughput rates per producer.

## SELF-FOUND IMPROVEMENTS (own audit, 2026-08-15 00:05)

- [x] 2026-08-15: Plan management — Start over (reverses tick-registered pals)
      + Clear plan (keeps collection). Both platforms, tested.
- [x] 2026-08-15: Paldex list taps while keyboard open (keyboardShouldPersistTaps).
- [ ] Mobile Calculator: no way to clear/swap a picked parent — add long-press
      to clear + a swap button between the pickers.
- [ ] Mobile: picker modals should show recently-picked pals first.
- [ ] Planner: "Plan N targets" silently replaces the current plan — warn when
      an unfinished plan exists (checks > 0).
- [ ] Planner phases: a phase whose steps are all done should collapse.
- [ ] Odds Lab mobile: parent panels lose passives when switching tabs — keep
      state per session (lift state up or persist).
- [ ] Drawer: gesture to open should work mid-screen swipe (currently edge-only
      32px) — evaluate against scroll conflicts.
- [ ] Haptics on step-complete uses success notification; add a tiny confetti
      or scale animation on the hero row for the "hatched!" moment.
- [ ] Paldex row: tapping ♂/♀ needs a subtle scale/opacity animation.
- [ ] Web hatch dialog: Escape should close it (click-away works today).
- [ ] Coming-soon screens: add a "vote for this" tally later (local count).

## WEBSITE

- [ ] Web parity for the domain architecture (side panel domains + per-domain
      tabs, Paldex center) — mobile shipped 2026-08-15, web still has the flat
      sidebar.
- [ ] Web parity for the in-game-style info card (stats icons, food
      drumsticks, drops, boss map panel).

- [ ] Verify the Pages deploy at /Sonsofthesilverstream/hatchlab/ (SW scope,
      icons, fonts, offline) once DNS/CDN settles; add the link to the
      repo README + root README-PHONE.
- [ ] Decide the final product name with the CEO before any promotion
      ("HatchLab" is a working title; check collisions then).

## QUALITY / ENGINEERING

- [ ] Mobile test harness: the engine tests run in app/ only; add a
      minimal vitest (or jest-expo) setup in mobile/ replaying the oracle
      against mobile's engine copy so drift is impossible.
- [ ] Script to diff app/src/engine vs mobile/src/engine in CI (fail on
      divergence).
- [ ] Planner fixpoint perf: profile on-device; if >3 s for 27 targets,
      consider memoizing childrenOf across runs or precomputing rank
      neighborhoods.
- [ ] Ship a tiny "About/what's verified" screen in mobile Reference
      linking the artifact + Pages URL.

## LATER (v2 seeds — written down, not started)

- [ ] Passive-aware route planning (Odds × Planner: plan to a species WITH
      a passive set, costed in eggs).
- [ ] Interactive map + spawn layers (data exists in pal_locations.json).
- [ ] Save-file import (palworld-save-tools).
- [ ] Norwegian localization (the CEO's language; string catalog first).
- [ ] Community presets sharing (URL-encoded plans).

## AREA LOCKS

*Claim an area with a dated line before multi-file work; release when done.*

- (none active)


## CEO FEEDBACK LEDGER — night of 2026-08-15 (NOTHING here may be forgotten)

CEO mandate: every piece of feedback lands here the moment it arrives; tick it
only when shipped AND eye-verified. CEO sleeps ~15h from 01:35; the worker
loops all night INSIDE the Breeding + Paldex domain (his explicit scope).

### Shipped tonight (verify on device when CEO wakes)
- [x] Paldex: compact header (list owns the screen), Filter & Sort sheet
      (in-game style: rarity/work/stat sorts, element + ownership filters,
      live count) — OTA cc851e51
- [x] Side panel: vector icons everywhere (no emoji in chrome), real sphere
      logo, SECTIONS eyebrow, short titles at compact width
- [x] Map domain re-scoped to EVERYTHING (materials, hackable towers, fishing,
      bosses, eggs, dungeons, statues, drops, merchants, chests) and made
      FULLSCREEN — no bottom tabs, filters live in the map (CEO-final)
- [x] Helper registry (engine/helpers.ts): Chikipi/Mozzarina/Beegarde/Caprity/
      Braloha/Dynamoff/Grintale/Broncherry(+Aqua)/Ribbuny — ALL verified from
      game partner-skill data; CEO's "grintale + two dinosaurs" claims CONFIRMED
- [x] Make it faster v2: Add-to-plan buttons with exact +N step cost, honest
      RECOMMENDED verdicts, Remove-from-plan, free-byproduct detection
- [x] In-plan helpers pulled first within their phase + PHASE N pointer
- [x] Plan step cards: parents row can never wrap a name again (shrinkable
      cells, auto-fit text) — CEO callout "Warsect Terra"
- [x] Readiness pills: "ready to breed" / precise "need a M X — or a F Y"
      gender hints / "waiting on parents" / half-done amber — CEO request
- [x] Grammar: no "1 steps"/"1 cakes"; empty plan shows "Nothing left to
      breed" instead of zero-math

### Landed after the ledger was written (all verified + shipped)
- [x] Readiness pills eye-verified + OTA'd
- [x] Web parity: helpers card (worker-computed), readiness pills, empty-plan
      state, roster-preserving reshapes (domains nav + filter sheet still open)
- [x] FREEZE HOTFIX (CEO report + brutal-reviewer CONFIRMED, measured):
      helperAdvice 4437ms -> 335ms via shared derivations; no recompute on
      tick; negative "+-4 steps" fixed via plan-roster math; reshapes keep
      ticks (roster snapshot); panel-drag stale closure; jargon labels;
      faithful "Sometimes drops" game text; dead code pruned
- [x] CEO UX round 2: advice computed WITH the plan (same frame, persisted,
      worker-side on web), Add/Remove busy labels ("Adding..."), legacy-plan
      backfill; EAS preview build fired for a fast near-release app
      (build 68e1c1de, watcher armed)

### Open — do these before anything else
- [ ] Preview build 68e1c1de: when FINISHED give CEO the install link; then
      keep pushing every OTA to BOTH branches (development + preview) and
      add the preview branch to PUSH-UPDATE.cmd
- [ ] Web parity still missing: domains side-panel nav (Paldex SORTING
      shipped on web 02:50 — rarity/name/HP/ATK/DEF select)
- [ ] Profile-switch write race (reviewer #8): guard persist ordering in
      switchProfile before any more store writers land
- [x] Smart catch-vs-breed advice SHIPPED (both platforms): suggests with
      addSteps >= 4 show "Faster to catch one: <regions> (found up to Lv N)"
      from real wild data
- [ ] Paldex header collapse-on-scroll polish (CEO floated it; compact default
      shipped — evaluate if still worth it)
- [ ] Jargon audit across every screen (CEO: "if it's not easy to understand
      it's poor design") — hunt engine words leaking into UI copy
- [ ] Reference tab: add the verified helper-pal table (partner skills, from
      game data) so the knowledge is visible outside the plan card
- [ ] verification.json + ENGINE_STATUS: record partner-skill verification
      (Braloha/Dynamoff/Grintale/Broncherry/Caprity berries) 2026-08-15
- [ ] Broncherry alpha-egg details in the pal info card (luck helpers section)
- [ ] Mobile engine test harness (vitest for mobile copies) — still open
- [ ] Aug-12 game-update data freshness check (upstream kb + palcalc) — URGENT
