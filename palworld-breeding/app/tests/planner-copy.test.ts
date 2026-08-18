/**
 * Walking a genuinely fresh install on 2026-08-17 — no box, no plan, no
 * profile — turned up the one screen where the app changed its mind about
 * what a thing is called.
 *
 * The Plan tab says "goal" everywhere: "Suggested goals", "Choose your goals",
 * "N goals in this plan", "Remove all N goals", "One goal has no route yet".
 * But the two controls a NEW player touches first said something else:
 *
 *     "+ Add target…"        "Plan 1 target"
 *
 * — and a sentence lower down managed both in consecutive lines ("Every goal
 * in this plan… Add another target above"). Worse, the re-plan button
 * twenty-five lines away already said "Plan this goal" / "Plan these N goals"
 * for the SAME action, so the screen had two wordings for one button
 * depending on whether you had planned before. A first-time player met the
 * jargon one; everyone else met the good one.
 *
 * `targets` stays the variable name — that is code, and the player never
 * reads it. This guards the words, by naming them exactly. (An earlier
 * version of this test tried to EXTRACT every player-visible string with
 * regexes and matched half the file's source code instead; precise
 * assertions are the right tool here.)
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const raw = readFileSync(
  join(__dirname, '../../mobile/src/screens/PlannerScreen.tsx'), 'utf8');
const code = raw
  .replace(/\{\s*\/\*(?:(?!\*\/)[\s\S])*\*\/\s*\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('the Plan tab calls a goal a goal', () => {
  it('reads the screen at all', () => {
    expect(raw.length).toBeGreaterThan(20000);
    expect(code).toContain('goals in this plan — tap to edit');
  });

  it('never shows the player the word "target"', () => {
    expect(code, 'the add button says "target" again')
      .not.toContain('+ Add target');
    expect(code, 'the first-time build button says "target" again')
      .not.toMatch(/Plan \$\{targets\.length\} target/);
    expect(code, 'the nothing-left card says "target" again')
      .not.toMatch(/Add another\s+target above/);
  });

  it('uses the same words for the same button, first plan or re-plan', () => {
    // one action, one wording — the first-time button and the re-plan button
    expect(code.match(/'Plan this goal'/g)?.length,
      'the two build buttons have drifted apart again').toBe(2);
    expect(code.match(/`Plan these \$\{targets\.length\} goals`/g)?.length).toBe(2);
  });

  it('still says "goal" in the places it always did', () => {
    expect(code).toContain('+ Add a goal…');
    expect(code).toContain("'1 goal in this plan — tap to edit'");
    expect(code).toMatch(/Add another\s+goal above/);
    expect(code).toContain('Suggested goals…');
  });
});

describe('a gender gap comes with a way to close it', () => {
  // CEO 2026-08-17: "it should give more info to be smarter… tells me how
  // to fix this step". The hint names the gap; the shared GenderFixRows
  // component says how to close it, on the Plan AND the Calculator. The
  // advice text itself is pinned behaviourally in genderFix.test.ts —
  // this pins the WIRING.
  const rows = readFileSync(
    join(__dirname, '../../mobile/src/ui/GenderFixRows.tsx'), 'utf8')
    .replace(/\{\s*\/\*(?:(?!\*\/)[\s\S])*\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const calc = readFileSync(
    join(__dirname, '../../mobile/src/screens/CalculatorScreen.tsx'), 'utf8')
    .replace(/\{\s*\/\*(?:(?!\*\/)[\s\S])*\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('every option a step hint names gets a how-to-fix row', () => {
    expect(code, 'the fix rows are gone from the step card')
      .toContain('<GenderFixRows needs={m.needs} onView={setViewing} />');
  });

  it("the Calculator's pair warning offers the same rows", () => {
    expect(calc, 'the Calculator lost its how-to-fix rows')
      .toContain('<GenderFixRows onView={onView}');
    expect(calc, "the Calculator's rows must derive needs through the one shared rule")
      .toContain('needs={needsFor(');
  });

  it('the row computes real advice and opens the pal it names', () => {
    expect(rows).toContain('const { pair, fromPlan } = findPair(');
    expect(rows).toContain('{fixLine(fix)}');
    expect(rows).toContain('onPress={() => onView(n.s)}');
    expect(rows).toContain('opens its card');
  });

  it("the advice pair check uses the engine's full answer, both gendered directions", () => {
    // childOf(a,b)[0] would miss the second Katress/Wixen direction
    expect(rows, 'the pair scan stopped checking every child of a pair')
      .toContain('engine.childrenOf(x, y).some(');
  });
});
