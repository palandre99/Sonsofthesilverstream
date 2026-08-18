/**
 * The Items index — the fane's first visible surface. The data module is
 * imported FOR REAL (plain .ts); the screen's copy is pinned by source.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  familyOf, idsInGroup, ITEM_GROUPS, ITEM_STATS, ITEMS,
  searchItems, sortItems, tierWord,
} from '../../mobile/src/itemsData';

describe('the groups cover the catalogue exactly once', () => {
  it('every item is in exactly one group', () => {
    const seen = new Map<string, string>();
    for (const g of ITEM_GROUPS) {
      for (const id of idsInGroup(g.id)) {
        expect(seen.has(id), `${id} is in ${seen.get(id)} AND ${g.id}`).toBe(false);
        seen.set(id, g.id);
      }
    }
    expect(seen.size).toBe(Object.keys(ITEMS).length);
  });

  it('the group counts match the shipped categories', () => {
    expect(idsInGroup('weapons').length).toBe(320);  // Weapon 310 + Special 10
    expect(idsInGroup('armor').length).toBe(264);
    expect(idsInGroup('schematics').length).toBe(490);
  });
});

describe('tier words are the game\'s own naming', () => {
  it('matches every shipped stat card, zero exceptions', () => {
    for (const [id, st] of Object.entries(ITEM_STATS)) {
      if (st.tier && ITEMS[id]?.rarity != null) {
        expect(tierWord(ITEMS[id].rarity), id).toBe(st.tier);
      }
    }
  });
});

describe('sorting and search behave like a player expects', () => {
  it('strongest-first puts the biggest attack on top of the weapons', () => {
    const ids = sortItems(idsInGroup('weapons'), 'power');
    const top = ITEM_STATS[ids[0]];
    expect(top?.atk).toBeDefined();
    for (const id of ids.slice(1, 20)) {
      const st = ITEM_STATS[id];
      if (st?.atk != null) expect(st.atk).toBeLessThanOrEqual(top!.atk!);
    }
  });

  it('search spans the whole catalogue, case-insensitive', () => {
    const hits = searchItems('assault rifle');
    expect(hits.length).toBeGreaterThanOrEqual(10);  // families + ammo
    expect(searchItems('zzz-no-such-item')).toEqual([]);
  });

  it('a family lists every tier weakest-first', () => {
    const fam = familyOf('AssaultRifle_Default3');
    expect(fam[0]).toBe('AssaultRifle_Default1');
    expect(fam.length).toBe(5);
    const rarities = fam.map((i) => ITEMS[i].rarity);
    expect(rarities).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('the screen speaks plainly and cites its sources', () => {
  const code = readFileSync(
    join(__dirname, '../../mobile/src/screens/ItemsScreen.tsx'), 'utf8')
    .replace(/\{\s*\/\*(?:(?!\*\/)[\s\S])*\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('leads with the honest promise and the provenance footer', () => {
    expect(code).toContain('Every item in the game with its real numbers — nothing estimated.');
    expect(code).toContain('accepted only');
    expect(code).toContain('internal id matches it exactly');
  });

  it('counted labels never say "1 items"', () => {
    expect(code).toContain("'1 item found — across everything'");
  });

  it('an empty search result names the query, not a shrug', () => {
    expect(code).toContain('No item matches');
  });

  it('a missing description says the truth instead of hiding the card', () => {
    expect(code).toContain('The game files carry no description for this item.');
  });

  it('the weapons tab is registered live', () => {
    const app = readFileSync(
      join(__dirname, '../../mobile/src/App.tsx'), 'utf8');
    expect(app).toContain('weapons: WeaponsTab');
    const domains = readFileSync(
      join(__dirname, '../../mobile/src/nav/domains.ts'), 'utf8');
    expect(domains, 'the weapons tab is marked coming-soon again')
      .toContain("{ id: 'weapons', label: 'Weapons', icon: 'bow-arrow' }");
  });
});
