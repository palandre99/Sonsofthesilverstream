/** Shared filter + sort logic for pal lists (Paldex AND the picker) —
 * pure functions, no UI, imports store only (no import cycles). */
import { genderUnsure, hasGender, ownedAny, palNumberSort, pals } from '../store';

export type SortKey = 'number' | 'name' | 'rarity_desc' | 'rarity_asc'
  | 'hp' | 'atk' | 'def' | `work:${string}`;

export const RARITY_RANK: Record<string, number> = { Legendary: 3, Epic: 2, Rare: 1, Common: 0 };

export const WORK_KEYS = ['Kindling', 'Watering', 'Planting', 'Generating_Electricity',
  'Handiwork', 'Gathering', 'Lumbering', 'Mining', 'Medicine', 'Cooling',
  'Transporting', 'Farming'];

export function sortedPals(list: string[], key: SortKey): string[] {
  const arr = [...list];
  switch (key) {
    case 'number': return arr.sort(palNumberSort);
    case 'name': return arr.sort((a, b) => a.localeCompare(b));
    case 'rarity_desc': return arr.sort((a, b) =>
      (RARITY_RANK[pals[b]?.rarity ?? ''] ?? -1) - (RARITY_RANK[pals[a]?.rarity ?? ''] ?? -1)
      || palNumberSort(a, b));
    case 'rarity_asc': return arr.sort((a, b) =>
      (RARITY_RANK[pals[a]?.rarity ?? ''] ?? -1) - (RARITY_RANK[pals[b]?.rarity ?? ''] ?? -1)
      || palNumberSort(a, b));
    case 'hp': return arr.sort((a, b) => (pals[b]?.hp ?? 0) - (pals[a]?.hp ?? 0));
    case 'atk': return arr.sort((a, b) => (pals[b]?.atk ?? 0) - (pals[a]?.atk ?? 0));
    case 'def': return arr.sort((a, b) => (pals[b]?.def ?? 0) - (pals[a]?.def ?? 0));
    default: {
      const job = key.slice(5);
      return arr.sort((a, b) =>
        ((pals[b]?.work ?? {})[job] ?? 0) - ((pals[a]?.work ?? {})[job] ?? 0)
        || palNumberSort(a, b));
    }
  }
}

export interface Filters {
  own: 'all' | 'owned' | 'missing' | 'pairready' | 'onegender' | 'unsure';
  elements: string[];
  work: string | null;
}

export const NO_FILTERS: Filters = { own: 'all', elements: [], work: null };

export function applyFilters(list: string[], f: Filters): string[] {
  let out = list;
  if (f.elements.length) {
    out = out.filter((n) => f.elements.some((e) => pals[n].elements.includes(e)));
  }
  if (f.work) out = out.filter((n) => ((pals[n].work ?? {})[f.work!] ?? 0) > 0);
  switch (f.own) {
    case 'owned': return out.filter(ownedAny);
    case 'missing': return out.filter((n) => !ownedAny(n));
    case 'pairready': return out.filter((n) => hasGender(n, 'm') && hasGender(n, 'f'));
    case 'onegender':
      return out.filter((n) => ownedAny(n) && !(hasGender(n, 'm') && hasGender(n, 'f')));
    // the whole point of the "?" mark: catch now, find them again at base
    case 'unsure': return out.filter(genderUnsure);
    default: return out;
  }
}

