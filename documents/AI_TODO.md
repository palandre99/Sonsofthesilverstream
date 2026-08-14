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
