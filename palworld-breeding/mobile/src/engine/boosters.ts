/** Plan intelligence: the economy AROUND a breeding plan.
 *
 * Other calculators stop at the breeding tree. A real plan also needs:
 *   - CAKES  — one consumed per egg, so a 48-step plan needs 48+ cakes,
 *              which needs flour/berries/milk/eggs/honey (verified recipe:
 *              5 Flour · 8 Red Berries · 7 Milk · 8 Eggs · 2 Honey).
 *   - RANCH  — Milk/Eggs/Honey come from ranch pals. We derive producers
 *              from each pal's real ranch_produce data — never a hardcoded
 *              guess.
 *   - SPEED  — a few pals accelerate breeding itself (community-verified,
 *              labelled as such): breed them FIRST and every egg after
 *              comes faster.
 *
 * Everything here reads verified data; claims carry their confidence.
 */
import type { PlanStep } from './types';
import { stepId } from './planner';

export interface PalLike {
  ranch_produce?: string[] | null;
}

/** Cake needs for a plan of `steps` breeding steps (minimum one egg each). */
export interface CakeNeeds {
  cakes: number;
  flour: number;
  berries: number;
  milk: number;
  eggs: number;
  honey: number;
}

export function cakeNeeds(steps: number): CakeNeeds {
  return {
    cakes: steps,
    flour: steps * 5,
    berries: steps * 8,
    milk: steps * 7,
    eggs: steps * 8,
    honey: steps * 2,
  };
}

/** Which ingredient a ranch product covers (exact product names from data). */
const PRODUCE_TO_INGREDIENT: Record<string, 'milk' | 'eggs' | 'honey' | 'berries'> = {
  Milk: 'milk',
  Egg: 'eggs',
  Eggs: 'eggs',
  Honey: 'honey',
  'Red Berries': 'berries',
};

export interface ProducerSuggestion {
  ingredient: 'milk' | 'eggs' | 'honey' | 'berries';
  /** pals that produce it on the Ranch, from real ranch_produce data */
  producers: string[];
  /** producers the player already owns */
  owned: string[];
}

export function ranchCoverage(
  pals: Record<string, PalLike>,
  ownedAny: (n: string) => boolean,
): ProducerSuggestion[] {
  const byIngredient: Record<'milk' | 'eggs' | 'honey' | 'berries', string[]> = {
    milk: [], eggs: [], honey: [], berries: [],
  };
  for (const [name, p] of Object.entries(pals)) {
    for (const prod of p.ranch_produce ?? []) {
      const ing = PRODUCE_TO_INGREDIENT[prod];
      if (ing) byIngredient[ing].push(name);
    }
  }
  return (['milk', 'eggs', 'honey', 'berries'] as const).map((ing) => ({
    ingredient: ing,
    producers: byIngredient[ing].sort(),
    owned: byIngredient[ing].filter(ownedAny).sort(),
  }));
}

/** Pals that make breeding itself faster. VERIFIED against the game's own
 * partner-skill data (pals_1_0.json) 2026-08-15 — see engine/helpers.ts for
 * the full scored registry. */
export const ACCELERATORS: { name: string; effect: string; confidence: 'game-data' }[] = [
  { name: 'Braloha', effect: '+20–50% egg production speed at the Breeding Farm', confidence: 'game-data' },
  { name: 'Dynamoff', effect: '−20–40% incubation time', confidence: 'game-data' },
];

export interface AcceleratorStatus {
  name: string;
  effect: string;
  /** already owned — nothing to do */
  owned: boolean;
  /** somewhere in the current plan: which phase produces it */
  planPhase: number | null;
  /** completed already in this plan */
  done: boolean;
}

export function acceleratorStatus(
  plan: PlanStep[] | null,
  ownedAny: (n: string) => boolean,
  isChecked: (sid: string) => boolean,
): AcceleratorStatus[] {
  return ACCELERATORS.map((a) => {
    const step = plan?.find((s) => s.child === a.name) ?? null;
    return {
      name: a.name,
      effect: a.effect,
      owned: ownedAny(a.name),
      planPhase: step ? step.wave : null,
      done: step ? isChecked(stepId(step.parents[0], step.parents[1], step.child)) : false,
    };
  });
}
