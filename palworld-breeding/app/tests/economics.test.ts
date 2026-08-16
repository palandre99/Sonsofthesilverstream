/** Cake economics — expected eggs counting gender luck. */
import { describe, expect, it } from 'vitest';
import { expectedEggs } from '../src/logic/economics';
import type { PlanStep } from '../src/engine/types';

const step = (over: Partial<PlanStep>): PlanStep => ({
  wave: 1, parents: ['A', 'B'], child: 'C', kind: 'generic', tieBreak: false,
  margin: 1, genderNote: null, isTarget: false, neededBy: [], reusedAsParent: 0,
  ...over,
});

const even = () => 0.5;

describe('expected eggs', () => {
  it('plain steps cost exactly one egg each', () => {
    const e = expectedEggs([step({ child: 'X' }), step({ child: 'Y' })], even);
    expect(e).toEqual({
      minEggs: 2, expectedEggs: 2, bothGenderSteps: 0, pickyGenderSteps: 0,
    });
  });

  it('a keep-both-genders step averages 3 eggs at 50/50', () => {
    const e = expectedEggs([step({ child: 'X', reusedAsParent: 2 })], even);
    expect(e.expectedEggs).toBe(3); // 1/0.5 + 1/0.5 - 1
    expect(e.bothGenderSteps).toBe(1);
  });

  it('a gender-locked recipe makes its bred parent picky — skew hurts', () => {
    // the plan breeds Beegarde (10% male), and a later gender-locked step
    // needs it as the FATHER -> expected 1/0.1 = 10 eggs
    const steps = [
      step({ child: 'Beegarde' }),
      step({
        child: 'Z', parents: ['Beegarde', 'Katress'], kind: 'gendered',
        genderNote: 'female Katress + male Beegarde',
      }),
    ];
    const maleProb = (n: string) => (n === 'Beegarde' ? 0.1 : 0.5);
    const e = expectedEggs(steps, maleProb);
    expect(e.pickyGenderSteps).toBe(1);
    expect(e.expectedEggs).toBe(11); // 10 for the male Beegarde + 1 for Z
  });

  it('an owned gendered parent costs nothing extra', () => {
    // the gender-locked step's parents are NOT bred by the plan
    const steps = [step({
      child: 'Z', parents: ['Katress', 'Wixen'], kind: 'gendered',
      genderNote: 'female Katress + male Wixen',
    })];
    const e = expectedEggs(steps, even);
    expect(e.expectedEggs).toBe(1);
    expect(e.pickyGenderSteps).toBe(0);
  });

  it('needing BOTH genders through gender locks beats the reuse heuristic', () => {
    // bred child feeds two gender-locked steps as mother AND father
    const steps = [
      step({ child: 'Q' }),
      step({ child: 'R', genderNote: 'female Q + male M' }),
      step({ child: 'S', genderNote: 'female F + male Q' }),
    ];
    const e = expectedEggs(steps, even);
    expect(e.bothGenderSteps).toBe(1);
    expect(e.expectedEggs).toBe(5); // 3 for Q's both genders + 1 + 1
  });
});

describe('the cake estimate stays a number the player can read', () => {
  it('never returns Infinity, even if a species were 100% one gender', () => {
    // Not reachable with today's datamined table (0.1–0.9, unknown = 0.5),
    // but this is a figure shown on screen — "expect ~Infinity cakes" must
    // be impossible regardless of what the data becomes.
    const steps = [
      { parents: ['A', 'B'], child: 'OneGender', genderNote: null, reusedAsParent: 2 },
    ] as unknown as Parameters<typeof expectedEggs>[0];
    for (const p of [0, 1]) {
      const est = expectedEggs(steps, () => p);
      expect(Number.isFinite(est.expectedEggs)).toBe(true);
    }
  });
});
