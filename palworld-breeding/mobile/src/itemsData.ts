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

/** 'all' is the Items tab's home: the entire catalogue in one list. */
export function idsInGroup(groupId: string): string[] {
  if (groupId === 'all') return ITEM_IDS;
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

/** The strongest number an item carries — attack, else defense. */
export const powerOf = (id: string): number =>
  ITEM_STATS[id]?.atk ?? ITEM_STATS[id]?.def ?? -1;

export function sortItems(ids: string[], sort: ItemSort): string[] {
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

export function searchItems(q: string): string[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  return ITEM_IDS.filter((i) => ITEMS[i].name.toLowerCase().includes(needle));
}

/** Every tier of the same family (same display name), weakest first. */
export function familyOf(id: string): string[] {
  const name = ITEMS[id]?.name;
  if (!name) return [id];
  return ITEM_IDS
    .filter((i) => ITEMS[i].name === name && ITEMS[i].category === ITEMS[id].category)
    .sort((a, b) => (ITEMS[a].rarity ?? 0) - (ITEMS[b].rarity ?? 0));
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
