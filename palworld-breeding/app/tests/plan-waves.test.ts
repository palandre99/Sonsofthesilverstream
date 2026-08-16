/**
 * The Plan tab prints "everything here can run in parallel" under any phase
 * holding more than one step. That is a promise to the player: they can set
 * those pairs breeding at the same time and none of them is waiting on
 * another.
 *
 * It happens to be true — `planFor` snapshots the ready set at the start of
 * each wave, so a child produced inside a wave cannot pull a step into that
 * same wave — but nothing guarded it. Moving `have.add(c)` above the `ready`
 * computation, or recomputing `ready` inside the loop, would quietly turn the
 * sentence into a lie while every other test stayed green.
 *
 * Cost note: the plans are built ONCE at module load and shared by both
 * tests. `planFor` itself is ~1 ms; `derivations` is the expensive half
 * (measured 0.8 s for the eight-pal box, 5.4 s for the ten-pal one), which is
 * the known planner performance item still on the queue. Two cases is the
 * deliberate ceiling — a third added 3.6 s and told us nothing new.
 */
import { describe, expect, it } from 'vitest';
import breedingJson from '../../data/breeding_1_0.json';
import { BreedingEngine, type BreedingData } from '../src/engine/formula';
import { derivations, planFor, type PlanStep } from '../src/engine/planner';

const engine = new BreedingEngine(breedingJson as unknown as BreedingData);

const CASES: { name: string; box: string[]; targets: string[] }[] = [
  {
    name: 'mid-game box, three goals',
    box: ['Lamball', 'Foxparks', 'Pengullet', 'Cattiva', 'Direhowl',
      'Rushoar', 'Anubis', 'Penking'],
    targets: ['Jormuntide Ignis', 'Renjishi', 'Solenne'],
  },
  {
    name: 'wide box, four distant goals',
    box: ['Lamball', 'Foxparks', 'Vixy', 'Sparkit', 'Tanzee', 'Depresso',
      'Fuack', 'Rooby', 'Pengullet', 'Mozzarina'],
    targets: ['Blazamut', 'Faleris', 'Orserk', 'Astegon'],
  },
];

const PLANS = CASES.map((c) => ({
  ...c,
  steps: planFor(engine, c.box, c.targets, derivations(engine, new Set(c.box))).steps,
}));

describe('a phase never contains a step that waits on that same phase', () => {
  for (const { name, steps } of PLANS) {
    it(`holds for the ${name}`, () => {
      expect(steps.length).toBeGreaterThan(0);

      const byWave = new Map<number, PlanStep[]>();
      for (const s of steps) {
        const list = byWave.get(s.wave) ?? [];
        list.push(s);
        byWave.set(s.wave, list);
      }
      // the promise only appears on phases with more than one step, so make
      // sure these plans actually exercise that case
      expect([...byWave.values()].filter((g) => g.length > 1).length)
        .toBeGreaterThan(0);

      for (const [wave, group] of byWave) {
        const madeHere = new Set(group.map((s) => s.child));
        for (const s of group) {
          for (const parent of s.parents) {
            expect(
              madeHere.has(parent) && parent !== s.child,
              `phase ${wave}: ${s.parents.join(' + ')} → ${s.child} needs `
              + `${parent}, which is bred in the same phase`,
            ).toBe(false);
          }
        }
      }
    });
  }

  it('every phase only uses pals the box or an EARLIER phase already produced', () => {
    for (const { name, box, steps } of PLANS) {
      const have = new Set(box);
      const waves = [...new Set(steps.map((s) => s.wave))].sort((a, b) => a - b);
      for (const w of waves) {
        const group = steps.filter((s) => s.wave === w);
        for (const s of group) {
          for (const parent of s.parents) {
            expect(have.has(parent), `${name}: phase ${w} needs ${parent} too early`)
              .toBe(true);
          }
        }
        for (const s of group) have.add(s.child);
      }
    }
  });
});
