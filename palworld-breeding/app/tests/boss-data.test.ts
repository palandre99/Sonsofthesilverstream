/**
 * The tower/raid encounter tables the Bosses fane renders. These pins
 * hold what the fetch VALIDATED (tools/fetch_tower_raid_stats.py: section
 * Code == list id, elements agreeing between two renderings, skills
 * mapped into our nine) so a bad re-fetch or hand edit fails here before
 * it reaches a screen. Copies must be byte-identical across trees.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ELEMENT_CHART } from '../src/data/elementChart.g';
import {
  RAID_BOSSES, TOWER_BOSSES, TOWER_RAID_SOURCE,
} from '../src/data/towerRaid.g';

const ALL = [...TOWER_BOSSES, ...RAID_BOSSES];
const NINE = new Set(Object.keys(ELEMENT_CHART));

describe('the encounter tables are what the fetch validated', () => {
  it('22 tower rows and 11 raid rows — read from the runner, not memory', () => {
    expect(TOWER_BOSSES.length).toBe(22);
    expect(RAID_BOSSES.length).toBe(11);
  });

  it('difficulty split: 13 Normal + 9 Hard towers; 6 Normal + 4 Ultra + 1 Master raids', () => {
    const count = (rows: typeof ALL, mode: string) =>
      rows.filter((r) => r.mode === mode).length;
    expect(count(TOWER_BOSSES, 'Normal')).toBe(13);
    expect(count(TOWER_BOSSES, 'Hard')).toBe(9);
    expect(count(RAID_BOSSES, 'Normal')).toBe(6);
    expect(count(RAID_BOSSES, 'Ultra')).toBe(4);
    expect(count(RAID_BOSSES, 'Master')).toBe(1);
  });

  it('every row has a level and a real fight HP bar', () => {
    for (const r of ALL) {
      expect(r.lv, r.title).toBeGreaterThan(0);
      expect(r.fightHp, r.title).toBeGreaterThan(0);
    }
  });

  it('the second difficulty is always the bigger fight', () => {
    for (const r of ALL.filter((x) => x.mode !== 'Normal')) {
      const normal = ALL.find(
        (x) => x.bp + '_2' === r.bp && x.mode === 'Normal');
      expect(normal, r.title).toBeTruthy();
      expect(r.fightHp, r.title).toBeGreaterThan(normal!.fightHp);
      expect(r.lv, r.title).toBeGreaterThanOrEqual(normal!.lv);
    }
  });

  it('every element on every row and every move is one of the nine', () => {
    for (const r of ALL) {
      for (const el of r.elements) expect(NINE.has(el), `${r.title}: ${el}`).toBe(true);
      for (const m of r.moves) expect(NINE.has(m.element), `${r.title}: ${m.name}`).toBe(true);
    }
  });

  it('exactly three rows are element-less, and they are the known three', () => {
    const typeless = ALL.filter((r) => r.elements.length === 0).map((r) => r.title).sort();
    // .sort() is code-unit order, so '[Master]' lands after the letters
    expect(typeless).toEqual([
      'Blightstar Calamity Zenara & Astralym',
      'Moon Lord',
      'Nullstar Calamity Zenara & Astralym',
      '[Master] Moon Lord',
    ]);
  });

  it('every named species exists in the shipped pals data', () => {
    const pals = JSON.parse(readFileSync(
      join(__dirname, '../public/data/pals_1_0.json'), 'utf8')).pals;
    for (const r of ALL) {
      if (r.species != null) expect(pals[r.species], `${r.title} → ${r.species}`).toBeTruthy();
    }
    // the only rows without a species are the crossover Moon Lord pair
    const nameless = ALL.filter((r) => r.species == null).map((r) => r.title).sort();
    expect(nameless).toEqual(['Moon Lord', '[Master] Moon Lord']);
  });

  it('the canary: Zoe & Grizzbolt Normal is Lv 10, HP 12,900, ×12 health — the row the spot-proof checked', () => {
    const zoe = TOWER_BOSSES.find(
      (r) => r.bp === 'GYM_ElecPanda' && r.mode === 'Normal')!;
    expect(zoe.lv).toBe(10);
    expect(zoe.fightHp).toBe(12900);
    expect(zoe.hpRate).toBe(12);
    expect(zoe.species).toBe('Grizzbolt');
    expect(zoe.elements).toEqual(['Electric']);
    expect(zoe.moves.length).toBe(5);
  });

  it('Hard kits really differ: Zoe & Grizzbolt Hard carries 9 moves to Normal’s 5', () => {
    const hard = TOWER_BOSSES.find(
      (r) => r.bp === 'GYM_ElecPanda_2' && r.mode === 'Hard')!;
    expect(hard.lv).toBe(72);
    expect(hard.moves.length).toBe(9);
  });

  it('Panthalus is a Lv-70 tower-list fight — the fact that settled the old “raid-only” ledger note', () => {
    const p = TOWER_BOSSES.find((r) => r.species === 'Panthalus')!;
    expect(p.mode).toBe('Normal');
    expect(p.lv).toBe(70);
    expect(p.towerFlag).toBe(true);
  });

  it('the two Root story fights are the only tower rows without the tower flag', () => {
    const story = TOWER_BOSSES.filter((r) => !r.towerFlag).map((r) => r.title).sort();
    expect(story).toEqual(['Bewitching Lurker Dandilord', 'Immortal Shade Silvance']);
  });

  it('every raid row carries its summoning slab code, unique per row', () => {
    const slabs = RAID_BOSSES.map((r) => r.slab);
    expect(slabs.every((s) => s && s.startsWith('PalSummon_'))).toBe(true);
    expect(new Set(slabs).size).toBe(RAID_BOSSES.length);
  });

  it('raid rows publish their reduction and attack scaling; tower rows honestly do not', () => {
    for (const r of RAID_BOSSES) {
      expect(r.damageCutPct, r.title).not.toBeNull();
      expect(r.attackPct, r.title).not.toBeNull();
    }
    for (const r of TOWER_BOSSES) {
      expect(r.damageCutPct, r.title).toBeNull();
      expect(r.attackPct, r.title).toBeNull();
    }
  });

  it('the raid percentages are pure derivations of the raw rates — the card may print only one of each pair', () => {
    for (const r of RAID_BOSSES) {
      expect(Math.round((1 - r.recvRate!) * 1000) / 10, r.title)
        .toBeCloseTo(r.damageCutPct!, 1);
      expect(Math.round(r.dealRate! * 100), r.title).toBe(r.attackPct!);
    }
  });

  it('names its source and matches the canonical JSON counts', () => {
    expect(TOWER_RAID_SOURCE).toContain('paldb.cc');
    const canonical = JSON.parse(readFileSync(
      join(__dirname, '../../data/tower_raid_1_0.json'), 'utf8'));
    expect(canonical.counts).toEqual({ towers: 22, raids: 11 });
    expect(canonical.refusals).toEqual([]);
  });

  it('the app and mobile copies are byte-identical', () => {
    const app = readFileSync(join(__dirname, '../src/data/towerRaid.g.ts'));
    const mobile = readFileSync(
      join(__dirname, '../../mobile/src/data/towerRaid.g.ts'));
    expect(app.equals(mobile)).toBe(true);
  });
});
