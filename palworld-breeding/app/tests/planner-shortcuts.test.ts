/**
 * The Plan tab's header promises "the shortest breeding route to the pals you
 * want". Until 2026-08-17 nothing had ever checked whether it WAS the
 * shortest, and it was not.
 *
 * `derivations` picks each pal's cheapest recipe in isolation and never
 * revisits it once the rest of the plan is known. Measured against a
 * breadth-first search over owned-sets — slow but exact — three of 119
 * species across five small boxes were routed long, by up to two steps. The
 * clearest case: from Lamball + Cattiva + Chikipi + Lifmunk the planner
 * reached Pengullet Lux in six steps where four suffice. Both routes need
 * Sparkit; the planner bred it standalone (Nox, Depresso, Sparkit) while the
 * plan was already producing Pengullet, and Lamball + Pengullet makes Sparkit
 * in one.
 *
 * `planFor` now runs a repair pass for exactly that, and these tests hold it
 * to the three things that make it safe:
 *
 *   1. it finds the short route on the case that exposed it;
 *   2. it can never make a plan LONGER — the property the previously rejected
 *      fix violated, at a cost of 8%;
 *   3. it never produces a plan that cannot be carried out.
 *
 * Cost note: `derivations` is ~6 s per box, so exactly two boxes are used and
 * their fixpoints are computed ONCE at module load and shared, the same way
 * `plan-waves.test.ts` does it. The BFS oracle is exponential and small on
 * purpose: its only job is to be obviously correct.
 */
import { describe, expect, it } from 'vitest';
import breedingJson from '../../data/breeding_1_0.json';
import { BreedingEngine, type BreedingData } from '../src/engine/formula';
import { derivations, planFor } from '../src/engine/planner';

const engine = new BreedingEngine(breedingJson as unknown as BreedingData);

/** exact minimum number of breeding steps to first obtain each species —
 * breadth-first over sets of owned pals, so every layer is one more step */
function trueMinSteps(roster: string[], maxDepth: number): Map<string, number> {
  const best = new Map<string, number>();
  for (const s of roster) best.set(s, 0);
  const start = [...roster].sort();
  let layer = new Map<string, string[]>([[start.join(','), start]]);
  for (let d = 1; d <= maxDepth && layer.size; d++) {
    const next = new Map<string, string[]>();
    for (const set of layer.values()) {
      for (let i = 0; i < set.length; i++) {
        for (let j = i; j < set.length; j++) {
          for (const ch of engine.childrenOf(set[i], set[j])) {
            if (set.includes(ch.species)) continue;
            if (!best.has(ch.species)) best.set(ch.species, d);
            const grown = [...set, ch.species].sort();
            next.set(grown.join(','), grown);
          }
        }
      }
    }
    layer = next;
  }
  return best;
}

const STARTERS = ['Lamball', 'Cattiva', 'Chikipi', 'Lifmunk'];
const DARK = ['Chikipi', 'Pengullet', 'Depresso', 'Rooby'];

// paid once, shared by every test below
const D_STARTERS = derivations(engine, STARTERS);
const D_DARK = derivations(engine, DARK);
const TRUE_STARTERS = trueMinSteps(STARTERS, 4);
const TRUE_DARK = trueMinSteps(DARK, 4);

describe('the planner takes the short route when the plan already has one', () => {
  it('reaches Pengullet Lux in four steps, not six', () => {
    const plan = planFor(engine, STARTERS, ['Pengullet Lux'], D_STARTERS);
    expect(plan.steps.length).toBe(4);
    // and by the shortcut the search found: Sparkit straight off Pengullet
    const sparkit = plan.steps.find((s) => s.child === 'Sparkit');
    expect(sparkit?.parents.slice().sort()).toEqual(['Lamball', 'Pengullet']);
  });

  it('matches the exact optimum on every species within four steps of this box', () => {
    const long: string[] = [];
    for (const [species, min] of TRUE_STARTERS) {
      if (min === 0) continue;
      const n = planFor(engine, STARTERS, [species], D_STARTERS).steps.length;
      expect(n, `${species}: claims ${n} steps, fewer than the true minimum ${min}`)
        .toBeGreaterThanOrEqual(min);
      if (n > min) long.push(`${species} ${n} > ${min}`);
    }
    expect(long, 'a route on this box is longer than it needs to be').toEqual([]);
  });

  it('is honest about the case it still cannot see', () => {
    // Melpaca from the dark box takes four steps, through Hoocrates — a pal
    // the plan does not otherwise make, which pays for itself only because it
    // is used TWICE. Reaching it needs two recipe swaps at once, across a plan
    // of equal length, and the repair pass only ever takes a swap that is
    // strictly shorter. Measured, deliberately not chased: one species in 119,
    // off by one step. Written down so it is a known limit rather than a
    // surprise, and so a future fix has its test already waiting.
    expect(TRUE_DARK.get('Melpaca')).toBe(4);
    expect(planFor(engine, DARK, ['Melpaca'], D_DARK).steps.length).toBe(5);
  });
});

describe('the repair pass can never cost the player steps', () => {
  const CASES: [string, string[], ReturnType<typeof derivations>][] = [
    ['starters', STARTERS, D_STARTERS],
    ['dark', DARK, D_DARK],
  ];

  for (const [name, box, derivs] of CASES) {
    it(`${name}: never longer than the plain union, and always buildable`, () => {
      // the alphabetically first six real goals — not one-step freebies
      const targets = [...derivs.entries()]
        .filter(([, v]) => v.size >= 3 && v.size <= 6)
        .map(([k]) => k).sort().slice(0, 6);
      expect(targets.length, 'no goals worth planning on this box').toBeGreaterThan(0);

      // the plain union of each goal's own derivation — what the plan was
      // before any repair pass, and the ceiling the result must never exceed
      const union = new Set<string>();
      for (const t of targets) for (const s of derivs.get(t)!) union.add(s);

      const plan = planFor(engine, box, targets, derivs);
      expect(plan.steps.length,
        `${name} got LONGER than the plain union — the rejected fix's failure`)
        .toBeLessThanOrEqual(union.size);

      // and it must still be a plan you can actually carry out
      const have = new Set(box);
      for (const s of plan.steps) {
        const [a, b] = s.parents;
        expect(have.has(a) && have.has(b), `${a} + ${b} runs before you have them`).toBe(true);
        expect(engine.childrenOf(a, b).map((k) => k.species)).toContain(s.child);
        have.add(s.child);
      }
      for (const t of targets) expect(have.has(t), `${t} is never bred`).toBe(true);
    });
  }
});
