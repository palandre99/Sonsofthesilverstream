/**
 * The Items index — the fane's first visible surface. The data module is
 * imported FOR REAL (plain .ts); the screen's copy is pinned by source.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ammoForWeapon, collapseFamilies, effectNumber, familyOf, familyPowerOf,
  idsInGroup, implantPassive, ITEM_GROUPS, ITEM_STATS, ITEMS, itemIdByName, KIND_WORDS,
  kindsInGroup, kindWord, palsDropping, palsHatchingFrom, rivalsOf,
  schematicsFor, searchItems, sortItems, statRank, TAB_GROUPS, teachesOf,
  tierWord, usedInOf, weaponsForAmmo,
} from '../../mobile/src/itemsData';
import palsJson from '../../mobile/src/data/pals_1_0.json';
import FACTS from '../../mobile/src/data/item_facts_1_0.json';
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
    expect(code).toContain("import { breeding, getPlayerLevel } from '../store'");
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
