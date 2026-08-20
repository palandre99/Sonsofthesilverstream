/** Helper-advice copy: an accelerator bred late in the plan must not claim
 * it "helps with everything after" (hostile-review find, 2026-08-15). */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BreedingEngine } from '../src/engine/formula';
import { helperAdvice } from '../src/engine/helpers';
import type { BreedingData, PlanStep } from '../src/engine/types';

const data = JSON.parse(
  readFileSync(join(__dirname, '../public/data/breeding_1_0.json'), 'utf8'),
) as BreedingData;
const engine = new BreedingEngine(data);

const step = (wave: number, child: string): PlanStep => ({
  wave, parents: ['Lamball', 'Cattiva'], child, kind: 'generic',
  tieBreak: false, margin: 1, genderNote: null, isTarget: false,
  neededBy: [child], reusedAsParent: 0,
});

describe('in-plan helper notes', { timeout: 60000 }, () => {
  it('early phase says pull it forward; late phase is honest and offers the catch', () => {
    const roster = ['Lamball', 'Cattiva'];
    const owned = new Set(roster);
    // a 10-wave plan that breeds Ribbuny in wave 1 and Braloha in wave 9
    const steps: PlanStep[] = [
      step(1, 'Ribbuny'),
      ...Array.from({ length: 8 }, (_, i) => step(i + 2, `Filler${i}`)),
      step(9, 'Braloha'),
      step(10, 'Fuack'),
    ];
    const advice = helperAdvice(
      engine, roster, (n) => owned.has(n),
      { targets: ['Fuack'], steps, roster },
    );
    const ribbuny = advice.find((a) => a.helper.name === 'Ribbuny')!;
    expect(ribbuny.status).toBe('in-plan');
    expect(ribbuny.note).toContain('helps with everything after');

    const braloha = advice.find((a) => a.helper.name === 'Braloha')!;
    expect(braloha.status).toBe('in-plan');
    expect(braloha.note).not.toContain('helps with everything after');
    expect(braloha.note).toContain('Phase 9 of 10');
    expect(braloha.note.toLowerCase()).toContain('catch');
  });
});
