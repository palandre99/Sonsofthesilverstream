/** Helper-advice gate — the "Chikipi bug" regression (CEO, 2026-08-15).
 *
 * Chikipi has the second-highest CombiRank in the game (3080): generic
 * breeding can essentially never reach DOWN to it from a normal box, so
 * planFor() reports it unreachable. helperAdvice used to `continue` on
 * unreachable helpers — silently hiding the game's egg pal (8 eggs per cake)
 * from exactly the player who needs to hear about it. The contract now:
 * an unreachable ranch helper still surfaces, marked catch-only, and the
 * essential producers (score 5) are recommended.
 */
import { describe, expect, it } from 'vitest';
import breedingJson from '../../data/breeding_1_0.json';
import { BreedingEngine, type BreedingData } from '../src/engine/formula';
import { derivations, planFor } from '../src/engine/planner';
import { helperAdvice } from '../src/engine/helpers';

const engine = new BreedingEngine(breedingJson as unknown as BreedingData);

/** a plausible mid-game box that owns NO ranch helpers */
const BOX = ['Lamball', 'Foxparks', 'Pengullet', 'Cattiva', 'Direhowl',
  'Rushoar', 'Anubis', 'Penking'];
const ownedAny = (n: string) => BOX.includes(n);

describe('helperAdvice', () => {
  const targets = ['Jormuntide Ignis', 'Renjishi', 'Solenne'];
  const derivs = derivations(engine, new Set(BOX));
  const { steps } = planFor(engine, BOX, targets, derivs);
  const advice = helperAdvice(engine, BOX, ownedAny,
    { targets, steps, roster: BOX }, derivs);

  it('surfaces Chikipi even when breeding cannot reach it', () => {
    const chikipi = advice.find((a) => a.helper.name === 'Chikipi');
    expect(chikipi).toBeDefined();
    expect(chikipi!.catchOnly).toBe(true);
    expect(chikipi!.recommended).toBe(true);
    expect(chikipi!.note).toMatch(/catch/i);
  });

  it('never drops an unowned score-5 ranch helper from the list', () => {
    for (const name of ['Chikipi', 'Mozzarina', 'Beegarde']) {
      expect(advice.some((a) => a.helper.name === name)).toBe(true);
    }
  });

  it('sorts recommended suggestions first', () => {
    const firstNotRecommended = advice.findIndex(
      (a) => a.status === 'suggest' && !a.recommended);
    const lastRecommended = advice.map(
      (a) => a.status === 'suggest' && a.recommended).lastIndexOf(true);
    if (firstNotRecommended !== -1 && lastRecommended !== -1) {
      expect(lastRecommended).toBeLessThan(firstNotRecommended);
    }
  });

  it('still prices reachable helpers in steps, not hand-waving', () => {
    const reachable = advice.filter((a) => a.status === 'suggest' && !a.catchOnly);
    for (const a of reachable) {
      expect(a.addSteps).toBeGreaterThanOrEqual(0);
    }
  });
});
