/**
 * The fixed boss's own stats on the pal card — the CEO's question
 * (2026-08-17 23:24: "should show alpha version? Does it not have
 * different stats?") answered with the game's own parameter row.
 *
 * Three layers: the LINE never invents a difference (bossLine is pure and
 * imported for real), the DATA stays sane and validated (every species
 * must exist, and one exact row is pinned as a canary against silent
 * re-fetch drift), and the CARD actually renders it (source assertions).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bossLine } from '../../mobile/src/alphaFacts';
import { ALPHA_STATS, type AlphaStat } from '../../mobile/src/data/alphaStats.g';

const BASE = { hp: 130, atk: 120, def: 145, size: 'L' };
const row = (over: Partial<AlphaStat>): AlphaStat => ({
  title: 'T', lv: 60, hp: 130, atk: 120, def: 145, size: 'L',
  hpRate: 1, recvRate: 1, capture: 1, ...over,
});

describe('the boss line prints only measured differences', () => {
  it('a boss that matches its species says so — no invented difference', () => {
    expect(bossLine(row({}), BASE))
      .toBe('fights with the same stats as a normal one');
  });

  it('the Paladius shape: HP up, size up, big fight multipliers', () => {
    expect(bossLine(
      row({ hp: 156, size: 'XL', hpRate: 1.8552631, recvRate: 0.18, capture: 0.7 }),
      BASE,
    )).toBe(
      'Health 156 (normal: 130) · size XL (normal: L) · '
      + 'in the fight: ×1.9 health, takes 18% of your damage · catch chance ×0.7');
  });

  it('a same-HP boss with only fight multipliers keeps the stats out of it', () => {
    expect(bossLine(row({ recvRate: 0.48 }), BASE))
      .toBe('in the fight: takes 48% of your damage');
  });

  it('missing base data never fabricates a comparison', () => {
    expect(bossLine(row({ hp: 156 }), { ...BASE, hp: null }))
      .toBe('fights with the same stats as a normal one');
  });
});

describe('the generated data is real and sane', () => {
  const pals = (JSON.parse(readFileSync(
    join(__dirname, '../public/data/pals_1_0.json'), 'utf8'),
  ) as { pals: Record<string, unknown> }).pals;

  it('covers a real share of the fixed bosses', () => {
    // 207 unique titled bosses exist; paldb pages occasionally lag a patch,
    // so the floor is generous — but an empty or gutted table must fail
    expect(Object.keys(ALPHA_STATS).length).toBeGreaterThan(120);
  });

  it('every species is a real pal and every row is complete', () => {
    for (const [name, rows] of Object.entries(ALPHA_STATS)) {
      expect(pals[name], `${name} is not a species`).toBeTruthy();
      for (const r of rows) {
        expect(r.title.length, `${name} row without a title`).toBeGreaterThan(0);
        expect(r.hp, `${name} row without HP`).toBeGreaterThan(0);
        if (r.lv != null) expect(r.lv).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('the canary row: boss Paladius reads exactly as fetched 2026-08-18', () => {
    const p = ALPHA_STATS['Paladius']?.[0];
    expect(p, 'Paladius lost its boss row').toBeTruthy();
    expect(p).toMatchObject({
      hp: 156, atk: 120, def: 145, size: 'XL',
      hpRate: 1.8552631, recvRate: 0.18, capture: 0.7,
    });
  });
});

describe('the card renders it', () => {
  const detail = readFileSync(
    join(__dirname, '../../mobile/src/ui/PalDetail.tsx'), 'utf8')
    .replace(/\{\s*\/\*(?:(?!\*\/)[\s\S])*\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('the stats card carries the boss block, through the tested line builder', () => {
    expect(detail).toContain('ALPHA_STATS[name]');
    expect(detail).toContain('bossLine(a2, { hp: p.hp, atk: p.atk, def: p.def, size: p.size })');
    expect(detail).toContain('As the fixed boss');
  });
});
