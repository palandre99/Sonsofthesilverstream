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
import { REGION_SPOTS } from '../data/regionSpots.g';
import { MAP_ALPHAS, MAP_SPAWNS, type SpawnGroup } from '../data/mapSpawns.g';
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
  /** dungeon spawners are OFF by default: they are underground, so drawing
   *  them as open-world areas sends the player to an empty hillside */
  dungeons: boolean;
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
    dungeons: false,
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

const poiNameCache = new Map<string, string[]>();

/**
 * The place name of one marker, or '' when it has none.
 *
 * Statues, dungeons and towers carry real names from the game — "Beach of
 * Everlasting Summer" tells you far more than "Fast travel" does. Ore nodes
 * do not, and the extractor drops internal spawner codes entirely, so an
 * empty string here means "no name worth showing", never "name missing".
 */
export function poiName(layerId: string, region: RegionId, index: number): string {
  const key = `${layerId}|${region}`;
  let names = poiNameCache.get(key);
  if (!names) {
    const layer = poiLayer(layerId);
    if (!layer?.names) return '';
    const maps = unbase64(layer.maps);
    const want = region === 'palpagos' ? 0 : 1;
    names = layer.names.filter((_, i) => maps[i] === want);
    poiNameCache.set(key, names);
  }
  return names[index] ?? '';
}

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
  dungeons = false,
): PointSet | null {
  const key = `${pal}|${region}|${time.day ? 'd' : ''}${time.night ? 'n' : ''}`
    + `|${level.lo}-${level.hi}|${dungeons ? 'D' : ''}`;
  const got = spawnCache.get(key);
  if (got) return got;

  const groups = (MAP_SPAWNS[pal] ?? [])
    .filter((g) => matches(g, region, time, level) && (dungeons || !g.dun));
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

/**
 * Only the DUNGEON spawners for a pal, so they can be drawn as their own
 * layer rather than blended into the open-world one. Same information, but a
 * player can tell at a glance which pins mean "go inside".
 */
export function dungeonPoints(
  pal: string,
  region: RegionId,
  time: TimeFilter,
  level: { lo: number; hi: number },
): PointSet | null {
  const key = `${pal}|${region}|${time.day ? 'd' : ''}${time.night ? 'n' : ''}`
    + `|${level.lo}-${level.hi}|dungeon-only`;
  const got = spawnCache.get(key);
  if (got) return got;

  const groups = (MAP_SPAWNS[pal] ?? [])
    .filter((g) => g.dun && matches(g, region, time, level));
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

/** How many points are open-world vs inside dungeons, stated separately so
 *  the card never claims a dungeon spawner is a place you can walk to. */
export function spawnSplit(pal: string, region: RegionId): { field: number; dungeon: number } {
  let field = 0;
  let dungeon = 0;
  for (const g of MAP_SPAWNS[pal] ?? []) {
    if (REGION_BY_INDEX[g.m] !== region) continue;
    if (g.dun) dungeon += g.n; else field += g.n;
  }
  return { field, dungeon };
}

/**
 * The levels a pal is actually found at, split by where you'd meet it.
 *
 * The pal card used to quote one range from palcalc, which is the union of
 * open-world, dungeon and boss spawns — so Foxparks read "wild Lv 5 to 18"
 * while the map said 5-7, and 167 of 260 species disagreed the same way. A
 * player reading "found in wild" expects to walk out and meet one, so the two
 * cases are stated separately rather than blurred into one number.
 */
export function wildBands(pal: string): {
  surface: { lo: number; hi: number } | null;
  dungeon: { lo: number; hi: number } | null;
} {
  const pick = (dun: boolean) => {
    const groups = (MAP_SPAWNS[pal] ?? []).filter((g) => g.dun === dun);
    if (!groups.length) return null;
    return {
      lo: Math.min(...groups.map((g) => g.lo)),
      hi: Math.max(...groups.map((g) => g.hi)),
    };
  };
  return { surface: pick(false), dungeon: pick(true) };
}

/** Level band a pal spawns at in a region, for the UI to state plainly. */
export function spawnLevels(pal: string, region: RegionId): { lo: number; hi: number } | null {
  const groups = (MAP_SPAWNS[pal] ?? []).filter((g) => REGION_BY_INDEX[g.m] === region && !g.dun);
  if (!groups.length) return null;
  return {
    lo: Math.min(...groups.map((g) => g.lo)),
    hi: Math.max(...groups.map((g) => g.hi)),
  };
}

/** True when every band for this pal in this region is night-only. */
export function isNightOnly(pal: string, region: RegionId): boolean {
  const groups = (MAP_SPAWNS[pal] ?? [])
    .filter((g) => REGION_BY_INDEX[g.m] === region && !g.dun);
  return groups.length > 0 && groups.every((g) => g.night);
}

/**
 * Where this pal's FIXED BOSS stands, if it has one on this map.
 *
 * Picking a species used to show only its wild spawns, so the one guaranteed
 * place to meet it — usually the reason you were looking — was missing unless
 * you happened to have the Alpha layer switched on too.
 */
export function alphaSpots(pal: string, region: RegionId): { u: number; v: number; lv: number }[] {
  return (MAP_ALPHAS[pal] ?? [])
    .filter((a) => REGION_BY_INDEX[a.m] === region)
    .map((a) => ({ u: a.u, v: a.v, lv: a.lv }));
}

/** Which regions a pal appears in at all. */
export function regionsFor(pal: string): RegionId[] {
  const seen = new Set<RegionId>();
  for (const g of MAP_SPAWNS[pal] ?? []) seen.add(REGION_BY_INDEX[g.m]);
  return [...seen];
}

/**
 * Places you can search for by name.
 *
 * 150 real place names came in with the POI data — "Fisherman's Point",
 * "Beach of Everlasting Summer" — and for a while nothing in the app could
 * answer "where is that?". Built once per region, then reused.
 */
export interface PlaceHit {
  name: string;
  layerId: string;
  label: string;
  colour: string;
  u: number;
  v: number;
}

const placeIndex = new Map<RegionId, PlaceHit[]>();

function buildPlaces(region: RegionId): PlaceHit[] {
  const out: PlaceHit[] = [];
  for (const layer of MAP_POIS) {
    if (!layer.names) continue;
    const set = poiPoints(layer.id, region);
    if (!set) continue;
    const maps = unbase64(layer.maps);
    const want = region === 'palpagos' ? 0 : 1;
    const names = layer.names.filter((_, i) => maps[i] === want);
    for (let i = 0; i < set.n; i++) {
      const name = names[i];
      if (!name) continue;
      out.push({
        name,
        layerId: layer.id,
        label: layer.label,
        colour: layer.colour,
        u: set.xy[i * 2],
        v: set.xy[i * 2 + 1],
      });
    }
  }
  // The 76 REGION LABELS printed across the map belong in here too.
  //
  // They were missing, so a player could read "Bicornis Islet" on screen, type
  // it into a box that says it searches places, and be told nothing matched.
  // The app draws the name and then denies knowing it — the same failure as
  // the search that could not find sulfur.
  //
  // They carry no layer of their own, so they borrow the fast-travel colour
  // and are labelled for what they are: an area, not a marker you can tick.
  if (region === 'palpagos') {
    for (const [name, at] of Object.entries(REGION_SPOTS)) {
      out.push({
        name,
        layerId: 'region',
        label: 'Area',
        colour: '#5FE3C0',
        u: at.x,
        v: at.y,
      });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Place-name matches for a query, deduped by name so 155 statues do not
 *  bury everything else. */
export function searchPlaces(query: string, region: RegionId, limit = 8): PlaceHit[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];
  let all = placeIndex.get(region);
  if (!all) {
    all = buildPlaces(region);
    placeIndex.set(region, all);
  }
  const seen = new Set<string>();
  const hits: PlaceHit[] = [];
  for (const p of all) {
    if (!p.name.toLowerCase().includes(needle) || seen.has(p.name)) continue;
    seen.add(p.name);
    hits.push(p);
    if (hits.length >= limit) break;
  }
  return hits;
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
