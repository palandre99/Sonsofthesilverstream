/** The Items fane's data access — typed, pure, importable by tests.
 *
 * Sources (documents/09_ITEMS_PLAN.md): items_1_0.json is the atlas
 * backbone (all 1,892 items, build 24575149, the game's own names and
 * descriptions; 354 rarity-variant names inherited from their families,
 * flagged nameFromBase). item_stats_1_0.json is the paldb raw-card layer,
 * shipped only at exact identity (card Code == backbone id).
 *
 * TIER WORDS: the numeric backbone rarity maps to the game's own tier
 * naming with zero exceptions across all 604 stat cards (measured
 * 2026-08-18: 0=Common 207, 1=Uncommon 99, 2=Rare 132, 3=Epic 143,
 * 4=Legendary 121) — so the word is applied catalogue-wide and the test
 * pins the mapping against the shipped cards.
 */
import itemsJson from './data/items_1_0.json';
import statsJson from './data/item_stats_1_0.json';
import palsJson from './data/pals_1_0.json';
import passivesJson from './data/passives_1_0.json';
import { ITEM_FACTS, type CraftRow } from './itemFacts';

export interface ItemInfo {
  name: string;
  description: string;
  category: string | null;
  subcategory: string | null;
  rarity: number | null;
  rank: number | null;
  maxStack: number | null;
  weight: number | null;
  price: number | null;
  icon: string | null;
  nameFromBase?: boolean;
  descriptionFromBase?: boolean;
}

export interface ItemStats {
  tier?: string;
  atk?: number;
  durability?: number;
  magazine?: number;
  def?: number;
  hp?: number;
  shield?: number;
  sneak?: number;
  passives?: string[];
}

export const ITEMS = (itemsJson as unknown as {
  build: string; count: number; items: Record<string, ItemInfo>;
}).items;
export const ITEMS_BUILD = (itemsJson as unknown as { build: string }).build;
export const ITEM_STATS = (statsJson as unknown as {
  stats: Record<string, ItemStats>;
}).stats;

export const ITEM_IDS = Object.keys(ITEMS);

/** rarity number -> the game's tier word (see module doc for the proof) */
export const TIER_WORDS = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'] as const;
export const tierWord = (rarity: number | null): string =>
  rarity != null && rarity >= 0 && rarity < TIER_WORDS.length
    ? TIER_WORDS[rarity] : 'Common';

/** Player-facing groups over the raw categories — subcategory-aware, so
 * the things players actually hunt for (skill fruits, saddles, meds,
 * spheres, eggs) get their own front door instead of hiding inside
 * "Consume"/"Essential"/"Material". A selector is `Category` or
 * `Category/Subcategory`; the FIRST matching group in this list owns the
 * item (so specific selectors sit above the broad ones that would
 * otherwise swallow them). Subcategory names verified against the shipped
 * backbone 2026-08-18 — the test pins that every item lands in a group. */
export const ITEM_GROUPS: { id: string; label: string; sel: string[] }[] = [
  {
    id: 'spheres', label: 'Spheres',
    sel: ['SpecialWeapon/SPWeaponCaptureBall', 'CaptureItemModifier'],
  },
  { id: 'weapons', label: 'Weapons', sel: ['Weapon', 'SpecialWeapon'] },
  { id: 'ammo', label: 'Ammo', sel: ['Ammo'] },
  { id: 'armor', label: 'Armor', sel: ['Armor'] },
  { id: 'accessories', label: 'Accessories', sel: ['Accessory'] },
  { id: 'food', label: 'Food', sel: ['Food'] },
  {
    id: 'meds', label: 'Meds',
    sel: ['Consume/Drug', 'Consume/Medicine', 'Consume/ConsumePalRevive', 'Material/Drug'],
  },
  { id: 'fruits', label: 'Skill fruits', sel: ['Consume/ConsumeWazaMachine'] },
  { id: 'gear', label: 'Pal gear', sel: ['Essential/Essential_PalGear'] },
  { id: 'eggs', label: 'Eggs', sel: ['Material/MaterialPalEgg'] },
  { id: 'materials', label: 'Materials', sel: ['Material'] },
  { id: 'consumables', label: 'Consumables', sel: ['Consume'] },
  { id: 'schematics', label: 'Schematics', sel: ['Blueprint'] },
  { id: 'gliders', label: 'Gliders', sel: ['Glider'] },
  { id: 'key', label: 'Key items', sel: ['Essential'] },
];

/** id -> owning group, first-match-wins over the ordered selectors */
const GROUP_OF = new Map<string, { id: string; label: string }>();
for (const id of ITEM_IDS) {
  const it = ITEMS[id];
  const cat = it.category ?? '';
  const pair = `${cat}/${it.subcategory ?? ''}`;
  for (const g of ITEM_GROUPS) {
    if (g.sel.includes(pair) || g.sel.includes(cat)) {
      GROUP_OF.set(id, g);
      break;
    }
  }
}

/** The four groups that own their own bottom tab — the center Items tab
 * shows everything ELSE (CEO 2026-08-19: "Items tab shows weapons armors
 * etc, it's not meant to"). 'all' stays available as a filter chip. */
export const TAB_GROUPS = ['weapons', 'armor', 'food', 'spheres'];

export function idsInGroup(groupId: string): string[] {
  if (groupId === 'all') return ITEM_IDS;
  if (groupId === 'other') {
    return ITEM_IDS.filter((i) => {
      const g = GROUP_OF.get(i)?.id;
      return g != null && !TAB_GROUPS.includes(g);
    });
  }
  return ITEM_IDS.filter((i) => GROUP_OF.get(i)?.id === groupId);
}

export function groupOf(id: string): string | null {
  return GROUP_OF.get(id)?.label ?? null;
}

/** Player words for every category/subcategory pair in the backbone —
 * internal names like "SPWeaponCaptureBall" must never reach the screen
 * (workspace law: a player's words, never a developer's). The test pins
 * that every shipped pair has an entry, so a data refresh that adds a new
 * subcategory fails loudly instead of leaking jargon. */
export const KIND_WORDS: Record<string, string> = {
  'Accessory/Accessory': 'Accessory',
  'Ammo/ConsumeBullet': 'Ammunition',
  'Armor/ArmorBody': 'Body armor',
  'Armor/ArmorHead': 'Head gear',
  'Armor/Shield': 'Shield',
  'Blueprint/Blueprint': 'Schematic',
  'CaptureItemModifier/CaptureItemModifier': 'Sphere module',
  'Consume/ConsumeAncientTechnologyBook': 'Ancient technology manual',
  'Consume/ConsumeFishingBait': 'Fishing bait',
  'Consume/ConsumeGainStatusPoints': 'Stat boost',
  'Consume/ConsumeOther': 'Consumable',
  'Consume/ConsumePalAwakening': 'Pal awakening item',
  'Consume/ConsumePalGainExp': 'Pal EXP item',
  'Consume/ConsumePalGainFriendshipPoint': 'Pal friendship item',
  'Consume/ConsumePalLevelUp': 'Pal level-up item',
  'Consume/ConsumePalRankUp': 'Pal rank-up item',
  'Consume/ConsumePalRevive': 'Pal revival item',
  'Consume/ConsumePalTalentUp': 'Pal talent item',
  'Consume/ConsumePalWorkSuitabilityUp': 'Work suitability boost',
  'Consume/ConsumePassiveSkillChange': 'Passive skill item',
  'Consume/ConsumeTechnologyBook': 'Technology manual',
  'Consume/ConsumeTreasureMap': 'Treasure map',
  'Consume/ConsumeWazaMachine': 'Skill fruit',
  'Consume/ConsumeWorldTreeHolyWater': 'Holy water',
  'Consume/Drug': 'Medicine',
  'Consume/Medicine': 'Medicine',
  'Consume/ReturnToBaseCamp': 'Base return item',
  'Essential/Essential': 'Key item',
  'Essential/Essential_AdditionalInventory': 'Bag upgrade',
  'Essential/Essential_BossReward': 'Boss trophy',
  'Essential/Essential_Lamp': 'Lamp',
  'Essential/Essential_PalGear': 'Pal gear',
  'Essential/Essential_PassiveSkillChange': 'Passive skill item',
  'Essential/Essential_UnlockPlayerFuture': 'Ability unlock',
  'Food/FoodDishFish': 'Cooked fish dish',
  'Food/FoodDishMeat': 'Cooked meat dish',
  'Food/FoodDishVegetable': 'Cooked veggie dish',
  'Food/FoodFish': 'Raw fish',
  'Food/FoodMeat': 'Raw meat',
  'Food/FoodVegetable': 'Vegetable',
  'Glider/Glider': 'Glider',
  'Material/Drug': 'Medicine ingredient',
  'Material/MaterialIngot': 'Ingot',
  'Material/MaterialJewelry': 'Gemstone',
  'Material/MaterialMonster': 'Pal material',
  'Material/MaterialOre': 'Ore',
  'Material/MaterialPalEgg': 'Pal egg',
  'Material/MaterialProccessing': 'Processed material',
  'Material/MaterialStone': 'Stone',
  'Material/MaterialWood': 'Wood',
  'Material/Money': 'Currency',
  'SpecialWeapon/SPWeaponCaptureBall': 'Capture sphere',
  'Weapon/WeaponAssaultRifle': 'Assault rifle',
  'Weapon/WeaponBow': 'Bow',
  'Weapon/WeaponCrossbow': 'Crossbow',
  'Weapon/WeaponFishingRod': 'Fishing rod',
  'Weapon/WeaponFlameThrower': 'Flamethrower',
  'Weapon/WeaponGatlingGun': 'Gatling gun',
  'Weapon/WeaponGrapplingGun': 'Grappling gun',
  'Weapon/WeaponHandgun': 'Handgun',
  'Weapon/WeaponMelee': 'Melee weapon',
  'Weapon/WeaponMetalDetector': 'Metal detector',
  'Weapon/WeaponRocketLauncher': 'Rocket launcher',
  'Weapon/WeaponShotgun': 'Shotgun',
  'Weapon/WeaponThrowObject': 'Thrown weapon',
};

/** What kind of thing this item is, in a player's words. */
export function kindWord(id: string): string {
  const it = ITEMS[id];
  if (!it) return 'Item';
  return KIND_WORDS[`${it.category ?? ''}/${it.subcategory ?? ''}`]
    ?? groupOf(id) ?? 'Item';
}

/** The kinds inside a group, biggest first — the CEO's 2026-08-18 point:
 * "Consumables are more than food, potions and remedy... many sub ones."
 * Every group with 2+ kinds gets a sub-chip row so its depth is browsable,
 * not buried. Counts are real, from the same partition the tests pin. */
export function kindsInGroup(groupId: string): { kind: string; count: number }[] {
  const tally = new Map<string, number>();
  for (const id of idsInGroup(groupId)) {
    const k = kindWord(id);
    tally.set(k, (tally.get(k) ?? 0) + 1);
  }
  return [...tally.entries()]
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind));
}

export type ItemSort = 'power' | 'name' | 'rarity';

/** A named effect's numeric value, when the item carries one. */
export function effectNumber(id: string, label: string): number | null {
  for (const [k, v] of ITEM_FACTS[id]?.effects ?? []) {
    if (k === label) {
      const n = Number(v.replace(/[^\d.-]/g, ''));
      if (!Number.isNaN(n)) return n;
    }
  }
  return null;
}

/** The strongest number an item carries — attack, else defense, else
 * what food actually competes on: Nutrition ("Strongest first" on the
 * Food tab means best meals first, not alphabet). */
export const powerOf = (id: string): number =>
  ITEM_STATS[id]?.atk ?? ITEM_STATS[id]?.def
  ?? effectNumber(id, 'Nutrition') ?? -1;

/* ---- implants -> the passive they grant (IL25) ---------------------
 * The 40 "Implant: X" items were the biggest group of bare cards in the
 * catalogue: a name, a price, nothing else. Their X is a passive skill
 * name, and we already ship all 114 passives DATAMINED with their real
 * effect text — 40 of 40 join exactly (measured 2026-08-20), so the
 * card can finally say what the implant does. Same table the breeding
 * fane reads; no new data, no guessing. */
export interface PassiveRow {
  name: string;
  tier: number;
  category?: string;
  effects: string;
}

/** Curly vs straight apostrophes differ between the two tables
 * ("Demon's Hand" / "Demon’s Hand") — 2 of 21 disposable implants were
 * lost to it before this normalization. */
const passiveKey = (s: string): string => s.replace(/[’']/g, "'").trim();

const PASSIVE_BY_NAME = new Map<string, PassiveRow>(
  (passivesJson as unknown as { passives: PassiveRow[] }).passives
    .map((p) => [passiveKey(p.name), p]));

const PASSIVE_ITEM_SUBS = new Set([
  'Essential_PassiveSkillChange',   // the 40 permanent implants
  'ConsumePassiveSkillChange',      // the 21 disposable ones
]);

/** The passive an implant grants, with the game's own effect text. */
export function implantPassive(id: string): PassiveRow | null {
  const it = ITEMS[id];
  if (!it || !PASSIVE_ITEM_SUBS.has(it.subcategory ?? '')) return null;
  const key = it.name.includes(': ') ? it.name.split(': ').slice(1).join(': ') : it.name;
  return PASSIVE_BY_NAME.get(passiveKey(key)) ?? null;
}

/* ---- reverse recipes: what can I MAKE with this? (IL20) ------------
 * Every recipe already closes over backbone ids, so the index inverts
 * exactly — no name matching. Tier crafts fold into their family, so
 * "Refined Ingot" lists the Assault Rifle once, not five times. */
const USED_IN = new Map<string, Set<string>>();
for (const [product, f] of Object.entries(ITEM_FACTS)) {
  const mats = new Set<string>();
  for (const r of f.recipe ?? []) mats.add(r.id);
  for (const c of f.crafts ?? []) for (const m of c.mats) mats.add(m.id);
  for (const m of mats) {
    const list = USED_IN.get(m) ?? new Set<string>();
    list.add(product);
    USED_IN.set(m, list);
  }
}

/* ---- the shopping list: what a craft REALLY costs (IL32) -----------
 * A recipe names its direct ingredients, but 1,082 of the 1,355
 * craftable items are made of things that are themselves crafted, so
 * "30 Plasteel" is not an answer to "what do I go get?". Expanding the
 * tree to the items nobody crafts turns the Beam Sword's four lines
 * into the real bill: 169 Ore, 100 Paldium Fragment, 12 Coal.
 *
 * Pure derivation over the shipped recipes — every ingredient id is a
 * backbone id (verified catalogue-wide), so nothing is name-matched and
 * no number is invented; the totals are the game's own multiplied out.
 * Nine recipes list themselves as an ingredient upstream (the boss
 * summon Parts), so the walk carries the path and stops on revisit —
 * a self-referential item counts as something you go get. */
export interface CraftRollup {
  /** what you gather, hunt or buy — the tree's leaves, biggest first */
  gather: CraftRow[];
  /** the crafted middle steps, in build order (closest to raw first) */
  steps: CraftRow[];
}

/** Does walking into this item tell you anything new? No, if it is not
 * craftable, if it is already on the path, or if its whole recipe is
 * itself (the 9 summon Parts) — those are things you go and get, so
 * they are leaves and must never ALSO be listed as a crafting step. */
const expands = (id: string, path: Set<string>): boolean => {
  const rec = ITEM_FACTS[id]?.recipe;
  return !!rec && !path.has(id) && rec.some((r) => r.id !== id);
};

const craftDepth = (id: string, path: Set<string>): number => {
  if (!expands(id, path)) return 0;
  const next = new Set(path).add(id);
  return 1 + Math.max(...ITEM_FACTS[id]!.recipe!.map((r) => craftDepth(r.id, next)));
};

/** The bill for ANY material list — a base recipe or one schematic
 * tier's (IL33). `product` is the thing being made: it seeds the path,
 * so a tier that lists itself stops instead of looping, and it is what
 * a circular expansion is checked against. */
export function rollupOfMats(mats: CraftRow[], product?: string): CraftRollup {
  const gather = new Map<string, number>();
  const steps = new Map<string, number>();
  const walk = (at: string, qty: number, path: Set<string>): void => {
    if (!expands(at, path)) {
      gather.set(at, (gather.get(at) ?? 0) + qty);
      return;
    }
    const next = new Set(path).add(at);
    for (const r of ITEM_FACTS[at]!.recipe!) {
      const need = r.n * qty;
      if (expands(r.id, next)) steps.set(r.id, (steps.get(r.id) ?? 0) + need);
      walk(r.id, need, next);
    }
  };
  const seed = new Set(product ? [product] : []);
  for (const m of mats) {
    if (expands(m.id, seed)) steps.set(m.id, (steps.get(m.id) ?? 0) + m.n);
    walk(m.id, m.n, seed);
  }
  // Two items round-trip: a Small Pal Soul is made from a Medium, and a
  // Medium from Smalls. Expanding either one ends up asking you to
  // gather the very thing you are making, which is not an answer — so
  // there is no from-scratch bill for them and the card just shows the
  // recipe.
  if (product && gather.has(product)) return { gather: [], steps: [] };
  // The same loop can be reached from OUTSIDE it: anything crafted from
  // Pal Souls walks into the Small/Medium round trip and stops there.
  // Whatever the walk stopped on is a thing you go and get, so it must
  // not also be listed as a step you craft.
  for (const leaf of gather.keys()) steps.delete(leaf);
  const rows = (m: Map<string, number>): CraftRow[] =>
    [...m].map(([i, n]) => ({ id: i, n }));
  return {
    gather: rows(gather).sort((a, b) => b.n - a.n
      || ITEMS[a.id].name.localeCompare(ITEMS[b.id].name)),
    steps: rows(steps).sort((a, b) =>
      craftDepth(a.id, new Set()) - craftDepth(b.id, new Set())
      || b.n - a.n || ITEMS[a.id].name.localeCompare(ITEMS[b.id].name)),
  };
}

/** The full bill of materials for ONE of `id`. `gather` is empty when
 * the item is not craftable; `steps` is empty when the recipe is
 * already all raw — the caller shows the section only when it adds
 * something the recipe did not already say. */
export function rawMaterialsFor(id: string): CraftRollup {
  const recipe = ITEM_FACTS[id]?.recipe;
  if (!recipe) return { gather: [], steps: [] };
  return rollupOfMats(recipe, id);
}

/** Everything a whole build list costs, summed (IL43). Each item's own
 * bill (IL32) multiplied by how many are wanted, then added together —
 * so ten arrows and a bow share one Wood line instead of three.
 * An item nobody crafts is itself a thing to gather, which is what a
 * player means when they put Paldium Fragment on the list. */
export function buildTotals(list: Record<string, number>): CraftRollup {
  const gather = new Map<string, number>();
  const steps = new Map<string, number>();
  for (const [id, qty] of Object.entries(list)) {
    if (!ITEMS[id] || !(qty > 0)) continue;
    const bill = rawMaterialsFor(id);
    if (!bill.gather.length && !bill.steps.length) {
      gather.set(id, (gather.get(id) ?? 0) + qty);
      continue;
    }
    for (const g of bill.gather) {
      gather.set(g.id, (gather.get(g.id) ?? 0) + g.n * qty);
    }
    for (const st of bill.steps) {
      steps.set(st.id, (steps.get(st.id) ?? 0) + st.n * qty);
    }
  }
  // the same rule as one item's bill: a thing you were told to gather is
  // never also a step you craft
  for (const leaf of gather.keys()) steps.delete(leaf);
  const rows = (m: Map<string, number>): CraftRow[] =>
    [...m].map(([i, n]) => ({ id: i, n }));
  return {
    gather: rows(gather).sort((a, b) => b.n - a.n
      || ITEMS[a.id].name.localeCompare(ITEMS[b.id].name)),
    steps: rows(steps).sort((a, b) =>
      craftDepth(a.id, new Set()) - craftDepth(b.id, new Set())
      || b.n - a.n || ITEMS[a.id].name.localeCompare(ITEMS[b.id].name)),
  };
}

/** Nothing anywhere says how to get this item: no recipe, no tier
 * craft, no technology node, no research, no drop, no chest, no shop,
 * and no pal drops it (IL41). 102 items are in this state. A card that
 * simply shows nothing reads like a half-built app, so the screen says
 * so plainly instead — never inventing a source to fill the hole. */
export function hasNoKnownSource(id: string): boolean {
  const f = ITEM_FACTS[id];
  if (f && (f.recipe || f.crafts || f.recipesMore || f.tech
    || f.drops || f.boxes || f.shops || f.research)) return false;
  return palsDropping(id).length === 0;
}

/** The things this item helps craft — one row per family, best first. */
export function usedInOf(id: string): string[] {
  const products = USED_IN.get(id);
  if (!products) return [];
  return collapseFamilies([...products])
    .sort((a, b) => familyPowerOf(b) - familyPowerOf(a)
      || (ITEMS[b].rarity ?? 0) - (ITEMS[a].rarity ?? 0)
      || ITEMS[a].name.localeCompare(ITEMS[b].name));
}

/** The item's own kind, ranked by the best number each family reaches —
 * the compare view (IL19). One row per family so a bow's five tiers do
 * not crowd out the other bows; the caller highlights `id`'s family. */
/** A kind word inside a sentence: lowercased, except acronyms the game
 * writes in capitals — "pal EXP item", never "pal exp item" (IL42). */
export const kindPhrase = (id: string): string =>
  kindWord(id).split(' ')
    .map((w) => (/[A-Z]{2,}/.test(w) ? w : w.toLowerCase()))
    .join(' ');

/* ---- ranking a kind that carries no attack or defense (IL42) -------
 * The workspace rule is that every number carries meaning — a rank, not
 * a bare figure. 30 families broke it: a Training Manual showed its EXP
 * and nothing about whether that is the good one, because `powerOf`
 * only knows attack, defense and nutrition. So a kind may instead be
 * ranked by ONE effect number, and only when EVERY family of that kind
 * carries it — Pal EXP items all have "EXP", technology manuals all
 * have "Technology Points". Ore, Gliders, Bait and Wood share no number
 * at all and are deliberately left unranked: inventing an axis for them
 * would be exactly the invented meaning this rule exists to prevent. */
const KIND_AXIS = new Map<string, string | null>();
export function rankAxisOf(kind: string): string | null {
  const cached = KIND_AXIS.get(kind);
  if (cached !== undefined) return cached;
  const fams = collapseFamilies(ITEM_IDS.filter((i) => kindWord(i) === kind));
  let axis: string | null = null;
  const noStats = fams.every(
    (i) => ITEM_STATS[i]?.atk == null && ITEM_STATS[i]?.def == null);
  if (fams.length >= 2 && noStats) {
    const sets = fams.map((i) => new Set(
      (ITEM_FACTS[i]?.effects ?? []).map(([k]) => k)));
    axis = [...(sets[0] ?? [])].find((l) => sets.every((s) => s.has(l))) ?? null;
  }
  KIND_AXIS.set(kind, axis);
  return axis;
}

/** What a family is ranked BY — its best stat, or its kind's one shared
 * effect number when the kind has no stats at all. */
export function rankValueOf(id: string): number {
  const p = familyPowerOf(id);
  if (p > 0) return p;
  const axis = rankAxisOf(kindWord(id));
  if (!axis) return -1;
  return Math.max(...familyOf(id).map((f) => effectNumber(f, axis) ?? -1));
}

export function rivalsOf(id: string): string[] {
  const kind = kindWord(id);
  const bases = collapseFamilies(
    ITEM_IDS.filter((i) => kindWord(i) === kind));
  return bases
    .filter((i) => rankValueOf(i) > 0)
    .sort((a, b) => rankValueOf(b) - rankValueOf(a)
      || ITEMS[a].name.localeCompare(ITEMS[b].name));
}

/** The best number anywhere in the family — what a collapsed row is
 * ranked by, so "strongest first" still puts the Mechanical Bow on top
 * even though its row shows the Common tier. */
export const familyPowerOf = (id: string): number =>
  Math.max(...familyOf(id).map(powerOf));

export function sortItems(ids: string[], sort: ItemSort, byFamily = false): string[] {
  if (byFamily && sort === 'power') {
    return [...ids].sort((a, b) => familyPowerOf(b) - familyPowerOf(a)
      || ITEMS[a].name.localeCompare(ITEMS[b].name));
  }
  const out = [...ids];
  if (sort === 'name') {
    out.sort((a, b) => ITEMS[a].name.localeCompare(ITEMS[b].name)
      || (ITEMS[a].rarity ?? 0) - (ITEMS[b].rarity ?? 0));
  } else if (sort === 'rarity') {
    out.sort((a, b) => (ITEMS[b].rarity ?? 0) - (ITEMS[a].rarity ?? 0)
      || ITEMS[a].name.localeCompare(ITEMS[b].name));
  } else {
    // strongest first; stat-less items keep name order at the tail
    out.sort((a, b) => powerOf(b) - powerOf(a)
      || ITEMS[a].name.localeCompare(ITEMS[b].name)
      || (ITEMS[a].rarity ?? 0) - (ITEMS[b].rarity ?? 0));
  }
  return out;
}

/** Search: every word must match the name, the kind word, or what the
 * item GRANTS/DOES — so "cooked fish" finds the fish dishes, "skill
 * fruit" all 93, and "cold resistance" every piece of gear that carries
 * it (IL24; before this the only way to find those was to open cards
 * one at a time). AAA criterion 2. */
const HAYSTACK = new Map<string, string>();
function haystackFor(id: string): string {
  let hay = HAYSTACK.get(id);
  if (hay == null) {
    const f = ITEM_FACTS[id];
    const imp = implantPassive(id);
    hay = [
      ITEMS[id].name,
      kindWord(id),
      ...(f?.grants ?? []),
      ...(f?.effects ?? []).map(([k]) => k),
      ...(imp ? [imp.name, imp.effects] : []),
    ].join(' ').toLowerCase();
    HAYSTACK.set(id, hay);
  }
  return hay;
}

export function searchItems(q: string): string[] {
  const tokens = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  return ITEM_IDS.filter((i) => {
    const hay = haystackFor(i);
    return tokens.every((t) => hay.includes(t));
  });
}

/** Where this item's stat stands among everything that carries the stat —
 * "Attack 320" alone floats; "#41 of 187" is a fact with context
 * (AAA criterion 6). Computed once per stat, cached. */
const RANKS = new Map<string, Map<string, number>>();
export function statRank(id: string, stat: 'atk' | 'def' | 'hp'):
  { rank: number; of: number } | null {
  if ((ITEM_STATS[id]?.[stat]) == null) return null;
  let table = RANKS.get(stat);
  if (!table) {
    const carriers = ITEM_IDS
      .filter((i) => ITEM_STATS[i]?.[stat] != null)
      .sort((a, b) => (ITEM_STATS[b][stat] ?? 0) - (ITEM_STATS[a][stat] ?? 0));
    table = new Map();
    let rank = 0;
    let last: number | null = null;
    carriers.forEach((i, idx) => {
      const v = ITEM_STATS[i][stat] ?? 0;
      if (v !== last) {
        rank = idx + 1;  // ties share a rank, like any leaderboard
        last = v;
      }
      table!.set(i, rank);
    });
    RANKS.set(stat, table);
  }
  const rank = table.get(id);
  if (rank == null) return null;
  return { rank, of: table.size };
}

/* ---- families: one weapon, five tiers ------------------------------
 * The CEO's 2026-08-19 call: "a weapon that has blueprints and different
 * versions maybe u don't need to show them all in this tab? A bow for
 * example, show normal version then within the card u can see all the
 * versions of it." So the list shows ONE row per family and the card
 * keeps the tier table. Indexed once at load — familyOf used to rescan
 * all 1,892 ids per call, which a collapsing list would do 1,892 times. */
const FAMILY_KEY = (id: string): string =>
  `${ITEMS[id]?.name ?? id}|${ITEMS[id]?.category ?? ''}`;

const FAMILIES = new Map<string, string[]>();
for (const id of ITEM_IDS) {
  const key = FAMILY_KEY(id);
  const list = FAMILIES.get(key) ?? [];
  list.push(id);
  FAMILIES.set(key, list);
}
for (const list of FAMILIES.values()) {
  list.sort((a, b) => (ITEMS[a].rarity ?? 0) - (ITEMS[b].rarity ?? 0));
}

/** Every tier of the same family (same display name), weakest first. */
export function familyOf(id: string): string[] {
  return FAMILIES.get(FAMILY_KEY(id)) ?? [id];
}

/** One id per family — the base tier, the one a player meets first. */
export function collapseFamilies(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    const key = FAMILY_KEY(id);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(familyOf(id)[0] ?? id);
  }
  return out;
}

/* ---- pal drops <-> items, from our own datamined pal table ---------
 * pals_1_0 lists what every pal drops by the item's display name; all
 * 115 distinct strings resolve against the backbone (measured
 * 2026-08-19, zero mismatches — pinned by test). */
const PAL_DROPS = (palsJson as unknown as {
  pals: Record<string, { drops?: string[]; egg_types?: string[] }>;
}).pals;

const DROPPED_BY = new Map<string, string[]>();
for (const [pal, p] of Object.entries(PAL_DROPS)) {
  for (const item of p.drops ?? []) {
    const list = DROPPED_BY.get(item) ?? [];
    list.push(pal);
    DROPPED_BY.set(item, list);
  }
}

/** Which pals drop this item — game-file data, Paldex-linkable. */
export function palsDropping(id: string): string[] {
  return DROPPED_BY.get(ITEMS[id]?.name ?? '') ?? [];
}

/** Which pals hatch from this egg — every pal's egg_types names an egg
 * item exactly (26 of 26 types verified, zero mismatches). */
const HATCHES = new Map<string, string[]>();
for (const [pal, p] of Object.entries(PAL_DROPS)) {
  for (const t of p.egg_types ?? []) {
    const list = HATCHES.get(t) ?? [];
    list.push(pal);
    HATCHES.set(t, list);
  }
}
export function palsHatchingFrom(id: string): string[] {
  return HATCHES.get(ITEMS[id]?.name ?? '') ?? [];
}

/* ---- ammo <-> weapon, from the game's own description tags ----------
 * 25 of 32 ammo descriptions embed their weapon's internal id
 * (<itemName id=|AssaultRifle_Default1|/>) — exact joins, both ways. */
const AMMO_REF = /<itemName id=\|([^|]+)\|\/>/g;
const AMMO_WEAPONS = new Map<string, string[]>();
const WEAPON_AMMO = new Map<string, string[]>();
for (const id of ITEM_IDS) {
  if (ITEMS[id].category !== 'Ammo') continue;
  const refs = [...(ITEMS[id].description ?? '').matchAll(AMMO_REF)]
    .map((m) => m[1])
    .filter((r) => ITEMS[r]
      && (ITEMS[r].category === 'Weapon' || ITEMS[r].category === 'SpecialWeapon'));
  if (!refs.length) continue;
  AMMO_WEAPONS.set(id, refs);
  for (const w of refs) {
    const list = WEAPON_AMMO.get(w) ?? [];
    if (!list.includes(id)) list.push(id);
    WEAPON_AMMO.set(w, list);
  }
}

/** The weapons this ammo fits (base-tier ids), from its own description. */
export const weaponsForAmmo = (ammoId: string): string[] =>
  AMMO_WEAPONS.get(ammoId) ?? [];

/** The ammo a weapon fires — matched on any tier via the family base. */
export function ammoForWeapon(weaponId: string): string[] {
  const base = familyOf(weaponId)[0];
  return WEAPON_AMMO.get(base) ?? WEAPON_AMMO.get(weaponId) ?? [];
}

/** The family's base item id for a display name — the join every
 * cross-link uses (pal drops name items; names resolve here exactly). */
export function itemIdByName(name: string): string | null {
  const fam = ITEM_IDS
    .filter((i) => ITEMS[i].name === name && ITEMS[i].category !== 'Blueprint')
    .sort((a, b) => (ITEMS[a].rarity ?? 0) - (ITEMS[b].rarity ?? 0));
  return fam[0] ?? null;
}

/* ---- schematic <-> item joins, by the game's own naming -------------
 * "Assault Rifle Schematic 2" teaches the Assault Rifle family, tier 2.
 * 463 of 490 blueprints join this way (measured 2026-08-19); the rest
 * (raid slab fragments, furniture with no inventory item) stay plain. */
const SCHEMATIC_NAME = /^(.*?) Schematic(?: (\d+))?$/;

/** What a schematic teaches: the target family's base item id + tier. */
export function teachesOf(blueprintId: string): { id: string; tier: number } | null {
  const it = ITEMS[blueprintId];
  if (it?.category !== 'Blueprint') return null;
  const m = SCHEMATIC_NAME.exec(it.name);
  if (!m) return null;
  const fam = ITEM_IDS
    .filter((i) => ITEMS[i].name === m[1] && ITEMS[i].category !== 'Blueprint')
    .sort((a, b) => (ITEMS[a].rarity ?? 0) - (ITEMS[b].rarity ?? 0));
  if (!fam.length) return null;
  return { id: fam[0], tier: m[2] ? Number(m[2]) : 1 };
}

/** The schematics that teach this item's family, lowest tier first. */
export function schematicsFor(id: string): { id: string; tier: number }[] {
  const name = ITEMS[id]?.name;
  if (!name || ITEMS[id].category === 'Blueprint') return [];
  return ITEM_IDS
    .filter((i) => {
      if (ITEMS[i].category !== 'Blueprint') return false;
      const m = SCHEMATIC_NAME.exec(ITEMS[i].name);
      return m?.[1] === name;
    })
    .map((i) => ({
      id: i,
      tier: Number(SCHEMATIC_NAME.exec(ITEMS[i].name)?.[2] ?? 1),
    }))
    .sort((a, b) => a.tier - b.tier);
}
