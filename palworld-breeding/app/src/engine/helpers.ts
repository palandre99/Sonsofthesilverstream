/** The helper-pal brain: which pals make a breeding plan FASTER, scored
 * the way a human player scores them — and what to do about each one.
 *
 * Every effect line is the game's own partner-skill data (pals_1_0.json,
 * game dump) — nothing invented, nothing community-guessed. CEO claims
 * verified against game data 2026-08-15: Braloha egg-production speed,
 * Dynamoff incubation, Grintale extra eggs, Broncherry / Broncherry Aqua
 * alpha-egg chance — all real partner skills, quoted near-verbatim.
 */
import type { BreedingEngine } from './formula';
import { planFor } from './planner';
import type { PlanStep } from './types';

export interface HelperDef {
  /** exact dataset species name */
  name: string;
  role: 'ranch' | 'speed' | 'luck' | 'base';
  ingredient?: 'milk' | 'eggs' | 'honey' | 'berries';
  /** importance 1–5, scored against the cake→egg→hatch pipeline */
  score: 1 | 2 | 3 | 4 | 5;
  /** the game's partner-skill effect, shortened but faithful */
  effect: string;
  /** plain-language why, shown with recommendations */
  why: string;
  confidence: 'game-data';
}

/** Ranked helper registry. Ranch pals that feed the cake recipe first,
 * then the throughput multipliers, then luck and base helpers. */
export const HELPERS: HelperDef[] = [
  {
    name: 'Chikipi', role: 'ranch', ingredient: 'eggs', score: 5,
    effect: 'Lays Eggs when assigned to the Ranch',
    why: 'Every cake needs 8 eggs — no eggs, no cakes, no breeding.',
    confidence: 'game-data',
  },
  {
    name: 'Mozzarina', role: 'ranch', ingredient: 'milk', score: 5,
    effect: 'Drops Milk when assigned to the Ranch',
    why: 'Every cake needs 7 milk, and the Ranch is the only hands-free source.',
    confidence: 'game-data',
  },
  {
    name: 'Beegarde', role: 'ranch', ingredient: 'honey', score: 5,
    effect: 'Drops Honey when assigned to the Ranch',
    why: 'Every cake needs 2 honey — the Ranch is the only steady source.',
    confidence: 'game-data',
  },
  {
    name: 'Caprity', role: 'ranch', ingredient: 'berries', score: 4,
    effect: 'Drops Red Berries when assigned to the Ranch',
    why: '8 berries per cake. A berry plantation works too — Caprity needs no farmhands.',
    confidence: 'game-data',
  },
  {
    name: 'Braloha', role: 'speed', score: 4,
    effect: 'Breeding Farm egg production +20–50% while in your base',
    why: 'Every step of this plan waits on the Breeding Farm — Braloha speeds all of them.',
    confidence: 'game-data',
  },
  {
    name: 'Dynamoff', role: 'speed', score: 4,
    effect: 'Egg incubation time −20–40% while at your base',
    why: 'Cuts the other big wait: hatching what you bred.',
    confidence: 'game-data',
  },
  {
    name: 'Grintale', role: 'luck', score: 4,
    effect: '50–75% chance of an extra egg when you pick one up (in party)',
    why: 'Free duplicate eggs — more shots at the stats you want without extra breeding.',
    confidence: 'game-data',
  },
  {
    name: 'Broncherry Aqua', role: 'luck', score: 3,
    effect: 'Eggs you pick up: 45–55% chance to become an Alpha Pal Egg (in party)',
    why: 'For alpha hunters — hatch the big versions.',
    confidence: 'game-data',
  },
  {
    name: 'Broncherry', role: 'luck', score: 2,
    effect: 'Eggs you pick up: 35–45% chance to become an Alpha Pal Egg (in party)',
    why: 'Weaker sibling of Broncherry Aqua — only if Aqua is out of reach.',
    confidence: 'game-data',
  },
  {
    name: 'Ribbuny', role: 'base', score: 2,
    effect: '+1 Handiwork level for every pal in your base',
    why: 'Faster milling and crafting for the cake supply chain.',
    confidence: 'game-data',
  },
];

export const HELPER_NAMES: ReadonlySet<string> = new Set(HELPERS.map((h) => h.name));

export interface HelperAdvice {
  helper: HelperDef;
  status: 'covered' | 'in-plan' | 'suggest';
  /** for in-plan: the phase that breeds it */
  phase?: number;
  /** for suggest: exact extra steps if added (0 = free byproduct) */
  addSteps?: number;
  recommended: boolean;
  /** one plain sentence tailored to the situation */
  note: string;
}

/** Think like a player: covered → nothing to do; in the plan → point at the
 * phase and pull it early; missing → price it (real re-plan) and recommend
 * honestly. */
export function helperAdvice(
  engine: BreedingEngine,
  ownedNames: string[],
  ownedAny: (n: string) => boolean,
  plan: { targets: string[]; steps: PlanStep[] },
): HelperAdvice[] {
  const planChild = new Map(plan.steps.map((s) => [s.child, s.wave]));
  const nSteps = plan.steps.length;
  const out: HelperAdvice[] = [];

  for (const h of HELPERS) {
    if (ownedAny(h.name)) {
      out.push({
        helper: h, status: 'covered', recommended: false,
        note: 'In your Paldex — put it to work.',
      });
      continue;
    }
    const wave = planChild.get(h.name);
    if (wave != null) {
      out.push({
        helper: h, status: 'in-plan', phase: wave, recommended: false,
        note: `This plan breeds it in Phase ${wave} — do that branch first so it helps with everything after.`,
      });
      continue;
    }
    const res = planFor(engine, ownedNames, [...plan.targets, h.name]);
    if (res.unreachable.includes(h.name)) continue; // don't tease the impossible
    const addSteps = res.steps.length - nSteps;
    const recommended = addSteps === 0
      || (h.role === 'ranch' ? nSteps >= 6 && addSteps <= 3
        : h.score >= 3 && nSteps >= 10 && addSteps <= 3);
    const note = addSteps === 0
      ? `Free — your route already breeds it on the way. ${h.why}`
      : recommended
        ? `Worth it: +${addSteps} step${addSteps === 1 ? '' : 's'} against the ${nSteps} ahead. ${h.why}`
        : `+${addSteps} step${addSteps === 1 ? '' : 's'} is a lot for this plan — your call. ${h.why}`;
    out.push({ helper: h, status: 'suggest', addSteps, recommended, note });
  }

  const rank = (a: HelperAdvice): number =>
    a.status === 'suggest' && a.recommended ? 0
      : a.status === 'in-plan' ? 1
        : a.status === 'suggest' ? 2 : 3;
  return out.sort((a, b) =>
    rank(a) - rank(b)
    || (a.phase ?? 0) - (b.phase ?? 0)
    || b.helper.score - a.helper.score);
}
