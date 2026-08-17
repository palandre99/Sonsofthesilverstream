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
// the share codec is PURE (no react-native imports), so the gate can run it
import { decodeRoute, encodeRoute } from '../../mobile/src/map/routeShare';
import {
  closeMatches, isNightOnly, poiLayers, poiPoints, searchPlaces, spawnablePals, spawnLevels,
  spawnPoints, spawnSplit,
  emptyFilters, hasNames, listSortKey, namedPoints, subsetWithIndex, whereFrom, whereFromLine, wildBands,
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

/* A place name must appear where that place IS — and STAY there while the
 * finger moves. The edge-slide era (labels clamped inside the frame so they
 * never clipped mid-word) ended with the CEO's 20:10 report: during a pan
 * the clamped names visibly detached from the terrain. Labels are glued to
 * their anchor now; at the frame edge they clip and re-enter whole, the way
 * every real map behaves. The old "dragged in from off screen" fault class
 * is structurally impossible without a clamp. */
describe('place names are GLUED to their places', () => {
  const canvas = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'map', 'MapCanvas.tsx'), 'utf8',
  );
  const screen = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'screens', 'MapScreen.tsx'), 'utf8',
  );

  it('no slide, no clamp, no separate label component', () => {
    expect(canvas).not.toMatch(/function ScreenPin\(/);
    expect(canvas).not.toMatch(/Math\.max\(halfWidth, raw\)/);
    expect(canvas).not.toContain('halfWidth');
    expect(screen).not.toContain('halfWidth');
  });

  it('labels ride the same screen-space anchor as every pin', () => {
    const at = canvas.indexOf('screenMarkers?.map');
    expect(at, 'labels must render').toBeGreaterThan(-1);
    expect(canvas.slice(at, at + 300)).toContain('<MarkerPin');
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

  it('measures the ceiling in DEVICE pixels, then deliberately zooms past it', () => {
    // The scale is CSS px per uv, but a phone draws 3 device px for each, so
    // texture/dpr is where one texture pixel meets one device pixel. That was
    // the hard cap, and it is still where the GROUND stops gaining detail.
    // It is no longer where zooming stops: "able to zoom way further in ..
    // chests, small stuff may be hidden" (CEO, 2026-08-17). Pins and labels
    // are fixed-size so they stay crisp, and only more zoom pulls overlapping
    // markers apart. Reach went 3.2x -> 9.6x on his phone.
    expect(canvas).toMatch(/PixelRatio/);
    expect(canvas).toMatch(/const OVERZOOM = 7;/);
    expect(canvas).toMatch(/\(texture \* OVERZOOM\) \/ PixelRatio\.get\(\)/);
    // the honest half: past that point the ground is magnified, and the
    // comment has to keep saying so
    expect(canvas).toMatch(/Only the ground softens/);
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

  it('draws every pin in SCREEN space, like the labels', () => {
    // The counter-scale era ended with his 20:05 screenshots: place names
    // (screen space) razor-sharp beside pins (inside the transform) that
    // blurred deeper with every zoom level. iOS rasterises the subtree at
    // its intermediate counter-scaled size and magnifies that raster, so
    // net-scale-1 still renders soft. MarkerPin translates in screen space
    // — same worklet count since M28, true resolution at every zoom.
    expect(canvas).toContain('function MarkerPin');
    expect(canvas).not.toContain('function CounterScaled');
    expect(canvas).not.toMatch(/const pinStyle = useAnimatedStyle/);
    // and the tile container's style is attached to exactly one view
    expect(canvas.split('mapStyle,').length - 1).toBe(1);
  });

  it('leaves the text outside the transform, where it stays crisp', () => {
    // text inside the transform is rasterised pre-zoom then magnified, which
    // came out jagged on the phone; labels ride MarkerPin since the glue fix
    expect(canvas).toMatch(/<MarkerPin key=\{m\.key\}/);
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

  it('tiles overlap with their neighbours REAL pixels, not a stretched bleed', () => {
    // The bleed era stretched a tile's own edge to cover hairline gaps; at
    // 7x overzoom that stretch was a visible band — the hard vertical seam
    // in his 22:39 screenshot. Tiles are baked with a 2-real-pixel gutter of
    // neighbour art now, so adjacent tiles overlap with identical pixels
    // and a seam is physically impossible at any zoom.
    expect(canvas).not.toContain('const bleed');
    expect(canvas).toContain('const g = (TILE_GUTTER * BASE) / (TILE_PX * n)');
    expect(canvas).toContain('left: x * step - g');
    expect(canvas).toContain('width: step + 2 * g');
    const tools = readFileSync(
      join(__dirname, '..', '..', 'tools', 'build_map_tiles.py'), 'utf8',
    );
    expect(tools).toContain('GUTTER = 2');
    expect(tools).toContain('mode="edge"');
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
    // the count expression grew a found-progress branch; the claim here is
    // only that an empty layer says so in words before you tap
    expect(screen).toContain(": 'none here'");
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
    // anchored on the PAL sheet's own list — the layer list is a FlatList
    // too now, with its own budget
    const at = screen.indexOf('data={list}');
    expect(at, 'the pal list must exist').toBeGreaterThan(-1);
    const list = [screen.slice(screen.lastIndexOf('<FlatList', at), at + 400)];
    expect(list[0]).toMatch(/data=\{list\}/);
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
    const built = screen.slice(screen.indexOf('const active'), screen.indexOf('const active') + 3600);
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

describe('does zooming further actually separate the small stuff', () => {
  // "It's also very difficult to see exactly where stuff is, pals is one thing
  // but chests .. small stuff may be hidden" (CEO, 2026-08-17). Reach went
  // 3.2x -> 9.6x for this reason, so the claim needs checking against the real
  // chest positions rather than assumed.
  const chests = poiPoints('chest', 'palpagos')!;
  const all = Array.from({ length: chests.n }, (_, i) => i);

  const clustersAt = (scale: number) => clusterPoints(chests, all, scale, 34, 0).length;

  it('there are 1,572 chests to pull apart', () => {
    expect(chests.n).toBe(1572);
  });

  it('every step of zoom breaks more of them out', () => {
    const floor = 852;                 // COVER on his phone
    const oldCeiling = 8192 / 3;       // 2730 — where zoom used to stop
    const newCeiling = 8192;           // 9.6x

    const atFloor = clustersAt(floor);
    const atOld = clustersAt(oldCeiling);
    const atNew = clustersAt(newCeiling);

    // more zoom must never merge markers back together
    expect(atOld).toBeGreaterThan(atFloor);
    expect(atNew).toBeGreaterThan(atOld);

    // and the new ceiling must be worth having: it has to resolve a big
    // fraction of the 1,572 into their own pins, which the old one did not
    expect(atOld / chests.n).toBeLessThan(0.75);
    expect(atNew / chests.n).toBeGreaterThan(0.9);
  });

  it('and at the deepest zoom almost every chest stands alone', () => {
    const singles = clusterPoints(chests, all, 8192, 34, 0).filter((c) => c.count === 1).length;
    // the number that matters to a player looking for ONE chest
    expect(singles / chests.n).toBeGreaterThan(0.85);
  });
});

describe('the map answers "is this even accurate"', () => {
  const screen = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'screens', 'MapScreen.tsx'), 'utf8',
  );

  it('says where the spots come from, on the map itself', () => {
    // "idk if it's accurate even?" — CEO, 2026-08-17. The answer existed in
    // four independent proofs and lived in the Reference tab, which is not
    // where anyone doubting a pin is looking. One line in the key.
    expect(screen).toContain("Every spot is read from the game");
    expect(screen).toContain('estimated or crowd-guessed');
  });

  it('and only while the key is open, so it never becomes clutter', () => {
    const legend = screen.slice(
      screen.indexOf('{legend && ('),
      screen.indexOf('onPress={() => setLegend'),
    );
    expect(legend, 'the legend block must exist').toContain('active.map');
    expect(legend).toContain('estimated or crowd-guessed');
  });

  it('and the claim it makes is one the repo can back', () => {
    // the line says NOTHING is estimated — that is only true while every
    // layer carries real datamined points, so tie it to the data
    for (const id of ['chest', 'ore', 'dungeon', 'fast_travel']) {
      expect(poiPoints(id, 'palpagos')!.n).toBeGreaterThan(0);
    }
    expect(MAP_POIS.length).toBeGreaterThan(20);
  });
});

describe('the map respects Reduce Motion', () => {
  const canvas = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'map', 'MapCanvas.tsx'), 'utf8',
  );

  it('asks the phone, and keeps listening', () => {
    // Blueprint §5 criterion 12: "motion is physical and cancelable ...
    // reduced-motion respected". The map glides the ENTIRE world for 220-320ms
    // on double-tap zoom, on framing a species, and on "back to the whole
    // map" — precisely the large-field movement that makes people ill.
    expect(canvas).toContain('AccessibilityInfo.isReduceMotionEnabled()');
    // and honour it being switched on WHILE the app is open
    expect(canvas).toContain("addEventListener('reduceMotionChanged'");
    expect(canvas).toContain('sub.remove()');
  });

  it('every animation in the file goes through it — none left behind', () => {
    const durations = canvas.match(/duration: [^}]+/g) ?? [];
    expect(durations.length, 'the map must still animate something').toBeGreaterThan(5);
    for (const d of durations) {
      expect(d, `an animation escaped the reduced-motion switch: ${d}`).toContain('* glide');
    }
  });

  it('and the destination is unchanged — only the sweep goes', () => {
    // glide multiplies DURATION only. If it ever touched a target value the
    // map would end up somewhere different for these users, which would be a
    // far worse bug than the one being fixed.
    expect(canvas).toMatch(/const glide = useReducedMotion\(\) \? 0 : 1;/);
    expect(canvas).not.toMatch(/withTiming\([^,]*glide/);
  });
});

describe('the map feels the same everywhere you change something', () => {
  const screen = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'screens', 'MapScreen.tsx'), 'utf8',
  );

  it('every state change on the map gives feedback, not three out of five', () => {
    // Blueprint §5 criterion 15, "system haptics". The map already ticked on
    // the level cap, a layer toggle and picking a pal — but was silent on
    // marking a spot found and on switching region. Same class of action,
    // inconsistent by accident rather than by choice.
    for (const fn of ['setLevelCap', 'togglePoi', 'togglePal']) {
      const body = screen.slice(screen.indexOf(`const ${fn} =`), screen.indexOf(`const ${fn} =`) + 260);
      expect(body, `${fn} must exist`).toContain('setFilters');
      expect(body, `${fn} lost its haptic`).toContain('Haptics.');
    }
    // the two that were missing
    const found = screen.slice(screen.indexOf('toggleFound(focus.mark!)') - 700,
      screen.indexOf('toggleFound(focus.mark!)') + 40);
    expect(found).toContain('Haptics.impactAsync');
    const region = screen.slice(screen.indexOf('patch({ region: r.id as RegionId })') - 400,
      screen.indexOf('patch({ region: r.id as RegionId })') + 60);
    expect(region).toContain('Haptics.selectionAsync');
  });

  it('the commit action feels different from a selection', () => {
    // marking found is the only map action that writes to disk and survives a
    // restart; it should not feel identical to flicking a filter on
    expect(screen).toContain('Haptics.ImpactFeedbackStyle.Light');
  });

  it('and switching to the region you are already on stays silent', () => {
    // a tick for a tap that changes nothing is noise
    expect(screen).toMatch(/if \(r\.id !== region\) void Haptics\.selectionAsync\(\);/);
  });
});

describe('the first-run hint teaches the thing nobody else has', () => {
  const screen = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'screens', 'MapScreen.tsx'), 'utf8',
  );

  it('names the wedge once there is a box to filter', () => {
    // Blueprint §5 criterion 10: empty states TEACH the killer feature. The
    // hint taught the two BUTTONS — which are already on screen — and never
    // mentioned "only pals I'm missing", the one thing this map does that no
    // competitor does, and which is buried two taps deep inside Find.
    expect(screen).toContain('still missing');
    expect(screen).toMatch(/const ownsSomething = useMemo\(\) => Object\.keys\(pals\)\.some\(ownedAny\)|const ownsSomething = useMemo\(/);
  });

  it('but not to an empty box, where the filter would do nothing', () => {
    // everything is missing when you own nothing, so that hint would teach a
    // no-op. The buttons are the right lesson then.
    expect(screen).toContain('a pal, or');
    expect(screen).toContain('for chests, ore and dungeons');
    // both branches must hang off the same test
    const block = screen.slice(screen.indexOf('{ownsSomething ? ('), screen.indexOf('{ownsSomething ? (') + 900);
    expect(block, 'the hint must branch on the box').toContain('still missing');
    expect(block).toContain('for chests, ore and dungeons');
  });

  it('and it is still ONE line, dismissible, and shown only on a blank map', () => {
    // it was a five-line explainer covering a third of the map once
    const guard = screen.slice(
      screen.indexOf('{active.length === 0 && !sheet && !hintOff'),
      screen.indexOf('{active.length === 0 && !sheet && !hintOff') + 200,
    );
    expect(guard, 'the hint guard must exist').toContain('hintOff');
    expect(guard).toContain('filters.pals.size === 0');
    expect(guard).toContain('filters.poi.size === 0');
    expect(screen).toContain('setHintOff(true)');
  });
});

describe('a mistyped pal name gets rescued', () => {
  const onMap = spawnablePals().filter((n) => spawnLevels(n, 'palpagos') !== null);

  it('catches the typos a thumb actually makes', () => {
    // Blueprint §5 criterion 2 asks for FUZZY search. Ours was a substring
    // match, which is right for the common path and gives NOTHING for a
    // transposition — and pal names are invented words typed on glass.
    expect(closeMatches('foxpraks', onMap)).toContain('Foxparks');   // transposed
    expect(closeMatches('lupmoon', onMap)).toContain('Loupmoon');    // dropped
    expect(closeMatches('blazehowel', onMap)).toContain('Blazehowl'); // inserted
    expect(closeMatches('katres', onMap)).toContain('Katress');      // dropped
  });

  it('matches a word inside a name, not just the whole thing', () => {
    // "ignis" should still reach "Katress Ignis" even mistyped
    expect(closeMatches('ignsi', onMap).some((n) => n.includes('Ignis'))).toBe(true);
  });

  it('and REFUSES to guess when there is nothing close — the part that matters', () => {
    // A rescue that fires on anything is worse than none: it would put four
    // confident wrong answers under "Did you mean".
    expect(closeMatches('zzzzqq', onMap)).toEqual([]);
    expect(closeMatches('qwertyuiop', onMap)).toEqual([]);
    // two letters is a prefix, not a typo — it would match half the box
    expect(closeMatches('fo', onMap)).toEqual([]);
    expect(closeMatches('', onMap)).toEqual([]);
  });

  it('is stricter on short names, where one slip is most of the word', () => {
    // cap is 1 below 6 characters. "mau" must not drag in "may"-ish noise.
    const short = closeMatches('mau', onMap);
    for (const n of short) expect(n.length).toBeLessThanOrEqual(6);
  });

  it('is only consulted when the exact search came back empty', () => {
    const screen = readFileSync(
      join(__dirname, '..', '..', 'mobile', 'src', 'screens', 'MapScreen.tsx'), 'utf8',
    );
    expect(screen).toMatch(/list\.length === 0 && q\.trim\(\) \? closeMatches\(q, base, 4\) : \[\]/);
    expect(screen).toContain('Did you mean');
  });
});

describe('the map stamps the build its data came from', () => {
  const screen = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'screens', 'MapScreen.tsx'), 'utf8',
  );
  const meta = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'data', 'mapMeta.g.ts'), 'utf8',
  );

  it('and the stamp is the one the data was actually generated from', () => {
    // Blueprint §5 criterion 1 wants build number AND proof together, and says
    // that combination is ours — nobody else does both. The key claimed the
    // data is datamined without ever saying WHICH build, which is the half
    // that tells you it is not two patches stale.
    //
    // The build id lives in a GENERATED header ("DO NOT EDIT"), so the UI
    // string is written by hand — which makes it exactly the kind of claim
    // that rots silently. This reads the real value out of the generator's
    // own output and fails if the two ever disagree.
    const fromData = /build (\d+)/.exec(meta);
    expect(fromData, 'mapMeta.g.ts must state the build it came from').not.toBeNull();
    expect(screen).toContain(`Game build ${fromData![1]}`);
  });

  it('and states the date in a form a player reads, not an ISO stamp', () => {
    const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(meta);
    expect(iso, 'mapMeta.g.ts must carry a generation date').not.toBeNull();
    const [, y, mo, d] = iso!;
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
      'August', 'September', 'October', 'November', 'December'];
    expect(screen).toContain(`${Number(d)} ${months[Number(mo) - 1]} ${y}`);
    // and never the raw form in front of a player
    const key = screen.slice(screen.indexOf('estimated or crowd-guessed'));
    expect(key.slice(0, 120)).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

describe("the player's own pins", () => {
  const store = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'map', 'pins.ts'), 'utf8',
  );
  const screen = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'screens', 'MapScreen.tsx'), 'utf8',
  );

  it('is its own store, scoped to the save you are on', () => {
    // Same shape as map/found.ts and for the same reason: store.ts belongs to
    // another session, and a player's pins have no business loading before
    // the Paldex does.
    expect(store).toContain('getActiveProfile');
    expect(store).toMatch(/`palforge-\$\{profileId\}-mappins`/);
    expect(store).toContain('AsyncStorage');
  });

  it('refuses a pin that is not on the map, instead of clamping it', () => {
    // A pin silently moved to the edge is a pin pointing at the wrong place,
    // and this fane's one unforgivable bug is stating a place is somewhere it
    // is not.
    expect(store).toMatch(/if \(!\(u >= 0 && u <= 1 && v >= 0 && v <= 1\)\) return null;/);
  });

  it('survives a half-written or hand-edited file', () => {
    // the map must not go down because one row on disk is malformed
    expect(store).toContain('parsed.filter(isPin)');
    expect(store).toMatch(/p\.region === 'palpagos' \|\| p\.region === 'tree'/);
  });

  it('keeps each map separate', () => {
    // a mark dropped on Palpagos must never appear on the World Tree
    expect(store).toMatch(/pins\.filter\(\(p\) => p\.region === region\)/);
    expect(store).toMatch(/pins\.filter\(\(p\) => p\.region !== region\)/);   // clear one map only
  });

  it('is placed by a button, NOT by another gesture', () => {
    // Composing a long-press into the existing pan/pinch/tap is what produced
    // the release-snap the CEO reported three times, and native gesture
    // behaviour cannot be proved from a browser. This is deliberate.
    expect(screen).toContain('Mark this spot');
    expect(screen).not.toMatch(/Gesture\.LongPress/);
  });

  it("and the player's pins are never clustered away", () => {
    // there are a handful, they are the only markers the player put there,
    // and one vanishing into a cluster badge would make the feature
    // untrustworthy
    const block = screen.slice(screen.indexOf('const myPins'), screen.indexOf('const myPins') + 900);
    expect(block, 'myPins must exist').toContain('pinsIn(region)');
    expect(block).not.toContain('clusterPoints');
  });

  it('uses a colour MEASURABLY far from every data layer', () => {
    // A mark you made must never be mistaken for something the game files
    // put there. Exact-match checking already failed once: MY_PIN was
    // #FF8FB1 and Skill fruit is #FF8FB0 — distance 1.0, visually the same
    // colour, and the set-membership test waved it through. The bar is 40
    // RGB-units, ~2.4x the data palette's own closest pair (17, two reds
    // told apart by their glyphs).
    const mine = /const MY_PIN = '#([0-9A-Fa-f]{6})'/.exec(screen);
    expect(mine, 'the pin colour must be named once').not.toBeNull();
    const rgb = (h: string) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    const dist = (a: string, b: string) => Math.hypot(
      ...rgb(a).map((x, i) => x - rgb(b)[i]),
    );
    for (const l of poiLayers()) {
      expect(dist(mine![1], l.colour.slice(1)), `too close to ${l.id} ${l.colour}`)
        .toBeGreaterThanOrEqual(40);
    }
  });
});

describe('your marks are accounted for like everything else on the map', () => {
  const screen = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'screens', 'MapScreen.tsx'), 'utf8',
  );

  it('the key lists them, so the pink is never an unexplained colour', () => {
    expect(screen).toContain('My marks');
    const row = screen.slice(screen.indexOf('My marks') - 900, screen.indexOf('My marks') + 200);
    expect(row).toContain('MY_PIN');
    expect(row).toContain('myPins.length');
  });

  it('and the key OPENS for marks alone, not only for data layers', () => {
    // shownCount counts datamined points, so with only your own marks on the
    // map the key stayed hidden and the pin colour went unexplained.
    // the guard has since grown a third clause for the route — the claim
    // here is that MARKS alone still open the key, which the wider guard
    // keeps true
    expect(screen).toMatch(/shownCount > 0 \|\| myPins\.length > 0 \|\| myRoute\.length > 0/);
  });

  it('never says "0 spots" while your marks are sitting on the map', () => {
    // the map contradicting itself is the exact bug this fane keeps getting
    // caught by (cf. the Mau banner)
    expect(screen).toMatch(/shownCount > 0\s*\n?\s*\? `\$\{shownCount\.toLocaleString\(\)\}/);
    // "1 of my mark" was broken English and "N of my marks" implied a subset
    expect(screen).toContain("? 'My mark'");
    expect(screen).toContain('`My ${myPins.length} marks`');
  });

  it('and counts them SEPARATELY from the datamined spots', () => {
    // "1,575" would quietly blend what the game files know with what the
    // player put there. The two numbers must never be summed.
    expect(screen).not.toMatch(/shownCount \+ myPins\.length/);
    expect(screen).not.toMatch(/myPins\.length \+ shownCount/);
  });

  it('can be cleared for THIS map only, without touching the other one', () => {
    // it clears ALL of them on this map, so it must not read like a subset
    expect(screen).toContain("'Clear my mark'");
    expect(screen).toContain('`Clear my ${myMarks} marks`');
    expect(screen).toContain('clearPins(region)');
  });
});

describe('naming a mark', () => {
  const store = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'map', 'pins.ts'), 'utf8',
  );
  const screen = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'screens', 'MapScreen.tsx'), 'utf8',
  );

  it('caps and trims in the STORE, not in whichever caller remembers to', () => {
    // The label is player text — the one kind of string this app does not
    // control. Measured: 72 characters typed in, 40 stored, and the card
    // truncates with an ellipsis instead of growing past the screen.
    expect(store).toContain('export const PIN_LABEL_MAX = 40;');
    expect(store).toMatch(/label\.trim\(\)\.slice\(0, PIN_LABEL_MAX\)/);
  });

  it('refuses to store an empty name at all', () => {
    // a nameless mark is a mark you cannot tell from any other
    expect(store).toMatch(/if \(!clean\) return;/);
  });

  it('and the screen falls back to WHERE THE MARK IS when you clear the name', () => {
    // so clearing the box gives you the coordinates back, never a blank pin
    const save = screen.slice(screen.indexOf('const next = draft.trim()') - 400,
      screen.indexOf('const next = draft.trim()') + 120);
    expect(save, 'the save handler must exist').toContain('uvToReadout');
    expect(save).toMatch(/draft\.trim\(\) \|\| `\$\{at\.x\}, \$\{at\.y\}`/);
  });

  it('cancel writes NOTHING — the mark is exactly as it was', () => {
    // measured: typed a new name, cancelled, the stored label was unchanged
    const cancel = screen.slice(screen.indexOf('// Cancel must leave the mark'),
      screen.indexOf('// Cancel must leave the mark') + 260);
    expect(cancel, 'the cancel branch must exist').toContain('setDraft(null)');
    expect(cancel).not.toContain('renamePin');
  });

  it('closing the card throws a half-typed name away too', () => {
    expect(screen).toMatch(/setOpenPin\(null\); setDraft\(null\);/);
  });

  it('and a long name truncates rather than widening the card', () => {
    const row = screen.slice(screen.indexOf('{openPin.label}') - 420,
      screen.indexOf('{openPin.label}') + 30);
    expect(row, 'the label row must exist').toContain('numberOfLines={1}');
    expect(row).toContain('maxWidth');
  });
});

describe('a mark card belongs to the map it is on', () => {
  const screen = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'screens', 'MapScreen.tsx'), 'utf8',
  );

  it('closes when you switch island', () => {
    // Found by hostile review of my own night's work, then reproduced:
    // open a Palpagos mark's card, switch to the World Tree, and the card
    // stayed on screen with ZERO of its pins drawn underneath — and its
    // Remove button would have deleted a mark on the island you just left.
    // Same fault as the Mau banner: the map asserting something about a place
    // that is not here.
    const effect = screen.slice(
      screen.indexOf('if (prevRegion.current !== null'),
      screen.indexOf('if (prevRegion.current !== null') + 1200,
    );
    expect(effect, 'the region-change effect must exist').toContain('canvas.current?.reset()');
    expect(effect).toContain('setOpenPin(null)');
    expect(effect).toContain('setDraft(null)');
    // the focus card names a POI or readout of the island you just left —
    // found surviving the switch in QA while walking the routes work
    expect(effect).toContain('setFocus(null)');
  });

  it('and only when the region actually CHANGED, not on first mount', () => {
    // closing it on mount would be harmless but wrong; the guard is what makes
    // the auto-focus from a pal card survive
    expect(screen).toMatch(/prevRegion\.current !== null && prevRegion\.current !== region/);
  });
});

describe('the level caps sit on one row', () => {
  const screen = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'screens', 'MapScreen.tsx'), 'utf8',
  );

  it('scroll sideways instead of wrapping 4+1', () => {
    // Five chips do not fit 343pt, and flexWrap stranded "Up to 60" alone on
    // a second line — a layout accident, not a control. Found by the brutal
    // self-eval the CEO ordered; measured after: five chips, one distinct row
    // top, the fifth peeking past the edge as its own scroll hint.
    const at = screen.indexOf('{LEVEL_CAPS.map((cap) => {');
    expect(at, 'the chips block must exist').toBeGreaterThan(-1);
    const before = screen.slice(at - 700, at);
    expect(before).toContain('horizontal');
    expect(before).toContain('showsHorizontalScrollIndicator={false}');
    expect(before).not.toContain("flexWrap: 'wrap'");
  });
});

describe('renaming a mark offers exactly the two verbs that end an edit', () => {
  const screen = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'screens', 'MapScreen.tsx'), 'utf8',
  );

  it('hides Remove and Close while a name is being typed', () => {
    // Eval round 2: mid-edit the card showed FOUR buttons, one of them Remove
    // — deleting the whole mark one slip away from Save. Verified live: view
    // mode shows Rename/Remove/Close, edit mode shows Save/Cancel only.
    const at = screen.indexOf("removePin(openPin.id)");
    expect(at, 'the remove handler must exist').toBeGreaterThan(-1);
    const before = screen.slice(at - 700, at);
    expect(before).toContain('draft === null && (');
  });
});

describe('round-3 fixes hold', () => {
  const screen = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'screens', 'MapScreen.tsx'), 'utf8',
  );

  it('layers this map has come before the ones it lacks', () => {
    // On the World Tree 15 of 23 layers are empty and the wide "none here"
    // chips wrapped one-per-line, scattering the useful chips apart. Verified
    // live: Fast travel/Tower boss/NPC lead, the empties sink.
    const memo = screen.slice(screen.indexOf('const groups = useMemo'),
      screen.indexOf('const groups = useMemo') + 1100);
    expect(memo).toContain('here(a.id) - here(b.id)');
    expect(memo).toContain('[filters.region]');
  });

  it('the first-run hint stands down once the player has EVER marked', () => {
    // Its job is teaching the controls; a dropped mark proves they were
    // found — on EITHER island. The region-scoped guard made the hint
    // reappear on the World Tree for a player with four stops on Palpagos.
    expect(screen).toMatch(/!hintOff && neverMarked/);
    const memo = screen.slice(screen.indexOf('const neverMarked'),
      screen.indexOf('const neverMarked') + 400);
    expect(memo, 'the global question must exist')
      .toContain("pinCount('palpagos') + pinCount('tree')");
    expect(memo).toContain("stopCount('palpagos') + stopCount('tree')");
  });
});

describe("the player's route", () => {
  const store = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'map', 'routes.ts'), 'utf8',
  );

  it('is its own store, scoped to the save you are on', () => {
    // same shape as pins.ts / found.ts and for the same reasons
    expect(store).toContain('getActiveProfile');
    expect(store).toMatch(/`palforge-\$\{profileId\}-maproutes`/);
    expect(store).toContain('AsyncStorage');
  });

  it('NEVER reorders — the player owns the order', () => {
    // An "optimal" ordering would be an estimate, and this map does not
    // estimate. Stops are appended, filtered, or cleared; there is no sort in
    // this file and there must never be one.
    expect(store).not.toMatch(/\.sort\(/);
    expect(store).not.toMatch(/\.reverse\(/);
    expect(store).toContain('stops = [...stops, { region, u, v, label }];');
  });

  it('keeps the order through save and load', () => {
    // `filter` preserves relative order — the property that makes this a
    // route and not a set of dots — and loading keeps rows IN THE ORDER THEY
    // APPEAR on disk rather than rebuilding them.
    expect(store).toMatch(/stops\.filter\(\(s\) => s\.region === region\)/);
    expect(store).toContain('parsed.filter(isStop)');
  });

  it('every stop is a self-contained copy, never a pin reference', () => {
    // deleting a mark must never break a route, and a route of plain
    // coordinates serialises cleanly for sharing later
    expect(store).not.toContain('pinId');
    expect(store).not.toMatch(/from '\.\/pins'/);
  });

  it('refuses a stop that is not on the map, instead of clamping it', () => {
    expect(store).toMatch(/if \(!\(u >= 0 && u <= 1 && v >= 0 && v <= 1\)\) return false;/);
  });

  it('refuses the same spot twice IN A ROW — that is a double-tap', () => {
    // "base → ore → base" repeats are fine; those are not consecutive
    expect(store).toMatch(/last\.u === u && last\.v === v\) return false;/);
  });

  it('survives a half-written or hand-edited file', () => {
    expect(store).toMatch(/s\.region === 'palpagos' \|\| s\.region === 'tree'/);
  });

  it('clears THIS map only, leaving the other region alone', () => {
    expect(store).toMatch(/stops\.filter\(\(s\) => s\.region !== region\)/);
  });
});

describe('the route on the screen', () => {
  const screen = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'screens', 'MapScreen.tsx'), 'utf8',
  );
  const canvas = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'map', 'MapCanvas.tsx'), 'utf8',
  );

  it('draws the line in SCREEN space, like the place names and for the same reason', () => {
    // Inside the transformed container the svg is rasterised at pre-zoom size
    // and GPU-magnified: the line goes soft and its stroke fattens with the
    // zoom — vectorEffect cannot help against a transform applied OUTSIDE the
    // svg renderer. Recomputing the geometry per frame on the UI thread keeps
    // the stroke constant-width and crisp at every zoom by construction.
    expect(canvas).toContain('function RouteLine');
    expect(canvas).toMatch(/s\.u \* k\.value \+ tx\.value/);
    expect(canvas).toContain('useAnimatedProps');
  });

  it('each polyline owns its OWN animatedProps', () => {
    // sharing one across views is the documented Reanimated mistake that made
    // the pins go soft (M28)
    const block = canvas.slice(canvas.indexOf('function RouteLine'),
      canvas.indexOf('function RouteLine') + 1600);
    expect(block.split('useAnimatedProps(').length - 1).toBe(2);
  });

  it('and the line never eats a touch', () => {
    const block = canvas.slice(canvas.indexOf('function RouteLine'),
      canvas.indexOf('function RouteLine') + 1600);
    expect(block).toContain('pointerEvents="none"');
  });

  it('one stop draws no line — a route begins when there are two', () => {
    expect(canvas).toMatch(/route\.stops\.length >= 2/);
  });

  it('stops that share a spot JOIN their numbers instead of stacking', () => {
    // slice 1 drew one badge per stop, and a route that returned to its
    // start buried the "1" under the "4" — an understated number. One badge
    // per SPOT, numbers joined, still centred on the true place whatever
    // the chip's width.
    const badges = screen.slice(screen.indexOf('const routeBadges'),
      screen.indexOf('const routeBadges') + 2400);
    expect(badges, 'routeBadges must exist').toContain('bySpot');
    expect(badges).toContain("nums.join(' · ')");
    expect(badges).toContain('marginLeft: -w / 2');
    expect(badges).not.toContain('clusterPoints');
  });

  it('tapping a badge opens the card that holds the stop verbs', () => {
    // Slice 1 made badges touch-transparent so the tap fell through to the
    // mark. Slice 2 gives stops their own verbs, so the badge OWNS the tap
    // and routes it: pin card when the mark still exists, bare-stop card
    // when it was deleted — a stop with no card would be unremovable.
    const badges = screen.slice(screen.indexOf('const routeBadges'),
      screen.indexOf('const routeBadges') + 2400);
    expect(badges).toContain('openSpot(spot.u, spot.v)');
    expect(badges).not.toContain('pointerEvents="none"');
    const helper = screen.slice(screen.indexOf('const openSpot'),
      screen.indexOf('const openSpot') + 500);
    expect(helper).toContain('if (pin) { setOpenPin(pin); setOpenStops(null); return; }');
    expect(helper).toContain('setOpenStops({ u, v })');
  });

  it('uses a colour MEASURABLY far from every layer AND the mark colour', () => {
    // same 40-unit bar as MY_PIN, and the two overlay colours must also be
    // far from each other — your path and your marks are different answers
    const mine = /const MY_ROUTE = '#([0-9A-Fa-f]{6})'/.exec(screen);
    expect(mine, 'the route colour must be named once').not.toBeNull();
    const rgb = (h: string) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    const dist = (a: string, b: string) => Math.hypot(
      ...rgb(a).map((x, i) => x - rgb(b)[i]),
    );
    for (const l of poiLayers()) {
      expect(dist(mine![1], l.colour.slice(1)), `too close to ${l.id} ${l.colour}`)
        .toBeGreaterThanOrEqual(40);
    }
    const pin = /const MY_PIN = '#([0-9A-Fa-f]{6})'/.exec(screen);
    expect(dist(mine![1], pin![1])).toBeGreaterThanOrEqual(40);
  });
});

describe('the route is accounted for like everything else on the map', () => {
  const screen = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'screens', 'MapScreen.tsx'), 'utf8',
  );

  it('the pill counts it SEPARATELY — never summed with spots or marks', () => {
    expect(screen).toContain("? 'My route: 1 stop' : `My route: ${myRoute.length} stops`");
    expect(screen).not.toMatch(/myRoute\.length \+ (shownCount|myPins)/);
    expect(screen).not.toMatch(/(shownCount|myPins\.length) \+ myRoute\.length/);
  });

  it('the key lists it, so the chartreuse is never an unexplained colour', () => {
    const at = screen.indexOf('{myRoute.length > 0 && (');
    expect(at, 'the key row must exist').toBeGreaterThan(-1);
    const row = screen.slice(at, at + 1100);
    expect(row).toContain('MY_ROUTE');
    expect(row).toContain('myRoute.length');
  });

  it('and the key OPENS for a route alone', () => {
    expect(screen).toMatch(
      /\(shownCount > 0 \|\| myPins\.length > 0 \|\| myRoute\.length > 0\) && \(/,
    );
  });

  it('the first-run hint stands down once a route exists, anywhere', () => {
    // routes count as proof of learning too, via the same global memo
    expect(screen).toMatch(/stopCount\('palpagos'\) \+ stopCount\('tree'\)/);
  });

  it('can be cleared for THIS map only, from the same place as the other clears', () => {
    expect(screen).toContain("'Clear my route — 1 stop'");
    expect(screen).toContain('`Clear my route — ${routeStops} stops`');
    expect(screen).toContain('clearRoute(region)');
  });

  it('adding a stop is a button on the mark card, NOT another gesture', () => {
    expect(screen).toContain('addStop(region, openPin.u, openPin.v, openPin.label)');
    expect(screen).not.toMatch(/Gesture\.LongPress/);
  });
});

describe('removing one stop (slice 2)', () => {
  const store = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'map', 'routes.ts'), 'utf8',
  );
  const screen = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'screens', 'MapScreen.tsx'), 'utf8',
  );

  it('identity is the badge number, counted WITHIN this region', () => {
    // "stop 3" on Palpagos must never delete the third stop of the OTHER
    // island's route: the index only advances over stops of this region.
    const fn = store.slice(store.indexOf('export function removeStop'),
      store.indexOf('export function removeStop') + 500);
    expect(fn, 'removeStop must exist').toContain(
      "if (s.region !== region) return true;",
    );
    expect(fn).toContain('seen !== index');
  });

  it('removal never reorders the survivors', () => {
    // filter, like everywhere else in this store — the no-sort rule is
    // already enforced file-wide, this pins removal to the same mechanism
    const fn = store.slice(store.indexOf('export function removeStop'),
      store.indexOf('export function removeStop') + 500);
    expect(fn).toContain('stops.filter(');
  });

  it('a stop whose mark was deleted still has a card', () => {
    // stops are copies, so the mark can go while the stop stays — and a
    // stop you cannot reach is a stop you cannot remove
    expect(screen).toContain('Route stop');
    expect(screen).toContain('openStops && !openPin');
    expect(screen).toMatch(/if \(here\.length === 0\) return null;/);
  });

  it('every stop at a spot is removable on its own', () => {
    expect(screen).toContain('removeStop(region, n - 1)');
    expect(screen.split('Remove stop {n}').length - 1).toBe(2);  // both cards
  });

  it('the stop card is a card about THIS island', () => {
    // same fault family as the mark card across a region switch (the Mau
    // banner): switching islands closes it
    expect(screen).toMatch(/setOpenPin\(null\);\s*\n\s*setOpenStops\(null\);/);
  });
});

describe('sharing a route (slice 3) — the codec, EXECUTED', () => {
  const stops = [
    { region: 'palpagos' as const, u: 0.421356237, v: 0.557106781, label: 'Base camp' },
    { region: 'palpagos' as const, u: 0.58, v: 0.38, label: 'Ore · ledge "west" 🥚' },
    { region: 'palpagos' as const, u: 0.5, v: 0.62, label: 'Sulfur run' },
  ];

  it('round-trips losslessly: order, labels, full float precision', () => {
    const text = encodeRoute('palpagos', 'Palpagos Islands', stops);
    const back = decodeRoute(text);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.region).toBe('palpagos');
    expect(back.stops).toEqual(stops.map(({ region: _r, ...rest }) => rest));
  });

  it('the message reads like a message, not like data', () => {
    const text = encodeRoute('palpagos', 'Palpagos Islands', stops);
    expect(text).toContain('Palforge route — Palpagos Islands — 3 stops');
    expect(text).toContain('1. Base camp');
    expect(text).toContain('3. Sulfur run');
    // the machine token is the LAST line, out of the way of the humans
    expect(text.trim().split('\n').pop()).toMatch(/^\[palforge-route [A-Za-z0-9+/=]+\]$/);
  });

  it('survives the text being wrapped in chat noise', () => {
    const text = encodeRoute('tree', 'The World Tree', [stops[0]]);
    const wrapped = `check this out!!\n${text}\nsent from my phone`;
    const back = decodeRoute(wrapped);
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.region).toBe('tree');
  });

  it('plain text without a route is refused in plain language', () => {
    const back = decodeRoute('hello there, no route here');
    expect(back.ok).toBe(false);
    if (!back.ok) expect(back.why).toContain('No Palforge route');
  });

  it('a damaged token is refused, never half-imported', () => {
    const text = encodeRoute('palpagos', 'Palpagos Islands', stops);
    const token = /\[palforge-route ([A-Za-z0-9+/=]+)\]/.exec(text)![1];
    // chop the payload — a truncated share must not become a shorter route
    const cut = text.replace(token, token.slice(0, Math.floor(token.length / 2)));
    const back = decodeRoute(cut);
    expect(back.ok).toBe(false);
    if (!back.ok) expect(back.why).toContain('damaged');
  });

  it('an equals sign smuggled mid-token is refused, not skipped', () => {
    // the token regex admits '=' anywhere (it is legal padding at the END),
    // so a corrupted mid-token '=' is the ONE bad character that can reach
    // the decoder — mutation-testing found this path uncovered
    const text = encodeRoute('palpagos', 'Palpagos Islands', stops);
    const token = /\[palforge-route ([A-Za-z0-9+/=]+)\]/.exec(text)![1];
    const smuggled = token.slice(0, 10) + '=' + token.slice(11);
    expect(decodeRoute(text.replace(token, smuggled)).ok).toBe(false);
  });

  it('a row with off-map coordinates refuses the WHOLE import', () => {
    // forge a v1 payload with one bad row among good ones
    const bad = { v: 1, region: 'palpagos', stops: [[0.4, 0.5, 'ok'], [1.7, 0.5, 'off the map']] };
    const b64 = Buffer.from(JSON.stringify(bad), 'utf8').toString('base64');
    const back = decodeRoute(`[palforge-route ${b64}]`);
    expect(back.ok).toBe(false);
  });

  it('an unknown region or version is refused', () => {
    for (const bad of [
      { v: 1, region: 'moon', stops: [[0.4, 0.5, 'x']] },
      { v: 2, region: 'palpagos', stops: [[0.4, 0.5, 'x']] },
    ]) {
      const b64 = Buffer.from(JSON.stringify(bad), 'utf8').toString('base64');
      expect(decodeRoute(`[palforge-route ${b64}]`).ok).toBe(false);
    }
  });

  it('handles labels beyond ASCII the way a phone keyboard writes them', () => {
    const fancy = [{ region: 'tree' as const, u: 0.1, v: 0.9, label: 'Ægir — 基地 🌋' }];
    const back = decodeRoute(encodeRoute('tree', 'The World Tree', fancy));
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.stops[0].label).toBe('Ægir — 基地 🌋');
  });
});

describe('importing a route (slice 3) — the wiring', () => {
  const store = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'map', 'routes.ts'), 'utf8',
  );
  const screen = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'screens', 'MapScreen.tsx'), 'utf8',
  );
  const codec = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'map', 'routeShare.ts'), 'utf8',
  );

  it('the codec stays PURE so these tests stay real', () => {
    // a react-native import here would break the executed tests above and
    // turn this feature's guards back into text assertions
    expect(codec).not.toMatch(/from 'react-native'/);
    expect(codec).not.toMatch(/from 'expo/);
    expect(codec).toMatch(/import type .* from '\.\/routes'/);
  });

  it('import replaces all-or-nothing through the same row guard as disk', () => {
    const fn = store.slice(store.indexOf('export function importRoute'),
      store.indexOf('export function importRoute') + 500);
    expect(fn, 'importRoute must exist').toContain('rows.every(isStop)');
    expect(fn).toContain("stops.filter((s) => s.region !== region)");
  });

  it('a route for the other island is refused BY NAME', () => {
    expect(screen).toContain('switch to that map to import it');
    expect(screen).toMatch(/parsed\.region !== region/);
  });

  it('importing over an existing route asks first, and never merges', () => {
    expect(screen).toContain('Replace your route?');
    expect(screen).toContain("text: 'Keep mine', style: 'cancel'");
    // the only combining rule is replace — merging would invent an order
    expect(screen).not.toMatch(/\.\.\.parsed\.stops, \.\.\.myRoute/);
    expect(screen).not.toMatch(/\.\.\.myRoute, \.\.\.parsed\.stops/);
  });

  it('share and import live beside the other route verbs', () => {
    expect(screen).toContain('Share my route');
    expect(screen).toContain('Import a route from the clipboard');
    expect(screen).toContain('Share.share({ message: encodeRoute(region, name, myRoute) })');
  });
});

describe('"exactly where small hidden stuff is" — EXECUTED', () => {
  it('the metre unit survives a full-population sanity check', () => {
    // Every chest on Palpagos vs its nearest statue. Unreal's world unit is
    // one centimetre; if that assumption were wrong the whole distribution
    // shifts by orders of magnitude and this fails loudly. 155 statues on a
    // ~14.5 km island puts typical nearest distances in the tens-to-hundreds
    // of metres.
    const chests = poiPoints('chest', 'palpagos');
    expect(chests, 'chest points must exist').not.toBeNull();
    const ds: number[] = [];
    for (let i = 0; i < chests!.n; i++) {
      const w = whereFrom(chests!.xy[i * 2], chests!.xy[i * 2 + 1], 'palpagos');
      expect(w).not.toBeNull();
      ds.push(w!.metres);
    }
    ds.sort((a, b) => a - b);
    const median = ds[Math.floor(ds.length / 2)];
    expect(median).toBeGreaterThan(40);
    expect(median).toBeLessThan(1500);
    expect(ds[ds.length - 1]).toBeLessThan(8000);
  });

  it('the compass words point the way the map is drawn', () => {
    // synthetic offsets from a REAL statue, through the real axes swap:
    // +v is south on the texture, +u is east
    const statues = poiPoints('fast_travel', 'palpagos')!;
    const su = statues.xy[0];
    const sv = statues.xy[1];
    const south = whereFrom(su, sv + 0.01, 'palpagos')!;
    expect(south.dir).toBe('south');
    const east = whereFrom(su + 0.01, sv, 'palpagos')!;
    expect(east.dir).toBe('east');
    const nw = whereFrom(su - 0.007, sv - 0.007, 'palpagos')!;
    expect(nw.dir).toBe('north-west');
  });

  it('a synthetic 100 m offset measures 100 m', () => {
    // 10,000 world units straight south of statue 0 = 100 m exactly
    const statues = poiPoints('fast_travel', 'palpagos')!;
    const r = MAP_REGIONS.find((x) => x.id === 'palpagos')!;
    const dv = 10000 / (r.maxX - r.minX);
    const w = whereFrom(statues.xy[0], statues.xy[1] + dv, 'palpagos')!;
    expect(w.metres).toBeCloseTo(100, 1);
    expect(w.dir).toBe('south');
  });

  it('standing on the statue says nothing, and the line rounds to 10 m', () => {
    const statues = poiPoints('fast_travel', 'palpagos')!;
    expect(whereFromLine(statues.xy[0], statues.xy[1], 'palpagos')).toBeNull();
    const r = MAP_REGIONS.find((x) => x.id === 'palpagos')!;
    const dv = 21700 / (r.maxX - r.minX);   // 217 m
    const line = whereFromLine(statues.xy[0], statues.xy[1] + dv, 'palpagos');
    expect(line).toMatch(/^220 m south of the .+$/);
  });

  it('never says "Statue statue" — some names already carry the word', () => {
    // caught by eye on the QA screen: "the Great Eagle Statue statue"
    const statues = poiPoints('fast_travel', 'palpagos')!;
    const r = MAP_REGIONS.find((x) => x.id === 'palpagos')!;
    const dv = 21700 / (r.maxX - r.minX);
    let sawBare = 0;
    let sawSuffixed = 0;
    for (let i = 0; i < statues.n; i++) {
      const line = whereFromLine(statues.xy[i * 2], statues.xy[i * 2 + 1] + dv, 'palpagos')!;
      expect(line).not.toMatch(/statue statue$/i);
      if (/statue$/i.test(line)) {
        if (/Statue$/.test(line)) sawBare += 1; else sawSuffixed += 1;
      }
    }
    // both kinds of name exist in the data, so both branches really ran
    expect(sawBare).toBeGreaterThan(0);
    expect(sawSuffixed).toBeGreaterThan(0);
  });
});

describe('a boss card says its level (CEO, 20:13)', () => {
  const screen = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'screens', 'MapScreen.tsx'), 'utf8',
  );

  it('matches the tapped pin back to its datamined AlphaSpot', () => {
    const at = screen.indexOf("own.startsWith('Alpha ')");
    expect(at, 'the alpha branch must exist in onPress').toBeGreaterThan(-1);
    const block = screen.slice(at, at + 600);
    expect(block).toContain('MAP_ALPHAS[own.slice(6)]');
    expect(block).toContain('Level ${spot.lv}');
    // matched by region AND position — a species with two spots must not
    // show the other island's level
    expect(block).toContain('a.m === mi');
  });
});

describe('the list behind a layer (CEO: "find the one I am looking for")', () => {
  it('every alpha is listed, named, levelled ground truth, ALPHABETICAL', () => {
    const rows = namedPoints('alpha_pals', 'palpagos');
    expect(rows.length).toBe(poiPoints('alpha_pals', 'palpagos')!.n);
    for (const r of rows) expect(r.name.length).toBeGreaterThan(0);
    const names = rows.map((r) => r.name);
    expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names);
    // every row's uv is a real on-map point
    for (const r of rows) {
      expect(r.u).toBeGreaterThanOrEqual(0);
      expect(r.u).toBeLessThanOrEqual(1);
    }
  });

  it('a nameless layer refuses to pretend it has a list', () => {
    // 1,572 rows saying "Chest" would be noise pretending to be information
    expect(hasNames('chest')).toBe(false);
    expect(namedPoints('chest', 'palpagos')).toEqual([]);
    expect(hasNames('alpha_pals')).toBe(true);
    expect(hasNames('fast_travel')).toBe(true);
  });

  it('the list is region-scoped like everything else', () => {
    const pal = namedPoints('alpha_pals', 'palpagos');
    const tree = namedPoints('alpha_pals', 'tree');
    expect(pal.length + tree.length).toBeGreaterThan(pal.length);
    const palNames = new Set(pal.map((r) => r.name));
    // the World Tree's alphas are its own, not a re-listing
    expect(tree.every((r) => r.name.length > 0)).toBe(true);
  });

  it('tapping a row flies the map and closes the sheet (wiring)', () => {
    const screen = readFileSync(
      join(__dirname, '..', '..', 'mobile', 'src', 'screens', 'MapScreen.tsx'), 'utf8',
    );
    const at = screen.indexOf('typeof sheet === ');
    expect(at, 'the list view must exist').toBeGreaterThan(-1);
    const view = screen.slice(at, at + 3200);
    expect(view).toContain("canvas.current?.focus(item.u, item.v, 0.06)");
    expect(view).toContain('setSheet(null)');
    expect(view).toContain('isFound(foundKey(sheet.list, region, item.index))');
    // the chip affordance exists and only for named layers that are ON
    expect(screen).toContain('on && here > 0 && hasNames(l.id)');
  });
});

describe('the list, round 2 (CEO: "Work")', () => {
  it('sealed realms file under the BOSS, with the game name untouched', () => {
    expect(listSortKey('sealed_realm', 'Sealed Realm (Penking)')).toBe('Penking');
    expect(listSortKey('alpha_pals', 'Alpha Anubis')).toBe('Alpha Anubis');
    const rows = namedPoints('sealed_realm', 'palpagos');
    const keys = rows.map((r) => listSortKey('sealed_realm', r.name));
    expect([...keys].sort((a, b) => a.localeCompare(b))).toEqual(keys);
    // every displayed name is still the game's own full string
    expect(rows.every((r) => r.name.startsWith('Sealed Realm ('))).toBe(true);
  });

  it('rows with duplicated names carry their where-line (wiring)', () => {
    const screen = readFileSync(
      join(__dirname, '..', '..', 'mobile', 'src', 'screens', 'MapScreen.tsx'), 'utf8',
    );
    expect(screen).toContain('nameTally.get(item.name) ?? 0) > 1');
    expect(screen).toContain('whereFromLine(item.u, item.v, region)');
    // and the list opens with honest progress
    expect(screen).toContain('`All ${rows.length} found`');
    expect(screen).toContain('`${foundCount2} of ${rows.length} found`');
  });
});

describe('chips show collection progress', () => {
  const store = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'map', 'found.ts'), 'utf8',
  );
  const screen = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'screens', 'MapScreen.tsx'), 'utf8',
  );

  it('counts ONE layer on ONE map, by key prefix', () => {
    // keys are `layer:region:index`, so the prefix IS the region scope — a
    // tick on Palpagos can never count on the World Tree
    const fn = store.slice(store.indexOf('export function foundCountFor'),
      store.indexOf('export function foundCountFor') + 400);
    expect(fn, 'foundCountFor must exist').toContain('`${layerId}:${region}:`');
    expect(fn).toContain('k.startsWith(prefix)');
  });

  it('the chip shows progress only once something is ticked', () => {
    expect(screen).toContain('foundCountFor(l.id, filters.region)');
    // zero found keeps the plain count - no "0/1,572" noise on every chip
    expect(screen).toContain('? `${got.toLocaleString()}/${here.toLocaleString()}`');
    // and a complete layer goes green
    expect(screen).toContain('const done = got > 0 && got === here;');
  });
});

describe('found spots fade on the map (CEO 22:45)', () => {
  const screen = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'screens', 'MapScreen.tsx'), 'utf8',
  );

  it('a found SINGLE dims and keeps its place; clusters stay loud', () => {
    const at = screen.indexOf('const done = c.count === 1');
    expect(at, 'the dim branch must exist').toBeGreaterThan(-1);
    const block = screen.slice(at, at + 400);
    expect(block).toContain("isFound(foundKey(layer.key.slice(4), region, oi))");
    expect(screen).toContain('done ? { opacity: 0.4 } : undefined');
  });
});

describe('the found filter (All / Still to find / Found)', () => {
  it('a filtered subset REMEMBERS where each point came from — EXECUTED', () => {
    const full = poiPoints('syndicate_tower', 'palpagos')!;
    const keep = [2, 5, 7];
    const sub = subsetWithIndex(full, keep);
    expect(sub.set.n).toBe(3);
    expect(sub.orig).toEqual(keep);
    // the kept points are byte-identical to their originals
    for (let i = 0; i < keep.length; i++) {
      expect(sub.set.xy[i * 2]).toBe(full.xy[keep[i] * 2]);
      expect(sub.set.xy[i * 2 + 1]).toBe(full.xy[keep[i] * 2 + 1]);
    }
  });

  it('defaults to All, and the wiring maps every index home', () => {
    expect(emptyFilters().found).toBe('all');
    const screen = readFileSync(
      join(__dirname, '..', '..', 'mobile', 'src', 'screens', 'MapScreen.tsx'), 'utf8',
    );
    // dim + portrait + tap-through + card mark all go through the origin map
    expect(screen).toContain('const oi = layer.orig ? layer.orig[c.index] : c.index;');
    expect(screen).toContain('const origIndex = layer.orig ? layer.orig[best.index] : best.index;');
    expect(screen).toContain("foundKey(layer.key.slice(4), region, origIndex)");
    // an empty filtered layer disappears rather than pushing a zero-point set
    expect(screen).toContain('if (keep.length === 0) continue;');
    // the three-way control exists with player words
    expect(screen).toContain("'Still to find'");
  });
});
