# PROGRESS — audited state, no invented percentages

*Updated 2026-08-17 (breeding lane). Update this file whenever a work block lands;
date every entry.*

## 2026-08-17 overnight->night — THE PAL CARD READ ALOUD END TO END, AND A DAY OF HIS FEEDBACK (breeding lane)

Twenty-eight ledger entries landed and shipped (E100-E127, AI_TODO.md has
the full detail per entry). The shape of the day:

**The overnight run read the app aloud like a player.** The sample box for an
empty Paldex; the planner now BEATS the old Python reference (127 steps vs
152 across twelve boxes); the Calculator, Odds Lab, picker, Settings and the
whole pal card rewritten in a player's words. The pal card audit alone: three
cards used to VANISH when a pal had no data (they now say what our files
list, for exactly the pals affected, counted from the data); 17 partner
effects arrive cut off from the source and 2 carried a raw game variable —
the app now marks the gap honestly instead of pretending; the ABOUT blurb's
"read more" follows the real layout instead of a character count; "many
parent pairs work" became the real number (25 to 1,270 across 183 pals) and
owned pairs past the old scan cap are found; stat ranks verified at every
extreme; the star preview says its ranks compare base stats; the map preview
enlarges IN PLACE with "Back to {name}" instead of dumping him in the Map
fane (his feedback); the two gendered special recipes say "genders as shown"
in words.

**His daytime feedback round, all shipped same-day:** suggestion rows name
BOTH routes (catch level AND breeding steps, or "no breeding route from your
pals yet" — 223 of 299 rows had a hidden second route); pals he already owns
sink to the bottom instead of being recommended; mounts are ranked by the
game's own stat block against distance (his level-80 flying list led with a
280-stat starter; now Shaolong/Shadowbeak/Eidrolon Ignis, and owned Nitewing
went 1st -> 29th of 29); his "best first / closest first" idea is a toggle in
every scored category; his gender-"?" idea is built (tick a pal you caught
but could not identify, filter "Gender to check", one-tap reminder in the
Paldex header) — and his bug report on it fixed same-evening: the mark now
COEXISTS with known genders (per-species flags are aggregates, not answers
to one question) and the header no longer collapses into a one-character
column.

**Honest engineering ledger:** the suggestions sheet's slow first open was
decomposed — 1.0s modal mount + 5.6s reachability fixpoint on the DEV
harness, but the same computation is on record at ~335ms on device, so the
restructure is PARKED pending one real-device measurement (virtualising the
sections bought only 12%; the old "180 tiles" theory was wrong and is
retracted). One publish went out over the map lane's uncommitted tiles —
owned in the ledger, rule tightened (read `git status` in its own command
BEFORE any publish). The test harness's comment-stripper was found swallowing
6,672 chars of source (16 test files fixed — `not.toContain` passes
vacuously against truncated reads).

**State at handoff:** tests 655 passing incl. the 44,851-row oracle, both
trees typecheck, engines + `src/logic/recommend.ts` byte-identical, published
to both channels through E127. Session timers (ScheduleWakeup AND cron) are
registered but not being delivered — a harness fault; work continues on
CEO-message wakes until the session restarts.

## 2026-08-17 overnight->afternoon — THE MAP'S ZOOM CRACKED, AND A NIGHT OF POLISH (map lane)

He went to sleep saying "work while I sleep, for hours. I expect major
improvements" and woke up testing. Fourteen-plus updates went to both channels
overnight; the full detail is AI_TODO.md §M (M1-M31). The short version:

**The zoom snap turned out to be FOUR separate causes, not one.** Each was
real, each is fixed, and the last two came straight from his 13:12
screenshots: (1) the pan re-anchoring against a stale origin during a pinch;
(2) the translation jumping when the finger count changes, because the
gesture library measures from the CENTROID of whatever fingers remain;
(3) lifting two fingers off a pinch reading as a double tap, which
deliberately flies the map; (4) the pinch itself not ending when one finger
lifts (documented library issue #1214) and re-anchoring against a teleported
focal point. If he EVER reports a snap again: the question that discriminates
is whether it happens on a slow single pinch with no re-grip — and every
writer of the map transform has been enumerated and cleared (M27/M28), so the
next place to look is ABOVE the map, not in its formulas.

**The soft pins were a documented Reanimated limitation.** One animated style
was shared across ~115 marker views; the library forbids that — views can
silently stop updating, and a marker with a stale counter-scale draws at the
wrong size, magnified soft. Every marker owns its style now. This could never
show in the browser QA (reanimated runs on the JS thread there), which is why
his phone kept disagreeing with our checks. Falsifier if pins look soft
again: do they CHANGE SIZE while zooming?

**Zoom reach went 3.2x -> 9.6x** on his ask ("chests, small stuff may be
hidden") — measured against the 1,572 chests: over 90% resolve to their own
pin at the new ceiling. The ground past 3.2x magnifies by design; pins,
labels and counts stay crisp at every zoom.

**The map answers "is it even accurate" on the map**: the key now ends with
"Every spot is read from the game's own files — none of it is estimated or
crowd-guessed. Game build 24575149, 12 August 2026." — with a drift guard
that reads the build id out of the generated data so the sentence cannot rot.

**New: your own marks.** Drop a pin with a button (never a gesture — gestures
are what kept biting), name it, rename it, remove it, clear per island;
counted in the pill SEPARATELY from datamined spots, listed in the key,
saved per world (profile-scoping walked both ways, M31). Store is
mobile/src/map/pins.ts on the found.ts pattern, guards proven-to-fail.

**Polish from the blueprint's own AAA checklist** (all 15 criteria now
audited): fuzzy search that rescues typos ("foxpraks" -> "Did you mean
Foxparks") and refuses to guess at garbage; the first-run hint teaches "only
pals I'm missing" once there is a box to filter; Reduce Motion respected on
all nine map animations; haptics on all five state changes; Dynamic Type
already passed.

**His asks that closed with an honest NO:** in-game photos of locations have
no source (the game ships none; community screenshots fail licensing and
provenance) — the one provable substitute is a map-texture crop, parked for
his call. Search-by-zone is not being built: region data is label points,
so zone assignment would be an estimate, and this map does not estimate.

Working agreement notes that paid off repeatedly tonight, written into the
ledger as rules: prove a new guard can fail; a comment is a claim; when you
change a constant, grep everything keyed to it; when you add a new KIND of
thing to the map, grep everything that counts what is on it; confirm the
state before calling something a defect (seven wrong calls tonight, all
caught before shipping); and the browser cannot prove native behaviour.

## 2026-08-17 — CEO PUTS THE WEBSITE ON HOLD; PHONE APP ONLY

His words: *"I want full focus on app only. Put website on hold. We can port
app better when we are further along... We focus on app for a long while only
so we don't have to do double work before we are happy with results."*

The reasoning is his and it is sound: the phone app is still changing shape,
so every port is work done twice. We port ONCE, later.

**What this changes:** all build work happens in `palworld-breeding/mobile/`.
Nothing is ported to `app/`. Web-only findings are logged to the WEB BACKLOG
in `AI_TODO.md` rather than fixed.

**What it does NOT change:** the web test suite stays a required gate — it
owns the 44,851-row oracle replay and the engine/logic parity gates, and those
guard the PHONE. The website itself keeps working; it is frozen, not
abandoned. Everything already committed for the web (through E84) stays
committed and undeployed.

**State at the freeze:** web committed through E84, never deployed (that was
always the CEO's push to `main`). Mobile published through the E77 commit.
Tests 372 green + 1 expected fail, 22 files; both trees `tsc --noEmit` clean.

## 2026-08-16 — THE BREEDING FANE: HIS FEEDBACK ROUND, THEN A HUNT FOR
## THINGS THE APP SAID THAT WERE NOT TRUE (breeding lane)

Two halves. The first built what he asked for. The second went looking for
lies, on the theory that **any absolute sentence in the app is a claim that
can be tested against the game data** — run it in Python against
`public/data/*.json` and see whether it holds. It kept paying: not one of the
things below was findable by clicking around.

Gates at the end of this block: **278 vitest passing, 18 files** (includes the
44,851-row oracle replay, unchanged), both trees `tsc --noEmit` clean.
Everything mobile is published to BOTH channels. Web is committed but NOT
deployed — that needs the CEO's push to `main`.

**What he asked for, built (his feedback round, ledger items in `AI_TODO.md`).**
Suggestions can be un-added again — the goal list moved into the store so it
survives a tab switch, and both the sheet and the goal chips can remove.
Each save profile carries a player level, and suggestions respect it. The
recommendation engine became one shared brain in `src/logic/recommend.ts`
mirrored across both trees, scoring a pal by how good it is AND how far away
it is, so his own example holds: six kindling one breed away beats seven
kindling 83 breeds away. Suggested Goals became one card system with a
full-screen browser per category — no more horizontal scrolling in tiny
windows — and the plan targets became a proper tray with one-tap remove.

**The app was hiding real breeding recipes.** Mossanda Lux is Grizzbolt +
Mossanda; Relaxaurus Lux is Relaxaurus + Sparkit. Both are in the game files.
The Calculator refused to show them, the pal card's own recipe list hid them
behind a wrong condition, the Plan tab flagged them with a warning triangle
saying they could not be bred, and the website's card hid them AND the "all
parent pairs" button. **The same mistake in four places, one per screen** —
which is why every finding now gets run back through both trees before it is
called fixed. These two are the only species of their kind, so nothing else
was affected.

**Truncated lists were presenting themselves as complete.** The catch hint
showed three places and stopped, for 199 of 299 pals. "Legend is native to"
showed three of six. The unlock advisor's "where to catch it" did the same
for 165 of 299. All of them now say how many more there are. A shortened list
is only honest if it admits it is shortened.

**The pal card's stat bars were wrong twice.** They were drawn against a
ceiling of 150 that appears nowhere in the game — the real maximum is 200 —
so fifteen pals were painted as maxed when they are not, and everyone else's
bar ran a third long. And "#132 of 299" implied a precision the data cannot
support: there are only about twenty distinct values per stat, so 121 pals
share exactly 100 attack and every one of them printed that same rank. It now
says how many pals share the spot.

**Two pals that make eggs arrive faster were mined and never shown.** Braloha
speeds egg production at the Breeding Farm by 20~50%; Dynamoff cuts
incubation by 20~40%. The Odds Lab counts eggs on every tab and had never
mentioned either. Both platforms now name them, in the game's own words. The
same sweep deleted "work speed 0" from 298 of 299 pal cards — the value is
zero for every species, and next to a list of jobs it read as "cannot work".

**Things checked and found honest, so nobody re-checks them:** the catchable
flag and region lists agree perfectly across all 299 species; the advisor
refuses to invent a location for the 13 legendaries that have a spawn level
but no recorded regions; every stat rank the card prints matches the data;
all 116 pool-excluded species do have a route. Honest "no bug here" was the
answer five times, and that is recorded too.

**My own errors this block, kept on the record:** fifteen of my checks were
themselves the broken thing — a lowercase search for uppercased badges, a
value read from the wrong file, reading a sheet's contents while it was
closed. The habit that catches them is checking where a number actually comes
from before trusting it. I also slowed my own work loop on my own judgement
and he noticed immediately; it is back at its normal cadence and stays there.

## 2026-08-16 ~22:45 — THE MAP FANE, A FULL DAY OF HIS FEEDBACK (map lane)

Everything below came from the CEO looking at his phone and telling me what
was wrong. Each item is what changed **for him**, with the number that proves
it. Gates at this block: **278 vitest** (up from 114) and mobile
`tsc --noEmit` clean. All shipped OTA to both channels.

**The map is drawn from the game's full-size picture now.** He said it looked
like "380 quality.. not crisp 4K". He was right twice over. First our texture
was 4096 while his phone draws 3 real pixels per layout pixel, so full zoom was
a 3x upscale — fixed by finding the game's native 8192 T_WorldMap
(`jeankassio/PalMiniMap`, MIT) and adding a z4 tile level, +2.7 MB bundled.
Verified it is the SAME map before building on it: downscaled to 4096 it
differs from the copy we already trusted by 1.57/255 mean, i.e. compression
noise. Then he said it was STILL blurry — and it was, because the renderer
picked its tile level from layout pixels, so those new z4 tiles were built and
**never once requested**: a flat 2.00x upscale on every phone. Level now comes
from `scale * PixelRatio.get()`. The World Tree stays at 4096; no larger export
of it exists in any source I could find, and its zoom ceiling says so.

**Zoom stopped fighting him.** Three separate faults: pan and pinch both wrote
the map position every frame from different maths; the pinch anchored on the
LIVE focal point, which cancels out and kills two-finger dragging; and lifting
two fingers off a pinch could be read as a DOUBLE TAP, whose handler animates
the map to a new centre — that was the "snaps to a different place when I
release fingers". After shipping two gesture fixes I could not verify, the
arithmetic was extracted to `mobile/src/map/gesture.ts` and driven by 11 tests:
focal invariance under spread and under spread+slide, zoom bounds, a 400-step
fuzz, and the snap **measured** (corrected origin lands exactly; the old one
lands >100 px away). The handlers INLINE that maths — importing into a
Reanimated worklet crashed this app twice — and tests pin the copies together.

**A pin now tells you what it is.** Bosses and spawns show the pal's own face
instead of a crown or a paw print; eight POI symbols were replaced with the
game's own at 64-100 px (up from 14-46 px), and **two candidates were rejected**
on a side-by-side render because they did not mean the same thing. Colour says
which pal, shape says where and when. With eight layers on, pin overlap was
measured at 64 bad pairs of 130 pins and cut to 10 by giving each layer its own
cluster grid phase — no pin is ever moved off its real spot to make room.

**Finding things works like the rest of the app.** The map search now imports
the Paldex's own filter engine and sheet, so all 12 jobs, 9 elements, 4
ownership states and 7 sort orders arrived at once. Typing "sulfur" finds the
Sulfur layer (261 nodes) instead of answering "no pal by that name". Level-cap
chips answer "what can I catch at my level" — a filter that had been plumbed
through the engine for weeks with no control attached.

**A boss that exists in the game was missing from the map.** Sweeping our
bounds against all 68,707 raw spawn rows found exactly ONE on the wrong map:
the Lv 55 Alpha Dualith, filed under the World Tree with Palpagos coordinates.
It failed projection and was silently dropped. Two independent signals settle
it (its coordinates only fit Palpagos; pal-atlas lists the same spawner there),
so the extractor now corrects the LABEL, never the position, prints every
correction it makes, and still drops anything that fits neither region.

**Process, after two incidents.** `mobile/scripts/publish.js` refuses to
publish from a dirty tree and re-checks afterwards, because a printed
`git status` is not a gate and a bundle takes 30 seconds during which the other
session can save a file. Both incidents are self-reported in `AI_TODO.md`.

Still open: H17 colour-by-group for the 23 POI layers (it changes how the whole
map reads and he judges by looking, so it waits until he can look); K7 the
sharpness cap cut max zoom from ~9.6x to ~3.2x of the opening view on a 3x
phone — the honest middle if he wants more reach is allowing a 1.5x upscale.

## 2026-08-15 ~23:25 — THE MAP FANE IS REAL (second worker, map lane)

The Map domain stopped being a coming-soon screen. It is now a fullscreen,
pannable, pinchable map built on the game's own map texture, with 23 layers of
points of interest and every species' real spawn area.

**What the CEO gets:** the whole world at 4× the resolution we had, statues /
towers / dungeons / chests / ore / eggs / alphas each in their own colour,
and a pal search that can be narrowed to *only the pals he is missing*. Level
band and day/night come with every species. It ships **over the air** — no new
native module, so no reinstall.

**The numbers, all checked:** 68,617 wild spawn points across 250 species and
11,097 points of interest, from `Awy64/palworld-atlas-data` build `24575149`
(a CI runner that extracts the OFFICIAL dedicated-server package — and is
*newer* than our kb/palcalc clones, being past the Aug-12 1.0.3 patch) plus
`Nifrendil/pal-atlas` POI layers. Both MIT.

**The projection was a real trap, and it was proved rather than assumed.** Two
candidate world→image transforms disagreed by up to ~20 px at 4096 — the
difference between a pin on a beach and a pin in the sea. `tools/
verify_map_projection.py` settles it on the game's own `DT_WorldMapUIData`:
both world regions are *exactly* square (matching square textures) where
palcalc's fitted matrix is 8,711 uu out of square; it wins a 58,504-point
land-fit test; the residual is bounded at 6 px of 4096 (1.5 px at display
size); and a second upstream's land-locked layers land 96–100% within 6 px of
land. All 79,714 points project inside bounds with zero exceptions.

**Two upstream defects found by cross-checking**, both handled in the open:
115 Pengullet rows carry `LvMin 35 > LvMax 34` in the *game's own* spawner
table (re-ordered, and counted on every extractor run), and "Snock Terra" is a
name synthesised from an id suffix — the 1.0 game name is "Snock Lux".

Also shipped: `scripts/qa-shot.js`, a CDP visual-QA driver, plus a
`#domain/tab` hash route on the web build. The standing order is to look at
every change with your own eyes, and until now the RN-web QA build had no way
to reach a screen or press a button from outside.

Gates at this block: **114 vitest** (22 new map tests incl. a byte-parity gate
over the three shared map modules) and mobile `tsc --noEmit` clean. QA server
stopped. **Not yet published** — the Breeding session has uncommitted work in
the tree, and `eas update` bundles whatever is on disk.

Still open in the map lane (ledgered as F10–F17): web map UI, rebuilding the
pal-card map on this engine, marker detail cards, found-tracking, region
labels, and an on-device pass.

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

Baseline gates at HEAD `fdb4789` re-run at intake: 79/79 vitest, mobile
tsc clean.

## 2026-08-15 ~23:00 — E-round SHIPPED: the Plan tab's feedback round, end to end

All twelve E-items landed the same evening, each committed, gated and
OTA'd to both channels on its own (62df595, c73cc1f, 3ba2783, 32bebc9,
93d4135). What the CEO gets:

- **Un-add works everywhere** — the goal list lives in the store; − on
  every added chip, bulk Remove-N, per-row add/remove, and the list
  survives tab switches (regression test locks the old resurrect bug).
- **Player level per save profile** — Profiles screen or the "Tuned
  to…" line in Suggested goals; eye-verified hard cutoff (level 12 cut
  catch suggestions 57→31, max CATCH LV exactly 12).
- **One recommendation brain** (src/logic/recommend.ts, byte-identical
  both platforms, own CI parity gate): every label explains itself
  (bare ENDGAME is dead), long breeding routes yield to in-reach
  catches, the kindling quality-vs-closeness example is a literal unit
  test, and the expensive reachability pass is cached and shared with
  the planner — the whole vitest suite got 5× faster as a side effect.
- **Suggested goals v4** — all 30 categories through one card system;
  tap any category for a full-screen browser (big rows, real work
  icons — the m7/t7 codes are dead — verbatim game effects, plain-words
  how-to-get-it lines, RECOMMENDED tags, search, add/remove per row).
  Zero horizontal scrolling, grep-proven. New Catching helpers section
  (6 capture pals, mined verbatim; a "player movement speed" role was
  researched and honestly rejected — it does not exist in the data).
- **Goal tray v2** — pal cards with icons and real remove targets,
  Remove-all behind a confirm, folds to one line once the plan runs.

Gates at close: 91/91 vitest (12 new tests incl. logic-parity), mobile
tsc clean, web build clean; every UI change eye-walked on the QA
instance (killed after each pass). Deferred by CEO directive (E13, one
tab at a time): E2 return-navigation — it is Paldex-tab work. The Plan
tab lane continues: polish passes, micro-QoL, smarter engine iterations
until his sign-off.

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
