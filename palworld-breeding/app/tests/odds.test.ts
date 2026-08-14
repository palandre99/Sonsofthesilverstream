/** Odds Lab correctness gate.
 *
 * The closed-form probabilities in src/engine/odds.ts are checked two ways:
 *
 *  1. against the published community inheritance table (40/24/12/10), which
 *     the model must REPRODUCE rather than assume; and
 *  2. against a Monte Carlo simulation written independently from the closed
 *     form — it simulates the mechanic step by step (roll a count, draw from
 *     the pool, roll random additions, cap at four slots). If the algebra and
 *     the simulation disagree, one of them is wrong.
 */
import { describe, expect, it } from 'vitest';
import {
  attemptsFor,
  choose,
  ivInheritP,
  ivOdds,
  MAX_PASSIVES,
  mutationPlan,
  oddsTable,
  passiveInheritP,
  passiveOdds,
  passiveRandomP,
  subsetContainsAll,
} from '../src/engine/odds';

/* ---------------- deterministic RNG so failures are reproducible ---------------- */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function pick(dist: Map<number, number>, r: number): number {
  let acc = 0;
  for (const [k, p] of dist) {
    acc += p;
    if (r < acc) return k;
  }
  return [...dist.keys()][dist.size - 1];
}

/** One egg, simulated straight from the documented mechanic. */
function simulateEgg(poolSize: number, desiredCount: number, rnd: () => number) {
  const x = pick(passiveInheritP, rnd());
  const actual = Math.min(x, poolSize);

  // draw `actual` distinct passives from the pool; ids 0..desiredCount-1 are the wanted ones
  const bag = Array.from({ length: poolSize }, (_, i) => i);
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  const chosen = new Set(bag.slice(0, actual));

  const r = pick(passiveRandomP, rnd());
  const total = Math.min(MAX_PASSIVES, actual + r);
  const randomsAdded = total - actual;

  let hasAllDesired = true;
  for (let d = 0; d < desiredCount; d++) if (!chosen.has(d)) hasAllDesired = false;

  return {
    hasAllDesired,
    isExactly: hasAllDesired && chosen.size === desiredCount && randomsAdded === 0,
    total,
  };
}

describe('game-data weights', () => {
  it('normalises PassiveInheritNum to 40/30/20/10', () => {
    expect([...passiveInheritP.values()].map((v) => +v.toFixed(4)))
      .toEqual([0.4, 0.3, 0.2, 0.1]);
  });

  it('normalises PassiveRandomAddNum to 40/30/20/10 over 0..3', () => {
    expect([...passiveRandomP.keys()]).toEqual([0, 1, 2, 3]);
    expect([...passiveRandomP.values()].map((v) => +v.toFixed(4)))
      .toEqual([0.4, 0.3, 0.2, 0.1]);
  });

  it('normalises TalentInheritNum to 50/33.3/16.7', () => {
    expect([...ivInheritP.values()].map((v) => +v.toFixed(4)))
      .toEqual([0.5, 0.3333, 0.1667]);
  });

  it('all three distributions sum to 1', () => {
    for (const d of [passiveInheritP, passiveRandomP, ivInheritP]) {
      const sum = [...d.values()].reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 10);
    }
  });
});

describe('combinatorics', () => {
  it('computes small binomials exactly', () => {
    expect(choose(4, 2)).toBe(6);
    expect(choose(5, 0)).toBe(1);
    expect(choose(3, 5)).toBe(0);
    expect(choose(10, 5)).toBe(252);
  });

  it('is a proper hypergeometric', () => {
    expect(subsetContainsAll(4, 4, 4)).toBeCloseTo(1, 10);
    expect(subsetContainsAll(4, 2, 2)).toBeCloseTo(1 / 6, 10);
    expect(subsetContainsAll(4, 1, 2)).toBe(0);
    expect(subsetContainsAll(5, 3, 0)).toBe(1);
  });
});

describe('published inheritance table', () => {
  // palworld.wiki.gg / community: a clean result carrying exactly K desired
  // passives happens 40% / 24% / 12% / 10% of the time for K = 1..4.
  it('reproduces 40 / 24 / 12 / 10 from the game weights alone', () => {
    const table = oddsTable();
    expect(table.map((r) => +(r.clean * 100).toFixed(1)))
      .toEqual([40, 24, 12, 10]);
  });

  it('gives the 4/4 perfect result a 10% rate', () => {
    const o = passiveOdds({ poolSize: 4, desiredCount: 4 });
    expect(o.allDesired).toBeCloseTo(0.1, 10);
    // with all four slots filled from parents there is no room for junk
    expect(o.exactlyDesired).toBeCloseTo(0.1, 10);
  });

  it('shows how badly one junk passive hurts a 4-skill target', () => {
    const clean = passiveOdds({ poolSize: 4, desiredCount: 4 }).allDesired;
    const dirty = passiveOdds({ poolSize: 5, desiredCount: 4 }).allDesired;
    expect(clean).toBeCloseTo(0.1, 10);
    // P(X=4) * C(1,0)/C(5,4) = 0.1 * 1/5
    expect(dirty).toBeCloseTo(0.02, 10);
  });
});

describe('closed form matches an independent simulation', () => {
  const configs: [number, number][] = [
    [1, 1], [2, 1], [2, 2], [3, 1], [3, 2], [3, 3],
    [4, 2], [4, 3], [4, 4], [5, 2], [5, 4], [6, 3], [8, 4],
  ];

  for (const [poolSize, desiredCount] of configs) {
    it(`pool ${poolSize}, want ${desiredCount}`, () => {
      const N = 200_000;
      const rnd = lcg(0xc0ffee + poolSize * 131 + desiredCount);
      let all = 0;
      let exact = 0;
      const totals = new Array<number>(MAX_PASSIVES + 1).fill(0);
      for (let i = 0; i < N; i++) {
        const e = simulateEgg(poolSize, desiredCount, rnd);
        if (e.hasAllDesired) all++;
        if (e.isExactly) exact++;
        totals[e.total]++;
      }
      const o = passiveOdds({ poolSize, desiredCount });
      expect(all / N).toBeCloseTo(o.allDesired, 2);
      expect(exact / N).toBeCloseTo(o.exactlyDesired, 2);
      for (let k = 0; k <= MAX_PASSIVES; k++) {
        expect(totals[k] / N).toBeCloseTo(o.totalCount[k], 2);
      }
    });
  }
});

describe('passive odds edge cases', () => {
  it('treats an empty pool as impossible to inherit from', () => {
    const o = passiveOdds({ poolSize: 0, desiredCount: 1 });
    expect(o.allDesired).toBe(0);
    expect(o.expectedEggs).toBe(Infinity);
  });

  it('is certain when nothing is desired', () => {
    expect(passiveOdds({ poolSize: 4, desiredCount: 0 }).allDesired).toBeCloseTo(1, 10);
  });

  it('cannot want more than the pool holds', () => {
    expect(passiveOdds({ poolSize: 2, desiredCount: 3 }).allDesired).toBe(0);
  });

  it('produces a total-count distribution that sums to 1', () => {
    for (const poolSize of [0, 1, 3, 4, 7]) {
      const o = passiveOdds({ poolSize, desiredCount: Math.min(1, poolSize) });
      const sum = o.totalCount.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 10);
    }
  });

  it('never reports more than four passives', () => {
    const o = passiveOdds({ poolSize: 8, desiredCount: 1 });
    expect(o.totalCount).toHaveLength(MAX_PASSIVES + 1);
  });

  it('improves the odds when a cake forces a bigger draw', () => {
    const normal = passiveOdds({ poolSize: 6, desiredCount: 4 }).allDesired;
    const forced = passiveOdds({ poolSize: 6, desiredCount: 4, inheritCap: 6 }).allDesired;
    expect(forced).toBeGreaterThan(normal);
    expect(forced).toBeCloseTo(1, 10); // drawing all six must include the four
  });
});

describe('IV odds', () => {
  it('matches the reference combination table', () => {
    // palcalc's BreedingMechanics.BuildDesiredIVProbabilities uses the same
    // hypergeometric table: P(inherit i) x C(3-d, i-d)/C(3, i).
    // 1 desired: 1/2*(1/3) + 1/3*(2/3) + 1/6*1 = 1/6 + 2/9 + 1/6 = 5/9
    expect(ivOdds(1).categoriesInherited).toBeCloseTo(5 / 9, 10);
    // 2 desired: 1/3*(1/3) + 1/6*1 = 1/9 + 1/6 = 5/18
    expect(ivOdds(2).categoriesInherited).toBeCloseTo(5 / 18, 10);
    // 3 desired: only the "inherit all three" roll
    expect(ivOdds(3).categoriesInherited).toBeCloseTo(1 / 6, 10);
  });

  it('gets rarer as you demand more categories', () => {
    expect(ivOdds(1).categoriesInherited)
      .toBeGreaterThan(ivOdds(2).categoriesInherited);
    expect(ivOdds(2).categoriesInherited)
      .toBeGreaterThan(ivOdds(3).categoriesInherited);
  });

  it('halves per category when a specific parent is required', () => {
    expect(ivOdds(1).fromChosenParent).toBeCloseTo((5 / 9) * 0.5, 10);
    expect(ivOdds(3).fromChosenParent).toBeCloseTo((1 / 6) * 0.125, 10);
  });

  it('rejects impossible category counts', () => {
    expect(() => ivOdds(0)).toThrow(RangeError);
    expect(() => ivOdds(4)).toThrow(RangeError);
  });
});

describe('cakes and mutation', () => {
  it('gives the Vegetable Cake two eggs at the base rate, not a doubled rate', () => {
    const veg = mutationPlan('vegetable');
    expect(veg.eggsPerCycle).toBe(2);
    expect(veg.mutationPerEgg).toBeCloseTo(0.01, 10);
    // 1 - 0.99^2 = 0.0199, i.e. "about 2% per cycle" — not 2% per egg
    expect(veg.mutationPerCycle).toBeCloseTo(0.0199, 6);
  });

  it('makes the Extravagant Vegetable Cake the mutation cake', () => {
    expect(mutationPlan('extravagant').mutationPerEgg).toBeCloseTo(0.03, 10);
    expect(mutationPlan('extravagant').expectedEggs).toBeCloseTo(33.33, 1);
  });

  it('rejects an unknown cake', () => {
    expect(() => mutationPlan('sponge' as never)).toThrow();
  });
});

describe('attempt counts', () => {
  it('needs 1 attempt for a certainty and infinite for an impossibility', () => {
    expect(attemptsFor(1, 0.9)).toBe(1);
    expect(attemptsFor(0, 0.9)).toBe(Infinity);
  });

  it('matches the geometric formula', () => {
    // 10% per egg -> 22 eggs for 90% confidence
    expect(attemptsFor(0.1, 0.9)).toBe(22);
    expect(attemptsFor(0.5, 0.9)).toBe(4);
  });
});
