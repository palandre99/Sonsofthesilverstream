/** "I beat that one" — the player's boss record, per save profile.
 *
 * The fane's lists grey out what is done (the check-off Paltopia's own
 * reviews keep asking for), and the record follows the save the player is
 * on, exactly like their box and their map ticks do.
 *
 * Deliberately its own store on the map lane's found.ts pattern: it only
 * READS the active profile id from store.ts, owns its own listeners, and
 * survives a failed disk write in memory. Keys are the boss variant's own
 * raw id (bp), so Normal and Hard are separate accomplishments — which
 * they are.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getActiveProfile } from '../store';

let beaten = new Set<string>();
let loadedFor: string | null = null;
const listeners = new Set<() => void>();

function storageKey(profileId: string): string {
  return `palforge-${profileId}-bossrecord`;
}

function emit(): void {
  for (const fn of listeners) fn();
}

/** Subscribe to record changes; returns an unsubscribe. */
export function onRecordChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Load this profile's record. Safe to call on every mount — it no-ops
 * unless the profile actually changed. */
export async function loadRecord(): Promise<void> {
  const id = getActiveProfile().id;
  if (loadedFor === id) return;
  loadedFor = id;
  try {
    const raw = await AsyncStorage.getItem(storageKey(id));
    beaten = new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    beaten = new Set(); // an unreadable record is not worth crashing for
  }
  emit();
}

export function isBeaten(bp: string): boolean {
  return beaten.has(bp);
}

export function beatenCount(bps: string[]): number {
  let n = 0;
  for (const bp of bps) if (beaten.has(bp)) n += 1;
  return n;
}

/** How many fights are ticked, across every kind. */
export function recordSize(): number {
  return beaten.size;
}

/** Forget every tick on this profile — the way out of a record you no
 * longer want. Tracking without a reset means 205 alphas can only be
 * untangled one row at a time, which is not a feature, it is a trap. */
export function clearRecord(): void {
  beaten = new Set();
  emit();
  const id = loadedFor;
  if (id) void AsyncStorage.removeItem(storageKey(id)).catch(() => {});
}

/** Tick or untick one fight, and persist. */
export function toggleBeaten(bp: string): void {
  if (beaten.has(bp)) beaten.delete(bp);
  else beaten.add(bp);
  emit();
  const id = loadedFor;
  if (!id) return;
  void AsyncStorage.setItem(storageKey(id), JSON.stringify([...beaten]))
    .catch(() => { /* keep the tick in memory even if the disk says no */ });
}
