/** Engine-parity gate — the sacred rule, enforced by CI instead of memory.
 *
 * `engine/formula.ts`, `planner.ts`, `odds.ts`, `helpers.ts`, `boosters.ts`,
 * `types.ts` exist as identical copies in app/ and mobile/. Changing one
 * without the other forks behaviour between the website and the phone —
 * the one bug class this project can never afford. This test fails the
 * suite (and CI, which runs on every push) on a single differing byte.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const APP = join(__dirname, '..', 'src', 'engine');
const MOBILE = join(__dirname, '..', '..', 'mobile', 'src', 'engine');

/** engine files that must exist in BOTH trees (web-only worker files exempt) */
const SHARED = ['formula.ts', 'planner.ts', 'odds.ts', 'helpers.ts',
  'boosters.ts', 'types.ts'];

describe('engine copies', () => {
  it.each(SHARED)('%s is byte-identical in app/ and mobile/', (file) => {
    const a = readFileSync(join(APP, file));
    const b = readFileSync(join(MOBILE, file));
    expect(a.equals(b),
      `${file} differs between app/src/engine and mobile/src/engine — ` +
      'mirror the change to both copies').toBe(true);
  });

  it('no shared engine file is missing from either side', () => {
    const appFiles = new Set(readdirSync(APP));
    const mobileFiles = new Set(readdirSync(MOBILE));
    for (const f of SHARED) {
      expect(appFiles.has(f), `app missing ${f}`).toBe(true);
      expect(mobileFiles.has(f), `mobile missing ${f}`).toBe(true);
    }
  });
});
