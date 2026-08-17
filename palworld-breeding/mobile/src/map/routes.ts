/** "My route" — the player's own ordered path across the map, per save.
 *
 * A route is what a farming run actually is: THESE spots, in THIS order.
 * Every stop is a SELF-CONTAINED copy `{u, v, label}` of a mark at the moment
 * it was added — never a reference to a pin id — so deleting a mark can never
 * break a route, and the whole list serialises cleanly for sharing later.
 *
 * THE ONE RULE OF THIS FILE: it never reorders. The player owns the order;
 * an "optimal" ordering would be an estimate, and this map does not estimate.
 * Stops are appended, filtered, or cleared — there is no sort here and there
 * must never be one.
 *
 * Same shape as pins.ts / found.ts and for the same reasons: its own store,
 * READS the active profile id only, region-scoped (a route on Palpagos must
 * not draw on the World Tree — the map stating a path is somewhere it is not
 * is this fane's one unforgivable bug).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getActiveProfile } from '../store';
import type { RegionId } from './projection';

export interface RouteStop {
  region: RegionId;
  /** position as map fractions, the same space every other marker uses */
  u: number;
  v: number;
  /** copied from the mark when it was added — the player's own words */
  label: string;
}

let stops: RouteStop[] = [];
let loadedFor: string | null = null;
const listeners = new Set<() => void>();

function storageKey(profileId: string): string {
  return `palforge-${profileId}-maproutes`;
}

function emit(): void {
  for (const fn of listeners) fn();
}

/** Subscribe to route changes; returns an unsubscribe. */
export function onRouteChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Load this profile's route. Safe to call on every mount — it no-ops unless
 * the profile actually changed, so switching saves swaps the route with it.
 */
export async function loadRoute(): Promise<void> {
  const id = getActiveProfile().id;
  if (loadedFor === id) return;
  loadedFor = id;
  try {
    const raw = await AsyncStorage.getItem(storageKey(id));
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    // A hand-edited or half-written file must not take the map down with it:
    // keep whatever rows still look like stops, IN THE ORDER THEY APPEAR,
    // and drop the rest.
    stops = Array.isArray(parsed) ? parsed.filter(isStop) : [];
  } catch {
    stops = [];      // an unreadable route is not worth crashing a map for
  }
  emit();
}

function isStop(v: unknown): v is RouteStop {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Partial<RouteStop>;
  return typeof s.label === 'string'
    && (s.region === 'palpagos' || s.region === 'tree')
    && typeof s.u === 'number' && s.u >= 0 && s.u <= 1
    && typeof s.v === 'number' && s.v >= 0 && s.v <= 1;
}

/**
 * This map's route, in the player's order. `filter` keeps relative order,
 * which is the property that makes this a route and not a set of dots.
 */
export function routeIn(region: RegionId): RouteStop[] {
  return stops.filter((s) => s.region === region);
}

export function stopCount(region: RegionId): number {
  return routeIn(region).length;
}

function persist(): void {
  emit();
  const id = loadedFor;
  if (!id) return;
  void AsyncStorage.setItem(storageKey(id), JSON.stringify(stops))
    .catch(() => { /* keep the route in memory even if the disk says no */ });
}

/**
 * Append the next stop — always at the end, never inserted, never sorted.
 * Off-map coordinates are refused rather than clamped, exactly like pins.
 * Adding the SAME spot twice in a row is refused too: a zero-length leg is
 * always a double-tap, never a route ("base → ore → base" repeats are fine —
 * those are not consecutive).
 */
export function addStop(region: RegionId, u: number, v: number, label: string): boolean {
  if (!(u >= 0 && u <= 1 && v >= 0 && v <= 1)) return false;
  const here = routeIn(region);
  const last = here[here.length - 1];
  if (last && last.u === u && last.v === v) return false;
  stops = [...stops, { region, u, v, label }];
  persist();
  return true;
}

/**
 * Remove ONE stop — the index-th stop OF THIS REGION'S route, which is the
 * number printed on its badge minus one. Position IS identity here: stops
 * carry no ids on purpose (nothing but a migration to gain), and the player
 * points at "stop 3", not at a key. Everything else keeps its order —
 * renumbering happens by position, never by re-sorting.
 */
export function removeStop(region: RegionId, index: number): void {
  let seen = -1;
  const next = stops.filter((s) => {
    if (s.region !== region) return true;
    seen += 1;
    return seen !== index;
  });
  if (next.length !== stops.length) {
    stops = next;
    persist();
  }
}

/** Clear the route on ONE map, leaving the other region's alone. */
export function clearRoute(region: RegionId): void {
  const before = stops.length;
  stops = stops.filter((s) => s.region !== region);
  if (stops.length !== before) persist();
}
