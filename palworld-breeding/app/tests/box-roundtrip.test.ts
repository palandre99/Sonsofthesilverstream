/**
 * "Share my list" writes gender-suffixed lines, and the code says they are
 * "the exact format Import understands, so a collection moves between installs
 * in two taps". That is a promise about somebody's real save — the CEO's own
 * box is 26 pals with per-gender state — and losing a gender flag on the way
 * in is silent data loss, not a crash anyone would notice.
 *
 * Both platforms write the same three shapes: "Name" when you have both
 * genders, "Name ♂", "Name ♀". So the round trip is exercised for EVERY
 * species in all three states rather than a hand-picked few.
 *
 * The parser under test is the web's exported `parseImport`; the phone keeps
 * its own copy of the same regex in PaldexScreen.tsx. Format drift between
 * the writer and the reader is the failure this guards.
 */
// @vitest-environment happy-dom
// (paldex.tsx pulls in state.ts, which touches document at module load —
// the same directive every UI test in this folder uses)
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseImport } from '../src/modules/paldex';

const pals = (JSON.parse(
  readFileSync(join(__dirname, '../public/data/pals_1_0.json'), 'utf8'),
) as { pals: Record<string, unknown> }).pals;

const NAMES = Object.keys(pals);
const VALID = new Set(NAMES);

/** exactly what both Share buttons write for one pal */
function exportLine(name: string, g: { m: boolean; f: boolean }): string {
  return name + (g.m && g.f ? '' : g.m ? ' ♂' : ' ♀');
}

const STATES: { m: boolean; f: boolean }[] = [
  { m: true, f: true },
  { m: true, f: false },
  { m: false, f: true },
];

describe('a shared collection survives being imported again', () => {
  it('has a full dex to work with', () => {
    expect(NAMES.length).toBe(299);
  });

  it('round-trips every species in all three gender states', () => {
    const lost: string[] = [];
    for (const name of NAMES) {
      for (const state of STATES) {
        const { entries, unknown } = parseImport(exportLine(name, state), VALID);
        if (unknown.length || entries.length !== 1) {
          lost.push(`${exportLine(name, state)} → unread`);
          continue;
        }
        const [gotName, gotG] = entries[0];
        if (gotName !== name || gotG.m !== state.m || gotG.f !== state.f) {
          lost.push(`${exportLine(name, state)} → ${gotName} m=${gotG.m} f=${gotG.f}`);
        }
      }
    }
    expect(lost.slice(0, 10)).toEqual([]);
    expect(lost.length).toBe(0);
  });

  it('round-trips a whole collection in one paste', () => {
    // a mixed box: every third pal male-only, every fifth female-only
    const box = new Map<string, { m: boolean; f: boolean }>();
    NAMES.forEach((n, i) => {
      box.set(n, i % 3 === 0 ? { m: true, f: false }
        : i % 5 === 0 ? { m: false, f: true }
        : { m: true, f: true });
    });
    const text = [...box.keys()].sort()
      .map((n) => exportLine(n, box.get(n)!)).join('\n');

    const { entries, unknown } = parseImport(text, VALID);
    expect(unknown).toEqual([]);
    expect(entries.length).toBe(box.size);
    for (const [name, g] of entries) {
      const want = box.get(name)!;
      expect({ name, ...g }).toEqual({ name, ...want });
    }
  });

  it('does not resurrect a pal from a JSON backup that says false', () => {
    // the phone writes {m,f} objects; a false/null value must stay un-owned
    const json = JSON.stringify({ box: { Lamball: { m: true, f: false }, Cattiva: false, Chikipi: null } });
    const { entries } = parseImport(json, VALID);
    expect(entries.map(([n]) => n).sort()).toEqual(['Lamball']);
  });
});
