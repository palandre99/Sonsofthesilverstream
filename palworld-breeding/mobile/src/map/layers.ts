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
import { REGION_BY_INDEX, type RegionId, regionOf } from './projection';

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

/**
 * Level band a pal spawns at in a region, for the UI to state plainly.
 *
 * `underground` also counts spawns inside dungeons. It exists because this
 * function doubles as the test for "does this pal live here at all", and with
 * surface spawns only that answer was NO for 25 species that the map has real
 * data for — Mau has 174 dungeon spawns on Palpagos and could not be found in
 * the search at all, with or without "Also show dungeon spawns" ticked. The
 * default stays surface-only: a player reading a level band expects to walk
 * out and meet one.
 */
export function spawnLevels(
  pal: string, region: RegionId, underground = false,
): { lo: number; hi: number } | null {
  const groups = (MAP_SPAWNS[pal] ?? []).filter(
    (g) => REGION_BY_INDEX[g.m] === region && (underground || !g.dun),
  );
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

/* ------------------------------------------------- rescuing a mistyped name */

/**
 * Edit distance, abandoned as soon as it exceeds `cap`.
 *
 * Pal names are invented words — Foxparks, Jormuntide, Katress Ignis — typed
 * on a phone keyboard, so transposing two letters is the normal case rather
 * than the exotic one. The map's search is a substring match, which is right
 * for the common path and gives NOTHING for "foxpraks". The player is then
 * told, correctly and uselessly, that nothing goes by that name.
 *
 * Capped because we only ever ask "is this close enough", never "how far".
 */
function editDistance(a: string, b: string, cap: number): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  // Optimal string alignment, NOT plain Levenshtein: a swapped pair of
  // adjacent letters costs ONE edit here and two there. That distinction is
  // the whole point — swapping two letters is the commonest typo on a phone,
  // and charging it double meant a short name could never survive its most
  // likely misspelling. "ignsi" is one slip from "ignis" and two from nothing.
  let two = new Array<number>(b.length + 1);
  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let best = curr[0];
    for (let j = 1; j <= b.length; j++) {
      const sub = prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      let v = Math.min(sub, prev[j] + 1, curr[j - 1] + 1);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, two[j - 2] + 1);          // the swap
      }
      curr[j] = v;
      if (v < best) best = v;
    }
    if (best > cap) return cap + 1;      // this row is already too far gone
    const spare = two;
    two = prev;
    prev = curr;
    curr = spare;
  }
  return prev[b.length];
}

/**
 * Names a typo was probably reaching for. ONLY consulted when the exact
 * search found nothing, so the common path is untouched and cannot regress.
 *
 * Matches against each WORD as well as the whole name, so "ignis" still finds
 * "Katress Ignis" and a typo in the second word is caught too.
 */
export function closeMatches(query: string, names: string[], limit = 6): string[] {
  const q = query.trim().toLowerCase();
  // two letters is not a typo, it is a prefix, and it would match half the box
  if (q.length < 3) return [];
  // one slip per four characters, so short names are not matched to anything
  const cap = q.length <= 5 ? 1 : 2;

  const scored: { name: string; d: number }[] = [];
  for (const name of names) {
    const low = name.toLowerCase();
    let best = editDistance(q, low, cap);
    if (best > cap) {
      for (const word of low.split(' ')) {
        const d = editDistance(q, word, cap);
        if (d < best) best = d;
      }
    }
    if (best <= cap) scored.push({ name, d: best });
  }
  scored.sort((x, y) => (x.d - y.d) || x.name.localeCompare(y.name));
  return scored.slice(0, limit).map((r) => r.name);
}

/* ------------------------------------------------- where IS this, in words */

/**
 * "Exactly where small hidden stuff is" (CEO, 2026-08-17): a chest pin at
 * deep zoom is a dot on terrain — the words a player actually navigates by
 * are "how far, which way, from which statue". Both endpoints are datamined
 * points; the distance is arithmetic between them, not an estimate.
 *
 * UNITS: Unreal's standard world unit is one centimetre (engine convention,
 * documented by Epic; Palworld is UE5 and its datamined readout scale of
 * 458.52 world units per map-grid step is consistent with it). Distances
 * are world-unit differences divided by 100 — metres in the engine's own
 * terms. A test executes this over every chest on Palpagos and fails if the
 * nearest-statue distribution leaves the plausible band, so a wrong unit
 * cannot ship silently.
 *
 * AXES: u runs west->east along worldY, v runs north->south along worldX
 * (the map texture swaps them — see worldToUv). Distance must weight each
 * axis by ITS OWN world span, and "north" is falling v.
 */
export interface WhereFrom {
  /** the statue's display name, the game's own */
  name: string;
  metres: number;
  /** 8-way compass word, lowercase ("north-east") */
  dir: string;
}

const COMPASS = ['north', 'north-east', 'east', 'south-east',
  'south', 'south-west', 'west', 'north-west'];

export function whereFrom(u: number, v: number, region: RegionId): WhereFrom | null {
  const set = poiPoints('fast_travel', region);
  if (!set || set.n === 0) return null;
  const r = regionOf(region);
  const spanU = r.maxY - r.minY;   // u maps worldY
  const spanV = r.maxX - r.minX;   // v maps worldX
  let bi = -1;
  let bd = Infinity;
  for (let i = 0; i < set.n; i++) {
    const dx = (set.xy[i * 2] - u) * spanU;
    const dy = (set.xy[i * 2 + 1] - v) * spanV;
    const d = dx * dx + dy * dy;
    if (d < bd) { bd = d; bi = i; }
  }
  const metres = Math.sqrt(bd) / 100;
  // FROM the statue TO the point: how the sentence reads ("north-east OF X")
  const east = (u - set.xy[bi * 2]) * spanU;
  const north = -(v - set.xy[bi * 2 + 1]) * spanV;
  const angle = Math.atan2(east, north);            // 0 = north, cw positive
  const dir = COMPASS[((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8];
  return { name: poiName('fast_travel', region, bi), metres, dir };
}

/** The sentence the card prints, or null when it would be silly (the point
 *  IS a statue, or the region has none). Rounded to 10 m — GPS-app honesty,
 *  not fake single-metre precision. */
export function whereFromLine(u: number, v: number, region: RegionId): string | null {
  const w = whereFrom(u, v, region);
  if (!w) return null;
  if (w.metres < 30) return null;   // you are basically standing on it
  const m = Math.round(w.metres / 10) * 10;
  // some statue names already END in "Statue" (Great Eagle Statue) — caught
  // on screen as "the Great Eagle Statue statue"
  const suffix = /statue$/i.test(w.name) ? '' : ' statue';
  return `${m} m ${w.dir} of the ${w.name}${suffix}`;
}

/* --------------------------------------------- the list behind a layer */

/** Does this layer carry a real name per point? (The list feature only
 *  exists where the game named the things — a list of "Chest, Chest,
 *  Chest" 1,572 times would be noise pretending to be information.) */
export function hasNames(layerId: string): boolean {
  return poiLayer(layerId)?.names != null;
}

export interface NamedPoint {
  name: string;
  u: number;
  v: number;
  /** index into this REGION's point set — feeds poiName and foundKey */
  index: number;
}

/**
 * Every named point of a layer on one map, ALPHABETICAL — "so I can find
 * the one I am looking for instead of looking all over the map" (CEO).
 * Scanning a list is a by-name job; the level rides along as detail.
 */
/**
 * How a list row files itself. Sealed realms are all named
 * "Sealed Realm (<boss>)", so a plain alphabetical sort files 18 rows
 * under S and the scanning token hides in parentheses — the list sorts by
 * the boss instead. The NAME shown is still the game's own, untouched.
 */
export function listSortKey(layerId: string, name: string): string {
  if (layerId === 'sealed_realm') {
    const m = /^Sealed Realm \((.+)\)$/.exec(name);
    if (m) return m[1];
  }
  return name;
}

export function namedPoints(layerId: string, region: RegionId): NamedPoint[] {
  const set = poiPoints(layerId, region);
  if (!set || !hasNames(layerId)) return [];
  const out: NamedPoint[] = [];
  for (let i = 0; i < set.n; i++) {
    const name = poiName(layerId, region, i);
    if (!name) continue;   // a nameless row cannot be found by name
    out.push({ name, u: set.xy[i * 2], v: set.xy[i * 2 + 1], index: i });
  }
  out.sort((a, b) => listSortKey(layerId, a.name).localeCompare(listSortKey(layerId, b.name)));
  return out;
}
