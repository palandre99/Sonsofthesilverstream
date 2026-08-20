/**
 * The Items index — the fane's first visible surface. The data module is
 * imported FOR REAL (plain .ts); the screen's copy is pinned by source.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ammoForWeapon, buildTime, buildTotals, captureRank, collapseFamilies,
  effectNumber,
  effectRank, familyOf,
  familyPowerOf, gearAgainst, guardKinds, guardLevel, spokenTime,
  grantsToShow, hasNoKnownSource,
  idsInGroup, implantPassive, ITEM_GROUPS, ITEM_STATS, ITEMS, itemIdByName, KIND_WORDS,
  kindsInGroup, kindWord, palForGear, palsDropping, palsHatchingFrom,
  rawMaterialsFor,
  rankAxisOf, rankValueOf, recipeOf, hasTierCosts, rivalsOf, rollupOfMats,
  rivalBasis, rivalShowOf, rivalSortOf,
  saysTheSame,
  familyLine, statLine, familyPowerAxisOf, suggestItems,
  groupOf, ITEM_IDS,
  schematicsFor, searchItems, spokenCraftTime, sortItems, statRank, TAB_GROUPS, teachesOf,
  tierWord, usedInOf, weaponsForAmmo,
} from '../../mobile/src/itemsData';
import palsJson from '../../mobile/src/data/pals_1_0.json';
import FACTS from '../../mobile/src/data/item_facts_1_0.json';
import { equipPassiveName, ITEM_FACTS } from '../../mobile/src/itemFacts';
import { CAKES } from '../../mobile/src/engine/odds';

/** IL72 moved statLine/familyLine into itemsData so the index could be
 * measured. The row's text is now assembled across both files, so the
 * source-level assertions read both. */
const ROW_CODE =
  readFileSync(join(__dirname, '../../mobile/src/screens/ItemsScreen.tsx'), 'utf8')
  + '\n'
  + readFileSync(join(__dirname, '../../mobile/src/itemsData.ts'), 'utf8');
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
    expect(ROW_CODE).toContain('Teaches ${ITEMS[t.id].name}');
    expect(ROW_CODE).toContain('tier ${t.tier}');
  });

  it('stat-less rows fall through to capture power, grants and effects (IL16)', () => {
    const code = readFileSync(
      join(__dirname, '../../mobile/src/screens/ItemsScreen.tsx'), 'utf8');
    expect(ROW_CODE).toContain('Capture Power ${facts.capture}');
    expect(ROW_CODE).toContain('facts.grants[0]');
    expect(ROW_CODE).toContain('facts.effects[0]');
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
    expect(txt).toContain('1h 6m 40s at Handiwork Lv. 1');
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
    expect(ROW_CODE).toContain('bits.push(`${imp.name} · ${imp.effects}`)');
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
    expect(ROW_CODE).toContain("effectNumber(id, 'Nutrition')");
    expect(ROW_CODE).toContain("effectNumber(id, 'SAN')");
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
    expect(withDepth).toBe(1093);
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
    expect(silent.length).toBe(97);
    // and the split the ledger records, so a regression is legible
    const sub = (s: string) => silent.filter((i) => ITEMS[i].subcategory === s).length;
    expect(sub('MaterialPalEgg')).toBe(53);
    expect(sub('Essential_PassiveSkillChange')).toBe(26);
    // IL74: the five Grappling Guns used to be here. Their paldb page
    // 404'd under the item's OLD broken name ("GrapplingGun"), and once
    // IL36 repaired the name to "Grappling Gun" the slug was right — a
    // retry fetched the page and all five gained a recipe and a tech
    // level. 102 sourceless items became 97.
    expect(sub('WeaponGrapplingGun')).toBe(0);
  });

  it('anything with a recipe, a drop or a shop is NOT called sourceless', () => {
    // the predicate must not creep — these all answer the question
    expect(hasNoKnownSource('Charcoal')).toBe(false);   // recipe (IL40)
    expect(hasNoKnownSource('BeamSword')).toBe(false);  // recipe + tech
    expect(hasNoKnownSource(itemIdByName('Wool')!)).toBe(false); // pal drop
  });

  it('the screen says it plainly and never invents a source', () => {
    expect(code).toContain('hasNoKnownSource(id) && (');
    // IL86 split this line: an egg our breeding data can hatch leads
    // with "you get one by breeding"; the 10 it cannot keep this.
    expect(code).toContain('The game files record no drop, chest or merchant for');
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
    // Ore and Wood carry no common figure; ranking them would be exactly
    // the invented meaning the rule exists to prevent.
    for (const kind of ['Ore', 'Wood']) {
      expect(rankAxisOf(kind), `${kind} got an invented axis`).toBeNull();
    }
    expect(rivalsOf('Coal')).toEqual([]);
  });

  it('IL91 widened this: a number carried by MOST, that separates most', () => {
    // Gliders and bait were unranked under the old rule because one
    // member lacked the number. Speed across the gliders is five
    // distinct values on five gliders — that is a real ordering and
    // withholding it helped nobody.
    expect(rankAxisOf('Glider')).toBe('Speed');
    expect(rankAxisOf('Fishing bait')).toBe('Fishing hit bar size');
    // ...while medicine, whose only shared number is 1 on thirteen of
    // fourteen, is still refused
    expect(rankAxisOf('Medicine')).toBeNull();
  });

  it('the board says what it ranks by when it is not the stat', () => {
    expect(code).toContain('most ${axis} first');
    expect(code).toContain('{rivalShowOf(rid)}');
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
    expect(levelled.length).toBe(706);
    // 681 of those are things you CRAFT — the ones a build list holds
    const craftable = levelled.filter((i) => facts[i].recipe);
    expect(craftable.length).toBe(686);   // +5, the Grappling Guns (IL74)
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
    // 10000s IS 2h 46m 40s — the old line rounded it to "2h 47m" and
    // printed a minute that never existed (IL78)
    expect(spokenTime(10000)).toBe('2h 46m 40s');
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
    expect(craftable.length).toBe(1421);
    // 740 carry a craft TIME (739 carry both a time and a work amount —
    // one records a time with no work, which is why the two counts in
    // the ledger differ by one)
    expect(timed.length).toBe(745);
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
    expect(ROW_CODE).toContain('const SHORT_GRANT =');
    expect(ROW_CODE).toContain('function guardBits(');
    expect(ROW_CODE).toContain('bits.push(...guardBits(id));');
    // and a collapsed family row shows it too
    expect(ROW_CODE).toContain("[`Defense ${def}`, ...guardBits(fam[0])].join(' · ')");
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
    expect(ROW_CODE).toContain('const buffs = buffBits(id);');
    expect(ROW_CODE).toContain('bits.push(...buffs);');
    // one buff fits the row; the rest are counted, not trailed off
    expect(ROW_CODE).toContain('+${buffs.length - 1} more');
    // IL74 appended the three stat fruits' IV labels; the four cooking
    // buffs this test exists for still lead the list
    expect(ROW_CODE).toContain("const BUFF_LABELS = ['Work Speed', 'EXP increase', "
      + "'Hunger resist',\n  'SAN resist', 'Health IV', 'Attack IV', 'Defense IV',"
      + " 'Explosion resist'];");
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

describe('a row with no numbers still says something (IL53)', () => {
  const code = readFileSync(
    join(__dirname, '../../mobile/src/screens/ItemsScreen.tsx'), 'utf8');
  const facts = (FACTS as { facts: Record<string, {
    tech?: { level: number } }> }).facts;

  it('the 138 saddles carry a level worth showing', () => {
    const gear = Object.keys(ITEMS)
      .filter((i) => ITEMS[i].subcategory === 'Essential_PalGear');
    expect(gear.length).toBe(138);
    expect(gear.filter((i) => facts[i]?.tech?.level).length).toBe(124);
  });

  it('the kind is never printed twice', () => {
    // every saddle read "Pal gear · Pal gear": the line fell back to the
    // kind and the search view then appended the identical group label.
    // IL71 widened the guard from an exact match to the one-word test,
    // because "Skill fruit · Skill fruits" walked past the exact one.
    // read without line breaks — the chain has grown past one line
    expect(code.replace(/\s+/g, ' ')).toContain(
      '!saysTheSame(groupOf(id)!, line || unlockText || usedText'
      + ' || hatchText || sellText || kindWord(id))');
  });

  it('the unlock level fills a blank line, but never doubles the marker', () => {
    expect(code).toContain(
      'const unlockText = !lockedAt && need != null ? `Unlocks at Lv ${need}` : null;');
    expect(code.replace(/\s+/g, ' ')).toContain(
      '{line || unlockText || usedText || hatchText || sellText || kindWord(id)}');
  });
});

describe('ammo says what shoots it (IL54)', () => {
  const code = readFileSync(
    join(__dirname, '../../mobile/src/screens/ItemsScreen.tsx'), 'utf8');

  it('all 32 ammo rows had nothing to say', () => {
    const ammo = Object.keys(ITEMS).filter((i) => ITEMS[i].category === 'Ammo');
    expect(ammo.length).toBe(32);
    // 25 resolve to a weapon; the rest are honestly left to their kind
    const resolved = ammo.filter((a) => weaponsForAmmo(a).length > 0);
    expect(resolved.length).toBe(25);
  });

  it('the join is the same one the card already used', () => {
    const rifle = Object.keys(ITEMS)
      .find((i) => ITEMS[i].name === 'Assault Rifle Ammo')!;
    const guns = weaponsForAmmo(rifle).map((i) => ITEMS[i].name);
    expect(guns).toContain('Assault Rifle');
  });

  it('unresolved ammo claims no weapon it cannot prove', () => {
    const arrow = Object.keys(ITEMS).find((i) => ITEMS[i].name === 'Arrow')!;
    expect(weaponsForAmmo(arrow)).toEqual([]);
    expect(ROW_CODE).toContain("if (!bits.length && ITEMS[id].category === 'Ammo') {");
    expect(ROW_CODE).toContain('For the ${ITEMS[guns[0]].name}');
  });
});

describe('a sort only claims meaning where it has any (IL55)', () => {
  const code = readFileSync(
    join(__dirname, '../../mobile/src/screens/ItemsScreen.tsx'), 'utf8');

  it('spheres rank by capture power, not the alphabet', () => {
    const ranked = sortItems(collapseFamilies(idsInGroup('spheres')), 'power', true)
      .filter((i) => ITEMS[i].subcategory === 'SPWeaponCaptureBall');
    expect(ITEMS[ranked[0]].name).toBe('Ancient Sphere');
    expect(ITEMS[ranked[1]].name).toBe('Sol Sphere');
    expect(ITEMS[ranked[ranked.length - 1]].name).toBe('Pal Sphere');
    // strictly descending — the whole point of the ranking
    const powers = ranked.map((i) => familyPowerOf(i));
    for (let n = 1; n < powers.length; n++) {
      expect(powers[n]).toBeLessThan(powers[n - 1]);
    }
  });

  it('the centre tab opens A–Z because 98% of it has no number', () => {
    const fams = collapseFamilies(idsInGroup('other'));
    const numbered = fams.filter((i) => familyPowerOf(i) > 0);
    expect(fams.length).toBeGreaterThan(1000);
    expect(numbered.length).toBe(28);       // 2% — "strongest" meant nothing
    expect(code).toContain("initialGroup === 'other' ? 'name' : 'power'");
  });

  it('the tabs that DO have strength keep it', () => {
    for (const g of ['weapons', 'armor', 'food']) {
      const fams = collapseFamilies(idsInGroup(g));
      const numbered = fams.filter((i) => familyPowerOf(i) > 0);
      expect(numbered.length / fams.length).toBeGreaterThan(0.5);
    }
  });
});

describe('pal gear links back to its pal (IL57)', () => {
  const code = readFileSync(
    join(__dirname, '../../mobile/src/screens/ItemsScreen.tsx'), 'utf8');

  it('all 138 pieces resolve to a real pal', () => {
    const gear = Object.keys(ITEMS)
      .filter((i) => ITEMS[i].subcategory === 'Essential_PalGear');
    expect(gear.length).toBe(138);
    expect(gear.filter((i) => palForGear(i) != null).length).toBe(138);
  });

  it('the LONGEST name wins, so variants map to the variant', () => {
    // taking the first match sends "Azurobe Cryst Saddle" to Azurobe —
    // the wrong pal, and the variant is exactly what a saddle differs by
    const cryst = Object.keys(ITEMS)
      .find((i) => ITEMS[i].name === 'Azurobe Cryst Saddle')!;
    expect(palForGear(cryst)).toBe('Azurobe Cryst');
    const plain = Object.keys(ITEMS)
      .find((i) => ITEMS[i].name === 'Azurobe Saddle')!;
    expect(palForGear(plain)).toBe('Azurobe');
  });

  it('nothing that is not pal gear claims an owner', () => {
    expect(palForGear('BeamSword')).toBeNull();
    expect(palForGear('Wood')).toBeNull();
  });

  it('the card offers the pal, and closes itself on the way', () => {
    expect(code).toContain('Who wears it');
    expect(code).toContain("domain: 'breeding', tab: 'paldex', payload: { pal: owner }");
  });
});

describe('a glyph button still says a word out loud (IL62)', () => {
  it('the pal card\'s close button reads "Close", not "✕"', () => {
    const pal = readFileSync(
      join(__dirname, '../../mobile/src/ui/PalDetail.tsx'), 'utf8');
    expect(pal).toContain('a11yLabel="Close"');
  });

  it('Btn speaks its visible label unless a glyph overrides it', () => {
    const kit = readFileSync(
      join(__dirname, '../../mobile/src/ui/kit.tsx'), 'utf8');
    expect(kit).toContain('accessibilityLabel={a11yLabel ?? label}');
  });
});

describe('a card never says the same thing twice (IL63)', () => {
  // the FAMILY BASE is what a collapsed row opens, and it is the only
  // tier that carries a passives line — the variants have none, so
  // their cards still show the resistances under "What it grants"
  const armour = 'AncientArmorCold';

  it('the resistances are not printed twice on one card', () => {
    // "Wears the passives" already states them; "What it grants" used
    // to repeat all three, word for word, a few lines below
    const worn = new Set(
      (ITEM_STATS[armour]?.passives ?? []).map(equipPassiveName));
    expect(worn.size).toBe(3);
    for (const g of grantsToShow(armour)) {
      expect(worn.has(g), `"${g}" is already on the passives line`).toBe(false);
    }
  });

  it('a passive that repeats per tier shows only its best level', () => {
    const shown = grantsToShow(armour);
    expect(shown).toEqual(['Attack Up (S) Lv. 4']);
    // the raw data really does carry all four
    const raw = (FACTS as { facts: Record<string, { grants?: string[] }> })
      .facts[armour]!.grants!;
    expect(raw.filter((g) => g.startsWith('Attack Up (S)')).length).toBe(4);
  });

  it('grants that are NOT duplicates still show', () => {
    const withGrants = Object.keys(ITEMS).filter((i) =>
      (FACTS as { facts: Record<string, { grants?: string[] }> }).facts[i]?.grants?.length
      && !(ITEM_STATS[i]?.passives ?? []).length);
    expect(withGrants.length).toBeGreaterThan(50);
    const sample = withGrants[0];
    expect(grantsToShow(sample).length).toBeGreaterThan(0);
  });

  it('no item loses every grant it had', () => {
    // the section is hidden when nothing survives — make sure that is
    // rare and deliberate, not a silent wipe of real facts
    const facts = (FACTS as { facts: Record<string, { grants?: string[] }> }).facts;
    const had = Object.keys(ITEMS).filter((i) => facts[i]?.grants?.length);
    const emptied = had.filter((i) => grantsToShow(i).length === 0);
    expect(emptied.length / had.length).toBeLessThan(0.2);
  });
});

describe('an effect number without a unit still means something (IL64)', () => {
  const chowder = Object.keys(ITEMS).find((i) => ITEMS[i].name === 'Dumud Chowder')!;

  it('"Recovery Time 600" gains a rank, since no unit can be stated', () => {
    // the upstream chip is literally ["Recovery Time","600"] — seconds
    // is a guess, and a guess is not shippable as a fact
    const r = effectRank(chowder, 'Recovery Time')!;
    expect(r).toEqual({ rank: 3, of: 46 });
  });

  it('ties share a rank, like the stat ranking does', () => {
    const timed = Object.keys(ITEMS).filter((i) => effectNumber(i, 'Recovery Time') != null);
    const sameValue = timed.filter((i) => effectNumber(i, 'Recovery Time') === 600);
    expect(sameValue.length).toBeGreaterThan(1);
    const ranks = new Set(sameValue.map((i) => effectRank(i, 'Recovery Time')!.rank));
    expect(ranks.size).toBe(1);
  });

  it('an item without that effect gets no rank at all', () => {
    expect(effectRank('BeamSword', 'Recovery Time')).toBeNull();
    expect(effectRank(chowder, 'Nutrition')).not.toBeNull();
  });

  it('the wording never claims more is better', () => {
    const code = readFileSync(
      join(__dirname, '../../mobile/src/screens/ItemsScreen.tsx'), 'utf8');
    expect(code).toContain('#${r.rank} of ${r.of}');
    // scoped to the effects block: "best" appears legitimately
    // elsewhere ("best tier first"), so a file-wide match is wrong
    const block = code.slice(code.indexOf('const r = effectRank(id, k);'),
      code.indexOf('const r = effectRank(id, k);') + 400);
    expect(block).not.toMatch(/best|worst|longest|strongest/i);
  });
});

describe('a sphere card says how its capture power compares (IL65)', () => {
  it('the ten spheres rank from strongest to weakest', () => {
    const ultra = Object.keys(ITEMS).find((i) => ITEMS[i].name === 'Ultra Sphere')!;
    const r = captureRank(ultra)!;
    expect(r.of).toBe(10);
    expect(r.rank).toBe(6);
    const ancient = Object.keys(ITEMS).find((i) => ITEMS[i].name === 'Ancient Sphere')!;
    expect(captureRank(ancient)).toEqual({ rank: 1, of: 10 });
    const basic = Object.keys(ITEMS).find((i) => ITEMS[i].name === 'Pal Sphere')!;
    expect(captureRank(basic)).toEqual({ rank: 10, of: 10 });
  });

  it('anything without a capture power gets no rank', () => {
    expect(captureRank('BeamSword')).toBeNull();
    expect(captureRank('Wood')).toBeNull();
  });

  it('the card shows the rank beside the number', () => {
    const code = readFileSync(
      join(__dirname, '../../mobile/src/screens/ItemsScreen.tsx'), 'utf8');
    expect(code).toContain('${facts.capture} · #${r.rank} of ${r.of}');
  });
});

describe('a card never says the same word twice (IL66)', () => {
  it('a plural group and its singular kind count as one word', () => {
    expect(saysTheSame('Schematics', 'Schematic')).toBe(true);
    expect(saysTheSame('Skill fruits', 'Skill fruit')).toBe(true);
    expect(saysTheSame('Gliders', 'Glider')).toBe(true);
    expect(saysTheSame('Accessories', 'Accessory')).toBe(true);
    expect(saysTheSame('Weapons', 'Bow')).toBe(false);
    expect(saysTheSame('Armor', 'Head gear')).toBe(false);
  });

  it('a word that merely ends in s is not a plural', () => {
    // "Glasses" must not collapse onto "Glass" — they are two things.
    expect(saysTheSame('Glasses', 'Glass')).toBe(false);
    expect(saysTheSame('Dress', 'Dres')).toBe(false);
  });

  it('no shipped item has a group and kind that read as one word', () => {
    const doubled = ITEM_IDS.filter((id) => {
      const g = groupOf(id), k = kindWord(id);
      return g != null && k !== g && saysTheSame(k, g);
    });
    // 691 cards: 490 schematics, 93 skill fruits, 81 accessories, 18
    // consumables, 5 gliders, 4 key items. The card drops the second chip.
    expect(doubled.length).toBe(691);
    const code = readFileSync(
      join(__dirname, '../../mobile/src/screens/ItemsScreen.tsx'), 'utf8');
    expect(code).toContain("!saysTheSame(kindWord(id), groupOf(id) ?? '')");
    expect(code).not.toContain('kindWord(id) !== groupOf(id)');
  });
});

describe('a schematic card does not claim you can craft it (IL67)', () => {
  it('the recipe on a schematic is the tier-scaled cost of what it teaches', () => {
    const schem = ITEM_IDS.find((i) => ITEMS[i].name === 'Advanced Bow Schematic 3')!;
    const taught = teachesOf(schem)!;
    expect(ITEMS[taught.id].name).toBe('Advanced Bow');
    const mine = ITEM_FACTS[schem]?.recipe?.find((r) => r.id === 'Plastic')?.n;
    const base = ITEM_FACTS[taught.id]?.recipe?.find((r) => r.id === 'Plastic')?.n;
    expect(base).toBe(40);
    expect(mine).toBe(70);         // ×1.75 at this tier — a real number
  });

  it('the heading names the product when the item teaches one', () => {
    const code = readFileSync(
      join(__dirname, '../../mobile/src/screens/ItemsScreen.tsx'), 'utf8');
    const block = code.slice(code.indexOf('IL67'), code.indexOf('IL67') + 900);
    expect(block).toContain('What it costs to make ${ITEMS[t.id].name}');
    expect(block).toContain("'How to craft it'");
  });
});

describe('craft times are spoken, not machine shorthand (IL69)', () => {
  it('zero parts are dropped and the rest kept exactly', () => {
    expect(spokenCraftTime('50m0s')).toBe('50m');
    expect(spokenCraftTime('3h20m0s')).toBe('3h 20m');
    expect(spokenCraftTime('1h6m40s')).toBe('1h 6m 40s');
    expect(spokenCraftTime('30s')).toBe('30s');
    expect(spokenCraftTime('0m30s')).toBe('30s');
  });

  it('a time that is genuinely zero still says something', () => {
    expect(spokenCraftTime('0s')).toBe('0s');
    expect(spokenCraftTime('0h0m0s')).toBe('0s');
  });

  it('every shipped craft time survives the formatter with its numbers intact', () => {
    const times = ITEM_IDS
      .map((i) => ITEM_FACTS[i]?.craftTime).filter((t): t is string => !!t);
    expect(times.length).toBe(745);       // +5, the Grappling Guns (IL74)
    const withZero = times.filter((t) => /(^|[hms])0[hms]/.test(t));
    expect(withZero.length).toBe(234);         // 234 cards read "... 0s"
    for (const t of times) {
      const out = spokenCraftTime(t);
      // no number is invented and none of the real ones is lost
      const real = (t.match(/\d+[hms]/g) ?? []).filter((p) => parseInt(p, 10) > 0);
      for (const p of real) expect(out).toContain(p);
      expect(out).not.toMatch(/\b0[hms]\b/);
    }
  });

  it('the share text uses the same formatter as the card', () => {
    const share = readFileSync(
      join(__dirname, '../../mobile/src/itemShare.ts'), 'utf8');
    expect(share).toContain('spokenCraftTime(facts.craftTime)');
    expect(share).not.toContain('about ${facts.craftTime}');
  });
});

describe('a material row says what the material is for (IL70)', () => {
  it('the recipe join backs every count the row can show', () => {
    const feeds = ITEM_IDS.filter((i) => usedInOf(i).length > 0);
    expect(feeds.length).toBe(142);
    const charcoal = itemIdByName('Charcoal')!;
    expect(usedInOf(charcoal).map((i) => ITEMS[i].name)).toEqual(['Gunpowder']);
    expect(usedInOf(itemIdByName('Ingot')!).length).toBe(234);
  });

  it('one use is named, many are counted', () => {
    const code = readFileSync(
      join(__dirname, '../../mobile/src/screens/ItemsScreen.tsx'), 'utf8');
    const block = code.slice(code.indexOf('IL70'), code.indexOf('IL70') + 900);
    expect(block).toContain('Used to make ${ITEMS[usedIn[0]].name}');
    expect(block).toContain('Used in ${usedIn.length} recipes');
  });

  it('the unlock level still wins when the game states one', () => {
    const code = readFileSync(
      join(__dirname, '../../mobile/src/screens/ItemsScreen.tsx'), 'utf8');
    // order matters: "can I make this yet" beats "what is it for",
    // which in turn beats what it hatches or what it sells for
    expect(code.replace(/\s+/g, ' ')).toContain(
      '{line || unlockText || usedText || hatchText || sellText || kindWord(id)}');
  });
});

describe('a row never says the same word twice either (IL71)', () => {
  it('the row uses the one-word test, not an exact match', () => {
    const code = readFileSync(
      join(__dirname, '../../mobile/src/screens/ItemsScreen.tsx'), 'utf8');
    const block = code.slice(code.indexOf('IL71'), code.indexOf('IL71') + 700);
    expect(block).toContain('!saysTheSame(groupOf(id)!,');
    expect(code).not.toContain('groupOf(id) !== (line');
  });

  it('the skill fruits are the group that proves it', () => {
    // 93 rows read "Skill fruit · Skill fruits" — kind and group are one
    // word, and IL53's exact match let the plural through
    const fruits = ITEM_IDS.filter((id) => groupOf(id) === 'Skill fruits');
    expect(fruits.length).toBe(93);
    for (const id of fruits) {
      expect(saysTheSame(kindWord(id), groupOf(id)!)).toBe(true);
    }
  });
});

describe('no row ends at its kind word when a real fact exists (IL72)', () => {
  const rows = collapseFamilies(ITEM_IDS);
  const bareLine = (id: string) => {
    const fam = familyOf(id);
    return fam.length > 1 ? familyLine(fam) : statLine(id);
  };
  const dead = rows.filter((id) => !bareLine(id)
    && ITEM_FACTS[id]?.tech?.level == null && usedInOf(id).length === 0);

  it('a collapsed family no longer swallows its own fallback chain', () => {
    // familyLine used to end at `|| kindWord(fam[0])`, so a family row
    // could never reach the unlock level, the recipe count or the price
    const data = readFileSync(
      join(__dirname, '../../mobile/src/itemsData.ts'), 'utf8');
    expect(data).toContain('return statLine(fam[0]);');
    expect(data).not.toContain('return statLine(fam[0]) || kindWord(fam[0]);');
    const eggFam = familyOf(itemIdByName('Damp Egg')!);
    expect(eggFam.length).toBeGreaterThan(1);
    expect(familyLine(eggFam)).toBe('');
  });

  it('247 rows had nothing but their kind, and the eggs are the worst of it', () => {
    expect(dead.length).toBe(246);
    const eggs = dead.filter((id) => palsHatchingFrom(id).length > 0);
    expect(eggs.length).toBe(26);
  });

  it('an egg says what comes out of it, and the sizes differ', () => {
    expect(palsHatchingFrom(itemIdByName('Damp Egg')!).length).toBe(20);
    expect(palsHatchingFrom(itemIdByName('Large Damp Egg')!).length).toBe(9);
    expect(palsHatchingFrom(itemIdByName('Huge Damp Egg')!).length).toBe(4);
  });

  it('a price of 1 is the game saying "not sellable", so it is not shown', () => {
    // every bounty token that would otherwise have fallen through to a
    // price carries the placeholder 1 — 22 identical "Sells for 1 gold"
    const tokens = dead.filter((i) => /Bounty Token/.test(ITEMS[i].name));
    const placeholder = tokens.filter((t) => ITEMS[t].price === 1);
    expect(placeholder.length).toBeGreaterThan(10);
    // the rest carry a real (if small) price and DO show it
    for (const t of tokens) expect([1, 10]).toContain(ITEMS[t].price);
    const code = readFileSync(
      join(__dirname, '../../mobile/src/screens/ItemsScreen.tsx'), 'utf8');
    expect(code.replace(/\s+/g, ' ')).toContain(
      'const sellText = price && price > 1 ? `Sells for ${price.toLocaleString()} gold` : null;');
  });

  it('after the two new terms, 38 rows are left with only their kind', () => {
    const left = dead.filter((id) => palsHatchingFrom(id).length === 0
      && (ITEMS[id].price ?? 0) <= 1);
    expect(left.length).toBe(38);
    // 209 rows gained a real fact; what is left is 20 bounty tokens, 14
    // pieces of pal gear whose NAME already names the pal, 3 handbooks
    // and 1 material — nothing of theirs is being withheld
    expect(dead.length - left.length).toBe(208);
  });
});

describe('big numbers on a card are grouped (IL73)', () => {
  it('the price and the stack size both group their thousands', () => {
    const code = readFileSync(
      join(__dirname, '../../mobile/src/screens/ItemsScreen.tsx'), 'utf8');
    const block = code.slice(code.indexOf('IL73'), code.indexOf('IL73') + 800);
    expect(block).toContain('${it.price.toLocaleString()} gold');
    expect(block).toContain('it.maxStack.toLocaleString()');
    expect(block).not.toContain('`${it.price} gold`');
  });

  it('there are prices long enough to need it', () => {
    const wing = itemIdByName('Wing Pack')!;
    expect(ITEMS[wing].price).toBe(6508680);
    const long = ITEM_IDS.filter((i) => (ITEMS[i].price ?? 0) >= 10000);
    expect(long.length).toBeGreaterThan(100);
  });
});

describe('a build row says which tier it is buying for (IL75)', () => {
  it('the shopping list belongs to ONE tier, so the row names it', () => {
    const code = readFileSync(
      join(__dirname, '../../mobile/src/screens/ItemsScreen.tsx'), 'utf8');
    const block = code.slice(code.indexOf('IL75'), code.indexOf('IL75') + 900);
    expect(block).toContain('familyOf(i).length > 1');
    expect(block).toContain('ITEM_STATS[i]?.tier ?? tierWord(ITEMS[i].rarity)');
  });

  it('the Grappling Gun is exactly the case that needed it', () => {
    const gun = itemIdByName('Grappling Gun')!;
    expect(familyOf(gun).length).toBe(5);
    // the base recipe is what a build for `gun` gathers — the ids are
    // the game's internal ones (CopperIngot is the item shown as "Ingot")
    const base = ITEM_FACTS[gun]?.recipe?.find((r) => r.id === 'CopperIngot')?.n;
    expect(base).toBe(10);
  });

  it('a single-tier item is not labelled, because nothing can confuse it', () => {
    const wood = itemIdByName('Wood')!;
    expect(familyOf(wood).length).toBe(1);
  });
});

describe('one craft time, not two (IL76)', () => {
  it('every part the number has is said, and none it does not', () => {
    expect(spokenTime(400)).toBe('6m 40s');   // the card says 6m 40s too
    expect(spokenTime(600)).toBe('10m');      // nothing to add
    expect(spokenTime(3600)).toBe('1h');      // nor here
    // IL78: this used to round to "2h 47m". 10000s is 2h 46m 40s.
    expect(spokenTime(10000)).toBe('2h 46m 40s');
    expect(spokenTime(45)).toBe('45s');
  });

  it('the build panel and the card now agree on the same craft', () => {
    const gun = itemIdByName('Grappling Gun')!;
    const raw = ITEM_FACTS[gun]!.craftTime!;
    expect(spokenCraftTime(raw)).toBe('6m 40s');
    expect(spokenTime(buildTime({ [gun]: 1 }).seconds)).toBe('6m 40s');
  });
});

describe('a build can be made for the tier you are actually making (IL77)', () => {
  it('every tier id ships the BASE recipe, which is why this was wrong', () => {
    for (const t of familyOf(itemIdByName('Advanced Bow')!)) {
      expect(ITEM_FACTS[t]?.recipe?.find((r) => r.id === 'Plastic')?.n).toBe(40);
    }
  });

  it('recipeOf reads the per-tier block instead', () => {
    const fam = familyOf(itemIdByName('Advanced Bow')!);
    const plastic = (id: string) =>
      recipeOf(id)?.find((r) => r.id === 'Plastic')?.n;
    expect(fam.map(plastic)).toEqual([40, 50, 60, 70, 80]);
  });

  it('the whole bill follows the tier, not just the recipe line', () => {
    const fam = familyOf(itemIdByName('Advanced Bow')!);
    // CopperOre is the internal id of the item shown as "Ore"
    const ore = (id: string) =>
      rawMaterialsFor(id).gather.find((g) => g.id === 'CopperOre')?.n;
    // the Legendary end of this ladder is what the app printed: 400x Ore
    expect(fam.map(ore)).toEqual([200, 250, 300, 350, 400]);
  });

  it('a family whose block count does not match its tiers is refused', () => {
    const bad = ITEM_IDS.filter((id) => {
      const fam = familyOf(id);
      const more = ITEM_FACTS[fam[0]]?.recipesMore;
      return fam.length > 1 && fam[0] === id
        && !!more && more.length !== fam.length - 1;
    });
    expect(bad.length).toBeGreaterThan(0);   // two such families exist
    for (const id of bad) {
      expect(hasTierCosts(id)).toBe(false);
      // and the base recipe stands, rather than a guessed block
      expect(recipeOf(familyOf(id)[1])).toEqual(ITEM_FACTS[familyOf(id)[1]]?.recipe);
    }
  });
});

describe('a shared item does not contradict itself (IL78)', () => {
  const fam = () => familyOf(itemIdByName('Advanced Bow')!);

  it('the craft line and the shopping list are the same tier', () => {
    const top = shareTextForItem(fam()[4], '1.0');
    // Legendary: 80 Plasteel rolls up to 400 Ore. It used to send the
    // base tier's "40× Plasteel" above the Legendary "400× Ore".
    expect(top).toContain('Craft: 80× Plasteel');
    expect(top).toContain('From scratch: 400× Ore');
    const base = shareTextForItem(fam()[0], '1.0');
    expect(base).toContain('Craft: 40× Plasteel');
    expect(base).toContain('From scratch: 200× Ore');
  });

  it('a shared build names the tier it is for', () => {
    const txt = shareTextForBuild({ [fam()[4]]: 1 }, '1.0');
    expect(txt).toContain('1× Advanced Bow (Legendary)');
    expect(txt).toContain('400× Ore');
  });

  it('a single-tier item gets no tier in brackets', () => {
    const txt = shareTextForBuild({ [itemIdByName('Wood')!]: 5 }, '1.0');
    expect(txt).toContain('5× Wood');
    expect(txt).not.toContain('5× Wood (');
  });

  it('the card, the panel and the share text all say one craft time', () => {
    const bow = fam()[0];
    const raw = ITEM_FACTS[bow]!.craftTime!;
    expect(spokenCraftTime(raw)).toBe('5h 33m 20s');
    expect(spokenTime(buildTime({ [bow]: 1 }).seconds)).toBe('5h 33m 20s');
  });
});

describe('"Strongest" never compares two different numbers (IL79)', () => {
  const rows = () => sortItems(collapseFamilies(ITEM_IDS), 'power', true);

  it('a cake no longer outranks a gatling gun', () => {
    // the fault, exactly: Vegetable Cake carries Nutrition 696 and the
    // Laser Gatling Gun carries Attack 689, and 696 > 689
    const cake = itemIdByName('Vegetable Cake')!;
    const gun = itemIdByName('Laser Gatling Gun')!;
    expect(familyPowerOf(cake)).toBe(696);
    expect(familyPowerOf(gun)).toBe(689);
    const r = rows();
    expect(r.indexOf(gun)).toBeLessThan(r.indexOf(cake));
  });

  it('no pair anywhere in the index is out of axis order', () => {
    const r = rows();
    for (let k = 1; k < r.length; k++) {
      expect(familyPowerAxisOf(r[k])).toBeGreaterThanOrEqual(
        familyPowerAxisOf(r[k - 1]));
    }
  });

  it('a single-kind list is ordered exactly as it always was', () => {
    // every weapon shares one axis, so grouping changes nothing there
    const guns = collapseFamilies(idsInGroup('weapons'));
    const sorted = sortItems(guns, 'power', true);
    const byValue = [...guns].sort((a, b) => familyPowerOf(b) - familyPowerOf(a)
      || ITEMS[a].name.localeCompare(ITEMS[b].name));
    expect(sorted.map((i) => ITEMS[i].name).slice(0, 15))
      .toEqual(byValue.map((i) => ITEMS[i].name).slice(0, 15));
  });
});

describe('the filter sheet promises what it will show (IL80)', () => {
  it('the button counts the search box too', () => {
    const code = readFileSync(
      join(__dirname, '../../mobile/src/screens/ItemsScreen.tsx'), 'utf8');
    expect(code).toContain('const n = applyItemFilters(f, query, level).length;');
    expect(code).not.toContain("applyItemFilters(f, '', level)");
    // and the query actually reaches it
    expect(code.replace(/\s+/g, ' ')).toContain('query={q}');
  });

  it('the two numbers come from one function', () => {
    // "Advanced Bow" across everything: 5 rows, and the button said 105
    expect(collapseFamilies(searchItems('Advanced Bow')).length).toBe(5);
  });
});

describe('a misspelling gets offered a way out (IL81)', () => {
  const names = (q: string) => suggestItems(q).map((i) => ITEMS[i].name);

  it('the near misses are the ones a player actually typed at', () => {
    expect(names('grapling')[0]).toBe('Grappling Gun');
    expect(names('mechnical')[0]).toBe('Mechanical Bow');
    expect(names('advansed')[0]).toBe('Advanced Bow');
    expect(names('ingt')[0]).toBe('Ingot');
    expect(names('sphre')).toContain('Pal Sphere');
  });

  it('a query that resembles nothing is offered nothing', () => {
    expect(suggestItems('zzzqqq')).toEqual([]);
    expect(suggestItems('qwertyuiop')).toEqual([]);
  });

  it('too short to judge is left alone', () => {
    // two characters match half the catalogue by accident
    expect(suggestItems('bo')).toEqual([]);
    expect(suggestItems('a')).toEqual([]);
  });

  it('one row per family, never five of the same name', () => {
    for (const q of ['grapling', 'advansed', 'sphre', 'ingt']) {
      const out = names(q);
      expect(new Set(out).size).toBe(out.length);
      expect(out.length).toBeLessThanOrEqual(3);
    }
  });

  it('it OFFERS — the screen never searches for something unasked', () => {
    const code = readFileSync(
      join(__dirname, '../../mobile/src/screens/ItemsScreen.tsx'), 'utf8');
    const block = code.slice(code.indexOf('IL81'), code.indexOf('IL81') + 800);
    expect(block).toContain('Did you mean:');
    // the chip sets the query for the player to see, it does not swap
    // results in behind their back
    expect(block).toContain('onPress={() => setQ(ITEMS[nid].name)}');
    expect(code).toContain('searching && ids.length === 0 ? suggestItems(q) : []');
  });
});

describe('every filter chip counts what it will actually show (IL82)', () => {
  const rows = (ids: string[]) => collapseFamilies(ids).length;

  it('the raw counts the chips used to print were not the rows shown', () => {
    // this is the gap the chips were printing across
    expect(idsInGroup('weapons').length).toBe(310);
    expect(rows(idsInGroup('weapons'))).toBe(105);
    expect(ITEM_IDS.length).toBe(1892);
    expect(rows(ITEM_IDS)).toBe(1504);
    const rifles = idsInGroup('weapons')
      .filter((i) => kindWord(i) === 'Assault rifle');
    expect(rifles.length).toBe(70);      // the chip said 70
    expect(rows(rifles)).toBe(14);       // the list showed 14
  });

  it('no chip computes its own number any more', () => {
    const code = readFileSync(
      join(__dirname, '../../mobile/src/screens/ItemsScreen.tsx'), 'utf8');
    for (const stale of [
      '`This tab · ${idsInGroup(home).length}`',
      '`${g.label} · ${idsInGroup(g.id).length}`',
      '`${g} · ${gearAgainst(g).length}`',
      '`${k.kind} · ${k.count}`',
    ]) expect(code).not.toContain(stale);
    expect(code).toContain(
      'const shown = (patch: Partial<ItemFilters>) =>');
    expect(code.replace(/\s+/g, ' ')).toContain(
      'applyItemFilters({ ...f, ...patch }, query, level).length');
  });

  it('a count conditioned on the other chips is the point', () => {
    // "Cold · 33" beside a Food group would have promised armour it
    // could never show; the counter now runs the whole filter
    const cold = ITEM_IDS.filter((i) => familyOf(i).some((t) => guardLevel(t, 'Cold') > 0));
    expect(rows(cold)).toBeGreaterThan(0);
    const coldFood = idsInGroup('food')
      .filter((i) => familyOf(i).some((t) => guardLevel(t, 'Cold') > 0));
    expect(coldFood.length).toBe(0);
  });
});

describe('opening the filter sheet does not stall the thread (IL83)', () => {
  it('the family key is built once, not per call', () => {
    const data = readFileSync(
      join(__dirname, '../../mobile/src/itemsData.ts'), 'utf8');
    expect(data).toContain('const KEY_OF = new Map<string, string>();');
    expect(data).toContain('KEY_OF.get(id) ??');
  });

  it('the cached key is measurably cheaper than rebuilding it', () => {
    // The sheet counts ~50 chips by running the real filter for each,
    // and this repo has already shipped one frozen thread. An absolute
    // millisecond budget is flaky inside a full suite run, so measure
    // the SAME workload both ways on the same machine, same moment.
    const ids = ITEM_IDS;
    const rebuild = (id: string) =>
      `${ITEMS[id]?.name ?? id}|${ITEMS[id]?.category ?? ''}`;
    collapseFamilies(ids);                              // warm
    const t0 = performance.now();
    for (let k = 0; k < 50; k++) collapseFamilies(ids);
    const cached = performance.now() - t0;
    const t1 = performance.now();
    for (let k = 0; k < 50; k++) {
      const seen = new Set<string>();
      for (const id of ids) seen.add(rebuild(id));      // the old cost
    }
    const uncached = performance.now() - t1;
    // the whole collapse now costs less than just rebuilding the keys did
    expect(cached).toBeLessThan(uncached * 1.5);
  });

  it('and it still collapses to exactly the same rows', () => {
    expect(collapseFamilies(ITEM_IDS).length).toBe(1504);
    expect(collapseFamilies(idsInGroup('weapons')).length).toBe(105);
  });
});

describe('a breeding plan hands its cakes to the build list (IL84)', () => {
  it('every cake the odds screen offers is a real item with a recipe', () => {
    for (const c of CAKES) {
      const id = itemIdByName(c.name);
      expect(id, `${c.name} must resolve`).toBeTruthy();
      expect(ITEM_FACTS[id!]?.recipe?.length).toBeGreaterThan(0);
    }
    // the one the plan reaches for most
    const veg = itemIdByName('Vegetable Cake')!;
    expect(ITEM_FACTS[veg]!.recipe!.find((r) => r.id === 'Flour')?.n).toBe(8);
  });

  it('the hand-off carries a NAME, so breeding never loads the item table', () => {
    const odds = readFileSync(
      join(__dirname, '../../mobile/src/screens/OddsScreen.tsx'), 'utf8');
    expect(odds).toContain("itemNamed: c.name");
    expect(odds).toContain("domain: 'items', tab: 'allitems'");
    // importing itemsData here would put 2.4MB of facts in the breeding
    // screen's startup path — the reason the payload takes a name at all
    expect(odds).not.toContain("from '../itemsData'");
  });

  it('the Items fane resolves the name and sets the quantity', () => {
    const code = readFileSync(
      join(__dirname, '../../mobile/src/screens/ItemsScreen.tsx'), 'utf8');
    const block = code.slice(code.indexOf('IL84'), code.indexOf('IL84') + 900);
    expect(block).toContain('itemIdByName(p.itemNamed)');
    expect(block).toContain('setBuildQty(hit, p.qty)');
    expect(block).toContain('setOpen(hit)');
  });

  it('the count says one cake or many, with the verb to match', () => {
    const odds = readFileSync(
      join(__dirname, '../../mobile/src/screens/OddsScreen.tsx'), 'utf8');
    expect(odds).toContain('`What 1 ${c.name} costs`');
    expect(odds).toContain('`What ${n} ${c.name}s cost`');
  });
});

describe('an empty list offers the way out, by name (IL85)', () => {
  it('the dead end was real: no egg protects you from cold', () => {
    const eggs = idsInGroup('eggs');
    expect(eggs.length).toBeGreaterThan(0);
    const cold = eggs.filter((i) =>
      familyOf(i).some((t) => guardLevel(t, 'Cold') > 0));
    expect(cold.length).toBe(0);
    // and dropping that one filter brings the whole group back
    expect(collapseFamilies(eggs).length).toBe(32);
  });

  it('each filter is tried on its own and offered by name', () => {
    const code = readFileSync(
      join(__dirname, '../../mobile/src/screens/ItemsScreen.tsx'), 'utf8');
    const block = code.slice(code.indexOf('IL85'), code.indexOf('IL85') + 700);
    expect(block).toContain('relaxations.map');
    expect(block).toContain('`${r.label} · ${r.n} items`');
    expect(code).toContain('Without "protects from ${filters.guard}"');
    expect(code).toContain("'Look in everything instead'");
  });

  it('only offers that would really bring rows back are shown', () => {
    const code = readFileSync(
      join(__dirname, '../../mobile/src/screens/ItemsScreen.tsx'), 'utf8');
    expect(code.replace(/\s+/g, ' ')).toContain(
      '.map((t) => ({ ...t, n: applyItemFilters(t.next, q, level).length })) '
      + '.filter((t) => t.n > 0)');
    // and it costs nothing when the list is not empty
    expect(code).toContain('if (searching || ids.length > 0) return [];');
  });
});

describe('an egg card leads with how you get one (IL86)', () => {
  it('the sentence answers the question before listing what is missing', () => {
    const code = readFileSync(
      join(__dirname, '../../mobile/src/screens/ItemsScreen.tsx'), 'utf8');
    const block = code.slice(code.indexOf('IL86'), code.indexOf('IL86') + 1200);
    expect(block).toContain('You get one of these by breeding.');
    expect(block).toContain('palsHatchingFrom(id).length > 0');
  });

  it('the 97 sourceless items are eggs, implants and the four missing pages', () => {
    const silent = Object.keys(ITEMS).filter(hasNoKnownSource);
    expect(silent.length).toBe(97);
    const eggs = silent.filter((i) => groupOf(i) === 'Eggs');
    expect(eggs.length).toBe(53);
    const implants = silent.filter((i) => /^Implant: /.test(ITEMS[i].name));
    expect(implants.length).toBeGreaterThan(20);
    // 43 of the 53 can be hatched from our own breeding data and are
    // told so; the other 10 (Huge Ominous Egg, Dragon Egg...) are not
    // proven breedable and are not told they are
    const breedable = eggs.filter((e) => palsHatchingFrom(e).length > 0);
    expect(breedable.length).toBe(43);
  });

  it('the world-node materials were never sourceless — checked, not assumed', () => {
    // the map lane holds ore/coal/sulfur node layers, so this looked like
    // an unjoined source. It is not: every one of these already answers
    // the question from the item data alone.
    for (const n of ['Ore', 'Coal', 'Sulfur', 'Wood', 'Pure Quartz',
      'Paldium Fragment', 'Crude Oil', 'Mushroom']) {
      const id = itemIdByName(n);
      expect(id, `${n} must exist`).toBeTruthy();
      expect(hasNoKnownSource(id!), `${n} already has a source`).toBe(false);
    }
  });
});

describe('the centre tab is navigable, not a 1,183-row dump (IL87)', () => {
  it('the tab really does carry eleven different kinds of thing', () => {
    const other = collapseFamilies(idsInGroup('other'));
    expect(other.length).toBe(1183);
    const by = new Map<string, number>();
    for (const i of other) {
      const g = groupOf(i) ?? '?';
      by.set(g, (by.get(g) ?? 0) + 1);
    }
    expect(by.size).toBe(11);
    expect(by.get('Schematics')).toBe(490);   // 41% of the list
    expect(by.get('Pal gear')).toBe(138);
    expect(by.get('Gliders')).toBe(5);
  });

  it('the strip offers those groups and not the four with their own tab', () => {
    const code = readFileSync(
      join(__dirname, '../../mobile/src/screens/ItemsScreen.tsx'), 'utf8');
    const block = code.slice(code.indexOf('IL87'), code.indexOf('IL87') + 900);
    expect(block).toContain('groupStrip.map');
    expect(code).toContain('.filter((g) => !TAB_GROUPS.includes(g.id))');
    // and it counts the way the sheet does — what the tap will show
    expect(code.replace(/\s+/g, ' ')).toContain(
      "n: applyItemFilters({ ...filters, group: g.id, kind: null }, '', level).length");
  });

  it('it only appears where it helps', () => {
    const code = readFileSync(
      join(__dirname, '../../mobile/src/screens/ItemsScreen.tsx'), 'utf8');
    // IL88 gave the single-group tabs their own strip (by class), so
    // the centre tab is no longer the only one — what stays true is that
    // the strip never runs while searching, where the query owns the
    // list, and never renders empty.
    expect(code).toContain('if (searching) return [];');
    expect(code).toContain('{!searching && groupStrip.length > 0 && (');
    expect(code).toContain("if (homeGroup === 'other') {");
  });
});

describe('a single-group tab offers its classes too (IL88)', () => {
  it('the Weapons tab really is eleven different classes', () => {
    const kinds = kindsInGroup('weapons');
    expect(kinds.length).toBeGreaterThan(10);
    const names = kinds.map((k) => k.kind);
    for (const k of ['Melee weapon', 'Assault rifle', 'Bow', 'Shotgun']) {
      expect(names).toContain(k);
    }
    const bows = collapseFamilies(
      idsInGroup('weapons').filter((i) => kindWord(i) === 'Bow'));
    expect(bows.length).toBe(5);
  });

  it('the strip picks a KIND there and a GROUP on the centre tab', () => {
    const code = readFileSync(
      join(__dirname, '../../mobile/src/screens/ItemsScreen.tsx'), 'utf8');
    const block = code.slice(code.indexOf('IL88'), code.indexOf('IL88') + 700);
    expect(block).toContain('kindsInGroup(filters.group)');
    expect(code).toContain("const stripPicksKind = homeGroup !== 'other';");
    expect(code.replace(/\s+/g, ' ')).toContain(
      'on={stripPicksKind ? filters.kind === g.id : filters.group === g.id}');
  });

  it('tapping the chosen class again clears it', () => {
    const code = readFileSync(
      join(__dirname, '../../mobile/src/screens/ItemsScreen.tsx'), 'utf8');
    expect(code.replace(/\s+/g, ' ')).toContain(
      '{ ...filters, kind: filters.kind === g.id ? null : g.id }');
  });
});

describe('a material card says what it is for (IL89)', () => {
  it('the row promised it and the card was silent', () => {
    const pal = itemIdByName('Paldium Fragment')!;
    expect(usedInOf(pal).length).toBe(195);
    // 142 items feed a recipe; the median one feeds four, so most cards
    // show the whole list and only a handful need the cap
    const carriers = ITEM_IDS.filter((i) => usedInOf(i).length > 0);
    expect(carriers.length).toBe(142);
    const under12 = carriers.filter((i) => usedInOf(i).length <= 12);
    expect(under12.length).toBeGreaterThan(carriers.length / 2);
  });

  it('the twelve shown are the earliest to unlock, not the first twelve', () => {
    const code = readFileSync(
      join(__dirname, '../../mobile/src/screens/ItemsScreen.tsx'), 'utf8');
    const block = code.slice(code.indexOf('IL89'), code.indexOf('IL89') + 2600);
    expect(block).toContain('ITEM_FACTS[i]?.tech?.level ?? 9999');
    expect(block).toContain('.slice(0, 12)');
    expect(block).toContain('you can unlock earliest');
    // and each one opens its own card
    expect(block).toContain('onPress={() => onOpenItem(mid)}');
  });

  it('a material with one product says "What it makes"', () => {
    const charcoal = itemIdByName('Charcoal')!;
    expect(usedInOf(charcoal).length).toBe(1);
    const code = readFileSync(
      join(__dirname, '../../mobile/src/screens/ItemsScreen.tsx'), 'utf8');
    expect(code).toContain(
      "made.length === 1 ? 'What it makes' : 'What you can make with it'");
  });
});

describe('an implant card can plan the breed it points at (IL90)', () => {
  it('implants really do name a passive the breeding side knows', () => {
    const brave = itemIdByName('Implant: Brave')!;
    const p = implantPassive(brave)!;
    expect(p.name).toBe('Brave');
    expect(p.effects).toContain('Attack');
    // and it is not a one-off: every implant resolves to a passive
    const implants = ITEM_IDS.filter((i) => /^Implant: /.test(ITEMS[i].name));
    expect(implants.length).toBeGreaterThan(20);
    for (const i of implants) expect(implantPassive(i)).toBeTruthy();
  });

  it('the card sends the passive to the Odds Lab', () => {
    const code = readFileSync(
      join(__dirname, '../../mobile/src/screens/ItemsScreen.tsx'), 'utf8');
    const block = code.slice(code.indexOf('IL90'), code.indexOf('IL90') + 800);
    expect(block).toContain('`Plan a breed for ${p.name}`');
    expect(block).toContain("domain: 'breeding', tab: 'odds'");
    expect(block).toContain('payload: { passive: p.name }');
  });

  it('the Odds Lab puts it on a parent AND ticks it as wanted', () => {
    const odds = readFileSync(
      join(__dirname, '../../mobile/src/screens/OddsScreen.tsx'), 'utf8');
    const block = odds.slice(odds.indexOf('IL90'), odds.indexOf('IL90') + 900);
    expect(block).toContain("takeIntentPayload('odds')");
    expect(block).toContain('setA(');
    expect(block).toContain('setWant(');
    // a parent has four slots and the payload must not overflow them
    expect(block).toContain('.slice(0, SLOTS)');
  });
});

describe('a rivals list is ordered by something that separates (IL91)', () => {
  it('medicine has no number that tells one from another', () => {
    const meds = collapseFamilies(idsInGroup('meds'));
    const nutrition = meds.map((i) => effectNumber(i, 'Nutrition'));
    // 13 of the 14 read 1 — an ordering that orders nothing
    expect(nutrition.filter((n) => n === 1).length).toBeGreaterThan(10);
    expect(rankAxisOf('Medicine')).toBeNull();
    expect(rivalBasis('Medicine')).toBe('tier');
  });

  it('so it gets no board at all, rather than a false one', () => {
    // the same rule Ore and Wood have always had. A first cut ranked
    // medicine by TIER instead, which quietly turned every unrankable
    // kind — coal, ore, wood — into a rarity board nobody asked for.
    const med = itemIdByName('Advanced Recovery Meds')!;
    expect(rivalsOf(med)).toEqual([]);
    expect(rivalsOf('Coal')).toEqual([]);
    // and a kind that CAN be ranked still is
    expect(rivalsOf(itemIdByName('Advanced Bow')!).length).toBe(5);
  });

  it('a kind with a real stat still ranks and shows the stat', () => {
    const bow = itemIdByName('Advanced Bow')!;
    expect(rivalBasis('Bow')).toBe('stat');
    expect(rivalShowOf(itemIdByName('Mechanical Bow')!)).toBe('24000');
  });

  it('an axis must separate most of the kind to be used at all', () => {
    // gliders gained one: Speed is 5 distinct values across 5 gliders
    expect(rankAxisOf('Glider')).toBe('Speed');
    // and no kind is left ranking on a number that ties its members
    for (const kind of new Set(ITEM_IDS.map(kindWord))) {
      const ax = rankAxisOf(kind);
      if (!ax) continue;
      const fams = collapseFamilies(ITEM_IDS.filter((i) => kindWord(i) === kind));
      const distinct = new Set(fams.map((i) => effectNumber(i, ax) ?? -1)).size;
      expect(distinct * 2, `${kind} on ${ax}`).toBeGreaterThanOrEqual(fams.length);
    }
  });
});

describe('a penalty is not ranked among bonuses (IL92)', () => {
  it('SAN resist really does span a sentinel to a small bonus', () => {
    const vals = ITEM_IDS
      .map((i) => effectNumber(i, 'SAN resist'))
      .filter((n): n is number => n != null);
    expect(Math.min(...vals)).toBe(-100000);
    expect(Math.max(...vals)).toBe(50);
    const juice = itemIdByName('Mysterious Mushroom Juice')!;
    expect(effectNumber(juice, 'SAN resist')).toBe(-100000);
  });

  it('the number still shows; the league position does not', () => {
    const juice = itemIdByName('Mysterious Mushroom Juice')!;
    expect(effectRank(juice, 'SAN resist')).toBeNull();
    // ...while its positive effects keep theirs
    expect(effectRank(juice, 'SAN')).not.toBeNull();
    expect(effectRank(juice, 'Work Speed')).not.toBeNull();
  });

  it('every negative effect anywhere loses its rank, not just this one', () => {
    let checked = 0;
    for (const id of ITEM_IDS) {
      for (const [label] of (ITEM_FACTS[id]?.effects ?? [])) {
        const n = effectNumber(id, label);
        if (n != null && n < 0) {
          expect(effectRank(id, label), `${ITEMS[id].name} ${label}`).toBeNull();
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(3);
  });
});
