# THE BOSSES & RAIDS FANE — research findings and the build plan

*Created 2026-08-18 on the CEO's order: start the Bosses & Raids fane. "All
raids and bosses, what is strong against what, potential special attacks,
info card of the bosses, map location, which pals are strong against it
pulling from Paldex, recommended pals to catch/breed for the tower and how
to, clean 'where to catch' / 'create breeding plan' buttons, recommended
level, weighing what you already have… 10/10 masterpiece quality AAA studio
level is minimum." Runs parallel to the Items lane; Breeding stays DONE
pending CEO review.*

The bar is the breeding fane's bar: **every number datamined with recorded
provenance or explicitly labelled community-measured; copy in a player's
words; read-alouds and eye-verification before "done"; published to the
phone the moment each piece is finished.**

## 1. What the research found (2026-08-18, probed first-hand)

**The game's boss content (re-derived from data during build, never from
guides):**
- **9 tower bosses** in 1.0 (Zoe & Grizzbolt Lv10 → Zenara & Astralym
  Lv80), each with a Hard Mode; 5-minute fight timer; not catchable. Our
  map already has all 9 tower spots exact.
- **Raid bosses:** our OWN shipped `items_1_0.json` carries all 18 slab
  items — Bellanoir, Bellanoir Libero, Blazamut Ryu, Hartalis, Xenolord,
  plus Ultra variants. The roster ships from that + the RAID_ parameter
  rows, not from any wiki. (The ledger's "Panthalus raid-only" note gets
  settled by the data during build.)
- **Alphas:** 205 titled bosses already in `alpha_stats_1_0.json` with
  HP/atk/def/size/capture ×0.7/fight multipliers, validated by the
  CombiRank trick (E133). 91 placed (map pins live), 116 dungeon
  end-bosses.
- **Element chart:** 2× weakness / 0.5× resist, dual-element stacking,
  same-element +20% skill bonus. Small fixed table (9 elements),
  datamineable; **not yet in our data — the one new dataset the whole fane
  leans on.**
- **Tower/raid raw rows exist upstream:** paldb.cc publishes the GYM_ rows
  of DT_PalMonsterParameter (probed GYM_ElecPanda: HP 5100–6360, element,
  IsTowerBoss flag) — the same table family `fetch_alpha_stats.py` already
  parses. RAID_ rows likewise. Boss-variant movesets are on the same pages.
- **Alpha respawn:** community consensus ~1 real-time hour, varies with
  server day-length settings. Ships ONLY as labelled community-measured,
  variance stated.

**The competition, and the opening:**
- Game8/IGN-class guides: level + location + weakness, but no stats, no
  per-boss recommended pals, no owned-anything, no tracking. Static.
- paldb.cc: has the raw rows, zero experience layer, hostile on a phone.
- Dododex: the fixed detail-page anatomy (calculator-first, rank context)
  is the card blueprint — but even Dododex has no "your best counters".
- **Pokebattler (Pokémon GO) — the killer pattern:** raid counters
  re-ranked from YOUR box. No Palworld tool does this. Our box + planner
  means we do it provably AND answer "how do I GET the counter I lack" —
  which not even Pokebattler can.
- Paltopia reviews ask for boss check-offs that grey out when done;
  MapGenie proved found-tracking; MHW Companion proved fight-prep tables.
- **Verdict:** nobody combines datamined boss facts + counters +
  owned-roster ranking + prep + tracking in one surface. This fane is the
  category's Pokebattler and its Dododex boss page at once.

## 2. Tab organization (keeps the CEO-seen registry: Tower / Alphas / Paldex / Raids / Teams)

- **Tower** — the flagship, first tab. The 9-tower campaign in order:
  portrait, names, level vs YOUR level, element + weakness chips, beaten
  ticks (Normal + Hard). "Your next tower" header ("You're level 43 —
  next up: Marcus & Faleris, level 45"). Tap → the Boss Card.
- **Alphas** — all 205+ as a Paldex-grade browse: search, filters
  (region / level band / element / overworld-sealed-dungeon / beaten /
  caught), level-sorted. Respawn note (community-labelled). Beaten AND
  caught ticks. Tap → the Boss Card (alpha flavor).
- **Paldex** — the shared center anchor, untouched.
- **Raids** — roster from our own data; summoning chain as a prep
  checklist (altar tech level, slab = 4 fragments, item cross-links); the
  fight (10-min timer, stats, base-destruction warning); rewards; Ultra
  variant as a toggle on the same card, never a second entry.
- **Teams** — your squad vs anything: pick a boss or element → owned pals
  ranked; element-coverage matrix of the box; every gap ends in
  catch/breed suggestion rows. Same shared logic as the card, wider lens.

## 3. The Boss Card — one fixed anatomy for every boss

1. **Header:** real portrait, title + name, level chip with rank context
   vs the player, element chips.
2. **Are you ready?** (calculator-first): verdict line, then **Your best
   pals for this fight** — owned first (Pokebattler pattern), each row
   with the why ("Ground hits its Electric for double"); non-owned
   suggestions carry the existing attain labels (CATCH LV X / BREED N
   STEPS) with **Where to catch** → pal card and **Create breeding plan**
   → planner via `navigateTo`, ranked by cheapness from the box
   (genderGap pattern).
3. **The fight:** datamined stats in the `bossLine` voice; its attacks —
   the boss variant's datamined moveset with element + "your resist"
   hint; Hard Mode numbers behind a toggle on tower cards. Honest gaps
   stated.
4. **Where:** map preview enlarged in place (reuse `PalMap`'s enlarge +
   "Open full map" with the boss ring), coordinates read-only from the
   map lane's data.
5. **Winning gets you:** drops / first-clear rewards, datamined or
   labelled; "can this be caught?" answered plainly.
6. **Your record:** Beaten (Normal/Hard) / Caught ticks per save profile,
   greying the list rows.

## 4. The counter model — provable, no invented numbers

New shared `src/logic/counters.ts` (byte-identical both trees, covered by
the logic-parity gate + its own tests):
- **Offense:** best multiplier of the candidate's own element(s) vs the
  boss's element(s), from the datamined chart. The modelling choice (rank
  by the pal's own elements — its kit and same-element bonus live there)
  is stated in-app in a player's words.
- **Defense:** the boss's OWN datamined attack elements vs the
  candidate's resists.
- **Stats:** base attack/HP with the existing rank-context machinery.
- **Attainability:** owned first; then `recommend.ts` attain scoring
  (catch level vs profile playerLevel, breeding distance from the box).
- Weights documented in the module header; literal example tests pin
  behaviour (the kindling-test pattern).

## 5. The data pipeline (Phase 0 — build first)

One tool per concern, rerunnable after a patch, provenance in every file
header, claims in `verification.json`, canonical `data/` + both tree
copies moved together (E139 law):
1. `tools/fetch_element_chart.py` → `data/elements_1_0.json`. Datamine
   first; if only wiki-mirrored, ship labelled wiki-measured AND
   cross-check two independent mirrors, both recorded. The +20%
   same-element bonus ships only if found in data.
2. `tools/fetch_tower_raid_stats.py` → `data/tower_raid_1_0.json`: GYM_
   and RAID_ rows via the proven per-page method. No CombiRank anchor
   exists for these rows, so identity is cross-checked on element +
   level + name against a second source; refusals reported and counted.
   Hard Mode rows if the table carries them, else the card says so.
3. `tools/fetch_boss_movesets.py` → boss-variant active skills (name,
   element, power), each skill resolving against a skills index or
   refused.
4. Tower metadata: locations read-only from the map lane's extracts;
   story-gating notes labelled community where not datamined.
5. Raid metadata: slab/fragment/altar chain — ids resolve against
   `items_1_0.json`; recipes from the Items lane's pipeline when it
   lands (coordinate, don't duplicate).
6. Respawn timers: ONE community-measured constant with variance and
   source, labelled in the UI exactly as such.

## 6. Product build order (each phase shippable + published + eye-verified)

- **Phase A — Tower tab + the Boss Card** (campaign list, full anatomy,
  counter block, map preview, Normal/Hard tracking on the found.ts
  pattern). Phase-A bar: instantly the best tower guide in existence.
- **Phase B — Alphas tab** (browse + filters + tracking + respawn note).
- **Phase C — Raids tab** (roster, prep checklist, fight + Ultra toggle,
  rewards).
- **Phase D — Teams tab** (coverage matrix, ranked squads, gap rows;
  saved-squad editor deliberately deferred, logged).
- **Phase E — cross-links** (pal cards gain strong/weak chips; NavIntent
  payload extension; map-side "Prep this fight" requested via the ledger
  — the map lane owns their card; Suggested Goals fighting → Teams).

## 7. Gates and guards

- New `app/tests/` families: `elements.test.ts` (chart pinned
  cell-by-cell vs both recorded sources, dual-element math),
  `counters.test.ts` (literal example fights), `boss-data.test.ts` (row
  counts pinned, every moveset skill resolves, every slab id resolves,
  validation totals pinned).
- All existing gates stay mandatory; read the test count from the runner.
- Every screen eye-verified on the RN-web QA instance (killed after);
  publish ritual after each phase, both channels, publish.js guard
  respected — queue behind any lane with work in flight.
- Copy discipline: no jargon, numbers carry context, counted labels,
  read-aloud pass before "done".

## 8. Honest limits recorded up front

- The ranking models element math + stats; it does NOT simulate fights —
  no DPS claims, no time-to-win. We say what we rank by instead of
  pretending.
- Passives, condensation and IVs are ignored by the v1 ranking — stated
  in the module and, where it matters, in the UI copy.
- Hard Mode stats, story gating, respawn timers: datamined if present,
  labelled community/wiki-measured if not, never silently invented.
- Box entries carry no per-pal level, so "fits your level" means catch
  level and breeding distance vs profile level — the same honest basis
  recommend.ts uses everywhere else.
