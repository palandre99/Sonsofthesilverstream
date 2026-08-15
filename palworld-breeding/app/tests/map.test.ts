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
import { clusterPoints, decodePoints, pointsInRect } from '../src/map/points';
import { regionOf, uvToReadout, worldToUv, tileLevelFor } from '../src/map/projection';
import { isNightOnly, spawnLevels, spawnPoints, spawnSplit } from '../src/map/layers';

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
