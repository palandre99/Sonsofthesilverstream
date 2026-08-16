/** The unlock advisor must reproduce the CEO's own ranking rule (2026-08-16):
 *
 *   "Don't suggest catching a lvl 60 pal that has 2 steps away if you are
 *    level 20, then suggesting catching a lvl 10 pal that is 10 steps away
 *    is smarter ... And if lvl 70 you can catch a 60 with one step away then
 *    suggesting catching a lvl 10 pal 20 steps away first is not efficient."
 *
 * Both directions are asserted below on a graph built to offer exactly those
 * two routes and nothing else, so a pass means the rule holds, not that the
 * data happened to line up.
 */
import { describe, expect, it } from 'vitest';
import { adviseUnlocks, type PairSource, type WildFact } from '../src/logic/unlock';

/** Builds: a HIGH-level catch a short hop from the goal, and a LOW-level
 * catch a long walk from it. `shortSteps`/`longSteps` set the two lengths. */
function twoRouteGraph(shortSteps: number, longSteps: number) {
  const pairs = new Map<string, string>(); // "a+b" -> child
  const species = new Set<string>(['Root', 'HighPal', 'LowPal', 'Goal']);

  const link = (a: string, b: string, c: string) => {
    species.add(a); species.add(b); species.add(c);
    pairs.set([a, b].sort().join('+'), c);
  };

  // short route: HighPal -> ... -> Goal
  let cur = 'HighPal';
  for (let i = 1; i < shortSteps; i++) {
    const next = `S${i}`;
    link(cur, 'Root', next);
    cur = next;
  }
  link(cur, 'Root', 'Goal');

  // long route: LowPal -> ... -> Goal
  cur = 'LowPal';
  for (let i = 1; i < longSteps; i++) {
    const next = `L${i}`;
    link(cur, 'Root', next);
    cur = next;
  }
  link(cur, 'Root', 'Goal');

  const engine: PairSource = {
    species: [...species].sort(),
    childrenOf: (a, b) => {
      const c = pairs.get([a, b].sort().join('+'));
      return c ? [{ species: c }] : [];
    },
  };

  const wild = (n: string): WildFact => {
    if (n === 'HighPal') return { minWild: 60, known: true };
    if (n === 'LowPal') return { minWild: 10, known: true };
    if (n === 'Root') return { minWild: 1, known: true };
    return { minWild: null, known: true }; // intermediates never spawn wild
  };

  return { engine, wild };
}

describe('unlock advisor — ranking fits the save you are actually playing', () => {
  it('a low-level catch beats a long climb: Lv 20 walks the 10-step route', () => {
    const { engine, wild } = twoRouteGraph(2, 10);
    const [advice] = adviseUnlocks(
      engine, ['Root'], new Set(['Root']), ['Goal'], wild, 20,
    );
    expect(advice.kind).toBe('catch');
    expect(advice.catches).toEqual(['LowPal']);
    expect(advice.steps).toBe(10);
    expect(advice.withinLevel).toBe(true);
  });

  it('the same graph flips at Lv 70 — take the short hop you can now reach', () => {
    const { engine, wild } = twoRouteGraph(1, 20);
    const [advice] = adviseUnlocks(
      engine, ['Root'], new Set(['Root']), ['Goal'], wild, 70,
    );
    expect(advice.kind).toBe('catch');
    expect(advice.catches).toEqual(['HighPal']);
    expect(advice.steps).toBe(1);
    expect(advice.withinLevel).toBe(true);
  });

  it('a goal whose every route needs a pal that never spawns is called raid-only', () => {
    const engine: PairSource = {
      species: ['Owned', 'RaidBoss', 'Goal'],
      childrenOf: (a, b) => (
        [a, b].sort().join('+') === 'Owned+RaidBoss' ? [{ species: 'Goal' }] : []
      ),
    };
    const wild = (n: string): WildFact => (
      n === 'Owned' ? { minWild: 1, known: true } : { minWild: null, known: true }
    );
    const [advice] = adviseUnlocks(
      engine, ['Owned'], new Set(['Owned']), ['Goal'], wild, 50,
    );
    expect(advice.kind).toBe('raid-only');
    expect(advice.catches).toEqual([]);
  });

  it('missing spawn data is reported as unknown, never guessed', () => {
    const engine: PairSource = { species: ['Goal'], childrenOf: () => [] };
    const wild = (): WildFact => ({ minWild: null, known: false });
    const [advice] = adviseUnlocks(engine, [], new Set(), ['Goal'], wild, 50);
    expect(advice.kind).toBe('unknown');
  });

  it('a pal you can simply go and catch needs no breeding at all', () => {
    const engine: PairSource = { species: ['Chikipi'], childrenOf: () => [] };
    const wild = (): WildFact => ({ minWild: 1, known: true });
    const [advice] = adviseUnlocks(engine, [], new Set(), ['Chikipi'], wild, 20);
    expect(advice.kind).toBe('catch');
    expect(advice.catches).toEqual(['Chikipi']);
    expect(advice.steps).toBe(0);
    expect(advice.withinLevel).toBe(true);
  });

  it('a catch above your level is flagged, not hidden', () => {
    const engine: PairSource = { species: ['Jetragon'], childrenOf: () => [] };
    const wild = (): WildFact => ({ minWild: 60, known: true });
    const [advice] = adviseUnlocks(engine, [], new Set(), ['Jetragon'], wild, 34);
    expect(advice.kind).toBe('catch');
    expect(advice.gateLevel).toBe(60);
    expect(advice.withinLevel).toBe(false);
  });

  it('easiest goals are ranked first', () => {
    const engine: PairSource = {
      species: ['Easy', 'Hard'],
      childrenOf: () => [],
    };
    const wild = (n: string): WildFact => (
      n === 'Easy' ? { minWild: 5, known: true } : { minWild: 55, known: true }
    );
    const out = adviseUnlocks(engine, [], new Set(), ['Hard', 'Easy'], wild, 20);
    expect(out.map((a) => a.target)).toEqual(['Easy', 'Hard']);
  });
});
