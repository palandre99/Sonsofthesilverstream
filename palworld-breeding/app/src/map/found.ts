/** "I've already got that one", on the website.
 *
 * Same idea as the phone's map/found.ts, but a separate file on purpose: the
 * phone persists through AsyncStorage and the browser through localStorage,
 * and pretending one module can be both would mean shimming a storage API
 * into the parity-gated shared folder for no gain.
 *
 * WHAT MATCHES AND WHAT DOES NOT — this used to claim "the KEYS match, so a
 * future box-sync can carry ticks across without a translation step", and
 * that was wrong in the half that matters:
 *
 *   tick format   `layerId:region:index`   — IDENTICAL, verified by test
 *   storage key   phone `palforge-<profileId>-mapfound`
 *                 web   `palforge-mapfound`
 *
 * The website has no save profiles at all, so a single flat key is right for
 * it; the phone scopes ticks to the active save the way it scopes the box.
 * A sync therefore has to CHOOSE a profile when it moves ticks either way.
 * The tick strings themselves need no translation.
 */
import type { RegionId } from './projection';

export type FoundKey = string;

export function foundKey(layerId: string, region: RegionId, index: number): FoundKey {
  return `${layerId}:${region}:${index}`;
}

const KEY = 'palforge-mapfound';

function read(): Set<FoundKey> {
  try {
    const raw = localStorage.getItem(KEY);
    return new Set<FoundKey>(raw ? (JSON.parse(raw) as FoundKey[]) : []);
  } catch {
    return new Set();   // private mode or a corrupt value is not worth a crash
  }
}

let found = read();

function write(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...found]));
  } catch { /* keep the tick in memory even if the browser refuses to store it */ }
}

export function isFound(key: FoundKey): boolean {
  return found.has(key);
}

export function foundCount(): number {
  return found.size;
}

export function toggleFound(key: FoundKey): void {
  if (found.has(key)) found.delete(key);
  else found.add(key);
  write();
}

export function clearFound(): void {
  found = new Set();
  write();
}
