/**
 * The empty Paldex now offers "Try a sample box" — one tap fills the
 * collection with twelve pals so the Planner answers real questions before
 * anyone has ticked anything.
 *
 * That button makes two promises the player cannot check, and one the app
 * must never break:
 *
 *   1. HONEST — these are pals you actually have in your first hour. If the
 *      list drifts towards convenient-but-late species (a Jetragon would make
 *      a lovely demo) the sample stops being a sample and starts being a lie
 *      about the player's save.
 *   2. USEFUL — the whole point is that the Planner works on the first tap.
 *      A sample that breeds into a handful of species would be a dud, and
 *      nothing in the UI would say so.
 *   3. NEVER SILENT — it is only ever offered on an EMPTY box, it says it is
 *      a sample for as long as the box is exactly the sample, and it can be
 *      taken back out without clearing anything else.
 *
 * Levels come from the same `palcalcFacts` the app reads, so this fails if
 * the data ever moves under the list.
 */
import { describe, expect, it } from 'vitest';
import breedingJson from '../../data/breeding_1_0.json';
import palsJson from '../public/data/pals_1_0.json';
import { BreedingEngine, type BreedingData } from '../src/engine/formula';
import { closure } from '../src/engine/planner';
import { PALCALC_FACTS } from '../src/data/palcalcFacts.g';
import { SAMPLE_BOX } from '../../mobile/src/data/sampleBox';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const engine = new BreedingEngine(breedingJson as unknown as BreedingData);
const pals = (palsJson as { pals: Record<string, { wild?: boolean }> }).pals;

const raw = readFileSync(
  join(__dirname, '../../mobile/src/screens/PaldexScreen.tsx'), 'utf8');
const code = raw
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('the sample box is a real early-game collection', () => {
  it('is a dozen pals — small enough to read, big enough to breed with', () => {
    expect(SAMPLE_BOX.length).toBe(12);
    expect(new Set(SAMPLE_BOX).size, 'a name is listed twice').toBe(12);
  });

  it('every name is a real species', () => {
    for (const n of SAMPLE_BOX) expect(pals[n], `${n} is not in the pal data`).toBeTruthy();
  });

  it('every one can be CAUGHT, and caught early', () => {
    for (const n of SAMPLE_BOX) {
      expect(pals[n].wild, `${n} does not spawn in the wild`).toBe(true);
      const lvl = PALCALC_FACTS[n]?.minWild;
      expect(lvl, `${n} has no known wild level`).not.toBeNull();
      // "your first hour" is the claim the card makes. The highest in the set
      // is Fuack at 6; a cap of 10 leaves room for a data revision without
      // letting a mid-game pal in.
      expect(lvl!, `${n} first spawns at level ${lvl} — not a first-hour pal`)
        .toBeLessThanOrEqual(10);
    }
  });

  it('breeds into a large part of the dex, so the Planner has something to say', () => {
    const reach = closure(engine, [...SAMPLE_BOX]).size;
    // Measured 258 of 299 on 2026-08-17 — the same closure the CEO's own
    // 26-pal box reaches, because twelve early commons already open the whole
    // generic pool. Pinned as a floor: the value of the sample IS this number,
    // and a swap that halved it would otherwise pass.
    expect(reach, `the sample only reaches ${reach} species`).toBeGreaterThanOrEqual(250);
  });
});

describe('the sample can never be mistaken for a real collection', () => {
  it('is only offered when the box is empty', () => {
    expect(code, 'the starter card no longer bails out on a non-empty box')
      .toContain('if (owned.length > 0) return null;');
    expect(code).toContain('Try a sample box');
  });

  it('keeps saying it is a sample while the box is exactly the sample', () => {
    expect(code, 'the sample-detection check is gone — the card would either '
      + 'vanish the moment it loads, or claim a real collection is a sample')
      .toMatch(/owned\.length === SAMPLE_BOX\.length\s*\n?\s*&& SAMPLE_BOX\.every/);
    expect(code).toContain("You're trying the sample box");
  });

  it('removes exactly the sample, never the whole box', () => {
    const remove = code.slice(code.indexOf('Remove the ${SAMPLE_BOX.length} sample pals'));
    const body = remove.slice(0, remove.indexOf('</Card>'));
    expect(body, 'removal no longer walks the sample list').toContain('for (const n of SAMPLE_BOX)');
    expect(body, 'removal now clears the entire box').not.toContain('clearBox');
  });
});
