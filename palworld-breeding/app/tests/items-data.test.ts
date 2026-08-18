/**
 * The Items fane's backbone: 1,892 items from the build-pinned atlas index
 * (fetched 2026-08-18, tools/fetch_items_index.py). These guards pin what
 * the fetch VALIDATED, so a bad re-fetch or a hand edit fails here before
 * it reaches a screen — and the three data copies must be byte-identical,
 * because silent copy divergence already bit the pals data once (E139).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface Item {
  name: string; description: string; category: string | null;
  subcategory: string | null; rarity: number | null; rank: number | null;
  maxStack: number | null; weight: number | null; price: number | null;
  icon: string | null;
}
const payload = JSON.parse(readFileSync(
  join(__dirname, '../public/data/items_1_0.json'), 'utf8'),
) as { source: string; build: string; count: number; items: Record<string, Item> };

const items = Object.entries(payload.items);

describe('the backbone is what the fetch validated', () => {
  it('carries its provenance and the build pin', () => {
    expect(payload.build).toBe('24575149');
    expect(payload.source).toContain('palworld-atlas-data');
    expect(payload.count).toBe(items.length);
  });

  it('every item in the game, none invented: 1,892', () => {
    expect(items.length).toBe(1892);
  });

  it('every item has a name; ids are the keys so they are unique by shape', () => {
    for (const [id, it_] of items) {
      expect(it_.name, `${id} has no name`).toBeTruthy();
    }
  });

  it('the categories are exactly the twelve the game ships', () => {
    const cats = [...new Set(items.map(([, it_]) => it_.category))].sort();
    expect(cats).toEqual([
      'Accessory', 'Ammo', 'Armor', 'Blueprint', 'CaptureItemModifier',
      'Consume', 'Essential', 'Food', 'Glider', 'Material',
      'SpecialWeapon', 'Weapon',
    ]);
  });

  it('weights and prices are never negative', () => {
    for (const [id, it_] of items) {
      if (it_.weight != null) expect(it_.weight, id).toBeGreaterThanOrEqual(0);
      if (it_.price != null) expect(it_.price, id).toBeGreaterThanOrEqual(0);
    }
  });

  it('descriptions cover most of the catalogue, verbatim game text', () => {
    const described = items.filter(([, it_]) => it_.description.length > 0);
    // 1,924 description rows over 2,466 raw rows upstream — the shipped
    // 1,892 keep the overwhelming share. Pin a floor, not the exact figure.
    expect(described.length).toBeGreaterThan(1500);
    for (const [id, it_] of items) {
      expect(it_.description, `${id} kept a raw \\r`).not.toContain('\r');
    }
  });
});

describe('names are player-facing, never upstream artifacts', () => {
  it('no "en Text" parse artifact anywhere', () => {
    const bad = items.filter(([, it_]) => it_.name === 'en Text').map(([id]) => id);
    expect(bad, 'the upstream name-table artifact reached the data').toEqual([]);
  });

  it('no unlocalized "{BaseId} N" names', () => {
    const bad = items.filter(([id, it_]) =>
      /^[A-Za-z0-9]+ \d$/.test(it_.name) && it_.name.split(' ')[0] !== ''
      && id.includes(it_.name.split(' ')[0])).map(([id]) => id);
    expect(bad, 'unlocalized rarity-variant names reached the data').toEqual([]);
  });

  it('the derived variants say so, and inherited exactly their family name', () => {
    const derived = items.filter(([, it_]) =>
      (it_ as unknown as { nameFromBase?: boolean }).nameFromBase);
    expect(derived.length).toBe(354);
    // canary: the Uncommon Assault Rifle wears the family name
    const ar2 = payload.items['AssaultRifle_Default2'] as unknown as
      { name: string; nameFromBase?: boolean };
    expect(ar2.name).toBe('Assault Rifle');
    expect(ar2.nameFromBase).toBe(true);
  });
});

describe('the stats layer is exact-identity, validated', () => {
  const statsPayload = JSON.parse(readFileSync(
    join(__dirname, '../public/data/item_stats_1_0.json'), 'utf8'),
  ) as {
    count: number; refused: string[]; stillMissing: string[];
    stats: Record<string, Record<string, number | string[]>>;
  };

  it('every stat row belongs to a real item, and nothing was refused', () => {
    for (const id of Object.keys(statsPayload.stats)) {
      expect(payload.items[id], `${id} has stats but no backbone row`).toBeTruthy();
    }
    expect(statsPayload.refused).toEqual([]);
    // the six upstream-absent pages are known and named, not silent
    expect(statsPayload.stillMissing.length).toBe(6);
  });

  it('coverage floors hold per category', () => {
    const cat = (id: string) => payload.items[id].category;
    const ids = Object.keys(statsPayload.stats);
    expect(ids.filter((i) => cat(i) === 'Weapon').length).toBeGreaterThan(280);
    expect(ids.filter((i) => cat(i) === 'Armor').length).toBeGreaterThan(250);
  });

  it('the canary row: Assault Rifle reads exactly as fetched 2026-08-18', () => {
    expect(statsPayload.stats['AssaultRifle_Default1']).toMatchObject({
      atk: 320, durability: 3000, magazine: 20,
    });
  });

  it('every numeric stat is positive', () => {
    for (const [id, row] of Object.entries(statsPayload.stats)) {
      for (const [k, v] of Object.entries(row)) {
        if (typeof v === 'number') expect(v, `${id}.${k}`).toBeGreaterThan(0);
      }
    }
  });

  it('the stats copies move together too', () => {
    const canonical = readFileSync(
      join(__dirname, '../../data/item_stats_1_0.json'), 'utf8');
    const mobile = readFileSync(
      join(__dirname, '../../mobile/src/data/item_stats_1_0.json'), 'utf8');
    const app = readFileSync(
      join(__dirname, '../public/data/item_stats_1_0.json'), 'utf8');
    expect(mobile === canonical, 'mobile stats copy diverged').toBe(true);
    expect(app === canonical, 'app stats copy diverged').toBe(true);
  });
});

describe('the three copies move together', () => {
  it('canonical, mobile and app copies are byte-identical', () => {
    const canonical = readFileSync(
      join(__dirname, '../../data/items_1_0.json'), 'utf8');
    const mobile = readFileSync(
      join(__dirname, '../../mobile/src/data/items_1_0.json'), 'utf8');
    const app = readFileSync(
      join(__dirname, '../public/data/items_1_0.json'), 'utf8');
    expect(mobile === canonical, 'mobile items copy diverged from canonical').toBe(true);
    expect(app === canonical, 'app items copy diverged from canonical').toBe(true);
  });
});
