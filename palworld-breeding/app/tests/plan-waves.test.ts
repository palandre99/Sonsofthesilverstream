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
import { closure, derivations, planFor, type PlanStep } from '../src/engine/planner';

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

const PLANS = CASES.map((c) => {
  // built ONCE at module load: `derivations` is the expensive half (seconds),
  // and vitest's per-test timeout is 5s — calling it inside a test times out.
  const derivs = derivations(engine, new Set(c.box));
  return {
    ...c,
    derivs,
    reach: closure(engine, c.box),
    steps: planFor(engine, c.box, c.targets, derivs).steps,
  };
});

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

  /**
   * The Plan tab's "how it works" card promises: "Pals needed by several goals
   * are bred once, not twice." This is the test of that sentence.
   *
   * IT USED TO BE FALSE, and sat here as `it.fails` for exactly that reason.
   * The fixpoint in `derivations` improves species one at a time and never
   * rebuilds the ancestors that already routed through an older, worse recipe
   * for an intermediate — so Astegon's route still made Whalaska with
   * Petallia Ignis + Reptyro Cryst long after Whalaska's own cheapest recipe
   * had become Frostplume + Univolt Cryst. Planning both goals unioned the two
   * and the app told the player to breed the same pal twice, in phases 18 and
   * 21, which since breeding never consumes a parent is pure wasted work.
   *
   * FIXED 2026-08-17 in `planFor`: when a pal genuinely has two recipes in the
   * union, keep whichever one leaves the smallest plan and walk back from the
   * goals so the steps that only fed the other disappear with it. The result
   * is always a subset of the old plan, so a plan can only get shorter.
   *
   * The obvious fix — rebuild every route from each species' own cheapest
   * recipe — was written, measured, and REJECTED: across twelve boxes it took
   * the total from 299 steps to 323, because the stale recipes were often the
   * ones two goals shared. Measured again after the targeted fix: 299, exactly
   * unchanged, and the ten-pal case that was broken went 36 steps to 35 with
   * Whalaska bred once instead of twice.
   *
   * `it.fails` was flipped back to a plain `it` the moment it went green —
   * which is exactly what its old comment told whoever fixed this to do.
   */
  it('a pal needed by several goals is bred once, not twice', () => {
    for (const { name, steps } of PLANS) {
      const seen = new Map<string, number>();
      for (const s of steps) seen.set(s.child, (seen.get(s.child) ?? 0) + 1);
      const twice = [...seen].filter(([, n]) => n > 1)
        .map(([child, n]) => `${name}: ${child} is bred ${n} times`);
      expect(twice).toEqual([]);
    }
  });

  /**
   * The de-duplication above must never be paid for in extra steps. The
   * rejected fix (rebuild every route from each species' own cheapest recipe)
   * removed duplicates too — and quietly made plans 8% longer, because the
   * recipes it discarded were often the ones two goals shared. Nobody would
   * have noticed from a green suite; the plan would just have grown.
   *
   * So the step counts are pinned. If a future change moves either number, it
   * is trading the player's time for something and that trade needs a human.
   *
   * Both numbers moved DOWN on 2026-08-17 and the trade was taken: 14 → 12 and
   * 35 → 26. That is the "reuse what the plan is already making" pass in
   * planner.ts — once the plan exists, every pal in it is re-offered a recipe
   * built from what the plan already produces, and the swap is kept only when
   * the whole plan gets strictly shorter. Measured across twelve boxes it took
   * 152 steps to 127 with no box getting longer, which is the property that
   * matters: the earlier rejected fix failed exactly here.
   */
  it('does not buy the fix with extra steps', () => {
    const sizes = Object.fromEntries(PLANS.map((p) => [p.name, p.steps.length]));
    expect(sizes).toEqual({
      'mid-game box, three goals': 12,
      'wide box, four distant goals': 26,
    });
  });

  // The Plan prints "keep male+female — parent in N steps" on any step whose
  // child is a parent in 2 or more others. N is a number the player acts on
  // (it is why they hold a second copy), so it gets a guard: verified 0
  // mismatches across both plans when this was written.
  it('the "parent in N steps" count matches the plan it describes', () => {
    for (const { name, steps } of PLANS) {
      const wrong = steps
        .map((s) => {
          const actual = steps.filter(
            (o) => o.parents[0] === s.child || o.parents[1] === s.child,
          ).length;
          return actual === s.reusedAsParent
            ? null
            : `${name}: ${s.child} says ${s.reusedAsParent}, is actually ${actual}`;
        })
        .filter(Boolean);
      expect(wrong).toEqual([]);
    }
  });

  // The Paldex header says "N/299 reachable" from `closure`; the Plan calls a
  // goal unreachable from `derivations`. Those are two independent code paths
  // answering the same question on two different screens, so if they ever
  // disagree the app contradicts itself in front of the player. Measured equal
  // across an 8-pal, a 10-pal and a single-pal box when this was written.
  it('the Paldex’s "reachable" agrees exactly with the Plan’s derivations', () => {
    for (const { name, box, reach, derivs: derivable } of PLANS) {
      const onlyReach = [...reach].filter((n) => !derivable.has(n));
      const onlyDerivable = [...derivable.keys()].filter((n) => !reach.has(n));
      expect({ name, onlyReach, onlyDerivable })
        .toEqual({ name, onlyReach: [], onlyDerivable: [] });
      // and the pals you already own count as reachable, which is what the
      // header means by it
      for (const owned of box) expect(reach.has(owned)).toBe(true);
    }
  });

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
