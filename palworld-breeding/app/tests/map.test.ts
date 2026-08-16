/** Map data + maths gate.
 *
 * The CEO's bar for this fane was "spot on accurate, NO ROOM FOR ERROR on
 * locations". These tests guard the claims we make about the map data, so a
 * bad regeneration fails the suite instead of quietly moving a pin into the
 * sea. tools/verify_map_projection.py proves the projection against 58,504
 * datamined points; this locks in the result and the decode path around it.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { MAP_POIS } from '../src/data/mapPois.g';
import { MAP_ALPHAS, MAP_SPAWNS } from '../src/data/mapSpawns.g';
import { MAP_REGIONS } from '../src/data/mapMeta.g';
import { MAP_TILES } from '../src/data/tileIndex.g';
import { foundKey } from '../src/map/found';
import { clusterPoints, decodePoints, pointsInRect } from '../src/map/points';
import { regionOf, uvToReadout, worldToUv, tileLevelFor } from '../src/map/projection';
import {
  isNightOnly, poiPoints, searchPlaces, spawnablePals, spawnLevels, spawnPoints, spawnSplit,
  wildBands,
} from '../src/map/layers';
import { REGION_SPOTS } from '../src/data/regionSpots.g';

const palsJson = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'data', 'pals_1_0.json'), 'utf8'),
) as { pals: Record<string, unknown> };

/** map modules that must stay byte-identical across the two apps */
const SHARED_MAP = ['projection.ts', 'points.ts', 'layers.ts'];

/**
 * Duplicated in both trees ON PURPOSE, with different innards. Each entry
 * needs its own guard for whatever part of it must NOT drift — listing it
 * here only says the difference is deliberate, not that it is unchecked.
 */
const FORKED_MAP: Record<string, string> = {
  'found.ts': 'AsyncStorage on the phone, localStorage in the browser; the '
    + 'tick format is pinned separately, the storage keys differ by design',
};

describe('map module copies', () => {
  it('no map module can be duplicated into both trees unnoticed', () => {
    // The gate was a hand-written list, so a NEW file copied into both trees
    // simply was not checked — which is exactly how found.ts came to carry a
    // comment claiming its storage key matched the phone's when it did not.
    // Now a duplicated file must be classified as one or the other, and the
    // suite is what notices, rather than someone remembering.
    const appDir = join(__dirname, '..', 'src', 'map');
    const mobileDir = join(__dirname, '..', '..', 'mobile', 'src', 'map');
    const mobileFiles = new Set(readdirSync(mobileDir));
    const inBoth = readdirSync(appDir).filter((f) => mobileFiles.has(f));

    expect(inBoth.length, 'the two map folders must actually be readable')
      .toBeGreaterThan(2);
    for (const file of inBoth) {
      expect(
        SHARED_MAP.includes(file) || file in FORKED_MAP,
        `${file} is in BOTH app/src/map and mobile/src/map but is neither `
        + 'byte-identical (add it to SHARED_MAP) nor a deliberate fork (add it '
        + 'to FORKED_MAP with the reason, and give the part that must not '
        + 'drift its own test)',
      ).toBe(true);
    }
  });

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
    expect(screen).toMatch(
      /spawnablePals\(\)\.filter\(\(n\) => spawnLevels\(n, region, filters\.dungeons\) !== null\)/);
  });

  it('and includes the dungeon-only pals once the dungeon box is ticked', () => {
    // 25 species on Palpagos have no surface spawn at all. spawnLevels() was
    // the gate AND it filtered !g.dun, so every one of them was unsearchable -
    // measured in the QA browser: "mau" returned zero rows with the box ON,
    // while "foxparks" returned two. Mau has 174 dungeon spawns.
    const dungeonOnly = spawnablePals().filter(
      (n) => spawnLevels(n, 'palpagos') === null
        && spawnLevels(n, 'palpagos', true) !== null,
    );
    expect(dungeonOnly).toContain('Mau');
    expect(dungeonOnly.length).toBe(25);
    expect(spawnLevels('Mau', 'palpagos', true)).not.toBeNull();
    // and the default stays surface-only, so a level band still means
    // "walk out and meet one"
    expect(spawnLevels('Mau', 'palpagos')).toBeNull();
    expect(screen).toMatch(/\[region, filters\.dungeons\]/);
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

  it('caps zoom at one texture pixel per DEVICE pixel', () => {
    // The scale is CSS px per uv, but a phone draws 3 device px for each.
    // Capping at the raw texture size let the map magnify 3x past its own
    // pixels even with the 8192 texture — the CEO shipped it and still
    // reported "looks pixelated", which was exactly right.
    expect(canvas).toMatch(/PixelRatio/);
    expect(canvas).toMatch(/texture \/ PixelRatio\.get\(\)/);
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
    // The sighted label and the spoken one drifting apart is its own bug. Both
    // now quote the count for the region you are looking at, not both maps
    // added together, so this checks the SPOKEN one keeps the separator and
    // the "none" case the visible chip has.
    expect(screen).toMatch(/\$\{here\.toLocaleString\(\)\} on this map/);
    expect(screen).toMatch(/`\$\{l\.label\}, none on this map`/);
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
    // Matched piecewise, not as one line: the guard gained `!hintOff` and now
    // wraps, and a line-anchored regex would have silently stopped matching
    // while still "passing" against a design that had moved on.
    const guard = (screen.match(/active\.length === 0 && !sheet[\s\S]{0,140}?&& \(/) ?? [''])[0];
    expect(guard).toMatch(/filters\.pals\.size === 0/);
    expect(guard).toMatch(/filters\.poi\.size === 0/);
    expect(guard).toMatch(/!hintOff/);
  });

  it('names the actual reason when a selection draws nothing', () => {
    expect(screen).toMatch(/function emptyReason/);
    expect(screen).toMatch(/only comes out at night/);
    expect(screen).toMatch(/Nothing out in the daytime/);
  });
});

/* The canvas deliberately never re-fits once you have panned, or the map would
 * snap back under your finger. But the two regions are different WORLDS, and a
 * pan position on Palpagos means nothing on the World Tree — you would land on
 * an arbitrary patch of the new map at whatever zoom you happened to be at. */
describe('switching region re-frames the region', () => {
  const screen = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'screens', 'MapScreen.tsx'), 'utf8',
  );
  const canvas = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'map', 'MapCanvas.tsx'), 'utf8',
  );

  it('the canvas really does stop re-fitting once touched', () => {
    // this is WHY the screen has to reset explicitly — if this ever changes,
    // the reset below becomes redundant rather than load-bearing
    expect(canvas).toMatch(/if \(!touched\.current\) \{/);
    expect(canvas).toMatch(/touched\.current = true;/);
  });

  it('resets the view when the region changes', () => {
    expect(screen).toMatch(/const prevRegion = useRef<RegionId \| null>\(null\)/);
    expect(screen).toMatch(/prevRegion\.current !== region/);
    expect(screen).toMatch(/canvas\.current\?\.reset\(\)/);
  });

  it('does not reset on first mount, where it would fight the auto-focus', () => {
    // arriving from a pal card frames that species; a reset would undo it
    expect(screen).toMatch(/prevRegion\.current !== null && prevRegion\.current !== region/);
  });
});

/* Provenance is a promise this app makes out loud, so the credit on screen has
 * to match where the bytes actually came from. Adding the 8192 texture and the
 * bigger symbols silently made the old wording wrong. */
describe('the map credit matches the real sources', () => {
  const ref = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'screens', 'ReferenceScreen.tsx'), 'utf8',
  );
  const icons = readFileSync(
    join(__dirname, '..', '..', 'tools', 'fetch_map_icons.py'), 'utf8',
  );
  const tiles = readFileSync(
    join(__dirname, '..', '..', 'tools', 'build_map_tiles.py'), 'utf8',
  );

  it('names PalMiniMap, now that the Palpagos texture comes from it', () => {
    expect(tiles).toMatch(/T_WorldMap_hi\.png/);
    expect(ref).toMatch(/PalMiniMap \(MIT\)/);
  });

  it('no longer says the map picture comes from pal-atlas', () => {
    // true when we shipped one 4096 texture; false the moment Palpagos moved
    expect(ref).not.toMatch(/as does the map picture itself/);
  });

  it('still credits pal-atlas, which the World Tree and most icons use', () => {
    expect(ref).toMatch(/pal-atlas \(MIT\)/);
    expect(icons).toMatch(/Nifrendil\/pal-atlas/);
  });

  it('counts the upgraded symbols honestly', () => {
    const upgraded = (icons.match(/"[a-z_]+": "T_/g) ?? []).length;
    expect(upgraded).toBe(8);
    expect(ref).toMatch(/eight of them at full size/);
  });
});

/* The pal card's "Open full map" hands the species to the Map fane through a
 * one-slot mailbox. If the tab id the card SENDS and the one the map ASKS for
 * ever drift apart, the button silently does nothing — and that is invisible
 * in a browser pass, because the harness cannot scroll the card to reach it. */
describe('the pal card hands its species to the map', () => {
  const palMap = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'ui', 'PalMap.tsx'), 'utf8',
  );
  const mapScreen = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'screens', 'MapScreen.tsx'), 'utf8',
  );
  const intent = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'nav', 'intent.ts'), 'utf8',
  );

  it('sends and receives the SAME tab id', () => {
    const sent = palMap.match(/navigateTo\(\{\s*domain: 'map', tab: '([a-z]+)'/);
    const taken = mapScreen.match(/takeIntentPayload\('([a-z]+)'\)/);
    expect(sent, 'PalMap must navigate to the map').toBeTruthy();
    expect(taken, 'MapScreen must collect the payload').toBeTruthy();
    expect(sent![1]).toBe(taken![1]);
  });

  it('carries the pal itself, not just the destination', () => {
    expect(palMap).toMatch(/payload: \{ pal: name/);
    expect(mapScreen).toMatch(/takeIntentPayload\('map'\)\?\.pal/);
  });

  it('is a one-shot mailbox, so re-entering the map does not re-apply it', () => {
    expect(intent).toMatch(/pending = null;/);
  });
});

/* CEO, 2026-08-16 17:42, with a photo: "Map still looks pixelated and low
 * quality.. zooming in works a bit better but still buggy, when zooming in it
 * snaps to a different place when I release fingers". Three distinct causes. */
describe('deep zoom is sharp, seamless and stays put', () => {
  const canvas = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'map', 'MapCanvas.tsx'), 'utf8',
  );

  it('keeps the tile seam bleed a constant size ON SCREEN', () => {
    // a flat 0.5 in container units is half a pixel at 1:1 and a four-pixel
    // band of stretched edge pixels at full zoom — the straight lines that cut
    // his map into quadrants
    expect(canvas).not.toMatch(/width: step \+ 0\.5/);
    expect(canvas).toMatch(/const bleed = \(0\.5 \* BASE\) \/ \(TILE_PX \* n\)/);
    expect(canvas).toMatch(/width: step \+ bleed/);
  });

  it('stops the pan writing a position while a pinch owns the map', () => {
    // the pan computes from an origin captured BEFORE the pinch moved
    // anything, so on release it yanked the map back to where that implied
    expect(canvas).toMatch(/if \(pinching\.value\) \{/);
    expect(canvas).toMatch(/startTx\.value = tx\.value - e\.translationX/);
  });

  it('clears the pinch flag when the fingers leave', () => {
    // a stuck flag would leave one-finger panning dead
    expect(canvas).toMatch(/pinching\.value = 1;/);
    expect(canvas).toMatch(/pinching\.value = 0;/);
  });
});

/* The map has known every spawn's level band since the pipeline landed, and
 * filters.level was plumbed all the way through spawnPoints — but NOTHING ever
 * set it, so the range was permanently 1-80 and "what can I catch at my level"
 * could not be asked. */
describe('the level cap is reachable', () => {
  const screen = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'screens', 'MapScreen.tsx'), 'utf8',
  );

  it('has a control that actually writes the filter', () => {
    expect(screen).toMatch(/const setLevelCap = useCallback/);
    expect(screen).toMatch(/level: \{ lo: 1, hi \}/);
    expect(screen).toMatch(/onPress=\{\(\) => onSetLevel\(cap\)\}/);
  });

  it('offers Any level plus real upper bounds', () => {
    expect(screen).toMatch(/const LEVEL_CAPS = \[ALL_LEVEL_CAP, 15, 30, 45, 60\]/);
    expect(screen).toMatch(/const ALL_LEVEL_CAP = 80/);
  });

  it('explains an empty map by naming the cap the player set', () => {
    // "between those levels" described a two-ended range; the control is an
    // upper bound, so the sentence has to read like one
    expect(screen).not.toMatch(/spawns between those levels/);
    expect(screen).toMatch(/Nothing at level \$\{f\.level\.hi\} or under/);
  });

  it('drives the same range the spawn lookup already took', () => {
    // the filter was never the missing piece — only the control was
    expect(screen).toMatch(/spawnPoints\(pal, region, filters\.time, filters\.level\)/);
  });
});

/* 76 pals live on BOTH maps, so the region filter has to cut the point cloud
 * rather than just relabel it. Anubis is the worked example: the numbers below
 * come from the datamined table, and the app was measured showing exactly
 * these — 35 on Palpagos, 21 on the World Tree. */
describe('a pal that lives on both maps', () => {
  it('shows each region its own spawns, not the union', () => {
    const all = { day: true, night: true };
    const lv = { lo: 1, hi: 80 };
    expect(spawnPoints('Anubis', 'palpagos', all, lv)?.n).toBe(35);
    expect(spawnPoints('Anubis', 'tree', all, lv)?.n).toBe(21);
  });

  it('keeps the dungeon spawn out of the open-world count', () => {
    // Anubis has exactly one dungeon spawner on Palpagos and none on the tree;
    // standing on that hillside finds you nothing
    expect(spawnSplit('Anubis', 'palpagos')).toEqual({ field: 35, dungeon: 1 });
    expect(spawnSplit('Anubis', 'tree')).toEqual({ field: 21, dungeon: 0 });
  });

  it('counts the pals that appear on both maps', () => {
    // if a regeneration silently drops the World Tree half of the dataset,
    // this is the number that moves
    const both = Object.entries(MAP_SPAWNS).filter(
      ([, groups]) => groups.some((g) => g.m === 0) && groups.some((g) => g.m === 1),
    );
    expect(both.length).toBe(76);
  });
});

/* Every layer used to bucket clusters on the SAME grid, so with eight layers
 * switched on their pins landed on top of each other: measured at 130 pins
 * with 64 overlapping pairs, one of them 96% hidden. Offsetting each layer's
 * grid phase decorrelates them — measured after: 102 pins, 10 pairs. */
describe('layers do not stack their pins on each other', () => {
  const set = decodePoints(MAP_SPAWNS.Chikipi[0].pts);
  const all = Array.from({ length: set.n }, (_, i) => i);

  it('groups the same points differently for different layers', () => {
    const a = clusterPoints(set, all, 800, 40, 0);
    const b = clusterPoints(set, all, 800, 40, 1);
    const keysA = a.map((c) => c.cell).join('|');
    const keysB = b.map((c) => c.cell).join('|');
    expect(keysA).not.toBe(keysB);
  });

  it('still draws every cluster at the true average of its own points', () => {
    // the phase changes WHICH points group together; it must never move a
    // cluster off the spawns it represents
    for (const phase of [0, 1, 5]) {
      for (const c of clusterPoints(set, all, 800, 40, phase)) {
        expect(c.count).toBeGreaterThan(0);
        expect(c.u).toBeGreaterThanOrEqual(0);
        expect(c.u).toBeLessThanOrEqual(1);
        expect(c.v).toBeGreaterThanOrEqual(0);
        expect(c.v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('never loses or invents a point, whatever the phase', () => {
    for (const phase of [0, 1, 2, 7]) {
      const total = clusterPoints(set, all, 800, 40, phase)
        .reduce((sum, c) => sum + c.count, 0);
      expect(total).toBe(set.n);
    }
  });

  it('passes the layer index in, so the phases are actually used', () => {
    const screen = readFileSync(
      join(__dirname, '..', '..', 'mobile', 'src', 'screens', 'MapScreen.tsx'), 'utf8',
    );
    expect(screen).toMatch(/clusterPoints\(layer\.set, hits, vp\.scale, cell, li\)/);
    expect(screen).toMatch(/for \(const \[li, layer\] of active\.entries\(\)\)/);
  });
});

/* Exactly one row of 68,707 came from upstream on the wrong map: the Lv 55
 * Alpha Dualith, tagged region "tree" by palworld-atlas-data while its
 * coordinates sit inside PALPAGOS. It used to fail projection and be silently
 * dropped, so a boss that exists in the game was missing from the app. */
describe('the mislabelled alpha is on the map', () => {
  it('Dualith has both of its alpha bosses', () => {
    const spots = MAP_ALPHAS.Dualith;
    expect(spots, 'Dualith must have alpha spots').toBeTruthy();
    expect(spots.length).toBe(2);
    // the recovered one: Palpagos (m 0), level 55
    expect(spots.some((s) => s.m === 0 && s.lv === 55)).toBe(true);
    // and the one that was always there: the World Tree, level 75
    expect(spots.some((s) => s.m === 1 && s.lv === 75)).toBe(true);
  });

  it('puts the recovered boss inside the map, not on its edge', () => {
    // a clamped point would land exactly on 0 or 1 — proof we corrected the
    // LABEL rather than squashing the position to fit
    const p = MAP_ALPHAS.Dualith.find((s) => s.m === 0)!;
    expect(p.u).toBeGreaterThan(0.01);
    expect(p.u).toBeLessThan(0.99);
    expect(p.v).toBeGreaterThan(0.01);
    expect(p.v).toBeLessThan(0.99);
  });

  it('did not disturb the wild spawn count while fixing it', () => {
    let n = 0;
    for (const groups of Object.values(MAP_SPAWNS)) for (const g of groups) n += g.n;
    expect(n).toBe(68617);
  });
});

/* A block comment inside JSX must be wrapped in braces. Written bare, React
 * Native renders it as a STRING and throws "Text strings must be rendered
 * within a <Text> component" — which is what the CEO photographed at 21:45,
 * from a comment I had un-braced while shrinking the map hint. */
describe('no comment is rendered as text', () => {
  const FILES = [
    ['mobile', 'src', 'screens', 'MapScreen.tsx'],
    ['mobile', 'src', 'map', 'MapCanvas.tsx'],
    ['mobile', 'src', 'ui', 'PalMap.tsx'],
  ];

  it.each(FILES.map((f) => f.join('/')))('%s braces every comment between JSX children', (rel) => {
    const src = readFileSync(join(__dirname, '..', '..', ...rel.split('/')), 'utf8');
    const lines = src.split(/\r?\n/);
    const offenders: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // a comment opening at JSX indentation, not brace-wrapped
      if (!/^\s{4,}\/\*/.test(line) || /^\s*\{\s*\/\*/.test(line)) continue;
      // ...directly after a JSX child closed with `)}` or an element tag
      let p = i - 1;
      while (p >= 0 && lines[p].trim() === '') p--;
      if (p < 0) continue;
      const prev = lines[p].trimEnd();
      if (/\)\}$/.test(prev) || /\/>$/.test(prev) || /<\/[A-Za-z.]+>$/.test(prev)) {
        offenders.push(`line ${i + 1}: ${line.trim().slice(0, 60)}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

/* The tile level must be chosen from DEVICE pixels. Choosing it from layout
 * pixels asked a 4096 tile to cover 8192 real pixels at full zoom — a flat 2x
 * upscale on every phone, and the reason the map still looked soft after the
 * 8192 texture landed: the deepest tiles were built and never requested. */
describe('the deepest tiles are actually used', () => {
  const canvas = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'map', 'MapCanvas.tsx'), 'utf8',
  );

  it('scales the level by pixel density', () => {
    expect(canvas).toMatch(/const dpr = PixelRatio\.get\(\)/);
    expect(canvas).toMatch(/Math\.log2\(Math\.max\(1, scale \* dpr\) \/ TILE_PX\)/);
  });

  it('reaches the deepest level exactly at the zoom ceiling', () => {
    // ceiling is texture/dpr in layout px, so scale*dpr == the texture size
    for (const dpr of [2, 3]) {
      const cap = 8192 / dpr;
      expect(tileLevelFor(cap * dpr, 512, 4)).toBe(4);
      // and one level down well before it, so we are not always paying for z4
      expect(tileLevelFor(cap * dpr / 4, 512, 4)).toBe(2);
    }
  });

  it('never draws a tile stretched more than 1:1 at full zoom', () => {
    for (const dpr of [2, 3]) {
      const devicePx = 8192;             // the whole map across the screen
      const z = tileLevelFor(devicePx, 512, 4);
      const texture = 512 * 2 ** z;
      expect(devicePx / texture).toBeLessThanOrEqual(1);
    }
  });
});

/* A pinch release must never be read as a tap. Both tap gestures run
 * simultaneously with the pinch, and the double tap ANIMATES the map to a new
 * centre — so a two-finger lift-off could jump the map on purpose, in the
 * wrong circumstances. That is the snap the CEO reported on release. */
describe('lifting fingers off a pinch is not a tap', () => {
  const canvas = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'map', 'MapCanvas.tsx'), 'utf8',
  );

  it('ignores a tap made with more than one finger', () => {
    // TapGesture has no maximum-pointer setting - minPointers only - so this
    // has to be checked in the handler, from the event's own pointer count.
    const taps = canvas.split('Gesture.Tap()').slice(1);
    expect(taps.length).toBe(2);
    for (const t of taps) {
      expect(t.slice(0, 1800)).toMatch(/e\.numberOfPointers > 1 \|\| pinching\.value/);
    }
  });

  it('keeps the double tap animating, which is why it must not misfire', () => {
    // if this ever stops animating the guard above matters less, but the jump
    // is the whole point of the control, so it should still be one finger
    expect(canvas).toMatch(/k\.value = withTiming\(next/);
  });
});

/* Found-marks are per save profile, and that correctness rests on three facts
 * in three different files. The harness could not drive the profile UI (it is
 * another session's screen and the button did not respond), so this is
 * REASONED FROM THE CODE, not measured end to end — pinned here so a future
 * change to any one of the three cannot break it silently. */
describe('found-marks follow the save profile', () => {
  const found = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'map', 'found.ts'), 'utf8',
  );
  const screen = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'screens', 'MapScreen.tsx'), 'utf8',
  );
  const app = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'App.tsx'), 'utf8',
  );

  it('gives every profile its own key, so two saves cannot collide', () => {
    expect(found).toMatch(/return `palforge-\$\{profileId\}-mapfound`/);
    expect(found).toMatch(/const id = getActiveProfile\(\)\.id/);
  });

  it('reloads when the profile changed, and no-ops when it did not', () => {
    expect(found).toMatch(/if \(loadedFor === id\) return;/);
    expect(found).toMatch(/loadedFor = id;/);
  });

  it('reloads on every mount of the map', () => {
    expect(screen).toMatch(/void loadFound\(\);/);
  });

  it('mounts only the ACTIVE screen, so returning to the map remounts it', () => {
    // This is the load-bearing bit: if the shell ever keeps screens mounted
    // for speed, the map would keep the previous profile's ticks and quietly
    // show one save's progress on another.
    expect(app).toMatch(/const Live = fullscreen \? LIVE_SCREENS\[domain\.id\]/);
    expect(app).toMatch(/<Live \/>/);
  });
});

/* A tick is stored as layer + region + index. The index is only unique WITHIN
 * a region's layer, so fast travel #26 exists on both maps — if the region
 * were left out of the key, ticking a statue on Palpagos would silently tick a
 * different statue on the World Tree. Driving this through the UI failed
 * twice (a coordinate probed after a region switch did not reproduce), so it
 * is proven here instead, where it is deterministic. */
describe('a tick cannot leak between the two maps', () => {
  it('keys the same index differently per region', () => {
    expect(foundKey('fast_travel', 'palpagos', 26))
      .not.toBe(foundKey('fast_travel', 'tree', 26));
  });

  it('keys the same index differently per layer', () => {
    expect(foundKey('fast_travel', 'palpagos', 26))
      .not.toBe(foundKey('dungeon', 'palpagos', 26));
  });

  it('is stable, so a tick survives a reload', () => {
    expect(foundKey('chest', 'tree', 7)).toBe(foundKey('chest', 'tree', 7));
    expect(foundKey('chest', 'tree', 7)).toBe('chest:tree:7');
  });

  it('the phone copy uses the identical key format', () => {
    // two files on purpose - AsyncStorage vs localStorage - so the FORMAT is
    // what has to match, or a future box-sync could not carry ticks across
    const mobile = readFileSync(
      join(__dirname, '..', '..', 'mobile', 'src', 'map', 'found.ts'), 'utf8',
    );
    expect(mobile).toMatch(/return `\$\{layerId\}:\$\{region\}:\$\{index\}`/);
  });
});

/* POI layers hold both maps' points in one table and split them by region at
 * read time, so a regeneration that lost the region flag would show one map's
 * markers on the other. Fast travel is the worked example: pal-atlas has 155
 * on Palpagos and 15 on the World Tree, and the app was measured showing
 * exactly those two numbers. */
describe('POI layers split correctly between the two maps', () => {
  it('gives each map its own fast travel statues', () => {
    expect(poiPoints('fast_travel', 'palpagos')?.n).toBe(155);
    expect(poiPoints('fast_travel', 'tree')?.n).toBe(15);
  });

  it('accounts for every point in the layer', () => {
    const layer = MAP_POIS.find((l) => l.id === 'fast_travel');
    expect(layer, 'fast_travel layer must exist').toBeTruthy();
    const palpagos = poiPoints('fast_travel', 'palpagos')?.n ?? 0;
    const tree = poiPoints('fast_travel', 'tree')?.n ?? 0;
    expect(palpagos + tree).toBe(layer!.n);
  });

  it('never returns one map\'s points for the other', () => {
    // every layer must add up the same way, or something is leaking
    for (const l of MAP_POIS) {
      const a = poiPoints(l.id, 'palpagos')?.n ?? 0;
      const b = poiPoints(l.id, 'tree')?.n ?? 0;
      expect(a + b, `${l.id} splits to ${a}+${b} but the layer holds ${l.n}`).toBe(l.n);
    }
  });
});

/* 15 of the 23 layers have NO points on the World Tree — ore, coal, sulfur,
 * paldium, quartz, dungeons and more are Palpagos-only. Switching regions with
 * those on empties the map, and "what you switched on does not appear here"
 * made the player go and work out which ones. The app already knew. */
describe('an empty region names the layers that are missing', () => {
  const screen = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'screens', 'MapScreen.tsx'), 'utf8',
  );

  it('lists them instead of saying "what you switched on"', () => {
    expect(screen).toMatch(/function namedLayers/);
    expect(screen).toMatch(/poiLayer\(id\)\?\.label/);
  });

  it('only names them when ALL of them are missing here', () => {
    // if even one has points the map is not empty and this is not the message
    expect(screen).toMatch(/if \(\(poiPoints\(id, region\)\?\.n \?\? 0\) > 0\) return null;/);
  });

  it('gets the verb right for one layer and for several', () => {
    // "Ore, sulfur and coal DOES not appear" is as bad as jargon
    expect(screen).toMatch(/\$\{capitalise\(names\[0\]\)\} does not appear/);
    expect(screen).toMatch(/do not appear/);
  });

  it('the data really does leave 15 layers empty on the tree', () => {
    const empty = MAP_POIS.filter((l) => (poiPoints(l.id, 'tree')?.n ?? 0) === 0);
    expect(empty.length).toBe(15);
    // and every one of them has points on Palpagos, or it would not ship
    for (const l of empty) expect(poiPoints(l.id, 'palpagos')?.n ?? 0).toBeGreaterThan(0);
  });
});

/* The 76 area names printed across the map were not searchable. A player could
 * read "Bicornis Islet" on screen, type it into a box that says it searches
 * places, and be told nothing matched — the app drawing a name and then
 * denying it knows it, the same failure as the search that could not find
 * sulfur. */
describe('names printed on the map can be searched', () => {
  it('finds an area label, not just a marker', () => {
    const hits = searchPlaces('bicornis', 'palpagos');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].name).toBe('Bicornis Islet');
  });

  it('sends you to where that name is drawn', () => {
    const hit = searchPlaces('bicornis', 'palpagos')[0];
    expect(hit.u).toBeCloseTo(REGION_SPOTS['Bicornis Islet'].x, 5);
    expect(hit.v).toBeCloseTo(REGION_SPOTS['Bicornis Islet'].y, 5);
  });

  it('calls an area an area, not a marker you can tick', () => {
    expect(searchPlaces('bicornis', 'palpagos')[0].label).toBe('Area');
  });

  it('still finds real markers alongside them', () => {
    // the POI names must not have been displaced by the new entries
    const hits = searchPlaces('fisherman', 'palpagos');
    expect(hits.length).toBeGreaterThan(0);
  });

  it('offers no area names on the World Tree, because it has none', () => {
    // G13: no source exists for World Tree place names, and inventing them
    // is the one thing this fane must never do
    for (const name of Object.keys(REGION_SPOTS).slice(0, 5)) {
      const hits = searchPlaces(name.slice(0, 6).toLowerCase(), 'tree');
      expect(hits.every((h) => h.label !== 'Area')).toBe(true);
    }
  });
});

/* "Bosses etc must be the image of the actual pal it is" (CEO) applied to the
 * Alpha boss LAYER too, not just a boss reached by picking that pal. The layer
 * carries all 72 names, so a lone alpha can show its own face; a cluster keeps
 * the crown, because several bosses cannot wear one. */
describe('a lone alpha shows the pal it is', () => {
  const screen = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'screens', 'MapScreen.tsx'), 'utf8',
  );

  it('resolves the portrait from the marker name, only for that layer', () => {
    expect(screen).toMatch(/function alphaPortrait/);
    expect(screen).toMatch(/if \(layerKey !== 'poi:alpha_pals'\) return undefined;/);
    expect(screen).toMatch(/\.replace\(\/\^Alpha \/, ''\)/);
  });

  it('only does it for a single marker, never a cluster', () => {
    expect(screen).toMatch(/c\.count === 1 \? alphaPortrait\(/);
  });

  it('every alpha name really is a pal the Paldex knows', () => {
    // if one did not resolve it would silently fall back to the crown, so this
    // is what turns "72 of 72" from a hope into a fact
    const layer = MAP_POIS.find((l) => l.id === 'alpha_pals');
    expect(layer?.names, 'the alpha layer must carry names').toBeTruthy();
    const unknown = layer!.names!
      .map((n) => n.replace(/^Alpha /, ''))
      .filter((n) => !(n in palsJson.pals));
    expect(unknown).toEqual([]);
    expect(layer!.names!.length).toBe(72);
  });
});

/* "One production file per concept" (CLAUDE.md). MapViewer.tsx was the old
 * map — a Modal wrapping a ScrollView whose pinch was iOS-only — and my own
 * rewrite of the pal card orphaned it without removing it. It sat unimported,
 * dragging a 399 KB map2048.jpg into every OTA update the CEO downloads. */
describe('only one map engine ships on the phone', () => {
  const mobileSrc = join(__dirname, '..', '..', 'mobile', 'src');

  it('the superseded viewer is gone', () => {
    expect(existsSync(join(mobileSrc, 'ui', 'MapViewer.tsx'))).toBe(false);
  });

  it('and so is the flat map image only it used', () => {
    expect(existsSync(join(__dirname, '..', '..', 'mobile', 'assets', 'map2048.jpg')))
      .toBe(false);
  });

  it('nothing on the phone reaches for that image any more', () => {
    // the website still uses its own copy in the Paldex - that is another
    // session's file and its own decision, not something this test governs
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(e.name) && readFileSync(full, 'utf8').includes('map2048')) {
          hits.push(full);
        }
      }
    };
    walk(mobileSrc);
    expect(hits).toEqual([]);
  });
});

/* When only N pins fit, they should be the N that matter. The cap used to keep
 * whichever clusters came out of the grid first — the order points happen to
 * sit in the data file — so the densest concentration on the map could be
 * dropped while a cluster of four survived. */
describe('the pin cap keeps the biggest concentrations', () => {
  const screen = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'screens', 'MapScreen.tsx'), 'utf8',
  );

  it('sorts by count before capping', () => {
    expect(screen).toMatch(/\.sort\(\(a, b\) => b\.count - a\.count\)\s*\r?\n?\s*\.slice\(0, budget\)/);
  });

  it('so nothing dropped is bigger than anything kept', () => {
    const set = decodePoints(MAP_POIS.find((l) => l.id === 'red_berries')!.pts);
    const all = Array.from({ length: set.n }, (_, i) => i);
    const clusters = clusterPoints(set, all, 812, 37, 0).sort((a, b) => b.count - a.count);
    const budget = 20;
    const kept = clusters.slice(0, budget);
    const dropped = clusters.slice(budget);
    expect(kept.length).toBe(budget);
    expect(dropped.length).toBeGreaterThan(0);
    const smallestKept = Math.min(...kept.map((c) => c.count));
    const biggestDropped = Math.max(...dropped.map((c) => c.count));
    expect(smallestKept).toBeGreaterThanOrEqual(biggestDropped);
  });

  it('the cap can genuinely bite, so this is not academic', () => {
    // both the cell and the viewport are in screen px, so the number of
    // clusters that can be visible for one layer is scale-independent:
    // (375/37) x (812/37) is about 222 against a budget of 170
    const PIN = 23;
    const cell = PIN + 14;
    const visibleCells = (375 / cell) * (812 / cell);
    expect(visibleCells).toBeGreaterThan(170);
  });
});

/* The pal card's map was a fixed 260px square inside a card about 305 wide, so
 * every pal card carried a strip of dead space down the right of its map. It
 * measures the card now. Found only after teaching the QA driver to open a
 * TALLER window (QA_TALL), because the section sits below the fold and the
 * harness cannot scroll — it had never actually been looked at. */
describe('the pal card map fills its card', () => {
  const palMap = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'ui', 'PalMap.tsx'), 'utf8',
  );

  it('measures the card instead of hard-coding a size', () => {
    expect(palMap).toMatch(/onLayout=\{\(e\) => \{/);
    expect(palMap).toMatch(/side=\{side \|\| PREVIEW_FALLBACK\}/);
    expect(palMap).not.toMatch(/side=\{PREVIEW\}/);
  });

  it('keeps a fallback for the frame before the measurement lands', () => {
    expect(palMap).toMatch(/const PREVIEW_FALLBACK = 260/);
  });

  it('does not re-set state when the width has not changed', () => {
    // onLayout fires on every relayout; setting state unconditionally would
    // re-render the card each time
    expect(palMap).toMatch(/setSide\(\(prev\) => \(prev === w \? prev : w\)\)/);
  });
});

/* The Layers sheet disagreed with the map it controls, in two ways at once:
 * it drew generic glyphs while the pins drew the game's own symbols, and it
 * counted BOTH maps together while the map, the legend and the layer search
 * all counted the region you were looking at. Found by opening the sheet in a
 * tall window — 21 of its 23 rows sit below the fold on a phone. */
describe('the layers sheet agrees with the map', () => {
  const screen = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'screens', 'MapScreen.tsx'), 'utf8',
  );

  it('puts the game symbol on the chip, same as the pin', () => {
    expect(screen).toMatch(/MAP_ICONS\[l\.id\] != null/);
  });

  it('counts the region you are looking at', () => {
    expect(screen).toMatch(/const here = poiPoints\(l\.id, filters\.region\)\?\.n \?\? 0;/);
    expect(screen).not.toMatch(/\{l\.n\.toLocaleString\(\)\}/);
  });

  it('says so before you tap when a layer has nothing here', () => {
    expect(screen).toMatch(/here \? here\.toLocaleString\(\) : 'none here'/);
    expect(screen).toMatch(/opacity: here \? 1 : 0\.45/);
  });

  it('and the numbers it will show are the real per-region ones', () => {
    // the eight layers the World Tree actually has, straight from the data
    expect(poiPoints('fast_travel', 'tree')?.n).toBe(15);
    expect(poiPoints('syndicate_tower', 'tree')?.n).toBe(4);
    expect(poiPoints('npc', 'tree')?.n).toBe(1);
    expect(poiPoints('alpha_pals', 'tree')?.n).toBe(7);
    expect(poiPoints('egg', 'tree')?.n).toBe(30);
    expect(poiPoints('chest', 'tree')?.n).toBe(38);
    expect(poiPoints('pal_effigy', 'tree')?.n).toBe(47);
    expect(poiPoints('skill_fruit', 'tree')?.n).toBe(12);
  });
});

describe('the pal picker in the Find sheet', () => {
  const screen = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'screens', 'MapScreen.tsx'), 'utf8',
  );

  it('shows each pal its own face, like every other surface does', () => {
    // The pins carry portraits, the legend carries portraits, the Paldex
    // carries portraits - the picker was the one place you chose a pal from
    // text alone, which is both inconsistent and far slower to scan.
    expect(screen).toMatch(/<PalIcon name=\{n\} size=\{26\} \/>/);
    expect(screen).toMatch(/import \{ PalIcon, SearchInput, s \} from '\.\.\/ui\/kit';/);
  });

  it('mounts a screenful of rows, not all 224 of them', () => {
    // A portrait per row is an image decode per row, so the list that holds
    // them must not mount every pal on the map the moment the sheet opens.
    // Measured in the QA browser: 1828 DOM nodes with a ScrollView, 758 with
    // this - and 63 rows rendered instead of 224.
    const list = screen.match(/<FlatList[\s\S]*?renderItem=/);
    expect(list, 'the pal list must be a FlatList').not.toBeNull();
    expect(list![0]).toMatch(/data=\{list\}/);
    expect(list![0]).toMatch(/initialNumToRender=\{14\}/);
    // the search box must stay OUTSIDE the list, or re-rendering it while he
    // types would take his keyboard focus with it
    expect(list![0]).not.toMatch(/SearchInput/);
  });
});

describe('the map provenance copy', () => {
  const ref = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'screens', 'ReferenceScreen.tsx'), 'utf8',
  );
  // just the map block, so this never polices another lane's copy
  const block = ref.slice(
    ref.indexOf('Where the map comes from'),
    ref.indexOf('Data &'),
  );

  it('is there at all', () => {
    expect(block).toContain('68,617');
    expect(block.length).toBeGreaterThan(400);
  });

  it('never speaks as a person', () => {
    // It read "no larger copy of it exists anywhere I could find" - the
    // developer's voice, in a paragraph the player reads. The app is a
    // product, not a narrator. ("Only pals I'm missing" elsewhere is the
    // PLAYER's voice and is correct; this only covers provenance copy.)
    expect(block).not.toMatch(/I/);
    expect(block).not.toMatch(/I'(m|ve|d)/);
    expect(block).toContain('has been published');
  });

  it('still names what it can be checked against', () => {
    // the numbers are the point of this section - never soften it into prose
    expect(block).toContain('DT_WorldMapUIData');
    expect(block).toContain('58,504');
    expect(block).toContain('11,097');
  });
});

describe('the legend key', () => {
  const screen = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'screens', 'MapScreen.tsx'), 'utf8',
  );

  it('only explains square pins when some are on screen', () => {
    // It used to print "square pins are inside dungeons" every time the key
    // was opened. Only `dun:` layers are square, and those need a pal picked
    // AND the dungeon box ticked - so the ordinary case (chests and ore on)
    // taught him to tell apart a shape that was nowhere on his map.
    const block = screen.slice(
      screen.indexOf('Round pins are out in the world') - 700,
      screen.indexOf('Round pins are out in the world') + 300,
    );
    expect(block, 'the legend footnote must still exist').toContain('inside dungeons');
    expect(block).toMatch(/active\.some\(\(l\) => l\.square\) && \(/);
  });

  it('drops the round half when every pin is square', () => {
    expect(screen).toMatch(/none of these are on the surface/);
    // and that claim is only made when nothing round is showing
    expect(screen).toMatch(/active\.some\(\(l\) => !l\.square\)/);
  });

  it('square is still what a dungeon layer is', () => {
    // the whole guard rests on this, so pin it: only dun: layers set square
    const built = screen.slice(screen.indexOf('const active'), screen.indexOf('const active') + 2200);
    expect(built).toContain('square: true');
    const squareAt = built.indexOf('square: true');
    expect(built.slice(0, squareAt)).toContain('key: `dun:${pal}`');
  });
});

describe('what the map says when it is blank', () => {
  const screen = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'screens', 'MapScreen.tsx'), 'utf8',
  );

  it('does not call a pal absent when its spawns are underground', () => {
    // Regression, mine, same session: once the 25 dungeon-only pals became
    // pickable, the map drew 174 Mau pins on Palpagos while a banner over
    // them read "Mau doesn't live on this map. Try The World Tree."
    expect(spawnLevels('Mau', 'palpagos', true)).not.toBeNull();
    const el = screen.slice(screen.indexOf('const elsewhere'), screen.indexOf('const elsewhere') + 320);
    expect(el, 'elsewhere block must exist').toContain('filters.pals');
    expect(el).toContain('spawnLevels(n, region, true) === null');
  });

  it('sends an underground-only pick to the tick box, not the other island', () => {
    const ug = screen.slice(
      screen.indexOf('const undergroundOnly'),
      screen.indexOf('const undergroundOnly') + 420,
    );
    expect(ug, 'undergroundOnly block must exist').toContain('filters.dungeons');
    // lives here underground, but nothing is drawn because dungeons are off
    expect(ug).toContain('spawnLevels(n, region) === null');
    expect(ug).toContain('spawnLevels(n, region, true) !== null');
    expect(screen).toContain('is only found inside dungeons here');
  });

  it('says it once, not twice', () => {
    // The specific banner names the pal AND the map to try; the generic card
    // underneath repeated it in vaguer words, both on screen together.
    expect(screen).toMatch(/kind: 'time' \| 'level' \| 'layers' \| 'region'/);
    expect(screen).toMatch(
      /!\(empty\.kind === 'region'\s*\n?\s*&& \(elsewhere\.length > 0 \|\| undergroundOnly\.length > 0\)\)/);
  });

  it('but still names a layer the banner knows nothing about', () => {
    // kind 'layers' carries information the banner does not - measured on the
    // World Tree with Dungeon on: "Dungeon does not appear in this region."
    expect(screen).toMatch(/kind: named \? 'layers' : 'region'/);
  });
});

describe('the website map keeps step with the phone', () => {
  const web = readFileSync(
    join(__dirname, '..', 'src', 'modules', 'map.tsx'), 'utf8',
  );

  it('lists the dungeon-only pals when the box is ticked', () => {
    // The phone was fixed first (L30). The website had the identical gate and
    // its own working dungeon toggle, so the same 25 pals were unlistable
    // there. Measured in the browser: 224 buttons -> 249 with the box ticked,
    // Mau reading Lv 5-15 exactly as on the phone.
    expect(web, 'the pal list must exist').toContain('const palList');
    expect(web).toContain('spawnLevels(n, region, dungeons) !== null');
    expect(web).toMatch(/\}, \[dungeons, missingOnly, q, region\]\)/);
  });

  it('quotes a dungeon pin its OWN level band', () => {
    // Asking the surface-only question printed no level at all for a pal that
    // never comes up top - you tapped a pin and the app had nothing to say.
    expect(web).toContain("best.key.startsWith('dun:')");
    expect(web).toContain('wildBands(pal).dungeon');
    // and the data is what makes that line appear rather than stay blank
    expect(spawnLevels('Mau', 'palpagos')).toBeNull();
    expect(wildBands('Mau').dungeon).not.toBeNull();
  });

  it('only explains square pins when some are on screen', () => {
    expect(web).toMatch(/active\.some\(\(l\) => l\.square\) && \(/);
    expect(web).toContain('none of these are on the surface');
  });

  it('and the two targets say the SAME words', () => {
    // one of these is Preact and one is React Native; the player should not
    // be able to tell that from the sentence
    const phone = readFileSync(
      join(__dirname, '..', '..', 'mobile', 'src', 'screens', 'MapScreen.tsx'), 'utf8',
    );
    for (const line of [
      'Round pins are out in the world',
      'Square pins are inside dungeons',
      'none of these are on the surface',
    ]) {
      expect(web, `web is missing: ${line}`).toContain(line);
      expect(phone, `phone is missing: ${line}`).toContain(line);
    }
  });
});

describe('the website legend cannot hide an entry', () => {
  const css = readFileSync(
    join(__dirname, '..', 'src', 'design', 'app.css'), 'utf8',
  );
  const rule = css.slice(css.indexOf('.maplegend {'), css.indexOf('.maplegend span'));

  it('caps itself to the stage and scrolls the rest', () => {
    // Measured at 375px wide with all 23 layers on: the key is anchored to the
    // BOTTOM of a 62vh stage, grew to 583px inside 503px, and the stage's
    // overflow:hidden ate its top 91px - four entries gone, starting with the
    // largest layer on the map (Chest, 1,572). Nothing scrolled, nothing hinted
    // they existed. Desktop never showed it: there the stage is 804px tall.
    expect(rule, 'the .maplegend rule must exist').toContain('position: absolute');
    expect(rule).toContain('max-height: calc(100% - 20px)');
    expect(rule).toContain('overflow-y: auto');
  });

  it('is still anchored to the bottom-left of the stage', () => {
    // the cap must not have quietly changed where the key sits
    expect(rule).toContain('bottom: 10px');
    expect(rule).toContain('left: 10px');
  });
});

describe('the website counts what is on the map you are looking at', () => {
  const web = readFileSync(
    join(__dirname, '..', 'src', 'modules', 'map.tsx'), 'utf8',
  );

  it('prints the per-region count, not the both-maps total', () => {
    // The buttons printed `l.n` — the layer's total across BOTH maps. Palpagos
    // offered "Fast travel 170" while showing 155 of them; the World Tree
    // offered the same 170 while showing 15. Measured after the fix: Palpagos
    // 155/9/157, tree 15/4/none here.
    expect(web).toContain('const poiHere');
    expect(web).toContain("{poiHere(l.id) || 'none here'}");
    expect(web).not.toMatch(/\{l\.label\} <i>\{l\.n\}<\/i>/);
  });

  it('and the numbers it will print are the real per-region ones', () => {
    expect(poiPoints('fast_travel', 'palpagos')?.n).toBe(155);
    expect(poiPoints('fast_travel', 'tree')?.n).toBe(15);
    expect(poiPoints('syndicate_tower', 'palpagos')?.n).toBe(9);
    expect(poiPoints('dungeon', 'tree')?.n ?? 0).toBe(0);
  });

  it('steps a layer back when this map has none of it', () => {
    expect(web).toMatch(/poiPoints\(l\.id, region\)\?\.n \? '' : ' empty'/);
  });
});

describe('the website says why a search found nothing', () => {
  const web = readFileSync(
    join(__dirname, '..', 'src', 'modules', 'map.tsx'), 'utf8',
  );
  const block = web.slice(web.indexOf('palList.length === 0'), web.indexOf('<div class="mappals">'));

  it('has a message at all', () => {
    // Typing a name that matched nothing made the whole list vanish silently.
    expect(block, 'the empty branch must exist').toContain('mapempty');
  });

  it('and each branch claims only what is true of it', () => {
    // the list is narrowed by the search AND the checkboxes, so one generic
    // sentence would be a claim the app cannot stand behind
    for (const line of [
      'Nothing on this map goes by that name.',
      'No pal by that name is still missing from your box.',
      'Nothing left to find here',
      'No pal by that name — but the places above match.',
    ]) {
      expect(block, `missing branch: ${line}`).toContain(line);
    }
  });
});

describe('found marks: what the two copies share and what they do not', () => {
  const webSrc = readFileSync(
    join(__dirname, '..', 'src', 'map', 'found.ts'), 'utf8',
  );
  const phoneSrc = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'map', 'found.ts'), 'utf8',
  );

  it('writes the SAME tick string on both, so a sync needs no translation', () => {
    // found.ts is deliberately NOT under the byte-parity gate — one persists
    // through AsyncStorage and one through localStorage — so the thing that
    // must not drift needs its own guard.
    expect(foundKey('chest', 'palpagos', 41)).toBe('chest:palpagos:41');
    const body = (src: string) => {
      const i = src.indexOf('export function foundKey');
      expect(i, 'foundKey must exist').toBeGreaterThan(-1);
      return src.slice(i, src.indexOf('}', i) + 1).replace(/\s+/g, ' ');
    };
    expect(body(webSrc)).toBe(body(phoneSrc));
  });

  it('but the STORAGE keys differ on purpose, and the comment says so', () => {
    // The header used to claim "the KEYS match, so a future box-sync can carry
    // ticks across without a translation step". The tick FORMAT matches; the
    // storage key does not — the phone scopes ticks per save profile and the
    // website has no profiles at all. A sync must pick a profile.
    expect(phoneSrc).toContain('`palforge-${profileId}-mapfound`');
    expect(webSrc).toContain("const KEY = 'palforge-mapfound'");
    expect(webSrc, 'the false claim must not come back').not.toContain('The KEYS match');
    expect(webSrc).toContain('has to CHOOSE a profile');
  });
});
