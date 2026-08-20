/**
 * The Items index — the fane's first visible surface. The data module is
 * imported FOR REAL (plain .ts); the screen's copy is pinned by source.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ammoForWeapon, buildTime, buildTotals, collapseFamilies, effectNumber, familyOf,
  familyPowerOf, gearAgainst, guardKinds, guardLevel, spokenTime,
  hasNoKnownSource,
  idsInGroup, implantPassive, ITEM_GROUPS, ITEM_STATS, ITEMS, itemIdByName, KIND_WORDS,
  kindsInGroup, kindWord, palsDropping, palsHatchingFrom, rawMaterialsFor,
  rankAxisOf, rankValueOf, rivalsOf, rollupOfMats,
  schematicsFor, searchItems, sortItems, statRank, TAB_GROUPS, teachesOf,
  tierWord, usedInOf, weaponsForAmmo,
} from '../../mobile/src/itemsData';
import palsJson from '../../mobile/src/data/pals_1_0.json';
import FACTS from '../../mobile/src/data/item_facts_1_0.json';
import {
  shareTextForBuild, shareTextForItem,
} from '../../mobile/src/itemShare';

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

describe('schematic rows say what they teach (IL15)', () => {
  it('the row line renders the teaching, not just "Schematic"', () => {
    const code = readFileSync(
      join(__dirname, '../../mobile/src/screens/ItemsScreen.tsx'), 'utf8');
    expect(code).toContain('Teaches ${ITEMS[t.id].name}');
    expect(code).toContain('tier ${t.tier}');
  });

  it('stat-less rows fall through to capture power, grants and effects (IL16)', () => {
    const code = readFileSync(
      join(__dirname, '../../mobile/src/screens/ItemsScreen.tsx'), 'utf8');
    expect(code).toContain('Capture Power ${facts.capture}');
    expect(code).toContain('facts.grants[0]');
    expect(code).toContain('facts.effects[0]');
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

describe('every item name on a pal card is a door (IL31)', () => {
  const pal = readFileSync(
    join(__dirname, '../../mobile/src/ui/PalDetail.tsx'), 'utf8');

  it('drops, ranch produce AND egg types all link to item cards', () => {
    // drops led the way at IL5; these two sat as dead badges beside them
    expect(pal).toContain("accessibilityLabel={`Ranch produce ${r}. Open its item card`}");
    expect(pal).toContain("accessibilityLabel={`${e}. Open the egg's card`}");
    expect((pal.match(/domain: 'items', tab: 'allitems'/g) ?? []).length)
      .toBeGreaterThanOrEqual(3);
  });

  it('a name the item table cannot resolve stays a plain badge', () => {
    expect(pal).toContain('if (!target) return <Badge key={`r-${r}`} kind="ok">Ranch: {r}</Badge>;');
    expect(pal).toContain('if (!eggId) return <Badge key={e} kind="plain">Egg: {e}</Badge>;');
  });

  it('the egg names on pal cards really resolve to items', () => {
    const pals = (palsJson as {
      pals: Record<string, { egg_types?: string[]; ranch_produce?: string[] }>;
    }).pals;
    const eggs = new Set<string>();
    const ranch = new Set<string>();
    for (const p of Object.values(pals)) {
      for (const e of p.egg_types ?? []) eggs.add(e);
      for (const r of p.ranch_produce ?? []) ranch.add(r);
    }
    for (const e of eggs) expect(itemIdByName(e), `egg ${e}`).not.toBeNull();
    const unresolved = [...ranch].filter((r) => itemIdByName(r) == null).sort();
    // Two ranch entries are DESCRIPTIONS, not item names — Vixy digs
    // "items from the ground" and Vaelet grows "various seeds". They
    // stay plain badges rather than being force-matched to some item
    // (measured 2026-08-20; the fallback branch above is for exactly
    // these two).
    expect(unresolved).toEqual(['items from the ground', 'various seeds']);
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

  it('every one of the 1,892 items shares clean — the catalogue-wide property', () => {
    for (const id of Object.keys(ITEMS)) {
      const txt = shareTextForItem(id, '1.0');
      expect(txt.length, id).toBeGreaterThan(30);
      expect(txt, id).toContain('read from the game files · Paldexia');
      expect(txt, `${id} share leaks markup`).not.toMatch(/<[a-zA-Z]+ id=/);
      expect(txt, `${id} share leaks an id token`).not.toMatch(/ [A-Za-z]+_[A-Za-z0-9]+ /);
    }
  });

  it('a shared egg carries its hatch list (IL30 drift fix)', () => {
    const commonEgg = Object.keys(ITEMS).find(
      (i) => ITEMS[i].name === 'Common Egg');
    const txt = shareTextForItem(commonEgg!, '1.0');
    expect(txt).toContain('Hatches: ');
    // the first six of the egg's real pool, in the order the data holds
    const listed = palsHatchingFrom(commonEgg!).slice(0, 6);
    for (const pal of listed) expect(txt).toContain(pal);
    expect(txt, 'a long hatch list must be capped, not dumped')
      .toMatch(/\+\d+ more/);
  });

  it('a shared craft carries its work and time', () => {
    const txt = shareTextForItem('Cake', '1.0');
    expect(txt).toContain('2,000 work');
    expect(txt).toContain('1h6m40s at Handiwork Lv. 1');
  });

  it('the screen sends exactly this composer through the native sheet', () => {
    const code = readFileSync(
      join(__dirname, '../../mobile/src/screens/ItemsScreen.tsx'), 'utf8');
    expect(code).toContain('shareTextForItem(id, breeding.game_version)');
  });
});

describe('ammo and weapons join both ways from the game’s own tags', () => {
  it('the Assault Rifle fires its ammo, and the ammo fits the rifle', () => {
    expect(ammoForWeapon('AssaultRifle_Default1')).toContain('AssaultRifleBullet');
    expect(ammoForWeapon('AssaultRifle_Default3')).toContain('AssaultRifleBullet');
    expect(weaponsForAmmo('AssaultRifleBullet')).toContain('AssaultRifle_Default1');
  });

  it('coarse ammo fits several weapons', () => {
    expect(weaponsForAmmo('RoughBullet').length).toBeGreaterThanOrEqual(2);
  });

  it('most of the ammo catalogue is joined', () => {
    const ammo = Object.keys(ITEMS).filter((i) => ITEMS[i].category === 'Ammo');
    const joined = ammo.filter((i) => weaponsForAmmo(i).length > 0);
    expect(ammo.length).toBe(32);
    expect(joined.length).toBe(25);
  });
});

describe('one row per item, tiers inside the card (CEO 2026-08-19)', () => {
  it('collapsing turns 310 weapon rows into their families', () => {
    const all = idsInGroup('weapons');
    const collapsed = collapseFamilies(all);
    expect(all.length).toBe(310);
    expect(collapsed.length).toBeLessThan(120);
    // the representative is the BASE tier a player meets first
    for (const id of collapsed) {
      expect(ITEMS[id].rarity ?? 0).toBe(ITEMS[familyOf(id)[0]].rarity ?? 0);
    }
  });

  it('the Mechanical Bow is one row that still ranks by its best tier', () => {
    const rows = sortItems(collapseFamilies(idsInGroup('weapons')), 'power', true);
    expect(ITEMS[rows[0]].name).toBe('Mechanical Bow');
    expect(ITEM_STATS[rows[0]]?.tier).toBe('Common');   // shows the base
    expect(familyPowerOf(rows[0])).toBe(24000);         // ranks by the top
  });

  it('the center Items tab excludes the groups that own a tab', () => {
    const other = idsInGroup('other');
    for (const g of TAB_GROUPS) {
      for (const id of idsInGroup(g)) expect(other).not.toContain(id);
    }
    expect(other.length).toBeGreaterThan(1000);
    expect(other.length).toBeLessThan(idsInGroup('all').length);
  });
});

describe('the level filter uses the player’s own profile (IL21)', () => {
  const code = readFileSync(
    join(__dirname, '../../mobile/src/screens/ItemsScreen.tsx'), 'utf8');

  it('reads the same level the rest of the app already stores', () => {
    // (the store import grew a build-list slice at IL43; the point of
    // this assertion is that the LEVEL comes from the shared store)
    expect(code).toContain('getPlayerLevel');
    expect(code).toContain("} from '../store';");
    expect(code, 'a second place to set the level would drift')
      .not.toMatch(/setProfileLevel|useState<number>\(\s*1\s*\)/);
  });

  it('a family is judged by its EASIEST tier, not its hardest', () => {
    expect(code).toContain('Math.min(...levels)');
  });

  it('items with no technology entry are never treated as locked', () => {
    expect(code).toContain('(unlockLevel(i) ?? 0) <= level');
  });

  it('rows say the level they need, and the sheet says it plainly', () => {
    expect(code).toContain('Lv {lockedAt}');
    expect(code).toContain('Only what I can unlock');
    expect(code, 'no level set must teach, not silently show nothing')
      .toContain('Set your level on the Profiles screen');
  });
});

describe('tapping deeper always leaves a way back (IL28)', () => {
  const code = readFileSync(
    join(__dirname, '../../mobile/src/screens/ItemsScreen.tsx'), 'utf8');

  it('the card keeps a trail and shows where you came from', () => {
    expect(code).toContain('const [trail, setTrail] = useState<string[]>([])');
    expect(code).toContain('setTrail([...trail, open])');
    expect(code).toContain('Back to ${cameFrom.name}');
  });

  it('back pops one step, close clears the whole trail', () => {
    expect(code).toContain('setTrail(trail.slice(0, -1))');
    expect(code).toContain('onClose={() => { setOpen(null); setTrail([]); }}');
  });

  it('re-opening the same card cannot stack a useless step', () => {
    expect(code).toContain('if (next === open) return;');
  });
});

describe('the card has one fixed anatomy (IL29, AAA criterion 4)', () => {
  const code = readFileSync(
    join(__dirname, '../../mobile/src/screens/ItemsScreen.tsx'), 'utf8');
  const at = (needle: string) => {
    const i = code.indexOf(needle);
    expect(i, `section missing: ${needle}`).toBeGreaterThan(-1);
    return i;
  };

  it('what a thing IS comes before where to get it', () => {
    expect(at('The numbers')).toBeLessThan(at('How to craft it'));
    expect(at('What it does')).toBeLessThan(at('How to craft it'));
  });

  it('an egg says what hatches BEFORE twenty chest rows', () => {
    // the bug this pinned: on an egg card the hatch list sat below the
    // whole sources block, so the one fact that matters was last
    expect(at('What hatches from it')).toBeLessThan(at('Where to find it'));
  });

  it('context and comparison stay at the end', () => {
    expect(at('Where to find it')).toBeLessThan(at('How it stacks up'));
    expect(at('How it stacks up')).toBeLessThan(at('Every tier of this'));
  });
});

describe('eggs with no listed pals say so (IL26)', () => {
  const code = readFileSync(
    join(__dirname, '../../mobile/src/screens/ItemsScreen.tsx'), 'utf8');

  it('no card shows a tier table made only of dashes', () => {
    expect(code).toContain('family.some((fid) => statLine(fid))');
  });

  it('the honest empty state exists and names the gap', () => {
    expect(code).toContain('What hatches from it');
    expect(code).toContain("don&apos;t list which pals come out of this");
    expect(code, 'the empty state must only apply to eggs')
      .toContain("if (ITEMS[id].subcategory !== 'MaterialPalEgg') return null;");
  });

  it('it offers the breeding suite, which is what an egg-holder wants', () => {
    expect(code).toContain("navigateTo({ domain: 'breeding', tab: 'calc' })");
  });

  it('the eggs it covers are exactly the ones the data cannot name', () => {
    const eggs = Object.keys(ITEMS)
      .filter((i) => ITEMS[i].subcategory === 'MaterialPalEgg');
    const unnamed = eggs.filter((i) => palsHatchingFrom(i).length === 0);
    expect(unnamed.length).toBe(10);
    for (const id of unnamed) {
      expect(ITEMS[id].name).toMatch(/Mutated|Ominous|Dragon Egg/);
    }
  });
});

describe('implants name their passive, from the datamined table (IL25)', () => {
  it('the disposable implants join too, curly apostrophes and all (IL27)', () => {
    const disposable = Object.keys(ITEMS).filter(
      (i) => ITEMS[i].subcategory === 'ConsumePassiveSkillChange');
    expect(disposable.length).toBe(21);
    const joined = disposable.filter((i) => implantPassive(i) != null);
    // 20 of 21. The one exception is REAL, not a bug: "Disposable
    // Implant: World Tree's Bounty" names a passive our datamined table
    // (114 rows) does not carry — the nearest name is "World Tree
    // Seedbed", and matching those would be inventing a fact.
    expect(joined.length).toBe(20);
    const missing = disposable.filter((i) => implantPassive(i) == null);
    expect(ITEMS[missing[0]].name).toBe("Disposable Implant: World Tree's Bounty");
    // the curly-apostrophe pair now joins
    const demon = disposable.find((i) => ITEMS[i].name.includes('Hand'));
    expect(implantPassive(demon!)?.name).toContain('Hand');
  });

  it('the row line carries the passive, not just "Passive skill item"', () => {
    const code = readFileSync(
      join(__dirname, '../../mobile/src/screens/ItemsScreen.tsx'), 'utf8');
    expect(code).toContain('bits.push(`${imp.name} · ${imp.effects}`)');
  });

  it('all 40 implants resolve to a real passive with real effect text', () => {
    const implants = Object.keys(ITEMS).filter(
      (i) => ITEMS[i].subcategory === 'Essential_PassiveSkillChange');
    expect(implants.length).toBe(40);
    for (const id of implants) {
      const p = implantPassive(id);
      expect(p, `${ITEMS[id].name} resolved to no passive`).not.toBeNull();
      expect(p!.effects.length).toBeGreaterThan(3);
      expect(p!.name).toBe(ITEMS[id].name.split(': ')[1]);
    }
  });

  it('the canary reads the game’s own words', () => {
    const brave = Object.keys(ITEMS).find((i) => ITEMS[i].name === 'Implant: Brave');
    expect(implantPassive(brave!)).toMatchObject({
      name: 'Brave', tier: 1, effects: 'Attack +10%',
    });
  });

  it('non-implants get nothing, and the passive is searchable', () => {
    expect(implantPassive('Cake')).toBeNull();
    const hits = searchItems('brave');
    expect(hits.some((i) => ITEMS[i].name === 'Implant: Brave')).toBe(true);
  });
});

describe('recipes read both ways (IL20)', () => {
  it('an ingredient lists what it goes into, families not tiers', () => {
    const ingot = itemIdByName('Refined Ingot');
    expect(ingot).not.toBeNull();
    const uses = usedInOf(ingot!);
    expect(uses.length).toBeGreaterThan(5);
    expect(new Set(uses.map((i) => ITEMS[i].name)).size).toBe(uses.length);
    // and the join is exact, both directions
    for (const uid of uses) expect(ITEMS[uid]).toBeDefined();
  });

  it('the biggest ingredient in the game resolves without exploding', () => {
    const parts = itemIdByName('Ancient Civilization Parts');
    const uses = usedInOf(parts!);
    expect(uses.length).toBeGreaterThan(50);   // it feeds 1,285 recipes
    expect(uses.length).toBeLessThan(600);     // collapsed to families
  });

  it('something nothing is crafted from lists nothing', () => {
    const cake = itemIdByName('Cake');
    expect(usedInOf(cake!)).toEqual([]);
  });
});

describe('cards compare against their own kind (IL19)', () => {
  it('an assault rifle is ranked among assault rifles, one row per family', () => {
    const rivals = rivalsOf('AssaultRifle_Default1');
    expect(rivals.length).toBeGreaterThan(3);
    for (const id of rivals) expect(kindWord(id)).toBe('Assault rifle');
    // families, not tiers: no two entries share a name
    expect(new Set(rivals.map((i) => ITEMS[i].name)).size).toBe(rivals.length);
    // ranked by the family's best number, descending
    for (let i = 1; i < rivals.length; i += 1) {
      expect(familyPowerOf(rivals[i - 1])).toBeGreaterThanOrEqual(familyPowerOf(rivals[i]));
    }
  });

  it('every ranked entry carries a real number', () => {
    for (const id of rivalsOf('AssaultRifle_Default1')) {
      expect(familyPowerOf(id)).toBeGreaterThan(0);
    }
  });

  it('kinds too small to rank get no leaderboard', () => {
    const detector = Object.keys(ITEMS).find(
      (i) => kindWord(i) === 'Metal detector');
    expect(detector).toBeDefined();
    expect(rivalsOf(detector!).length).toBeLessThan(3);
  });
});

describe('food sorts by what food competes on', () => {
  it('strongest-first on Food means best Nutrition first', () => {
    const food = sortItems(idsInGroup('food'), 'power');
    const first = effectNumber(food[0], 'Nutrition');
    expect(first).not.toBeNull();
    for (const id of food.slice(1, 15)) {
      const n = effectNumber(id, 'Nutrition');
      if (n != null) expect(n).toBeLessThanOrEqual(first!);
    }
  });

  it('food rows carry Nutrition and SAN as their line', () => {
    const code = readFileSync(
      join(__dirname, '../../mobile/src/screens/ItemsScreen.tsx'), 'utf8');
    expect(code).toContain("effectNumber(id, 'Nutrition')");
    expect(code).toContain("effectNumber(id, 'SAN')");
  });
});

describe('spheres and modules bridge both ways', () => {
  it('the screen renders the family cross-ref in both directions', () => {
    const code = readFileSync(
      join(__dirname, '../../mobile/src/screens/ItemsScreen.tsx'), 'utf8');
    expect(code).toContain("'Sphere modules'");
    expect(code).toContain("'Attaches to capture spheres'");
    expect(code).toContain("'SPWeaponCaptureBall'");
  });

  it('the sphere group splits 10 balls and 6 modules', () => {
    const spheres = idsInGroup('spheres');
    expect(spheres.filter((i) => ITEMS[i].subcategory === 'SPWeaponCaptureBall').length).toBe(10);
    expect(spheres.filter((i) => ITEMS[i].category === 'CaptureItemModifier').length).toBe(6);
  });
});

describe('eggs know their pals (game-file egg_types)', () => {
  it('the Common Egg hatches Lamball, and every egg type joins', () => {
    const commonEgg = Object.keys(ITEMS).find(
      (i) => ITEMS[i].name === 'Common Egg');
    expect(palsHatchingFrom(commonEgg!)).toContain('Lamball');
    const eggs = Object.keys(ITEMS)
      .filter((i) => ITEMS[i].subcategory === 'MaterialPalEgg');
    expect(eggs.length).toBe(53);
    const covered = eggs.filter((i) => palsHatchingFrom(i).length > 0);
    // 43 join; the uncovered six names are RIGHT to stay empty — the
    // Mutated/Ominous families are Breeding Farm eggs whose contents
    // depend on the parents, and plain Dragon Egg has no wild claimant
    // in the pal table
    expect(covered.length).toBe(43);
    const uncoveredNames = new Set(eggs
      .filter((i) => palsHatchingFrom(i).length === 0)
      .map((i) => ITEMS[i].name));
    expect([...uncoveredNames].sort()).toEqual([
      'Dragon Egg', 'Huge Mutated Egg', 'Huge Ominous Egg',
      'Large Mutated Egg', 'Large Ominous Egg', 'Ominous Egg',
    ]);
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

  it('search finds gear by what it GRANTS (IL24)', () => {
    const cold = searchItems('cold resistance');
    expect(cold.length).toBeGreaterThan(5);
    // every hit really carries it — no loose matching
    for (const id of cold) {
      const hay = [
        ITEMS[id].name,
        ...((FACTS.facts[id] as { grants?: string[] })?.grants ?? []),
      ].join(' ').toLowerCase();
      expect(hay, `${id} matched "cold resistance" without carrying it`)
        .toContain('cold resistance');
    }
    // and by effect label
    expect(searchItems('nutrition').length).toBeGreaterThan(50);
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

  it('the shopping list is the recipe multiplied out, not a new number (IL32)', () => {
    const facts = (FACTS as { facts: Record<string, {
      recipe?: { id: string; n: number }[] }> }).facts;
    const craftable = Object.keys(facts).filter((i) => facts[i].recipe?.length);
    expect(craftable.length).toBeGreaterThan(1000);
    let withDepth = 0;
    const craftableLeaves = new Set<string>();
    for (const id of craftable) {
      const roll = rawMaterialsFor(id);
      // every row names a real item and a positive count
      for (const r of [...roll.gather, ...roll.steps]) {
        expect(ITEMS[r.id], `${id} rolled up to an unknown id ${r.id}`).toBeTruthy();
        expect(r.n).toBeGreaterThan(0);
      }
      for (const r of roll.gather) craftableLeaves.add(r.id);
      for (const r of roll.steps) {
        expect(facts[r.id]!.recipe!.some((m) => m.id !== r.id)).toBe(true);
      }
      // you are never told to go and get the thing you are making
      expect(roll.gather.some((r) => r.id === id)).toBe(false);
      // the two lists never overlap, or a row would be both
      const steps = new Set(roll.steps.map((r) => r.id));
      for (const r of roll.gather) expect(steps.has(r.id)).toBe(false);
      if (roll.steps.length) withDepth++;
    }
    // These are the craftable items whose ingredients are themselves
    // crafted, so the bill says something the recipe did not. The 11
    // items the game loops back on itself are not among them. Rose from
    // 1,071 when IL40 recovered 45 recipes from Production rows.
    expect(withDepth).toBe(1088);
    // Anything told to you as "go and get this" must genuinely be
    // uncraftable — except the items the game loops back on itself,
    // which are listed here BY NAME rather than waved through.
    const craftableAsLeaf = [...craftableLeaves]
      .filter((i) => facts[i]?.recipe?.length)
      .map((i) => ITEMS[i].name).sort();
    expect(craftableAsLeaf).toEqual([
      'Bellanoir Libero (Ultra) Slab Fragment',
      "Bellanoir Libero's Slab Fragment",
      "Bellanoir's Slab Fragment",
      'Blazamut Ryu (Ultra) Slab Fragment',
      'Blazamut Ryu Slab Fragment',
      'Hartalis (Ultra) Slab Fragment',
      'Hartalis Slab Fragment',
      'Medium Pal Soul',
      'Xenolord (Ultra) Slab Fragment',
      'Xenolord Slab Fragment',
    ]);
  });

  it('every schematic tier gets the same expansion as the base (IL33)', () => {
    const facts = (FACTS as { facts: Record<string, {
      crafts?: { product: string; mats: { id: string; n: number }[] }[] }> }).facts;
    let tiers = 0;
    let deeper = 0;
    for (const f of Object.values(facts)) {
      for (const c of f.crafts ?? []) {
        tiers++;
        const roll = rollupOfMats(c.mats, c.product);
        for (const r of [...roll.gather, ...roll.steps]) {
          expect(ITEMS[r.id], `tier ${c.product} rolled up to unknown ${r.id}`).toBeTruthy();
          expect(r.n).toBeGreaterThan(0);
        }
        // never "to build this, go and get this"
        expect(roll.gather.some((r) => r.id === c.product)).toBe(false);
        const steps = new Set(roll.steps.map((r) => r.id));
        for (const r of roll.gather) expect(steps.has(r.id)).toBe(false);
        if (roll.steps.length) deeper++;
      }
    }
    expect(tiers).toBe(1690);
    expect(deeper).toBe(1451);
  });

  it("a tier's bill scales with the tier, and it is the same ore", () => {
    const facts = (FACTS as { facts: Record<string, {
      crafts?: { product: string; mats: { id: string; n: number }[] }[] }> }).facts;
    const tiers = facts.BeamSword!.crafts!;
    const ore = (mats: { id: string; n: number }[], product: string) =>
      rollupOfMats(mats, product).gather.find((r) => ITEMS[r.id].name === 'Ore')!.n;
    const counts = tiers.map((c) => ore(c.mats, c.product));
    // the Common blade is 169 Ore; every tier above it costs strictly more
    expect(rawMaterialsFor('BeamSword').gather[0].n).toBe(169);
    expect(counts[0]).toBe(204);
    expect(counts[counts.length - 1]).toBe(376);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i], `tier ${i} costs no more ore than tier ${i - 1}`)
        .toBeGreaterThan(counts[i - 1]);
    }
  });

  it('a tier that is already raw offers nothing to open out', () => {
    const facts = (FACTS as { facts: Record<string, {
      crafts?: { product: string; mats: { id: string; n: number }[] }[] }> }).facts;
    const flat = Object.values(facts).flatMap((f) => f.crafts ?? [])
      .filter((c) => rollupOfMats(c.mats, c.product).steps.length === 0);
    expect(flat.length).toBe(1690 - 1451);
    // and the screen only draws the control when there is depth to show
    expect(code).toContain('const deep = roll.steps.length > 0;');
    expect(code).toContain('What it really costs');
  });

  it('every material list on the card is tappable, none is flat text (IL34)', () => {
    // one component draws them all, so there is one place to get right
    expect(code).toContain('function MatChips(');
    expect(code).toContain('accessibilityLabel={`${r.n} ${it.name}. Open its card`}');
    // the four lists that used to be a joined string: the tier's own
    // recipe, both halves of its from-scratch bill, and the
    // recipesMore fallback
    expect(code).toContain('<MatChips rows={c.mats} onOpenItem={onOpenItem} />');
    expect(code).toContain('<MatChips rows={roll.gather} onOpenItem={onOpenItem} />');
    expect(code).toContain('<MatChips rows={roll.steps} onOpenItem={onOpenItem} dim />');
    expect(code).toContain('<MatChips key={i} rows={block} onOpenItem={onOpenItem} />');
    // no material list may go back to being a joined string
    expect(code, 'a material list is flat text again')
      .not.toMatch(/\{(c\.mats|block)\.map\([^)]*\)\.join\(' · '\)\}/);
  });

  it('the two Pal Souls loop back on each other, so neither claims a bill', () => {
    // Small is made from a Medium and a Medium from Smalls — expanding
    // either would tell you to gather what you are making
    for (const id of ['PalUpgradeStone', 'PalUpgradeStone2']) {
      const roll = rawMaterialsFor(id);
      expect(roll.steps).toEqual([]);
      expect(roll.gather).toEqual([]);
    }
  });

  it('a recipe that is already raw adds no second list', () => {
    // Refined Ingot is 2 Ore, and Ore is not crafted — nothing to expand
    const flat = rawMaterialsFor('IronIngot');
    expect(flat.steps).toEqual([]);
    expect(flat.gather.length).toBeGreaterThan(0);
  });

  it("the Beam Sword's real cost is the ore, not the Plasteel", () => {
    const roll = rawMaterialsFor('BeamSword');
    const named = roll.gather.map((r) => `${r.n}× ${ITEMS[r.id].name}`);
    expect(named[0]).toBe('169× Ore');
    expect(named).toContain('100× Paldium Fragment');
    expect(named).toContain('12× Coal');
    // build order: the things made straight from ore come first, and the
    // Computer — which needs three of the others — comes last
    expect(ITEMS[roll.steps[0].id].name).toBe('Plasteel');
    expect(ITEMS[roll.steps[roll.steps.length - 1].id].name).toBe('Computer');
    // and it travels in a share
    const txt = shareTextForItem('BeamSword', '0.3.5');
    expect(txt).toContain('From scratch: 169× Ore');
  });

  it('a recipe that lists itself stops instead of looping forever', () => {
    // 9 boss-summon Parts name themselves upstream; the walk must end
    const self = Object.entries((FACTS as { facts: Record<string, {
      recipe?: { id: string; n: number }[] }> }).facts)
      .filter(([id, f]) => (f.recipe ?? []).some((r) => r.id === id))
      .map(([id]) => id);
    expect(self.length).toBe(9);
    for (const id of self) {
      const roll = rawMaterialsFor(id);
      // it is a thing you go and get, so it never shows its own section
      expect(roll.steps).toEqual([]);
      expect(roll.gather).toEqual([]);
    }
    // and where one is an INGREDIENT it must not be in both lists at once
    const user = Object.entries((FACTS as { facts: Record<string, {
      recipe?: { id: string; n: number }[] }> }).facts)
      .find(([, f]) => (f.recipe ?? []).some((r) => self.includes(r.id)))![0];
    const roll = rawMaterialsFor(user);
    expect(roll.steps.some((r) => self.includes(r.id))).toBe(false);
    expect(roll.gather.some((r) => self.includes(r.id))).toBe(true);
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

describe('a card with no source says so, instead of just ending (IL41)', () => {
  const code = readFileSync(
    join(__dirname, '../../mobile/src/screens/ItemsScreen.tsx'), 'utf8');

  it('102 items genuinely have nowhere recorded to get them', () => {
    const silent = Object.keys(ITEMS).filter(hasNoKnownSource);
    expect(silent.length).toBe(102);
    // and the split the ledger records, so a regression is legible
    const sub = (s: string) => silent.filter((i) => ITEMS[i].subcategory === s).length;
    expect(sub('MaterialPalEgg')).toBe(53);
    expect(sub('Essential_PassiveSkillChange')).toBe(26);
    expect(sub('WeaponGrapplingGun')).toBe(5);
  });

  it('anything with a recipe, a drop or a shop is NOT called sourceless', () => {
    // the predicate must not creep — these all answer the question
    expect(hasNoKnownSource('Charcoal')).toBe(false);   // recipe (IL40)
    expect(hasNoKnownSource('BeamSword')).toBe(false);  // recipe + tech
    expect(hasNoKnownSource(itemIdByName('Wool')!)).toBe(false); // pal drop
  });

  it('the screen says it plainly and never invents a source', () => {
    expect(code).toContain('hasNoKnownSource(id) && (');
    expect(code).toContain('The game files record no drop, chest or merchant for this egg.');
    expect(code).toContain('nothing in the data says where it comes from');
  });

  it('an egg gets the breeding route, but never two buttons', () => {
    // the 10 eggs with no hatch table already carry the button in their
    // own IL26 card; the new card must not add a second
    expect(code).toContain('&& palsHatchingFrom(id).length > 0 && (');
    const eggs = Object.keys(ITEMS)
      .filter((i) => ITEMS[i].subcategory === 'MaterialPalEgg');
    const noHatch = eggs.filter((i) => palsHatchingFrom(i).length === 0);
    expect(noHatch.length).toBe(10);
  });
});

describe('a kind with no attack still gets a rank (IL42)', () => {
  const code = readFileSync(
    join(__dirname, '../../mobile/src/screens/ItemsScreen.tsx'), 'utf8');

  it('EXP items rank by EXP, biggest first', () => {
    expect(rankAxisOf('Pal EXP item')).toBe('EXP');
    const order = rivalsOf('ExpBoost_03').map((i) => ITEMS[i].name);
    expect(order).toEqual([
      'Training Manual (XL)', 'Training Manual (L)',
      'Training Manual (M)', 'Training Manual (S)',
    ]);
    expect(rankValueOf('ExpBoost_04')).toBe(100000);
    expect(rankValueOf('ExpBoost_01')).toBe(200);
  });

  it('technology manuals rank by the points they give', () => {
    expect(rankAxisOf('Technology manual')).toBe('Technology Points');
    expect(rivalsOf('TechnologyBook_G1').map((i) => ITEMS[i].name)).toEqual([
      'Futuristic Technical Manual', 'Innovative Technical Manual',
      'Advanced Technical Manual',
    ]);
  });

  it('two rivals is enough — the small kinds were denied a rank', () => {
    // Gatling guns: two families, both with attack, previously no board
    const gat = rivalsOf('GatlingGun');
    expect(gat.length).toBe(2);
    expect(ITEMS[gat[0]].name).toBe('Laser Gatling Gun');
    expect(code).toContain('if (rivals.length < 2) return null;');
  });

  it('a kind that shares NO number is left unranked, not invented', () => {
    // Ore, Gliders and Bait carry no common figure; ranking them would
    // be exactly the invented meaning the rule exists to prevent
    for (const kind of ['Ore', 'Glider', 'Fishing bait', 'Wood']) {
      expect(rankAxisOf(kind), `${kind} got an invented axis`).toBeNull();
    }
    expect(rivalsOf('Coal')).toEqual([]);
  });

  it('the board says what it ranks by when it is not the stat', () => {
    expect(code).toContain('most ${axis} first');
    expect(code).toContain('{rankValueOf(rid)}');
  });
});

describe('the build list adds up what a whole grind costs (IL43)', () => {
  const code = readFileSync(
    join(__dirname, '../../mobile/src/screens/ItemsScreen.tsx'), 'utf8');
  const store = readFileSync(
    join(__dirname, '../../mobile/src/store.ts'), 'utf8');

  it('one item is exactly its own bill', () => {
    const one = buildTotals({ BeamSword: 1 });
    const solo = rawMaterialsFor('BeamSword');
    expect(one.gather).toEqual(solo.gather);
    expect(one.steps).toEqual(solo.steps);
  });

  it('quantity multiplies, it does not re-derive', () => {
    const three = buildTotals({ BeamSword: 3 });
    const solo = rawMaterialsFor('BeamSword');
    for (const row of three.gather) {
      const own = solo.gather.find((g) => g.id === row.id)!;
      expect(row.n).toBe(own.n * 3);
    }
  });

  it('two things that share a material share ONE line', () => {
    // the whole point: not two Wood rows, one Wood row.
    // Charcoal is 2 Wood each, the Wooden Club (id Bat) is 5 Wood each
    const both = buildTotals({ Charcoal: 2, Bat: 3 });
    const wood = both.gather.filter((g) => ITEMS[g.id].name === 'Wood');
    expect(wood.length).toBe(1);
    expect(wood[0].n).toBe(2 * 2 + 5 * 3);
  });

  it('something nobody crafts is itself a thing to gather', () => {
    const raw = buildTotals({ Wood: 50 });
    expect(raw.gather).toEqual([{ id: 'Wood', n: 50 }]);
    expect(raw.steps).toEqual([]);
  });

  it('an empty or unknown list totals nothing, never throws', () => {
    expect(buildTotals({})).toEqual({ gather: [], steps: [] });
    expect(buildTotals({ NotAnItem: 3 })).toEqual({ gather: [], steps: [] });
    expect(buildTotals({ BeamSword: 0 })).toEqual({ gather: [], steps: [] });
  });

  it('the list is per world and survives a restart', () => {
    expect(store).toContain('build: `palforge-${profileId}-build`');
    expect(store).toContain("build: 'palforge-default-build'");
    // a malformed saved entry is dropped on load
    expect(store).toContain('Number.isFinite(n) && n > 0');
  });

  it('the breeding store does not depend on the item catalogue (IL48)', () => {
    // A LAYERING fix, and honestly not a startup win on its own: the
    // top-bar search means App.tsx pulls itemsData anyway. But the
    // breeding store has no business importing 2.4 MB of item facts
    // for two id checks, and if the search is ever made lazy this is
    // the other door that would have kept the cost. Measured
    // 2026-08-20: items_1_0.json 115ms, item_facts_1_0.json 356ms,
    // our own index building only 30ms.
    expect(store, 'store imports the item catalogue again')
      .not.toMatch(/^import .*from '\.\/itemsData'/m);
    expect(store).not.toContain('Object.hasOwn(ITEMS');
    // and the panel still refuses an id the catalogue has forgotten
    expect(code).toContain("Object.keys(list).filter((i) => ITEMS[i])");
  });

  it('a slip on the stepper cannot ask for four billion Paldium', () => {
    expect(store).toContain('Math.min(qty, 999)');
  });

  it('the panel hides completely until something is on the list', () => {
    expect(code).toContain('if (!ids.length) return null;');
    expect(code).toContain('<BuildPanel onOpenItem={setOpen} />');
  });
});

describe('the build list can leave the phone (IL44)', () => {
  const code = readFileSync(
    join(__dirname, '../../mobile/src/screens/ItemsScreen.tsx'), 'utf8');
  const txt = shareTextForBuild({ Charcoal: 2, Bat: 3 }, '1.0');

  it('says what you are making and what it really costs', () => {
    expect(txt).toContain('My Palworld build — 5 things');
    expect(txt).toContain('2× Charcoal');
    expect(txt).toContain('3× Wooden Club');
    // one Wood line, summed across both — the whole point of the list
    expect(txt).toContain('19× Wood');
    expect(txt).toContain('Everything you need from scratch:');
  });

  it('carries its provenance, like every other share here', () => {
    expect(txt.trimEnd().endsWith(
      'Palworld 1.0 · read from the game files · Paldexia')).toBe(true);
  });

  it('an empty list shares nothing at all, not a header', () => {
    expect(shareTextForBuild({}, '1.0')).toBe('');
    expect(shareTextForBuild({ NotAnItem: 2 }, '1.0')).toBe('');
    expect(shareTextForBuild({ Charcoal: 0 }, '1.0')).toBe('');
  });

  it('a list of raw materials needs no "crafted along the way"', () => {
    const raw = shareTextForBuild({ Wood: 20 }, '1.0');
    expect(raw).toContain('20× Wood');
    expect(raw).not.toContain('Crafted along the way');
  });

  it('the panel offers it, and sends the real composer', () => {
    expect(code).toContain('Share my build…');
    expect(code).toContain('shareTextForBuild(list, breeding.game_version)');
  });
});

describe('adding to the build costs the row no width (IL45)', () => {
  const code = readFileSync(
    join(__dirname, '../../mobile/src/screens/ItemsScreen.tsx'), 'utf8');

  it('holding a row adds it, and the row gains NO button', () => {
    expect(code).toContain('onLongPress={craftable ?');
    expect(code).toContain('Haptics.NotificationFeedbackType.Success');
    // the measurement that decided this is recorded where it was made
    expect(code).toContain('needs 252px in a 199px slot');
  });

  it('only things you make can be held — a raw material cannot', () => {
    expect(code).toContain(
      "const craftable = !!(facts?.recipe || facts?.crafts || facts?.recipesMore);");
    // Wood carries facts (where it is found, what it is for) but no
    // RECIPE — you gather it. The Beam Sword you make.
    const facts = (FACTS as { facts: Record<string, {
      recipe?: unknown; crafts?: unknown; recipesMore?: unknown }> }).facts;
    const makeable = (i: string) =>
      !!(facts[i]?.recipe || facts[i]?.crafts || facts[i]?.recipesMore);
    expect(makeable('Wood')).toBe(false);
    expect(makeable('BeamSword')).toBe(true);
  });

  it('a row on the build list SAYS so, outranking the weight', () => {
    expect(code).toContain('×{inBuild} building');
    expect(code).toContain('{inBuild > 0 ? (');
    // and the screen re-renders when the list changes
    expect(code).toContain('useAppVersion();          // rows carry a build marker');
  });

  it('the gesture is taught, not hidden', () => {
    expect(code).toContain('or hold any row in the list');
    expect(code).toContain('Hold to add it to your build');
  });
});

describe('the build list knows what your level can reach (IL46)', () => {
  const code = readFileSync(
    join(__dirname, '../../mobile/src/screens/ItemsScreen.tsx'), 'utf8');

  it('warns only when a level is actually set — no level, no claim', () => {
    expect(code).toContain('const level = getPlayerLevel();');
    // whitespace-insensitive: this pinned an exact line break once and
    // broke on a reflow that changed nothing about the behaviour
    expect(code.replace(/\s+/g, ' ')).toContain(
      'level == null ? [] : ids.filter((i) => (unlockLevel(i) ?? 0) > level);');
  });

  it('says it collapsed too, where a player reads before farming', () => {
    expect(code).toContain('{locked.length} out of reach');
    expect(code).toContain('needs technology level ${unlockLevel(locked[0])}');
  });

  it('it is a warning, never a block — nothing is removed or disabled', () => {
    // scoped to the PANEL: the index's own "what I can build" filter
    // (IL21) legitimately does filter by level, and must not be caught
    const panel = code.slice(code.indexOf('function BuildPanel('),
      code.indexOf('const techLine = techSentence;'));
    expect(panel).toContain('ids.filter((i) => (unlockLevel(i) ?? 0) > level)');
    expect(panel, 'the panel dropped items instead of warning')
      .not.toMatch(/ids\s*=\s*ids\.filter/);
    expect(panel).not.toContain('disabled={locked');
    // the totals are still computed from the WHOLE list
    expect(panel).toContain('buildTotals(list)');
  });

  it('a build marker no longer HIDES the out-of-reach level (self-caught)', () => {
    // IL45 replaced the gold Lv marker with "xN building", so adding a
    // thing you cannot build yet hid the only warning about it
    expect(code).toContain('{lockedAt != null && (');
    expect(code).toContain('×{inBuild} building');
    const rowBlock = code.slice(code.indexOf('{inBuild > 0 ? ('),
      code.indexOf('{it.weight != null'));
    expect(rowBlock, 'the level marker is not inside the build branch')
      .toContain('Lv {lockedAt}');
  });

  it('the levels it quotes are the real shipped ones', () => {
    const facts = (FACTS as { facts: Record<string, {
      tech?: { level: number }; recipe?: unknown }> }).facts;
    const levelled = Object.keys(facts).filter((i) => facts[i].tech?.level);
    expect(levelled.length).toBe(701);
    // 681 of those are things you CRAFT — the ones a build list holds
    const craftable = levelled.filter((i) => facts[i].recipe);
    expect(craftable.length).toBe(681);
    // the family's EASIEST tier is what unlockLevel reports (IL21)
    expect(facts.BeamSword!.tech!.level).toBe(57);
  });
});

describe('the build list says how long, and what it cannot time (IL47)', () => {
  const code = readFileSync(
    join(__dirname, '../../mobile/src/screens/ItemsScreen.tsx'), 'utf8');

  it('sums the game\'s own stated times, multiplied by quantity', () => {
    // Beam Sword is 2h46m40s = 10,000s at Handiwork Lv. 1
    const one = buildTime({ BeamSword: 1 });
    expect(one.seconds).toBe(10000);
    expect(one.counted).toBe(1);
    expect(one.unknown).toBe(0);
    const three = buildTime({ BeamSword: 3 });
    expect(three.seconds).toBe(30000);
  });

  it('counts what it CANNOT measure instead of ignoring it', () => {
    // the AI Core has a recipe but no craft time recorded upstream.
    // `unknown` counts THINGS, not entries — the panel header says
    // "5 things" meaning units, and one word must not mean two numbers
    const mixed = buildTime({ BeamSword: 1, AIcore: 2 });
    expect(mixed.seconds).toBe(10000);
    expect(mixed.counted).toBe(1);
    expect(mixed.unknown).toBe(2);
  });

  it('a gathered material is not "unmeasured" — it has no craft at all', () => {
    const raw = buildTime({ Wood: 40 });
    expect(raw).toEqual({ seconds: 0, counted: 0, unknown: 0 });
  });

  it('reads as time a player speaks, not a pile of seconds', () => {
    expect(spokenTime(10000)).toBe('2h 47m');
    expect(spokenTime(3600)).toBe('1h');
    expect(spokenTime(600)).toBe('10m');
    expect(spokenTime(45)).toBe('45s');
    expect(spokenTime(0)).toBe('');
  });

  it('the panel never shows a total without naming the gap', () => {
    expect(code).toContain('plus ');
    expect(code).toContain('with no time recorded');
    expect(code).toContain('About ${spokenTime(time.seconds)} of crafting at Handiwork Lv. 1');
    // and when nothing can be timed it says so rather than "About 0s"
    expect(code).toContain('No craft time is recorded for any of these');
  });

  it('the shipped coverage is what the note measured', () => {
    const facts = (FACTS as { facts: Record<string, {
      recipe?: unknown; craftTime?: string }> }).facts;
    const craftable = Object.keys(facts).filter((i) => facts[i].recipe);
    const timed = craftable.filter((i) => facts[i].craftTime);
    expect(craftable.length).toBe(1416);
    // 740 carry a craft TIME (739 carry both a time and a work amount —
    // one records a time with no work, which is why the two counts in
    // the ledger differ by one)
    expect(timed.length).toBe(740);
  });
});

describe('the shared build carries the time too (IL30 lesson, IL47 tick)', () => {
  it('a shared list says how long, with the same honesty', () => {
    const txt = shareTextForBuild({ BeamSword: 3, AIcore: 2 }, '1.0');
    expect(txt).toContain('About 8h 20m of crafting at Handiwork Lv. 1');
    expect(txt).toContain('plus 2 things with no time recorded');
  });

  it('a list of raw materials claims no time at all', () => {
    const txt = shareTextForBuild({ Wood: 20 }, '1.0');
    expect(txt).not.toContain('Handiwork');
    expect(txt).not.toContain('no time recorded');
  });

  it('the personal level warning deliberately does NOT travel', () => {
    // "you are level 40" is nonsense in someone else's hands
    const txt = shareTextForBuild({ BeamSword: 1 }, '1.0');
    expect(txt).not.toContain('technology level');
    expect(txt).not.toContain('out of reach');
  });

  it('provenance still comes last, after the new line', () => {
    const txt = shareTextForBuild({ BeamSword: 1 }, '1.0');
    expect(txt.trimEnd().endsWith(
      'Palworld 1.0 · read from the game files · Paldexia')).toBe(true);
  });
});

describe('gear is findable by what it protects you from (IL50)', () => {
  const code = readFileSync(
    join(__dirname, '../../mobile/src/screens/ItemsScreen.tsx'), 'utf8');

  it('the guard list is derived from the data, not hardcoded', () => {
    const kinds = guardKinds();
    expect(kinds).toContain('Cold');
    expect(kinds).toContain('Heat');
    expect(kinds).toContain('Dragon');
    // 12 real protections — and NOT the malformed one a naive parse made
    expect(kinds.length).toBe(12);
    for (const k of kinds) {
      expect(k, `"${k}" is a mangled grant string, not a protection`)
        .not.toMatch(/Resistance|Lv\.|\//);
    }
  });

  it('one grant string can carry TWO protections', () => {
    // "Heat Resistance Lv. 3 / Cold Resistance Lv. 3" — reading it whole
    // invented a guard called "Heat Resistance Lv. 3 / Cold"
    const hex = Object.keys(ITEMS)
      .find((i) => ITEMS[i].name === 'Cold Resistant Hexolite Armor')!;
    expect(guardLevel(hex, 'Cold')).toBe(3);
    expect(gearAgainst('Cold').length).toBe(33);
    expect(gearAgainst('Heat').length).toBe(33);
  });

  it('the strongest protection comes first', () => {
    const cold = gearAgainst('Cold');
    const levels = cold.map((i) => Math.max(
      ...familyOf(i).map((t) => guardLevel(t, 'Cold'))));
    for (let n = 1; n < levels.length; n++) {
      expect(levels[n]).toBeLessThanOrEqual(levels[n - 1]);
    }
    expect(levels[0]).toBe(3);
  });

  it('nothing without that protection survives the filter', () => {
    for (const id of gearAgainst('Fire')) {
      expect(familyOf(id).some((t) => guardLevel(t, 'Fire') > 0)).toBe(true);
    }
  });

  it('the row shows it, short enough to sit beside a defence number', () => {
    expect(code).toContain('const SHORT_GRANT =');
    expect(code).toContain('function guardBits(');
    expect(code).toContain('bits.push(...guardBits(id));');
    // and a collapsed family row shows it too
    expect(code).toContain("[`Defense ${def}`, ...guardBits(fam[0])].join(' · ')");
  });

  it('the filter is wired end to end', () => {
    expect(code).toContain('<Section title="Protects against">');
    expect(code).toContain('familyOf(i).some((t) => guardLevel(t, g) > 0)');
    expect(code).toContain('protects from ${filters.guard}');
  });
});

describe('food says why you would cook it (IL52)', () => {
  const code = readFileSync(
    join(__dirname, '../../mobile/src/screens/ItemsScreen.tsx'), 'utf8');
  const facts = (FACTS as { facts: Record<string, {
    effects?: [string, string][] }> }).facts;
  const has = (id: string, label: string) =>
    (facts[id]?.effects ?? []).some(([k]) => k === label);

  it('the buffs are really in the shipped data', () => {
    const food = Object.keys(ITEMS).filter((i) => ITEMS[i].category === 'Food');
    expect(food.length).toBe(94);
    expect(food.filter((i) => has(i, 'Work Speed')).length).toBe(9);
    expect(food.filter((i) => has(i, 'EXP increase')).length).toBe(4);
    expect(food.filter((i) => has(i, 'Hunger resist')).length).toBe(9);
  });

  it('the row shows the buff, not just how filling it is', () => {
    expect(code).toContain('const buffs = buffBits(id);');
    expect(code).toContain('bits.push(...buffs);');
    // one buff fits the row; the rest are counted, not trailed off
    expect(code).toContain('+${buffs.length - 1} more');
    expect(code).toContain("const BUFF_LABELS = ['Work Speed', 'EXP increase', "
      + "'Hunger resist', 'SAN resist'];");
  });

  it('Recovery Time stays off the row — its meaning is not established', () => {
    // I first claimed it reads 600 everywhere and this test disproved
    // it: food carries 60, 600 and 1800. It is excluded because a
    // compact row cannot honestly say "600 what?", not because it is
    // constant. The CARD still shows it verbatim.
    const timed = Object.keys(facts).filter((i) => has(i, 'Recovery Time'));
    const values = [...new Set(timed.map((i) =>
      facts[i]!.effects!.find(([k]) => k === 'Recovery Time')![1]))].sort();
    expect(timed.length).toBeGreaterThan(30);
    expect(values).toEqual(['10', '1800', '60', '600']);
    expect(code).not.toContain("'Recovery Time',");
  });

  it('the filter finds food by its buff', () => {
    expect(code).toContain('<Section title="Gives you">');
    expect(code).toContain('ids.filter((i) => effectNumber(i, b) != null)');
  });
});
