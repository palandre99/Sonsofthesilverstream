/**
 * "Need a ♂ X" is a diagnosis; these are the treatment rules. CEO,
 * 2026-08-17: "it should give more info to be smarter, maybe a 'breed x and
 * y to get a female', or 'catch one here'… tells me how to fix this step."
 *
 * The advice must never invent: the breed suggestion names only a pair the
 * player owns that can breed TODAY, and the odds come from the datamined
 * gender table (data/genderRatio.g) or they are not printed at all.
 */
import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  findPair, fixLine, needsFor, oddsPhrase, type NeedFix,
} from '../src/logic/genderFix';

const fix = (over: Partial<NeedFix>): NeedFix => ({
  species: 'Relaxaurus', gender: 'm', unsure: false, pair: null,
  fromPlan: false, wild: true, maleProb: 0.5, ...over,
});

describe('which pair gets suggested', () => {
  it("prefers the plan's own recipe when it still works", () => {
    const makes = (a: string, b: string) => a === 'Dumud' || a === 'Anubis';
    const r = findPair(['Anubis', 'Dumud'], ['Dumud', 'Gorirat'], makes);
    expect(r).toEqual({ pair: ['Dumud', 'Gorirat'], fromPlan: true });
  });

  it('falls back to the first owned pair in name order — stable, not random', () => {
    const makes = (a: string, b: string) => a === 'Cattiva' && b === 'Gumoss';
    const r = findPair(['Gumoss', 'Cattiva', 'Lamball'], null, makes);
    expect(r).toEqual({ pair: ['Cattiva', 'Gumoss'], fromPlan: false });
  });

  it('reports no pair honestly', () => {
    expect(findPair(['A', 'B'], null, () => false))
      .toEqual({ pair: null, fromPlan: false });
  });
});

describe('what is actually missing (needsFor)', () => {
  const F = { m: false, f: true };   // female only
  const M = { m: true, f: false };   // male only
  const BOTH = { m: true, f: true };

  it('two all-female parents: a male of either species closes the gap', () => {
    const r = needsFor('Cattiva', 'Gumoss', F, F, null);
    expect(r.flat).toEqual([{ g: 'm', s: 'Cattiva' }, { g: 'm', s: 'Gumoss' }]);
    expect(r.combos).toEqual([[{ g: 'm', s: 'Cattiva' }], [{ g: 'm', s: 'Gumoss' }]]);
  });

  it('a workable pair needs nothing', () => {
    expect(needsFor('Cattiva', 'Gumoss', M, F, null))
      .toEqual({ combos: [], flat: [] });
  });

  it('the gender-locked pair names the exact mother and father missing', () => {
    // Katress must be the mother: owning only males of both means BOTH a
    // female Katress and (already-owned) male Wixen are checked properly
    const r = needsFor('Katress', 'Wixen', M, M,
      { mother: 'Katress', father: 'Wixen' });
    expect(r.flat).toEqual([{ g: 'f', s: 'Katress' }]);
  });

  it('same species owned only through "?": both genders still to get', () => {
    const r = needsFor('Lamball', 'Lamball', { m: false, f: false }, { m: false, f: false }, null);
    expect(r.flat).toEqual([{ g: 'm', s: 'Lamball' }, { g: 'f', s: 'Lamball' }]);
  });

  it('never more than two rows of advice', () => {
    const r = needsFor('Katress', 'Wixen', { m: false, f: false }, { m: false, f: false },
      { mother: 'Katress', father: 'Wixen' });
    expect(r.flat.length).toBeLessThanOrEqual(2);
  });

  it('sanity: both fully owned, no note', () => {
    expect(needsFor('A', 'B', BOTH, BOTH, null).flat).toEqual([]);
  });
});

describe('the odds phrase', () => {
  it('says half when the species is 50/50', () => {
    expect(oddsPhrase('m', 0.5)).toBe('about half the eggs hatch male');
  });

  it('uses the real datamined skew, for the needed gender', () => {
    // Beegarde is 10% male — needing a male is the hard direction
    expect(oddsPhrase('m', 0.1)).toBe('about 10% of eggs hatch male');
    // ...and needing a female of a male-heavy species flips correctly
    expect(oddsPhrase('f', 0.9)).toBe('about 10% of eggs hatch female');
  });
});

describe('the advice line, by cheapness', () => {
  it('an unchecked "?" catch outranks everything — zero eggs beats any odds', () => {
    const f = fix({ unsure: true, pair: ['A', 'B'] });
    expect(fixLine(f))
      .toBe('first check the one you marked "?" — it may already be the male you need');
  });

  it('a breedable pair: plan recipe says "again", odds attached, catch offered', () => {
    const f = fix({ pair: ['Relaxaurus', 'Sparkit'], fromPlan: true });
    expect(fixLine(f)).toBe(
      'breed Relaxaurus + Sparkit again — about half the eggs hatch male · or catch one — tap for where');
  });

  it('a pair for a pal that never spawns wild points at the card instead', () => {
    const f = fix({ pair: ['A', 'B'], wild: false });
    expect(fixLine(f)).toBe(
      'breed A + B — about half the eggs hatch male · tap the card for other ways');
  });

  it('no pair, wild: catch it', () => {
    expect(fixLine(fix({})))
      .toBe('no pair you own breeds one — catch it in the wild, tap for where');
  });

  it('no pair, not wild: the card carries the obtain routes', () => {
    expect(fixLine(fix({ wild: false })))
      .toBe('no pair you own breeds one — tap the card for how to get it');
  });
});

describe('the scan is affordable at the size of his real box', () => {
  it('worst case (no match) over 131 owned with the real engine', async () => {
    const { BreedingEngine } = await import('../src/engine/formula');
    const { readFileSync } = await import('node:fs');
    const breeding = JSON.parse(readFileSync(
      join(__dirname, '../public/data/breeding_1_0.json'), 'utf8'));
    const pals = JSON.parse(readFileSync(
      join(__dirname, '../public/data/pals_1_0.json'), 'utf8')).pals;
    const engine = new BreedingEngine(breeding);
    const owned = Object.keys(pals).slice(0, 131);

    const t0 = performance.now();
    // a species no pair produces from this box under an always-false gender
    // check — every one of the 131² pairs is visited and rejected
    const r = findPair(owned, null,
      (a, b) => engine.childrenOf(a, b).some(
        (ch: { species: string }) => ch.species === 'Jetragon') && false);
    const cold = performance.now() - t0;

    const t1 = performance.now();
    findPair(owned, null,
      (a, b) => engine.childrenOf(a, b).some(
        (ch: { species: string }) => ch.species === 'Frostallion') && false);
    const warm = performance.now() - t1;

    // vitest swallows console.log — the measurement goes to a file instead
    // (in tmpdir, so it can never litter the repo or fail in CI)
    writeFileSync(join(tmpdir(), 'genderFix-timing.txt'),
      `cold ${cold.toFixed(1)} ms, warm ${warm.toFixed(1)} ms (131 owned, worst case)\n`);
    expect(r.pair).toBeNull();
    // the UI computes this per hinted species on a box change; a frozen JS
    // thread is the failure this bar exists to catch (method: E108)
    expect(cold, 'cold worst-case scan is slow enough to feel').toBeLessThan(250);
    expect(warm, 'warm scan should be cache-speed').toBeLessThan(60);
  });
});
