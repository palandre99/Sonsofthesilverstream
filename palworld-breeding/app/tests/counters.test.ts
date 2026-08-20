/**
 * The ranking that answers "which of MY pals do I bring to this fight" —
 * deliberately lexicographic (element edge, then survivability against
 * the boss's actual kit, then base attack) so every rank is explainable
 * in one sentence. These are literal example fights in the kindling-test
 * tradition: each pin is a sentence the UI could print.
 */
import { describe, expect, it } from 'vitest';
import {
  compareCounters, counterRow, matchupLabel, rankCounters,
} from '../src/logic/counters';

/** Zoe & Grizzbolt Normal: Electric boss, five Electric attacks */
const GRIZZBOLT = { elements: ['Electric'], moves: ['Electric', 'Electric', 'Electric', 'Electric', 'Electric'] };

describe('vs the first tower (Electric, all-Electric kit)', () => {
  it('a Ground pal with modest attack outranks a strong Neutral pal — the element edge dominates stats', () => {
    const rows = rankCounters([
      { name: 'Strong Neutral', elements: ['Neutral'], atk: 140 },
      { name: 'Modest Ground', elements: ['Ground'], atk: 80 },
    ], GRIZZBOLT.elements, GRIZZBOLT.moves);
    expect(rows.map((r) => r.name)).toEqual(['Modest Ground', 'Strong Neutral']);
    expect(rows[0].offense).toBe(2);
    expect(rows[0].offenseVia).toBe('Ground');
  });

  it('among equal element edges, the one the boss’s kit hurts least wins', () => {
    // both hit Electric for double via Ground; the Ground/Water one takes
    // even from Electric×Ground = 2×0.5, the pure Water one takes double
    const rows = rankCounters([
      { name: 'Wet Ground', elements: ['Ground', 'Water'], atk: 90 },
      { name: 'Pure Ground', elements: ['Ground'], atk: 90 },
    ], GRIZZBOLT.elements, GRIZZBOLT.moves);
    expect(rows.map((r) => r.name)).toEqual(['Pure Ground', 'Wet Ground']);
    expect(rows[0].incomingWorst).toBe(0.5);
    expect(rows[1].incomingWorst).toBe(1);
  });

  it('ties on every element key fall to base attack, then name', () => {
    const rows = rankCounters([
      { name: 'B', elements: ['Ground'], atk: 100 },
      { name: 'A', elements: ['Ground'], atk: 100 },
      { name: 'Stronger', elements: ['Ground'], atk: 120 },
    ], GRIZZBOLT.elements, GRIZZBOLT.moves);
    expect(rows.map((r) => r.name)).toEqual(['Stronger', 'A', 'B']);
  });

  it('a Water pal is flagged as a poor pick — its own attacks are resisted', () => {
    const row = counterRow(
      { name: 'Poor Water', elements: ['Water'], atk: 130 },
      GRIZZBOLT.elements, GRIZZBOLT.moves);
    expect(row.offense).toBe(0.5);
    expect(matchupLabel(row, 'Grizzbolt')).toContain('poor pick');
  });
});

describe('vs an element-less boss (Zenara & Astralym, Moon Lord)', () => {
  it('nobody gets an element edge; survivability and stats decide', () => {
    const rows = rankCounters([
      { name: 'Any Fire', elements: ['Fire'], atk: 100 },
      { name: 'Any Ice', elements: ['Ice'], atk: 110 },
    ], [], []);
    expect(rows.every((r) => r.offense === 1)).toBe(true);
    expect(rows[0].name).toBe('Any Ice'); // attack breaks the tie
  });
});

describe('vs a mixed kit (Saya & Selyne: Dark/Neutral boss, Dark+Neutral moves)', () => {
  const BOSS = { elements: ['Dark', 'Neutral'], moves: ['Dark', 'Dark', 'Neutral'] };

  it('a Dragon pal doubles into Dark AND resists the Dark hits', () => {
    const row = counterRow(
      { name: 'Dragon Pick', elements: ['Dragon'], atk: 100 },
      BOSS.elements, BOSS.moves);
    // offense: Dragon→Dark 2 × Dragon→Neutral 1 = 2
    expect(row.offense).toBe(2);
    // incoming: Dark→Dragon 0.5 (twice), Neutral→Dragon 1 → worst 1, resisted 2
    expect(row.incomingWorst).toBe(1);
    expect(row.resisted).toBe(2);
    expect(matchupLabel(row, 'Selyne'))
      .toBe('Dragon attacks hit it for double damage, and resists 2 of its 3 attacks.');
  });
});

describe('the comparator is a total order the UI can trust', () => {
  it('is antisymmetric and never equates different names', () => {
    const a = counterRow({ name: 'A', elements: ['Ground'], atk: 100 }, ['Electric'], []);
    const b = counterRow({ name: 'B', elements: ['Ground'], atk: 100 }, ['Electric'], []);
    expect(compareCounters(a, b)).toBeLessThan(0);
    expect(compareCounters(b, a)).toBeGreaterThan(0);
    expect(compareCounters(a, a)).toBe(0);
  });

  it('an unknown kit ranks nobody up or down — moves 0 keeps incoming even', () => {
    const row = counterRow({ name: 'X', elements: ['Fire'], atk: 90 }, ['Grass'], []);
    expect(row.incomingWorst).toBe(1);
    expect(row.bossMoves).toBe(0);
    // and the label doesn't claim survivability facts it doesn't have
    expect(matchupLabel(row, 'Boss')).toBe('Fire attacks hit it for double damage.');
  });
});
