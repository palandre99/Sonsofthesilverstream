/**
 * One search for everything — the top-bar overlay that spans pals,
 * items and screens (AAA criterion 2; design in 09_ITEMS_PLAN §6,
 * placement decided 2026-08-20). The composer's data joins are asserted
 * for real; the screen wiring is pinned by source.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  collapseFamilies, ITEMS, searchItems,
} from '../../mobile/src/itemsData';
import palsJson from '../../mobile/src/data/pals_1_0.json';

const read = (rel: string) => readFileSync(join(__dirname, '../..', rel), 'utf8');
const overlay = read('mobile/src/ui/SearchEverything.tsx');
const app = read('mobile/src/App.tsx');

describe('the search reaches every kind of thing', () => {
  it('one query can match a pal AND an item AND route both', () => {
    const pals = (palsJson as { pals: Record<string, unknown> }).pals;
    // "anubis" is the canary: a pal, and items named after it
    expect(Object.keys(pals)).toContain('Anubis');
    const items = searchItems('anubis');
    expect(items.length).toBeGreaterThan(0);
    for (const id of items) expect(ITEMS[id]).toBeDefined();
  });

  it('routes each hit through the intent mailbox with the right payload', () => {
    expect(overlay).toContain("payload: h.kind === 'pal' ? { pal: h.id }");
    expect(overlay).toContain("h.kind === 'item' ? { item: h.id }");
    expect(overlay).toContain("domain: 'breeding', tab: 'paldex'");
    expect(overlay).toContain("domain: 'items', tab: 'allitems'");
  });

  it('the center Items tab actually consumes the item payload', () => {
    const screen = read('mobile/src/screens/ItemsScreen.tsx');
    const appSrc = read('mobile/src/App.tsx');
    // the guard must name the SAME group the center tab is mounted with,
    // or every jump lands on the tab with no card (caught on a render
    // pass 2026-08-20, one commit after the group was renamed)
    const centre = /AllItemsTab = \(\) => <ItemsScreen initialGroup="([a-z]+)"/
      .exec(appSrc)?.[1];
    expect(centre).toBeDefined();
    expect(screen).toContain(`if (initialGroup !== '${centre}') return undefined;`);
  });

  it('screen results come from the live registry, never a hand list', () => {
    expect(overlay).toContain('DOMAINS.flatMap');
    expect(overlay, 'a coming-soon screen must never become a dead result')
      .toContain('.filter((t) => !t.soon && !d.soon)');
  });
});

describe('it is one tap from anywhere, and says so plainly', () => {
  it('the top bar carries the button on every screen', () => {
    expect(app).toContain('accessibilityLabel="Search everything"');
    expect(app).toContain('<SearchEverything onClose={() => setSearch(false)} />');
  });

  it('the empty and no-match states teach instead of shrugging', () => {
    expect(overlay).toContain('Type two letters to search every pal, every item and every');
    expect(overlay).toContain('Nothing matches');
    expect(overlay, 'counted label would read "1 results"')
      .toContain("hits.length === 1 ? '1 result'");
  });
});

describe('the search shows each thing once (IL38)', () => {
  const collapsed = (q: string) => collapseFamilies(searchItems(q));

  it('a five-tier weapon is one result, not five identical rows', () => {
    const raw = searchItems('Old Bow').filter((i) => ITEMS[i].name === 'Old Bow');
    expect(raw.length).toBe(5);           // the base and its four tiers
    const once = collapsed('Old Bow').filter((i) => ITEMS[i].name === 'Old Bow');
    expect(once.length).toBe(1);
  });

  it('no query can return the same name twice', () => {
    for (const q of ['bow', 'armor', 'sword', 'shotgun', 'helm']) {
      const names = collapsed(q).map((i) => ITEMS[i].name);
      expect(new Set(names).size, `"${q}" repeats a name`).toBe(names.length);
    }
  });

  it('duplicates were eating the result budget, not just looking untidy', () => {
    // 14 rows is the cap; "armor" raw is 224 rows for 126 real things, so
    // the tiers alone could fill the list and hide everything else
    const raw = searchItems('armor');
    expect(raw.length).toBeGreaterThan(200);
    expect(collapsed('armor').length).toBeLessThan(raw.length);
    const first14 = raw.slice(0, 14).map((i) => ITEMS[i].name);
    expect(new Set(first14).size).toBeLessThan(14);
  });

  it('the overlay collapses and says how many tiers a family has', () => {
    expect(overlay).toContain('collapseFamilies(searchItems(q))');
    expect(overlay).toContain('tiers up to ${topWord}');
    // and it ranks by the family's best, the way the index does
    expect(overlay).toContain("'power', true");
  });
});
