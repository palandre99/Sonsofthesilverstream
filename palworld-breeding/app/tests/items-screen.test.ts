/**
 * The Items index — the fane's first visible surface. The data module is
 * imported FOR REAL (plain .ts); the screen's copy is pinned by source.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  familyOf, idsInGroup, ITEM_GROUPS, ITEM_STATS, ITEMS, itemIdByName,
  KIND_WORDS, kindsInGroup, kindWord, palsDropping, schematicsFor,
  searchItems, sortItems, statRank, teachesOf, tierWord,
} from '../../mobile/src/itemsData';
import palsJson from '../../mobile/src/data/pals_1_0.json';
import { shareTextForItem } from '../../mobile/src/itemShare';

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
    // capture balls live under Spheres now, not Weapons (tab rework
    // 2026-08-18, CEO's layout freedom)
    expect(idsInGroup('weapons').length).toBe(310);
    expect(idsInGroup('spheres').length).toBe(16);   // 10 balls + 6 modules
    expect(idsInGroup('armor').length).toBe(264);
    expect(idsInGroup('schematics').length).toBe(490);
    expect(idsInGroup('fruits').length).toBe(93);    // ConsumeWazaMachine
    expect(idsInGroup('gear').length).toBe(138);     // Essential_PalGear
    expect(idsInGroup('eggs').length).toBe(53);      // MaterialPalEgg
    expect(idsInGroup('meds').length).toBe(14);      // Drug+Medicine+Revive
  });

  it("'all' is the whole catalogue in one list", () => {
    expect(idsInGroup('all').length).toBe(Object.keys(ITEMS).length);
  });
});

describe("groups expose their depth — the CEO's 'many sub ones'", () => {
  it('every group’s kind counts sum to the group exactly', () => {
    for (const g of ITEM_GROUPS) {
      const kinds = kindsInGroup(g.id);
      const sum = kinds.reduce((a, k) => a + k.count, 0);
      expect(sum, g.id).toBe(idsInGroup(g.id).length);
    }
  });

  it('the grab-bag groups really are subdivided', () => {
    const kindNames = (g: string) => kindsInGroup(g).map((k) => k.kind);
    expect(kindsInGroup('consumables').length).toBeGreaterThanOrEqual(10);
    expect(kindNames('consumables')).toContain('Treasure map');
    expect(kindNames('consumables')).toContain('Pal awakening item');
    expect(kindsInGroup('weapons').length).toBeGreaterThanOrEqual(10);
    expect(kindNames('weapons')).toContain('Assault rifle');
    expect(kindNames('materials')).toContain('Ingot');
    expect(kindNames('food')).toContain('Cooked meat dish');
    expect(kindNames('key')).toContain('Boss trophy');
  });

  it('single-kind groups get no redundant sub-row', () => {
    expect(kindsInGroup('fruits').length).toBe(1);
    expect(kindsInGroup('eggs').length).toBe(1);
    expect(kindsInGroup('gear').length).toBe(1);
  });
});

describe('schematics join their items by the game’s own naming', () => {
  it('463 blueprints teach a real item family', () => {
    const bps = Object.keys(ITEMS).filter((i) => ITEMS[i].category === 'Blueprint');
    const joined = bps.filter((i) => teachesOf(i) != null);
    expect(bps.length).toBe(490);
    expect(joined.length).toBe(463);
  });

  it('the Assault Rifle joins both ways', () => {
    const schems = schematicsFor('AssaultRifle_Default1');
    expect(schems.length).toBeGreaterThanOrEqual(4);
    expect(schems[0].tier).toBeLessThan(schems[schems.length - 1].tier);
    const t = teachesOf(schems[0].id);
    expect(t?.id).toBe('AssaultRifle_Default1');
  });

  it('raid slabs and furniture stay honestly unjoined', () => {
    const slab = Object.keys(ITEMS).find(
      (i) => ITEMS[i].name === "Bellanoir's Slab Fragment");
    expect(slab).toBeDefined();
    expect(teachesOf(slab!)).toBeNull();
  });
});

describe('pal drops and items join both ways (game-file data)', () => {
  it('every pal drop string resolves to an item', () => {
    const pals = (palsJson as { pals: Record<string, { drops?: string[] }> }).pals;
    const all = new Set<string>();
    for (const p of Object.values(pals)) {
      for (const d of p.drops ?? []) all.add(d);
    }
    expect(all.size).toBeGreaterThanOrEqual(100);
    for (const d of all) {
      expect(itemIdByName(d), `pal drop "${d}" resolves to no item`).not.toBeNull();
    }
  });

  it('the joins go both directions', () => {
    expect(palsDropping(itemIdByName('Wool')!)).toContain('Lamball');
    expect(palsDropping('Cake')).toContain('Lovander');
  });

  it('the screens carry the tappable links', () => {
    const items = readFileSync(
      join(__dirname, '../../mobile/src/screens/ItemsScreen.tsx'), 'utf8');
    expect(items).toContain("takeIntentPayload('allitems')");
    expect(items).toContain('palsDropping(id)');
    const pal = readFileSync(
      join(__dirname, '../../mobile/src/ui/PalDetail.tsx'), 'utf8');
    expect(pal).toContain("domain: 'items', tab: 'allitems'");
    expect(pal).toContain('Open its item card');
  });
});

describe('the item share sheet says what the screen says', () => {
  it('a weapon shares its rank, tech cost, craft and provenance', () => {
    const txt = shareTextForItem('AssaultRifle_Default1', '1.0');
    expect(txt).toContain('Assault Rifle — Common assault rifle');
    expect(txt).toMatch(/Attack 320 \(#\d+ of \d+\)/);
    expect(txt).toContain('technology point');
    expect(txt).toContain('Craft: 40× Refined Ingot');
    expect(txt).toContain('Palworld 1.0 · read from the game files · Paldexia');
  });

  it('food shares what it does and who drops it', () => {
    const txt = shareTextForItem('Cake', '1.0');
    expect(txt).toContain('Nutrition 656');
    expect(txt).toContain('Craft: 5× Flour');
    expect(txt).toContain('drops from Lovander');
  });

  it('never leaks an internal token', () => {
    for (const id of ['Cake', 'PalSphere', 'AssaultRifle_Default1', 'Pan',
      'AncientArmor']) {
      expect(shareTextForItem(id, '1.0'))
        .not.toMatch(/[a-z][A-Z]\w*_|_\d|<[a-zA-Z]+ id=/);
    }
  });

  it('armor shares its passives by their game names', () => {
    const txt = shareTextForItem('AncientArmor', '1.0');
    expect(txt).toContain('Cold Resistance Lv. 2');
    expect(txt).not.toContain('TemperatureResist');
  });

  it('the screen sends exactly this composer through the native sheet', () => {
    const code = readFileSync(
      join(__dirname, '../../mobile/src/screens/ItemsScreen.tsx'), 'utf8');
    expect(code).toContain('shareTextForItem(id, breeding.game_version)');
  });
});

describe('internal names never reach the screen', () => {
  it('every shipped category/subcategory pair has a player word', () => {
    const pairs = new Set(Object.values(ITEMS)
      .map((it) => `${it.category ?? ''}/${it.subcategory ?? ''}`));
    for (const pair of pairs) {
      expect(KIND_WORDS[pair], `no player word for ${pair}`).toBeDefined();
    }
  });

  it('kind words are plain language, not identifiers', () => {
    for (const id of Object.keys(ITEMS)) {
      const w = kindWord(id);
      expect(w, `${id} leaks jargon: ${w}`)
        .not.toMatch(/[a-z][A-Z]|_|^SP/);
    }
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

  it('search understands kinds, not just name substrings', () => {
    // "cooked fish" matches the kind word, not any item name
    expect(searchItems('cooked fish').length).toBe(11);
    expect(searchItems('skill fruit').length).toBeGreaterThanOrEqual(93);
    // word order does not matter
    expect(searchItems('rifle assault').length)
      .toBe(searchItems('assault rifle').length);
  });

  it('stats carry rank context, ties sharing a rank', () => {
    const top = sortItems(idsInGroup('weapons'), 'power')[0];
    expect(statRank(top, 'atk')?.rank).toBe(1);
    const r = statRank('AssaultRifle_Default1', 'atk');
    expect(r).not.toBeNull();
    expect(r!.rank).toBeGreaterThan(1);
    expect(r!.of).toBeGreaterThan(100);
    expect(statRank('Cake', 'atk')).toBeNull();
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
    expect(code).toContain('accepted only at exact internal-id identity');
    // drop rates come from the community database's loot-table readings —
    // the footer says so instead of implying they were datamined here
    expect(code).toContain("community database's");
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

  it('all five Items tabs are registered live (CEO layout 2026-08-18)', () => {
    const app = readFileSync(
      join(__dirname, '../../mobile/src/App.tsx'), 'utf8');
    for (const key of ['weapons: WeaponsTab', 'armor: ArmorTab',
      'allitems: AllItemsTab', 'food: FoodTab', 'spheres: SpheresTab']) {
      expect(app).toContain(key);
    }
    const domains = readFileSync(
      join(__dirname, '../../mobile/src/nav/domains.ts'), 'utf8');
    expect(domains, 'a tab went coming-soon again')
      .not.toMatch(/id: 'items'[\s\S]{0,900}soon: true/);
    expect(domains, 'the item index must anchor the center slot')
      .toContain("{ id: 'allitems', label: 'Items', icon: 'view-grid-outline' }");
  });
});
