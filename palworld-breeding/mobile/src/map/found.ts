/** "I've already got that one" — per save profile.
 *
 * Every competitor map lets you tick a chest off; without it, a 1,610-chest
 * layer is the same wall on your fiftieth visit as on your first.
 *
 * Deliberately its own store rather than a field in store.ts: that file
 * belongs to another session right now, and marker ticks have no business
 * being loaded before the Paldex is. It only READS the active profile id, so
 * ticks follow the save the player is on, exactly like their box does.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getActiveProfile } from '../store';
import type { RegionId } from './projection';

/** layer + region + the marker's index within that region */
export type FoundKey = string;

export function foundKey(layerId: string, region: RegionId, index: number): FoundKey {
  return `${layerId}:${region}:${index}`;
}

let found = new Set<FoundKey>();
let loadedFor: string | null = null;
const listeners = new Set<() => void>();

function storageKey(profileId: string): string {
  return `palforge-${profileId}-mapfound`;
}

function emit(): void {
  for (const fn of listeners) fn();
}

/** Subscribe to tick changes; returns an unsubscribe. */
export function onFoundChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Load this profile's ticks. Safe to call on every mount — it no-ops unless
 * the profile actually changed, so switching saves swaps the ticks with it.
 */
export async function loadFound(): Promise<void> {
  const id = getActiveProfile().id;
  if (loadedFor === id) return;
  loadedFor = id;
  try {
    const raw = await AsyncStorage.getItem(storageKey(id));
    found = new Set<FoundKey>(raw ? (JSON.parse(raw) as FoundKey[]) : []);
  } catch {
    found = new Set();      // unreadable ticks are not worth crashing a map for
  }
  emit();
}

export function isFound(key: FoundKey): boolean {
  return found.has(key);
}

/** How many of ONE layer's spots on ONE map are ticked found — the chips
 *  read this so the Layers sheet doubles as a collection dashboard. */
export function foundCountFor(layerId: string, region: RegionId): number {
  const prefix = `${layerId}:${region}:`;
  let n = 0;
  for (const k of found) if (k.startsWith(prefix)) n += 1;
  return n;
}

export function foundCount(): number {
  return found.size;
}

/** Tick or untick one marker, and persist. */
export function toggleFound(key: FoundKey): void {
  if (found.has(key)) found.delete(key);
  else found.add(key);
  emit();
  const id = loadedFor;
  if (!id) return;
  void AsyncStorage.setItem(storageKey(id), JSON.stringify([...found]))
    .catch(() => { /* keep the tick in memory even if the disk says no */ });
}

/** Clear every tick for the current profile. */
export function clearFound(): void {
  found = new Set();
  emit();
  const id = loadedFor;
  if (id) void AsyncStorage.removeItem(storageKey(id)).catch(() => {});
}
