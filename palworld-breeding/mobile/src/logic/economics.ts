/** Cake economics — how many eggs a plan REALLY costs, counting gender
 * luck, shared verbatim between the website and the phone.
 *
 * BYTE-IDENTICAL RULE: exact copy in `app/src/logic/` and
 * `mobile/src/logic/`, enforced by `app/tests/logic-parity.test.ts`.
 *
 * The honesty contract: every number here is computed from datamined
 * inputs — the plan's own steps and the game's per-species gender table
 * (genderRatio.g.ts, palcalc BreedingGenderProbability). The model is
 * stated in plain words in the UI:
 *   - a step whose child must come out BOTH genders (it parents two or
 *     more later steps) averages 1/p + 1/(1-p) - 1 eggs (3 at 50/50);
 *   - a step whose child feeds a gender-locked recipe needs one SPECIFIC
 *     gender and averages 1/P(that gender) eggs (10 for a male Beegarde
 *     at 10% male!);
 *   - every other step needs one hatch: 1 egg.
 * One cake per egg, so expected cakes = expected eggs. */
import { parseGenderNote } from '../engine/formula';
import type { PlanStep } from '../engine/types';

export interface EggEstimate {
  /** one egg per step — the floor the plan can never beat */
  minEggs: number;
  /** expected eggs counting gender luck, rounded up */
  expectedEggs: number;
  /** steps that must hatch both genders */
  bothGenderSteps: number;
  /** steps that must hatch one specific gender (gender-locked recipes) */
  pickyGenderSteps: number;
}

export function expectedEggs(
  steps: PlanStep[],
  maleProb: (name: string) => number,
): EggEstimate {
  // which bred children must come out a SPECIFIC gender, because they feed
  // a gender-locked recipe later in the plan
  const bred = new Set(steps.map((s) => s.child));
  const neededGender = new Map<string, Set<'m' | 'f'>>();
  for (const s of steps) {
    if (!s.genderNote) continue;
    const g = parseGenderNote(s.genderNote);
    if (!g) continue;
    for (const [name, sex] of [[g.mother, 'f'], [g.father, 'm']] as const) {
      if (!bred.has(name)) continue; // owned parents cost no eggs
      const set = neededGender.get(name) ?? new Set<'m' | 'f'>();
      set.add(sex);
      neededGender.set(name, set);
    }
  }

  let total = 0;
  let both = 0;
  let picky = 0;
  for (const s of steps) {
    // The estimate divides by p and by 1 - p. Today's datamined table runs
    // 0.1 to 0.9 and unknown species default to 0.5, so neither can be zero
    // and this changes nothing. But it is a number the player READS, and a
    // future game patch adding a single-gender species would turn "expect
    // ~53 cakes" into "expect ~Infinity cakes". Keep it finite.
    const p = Math.min(0.99, Math.max(0.01, maleProb(s.child)));
    const needs = neededGender.get(s.child);
    const needsBoth = (needs?.size === 2)
      || ((needs?.size ?? 0) === 0 && s.reusedAsParent >= 2);
    if (needsBoth) {
      // expected hatches until both genders have shown up
      total += 1 / p + 1 / (1 - p) - 1;
      both++;
    } else if (needs?.size === 1) {
      const wantMale = needs.has('m');
      total += 1 / (wantMale ? p : 1 - p);
      picky++;
    } else {
      total += 1;
    }
  }
  return {
    minEggs: steps.length,
    expectedEggs: Math.ceil(total),
    bothGenderSteps: both,
    pickyGenderSteps: picky,
  };
}
