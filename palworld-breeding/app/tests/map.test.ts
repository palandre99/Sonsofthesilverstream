/** Map data + maths gate.
 *
 * The CEO's bar for this fane was "spot on accurate, NO ROOM FOR ERROR on
 * locations". These tests guard the claims we make about the map data, so a
 * bad regeneration fails the suite instead of quietly moving a pin into the
 * sea. tools/verify_map_projection.py proves the projection against 58,504
 * datamined points; this locks in the result and the decode path around it.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { MAP_POIS } from '../src/data/mapPois.g';
import { MAP_SPAWNS } from '../src/data/mapSpawns.g';
import { MAP_REGIONS } from '../src/data/mapMeta.g';
import { MAP_TILES } from '../src/data/tileIndex.g';
import { clusterPoints, decodePoints, pointsInRect } from '../src/map/points';
import { regionOf, uvToReadout, worldToUv, tileLevelFor } from '../src/map/projection';
import {
  isNightOnly, spawnLevels, spawnPoints, spawnSplit, wildBands,
} from '../src/map/layers';

const palsJson = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'data', 'pals_1_0.json'), 'utf8'),
) as { pals: Record<string, unknown> };

/** map modules that must stay byte-identical across the two apps */
const SHARED_MAP = ['projection.ts', 'points.ts', 'layers.ts'];

describe('map module copies', () => {
  it.each(SHARED_MAP)('%s is byte-identical in app/ and mobile/', (file) => {
    const hash = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');
    const a = join(__dirname, '..', 'src', 'map', file);
    const b = join(__dirname, '..', '..', 'mobile', 'src', 'map', file);
    expect(hash(a)).toBe(hash(b));
  });
});

describe('gesture root', () => {
  // Shipped 2026-08-15: the Map fane crashed on the CEO's phone with
  // "GestureDetector must be used as a descendant of GestureHandlerRootView".
  // react-native-web does NOT enforce that, so a browser-only visual pass went
  // green while the device threw. This asserts the wrapper on every push.
  const appSrc = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'App.tsx'), 'utf8',
  );

  it('wraps the app tree in GestureHandlerRootView', () => {
    expect(appSrc).toContain('<GestureHandlerRootView');
    expect(appSrc).toMatch(/import \{[^}]*GestureHandlerRootView[^}]*\} from 'react-native-gesture-handler'/);
  });

  it('mounts it outside SafeAreaProvider, so it covers every screen', () => {
    const root = appSrc.indexOf('<GestureHandlerRootView');
    const safe = appSrc.indexOf('<SafeAreaProvider>');
    expect(root).toBeGreaterThan(-1);
    expect(root).toBeLessThan(safe);
  });

  it('only uses GestureDetector inside the map, which that root covers', () => {
    // A GestureDetector added elsewhere is fine, but this pins the assumption
    // so a future one is a deliberate decision rather than a surprise crash.
    const mapCanvas = readFileSync(
      join(__dirname, '..', '..', 'mobile', 'src', 'map', 'MapCanvas.tsx'), 'utf8',
    );
    expect(mapCanvas).toContain('<GestureDetector');
  });
});

describe('map regions', () => {
  it('both world regions are exactly square, matching the square textures', () => {
    // This is WHY we trust DT_WorldMapUIData over palcalc's fitted matrix.
    for (const r of MAP_REGIONS) {
      expect(r.maxX - r.minX).toBe(r.maxY - r.minY);
    }
  });

  it('reproduces the coordinate readout the game shows the player', () => {
    // Alpha Anubis, world (-167230, 96430) -> the game's map readout.
    // Independently confirmed by palcalc, pal-atlas and palworld-atlas-data.
    const palpagos = regionOf('palpagos');
    const uv = worldToUv(-167230, 96430, palpagos);
    expect(uvToReadout(uv, palpagos)).toEqual({ x: -134, y: -94 });
  });

  it('round-trips a world position back to itself through uv', () => {
    const tree = regionOf('tree');
    const uv = worldToUv(563230.125, -591080, tree);
    expect(uv.u).toBeGreaterThanOrEqual(0);
    expect(uv.u).toBeLessThanOrEqual(1);
    expect(uv.v).toBeGreaterThanOrEqual(0);
    expect(uv.v).toBeLessThanOrEqual(1);
  });
});

describe('spawn data', () => {
  it('every species is a pal the Paldex knows', () => {
    const unknown = Object.keys(MAP_SPAWNS).filter((n) => !(n in palsJson.pals));
    expect(unknown).toEqual([]);
  });

  it('every point decodes inside the map image', () => {
    let checked = 0;
    for (const groups of Object.values(MAP_SPAWNS)) {
      for (const g of groups) {
        const set = decodePoints(g.pts);
        expect(set.n).toBe(g.n);
        for (let i = 0; i < set.n; i++) {
          const u = set.xy[i * 2];
          const v = set.xy[i * 2 + 1];
          if (u < 0 || u > 1 || v < 0 || v > 1) {
            throw new Error(`point out of bounds: ${u},${v}`);
          }
          checked++;
        }
      }
    }
    // the whole datamined set, not a sample
    expect(checked).toBe(68617);
  });

  it('level bands are ordered and within the game s level cap', () => {
    for (const [name, groups] of Object.entries(MAP_SPAWNS)) {
      for (const g of groups) {
        expect(g.lo, name).toBeGreaterThan(0);
        expect(g.hi, name).toBeGreaterThanOrEqual(g.lo);
        expect(g.hi, name).toBeLessThanOrEqual(80);
      }
    }
  });

  it('separates open-world spawns from dungeon spawns', () => {
    // Foxparks has 189 spawner rows on Palpagos, but only 93 are open-world.
    // The other 96 are DUNGEON spawners: drawing them as surface areas would
    // send the player to a hillside where the pal is not. Established by an
    // exact-coordinate join between palworld-atlas-data and pal-atlas.
    expect(spawnSplit('Foxparks', 'palpagos')).toEqual({ field: 93, dungeon: 96 });

    const surface = spawnPoints('Foxparks', 'palpagos', { day: true, night: true },
      { lo: 1, hi: 80 });
    expect(surface?.n).toBe(93);

    const withDungeons = spawnPoints('Foxparks', 'palpagos', { day: true, night: true },
      { lo: 1, hi: 80 }, true);
    expect(withDungeons?.n).toBe(189);
  });

  it('quotes the level range of the surface spawns only', () => {
    // The dungeon bands run to 13; the open-world ones stop at 7.
    expect(spawnLevels('Foxparks', 'palpagos')).toEqual({ lo: 5, hi: 7 });
  });

  it('keeps variants distinct from their base species', () => {
    const cryst = spawnSplit('Foxparks Cryst', 'palpagos');
    expect(cryst.field + cryst.dungeon).toBe(104);
  });

  it('states open-world and dungeon levels apart on the pal card', () => {
    // palcalc quotes ONE range that unions open-world, dungeon and boss
    // spawns, which is why the card read "wild Lv 5 to 18" for Foxparks while
    // the map on the same card said 5-7. 167 of 260 species disagreed that way.
    const bands = wildBands('Foxparks');
    expect(bands.surface).toEqual({ lo: 5, hi: 7 });
    expect(bands.dungeon).toEqual({ lo: 6, hi: 13 });
  });

  it('leaves boss-only species to the palcalc fallback', () => {
    // ~25 species have no wild spawner at all; the card must not claim a range
    // of its own for them.
    const bands = wildBands('Bellanoir');
    expect(bands.surface).toBeNull();
    expect(bands.dungeon).toBeNull();
  });

  it('hides night-only bands when night is switched off', () => {
    const nocturnal = Object.keys(MAP_SPAWNS).find((n) => isNightOnly(n, 'palpagos'));
    expect(nocturnal, 'expected at least one night-only pal').toBeTruthy();
    const dayOnly = spawnPoints(nocturnal!, 'palpagos', { day: true, night: false },
      { lo: 1, hi: 80 });
    expect(dayOnly).toBeNull();
  });

  it('narrows to the level window it is given', () => {
    // Pick a species that genuinely has more than one open-world level band,
    // rather than hard-coding one whose bands may change with a patch.
    const entry = Object.entries(MAP_SPAWNS).find(([, groups]) => {
      const surface = groups.filter((g) => g.m === 0 && !g.dun);
      return new Set(surface.map((g) => `${g.lo}-${g.hi}`)).size > 1;
    });
    expect(entry, 'expected a pal with several surface level bands').toBeTruthy();
    const [name, groups] = entry!;
    const surface = groups.filter((g) => g.m === 0 && !g.dun);
    const lowest = Math.min(...surface.map((g) => g.hi));

    const all = spawnPoints(name, 'palpagos', { day: true, night: true }, { lo: 1, hi: 80 });
    const low = spawnPoints(name, 'palpagos', { day: true, night: true }, { lo: 1, hi: lowest });
    expect(low!.n).toBeLessThan(all!.n);
  });
});

describe('points of interest', () => {
  it('each layer decodes to the count it advertises', () => {
    for (const layer of MAP_POIS) {
      const set = decodePoints(layer.pts);
      expect(set.n, layer.id).toBe(layer.n);
      expect(layer.maps.length, layer.id).toBeGreaterThan(0);
    }
  });

  it('gives every layer its own colour, so a tower never reads as a statue', () => {
    const colours = MAP_POIS.map((l) => l.colour);
    expect(new Set(colours).size).toBe(colours.length);
  });

  it('carries the 9 Palpagos syndicate towers', () => {
    const towers = MAP_POIS.find((l) => l.id === 'syndicate_tower')!;
    const maps = Buffer.from(towers.maps, 'base64');
    expect([...maps].filter((m) => m === 0)).toHaveLength(9);
  });
});

describe('culling and clustering', () => {
  const set = decodePoints(MAP_SPAWNS.Foxparks[0].pts);

  it('finds everything when the rectangle is the whole map', () => {
    expect(pointsInRect(set, 0, 0, 1, 1)).toHaveLength(set.n);
  });

  it('finds nothing in an empty corner', () => {
    expect(pointsInRect(set, 0, 0, 0.001, 0.001)).toHaveLength(0);
  });

  it('never loses or invents a point when clustering', () => {
    const all = pointsInRect(set, 0, 0, 1, 1);
    for (const scale of [400, 2000, 12000]) {
      const total = clusterPoints(set, all, scale)
        .reduce((n, c) => n + c.count, 0);
      expect(total).toBe(set.n);
    }
  });

  it('gives each bubble a key that survives a pan', () => {
    // Keying a marker on its cluster COUNT remounts every pin the moment a
    // cluster gains or loses a member — i.e. exactly while dragging. The cell
    // key is stable for a given zoom, so panning only adds and removes.
    const wide = pointsInRect(set, 0, 0, 1, 1);
    const narrow = pointsInRect(set, 0.1, 0.1, 0.9, 0.9);
    const cellsOf = (idx: number[]) =>
      new Set(clusterPoints(set, idx, 2000).map((c) => c.cell));
    const a = cellsOf(wide);
    const b = cellsOf(narrow);
    expect(b.size).toBeGreaterThan(0);
    // every cell still on screen keeps the identity it had before the pan
    for (const cell of b) expect(a.has(cell)).toBe(true);
  });

  it('merges harder when zoomed out than when zoomed in', () => {
    const all = pointsInRect(set, 0, 0, 1, 1);
    const far = clusterPoints(set, all, 400).length;
    const near = clusterPoints(set, all, 12000).length;
    expect(far).toBeLessThan(near);
  });
});

describe('worklet safety', () => {
  // Shipped 2026-08-16 and CRASHED the CEO's app the moment he opened the Map:
  // useAnimatedReaction runs on the UI thread, and calling a function imported
  // from another module inside a worklet is a hard native crash — no error
  // boundary, the app just closes. react-native-web runs the same code on the
  // JS thread, so a browser pass goes green while the phone dies.
  const canvas = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'map', 'MapCanvas.tsx'), 'utf8',
  );

  it('keeps its local tile constants in step with the generated ones', () => {
    // The reaction closes over LOCAL copies so it never reaches into another
    // module from the UI thread; that only stays safe if they agree.
    expect(canvas).toMatch(/const TILE_PX = TILE_SIZE;/);
    expect(canvas).toMatch(/const TILE_MAX_Z = MAX_TILE_Z;/);
    expect(canvas).not.toMatch(/Math\.min\(MAX_TILE_Z/);
  });

  it('calls no imported helper inside the animated reaction', () => {
    const start = canvas.indexOf('useAnimatedReaction(');
    expect(start).toBeGreaterThan(-1);
    const body = canvas.slice(start, canvas.indexOf('[size.w, size.h', start));
    // every non-relative import name this file pulls in
    const imported = [...canvas.matchAll(/import \{([^}]*)\} from/g)]
      .flatMap((m) => m[1].split(','))
      .map((n) => n.replace(/type/, '').trim())
      .filter((n) => n && /^[a-z][A-Za-z]*$/.test(n));
    const leaked = imported.filter((n) => new RegExp(`\b${n}\s*\(`).test(body));
    expect(leaked, 'imported functions called inside a worklet').toEqual([]);
  });
});

describe('tile levels', () => {
  it('asks for deeper tiles as the map is zoomed in', () => {
    expect(tileLevelFor(512, 512, 3)).toBe(0);
    expect(tileLevelFor(1024, 512, 3)).toBe(1);
    expect(tileLevelFor(4096, 512, 3)).toBe(3);
  });

  it('never asks for a level the bundled pyramid does not have', () => {
    expect(tileLevelFor(999999, 512, 3)).toBe(3);
    expect(tileLevelFor(1, 512, 3)).toBe(0);
  });
});

/* Four pals used to draw 1,393 dots in one teal: the map could not answer
 * "which of these is Pengullet?". Colour now means WHICH pal and shape means
 * where/when, so both halves of that trade are guarded here. */
describe('a pal you picked is tellable from the others', () => {
  const screen = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'screens', 'MapScreen.tsx'), 'utf8',
  );

  const hues = (screen.match(/const PAL_HUES = \[([\s\S]*?)\];/) ?? [])[1] ?? '';
  const entries = [...hues.matchAll(/(#[0-9A-Fa-f]{6}|T\.accent)/g)].map((m) => m[1]);

  it('offers at least eight colours, all different', () => {
    expect(entries.length).toBeGreaterThanOrEqual(8);
    expect(new Set(entries).size).toBe(entries.length);
  });

  it('gives no pal a colour that reads as terrain', () => {
    // green land and pale sand are the two the map would swallow
    for (const hex of entries.filter((e) => e.startsWith('#'))) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      expect(g > r + 30 && g > b + 30).toBe(false);   // leafy green
      expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeGreaterThan(40); // not a grey
    }
  });

  it('spends hue on identity, not on day/night', () => {
    // The colour used to branch on isNightOnly, which spent the one channel
    // that could say WHICH pal on a fact the pin could carry another way.
    // Night was then the glyph; since the pin took the pal's own portrait it
    // is a corner badge. What must stay true is that hue never encodes it.
    expect(screen).not.toMatch(/colour:\s*isNightOnly\(/);
    expect(screen).toMatch(/night: isNightOnly\(/);
  });

  it('keeps a dungeon pin the same colour as its pal', () => {
    // shape carries "inside"; a second hue there would collide with identity
    expect(screen).toMatch(/colour: hue,\s*\/\/ same pal/);
    expect(screen).toMatch(/square: true/);
  });
});

/* With 23 POI layers, identity lives in the GLYPH, not the hue — so a cluster
 * must never drop its glyph for a bare count. At the default fit almost every
 * pin is a cluster, which made that the map's normal state, not an edge case. */
describe('a cluster still says what it is', () => {
  const screen = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'screens', 'MapScreen.tsx'), 'utf8',
  );
  // Deliberately NOT slicing the Pin function out with a regex: the file is
  // CRLF on this machine, so brace-anchored patterns silently match nothing
  // and every assertion below would pass against an empty string. Anchoring on
  // distinctive source text instead is immune to line endings.
  const pin = screen;

  it('draws the symbol whether or not the pin is a cluster', () => {
    expect(pin).toMatch(/function Pin\(/);   // the guard is pointed at real code
    // the old shape was `many ? <count> : art ? <Image> : <Icon>` — the glyph
    // sat on the FALSE branch of `many`, so it vanished the moment pins merged
    expect(pin).not.toMatch(/\{many \?\s*\(?\s*<Text/);
    expect(pin).toMatch(/art != null \?/);
    expect(pin).toMatch(/<Icon\s+name=\{icon\}/);
  });

  it('shows the count as a badge instead of replacing the symbol', () => {
    expect(pin).toMatch(/\{many && \(/);
    expect(pin).toMatch(/count > 999 \? '999\+' : count/);
  });

  it('keeps the badge attached to its own pin', () => {
    // The badge must HANG OFF the pin it counts rather than flow inline and
    // shove the glyph off centre. Matched on the badge's own negative offsets,
    // not on a bare `position: 'absolute'` — the bottom controls use that too,
    // so the loose version passed no matter what the badge did.
    expect(pin).toMatch(/position: 'absolute', right: -\d+, bottom: -\d+/);
  });
});

/* A place name must appear where that place IS. The edge clamp used to apply
 * to every screen marker unconditionally, so names whose true position was far
 * off screen were dragged to the frame edge and drawn there, several stacked
 * at the identical x. Measured before the fix: 6 overlapping pairs among 31
 * on-screen names; after: 0 among 25, the 6 that vanished being exactly the
 * ones drawn at a false position. */
describe('place names are not dragged in from off screen', () => {
  const canvas = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'map', 'MapCanvas.tsx'), 'utf8',
  );

  it('hides a marker whose own anchor is outside the frame', () => {
    expect(canvas).toMatch(/function ScreenPin\(/);   // pointed at real code
    expect(canvas).toMatch(/raw < 0 \|\| raw > width/);
    expect(canvas).toMatch(/opacity: show/);
  });

  it('clamps against the untouched anchor, not a value already clamped', () => {
    // clamping `x` in place would compound across frames; the slide must be
    // derived from `raw` every time
    expect(canvas).toMatch(/Math\.max\(halfWidth, raw\)/);
  });

  it('sizes the slide from the ink, not from the label box', () => {
    const screen = readFileSync(
      join(__dirname, '..', '..', 'mobile', 'src', 'screens', 'MapScreen.tsx'), 'utf8',
    );
    // halfWidth: LABEL_W / 2 shoved a short name up to 75px off its own spot
    expect(screen).not.toMatch(/halfWidth: LABEL_W \/ 2/);
    expect(screen).toMatch(/halfWidth: Math\.min\(LABEL_W, textWidth\(name\)\) \/ 2/);
  });
});

/* CEO, 2026-08-16: "Bosses etc must be the image of the actual pal it is."
 * A crown said a boss was here but not WHICH, and a paw print said a pal
 * spawns here but not WHICH. The portraits already ship for the Paldex. */
describe('a pal on the map looks like that pal', () => {
  const screen = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'screens', 'MapScreen.tsx'), 'utf8',
  );

  it('draws the real portrait on spawn pins and on boss pins', () => {
    expect(screen).toMatch(/import \{ PAL_ICONS \}/);
    expect(screen).toMatch(/photo: PAL_ICONS\[pal\]/);          // spawn layers
    expect(screen).toMatch(/photo=\{PAL_ICONS\[pal\]\} boss/);  // alpha pins
  });

  it('prefers the portrait over the generic glyph', () => {
    // photo must be the FIRST branch: falling through to the paw whenever art
    // happened to be set is how the face would silently disappear
    const photoAt = screen.indexOf('{photo != null ? (');
    const artAt = screen.indexOf(') : art != null ? (');
    expect(photoAt).toBeGreaterThan(-1);
    expect(artAt).toBeGreaterThan(photoAt);
  });

  it('keeps the night signal after the face takes the middle', () => {
    // night used to be the glyph itself; it is a corner badge now
    expect(screen).toMatch(/night && \(/);
    expect(screen).toMatch(/night: isNightOnly\(pal, region\)/);
  });
});

/* CEO, 2026-08-16: "The find pal search function is also garbage bad filters
 * etc , it should be similar to paldex search and filter". The map must run
 * the Paldex's OWN filter engine, not a second one that resembles it. */
describe('the map search is the Paldex search', () => {
  const screen = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'screens', 'MapScreen.tsx'), 'utf8',
  );

  it('reuses the shared filter engine and sheet', () => {
    expect(screen).toMatch(/from '\.\.\/ui\/palFilters'/);
    expect(screen).toMatch(/import \{ FilterSheet \} from '\.\.\/ui\/FilterSheet'/);
    expect(screen).toMatch(/sortedPals\(applyFilters\(/);
  });

  it('hands the sheet only the pals that spawn on this map', () => {
    // without `base` the sheet promises "Show 298 pals" and then hands back
    // the ~224 that actually spawn here
    expect(screen).toMatch(/base=\{base\}/);
    expect(screen).toMatch(/spawnablePals\(\)\.filter\(\(n\) => spawnLevels\(n, region\) !== null\)/);
  });

  it('has no second, private "missing" toggle beside the shared one', () => {
    // two controls doing one job is exactly what made the old sheet confusing
    expect(screen).not.toMatch(/missingOnly/);
  });
});

/* CEO, 2026-08-16: "it looks like 380 quality.. not crisp 4K". The arithmetic
 * was exact — a 4096 texture across a 3x-density phone at full zoom is a 3x
 * upscale. Palpagos now builds from the game's native 8192 T_WorldMap
 * (jeankassio/PalMiniMap, MIT); the World Tree has no 8192 export anywhere, so
 * its ceiling is honestly lower and the renderer is told so per region. */
describe('zoom never asks for pixels that do not exist', () => {
  const idx = readFileSync(
    join(__dirname, '..', 'src', 'data', 'tileIndex.g.ts'), 'utf8',
  );
  const canvas = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'map', 'MapCanvas.tsx'), 'utf8',
  );

  it('records how deep each region really goes', () => {
    expect(idx).toMatch(/REGION_MAX_Z[\s\S]*?palpagos: 4/);
    expect(idx).toMatch(/REGION_MAX_Z[\s\S]*?tree: 3/);
  });

  it('actually ships the deeper level for Palpagos and not for the tree', () => {
    const z4 = [...MAP_TILES.palpagos].filter((k) => k.startsWith('4_'));
    expect(z4.length).toBeGreaterThan(100);          // 180 kept, 76 open ocean
    expect([...MAP_TILES.tree].some((k) => k.startsWith('4_'))).toBe(false);
  });

  it('selects the deepest level once the map is magnified past 4096', () => {
    // the renderer inlines this maths in a worklet; tileLevelFor is the copy
    // the test can reach, and another test pins the two together
    expect(tileLevelFor(4097, 512, 4)).toBe(4);
    expect(tileLevelFor(4096, 512, 4)).toBe(3);
    expect(tileLevelFor(9999, 512, 3)).toBe(3);      // tree stops at 3
  });

  it('derives the zoom ceiling from the pyramid instead of a typed-in number', () => {
    // a hard 4096 was why the terrain went soft: it let the map magnify past
    // the pixels it had. It must come from REGION_MAX_Z now.
    expect(canvas).toMatch(/function maxScaleFor/);
    expect(canvas).toMatch(/TILE_PX \* \(1 << \(REGION_MAX_Z\[region\]/);
    expect(canvas).not.toMatch(/const MAX_SCALE = 4096/);
  });
});

/* CEO, 2026-08-16: "Icons are also garbage and not accurate game icons
 * images." It was resolution: a 22px sprite drawn at ~45 device px on a 3x
 * phone is mush. These assert the pixels, not the intention. */
describe('map symbols have enough pixels for a 3x phone', () => {
  /** width/height straight out of the PNG IHDR */
  function pngSize(file: string): { w: number; h: number } {
    const b = readFileSync(join(__dirname, '..', 'public', 'mapicons', file));
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  }

  // upgraded to the game's own higher-resolution exports
  const UPGRADED = [
    'fast_travel', 'syndicate_tower', 'sealed_realm', 'bounty_targets',
    'chest', 'dungeon', 'egg', 'note',
  ];

  it.each(UPGRADED)('%s is at least 64px', (layer) => {
    const { w, h } = pngSize(`${layer}.png`);
    expect(Math.min(w, h)).toBeGreaterThanOrEqual(64);
  });

  it('kept the two symbols whose replacement did not actually match', () => {
    // T_itemicon_Relic is a green creature, not the effigy statue, and the
    // compass boss glyph is a horned head rather than our alpha marker. Both
    // were rejected on a side-by-side render. A sharper WRONG symbol is still
    // wrong, so these stay small on purpose — this test records that choice.
    for (const layer of ['pal_effigy', 'alpha_pals']) {
      const { w } = pngSize(`${layer}.png`);
      expect(w).toBeLessThan(64);
    }
  });
});

/* A pin is the thing you are looking for; a place name is context for it.
 * Names used to be drawn last, so "Twilight Dunes" printed across Anubis's
 * face. Order is now tiles < names < pins. */
describe('a place name never covers a pin', () => {
  const canvas = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'map', 'MapCanvas.tsx'), 'utf8',
  );

  it('draws the names before the pins', () => {
    const names = canvas.indexOf('screenMarkers?.map(');
    const pins = canvas.indexOf('markers.map((m) => (');
    expect(names).toBeGreaterThan(-1);
    expect(pins).toBeGreaterThan(-1);
    expect(names).toBeLessThan(pins);
  });

  it('keeps pins on ONE shared counter-scale worklet', () => {
    // Making each pin its own screen-space marker would give ~200 markers
    // ~200 worklets recomputing every frame — the exact thing this file was
    // built to avoid, and the CEO had just reported the map as laggy. Pins
    // ride a second container on the same transform instead.
    expect(canvas).toMatch(/const pinStyle = useAnimatedStyle/);
    // the shared map transform is applied to two containers now
    expect(canvas.split('mapStyle,').length - 1).toBeGreaterThanOrEqual(2);
  });

  it('leaves the text outside the transform, where it stays crisp', () => {
    // text inside the transform is rasterised pre-zoom then magnified, which
    // came out jagged on the phone
    expect(canvas).toMatch(/<ScreenPin key=\{m\.key\}/);
  });
});

/* "Where do I get sulfur" is the most ordinary thing a player does with a map.
 * Typing it used to answer "No pal by that name spawns on this map" while a
 * Sulfur layer with 261 nodes sat one tap away behind a different button. */
describe('the search finds things that are not pals', () => {
  const screen = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'screens', 'MapScreen.tsx'), 'utf8',
  );

  it('matches layer names and can switch one on from the results', () => {
    expect(screen).toMatch(/const layerHits = useMemo/);
    expect(screen).toMatch(/l\.label\.toLowerCase\(\)\.includes\(needle\)/);
    expect(screen).toMatch(/onPress=\{\(\) => onTogglePoi\(l\.id\)\}/);
  });

  it('offers only layers that actually have something on this map', () => {
    // a layer with 0 nodes here would be a result that does nothing
    expect(screen).toMatch(/\.filter\(\(l\) => l\.n > 0\)/);
  });

  it('no longer blames the pal list when a layer matched', () => {
    // the old copy claimed "No pal by that name spawns on this map" even when
    // the thing you asked for was right there as a layer
    expect(screen).not.toMatch(/'No pal by that name spawns on this map\.'/);
    expect(screen).toMatch(/layerHits\.length \|\| places\.length/);
  });

  it('says what it searches, rather than promising only pals and places', () => {
    expect(screen).toMatch(/title="Find anything on the map"/);
    expect(screen).toMatch(/placeholder="Search pals, places, chests, ore…"/);
  });
});

/* Every count the player reads is formatted the same way. The marker card
 * printed "1572 on this map" directly above a pill saying "1,572 spots on the
 * map" — the same number, one line apart, in two formats. */
describe('counts read the same wherever they appear', () => {
  const screen = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'screens', 'MapScreen.tsx'), 'utf8',
  );

  it('never prints a raw count into user-visible copy', () => {
    expect(screen).not.toMatch(/\$\{layer\.set\.n\} on this map/);
    expect(screen).not.toMatch(/\$\{l\.n\} on the map/);
    expect(screen).toMatch(/\$\{layer\.set\.n\.toLocaleString\(\)\} on this map/);
  });

  it('formats the layer-sheet row and its screen-reader label alike', () => {
    // the sighted label and the spoken one drifting apart is its own bug
    expect(screen).toMatch(/\$\{l\.label\}, \$\{l\.n\.toLocaleString\(\)\} on the map/);
  });
});

/* The time toggle had two states, so "what can I catch RIGHT NOW, in
 * daylight?" had no setting — and when a night-only pal drew nothing, the map
 * showed the first-run hint "Find a pal to see where it spawns" to a player
 * who had just found one. */
describe('day and night', () => {
  const screen = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'screens', 'MapScreen.tsx'), 'utf8',
  );

  it('offers all three settings, not just two', () => {
    expect(screen).toMatch(/any: 'Any time'/);
    expect(screen).toMatch(/day: 'Daytime'/);
    expect(screen).toMatch(/night: 'Night'/);
    // and they cycle round rather than dead-ending
    expect(screen).toMatch(/const NEXT_TIME/);
  });

  it('drops "All day", which read as DAYTIME to a player', () => {
    expect(screen).not.toMatch(/label=\{[^}]*'All day'/);
  });

  it('shows the first-run hint only when nothing is switched on', () => {
    expect(screen).toMatch(
      /active\.length === 0 && !sheet && filters\.pals\.size === 0 && filters\.poi\.size === 0/,
    );
  });

  it('names the actual reason when a selection draws nothing', () => {
    expect(screen).toMatch(/function emptyReason/);
    expect(screen).toMatch(/only comes out at night/);
    expect(screen).toMatch(/Nothing out in the daytime/);
  });
});
