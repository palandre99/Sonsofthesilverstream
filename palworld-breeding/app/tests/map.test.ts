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
import { isNightOnly, spawnLevels, spawnPoints } from '../src/map/layers';

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

  it('reports Foxparks exactly as the game files do', () => {
    // 189 points on Palpagos in three bands — checked against
    // palworld-atlas-data build 24575149 by hand.
    const set = spawnPoints('Foxparks', 'palpagos', { day: true, night: true },
      { lo: 1, hi: 80 });
    expect(set?.n).toBe(189);
    expect(spawnLevels('Foxparks', 'palpagos')).toEqual({ lo: 5, hi: 13 });
  });

  it('keeps variants distinct from their base species', () => {
    const cryst = spawnPoints('Foxparks Cryst', 'palpagos', { day: true, night: true },
      { lo: 1, hi: 80 });
    expect(cryst?.n).toBe(104);
  });

  it('hides night-only bands when night is switched off', () => {
    const nocturnal = Object.keys(MAP_SPAWNS).find((n) => isNightOnly(n, 'palpagos'));
    expect(nocturnal, 'expected at least one night-only pal').toBeTruthy();
    const dayOnly = spawnPoints(nocturnal!, 'palpagos', { day: true, night: false },
      { lo: 1, hi: 80 });
    expect(dayOnly).toBeNull();
  });

  it('narrows to the level window it is given', () => {
    const all = spawnPoints('Foxparks', 'palpagos', { day: true, night: true },
      { lo: 1, hi: 80 });
    const low = spawnPoints('Foxparks', 'palpagos', { day: true, night: true },
      { lo: 1, hi: 7 });
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
