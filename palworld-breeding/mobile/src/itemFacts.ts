/** The Items fane's fact layer — typed access over item_facts_1_0.json.
 *
 * Everything the full info card shows beyond the backbone + stat layers:
 * resolved descriptions, recipes (ingredient ids exact), the technology
 * unlock (level + point cost + ancient flag, from the tech tree joined at
 * node identity), capture power, food/consumable effects, and where to
 * find it (dropped-by, treasure boxes with drop rates, merchant shops).
 * Provenance and the validation counts live in the payload's own header;
 * the generator is tools/gen_item_facts.py.
 */
import factsJson from './data/item_facts_1_0.json';

export interface CraftRow { id: string; n: number }

export interface TierCraft {
  product: string;
  mats: CraftRow[];
  schematic?: string;
}

export interface ItemFactRow {
  desc?: string;
  recipe?: CraftRow[];
  recipesMore?: CraftRow[][];
  crafts?: TierCraft[];
  research?: string[];
  grants?: string[];
  tech?: { level: number; cost?: number; ancient?: boolean };
  capture?: string;
  effects?: [string, string][];
  drops?: { src: string; n: string; p: string }[];
  boxes?: { src: string; n: string; p: string }[];
  shops?: string[];
}

const payload = factsJson as unknown as {
  counts: Record<string, number>;
  mapObjectNames: Record<string, string>;
  equipPassiveNames: Record<string, string>;
  facts: Record<string, ItemFactRow>;
};

export const ITEM_FACTS: Record<string, ItemFactRow> = payload.facts;
export const MAP_OBJECT_NAMES: Record<string, string> = payload.mapObjectNames;
export const ITEM_FACT_COUNTS = payload.counts;

/** Equipment-passive id -> the game's display name ("Cold Resistance
 * Lv. 2") — the stats layer's raw ids never reach a screen directly. */
export const EQUIP_PASSIVE_NAMES: Record<string, string> =
  payload.equipPassiveNames;
export const equipPassiveName = (id: string): string =>
  EQUIP_PASSIVE_NAMES[id] ?? id;
