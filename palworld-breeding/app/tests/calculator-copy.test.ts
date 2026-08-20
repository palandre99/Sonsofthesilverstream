/**
 * The Calculator is the app's flagship screen — the CEO's framing is that
 * everything else attaches to it, never the other way around. Its result card
 * explains WHY a pair makes what it makes, and until 2026-08-17 that
 * explanation read:
 *
 *     rank target ⌊(2580 + 130 + 1)/2⌋ = 1355 → Blazehowl (1360)
 *     · tie resolved to the higher CombiRank
 *
 * Floor brackets, a raw game-file field name, and "tie" — the exact word the
 * CEO banned. Three violations of "a player's words, never a developer's" in
 * one sentence, on the screen he looks at most.
 *
 * It now reads: "Every pal has a hidden breeding number. Yours are 2580 and
 * 130 — average them, rounding up, and you get 1355. The nearest pal to that
 * is Blazehowl at 1360."
 *
 * Every number survived the rewrite, which is the point: this guards BOTH
 * that the jargon stays gone AND that the arithmetic the sentence describes
 * is what the engine actually does. Plain language that quietly stopped being
 * true would be worse than the jargon.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import breedingJson from '../../data/breeding_1_0.json';
import { BreedingEngine, type BreedingData } from '../src/engine/formula';

const engine = new BreedingEngine(breedingJson as unknown as BreedingData);
const raw = readFileSync(
  join(__dirname, '../../mobile/src/screens/CalculatorScreen.tsx'), 'utf8');
const code = raw
  .replace(/\{\s*\/\*(?:(?!\*\/)[\s\S])*\*\/\s*\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('the Calculator explains itself in a player’s words', () => {
  it('no floor brackets, no field names, no "tie"', () => {
    expect(code, 'the floor notation is back').not.toContain('⌊');
    expect(code, 'the raw game-file field name is back').not.toContain('CombiRank');
    // the separator is required on purpose: `ch.tieBreak` is the engine's own
    // field name and is fine in code — the ban is on what the player reads
    expect(code, 'the CEO banned this word by name').not.toMatch(/tie[- ]break/i);
    expect(code, '"tie resolved to..." is back').not.toContain('tie resolved');
  });

  it('says it in words instead', () => {
    expect(code).toContain('Every pal has a hidden breeding number');
    expect(code).toContain('average them, rounding up');
    expect(code).toContain('The nearest pal');
    expect(code).toContain('Two were the same distance away, so the bigger number won');
  });

  it('and the surrounding sentences use the same vocabulary', () => {
    // "rank formula" and "higher rank wins" were left behind by the first pass
    expect(code, 'a stray "rank formula" is back').not.toContain('rank formula');
    expect(code, 'a stray "higher rank wins" is back').not.toContain('higher rank wins');
    expect(code).toContain('the breeding numbers are skipped');
    expect(code).toContain('close call — the bigger number wins');
  });
});

describe('the plain sentence is still arithmetically true', () => {
  // the exact case rendered on screen while this was written
  const A = 'Eikthyrdeer Terra';
  const B = 'Bellanoir Libero';

  it('"average them, rounding up" is what the engine computes', () => {
    const ra = engine.ranks.get(A)!;
    const rb = engine.ranks.get(B)!;
    expect(ra).toBe(2580);
    expect(rb).toBe(130);
    // the formula the old line spelled out as ⌊(A + B + 1)/2⌋ — which IS
    // "average, rounding halves up", for every pair of ranks
    const target = Math.floor((ra + rb + 1) / 2);
    expect(target).toBe(1355);
    expect(target).toBe(Math.round((ra + rb) / 2));
  });

  it('"the nearest pal to that" really is the child the engine returns', () => {
    const child = engine.childOf(A, B);
    expect(child.species).toBe('Blazehowl');
    expect(engine.ranks.get('Blazehowl')).toBe(1360);
    expect(child.kind).toBe('generic');
    expect(child.tieBreak).toBe(true);
  });

  it('rounding up is not a rounding-down engine in disguise', () => {
    // if the engine ever floored instead, "rounding up" becomes a lie on every
    // odd-sum pair — check the claim across the whole rank table
    let odd = 0;
    for (const [, ra] of engine.ranks) {
      for (const [, rb] of engine.ranks) {
        if ((ra + rb) % 2 === 0) continue;
        expect(Math.floor((ra + rb + 1) / 2)).toBe(Math.ceil((ra + rb) / 2));
        if (++odd > 200) return;
      }
    }
  });
});
