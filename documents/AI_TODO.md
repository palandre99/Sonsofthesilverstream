# AI TODO — the shared backlog

*Take from the top unless the CEO redirects. Tick with a date when done.
Add everything you find; finding nothing means you didn't look.*

## NOW (app-first)

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

## WEBSITE

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
