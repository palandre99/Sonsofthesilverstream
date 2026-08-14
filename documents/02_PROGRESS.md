# PROGRESS — audited state, no invented percentages

*Updated 2026-08-14 late evening. Update this file whenever a work block
lands; date every entry.*

## iPhone app (`mobile/`) — the priority

**Built and typechecked; first EAS development build triggered 2026-08-14
22:59 by the CEO (Apple credentials created).** All six modules exist as
native screens sharing the oracle-tested engine:

- Calculator: pair→child with the math shown; child→parents grouped by
  box-readiness. ✅
- Route Planner: presets, phased plan, gender-aware ready-states, persisted
  plans + check-offs, haptics. ✅ (missing vs web: per-goal progress bars)
- Odds Lab: passives (real 114-passive picker, pool with junk warnings,
  slot cap), IVs, cakes/mutation. ✅
- Paldex: search, element filter, detail sheet with stats/work/partner
  skill/all recipes. ✅ (missing vs web: work-suitability filter)
- My Box: gender toggles, filters, paste-import with preview, guarded
  clear. ✅ (missing vs web: JSON backup export/import, bulk own/un-own)
- Reference: full handbook + 29 claims. ✅

Infra: EAS project linked, channels development/preview, auto-update
ON_LOAD, tunnel-only dev server with URL capture, CEO launchers at root.

**Not yet verified on-device** (needs the installed build): real-device
performance of the planner fixpoint, icon rendering at scale, haptics feel,
safe-area on the CEO's phone model, OTA update round-trip.

## Website / PWA (`app/`)

Complete and hardened: M0–M6 all shipped 2026-08-14; adversarial review
(2 criticals, 10 should-fixes, 14 minors) fully fixed; 62 vitest tests
green incl. exact 44,851-row oracle replay + symmetry sweep; CI on every
push; installable PWA with full-content-hashed service worker; single-file
build (6.4 MB) published as artifact
(claude.ai/code/artifact/0f571216-dd99-4210-83c7-0a222e2e5756).
Public deploy: `hatchlab/` on main (GitHub Pages) — in progress 2026-08-14.

## Data & engine

1.0 dataset extracted + cross-validated (paldb→kb, palcalc oracle, raw
DT_PalCombiUnique). Odds weights are the game's own GameSettings values;
model reproduces the community table and matches a 200k-egg simulation.
29 verified claims in `data/verification.json`. Known unmodelled (by
policy, not laziness): Special Cake override, Mushroom Cake IV bonus,
exact hatch-time formula.

## The paper trail

Commits on `claude/palworld-breeding-guide-i9yyuz`, all pushed. Key ones:
`5847474` (M5 Odds Lab), `271bc9d` (PWA), `656ac8b` (review fixes),
`5e8aae7` (native app), `71126b2` (CEO launchers).
