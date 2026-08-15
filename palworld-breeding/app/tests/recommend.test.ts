/** The recommendation brain — scoring, labels, caching, level cutoffs. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BreedingEngine } from '../src/engine/formula';
import type { BreedingData } from '../src/engine/types';
import {
  attainLabel, boxKeyOf, cachedDerivations, effortSteps, getAttainContext,
  recommendedSet, scoreOf, type Attain,
} from '../src/logic/recommend';
import { PALCALC_FACTS } from '../src/data/palcalcFacts.g';

const data = JSON.parse(
  readFileSync(join(__dirname, '../public/data/breeding_1_0.json'), 'utf8'),
) as BreedingData;
const palsJson = JSON.parse(
  readFileSync(join(__dirname, '../public/data/pals_1_0.json'), 'utf8'),
) as { pals: Record<string, { wild: boolean }> };

const engine = new BreedingEngine(data);
const pals = palsJson.pals;

const ctxFor = (box: string[], level?: number) => {
  const owned = new Set(box);
  return getAttainContext(engine, pals, data, box, level, (n) => owned.has(n));
};

describe('scoring', () => {
  it("the CEO's example: level 6 one breed away beats level 7 at 83 breeds", () => {
    // values are within-section fractions of the best (7 is the section top)
    const near: Attain = { kind: 'breed', steps: 1 };
    const far: Attain = { kind: 'breed', steps: 83 };
    expect(scoreOf(6 / 7, near)).toBeGreaterThan(scoreOf(7 / 7, far));
  });

  it('owned costs nothing, a catch is one action, an unlock is three', () => {
    expect(effortSteps({ kind: 'have' })).toBe(0);
    expect(effortSteps({ kind: 'catch', lv: 10 })).toBe(1);
    expect(effortSteps({ kind: 'later', unlock: 'Teafant' })).toBe(3);
    expect(effortSteps({ kind: 'later' })).toBeGreaterThan(90);
  });

  it('RECOMMENDED = nearly the best AND genuinely close AND not owned', () => {
    const attain = (n: string): Attain =>
      n === 'Close' ? { kind: 'breed', steps: 2 }
        : n === 'Far' ? { kind: 'breed', steps: 40 }
          : n === 'Mine' ? { kind: 'have' }
            : { kind: 'later' };
    const rec = recommendedSet([
      { name: 'Close', value: 0.9 },  // near-best, 2 steps  -> in
      { name: 'Far', value: 1.0 },    // the best, 40 steps  -> out
      { name: 'Mine', value: 0.95 },  // owned               -> out
      { name: 'Weak', value: 0.3 },   // not near-best       -> out
    ], attain);
    expect(rec).toEqual(new Set(['Close']));
  });
});

describe('labels', () => {
  it('every status explains itself — no bare ENDGAME anywhere', () => {
    const kinds: Attain[] = [
      { kind: 'have' },
      { kind: 'breed', steps: 1 },
      { kind: 'breed', steps: 4 },
      { kind: 'catch', lv: 12 },
      { kind: 'later', unlock: 'Teafant' },
      { kind: 'later' },
    ];
    for (const a of kinds) {
      const l = attainLabel(a);
      expect(l.short.length).toBeGreaterThan(0);
      expect(l.long.length).toBeGreaterThan(l.short.length);
      expect(l.short).not.toBe('ENDGAME');
    }
    expect(attainLabel({ kind: 'later' }).short).toBe('LONG-TERM GOAL');
    expect(attainLabel({ kind: 'later', unlock: 'Teafant' }).short)
      .toBe('CATCH TEAFANT FIRST');
    expect(attainLabel({ kind: 'breed', steps: 1 }).short).toBe('BREED · 1 STEP');
  });
});

// the derivations fixpoint costs seconds under vitest (335 ms on device) —
// that cost is exactly why the brain caches it; budget accordingly here
describe('attain context', { timeout: 60000 }, () => {
  it('judges from the box: owned -> have, reachable -> breed with real steps', () => {
    const box = ['Lamball', 'Cattiva'];
    const ctx = ctxFor(box);
    expect(ctx.attain('Lamball')).toEqual({ kind: 'have' });
    // the wiring test: whatever the oracle-tested planner says is reachable
    // must surface as breed with that exact step count
    const derivs = cachedDerivations(engine, box);
    const reachable = [...derivs.keys()].find((n) => !box.includes(n))!;
    expect(reachable).toBeTruthy();
    expect(ctx.attain(reachable)).toEqual({
      kind: 'breed', steps: derivs.get(reachable)!.size,
    });
  });

  it('a long breeding route yields to an in-reach catch (>=4 steps, like the planner advice)', () => {
    const box = ['Lamball', 'Cattiva'];
    const ctx = ctxFor(box);
    const derivs = cachedDerivations(engine, box);
    const cutoff = ctx.stage + (ctx.explicit ? 0 : 10); // the brain's own reach
    let deepCatchables = 0;
    for (const [n, d] of derivs) {
      if (box.includes(n)) continue;
      const a = ctx.attain(n);
      const catchableHere = !!pals[n]?.wild
        && PALCALC_FACTS[n]?.minWild != null && PALCALC_FACTS[n]!.minWild! <= cutoff;
      if (d.size >= 4 && catchableHere) {
        deepCatchables++;
        expect(a.kind).toBe('catch'); // catching one is the honest advice
      } else {
        expect(a.kind).toBe('breed'); // short routes stay breeding advice
      }
    }
    expect(deepCatchables).toBeGreaterThan(0); // the rule actually fires on real data
  });

  it('an explicit player level is a hard catch cutoff; the proxy has slack', () => {
    const strict = ctxFor([], 12);
    expect(strict.explicit).toBe(true);
    for (const n of Object.keys(pals)) {
      const a = strict.attain(n);
      if (a.kind === 'catch') expect(a.lv).toBeLessThanOrEqual(12);
    }
    const proxy = ctxFor([]);
    expect(proxy.explicit).toBe(false);
    expect(proxy.stage).toBe(15); // floor with an empty box
    const catchLvs = Object.keys(pals)
      .map((n) => proxy.attain(n))
      .filter((a): a is Extract<Attain, { kind: 'catch' }> => a.kind === 'catch')
      .map((a) => a.lv);
    expect(Math.max(...catchLvs)).toBeLessThanOrEqual(25); // 15 + 10 slack
  });

  it('the expensive fixpoint is cached per box', () => {
    const box = ['Lamball', 'Cattiva'];
    const first = cachedDerivations(engine, box);
    const t0 = Date.now();
    const second = cachedDerivations(engine, [...box].reverse());
    expect(Date.now() - t0).toBeLessThan(50); // a hit is free
    expect(second).toBe(first); // same roster, any order -> the same map
    expect(boxKeyOf(box)).toBe(boxKeyOf([...box].reverse()));
    const other = cachedDerivations(engine, ['Foxparks']);
    expect(other).not.toBe(first);
  });

  it('facts data is present for the judgements (wild ranges exist)', () => {
    expect(PALCALC_FACTS['Lamball']?.minWild).not.toBeNull();
  });
});
