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

export interface ItemFactRow {
  desc?: string;
  recipe?: CraftRow[];
  recipesMore?: CraftRow[][];
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
  facts: Record<string, ItemFactRow>;
};

export const ITEM_FACTS: Record<string, ItemFactRow> = payload.facts;
export const MAP_OBJECT_NAMES: Record<string, string> = payload.mapObjectNames;
export const ITEM_FACT_COUNTS = payload.counts;
