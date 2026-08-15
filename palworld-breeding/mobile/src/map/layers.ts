/** What the map can show, and the state of what it IS showing.
 * Shared byte-for-byte between the phone app and the website.
 *
 * Two kinds of layer:
 *   POI layers   — fixed things (statues, towers, chests, ore, ...), 11,097 of
 *                  them, straight from the game's tables.
 *   Spawn layers — one per pal species, 68,617 points, each carrying its level
 *                  band and whether that band is night-only.
 *
 * Decoded point sets are cached per layer for the life of the session. A layer
 * the user never switches on is never decoded, so opening the map costs the
 * work of the layers actually visible and nothing more.
 */
import { MAP_POIS, type PoiLayer } from '../data/mapPois.g';
import { MAP_SPAWNS, type SpawnGroup } from '../data/mapSpawns.g';
import { decodePoints, unbase64, type PointSet } from './points';
import { REGION_BY_INDEX, type RegionId } from './projection';

export type LayerGroup = 'places' | 'pals' | 'collect' | 'resources';

export const GROUP_LABEL: Record<LayerGroup, string> = {
  places: 'Places',
  pals: 'Pals & bosses',
  collect: 'Things to collect',
  resources: 'Materials',
};

export interface TimeFilter {
  day: boolean;
  night: boolean;
}

export interface MapFilters {
  /** POI layer ids currently switched on */
  poi: Set<string>;
  /** pal species names currently switched on */
  pals: Set<string>;
  time: TimeFilter;
  /** inclusive level window applied to spawn layers */
  level: { lo: number; hi: number };
  region: RegionId;
}

export const ALL_LEVELS = { lo: 1, hi: 80 };

export function emptyFilters(): MapFilters {
  return {
    poi: new Set(),
    pals: new Set(),
    time: { day: true, night: true },
    level: { ...ALL_LEVELS },
    region: 'palpagos',
  };
}

export function poiLayers(): PoiLayer[] {
  return MAP_POIS;
}

export function poiLayer(id: string): PoiLayer | undefined {
  return MAP_POIS.find((l) => l.id === id);
}

/** Every pal we have spawn data for, in Paldex-friendly alphabetical order. */
export function spawnablePals(): string[] {
  return Object.keys(MAP_SPAWNS).sort((a, b) => a.localeCompare(b));
}

/* --------------------------------------------------------------- decoding */

const poiCache = new Map<string, PointSet>();
const spawnCache = new Map<string, PointSet>();

/** Points of a POI layer for one region. Decoded once, then reused. */
export function poiPoints(layerId: string, region: RegionId): PointSet | null {
  const key = `${layerId}|${region}`;
  const got = poiCache.get(key);
  if (got) return got;
  const layer = poiLayer(layerId);
  if (!layer) return null;

  const all = decodePoints(layer.pts);
  // `maps` is one raw byte per point (0 = Palpagos, 1 = World Tree), not uv
  // pairs, so it goes through the base64 reader directly.
  const maps = unbase64(layer.maps);
  const want = region === 'palpagos' ? 0 : 1;
  const keep: number[] = [];
  for (let i = 0; i < all.n; i++) if (maps[i] === want) keep.push(i);

  const set = subset(all, keep);
  poiCache.set(key, set);
  return set;
}

/**
 * Spawn points for one pal in one region, filtered by time of day and level.
 *
 * The cache key includes the filter, because a filtered layer is a different
 * point set — folding the filter in here keeps the render path free of any
 * per-frame predicate.
 */
export function spawnPoints(
  pal: string,
  region: RegionId,
  time: TimeFilter,
  level: { lo: number; hi: number },
): PointSet | null {
  const key = `${pal}|${region}|${time.day ? 'd' : ''}${time.night ? 'n' : ''}|${level.lo}-${level.hi}`;
  const got = spawnCache.get(key);
  if (got) return got;

  const groups = (MAP_SPAWNS[pal] ?? []).filter((g) => matches(g, region, time, level));
  if (groups.length === 0) return null;

  const parts = groups.map((g) => decodePoints(g.pts));
  const total = parts.reduce((n, p) => n + p.n, 0);
  const xy = new Float32Array(total * 2);
  let at = 0;
  for (const p of parts) {
    xy.set(p.xy, at * 2);
    at += p.n;
  }
  const set = decodeFromXY(xy, total);
  spawnCache.set(key, set);
  return set;
}

function matches(
  g: SpawnGroup,
  region: RegionId,
  time: TimeFilter,
  level: { lo: number; hi: number },
): boolean {
  if (REGION_BY_INDEX[g.m] !== region) return false;
  // A night-only band is hidden when night is off; an all-day band needs
  // either switch, since it is present at both times.
  if (g.night ? !time.night : !(time.day || time.night)) return false;
  return g.hi >= level.lo && g.lo <= level.hi;
}

/** Level band a pal spawns at in a region, for the UI to state plainly. */
export function spawnLevels(pal: string, region: RegionId): { lo: number; hi: number } | null {
  const groups = (MAP_SPAWNS[pal] ?? []).filter((g) => REGION_BY_INDEX[g.m] === region);
  if (!groups.length) return null;
  return {
    lo: Math.min(...groups.map((g) => g.lo)),
    hi: Math.max(...groups.map((g) => g.hi)),
  };
}

/** True when every band for this pal in this region is night-only. */
export function isNightOnly(pal: string, region: RegionId): boolean {
  const groups = (MAP_SPAWNS[pal] ?? []).filter((g) => REGION_BY_INDEX[g.m] === region);
  return groups.length > 0 && groups.every((g) => g.night);
}

/** Which regions a pal appears in at all. */
export function regionsFor(pal: string): RegionId[] {
  const seen = new Set<RegionId>();
  for (const g of MAP_SPAWNS[pal] ?? []) seen.add(REGION_BY_INDEX[g.m]);
  return [...seen];
}

/* ---------------------------------------------------------------- helpers */

function subset(set: PointSet, keep: number[]): PointSet {
  const xy = new Float32Array(keep.length * 2);
  keep.forEach((p, i) => {
    xy[i * 2] = set.xy[p * 2];
    xy[i * 2 + 1] = set.xy[p * 2 + 1];
  });
  return decodeFromXY(xy, keep.length);
}

/** Rebuild the bucket index for a derived point set. */
function decodeFromXY(xy: Float32Array, n: number): PointSet {
  const GRID = 64;
  const buckets = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const bx = Math.min(GRID - 1, Math.max(0, (xy[i * 2] * GRID) | 0));
    const by = Math.min(GRID - 1, Math.max(0, (xy[i * 2 + 1] * GRID) | 0));
    const key = by * GRID + bx;
    const list = buckets.get(key);
    if (list) list.push(i);
    else buckets.set(key, [i]);
  }
  const packed = new Map<number, Int32Array>();
  for (const [key, list] of buckets) packed.set(key, Int32Array.from(list));
  return { xy, n, buckets: packed };
}
