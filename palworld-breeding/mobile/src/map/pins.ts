/** "Remember this spot" — the player's own pins, per save profile.
 *
 * Every map worth using lets you mark a place the DATA does not know about:
 * where you parked a flying mount, the ledge you keep falling off, the spot
 * you want to build a base. Ours had 10,943 pins from the game files and no
 * way to add one of your own.
 *
 * Deliberately its own store rather than a field in store.ts, exactly like
 * map/found.ts: that file belongs to another session, and a player's pins
 * have no business being loaded before the Paldex is. It only READS the
 * active profile id, so pins follow the save you are on, the way your box and
 * your found-ticks already do.
 *
 * A pin is REGION-SCOPED. A mark you dropped on Palpagos must not appear on
 * the World Tree at the same uv — that would be the map stating a place is
 * somewhere it is not, which on this fane is the one unforgivable bug.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getActiveProfile } from '../store';
import type { RegionId } from './projection';

export interface MapPin {
  /** stable id, also its creation order */
  id: string;
  region: RegionId;
  /** position as map fractions, the same space every other marker uses */
  u: number;
  v: number;
  /** what the player will read — the game's own coordinates by default */
  label: string;
}

let pins: MapPin[] = [];
let loadedFor: string | null = null;
const listeners = new Set<() => void>();

function storageKey(profileId: string): string {
  return `palforge-${profileId}-mappins`;
}

function emit(): void {
  for (const fn of listeners) fn();
}

/** Subscribe to pin changes; returns an unsubscribe. */
export function onPinsChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Load this profile's pins. Safe to call on every mount — it no-ops unless
 * the profile actually changed, so switching saves swaps the pins with it.
 */
export async function loadPins(): Promise<void> {
  const id = getActiveProfile().id;
  if (loadedFor === id) return;
  loadedFor = id;
  try {
    const raw = await AsyncStorage.getItem(storageKey(id));
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    // A hand-edited or half-written file must not take the map down with it:
    // keep whatever rows still look like pins and drop the rest.
    pins = Array.isArray(parsed) ? parsed.filter(isPin) : [];
  } catch {
    pins = [];       // unreadable pins are not worth crashing a map for
  }
  emit();
}

function isPin(v: unknown): v is MapPin {
  if (typeof v !== 'object' || v === null) return false;
  const p = v as Partial<MapPin>;
  return typeof p.id === 'string'
    && typeof p.label === 'string'
    && (p.region === 'palpagos' || p.region === 'tree')
    && typeof p.u === 'number' && p.u >= 0 && p.u <= 1
    && typeof p.v === 'number' && p.v >= 0 && p.v <= 1;
}

/** Every pin on one map, oldest first. */
export function pinsIn(region: RegionId): MapPin[] {
  return pins.filter((p) => p.region === region);
}

export function pinCount(region: RegionId): number {
  return pinsIn(region).length;
}

function persist(): void {
  emit();
  const id = loadedFor;
  if (!id) return;
  void AsyncStorage.setItem(storageKey(id), JSON.stringify(pins))
    .catch(() => { /* keep the pin in memory even if the disk says no */ });
}

/**
 * Drop a pin, and hand back its id so the caller can show it straight away.
 * Off-map coordinates are refused rather than clamped: a pin silently moved
 * to the edge is a pin pointing at the wrong place.
 */
export function addPin(region: RegionId, u: number, v: number, label: string): string | null {
  if (!(u >= 0 && u <= 1 && v >= 0 && v <= 1)) return null;
  const id = `${Date.now().toString(36)}-${(pins.length + 1).toString(36)}`;
  pins = [...pins, { id, region, u, v, label }];
  persist();
  return id;
}

/**
 * Give a mark your own name.
 *
 * The label is PLAYER TEXT, which is the one kind of string this app does not
 * control, so it is trimmed and capped here rather than trusting every caller
 * to remember. An empty name is not stored: the caller passes the coordinate
 * label as the fallback, so a mark can never end up nameless.
 */
export const PIN_LABEL_MAX = 40;

export function renamePin(id: string, label: string): void {
  const clean = label.trim().slice(0, PIN_LABEL_MAX);
  if (!clean) return;
  let changed = false;
  pins = pins.map((p) => {
    if (p.id !== id || p.label === clean) return p;
    changed = true;
    return { ...p, label: clean };
  });
  if (changed) persist();
}

export function removePin(id: string): void {
  const before = pins.length;
  pins = pins.filter((p) => p.id !== id);
  if (pins.length !== before) persist();
}

/** Clear every pin on ONE map, leaving the other region's alone. */
export function clearPins(region: RegionId): void {
  const before = pins.length;
  pins = pins.filter((p) => p.region !== region);
  if (pins.length !== before) persist();
}
