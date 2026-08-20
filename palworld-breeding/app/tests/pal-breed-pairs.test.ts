/**
 * "How to breed it" on the pal card, for a pal with no fixed recipe.
 *
 * It used to say *"No fixed recipe — many parent pairs work. For example:"*
 * and then show three. "Many" was hiding a number the player would actually
 * want: measured across the 183 pals that reach this branch, the real counts
 * run from **25 to 1,270**, median 205. The CEO's bar is that every number
 * carries meaning; "many" carries none.
 *
 * The cause was a scan that stopped at the 40th hit. That cap cost two things:
 * the card could never know the total, and **a pair the player already owns
 * sitting past the 40th was never found** — the single most useful example,
 * silently skipped.
 *
 * The scan runs to the end now. Measured on the render: card-open time went
 * 1006 ms → 1004 ms for Lamball and 1004 ms → 1000 ms for Anubis, i.e. nothing
 * you can see (method #26 — a correctness fix must be paid for in something).
 *
 * Also checked and CLEARED here (method #16, a list from derived data drops
 * the empty case silently): no pal reaches this branch with zero pairs, and
 * none with fewer than three, so "Three of them:" is never a lie. The wording
 * still derives itself, because that is a data fact and data facts move.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import breedingJson from '../../data/breeding_1_0.json';
import palsJson from '../public/data/pals_1_0.json';
import { BreedingEngine, type BreedingData } from '../src/engine/formula';

const breeding = breedingJson as unknown as BreedingData;
const pals = (palsJson as { pals: Record<string, unknown> }).pals;
const engine = new BreedingEngine(breeding);

const raw = readFileSync(
  join(__dirname, '../../mobile/src/ui/PalDetail.tsx'), 'utf8');
const code = raw
  .replace(/\{\s*\/\*(?:(?!\*\/)[\s\S])*\*\/\s*\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

/** Exactly the predicate the card uses to pick example pairs. */
function pairCounts(): Record<string, number> {
  const names = Object.keys(pals);
  const selfOnly = new Set(breeding.self_breed_only ?? []);
  const counts: Record<string, number> = {};
  for (const target of names) {
    if (breeding.excluded_from_generic_pool.includes(target)) continue;
    if (selfOnly.has(target)) continue;
    let c = 0;
    for (let i = 0; i < names.length; i++) {
      for (let j = i; j < names.length; j++) {
        const kids = engine.childrenOf(names[i], names[j]);
        if (kids.length === 1 && kids[0].species === target
          && kids[0].kind === 'generic') c++;
      }
    }
    counts[target] = c;
  }
  return counts;
}

const counts = pairCounts();

describe('the card can always show the three examples it promises', () => {
  it('every pal that reaches this branch has at least three pairs', () => {
    const short = Object.entries(counts).filter(([, c]) => c < 3);
    expect(short, 'a pal would print "Three of them:" and show fewer')
      .toEqual([]);
    expect(Object.keys(counts).length).toBeGreaterThan(150);
  });

  it('none of them has zero — the empty list is unreachable', () => {
    // method #16: a list built from derived data drops the empty case in
    // silence. Checked rather than assumed.
    const empty = Object.entries(counts).filter(([, c]) => c === 0).map(([n]) => n);
    expect(empty).toEqual([]);
  });

  it('still derives the wording from what it actually has', () => {
    // if the data ever does fall below three, the sentence must follow it
    expect(code).toContain("show.length === 3 ? 'Three of them'");
    expect(code).toContain("show.length === 2 ? 'Two of them' : 'One of them'");
  });
});

describe('“many” became the real number', () => {
  it('the counts are worth printing — they span a wide range', () => {
    const vals = Object.values(counts).sort((a, b) => a - b);
    expect(vals[0]).toBeGreaterThan(1);
    expect(vals[vals.length - 1]).toBeGreaterThan(500);
    // "many" said the same thing for 25 pairs and for over a thousand
    expect(vals[vals.length - 1] / vals[0]).toBeGreaterThan(10);
  });

  it('the screen prints a count rather than the word “many”', () => {
    expect(code, 'the card is back to saying "many parent pairs work"')
      .not.toContain('many parent pairs work');
    expect(code).toContain('different pairs');
    expect(code, 'a four-figure count needs its separator').toContain('total.toLocaleString()');
  });

  it('counts every pair instead of stopping at the fortieth', () => {
    // the cap also meant an owned pair past the 40th was never found — the
    // one example most worth showing
    expect(code, 'the scan stops early again, so the count is a floor and '
      + 'owned pairs past it are invisible')
      .not.toContain('pairs.length >= 40');
    expect(code).toContain('total++');
  });

  it('a pal really can have more pairs than the old cap would have seen', () => {
    // proves the cap was hiding something rather than being a harmless bound
    const overCap = Object.values(counts).filter((c) => c > 40).length;
    expect(overCap).toBeGreaterThan(100);
  });
});
