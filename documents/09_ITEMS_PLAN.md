# THE ITEMS FANE — research findings and the build plan

*Created 2026-08-18 on the CEO's order: "begin the big work of the new fane.
Items/weapons and so on. Basically amazing every item and thing in the game.
Massive task must be done perfect. Deep research first then make the good
plan and get to work." Breeding is DONE PENDING CEO REVIEW (E100–E141).*

The bar is the breeding fane's bar: **every number datamined with recorded
provenance or explicitly labelled community-measured; copy in a player's
words; read-alouds and storm tests before "done"; published to the phone the
moment each piece is finished.**

## 1. What the research found (2026-08-18, all probed first-hand)

**Backbone — Awy64/palworld-atlas-data** (already this project's location
authority; build-pinned 24575149, schema-validated, MIT):
- `items/index.json`: **1,892 items** with the game's own `name` and
  `description` (from DT_ItemNameText/DT_ItemDescriptionText, 1,994/1,924
  rows), plus `category`, `subcategory`, `rarity`, `rank`, `maxStack`,
  `weight`, `price`, `icon`. Raw source table DT_ItemDataTable is 2,466 rows
  (the extractor filters unshipped rows).
- What the atlas does NOT publish: weapon/armor combat stats, durability,
  magazine size, sphere capture power, recipes, technology levels, drop and
  schematic sources.

**Stats + recipes + sources — paldb.cc** (this project's trusted game-table
mirror; already sources the breeding table, Paldex text, saddle levels, boss
rows, partner effects):
- Per-item pages carry the **full raw parameter card** (probed on
  Assault_Rifle: Attack 320, Durability 3000, MagazineSize 20, Weight,
  price, rank…) **including the per-rarity variants on one page** (Common →
  Legendary, each with its own Attack/price).
- Pages also carry **Recipe** (materials + counts), **Technology** (unlock
  level), **Schematic** listings and **Treasure Box** sources.
- Parsing note from the probe: the raw-card row parser must be
  per-SECTION — adjacent tables (crafting stations) bleed into a naive
  row split.

**Validation doctrine (the CombiRank trick, itemised):** a paldb item row is
accepted only when its identity fields (name + rank + price) match the
atlas backbone row for the same item id. A mismatch is refused and reported,
never shipped. Recipes must close over known item ids.

## 2. The data pipeline (Phase 0 — build first)

New tools, one per concern, each rerunnable after a patch:
1. `tools/fetch_items_index.py` — atlas index → `data/items_1_0.json`
   (backbone; provenance + build id recorded in the file header).
2. `tools/fetch_item_params.py` — paldb raw cards for stat-carrying
   categories (weapons, armor, spheres, accessories, ammo, consumables
   with effects) → merged per-rarity variant rows, atlas-validated.
3. `tools/fetch_item_recipes.py` — paldb Recipe + Technology + sources →
   `data/recipes_1_0.json`; every ingredient id must exist in the backbone.
4. Icons: resolve the atlas `icon` names against the game-dump icon
   pipeline already used for pals; missing icons ship as a designed
   placeholder, never a broken image.
5. `verification.json` claims per layer, with method and counts.

Data copies follow the pals_1_0 pattern (canonical `data/` + `mobile/src/
data/` + `app/public/data/`), moved together always — the E139 divergence
lesson is law.

## 3. Product build order (each phase shippable + published)

- **Phase A — the Items index screen** (replaces the coming-soon landing):
  every item searchable, filter by category/rarity, each row icon + name +
  rarity tint + weight/price, tapping opens an item card with the game's
  own description and every known fact. Wide and instantly useful.
- **Phase B — Weapons tab**: per-class tables (rifles, bows, spears…)
  ranked by attack as the registry promises, per-rarity variant rows,
  durability/magazine/ammo, recipe + tech level on every card.
- **Phase C — Armor tab**: defense/HP tables, per-rarity variants, set
  groupings, crafting costs.
- **Phase D — Spheres tab**: capture-sphere table (power, cost, tech);
  the capture-rate CALCULATOR only if the capture formula can be datamined
  or clearly labelled community-measured — never invented.
- **Phase E — Schematics tab**: per-item tier lists and where each drops
  (dungeon chests, treasure boxes), cross-validated against the map lane's
  chest data where ids overlap.
- **Phase F — cross-links**: pal drops ↔ items both ways (pals_1_0 already
  carries `drops[]` — reverse-index "which pals drop this"), item cards
  linked from the Paldex and the breeding helper cards (cake ingredients
  become tappable).
- The domain's Paldex center tab stays the shared anchor, untouched.

## 4. Gates and guards

- New `app/tests/items-data.test.ts` family: unique ids, categories
  enumerated, every recipe ingredient resolves, per-rarity variant counts
  pinned, atlas↔paldb cross-validation totals pinned, name/description
  non-empty rates pinned.
- Screen copy gets the same read-aloud + counted-label discipline as
  breeding (E103–E127 methods).
- All existing gates stay mandatory (oracle, parity, mobile tsc, app
  build); publishing ritual unchanged.

## 4b. Second research pass (2026-08-18 late, new session — all probed first-hand)

**The CEO's widened order, verbatim:** "Crafting often requires lvl and
technology pts etc also. Everything should be here. A proper proper info for
every single item in the game, perfectly organized and so on, u may have to
change the tab layout a lot to make it work." And: "i think maybe paldex
doesnt belong here idk", "every item needs an image also", "NEVER guess."

**Findings that upgrade the pipeline:**

- **Item pages carry far more than recipes.** Header chips hold Attack per
  tier, Technology level, Capture Power (spheres!), Nutrition / SAN / Work
  Speed / Recovery Time (food) — a generic `[label, value]` capture gets all
  of it raw. Titled card tables hold Dropped By (pal, qty, probability),
  Treasure Box (source, map, qty, DROP RATE %), merchant shops, Production
  and Research rows. One sweep (`tools/fetch_item_pages.py`) captures
  everything per page; `fetch_item_recipes.py` is retired into it.
- **`/en/Technologies` is server-rendered and complete**: 588 nodes, each
  with level (1–80), POINT COST badge and the BossTechnology class marking
  Ancient Technology (51). Node ids join EXACTLY to the Technology ids item
  pages carry. Captured by `tools/fetch_tech_tree.py`.
- **The two failed recipe sweeps explained**: run 1 was the block-regex bug
  (fixed and proven on Cake 5/8/7/8/2); run 2 died with its session before
  writing output. The 173 slug errors were encoding (é, ':', '[') — fixed
  with full percent-encoding, all three failure classes probed to 200.
- **The atlas publishes nothing beyond items/index.json** (verified via the
  GitHub API against build 24575149) — paldb remains the stats/recipes/tech
  source, exact-identity-validated against the atlas backbone as before.
- **paldb throttles parallel sweeps** — the icon and page sweeps degraded
  each other (icon misses 16→37, page errors 3→15 in the overlap window).
  Run sweeps one at a time; the icon fetch caches per-icon and resumes.

**The tab decision (under the CEO's layout freedom):** the Items domain is
the one exception to the Paldex-center law — its center anchor is the full
item index itself. Tabs: Weapons / Armor / **Items** (everything) / Food /
Spheres, every tab the same index opened on its group. Paldex leaves this
domain only. Schematics become a chip + item-card sections. Groups went
subcategory-aware so skill fruits (93), pal gear (138), eggs (53), meds and
spheres stopped hiding inside Consume/Essential/Material — the 15 groups
partition all 1,892 items exactly once, pinned by test.

**Phase E note (probed 2026-08-18 late):** `/en/Schematic` (2.2MB) and
`/en/Loots` (5.4MB) are fully server-rendered list pages in a different
markup (no h5/table structure — card grids). Rich cross-check targets for
the schematic/drop phase; need their own parser when that phase opens.

## 6. ONE SEARCH FOR EVERYTHING — design notes for the CEO (IL8, 2026-08-19)

*The AAA bar (blueprint §5, criterion 2) is "search from anywhere in ≤1
tap, unified index". Today each fane searches only itself: the Paldex
finds pals, the Items tab finds items. Nothing finds "Anubis" AND
"Anubis's Talisman" in one box. This is the design, ready to build the
moment you pick a placement — nothing here is started yet.*

**What one search would cover (all data already on the phone):**
299 pals · 1,892 items · the app's own screens ("breeding calculator",
"tower bosses") · later bosses/raids by name. Typing "cake" would show:
the item Cake (and the other 5 cakes), pals that drop cakes, and the
breeding screens where cake math lives. Every hit opens the right card
in the right fane via the NavIntent system that already carries pal and
item payloads.

**Placement options:**
- **A. A search button in the top bar, everywhere** (recommended). One
  tap from any screen, opens a full-screen search with mixed results
  grouped by kind (Pals / Items / Screens). This is Dododex's
  omnipresent-header pattern and the literal reading of criterion 2.
  Cost: a shared overlay + result routing, ~1 tick.
- **B. Widen the Paldex search** to also return items. Cheapest, but it
  buries "everything" inside one tab of one domain and muddies the
  Paldex's own job. Not recommended.
- **C. A Search tab in the side panel.** Clean but two taps from most
  places, and the side panel is CEO-final architecture — touching it
  needs your call anyway.

**Your call needed:** pick A, B, C, or a different shape. On a go for A,
the build is: one SearchOverlay component + a merged index (name +
kind words, the token matching the Items search already uses) + result
rows reusing PalIcon/ItemIcon + NavIntent routing. No data work needed.

## 7. THE PATCH-DAY RITUAL — the items data refresh, end to end (IL9)

*Run after any game patch, in this order; every step validates before it
writes and the gates catch anything that moved. All from
`palworld-breeding/`:*

```bash
python tools/fetch_items_index.py          # atlas backbone (bump BUILD pin first)
python tools/fetch_item_params.py          # paldb raw stat cards
python tools/gen_item_stats.py             # -> item_stats_1_0.json (3 copies)
python tools/fetch_item_pages.py           # full page sweep (~30 min)
python tools/fetch_item_pages.py --retry-errors   # errata pass for stragglers
python tools/fetch_tech_tree.py            # /en/Technologies (588 nodes)
python tools/fetch_item_icons.py           # icons -> webp sheets (cached, fast)
python tools/gen_item_facts.py             # validating merge -> item_facts (3 copies)
cd app && npx vitest run                   # every pin must stay green
```

Rules that keep it honest: sweeps run ONE at a time (paldb throttles
parallel runs); the BUILD pin in fetch_items_index.py moves only after
the atlas publishes the new build; count changes surface in the pinned
tests — read the new truth from the runners, update pins deliberately,
never loosen a zero-refusal expectation to make a run pass.

**STEP: say what changed (added 2026-08-20).** Between regenerating the
facts and committing, capture the PREVIOUS data and generate the change
list, or the app will keep saying what it said last refresh:

```bash
git show HEAD:palworld-breeding/data/item_facts_1_0.json > /tmp/prev_facts.json
cd palworld-breeding && python tools/gen_item_facts.py
python tools/gen_data_changes.py --previous /tmp/prev_facts.json   --label "<what this refresh was, in the CEO's words>"
```

It writes `mobile/src/data/dataChanges.g.ts`, which the Reference screen
renders under "What changed in the data" — reachable from the data stamp
on every screen. Every line is a diff between two files we hold.

## 5. Honest limits recorded up front

- The capture-rate formula and any drop-RATE percentages are NOT in the
  atlas tables; they ship only if datamined elsewhere or labelled
  community-measured.
- paldb page coverage may be incomplete for some of the 1,892 (the boss
  sweep saw absent pages); refusals are reported and counted, never
  papered over.
- The map lane owns chest/dungeon POI data; Phase E consumes their
  extracts read-only.
