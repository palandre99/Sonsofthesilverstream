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

export const dataReady = signal(false);
export const pals = signal<Record<string, PalInfo>>({});
export const iconFiles = signal<Record<string, string>>({});
export let engine: BreedingEngine | null = null;
export const breedingRaw = signal<BreedingData | null>(null);
export const selfOnly = signal<Set<string>>(new Set());

const BOX_KEY = 'hatchlab-box-v1';
const THEME_KEY = 'hatchlab-theme';

export const box = signal<Set<string>>(new Set());
export const theme = signal<'dark' | 'light'>(
  (localStorage.getItem(THEME_KEY) as 'dark' | 'light') || 'dark',
);

effect(() => {
  document.documentElement.dataset.theme = theme.value;
  localStorage.setItem(THEME_KEY, theme.value);
});

export function toggleOwned(name: string): void {
  const next = new Set(box.value);
  if (next.has(name)) next.delete(name);
  else next.add(name);
  box.value = next;
  localStorage.setItem(BOX_KEY, JSON.stringify([...next].sort()));
}

export const ownedCount = computed(() => box.value.size);

export const verification = signal<{ claim: string; verdict: string; evidence: string }[]>([]);

export async function loadData(): Promise<void> {
  const emb = (window as unknown as { __HATCHLAB_EMBED?: {
    breeding: BreedingData; pals: { pals: Record<string, PalInfo> };
    icons: Record<string, string>; verification: { claims: never[] };
  } }).__HATCHLAB_EMBED;
  const [breeding, palsJson, icons, verif] = emb
    ? [emb.breeding, emb.pals, { files: emb.icons }, emb.verification]
    : await Promise.all([
        fetch('data/breeding_1_0.json').then((r) => r.json()) as Promise<BreedingData>,
        fetch('data/pals_1_0.json').then((r) => r.json()),
        fetch('data/icon_map.json').then((r) => r.json()),
        fetch('data/verification.json').then((r) => r.json()),
      ]);
  verification.value = (verif as { claims: never[] } | undefined)?.claims ?? [];
  engine = new BreedingEngine(breeding);
  breedingRaw.value = breeding;
  selfOnly.value = new Set(breeding.self_breed_only);
  pals.value = palsJson.pals;
  iconFiles.value = icons.files;
  try {
    const saved = JSON.parse(localStorage.getItem(BOX_KEY) || '[]') as string[];
    box.value = new Set(saved.filter((n) => n in palsJson.pals));
  } catch {
    box.value = new Set();
  }
  dataReady.value = true;
}

/* ---------------- routing (hash-based) ---------------- */
export type Route =
  | { page: 'calc' }
  | { page: 'paldex'; pal?: string }
  | { page: 'box' }
  | { page: 'plan' }
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
