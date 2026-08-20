/** Logic-parity gate — the recommendation brain follows the engine's
 * sacred rule: `src/logic/*` exists as identical copies in app/ and
 * mobile/. Changing one without the other forks what the website and the
 * phone recommend. This test fails the suite (and CI) on a single
 * differing byte. */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const APP = join(__dirname, '..', 'src', 'logic');
const MOBILE = join(__dirname, '..', '..', 'mobile', 'src', 'logic');

/** Every .ts file in either tree's src/logic is shared — DISCOVERED, not
 * hand-listed. A hand-maintained list silently un-guards any new logic file
 * the day it is added, which is the one moment the guard matters most
 * (self-found 2026-08-16 while adding unlock.ts). */
const SHARED = [...new Set([
  ...readdirSync(APP), ...readdirSync(MOBILE),
])].filter((f) => f.endsWith('.ts')).sort();

describe('logic copies', () => {
  it.each(SHARED)('%s is byte-identical in app/ and mobile/', (file) => {
    const a = readFileSync(join(APP, file));
    const b = readFileSync(join(MOBILE, file));
    expect(a.equals(b),
      `${file} differs between app/src/logic and mobile/src/logic — ` +
      'mirror the change to both copies').toBe(true);
  });

  it('no shared logic file is missing from either side', () => {
    const appFiles = new Set(readdirSync(APP));
    const mobileFiles = new Set(readdirSync(MOBILE));
    for (const f of SHARED) {
      expect(appFiles.has(f), `app missing ${f}`).toBe(true);
      expect(mobileFiles.has(f), `mobile missing ${f}`).toBe(true);
    }
  });
});
