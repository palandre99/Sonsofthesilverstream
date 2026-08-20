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
import { equipPassiveName, ITEM_FACTS, type CraftRow } from './itemFacts';

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
/** IL66: a card shows a group chip and a kind chip, and used to drop the
 * kind chip only when the two strings were byte-identical. "Schematics"
 * and "Schematic" are not the same string but they are the same word to
 * a player — 610 cards carried the word twice (490 schematics, 93 skill
 * fruits, 18 consumables, 5 gliders, 4 key items). Compare the two as
 * one word: case-folded and singular.
 *
 * Irregular plurals count too — the first cut only stripped a trailing s,
 * so "Accessories"/"Accessory" survived on all 81 accessory cards. Caught
 * by looking at a card, not at the tally my own rule produced. */
const oneOf = (s: string) =>
  s.toLowerCase().replace(/ies$/, 'y').replace(/([^s])s$/, '$1');
export const saysTheSame = (a: string, b: string): boolean =>
  oneOf(a) === oneOf(b);

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
  ?? effectNumber(id, 'Nutrition')
  // a sphere's strength IS its capture power — without this all ten
  // ranked -1 and "Strongest first" put them in alphabetical order,
  // opening the Spheres tab on the Ancient Sphere by luck of the A
  // rather than because it is the best one (IL55)
  ?? captureNumber(id) ?? -1;

/** WHICH number `powerOf` found — 0 attack, 1 defence, 2 nutrition,
 * 3 capture power, 4 nothing.
 *
 * IL79: "Strongest first" compared those numbers to each other as if
 * they measured the same thing, so down a mixed list a **Vegetable Cake
 * (696 nutrition) sat above a Laser Gatling Gun (689 attack)**. They are
 * not comparable and the app should not pretend they are. Sorting the
 * axes apart costs nothing on a single-kind list — every item there
 * shares one axis, so the order is exactly what it always was. */
export const powerAxisOf = (id: string): number =>
  ITEM_STATS[id]?.atk != null ? 0
    : ITEM_STATS[id]?.def != null ? 1
      : effectNumber(id, 'Nutrition') != null ? 2
        : captureNumber(id) != null ? 3 : 4;

/** The axis a whole family is ranked on — its base tier's, since every
 * tier of a thing measures the same way. */
export const familyPowerAxisOf = (id: string): number =>
  Math.min(...familyOf(id).map(powerAxisOf));

/** Where a sphere's capture power sits among all of them (IL65). The
 * ROW has ranked spheres since IL55, but the CARD said a bare "Capture
 * Power 33" — 33 out of what? Ten spheres run from 7 to 64, and that
 * span is the only thing that makes 33 mean anything. Neutral wording,
 * same rule as the effect ranks. */
export function captureRank(id: string): { rank: number; of: number } | null {
  if (captureNumber(id) == null) return null;
  const carriers = ITEM_IDS
    .filter((i) => captureNumber(i) != null)
    .sort((a, b) => (captureNumber(b) ?? 0) - (captureNumber(a) ?? 0));
  const mine = captureNumber(id);
  const rank = carriers.findIndex((i) => captureNumber(i) === mine) + 1;
  return rank > 0 ? { rank, of: carriers.length } : null;
}

const captureNumber = (id: string): number | null => {
  const c = ITEM_FACTS[id]?.capture;
  if (c == null) return null;
  const n = Number(String(c).replace(/[^\d.-]/g, ''));
  return Number.isNaN(n) ? null : n;
};

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
/** The recipe for THIS tier, not for its family's base.
 *
 * IL77: every tier id in the game files carries the same recipe — all
 * five Advanced Bows say 40 Plastic. The real per-tier costs live on the
 * BASE item as `recipesMore`, one block per tier above it (50 / 60 / 70 /
 * 80 Plastic), and until now only the card read them. A build list made
 * for the Legendary tier was handing out the Common tier's shopping list.
 *
 * Block k belongs to family tier k+1, and that mapping is only trusted
 * when the counts line up: 91 of the 118 multi-tier families carry
 * per-tier costs, and TWO of them list four blocks for a two-tier family.
 * Those two are refused — the base recipe stands rather than a guess. */
export function recipeOf(id: string): CraftRow[] | undefined {
  const fam = familyOf(id);
  const k = fam.indexOf(id);
  if (k > 0) {
    const more = ITEM_FACTS[fam[0]]?.recipesMore;
    if (more && more.length === fam.length - 1) return more[k - 1];
  }
  return ITEM_FACTS[id]?.recipe;
}

/** Does this family price its tiers separately, and can we trust the
 * mapping? Only then is a per-tier build worth offering. */
export function hasTierCosts(id: string): boolean {
  const fam = familyOf(id);
  const more = ITEM_FACTS[fam[0]]?.recipesMore;
  return fam.length > 1 && !!more && more.length === fam.length - 1;
}

export function rawMaterialsFor(id: string): CraftRollup {
  const recipe = recipeOf(id);
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

/** "Is this an evening or a weekend?" — the second question after
 * "what do I need?" (IL47). Sums the game's OWN stated Handiwork Lv. 1
 * times; nothing is derived from a formula, and quantities simply
 * multiply the stated figure.
 *
 * The honest half: only 742 of the 1,416 craftable items record a
 * craft time at all (52%, measured 2026-08-20). A total over half the
 * data with nothing said about the rest is exactly the number this app
 * exists to replace, so `unknown` counts what could not be measured and
 * the caller MUST say it. */
export interface BuildTime {
  /** seconds of crafting at Handiwork Lv. 1, for the rows we can measure */
  seconds: number;
  /** how many list entries contributed a time */
  counted: number;
  /** how many THINGS (units, not entries) record no craft time — the
   * panel header counts units too, and one word must not mean two
   * different numbers on the same card (caught on the eye pass: two
   * AI Cores were reported as "1 thing with no time recorded") */
  unknown: number;
}

const timeSeconds = (t: string): number => {
  const h = /(\d+)h/.exec(t);
  const m = /(\d+)m/.exec(t);
  const s = /(\d+)s/.exec(t);
  return (h ? +h[1] * 3600 : 0) + (m ? +m[1] * 60 : 0) + (s ? +s[1] : 0);
};

export function buildTime(list: Record<string, number>): BuildTime {
  let seconds = 0;
  let counted = 0;
  let unknown = 0;
  for (const [id, qty] of Object.entries(list)) {
    if (!ITEMS[id] || !(qty > 0)) continue;
    const t = ITEM_FACTS[id]?.craftTime;
    if (!t || timeSeconds(t) === 0) {
      // only things you MAKE can take time; a gathered material is not
      // "unmeasured", it simply has no craft
      if (ITEM_FACTS[id]?.recipe) unknown += qty;
      continue;
    }
    seconds += timeSeconds(t) * qty;
    counted += 1;
  }
  return { seconds, counted, unknown };
}

/** Seconds as something a player reads — "2h 47m", not 10000. */
/** "1h6m40s" -> "1h 6m 40s" — the source's compact craft time, made
 * readable, with the dead parts dropped.
 *
 * IL69: the source writes a full h/m/s triple whether or not each part is
 * there, so the Air Dash Boots card read "about 50m 0s" — nobody says
 * that, and 234 of the 740 craft times carried a zero part. The share
 * text had it worse: it sent the raw "50m0s", unspaced, so every item
 * the CEO shared went out in machine shorthand. One formatter now, used
 * by the card and the share text both. Every non-zero number is kept
 * exactly as the source states it; only the zeroes go. */
export function spokenCraftTime(t: string): string {
  const parts = t.match(/\d+[hms]/g);
  if (!parts) return t;
  const kept = parts.filter((p) => parseInt(p, 10) > 0);
  return (kept.length ? kept : parts.slice(-1)).join(' ');
}

export function spokenTime(seconds: number): string {
  if (seconds <= 0) return '';
  const h = Math.floor(seconds / 3600);
  if (h > 0) {
    // IL78: my first cut at this kept the seconds only BELOW an hour, so
    // a card still said "5h 33m 20s" where the build panel said "5h 33m"
    // — the same disagreement, moved rather than fixed. Worse, the old
    // line ROUNDED: 2h 46m 40s was printed "2h 47m", a minute that never
    // existed. Say every part the number actually has.
    const mm = Math.floor((seconds % 3600) / 60);
    const ss = seconds % 60;
    return `${h}h${mm ? ` ${mm}m` : ''}${ss ? ` ${ss}s` : ''}`;
  }
  if (seconds >= 60) {
    // IL76: this dropped the leftover seconds, so a Grappling Gun card
    // said "about 6m 40s" (the source's own words) while the build panel
    // said "About 6m" for the very same craft. Two screens, one fact,
    // two numbers.
    const mm = Math.floor(seconds / 60);
    const ss = seconds % 60;
    return ss ? `${mm}m ${ss}s` : `${mm}m`;
  }
  return `${seconds}s`;
}

/* ---- what gear protects you from (IL50) ---------------------------
 * The question armour is actually chosen by. 213 of the 264 armour
 * pieces carry a resistance and nothing in the fane could answer "what
 * do I wear in the cold?" — the grants were card-only. The list of
 * guards is derived from the SHIPPED grant strings, never hardcoded, so
 * a data refresh that renames or adds one is picked up for free. */
const GUARD_RE = /^(.+?) (?:Resistance|Damage Reduction) Lv\. (\d)$/;

/** One grant string can carry TWO protections — the Hexolite plate
 * grants "Heat Resistance Lv. 3 / Cold Resistance Lv. 3". Reading it
 * whole produced a guard literally named "Heat Resistance Lv. 3 /
 * Cold" (caught by printing the guard list instead of trusting it), so
 * every grant is split before it is parsed. */
const guardParts = (g: string): [string, number][] => g.split(' / ')
  .map((part) => GUARD_RE.exec(part.trim()))
  .filter((m): m is RegExpExecArray => m != null)
  .map((m) => [m[1], Number(m[2])]);

let GUARDS: string[] | null = null;
/** Every protection the catalogue actually grants, commonest first. */
export function guardKinds(): string[] {
  if (GUARDS) return GUARDS;
  const count = new Map<string, number>();
  for (const f of Object.values(ITEM_FACTS)) {
    for (const g of f.grants ?? []) {
      for (const [k] of guardParts(g)) count.set(k, (count.get(k) ?? 0) + 1);
    }
  }
  GUARDS = [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([k]) => k);
  return GUARDS;
}

/** The strongest level of `guard` this item grants, or 0 for none. */
export function guardLevel(id: string, guard: string): number {
  let best = 0;
  for (const g of ITEM_FACTS[id]?.grants ?? []) {
    for (const [k, lv] of guardParts(g)) {
      if (k === guard) best = Math.max(best, lv);
    }
  }
  return best;
}

/** Anything that protects against `guard`, best protection first — the
 * family's best tier decides, so a collapsed row is ranked by what the
 * family can reach. */
export function gearAgainst(guard: string): string[] {
  return collapseFamilies(ITEM_IDS.filter((i) => guardLevel(i, guard) > 0))
    .sort((a, b) => Math.max(...familyOf(b).map((i) => guardLevel(i, guard)))
      - Math.max(...familyOf(a).map((i) => guardLevel(i, guard)))
      || familyPowerOf(b) - familyPowerOf(a)
      || ITEMS[a].name.localeCompare(ITEMS[b].name));
}

/** The pal a saddle, harness or gloves belongs to (IL57). A pal's card
 * has linked TO items since IL5/IL31, but 138 pieces of pal gear never
 * linked back — "Arsox Saddle" sat on a card that never mentioned
 * Arsox.
 *
 * Exact identity, longest prefix first: every split of the name is
 * tried and the LONGEST remainder that is exactly a pal name wins.
 * That order matters — taking the first match maps "Azurobe Cryst
 * Saddle" to Azurobe, the wrong pal, and the variants (Cryst, Noct,
 * Aqua, Lux, Ignis, Terra) are precisely where a saddle differs.
 * All 138 resolve; nothing is fuzzy-matched. */
const PAL_TABLE = (palsJson as unknown as {
  pals: Record<string, unknown>;
}).pals;

export function palForGear(id: string): string | null {
  if (ITEMS[id]?.subcategory !== 'Essential_PalGear') return null;
  const words = ITEMS[id].name.split(' ');
  for (let cut = words.length - 1; cut >= 1; cut--) {
    const cand = words.slice(0, cut).join(' ')
      .replace(/[’']s$/, '').replace(/[’']$/, '');
    if (Object.hasOwn(PAL_TABLE, cand)) return cand;
  }
  return null;
}

/** "What it grants", minus what the card has already said (IL63).
 *
 * An armour card printed its resistances TWICE — once as "Wears the
 * passives" (from the stat card) and again as the first entries of
 * "What it grants" (from the page chips) — a few lines apart, word for
 * word. And a passive that exists at several tiers arrived four times
 * over: "Attack Up (S) Lv. 1 · Lv. 2 · Lv. 3 · Lv. 4", which is the
 * per-tier chip noise IL1 already stripped out of the Health rows.
 *
 * So: drop anything the passives line already states, and keep only the
 * BEST level of a passive that repeats. Nothing is invented and nothing
 * true is lost — the tier table below still shows every tier. */
export function grantsToShow(id: string): string[] {
  const said = new Set(
    (ITEM_STATS[id]?.passives ?? []).map(equipPassiveName));
  const best = new Map<string, { level: number; text: string }>();
  const plain: string[] = [];
  for (const g of ITEM_FACTS[id]?.grants ?? []) {
    if (said.has(g)) continue;
    const m = /^(.*) Lv\. (\d+)$/.exec(g);
    if (!m) {
      if (!plain.includes(g)) plain.push(g);
      continue;
    }
    const lvl = Number(m[2]);
    const seen = best.get(m[1]);
    if (!seen || lvl > seen.level) best.set(m[1], { level: lvl, text: g });
  }
  return [...plain, ...[...best.values()].map((v) => v.text)];
}

/* ---- meaning for an effect number without a unit (IL64) ------------
 * A food card ended "What it does" with "Recovery Time 600". 600 what?
 * The upstream chip is literally ["Recovery Time", "600"] — no unit
 * anywhere — and seconds is only a good guess, so it cannot be printed
 * as fact. What CAN be said truthfully is where the number sits among
 * the items that carry the same label.
 *
 * The wording is deliberately neutral ("#2 of 38", never "2nd best"):
 * nobody has established whether a longer Recovery Time is good or
 * bad, and a rank must not smuggle in a judgement the data does not
 * make. Same shape as statRank, computed once per label. */
const EFFECT_RANKS = new Map<string, Map<string, { rank: number; of: number }>>();
export function effectRank(
  id: string, label: string,
): { rank: number; of: number } | null {
  const mine = effectNumber(id, label);
  if (mine == null) return null;
  // IL92: a Mysterious Mushroom Juice card read "SAN resist -100000 ·
  // #12 of 12". SAN resist runs from -100000 to +50 in the game files —
  // the big negatives are the game's way of saying this WRECKS you, not
  // a quantity to place in a league table. A penalty ranked among
  // bonuses is incoherent, so the number still shows, exactly as the
  // files state it, and the rank does not.
  if (mine < 0) return null;
  let table = EFFECT_RANKS.get(label);
  if (!table) {
    // IL96: the field is the items that CAN be placed. Penalties lost
    // their rank, so counting them in the total left "#1 of 12" on a
    // list where only nine are rankable and nobody could find #10.
    const carriers = ITEM_IDS
      .filter((i) => (effectNumber(i, label) ?? -1) > 0)
      .sort((a, b) => (effectNumber(b, label) ?? 0) - (effectNumber(a, label) ?? 0));
    table = new Map();
    let rank = 0;
    let last: number | null = null;
    carriers.forEach((i, idx) => {
      const v = effectNumber(i, label) ?? 0;
      if (v !== last) {
        rank = idx + 1;
        last = v;
      }
      table!.set(i, { rank, of: carriers.length });
    });
    EFFECT_RANKS.set(label, table);
  }
  return table.get(id) ?? null;
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
    const shared = [...(sets[0] ?? [])].filter((l) => sets.every((s) => s.has(l)));
    // IL91: this took the FIRST label every family shares, and for
    // medicine that is "Nutrition" — which reads 1 on every single one.
    // The card then promised "most Nutrition first" over a list where
    // four of five tied at 1: a ranking that ranks nothing. Take the
    // shared label that actually SEPARATES them, and if none does, rank
    // by nothing and say so.
    // A label only earns the ranking if it SEPARATES the kind. Nutrition
    // across medicine has two distinct values — 360 on one tonic and 1 on
    // the other thirteen — which is not an ordering, it is a tie with an
    // exception. Demand distinct values on at least half of them, and
    // allow a label carried by most (not all) families, since what a
    // medicine is actually judged on is Health Recovery and four of the
    // fourteen do not list it.
    const common = new Map<string, number>();
    for (const set of sets) for (const l of set) common.set(l, (common.get(l) ?? 0) + 1);
    let best = 0;
    for (const [label, carried] of common) {
      if (carried * 2 < fams.length) continue;          // must be on most
      const seen = new Set(fams.map((i) => effectNumber(i, label) ?? -1));
      const spread = seen.size;
      if (spread * 2 >= fams.length && spread > best) { best = spread; axis = label; }
    }
    if (best < 2) axis = null;
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

/** What a "how it stacks up" list is really ordered by.
 *
 * IL91: medicine has no stat and no effect that separates it, so the
 * list fell back to `familyPowerOf` — which for a medicine is its
 * NUTRITION, 1 on thirteen of the fourteen. The card then printed those
 * 1s beside a heading promising an order. When nothing separates a kind
 * but its tier, say tier and show tiers. */
export function rivalBasis(kind: string): 'stat' | 'effect' | 'tier' {
  const fams = collapseFamilies(ITEM_IDS.filter((i) => kindWord(i) === kind));
  if (fams.some((i) => familyOf(i).some(
    (t) => ITEM_STATS[t]?.atk != null || ITEM_STATS[t]?.def != null))) return 'stat';
  return rankAxisOf(kind) ? 'effect' : 'tier';
}

/** The number a rivals row sorts on, and what it shows. */
export const rivalSortOf = (id: string): number => rankValueOf(id);
export const rivalShowOf = (id: string): string => String(rankValueOf(id));

export function rivalsOf(id: string): string[] {
  const kind = kindWord(id);
  // Nothing that separates the kind means no board at all — the rule
  // that has always applied to Ore and Wood, now applied to medicine
  // too. Showing thirteen 1s under a heading promising an order was
  // worse than showing nothing.
  if (rivalBasis(kind) === 'tier') return [];
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
    return [...ids].sort((a, b) =>
      familyPowerAxisOf(a) - familyPowerAxisOf(b)
      || familyPowerOf(b) - familyPowerOf(a)
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
    // strongest first WITHIN one kind of number; stat-less items keep
    // name order at the tail
    out.sort((a, b) => powerAxisOf(a) - powerAxisOf(b)
      || powerOf(b) - powerOf(a)
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

/** Edit distance, capped — we only ever care whether two short strings
 * are CLOSE, so the row-pair walk stops early once nothing can be within
 * `max`. Keeps a 1,892-name sweep cheap enough to run on a keystroke
 * that found nothing. */
function within(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j - 1], prev[j], cur[j - 1]);
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** IL81: a misspelling was a dead end — "grapling" said "No item matches"
 * and stopped there. This OFFERS the near misses; it never silently
 * searches for something the player did not type. One row per family, at
 * most three, and only names genuinely close to what was typed: a
 * one-character slip on a short word, two on a long one. A query that
 * resembles nothing gets nothing, which is still the honest answer. */
export function suggestItems(q: string, limit = 3): string[] {
  const needle = q.trim().toLowerCase();
  if (needle.length < 3) return [];
  const max = needle.length <= 5 ? 1 : 2;
  const scored: { id: string; d: number }[] = [];
  for (const id of collapseFamilies(ITEM_IDS)) {
    const name = ITEMS[id].name.toLowerCase();
    let d = within(needle, name, max);
    if (d > max) {
      // a slip in ONE word of a longer name still counts
      for (const w of name.split(/[\s:]+/)) {
        const wd = within(needle, w, max);
        if (wd < d) d = wd;
      }
    }
    if (d <= max) scored.push({ id, d });
  }
  return scored
    .sort((a, b) => a.d - b.d
      || ITEMS[a.id].name.length - ITEMS[b.id].name.length
      || ITEMS[a.id].name.localeCompare(ITEMS[b.id].name))
    .slice(0, limit)
    .map((x) => x.id);
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
/** IL83: this built a fresh template string every call, and
 * `collapseFamilies` calls it once per item. The filter sheet now counts
 * 50 chips by running the real filter for each, which meant ~95,000
 * string allocations to open it — 36 ms on a desktop, and this repo has
 * already shipped one frozen thread. The key never changes, so build it
 * once and look it up. */
const KEY_OF = new Map<string, string>();
for (const id of ITEM_IDS) {
  KEY_OF.set(id, `${ITEMS[id]?.name ?? id}|${ITEMS[id]?.category ?? ''}`);
}
const FAMILY_KEY = (id: string): string =>
  KEY_OF.get(id) ?? `${ITEMS[id]?.name ?? id}|${ITEMS[id]?.category ?? ''}`;

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

/* ---- the row's own line (IL72) -----------------------------------
 * Moved here from ItemsScreen so the whole index can be MEASURED. The
 * row sweep was being done 25 rows at a time through the browser,
 * because the list is virtualised and these lived in a screen module
 * that the test runner cannot import. Behaviour is unchanged — the
 * functions are pure data and always were. */
/** Armour is chosen by what it PROTECTS you from, not by its defence
 * number — 213 of the 264 armour pieces carry a resistance and the row
 * showed none of it, so picking cold gear meant opening cards one at a
 * time (IL50). Kept short: the game says "Cold Resistance Lv. 2", the
 * row says "Cold 2", because the row has ~200px and the full sentence
 * does not fit beside a defence number. */
const SHORT_GRANT = /^(Cold|Heat) Resistance Lv\. (\d)$/;
function guardBits(id: string): string[] {
  const out: string[] = [];
  for (const g of ITEM_FACTS[id]?.grants ?? []) {
    const m = SHORT_GRANT.exec(g);
    if (m) out.push(`${m[1]} ${m[2]}`);
  }
  return out;
}

/** The buffs a dish gives, in the row (IL52). Nutrition and SAN say how
 * FILLING a meal is; these say why you would cook it.
 *
 * "Recovery Time" is deliberately NOT here, and the first reason I
 * wrote was wrong: I claimed it reads 600 everywhere, and the test
 * proved it takes 60, 600 and 1800 on food. It stays out because what
 * the number MEANS is not established — the game labels it and we
 * repeat the label on the card, but a compact row cannot say "600
 * what?" honestly, and a duration nobody can read is worse than
 * silence. The card still shows every effect verbatim. */
// IL74 adds the three stat fruits' own numbers. A Life Fruit row led
// with "Nutrition 1" — true, and the least interesting thing about it.
// Nobody eats one to be fed; they use it to raise a pal's Health.
export const BUFF_LABELS = ['Work Speed', 'EXP increase', 'Hunger resist',
  'SAN resist', 'Health IV', 'Attack IV', 'Defense IV', 'Explosion resist'];
function buffBits(id: string): string[] {
  const out: string[] = [];
  for (const label of BUFF_LABELS) {
    const n = effectNumber(id, label);
    if (n != null) out.push(`${label} +${n}`);
  }
  return out;
}

export function statLine(id: string): string {
  const st = ITEM_STATS[id];
  const bits: string[] = [];
  if (st?.atk != null) bits.push(`Attack ${st.atk}`);
  if (st?.def != null) bits.push(`Defense ${st.def}`);
  bits.push(...guardBits(id));
  if (st?.hp != null) bits.push(`+${st.hp} Health`);
  // IL95: every other stat on a row is capitalised — "Attack 20000",
  // "Defense 840", "Speed 80". A shield row's ONLY stat is its
  // durability, so it opened in lower case and read like a slip.
  if (st?.durability != null) bits.push(`Durability ${st.durability}`);
  if (st?.magazine != null) bits.push(`${st.magazine} round${st.magazine === 1 ? '' : 's'}`);
  if (!bits.length) {
    // food and consumables compete on their effects, not combat stats
    const nut = effectNumber(id, 'Nutrition');
    const san = effectNumber(id, 'SAN');
    const buffs = buffBits(id);
    if (nut != null) bits.push(`Nutrition ${nut}`);
    // SAN steps aside for a buff rather than letting the line clip:
    // measured at 375px, "Nutrition 170 · SAN 21 · Work Speed +50 ·
    // Hunger resist +25" overruns. Nutrition says how filling it is,
    // the buff says why you cooked it, and SAN is on the card.
    if (san != null && !buffs.length) bits.push(`SAN ${san}`);
    // and only ONE buff fits — a chowder with Work Speed AND Hunger
    // resist still overran, so the row names the first and counts the
    // rest honestly rather than trailing off mid-word
    if (buffs.length > 1) {
      bits.push(`${buffs[0]} +${buffs.length - 1} more`);
      buffs.length = 0;
    }
    // ...but nobody cooks a Dumud Chowder for its nutrition — they cook
    // it for +50 Work Speed, and the row showed only the first two
    // numbers (IL52). Recovery Time is deliberately left out: it reads
    // 600 on every dish that has it, so it separates nothing.
    bits.push(...buffs);
  }
  if (!bits.length && ITEMS[id].category === 'Ammo') {
    // 32 of 32 ammo rows said NOTHING (IL54). The one thing a player
    // holding ammo wants is what shoots it, and the join already ships
    // — it is the same one the card uses. 25 of the 32 resolve; the
    // other 7 (plain Arrow, Decal Ink, Flamethrower Fuel…) fall through
    // to their kind rather than claim a weapon we cannot prove.
    const guns = collapseFamilies(weaponsForAmmo(id));
    if (guns.length) {
      bits.push(guns.length === 1
        ? `For the ${ITEMS[guns[0]].name}`
        : `For the ${ITEMS[guns[0]].name} +${guns.length - 1} more`);
    }
  }
  if (!bits.length && ITEMS[id].category === 'Blueprint') {
    // a schematic row's whole point is what it teaches (IL15 — 490 rows
    // used to say nothing but "Schematic")
    const t = teachesOf(id);
    if (t) {
      bits.push(t.tier > 1
        ? `Teaches ${ITEMS[t.id].name} · tier ${t.tier}`
        : `Teaches ${ITEMS[t.id].name}`);
    }
  }
  if (!bits.length) {
    // an implant row's whole point is its passive (IL27 — the card
    // gained it at IL25 but the row still said "Passive skill item")
    const imp = implantPassive(id);
    if (imp) bits.push(`${imp.name} · ${imp.effects}`);
  }
  if (!bits.length) {
    // spheres show their capture power; accessories their grant; gliders
    // and meds their first effect (IL16 — the data was already shipped,
    // the rows just never used it)
    const facts = ITEM_FACTS[id];
    if (facts?.capture != null) {
      bits.push(`Capture Power ${facts.capture}`);
    } else if (facts?.grants?.length) {
      bits.push(facts.grants[0]
        + (facts.grants.length > 1 ? ` +${facts.grants.length - 1}` : ''));
    } else if (facts?.effects?.length) {
      const [k, v] = facts.effects[0];
      bits.push(`${k} ${v}`);
    }
  }
  return bits.join(' · ');
}

/** A collapsed row's line: the family's span, not one tier's numbers. */
export function familyLine(fam: string[]): string {
  const lo = ITEM_STATS[fam[0]];
  const hi = ITEM_STATS[fam[fam.length - 1]];
  const span = (k: 'atk' | 'def' | 'hp'): string | null => {
    const a = lo?.[k];
    const b = hi?.[k];
    if (a == null || b == null) return null;
    return a === b ? `${a}` : `${a}–${b}`;
  };
  const atk = span('atk');
  if (atk) return `Attack ${atk}`;
  const def = span('def');
  // a collapsed armour row returned here and hid its resistance too —
  // the family shares it, so read it off the base tier (IL50)
  if (def) return [`Defense ${def}`, ...guardBits(fam[0])].join(' · ');
  // IL72: this used to end at `|| kindWord(fam[0])`, which quietly took
  // the row OUT of its own fallback chain — a collapsed family could
  // never reach the unlock level, the recipe count or the price, so 23
  // rows (21 of them eggs) said "Pal egg" and stopped. Return empty and
  // let the row decide, exactly as a single item does.
  return statLine(fam[0]);
}
