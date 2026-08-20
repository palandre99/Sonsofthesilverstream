/** The recommendation brain — scoring, labels, caching, level cutoffs. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BreedingEngine } from '../src/engine/formula';
import type { BreedingData } from '../src/engine/types';
import {
  attainLabel, boxKeyOf, cachedDerivations, effortSteps, getAttainContext,
  recommendedSet, scoreOf, type Attain,
} from '../src/logic/recommend';
import { PALCALC_FACTS } from '../src/data/palcalcFacts.g';

const data = JSON.parse(
  readFileSync(join(__dirname, '../public/data/breeding_1_0.json'), 'utf8'),
) as BreedingData;
const palsJson = JSON.parse(
  readFileSync(join(__dirname, '../public/data/pals_1_0.json'), 'utf8'),
) as { pals: Record<string, { wild: boolean }> };

const engine = new BreedingEngine(data);
const pals = palsJson.pals;

const ctxFor = (box: string[], level?: number) => {
  const owned = new Set(box);
  return getAttainContext(engine, pals, data, box, level, (n) => owned.has(n));
};

describe('scoring', () => {
  it("the CEO's example: level 6 one breed away beats level 7 at 83 breeds", () => {
    // values are within-section fractions of the best (7 is the section top)
    const near: Attain = { kind: 'breed', steps: 1 };
    const far: Attain = { kind: 'breed', steps: 83 };
    expect(scoreOf(6 / 7, near)).toBeGreaterThan(scoreOf(7 / 7, far));
  });

  it('owned costs nothing, a catch is one action, an unlock is three', () => {
    expect(effortSteps({ kind: 'have' })).toBe(0);
    expect(effortSteps({ kind: 'catch', lv: 10 })).toBe(1);
    expect(effortSteps({ kind: 'later', unlock: 'Teafant' })).toBe(3);
    expect(effortSteps({ kind: 'later' })).toBeGreaterThan(90);
  });

  it('RECOMMENDED = nearly the best AND genuinely close AND not owned', () => {
    const attain = (n: string): Attain =>
      n === 'Close' ? { kind: 'breed', steps: 2 }
        : n === 'Far' ? { kind: 'breed', steps: 40 }
          : n === 'Mine' ? { kind: 'have' }
            : { kind: 'later' };
    const rec = recommendedSet([
      { name: 'Close', value: 0.9 },  // near-best, 2 steps  -> in
      { name: 'Far', value: 1.0 },    // the best, 40 steps  -> out
      { name: 'Mine', value: 0.95 },  // owned               -> out
      { name: 'Weak', value: 0.3 },   // not near-best       -> out
    ], attain);
    expect(rec).toEqual(new Set(['Close']));
  });
});

describe('labels', () => {
  it('every status explains itself — no bare ENDGAME anywhere', () => {
    const kinds: Attain[] = [
      { kind: 'have' },
      { kind: 'breed', steps: 1 },
      { kind: 'breed', steps: 4 },
      { kind: 'catch', lv: 12 },
      { kind: 'later', unlock: 'Teafant' },
      { kind: 'later' },
    ];
    for (const a of kinds) {
      const l = attainLabel(a);
      expect(l.short.length).toBeGreaterThan(0);
      expect(l.long.length).toBeGreaterThan(l.short.length);
      expect(l.short).not.toBe('ENDGAME');
    }
    expect(attainLabel({ kind: 'later' }).short).toBe('LONG-TERM GOAL');
    expect(attainLabel({ kind: 'later', unlock: 'Teafant' }).short)
      .toBe('CATCH TEAFANT FIRST');
    expect(attainLabel({ kind: 'breed', steps: 1 }).short).toBe('BREED · 1 STEP');
  });
});

// the derivations fixpoint costs seconds under vitest (335 ms on device) —
// that cost is exactly why the brain caches it; budget accordingly here
describe('attain context', { timeout: 60000 }, () => {
  it('judges from the box: owned -> have, reachable -> breed with real steps', () => {
    const box = ['Lamball', 'Cattiva'];
    const ctx = ctxFor(box);
    expect(ctx.attain('Lamball')).toEqual({ kind: 'have' });
    // the wiring test: whatever the oracle-tested planner says is reachable
    // must surface as breed with that exact step count
    const derivs = cachedDerivations(engine, box);
    const reachable = [...derivs.keys()].find((n) => !box.includes(n))!;
    expect(reachable).toBeTruthy();
    const a = ctx.attain(reachable);
    expect(a.kind).toBe('breed');
    expect(a.kind === 'breed' && a.steps).toBe(derivs.get(reachable)!.size);
  });

  /* CEO, 2026-08-17 13:24, with three screenshots — level 80, 37 pals, and
   * the Flying mounts card showing SIX pals all reading "BREED · 1 STEP",
   * led by Nitewing:
   *
   *   "Also it recommends pals I have caught? At least collapse the bubble?
   *    Or maybe not recommend at all? ... the recomendayions are not dynamic,
   *    reactive ... I said I'm lvl 80 and my paldex has a lot. Flying mount
   *    first recommendation is a nitewing ... Engine is not actually
   *    thinking?"
   *
   * Two measured causes:
   *
   *   1. Owning a pal costs zero effort, so an owned pal kept its FULL score
   *      and outranked better pals that cost something. Measured: owned at
   *      value 0.50 scored 0.500 against 0.375 for a perfect pal five steps
   *      out. A pal in the box is not advice.
   *   2. Mount sections had no quality gradient at all, so they sorted on
   *      nearness alone — and at a full save nearly everything is one step
   *      away, so the tie was broken by list order. His level-80 list led
   *      with a 280-stat starter flyer while 395-stat Shaolong sat further
   *      down, catchable at his level.
   */
  describe('a pal you already own is not a recommendation', () => {
    it('owned sinks below everything you do not have', () => {
      const owned = { kind: 'have' } as const;
      // even the worst unowned option outranks a perfect owned one
      const worst = scoreOf(0.01, { kind: 'later' });
      expect(scoreOf(1, owned)).toBeLessThan(worst);
    });

    it('the case that motivated it: mediocre-owned used to beat excellent-far', () => {
      const mediocreOwned = scoreOf(0.5, { kind: 'have' });
      const excellentFar = scoreOf(1, { kind: 'breed', steps: 5 });
      expect(excellentFar).toBeGreaterThan(mediocreOwned);
    });

    it('does not disturb the ordering of things you can actually get', () => {
      // the CEO's kindling example must still hold exactly
      const near = scoreOf(6 / 7, { kind: 'breed', steps: 1 });
      const far = scoreOf(1, { kind: 'breed', steps: 83 });
      expect(near).toBeGreaterThan(far);
    });
  });

  /* The CEO, 2026-08-17, on "The best pals in the game" — the rows told him
   * "Catch one in the wild — spawns from Lv 65" and never said whether he
   * could breed it instead:
   *
   *   "the catch one in the wild text is good and I like it tells me it's
   *    level etch, but it doesn't say if I can breed it or not. It's a bit
   *    poor design"
   *
   * The brain always KNEW both routes — it computed the breeding distance,
   * then threw it away when it decided catching was the better advice. It
   * still gives the same advice; it just no longer hides the alternative.
   * Measured on a 26-pal mid-game box: 223 of 299 rows carry a second route. */
  describe('a row names every route it knows', () => {
    it('a catchable pal that is also breedable says both', () => {
      const box = ['Lamball', 'Cattiva'];
      const ctx = ctxFor(box);
      const derivs = cachedDerivations(engine, box);
      const cutoff = ctx.stage + (ctx.explicit ? 0 : 10);
      const both = [...derivs.keys()].find((n) => {
        if (box.includes(n)) return false;
        const f = PALCALC_FACTS[n];
        return ctx.attain(n).kind === 'catch'
          && !!pals[n]?.wild && f?.minWild != null && f.minWild <= cutoff;
      });
      expect(both, 'no pal is reachable both ways — the case is gone').toBeTruthy();
      const a = ctx.attain(both!);
      expect(a.kind).toBe('catch');
      expect(a.kind === 'catch' && a.steps, 'the breeding distance was thrown away again')
        .toBe(derivs.get(both!)!.size);
      const long = attainLabel(a).long;
      expect(long).toContain('Catch one in the wild');
      expect(long, 'the row still hides the breeding route').toMatch(/breed it in \d+ steps?\./);
    });

    it('a catchable pal with NO breeding route says that too', () => {
      // silence would read as "there might be a way" — an absence nobody
      // explains reads as a bug
      const a = { kind: 'catch', lv: 40 } as const;
      expect(attainLabel(a).long)
        .toBe('Catch one in the wild — spawns from Lv 40. No breeding route from your pals yet.');
    });

    it('a breedable pal that is also catchable offers the catch', () => {
      const a = { kind: 'breed', steps: 2, catchLv: 12 } as const;
      expect(attainLabel(a).long)
        .toBe('Breed it — 2 steps from pals you already have, or catch one from Lv 12.');
    });

    it('reads as a person wrote it at one step, both ways round', () => {
      expect(attainLabel({ kind: 'breed', steps: 1 }).long)
        .toBe('Breed it — one step from pals you already have.');
      expect(attainLabel({ kind: 'catch', lv: 9, steps: 1 }).long)
        .toBe('Catch one in the wild — spawns from Lv 9, or breed it in one step.');
    });

    it('the advice itself did not change — only what it admits to', () => {
      // the recommendation (which kind wins) must be exactly as before, so
      // ordering and the RECOMMENDED tag are untouched
      const box = ['Lamball', 'Cattiva'];
      const ctx = ctxFor(box);
      const derivs = cachedDerivations(engine, box);
      for (const n of [...derivs.keys()].slice(0, 40)) {
        const a = ctx.attain(n);
        if (a.kind === 'breed' && a.steps >= 4) {
          const f = PALCALC_FACTS[n];
          const cutoff = ctx.stage + (ctx.explicit ? 0 : 10);
          const catchableHere = !!pals[n]?.wild
            && f?.minWild != null && f.minWild <= cutoff;
          expect(catchableHere,
            `${n} is a 4+ step breed AND catchable — catching should have won`)
            .toBe(false);
        }
      }
    });
  });

  it('a long breeding route yields to an in-reach catch (>=4 steps, like the planner advice)', () => {
    const box = ['Lamball', 'Cattiva'];
    const ctx = ctxFor(box);
    const derivs = cachedDerivations(engine, box);
    const cutoff = ctx.stage + (ctx.explicit ? 0 : 10); // the brain's own reach
    let deepCatchables = 0;
    for (const [n, d] of derivs) {
      if (box.includes(n)) continue;
      const a = ctx.attain(n);
      const catchableHere = !!pals[n]?.wild
        && PALCALC_FACTS[n]?.minWild != null && PALCALC_FACTS[n]!.minWild! <= cutoff;
      if (d.size >= 4 && catchableHere) {
        deepCatchables++;
        expect(a.kind).toBe('catch'); // catching one is the honest advice
      } else {
        expect(a.kind).toBe('breed'); // short routes stay breeding advice
      }
    }
    expect(deepCatchables).toBeGreaterThan(0); // the rule actually fires on real data
  });

  it('an explicit player level is a hard catch cutoff; the proxy has slack', () => {
    const strict = ctxFor([], 12);
    expect(strict.explicit).toBe(true);
    for (const n of Object.keys(pals)) {
      const a = strict.attain(n);
      if (a.kind === 'catch') expect(a.lv).toBeLessThanOrEqual(12);
    }
    const proxy = ctxFor([]);
    expect(proxy.explicit).toBe(false);
    expect(proxy.stage).toBe(15); // floor with an empty box
    const catchLvs = Object.keys(pals)
      .map((n) => proxy.attain(n))
      .filter((a): a is Extract<Attain, { kind: 'catch' }> => a.kind === 'catch')
      .map((a) => a.lv);
    expect(Math.max(...catchLvs)).toBeLessThanOrEqual(25); // 15 + 10 slack
  });

  it('the expensive fixpoint is cached per box', () => {
    const box = ['Lamball', 'Cattiva'];
    const first = cachedDerivations(engine, box);
    const t0 = Date.now();
    const second = cachedDerivations(engine, [...box].reverse());
    expect(Date.now() - t0).toBeLessThan(50); // a hit is free
    expect(second).toBe(first); // same roster, any order -> the same map
    expect(boxKeyOf(box)).toBe(boxKeyOf([...box].reverse()));
    const other = cachedDerivations(engine, ['Foxparks']);
    expect(other).not.toBe(first);
  });

  it('facts data is present for the judgements (wild ranges exist)', () => {
    expect(PALCALC_FACTS['Lamball']?.minWild).not.toBeNull();
  });
});
