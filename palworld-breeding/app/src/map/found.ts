/** "I've already got that one", on the website.
 *
 * Same idea and the same key format as the phone's map/found.ts, but a
 * separate file on purpose: the phone persists through AsyncStorage and the
 * browser through localStorage, and pretending one module can be both would
 * mean shimming a storage API into the parity-gated shared folder for no gain.
 * The KEYS match, so a future box-sync can carry ticks across without a
 * translation step.
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
