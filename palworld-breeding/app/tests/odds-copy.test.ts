/**
 * The Odds Lab does not just print numbers — it gives ADVICE, and advice is a
 * claim like any other. This sweeps every sentence and counted label it can
 * print, at zero, one, and many.
 *
 * What the sweep found on 2026-08-17, all of it on the commonest path there is
 * — a player hunting ONE passive:
 *
 *   "All 1 wanted" · "Exactly those, no junk" · "Eggs for 90% of all 1 wanted"
 *   · "1 cycles on Cake" · "1 in 1.0 eggs" when every egg is a hit · and
 *   "0.00%" printed for an outcome that is merely rare (four wanted passives
 *   out of a pool of twenty is 1 in 48,450 — the big number said impossible
 *   while the line under it said otherwise).
 *
 * The arithmetic claims, by contrast, were all TRUE — and that is exactly the
 * problem worth guarding: "one category half the time, two a third of the
 * time, all three one time in six" is only true while the inheritance weights
 * say so, and nothing tied the sentence to the weights. A true promise with no
 * test is one refactor from a lie.
 *
 * The screen is React Native and cannot be rendered here, so its copy is read
 * from source the way `privacy-promise.test.ts` reads mobile/src. Comments are
 * stripped: a rule that survives only in prose does not count as shipped.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CAKES, IV_CATEGORIES, ivInheritP, ivOdds, passiveOdds,
} from '../src/engine/odds';
import palsJson from '../public/data/pals_1_0.json';

const pals = (palsJson as { pals: Record<string, unknown> }).pals;

const raw = readFileSync(
  join(__dirname, '../../mobile/src/screens/OddsScreen.tsx'), 'utf8');
const code = raw
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('the odds the screen quotes are the odds the engine computes', () => {
  it('“one category half the time, two a third, all three one time in six”', () => {
    const p = Object.fromEntries(ivInheritP);
    expect(p[1]).toBeCloseTo(1 / 2, 6);
    expect(p[2]).toBeCloseTo(1 / 3, 6);
    expect(p[3]).toBeCloseTo(1 / 6, 6);
    // and the screen still says exactly that
    expect(code).toContain('inherits one category half the time, two a third of the time, all three');
    expect(code).toContain('one time in six');
  });

  it('“at least one of the three is always taken from a parent”', () => {
    // the claim is that zero inherited categories is impossible
    expect([...ivInheritP.keys()].every((k) => k >= 1)).toBe(true);
    expect(ivOdds(1).categoriesInherited).toBeGreaterThan(0);
    expect(code).toContain('At least one of the three is always');
    // and there really are three of them
    expect(IV_CATEGORIES).toBe(3);
  });

  it('introduces “IVs” and “hidden potential” as the same thing, once', () => {
    // the screen used to call one thing three names — the tab said IVs, the
    // body said hidden potential, the last card said "IV work" — and never
    // tied them together
    expect(code, 'the two names are no longer introduced together')
      .toContain("IVs are your pal's hidden potential");
    expect(code, '"IV work" is back — jargon the screen never defines')
      .not.toContain('Serious IV work');
  });

  it('“each inherited category picks mother or father on a coin flip”', () => {
    // a coin flip per wanted category is exactly the 0.5^n the engine applies
    for (let n = 1; n <= IV_CATEGORIES; n++) {
      const o = ivOdds(n);
      expect(o.fromChosenParent).toBeCloseTo(o.categoriesInherited * 0.5 ** n, 10);
    }
    expect(code).toContain('coin');
  });

  it('“you cannot force all three” is true — the best case is one in six', () => {
    expect(Object.fromEntries(ivInheritP)[IV_CATEGORIES]).toBeLessThan(1);
    expect(code).toContain("Why you can't force all three");
  });
});

describe('rare is not the same as impossible', () => {
  it('there really is a reachable outcome that used to print as 0.00%', () => {
    // this is the case that motivated the fix — kept so the guard below has a
    // reason attached to it rather than a bare string match
    const p = passiveOdds({ poolSize: 20, desiredCount: 4 }).allDesired;
    expect(p).toBeGreaterThan(0);
    expect((p * 100).toFixed(2)).toBe('0.00');
  });

  it('the screen prints “<0.01%” instead of a flat zero', () => {
    expect(code, 'the small-probability branch is gone — a 1-in-48,450 shot '
      + 'is being shown as 0.00%, which reads as impossible')
      .toContain("if (p < 0.0001) return '<0.01%';");
  });

  it('and says “every egg” rather than “1 in 1.0 eggs” at a certainty', () => {
    const p = passiveOdds({ poolSize: 1, desiredCount: 1 }).allDesired;
    expect(p).toBeCloseTo(1, 6);
    expect(code).toContain("return 'every egg';");
  });
});

describe('the cakes card says what it means', () => {
  it('“two eggs at 1% each is 1.99% per cycle, not 2% per egg”', () => {
    const veg = CAKES.find((c) => c.id === 'vegetable')!;
    expect(veg.eggsPerCycle).toBe(2);
    expect(veg.mutationPerEgg).toBe(0.01);
    // the arithmetic the sentence claims: 1 - 0.99^2
    const perCycle = 1 - (1 - veg.mutationPerEgg) ** veg.eggsPerCycle;
    expect(+(perCycle * 100).toFixed(2)).toBe(1.99);
    expect(code).toContain('is 1.99% per cycle, not 2% per egg');
  });

  it('and the badge above that sentence does not round it back to 2%', () => {
    // `pct` rounds to one decimal, so the badge read "2.0% mutation per cycle"
    // directly above the line explaining that it is NOT 2%. Caught on the
    // render, not in the source.
    expect(code, 'the cake badge is back on the rounding formatter')
      .toContain('{pctExact(m.mutationPerCycle)} mutation per cycle');
    const exact = (p: number) => `${(p * 100).toFixed(2).replace(/\.?0+$/, '')}%`;
    expect(exact(0.0199)).toBe('1.99%');
    expect(exact(0.01)).toBe('1%');
    expect(exact(0.03)).toBe('3%');
  });

  it('does not abbreviate a mutation to “mut”', () => {
    expect(code, '"mut/cycle" is back — a player cannot tell whether that is '
      + 'mutation, mutant or mutated').not.toContain('mut/cycle');
    expect(code).toContain('mutation per cycle');
  });
});

describe('counted labels read like a person wrote them', () => {
  it('does not say “All 1 wanted” when one passive is ticked', () => {
    expect(code, 'the one-passive wording is gone')
      .toContain("desired.length === 1 ? 'The one you want'");
    expect(code).toContain("desired.length === 1 ? 'Just that, no junk'");
    expect(code).toContain("? 'Eggs for a 90% chance'");
  });

  it('does not say “1 cycles”', () => {
    expect(code, 'the cycles helper is gone').toMatch(/cycle\$\{n === 1 \? '' : 's'\}/);
    // and it is actually used by the card, not just defined
    expect(code).toMatch(/\$\{cycles\(Math\.ceil\(odds\.eggsFor90 \/ c\.eggsPerCycle\)\)\} on/);
  });

  it('one cycle really is reachable, on more than one cake', () => {
    // ceil(eggs / eggsPerCycle) === 1 — the case the plural bug printed for
    const one = passiveOdds({ poolSize: 1, desiredCount: 1 }).eggsFor90;
    expect(one).toBe(1);
    const veg = CAKES.find((c) => c.id === 'vegetable')!;
    expect(veg.eggsPerCycle).toBe(2);
    expect(Math.ceil(passiveOdds({ poolSize: 2, desiredCount: 1 }).eggsFor90 / veg.eggsPerCycle))
      .toBe(1);
  });

  it('“N pals make eggs arrive faster” cannot become “1 pals”', () => {
    // that heading counts a list DERIVED FROM THE GAME DATA — pals whose base
    // support speeds eggs up. It is 2 today (Braloha, Dynamoff) so the plural
    // is right, but nothing stopped a data update from taking it to 1. Found
    // by the untruncated counted-label scan on 2026-08-17; the copy is left
    // alone and the assumption is pinned instead.
    const helpers = Object.entries(pals)
      .filter(([, p]) => {
        const t = (p as { base_support?: { type?: string } }).base_support?.type;
        return t === 'egg_speed' || t === 'incubation';
      })
      .filter(([, p]) => (p as { partner_effect?: string }).partner_effect);
    expect(helpers.length,
      `only ${helpers.length} egg helper(s) — the heading would read "1 pals"`)
      .toBeGreaterThan(1);
    expect(code).toContain('pals make eggs arrive faster');
  });

  it('keeps the plurals that were already right', () => {
    // the warning only appears above the slot cap, so its "passives" is safe;
    // the stat count and the passive-table row already branch
    expect(code).toContain('passive{r.skills > 1 ? \'s\' : \'\'}');
    expect(code).toContain("stat${n > 1 ? 's' : ''}");
  });
});
