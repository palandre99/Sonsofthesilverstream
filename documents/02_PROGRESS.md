# PROGRESS — audited state, no invented percentages

*Updated 2026-08-15 ~22:00. Update this file whenever a work block lands;
date every entry.*

## 2026-08-15 ~22:00 — CEO feedback round intake: breeding fane perfection

The CEO delivered a 12-item feedback round on the breeding fane (verbatim in
`AI_TODO.md` §E): the un-add bug in Suggested Goals, no way back from
calc/plan to the Paldex card, a player-level setting on save profiles, a
genuinely scored recommendation engine ("6 kindling one breed away beats 7
kindling 83 breeds away"), the opaque ENDGAME label, per-pal add on Best
pals, killing horizontal scroll in favour of full-screen category browsers,
the m7/t7 badges, and a proper Plan-targets tray.

Done at intake: plan of record written (phases 0–7, engine files untouched —
the oracle guarantee is never at risk), all 12 items ledgered as E1–E12,
shipped-but-unticked ledger items reconciled with verified commit hashes
(2128ef3, 64539d7, 592dbb6, bbc0cad, 38af923, c4e6bd3, 03d38a4), the two
ledger contradictions resolved (data refresh: resolved, weekly re-check;
mobile test harness: dropped, byte-parity gate covers it), area lock
claimed. Root causes were verified in code before planning — including two
perf traps in the sheet (a derivations fixpoint paid on Plan-tab mount even
with the sheet closed, and closed-modal JSX recomputing crew rankings on
every store write) that the round will fix.

Baseline gates at HEAD `fdb4789` re-run at intake — see next entry for
results.

## 2026-08-15 evening/night — handover marathon (new coder), all shipped

Every block: gates green (vitest 64→79 incl. the new ENGINE-PARITY CI gate
+ Chikipi/meta regression tests; mobile tsc 0; bundle 200), committed,
pushed to PR #1, OTA'd BOTH channels, ledgered.

- **Toolkit builds (runtime 1.1.0)**: 16 native modules in both apps;
  eas.json pins EAS_BUILD_PROFILE per profile (preview builds were broken
  since the identity split — CLI/worker mismatch, found + fixed); hub
  manifests updated; both `.ipa` identities verified by unpacking.
  expo-notifications deferred (needs CEO Apple login for the entitlement).
- **Planner brain**: catch-only advice for unreachable helpers (the
  Chikipi bug — reproduced, fixed, regression-locked), cake-supply
  checklist, advice versioning for stale saved plans, replace-plan
  confirm, folding completed phases, Odds Lab session cache, Calculator
  clear/swap, back-to-card navigation (nav/intent.ts).
- **Suggested Goals v1→v3, mobile + web (web deployed live)**: squads,
  best-in-game + fighting (community-labelled meta.ts with provenance and
  a rejected-source note), mounts with real saddle levels (paldb fetcher,
  114/121), weight/efficiency/loot/ranch squads, born-with passives (46
  datamined, also on pal cards), composite crews, dynamic per-job lists —
  chips say BREED·N STEPS / CATCH LV X / CATCH X TO UNLOCK, per-chip add.
- **Data**: About 299/299; palcalcFacts.g.ts (game rarity integer, wild
  ranges, guaranteed passives; maxWild 285/285 cross-validated); Ribbuny
  Botan truncation completed (claim #30); helper skills recorded (#31);
  Bellanoir work data 2-source verified after a CEO challenge.
- **Rarity visuals**: five iterations under live CEO feedback, then PARKED
  at his order — vanilla restored; the integer + wild ranges stay.

## 2026-08-15 late — hostile doc audit, workspace handover-ready

Audited every markdown file in the repo against reality. Seven real defects,
all fixed (details in commit `35b21a7`): a second competing master plan under
the dead "HatchLab" name; a code README with the old name, wrong test count
(60→64) and wrong claim count (23→29); three docs still asserting "one app
slot" after coexistence shipped; `CLAUDE.md` naming the wrong deploy path;
stale AI_TODO items; and a phone README telling the CEO to run a build he had
already run. One data contradiction (1 vs 2 gender-locked combos) was settled
**from the data**: one pair, two directional entries.

`CLAUDE.md` now carries the three things that were only ever in chat: **SCOPE**
(breeding is phase one, don't widen while it's imperfect, Dododex as the model),
**THE QUALITY BAR** (what 10/10 means here), and **METHOD** (verify with your
own eyes; test the state the CEO will meet; diagnose before blaming code; never
guess a value you can read).

Verified: 64/64 vitest, mobile tsc clean, all cross-references resolve, website
+ hub + both manifests 200, old saved link still forwards.

Known-unverified, deliberately left in the queue rather than claimed: the PWA
offline pass on the CEO's phone, and the data refresh for the Aug 12 game patch
(our extraction is from July 20) — that one gates all data-related work.

## 2026-08-15 afternoon — delivery pipeline repaired, workspace documented

**No app features changed. Zero app code touched.** This block fixed how code
reaches the phone, which had been silently broken.

- **Root cause of "the app is broken":** three orphaned Expo dev servers
  (8081 tunnel, 8090 `--go`, 8085 `--web`) left running since 01:20 the night
  before, each pinning ~2.5 CPU cores — ~7.5 cores saturated for 11+ hours.
  They held port 8081, so a fresh `START-APP.cmd` captured the *stale*
  server's URL and handed the CEO a dead link.
- **Second, self-inflicted fault:** the FAST install link was sent to him
  mid-diagnosis and **overwrote his DEV client** — both builds share one iOS
  app slot. That removed Metro/shake and made the symptom look worse.
- **Shipped** in `mobile/scripts/start-dev.js`: stale-server preflight
  (scoped to this project so Stride/Fjelltur servers survive), a PID lock so
  the newest launcher takes over instead of two fighting, manifest scheme
  validation, extra poll ports. Double-clicking START-APP twice is now safe.
- **Shipped** `/palforge/install-dev/` — login-free DEV install page with a
  one-tap "Connect to PC" button (the tunnel hostname is stable across
  restarts). Published to `main`, verified live.
- **Verified:** tunnel manifest 200, iOS bundle 6.5 MB through the public
  tunnel in ~7 s, double-launch leaves exactly one supervisor/server/ngrok,
  CPU back to 6%. **CEO confirmed the DEV build working on his phone.**
- **Docs:** added `01_LINKS.md`, `05_ARCHITECTURE.md`,
  `06_TROUBLESHOOTING.md`, `07_WORKING_AGREEMENT.md`,
  `08_TOOLS_AND_COMMANDS.md`; corrected the two-apps claim below. `CLAUDE.md`
  now opens with a 5-step onboarding table, so "keep working on this project"
  is sufficient briefing for a new coder.
- **App identity split** (`mobile/app.config.js`): `development` and local
  `expo start` resolve to Palforge DEV / `com.palandre.hatchlab.dev` /
  `palforge-dev`; `preview` + `production` keep the FAST identity untouched.
  Verified with `expo config` on both profiles, mobile tsc clean. Required a
  rebuild to take effect (new bundle id ⇒ new iOS credentials ⇒ the CEO's
  Apple login) — he ran it the same afternoon; see the coexistence entry below.
- **Single install hub** at `/palforge/install/` (CEO's request — full version
  + live version + Connect to PC + **the website** on one page);
  `/palforge/install-dev/` forwards to it. Live and verified, eye-checked at
  375x812.
- **TWO APPS NOW COEXIST.** CEO ran `BUILD-DEV.cmd` at 15:08; build
  `ccefd7d2` finished 15:11 from commit `4bc1d87`. Proven separate by
  unpacking the `.ipa`: `CFBundleIdentifier com.palandre.hatchlab.dev`,
  display name "Palforge DEV", scheme `palforge-dev`, fingerprint `c9602f41`
  vs the full app's `06b76851`. Install page, warnings and legacy links
  updated; Pages redeployed and re-fetched to confirm.
- **Website black screen FIXED.** `vite.config.ts` defaulted `base` to `'/'`
  while the site is served from `/Sonsofthesilverstream/palforge/`, so
  `index.html` requested `/assets/index-*.js` at the domain root → 404 → no JS,
  blank page. Now defaults to `'./'` (safe: routing is hash-based). Rebuilt and
  redeployed; verified the app boots, renders the Calculator, navigates to
  `#/paldex`, and logs no console errors.
- **Connect-to-PC deep link FIXED.** It used `exp+<scheme>://`, which nothing
  registers — the build registers the bare scheme (`palforge-dev`), the bundle
  id, and `exp+<slug>` (`exp+hatchlab`). Broken since it was first written;
  hidden because pasting the https address works. CEO confirmed the button now
  opens the app.
- **Clarified for the CEO** (he pushed back, rightly): a 15-minute build is
  NOT how updates work. JS/UI/logic ships by OTA in ~2 min; builds are only
  for icon, name, permissions and native modules.

Correction to the entry below: the claim that two installable apps coexist
was **wrong**. Both builds use bundle id `com.palandre.hatchlab` with
identical EAS fingerprints, so iOS treats them as one app — only one can be
installed at a time. Coexistence needs a per-profile bundle id + a rebuild.

## 2026-08-15 — overnight + morning marathon (all shipped, on-device)

Two builds exist (one installable at a time — see the correction above):
**Palforge FAST (preview channel, build 0bd4b937)** and **Palforge DEV
(tunnel, development channel, build 654fe7fb)**. Both carry the new game-accurate
Pal Sphere icon (blue glass + gold swirl + pole caps — CEO rejected two
pokeball-shaped attempts first; reference screenshot drove v3).

Landed since the 08-14 entry (each block: tsc clean, web 64/64 tests,
bundle compile 200, eye-verified on RN-web, committed, OTA'd to BOTH
channels, web deployed):

- CEO-final navigation: side-panel domains, per-domain bottom tabs, Paldex
  center anchor; Map domain is FULLSCREEN by CEO decree (tabs: []).
- Vector-icon chrome everywhere — zero emoji in UI.
- Paldex: compact header, Filter & Sort sheet (rarity/work/stat sorts,
  element+ownership filters), rarity-tinted rows, "Copy my list…" export.
- Smart planning: game-data helper registry (10 pals, partner skills
  verified from the dump — CEO's Grintale + Broncherry claims confirmed),
  Add/Remove-to-plan with exact +N-step costs, catch-instead hints with
  real wild regions, readiness pills with precise gender hints.
- PERF POST-MORTEM: helperAdvice froze the JS thread (measured 4437ms →
  335ms via shared derivations; no recompute on tick). Advice now computes
  WITH the plan (worker-side on web) and persists with it. Negative
  "+-4 steps" fixed via plan-roster snapshots; reshapes keep ticks.
- Info cards: real spawn map (79 regions projected with the game's own
  transforms) + alpha pins; tappable condensation stars (+5%/star,
  wiki-verified); plain-language "how to breed it" copy.
- Aug-12 patch check: 1.0.3 is progression/resources/World Tree — no
  breeding changes; upstream dumps predate it; re-check weekly.

Later on 08-15 (same marathon): condensation stars AND About-the-pal
bubbles shipped on BOTH platforms (272/299 game Paldex texts via wiki.gg,
fetcher hardened after an adversarial review caught 3 markup-junk entries
same day); web got spawn maps, rarity tints, sorting. Open (AI_TODO
ledger): web PalPicker quick filters + side-panel nav, rarity colors from
the game palette research, profile-switch write race, mobile test harness,
27 pals without wiki About text (re-fetch weekly).

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
(2 criticals, 10 should-fixes, 14 minors) fully fixed; 64 vitest tests
green incl. exact 44,851-row oracle replay + symmetry sweep; CI on every
push; installable PWA with full-content-hashed service worker; single-file
build (6.4 MB) published as artifact
(claude.ai/code/artifact/0f571216-dd99-4210-83c7-0a222e2e5756).
Public deploy: **live** at `/palforge/` on main (GitHub Pages), verified
2026-08-15 — plus `/palforge/install/` (FAST) and `/palforge/install-dev/`
(DEV) install pages. Deploys are manual pushes to `main`; no CI does it.

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
