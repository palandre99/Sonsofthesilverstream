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

## 5. Honest limits recorded up front

- The capture-rate formula and any drop-RATE percentages are NOT in the
  atlas tables; they ship only if datamined elsewhere or labelled
  community-measured.
- paldb page coverage may be incomplete for some of the 1,892 (the boss
  sweep saw absent pages); refusals are reported and counted, never
  papered over.
- The map lane owns chest/dungeon POI data; Phase E consumes their
  extracts read-only.
