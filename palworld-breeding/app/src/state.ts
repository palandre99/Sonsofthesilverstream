/** Global app state: loaded data, the breeding engine, My Box, theme, routing. */
import { computed, effect, signal } from '@preact/signals';
import { BreedingEngine } from './engine/formula';
import type { BreedingData } from './engine/types';

export interface PalInfo {
  number: string;
  elements: string[];
  work: Record<string, number>;
  rarity: string | null;
  hp: number | null;
  atk: number | null;
  def: number | null;
  combi_rank: number | null;
  partner_skill: string | null;
  partner_effect: string | null;
  base_support: Record<string, unknown> | null;
  nocturnal: boolean | null;
  wild: boolean;
  regions: string[];
  egg_types: string[];
}

/** One entry of the 1.0 passive-skill database (data/passives_1_0.json). */
export interface PassiveInfo {
  name: string;
  tier: number | null;
  category: string;
  effects: string;
  /** false only where the source positively says it cannot be inherited */
  breedable: boolean;
  /** whether the source confirmed the breedable flag at all */
  breedable_known: boolean;
  /** only ever appears on a mutated pal first */
  mutation_exclusive: boolean;
  /** 1.0 gold "World Tree" tier — not in the wild random pool */
  world_tree: boolean;
  /** boss/legendary species that natively carry it */
  exclusive_to: string[];
  native_pals?: string[];
}

export const dataReady = signal(false);
export const pals = signal<Record<string, PalInfo>>({});
export const passives = signal<PassiveInfo[]>([]);
export const iconFiles = signal<Record<string, string>>({});
export let engine: BreedingEngine | null = null;
export const breedingRaw = signal<BreedingData | null>(null);
export const selfOnly = signal<Set<string>>(new Set());

const BOX_KEY = 'hatchlab-box-v2';
const BOX_KEY_V1 = 'hatchlab-box-v1';
const THEME_KEY = 'hatchlab-theme';

/** Per-species ownership with gender detail: do you have a male / a female? */
export interface OwnedGenders { m: boolean; f: boolean }
export const box = signal<Record<string, OwnedGenders>>({});
export const theme = signal<'dark' | 'light'>(
  (localStorage.getItem(THEME_KEY) as 'dark' | 'light') || 'dark',
);

effect(() => {
  document.documentElement.dataset.theme = theme.value;
  localStorage.setItem(THEME_KEY, theme.value);
});

function saveBox(next: Record<string, OwnedGenders>): void {
  box.value = next;
  localStorage.setItem(BOX_KEY, JSON.stringify(next));
}

export function setOwnedGender(name: string, gender: 'm' | 'f', val: boolean): void {
  const cur = box.value[name] ?? { m: false, f: false };
  const entry = { ...cur, [gender]: val };
  const next = { ...box.value };
  if (!entry.m && !entry.f) delete next[name];
  else next[name] = entry;
  saveBox(next);
}

/** Convenience: toggle full ownership (both genders on, or clear). */
export function toggleOwned(name: string): void {
  const cur = box.value[name];
  const next = { ...box.value };
  if (cur) delete next[name];
  else next[name] = { m: true, f: true };
  saveBox(next);
}

export function ownedAny(name: string): boolean {
  const o = box.value[name];
  return !!(o && (o.m || o.f));
}

export function hasGender(name: string, g: 'm' | 'f'): boolean {
  return !!box.value[name]?.[g];
}

/** Can these two species pair up RIGHT NOW given owned genders?
 * genderNote (from a gendered combo) pins which parent must be female. */
export function canPairNow(a: string, b: string, genderNote?: string | null): boolean {
  const oa = box.value[a];
  const ob = box.value[b];
  if (!oa || !ob) return false;
  if (a === b) return oa.m && oa.f;
  if (genderNote) {
    return genderNote.includes(`female ${a}`) ? oa.f && ob.m : oa.m && ob.f;
  }
  return (oa.m && ob.f) || (oa.f && ob.m);
}

export const ownedCount = computed(() => Object.keys(box.value).length);
export const pairReadyCount = computed(
  () => Object.values(box.value).filter((o) => o.m && o.f).length,
);

export const verification = signal<{ claim: string; verdict: string; evidence: string }[]>([]);

export async function loadData(): Promise<void> {
  const emb = (window as unknown as { __HATCHLAB_EMBED?: {
    breeding: BreedingData; pals: { pals: Record<string, PalInfo> };
    icons: Record<string, string>; verification: { claims: never[] };
    passives: { passives: PassiveInfo[] };
  } }).__HATCHLAB_EMBED;
  const [breeding, palsJson, icons, verif, passivesJson] = emb
    ? [emb.breeding, emb.pals, { files: emb.icons }, emb.verification, emb.passives]
    : await Promise.all([
        fetch('data/breeding_1_0.json').then((r) => r.json()) as Promise<BreedingData>,
        fetch('data/pals_1_0.json').then((r) => r.json()),
        fetch('data/icon_map.json').then((r) => r.json()),
        fetch('data/verification.json').then((r) => r.json()),
        fetch('data/passives_1_0.json').then((r) => r.json()),
      ]);
  verification.value = (verif as { claims: never[] } | undefined)?.claims ?? [];
  passives.value = (passivesJson as { passives: PassiveInfo[] } | undefined)?.passives ?? [];
  engine = new BreedingEngine(breeding);
  breedingRaw.value = breeding;
  selfOnly.value = new Set(breeding.self_breed_only);
  pals.value = palsJson.pals;
  iconFiles.value = icons.files;
  try {
    const v2 = localStorage.getItem(BOX_KEY);
    if (v2) {
      const saved = JSON.parse(v2) as Record<string, OwnedGenders>;
      box.value = Object.fromEntries(
        Object.entries(saved).filter(([n]) => n in palsJson.pals),
      );
    } else {
      // migrate v1 (names only): assume both genders, user can refine
      const v1 = JSON.parse(localStorage.getItem(BOX_KEY_V1) || '[]') as string[];
      box.value = Object.fromEntries(
        v1.filter((n) => n in palsJson.pals).map((n) => [n, { m: true, f: true }]),
      );
    }
  } catch {
    box.value = {};
  }
  dataReady.value = true;
}

/* ---------------- routing (hash-based) ---------------- */
export type Route =
  | { page: 'calc' }
  | { page: 'paldex'; pal?: string }
  | { page: 'box' }
  | { page: 'plan' }
  | { page: 'odds' }
  | { page: 'reference' };

function parseHash(): Route {
  const h = location.hash.replace(/^#\/?/, '');
  const [head, ...rest] = h.split('/');
  switch (head) {
    case 'paldex':
      return { page: 'paldex', pal: rest.length ? decodeURIComponent(rest.join('/')) : undefined };
    case 'box':
      return { page: 'box' };
    case 'plan':
      return { page: 'plan' };
    case 'odds':
      return { page: 'odds' };
    case 'reference':
      return { page: 'reference' };
    default:
      return { page: 'calc' };
  }
}

export const route = signal<Route>(parseHash());
window.addEventListener('hashchange', () => {
  route.value = parseHash();
});

export function nav(to: string): void {
  location.hash = to;
}

/* ---------------- helpers ---------------- */
export function workLabel(job: string): string {
  const j = job.replace(/_/g, ' ');
  return j === 'Generating Electricity' ? 'Electricity' : j;
}

export function topWork(p: PalInfo, n = 3): [string, number][] {
  return Object.entries(p.work ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, n) as [string, number][];
}

export function palNumberSort(a: string, b: string): number {
  const pa = pals.value[a]?.number ?? '';
  const pb = pals.value[b]?.number ?? '';
  const ma = /^(\d+)([A-Z]?)$/.exec(pa);
  const mb = /^(\d+)([A-Z]?)$/.exec(pb);
  if (ma && mb) {
    const d = Number(ma[1]) - Number(mb[1]);
    if (d) return d;
    return ma[2].localeCompare(mb[2]);
  }
  if (ma) return -1;
  if (mb) return 1;
  return a.localeCompare(b);
}
