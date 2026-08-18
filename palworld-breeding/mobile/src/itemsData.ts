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

/** Player-facing groups over the raw categories. */
export const ITEM_GROUPS: { id: string; label: string; categories: string[] }[] = [
  { id: 'weapons', label: 'Weapons', categories: ['Weapon', 'SpecialWeapon'] },
  { id: 'ammo', label: 'Ammo', categories: ['Ammo'] },
  { id: 'armor', label: 'Armor', categories: ['Armor'] },
  { id: 'accessories', label: 'Accessories', categories: ['Accessory'] },
  { id: 'materials', label: 'Materials', categories: ['Material'] },
  { id: 'food', label: 'Food', categories: ['Food'] },
  { id: 'consumables', label: 'Consumables', categories: ['Consume'] },
  { id: 'key', label: 'Key items', categories: ['Essential'] },
  { id: 'schematics', label: 'Schematics', categories: ['Blueprint'] },
  { id: 'gliders', label: 'Gliders', categories: ['Glider'] },
  { id: 'modules', label: 'Sphere modules', categories: ['CaptureItemModifier'] },
];

const GROUP_BY_ID = new Map(ITEM_GROUPS.map((g) => [g.id, g]));

export function idsInGroup(groupId: string): string[] {
  const g = GROUP_BY_ID.get(groupId);
  if (!g) return [];
  const cats = new Set(g.categories);
  return ITEM_IDS.filter((i) => cats.has(ITEMS[i].category ?? ''));
}

export function groupOf(id: string): string | null {
  const cat = ITEMS[id]?.category;
  for (const g of ITEM_GROUPS) if (cat && g.categories.includes(cat)) return g.label;
  return null;
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
