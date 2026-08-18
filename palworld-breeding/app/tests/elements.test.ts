/**
 * The element chart is the Bosses fane's ground truth, and it is
 * wiki-measured — so every cell is pinned HERE against what the two
 * agreeing sources said on 2026-08-18 (wiki.gg revid 30073 / fandom revid
 * 29952). A re-fetch that changes any cell fails this suite and has to be
 * argued through, not slipped in. The three copies (canonical JSON + the
 * two generated .g.ts) must agree, because silent copy divergence already
 * bit the pals data once (E139).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ELEMENT_CHART, ELEMENT_CHART_SOURCE } from '../src/data/elementChart.g';
import { attackMultiplier, bestOffense, incomingFire, weaknessLabel } from '../src/logic/counters';

/** the chart exactly as both sources stated it, cell for cell */
const PINNED: Record<string, { strong: string[]; weak: string[] }> = {
  Dark: { strong: ['Neutral'], weak: ['Dragon'] },
  Dragon: { strong: ['Dark'], weak: ['Ice'] },
  Electric: { strong: ['Water'], weak: ['Ground'] },
  Fire: { strong: ['Grass', 'Ice'], weak: ['Water'] },
  Grass: { strong: ['Ground'], weak: ['Fire'] },
  Ground: { strong: ['Electric'], weak: ['Grass'] },
  Ice: { strong: ['Dragon'], weak: ['Fire'] },
  Neutral: { strong: [], weak: ['Dark'] },
  Water: { strong: ['Fire'], weak: ['Electric'] },
};

describe('the chart is exactly what the two sources agreed on', () => {
  it('has the nine elements and no others', () => {
    expect(Object.keys(ELEMENT_CHART).sort()).toEqual(Object.keys(PINNED).sort());
  });

  it.each(Object.keys(PINNED))('%s matchups are pinned', (el) => {
    expect(ELEMENT_CHART[el]).toEqual(PINNED[el]);
  });

  it('is perfectly antisymmetric — every strong edge mirrors a weak edge', () => {
    for (const [el, row] of Object.entries(ELEMENT_CHART)) {
      for (const t of row.strong) {
        expect(ELEMENT_CHART[t].weak, `${el}→${t}`).toContain(el);
      }
      for (const t of row.weak) {
        expect(ELEMENT_CHART[t].strong, `${el}→${t}`).toContain(el);
      }
    }
  });

  it('names its sources and its label in the shipped provenance', () => {
    expect(ELEMENT_CHART_SOURCE).toContain('30073');
    expect(ELEMENT_CHART_SOURCE).toContain('29952');
    expect(ELEMENT_CHART_SOURCE).toContain('Wiki-measured');
  });

  it('matches the canonical JSON and the mobile copy byte-for-byte', () => {
    const canonical = JSON.parse(readFileSync(
      join(__dirname, '../../data/elements_1_0.json'), 'utf8'));
    expect(canonical.elements).toEqual(ELEMENT_CHART);
    const app = readFileSync(join(__dirname, '../src/data/elementChart.g.ts'));
    const mobile = readFileSync(
      join(__dirname, '../../mobile/src/data/elementChart.g.ts'));
    expect(app.equals(mobile)).toBe(true);
  });

  it('covers the exact element vocabulary of the shipped pals data', () => {
    const pals = JSON.parse(readFileSync(
      join(__dirname, '../public/data/pals_1_0.json'), 'utf8')).pals;
    const used = new Set<string>();
    for (const p of Object.values(pals) as { elements?: string[] }[]) {
      for (const el of p.elements ?? []) used.add(el);
    }
    expect([...used].sort()).toEqual(Object.keys(PINNED).sort());
  });
});

describe('the multiplier rules both sources state', () => {
  it('strong is double, weak is half, neutral is even', () => {
    expect(attackMultiplier('Fire', ['Grass'])).toBe(2);
    expect(attackMultiplier('Fire', ['Water'])).toBe(0.5);
    expect(attackMultiplier('Fire', ['Dark'])).toBe(1);
  });

  it('a skill matching the defender’s own element is even, not boosted', () => {
    expect(attackMultiplier('Fire', ['Fire'])).toBe(1);
  });

  it('dual-element multipliers multiply: strong+weak cancels to even', () => {
    // the sources’ own example: Grass into Reptyro (Fire/Ground)
    expect(attackMultiplier('Grass', ['Fire', 'Ground'])).toBe(1);
  });

  it('an element-less defender takes even damage from everything', () => {
    for (const el of Object.keys(PINNED)) {
      expect(attackMultiplier(el, [])).toBe(1);
    }
  });

  it('no shipped pal can take quadruple or quarter damage — counted, not assumed', () => {
    const pals = JSON.parse(readFileSync(
      join(__dirname, '../public/data/pals_1_0.json'), 'utf8')).pals;
    for (const [name, p] of Object.entries(pals) as [string, { elements?: string[] }][]) {
      for (const attack of Object.keys(PINNED)) {
        const m = attackMultiplier(attack, p.elements ?? []);
        expect(m === 4 || m === 0.25, `${attack} vs ${name} = ${m}`).toBe(false);
      }
    }
  });
});

describe('derived helpers stay honest at the edges', () => {
  it('bestOffense finds the edge and names the element that has it', () => {
    expect(bestOffense(['Ground', 'Dark'], ['Electric']))
      .toEqual({ mult: 2, via: 'Ground' });
    expect(bestOffense(['Neutral'], ['Electric']))
      .toEqual({ mult: 1, via: null });
  });

  it('incomingFire reports even-and-zero when the kit is unknown', () => {
    expect(incomingFire([], ['Fire'])).toEqual({ worst: 1, resisted: 0, moves: 0 });
  });

  it('weaknessLabel says what to bring, or that nothing works', () => {
    expect(weaknessLabel(['Electric'])).toBe('Weak to Ground attacks.');
    expect(weaknessLabel([])).toBe('No element — nothing hits it for extra damage.');
    // Dragon/Water (Shaolong): Ice doubles the Dragon half and Water does
    // not resist Ice in THIS game's chart, so Ice stays a real counter
    // alongside Electric — the guides say the same about Shaolong
    expect(weaknessLabel(['Dragon', 'Water'])).toBe('Weak to Electric and Ice attacks.');
    // and a pairing where the double IS cancelled: Fire doubles Grass but
    // Ground resists nothing of Fire… use Grass/Fire: Fire doubles Grass,
    // Fire×Fire is even → 2×1=2 still counts; the true cancel is
    // Fire into Grass/Water (2 × 0.5 = 1) — no counter through Fire
    expect(weaknessLabel(['Grass', 'Water'])).not.toContain('Fire');
  });
});
