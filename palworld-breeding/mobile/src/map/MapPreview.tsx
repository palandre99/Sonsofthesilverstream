/** A still map cropped to where something actually is.
 *
 * The pal card used to show the whole world shrunk to ~300 px with one dot per
 * REGION LABEL — so "where does Foxparks live" was answered by a 16 px dot
 * sitting on a biome's name, and the CEO's verdict was "way too small, just an
 * image". This crops to the species' real spawn cloud instead, so the card
 * answers the question at a glance and the fullscreen map is one tap away.
 *
 * Still, not interactive, on purpose: it lives inside a scrolling card, and a
 * pan gesture there would fight the scroll. Interaction belongs in the Map fane.
 */
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { MAP_TILES, MAX_TILE_Z, TILE_SIZE } from '../data/tileIndex.g';
import { tileLevelFor, type RegionId } from './projection';

export interface PreviewPoint {
  u: number;
  v: number;
  /** drawn bigger and on top — fixed boss spots */
  alpha?: boolean;
}

/** Smallest uv square containing every point, padded, clamped to the map. */
export function boundsOf(points: PreviewPoint[], pad = 0.055): {
  u: number; v: number; size: number;
} {
  if (!points.length) return { u: 0, v: 0, size: 1 };
  let u0 = 1;
  let v0 = 1;
  let u1 = 0;
  let v1 = 0;
  for (const p of points) {
    if (p.u < u0) u0 = p.u;
    if (p.u > u1) u1 = p.u;
    if (p.v < v0) v0 = p.v;
    if (p.v > v1) v1 = p.v;
  }
  // a square window keeps the map's aspect honest; never smaller than a
  // readable patch, or a single spawn would zoom to a meaningless blur
  const size = Math.min(1, Math.max(u1 - u0, v1 - v0, 0.1) + pad * 2);
  const cu = (u0 + u1) / 2;
  const cv = (v0 + v1) / 2;
  return {
    u: Math.min(1 - size, Math.max(0, cu - size / 2)),
    v: Math.min(1 - size, Math.max(0, cv - size / 2)),
    size,
  };
}

/**
 * Collapse points that would overlap into one dot per cell.
 *
 * A species with 93 spawn points inside one bay drew 93 overlapping circles —
 * a scribble that said "somewhere in here" in the ugliest possible way. One
 * dot per cell, with weight carried in its opacity, reads as a habitat: dense
 * where the pal is common, sparse at the edges.
 */
function thin(points: PreviewPoint[], cell: number): (PreviewPoint & { weight: number })[] {
  const cells = new Map<string, PreviewPoint & { weight: number }>();
  const out: (PreviewPoint & { weight: number })[] = [];
  for (const p of points) {
    // fixed boss spots are individually meaningful — never merge them away
    if (p.alpha) {
      out.push({ ...p, weight: 1 });
      continue;
    }
    const key = `${Math.floor(p.u / cell)}:${Math.floor(p.v / cell)}`;
    const got = cells.get(key);
    if (got) got.weight += 1;
    else cells.set(key, { ...p, weight: 1 });
  }
  return [...cells.values(), ...out];
}

export function MapPreview({ region, points, side, children }: {
  region: RegionId;
  points: PreviewPoint[];
  /** rendered width and height in px */
  side: number;
  children?: React.ReactNode;
}) {
  const win = useMemo(() => boundsOf(points), [points]);
  const scale = side / win.size;             // px per uv unit
  const z = tileLevelFor(scale, TILE_SIZE, MAX_TILE_Z);
  const n = 1 << z;
  const have = MAP_TILES[region] ?? {};

  const tiles = useMemo(() => {
    const out: React.ReactNode[] = [];
    const step = scale / n;
    const x0 = Math.max(0, Math.floor(win.u * n));
    const x1 = Math.min(n - 1, Math.floor((win.u + win.size) * n));
    const y0 = Math.max(0, Math.floor(win.v * n));
    const y1 = Math.min(n - 1, Math.floor((win.v + win.size) * n));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const src = have[`${z}_${x}_${y}`];
        if (!src) continue;   // open ocean: the base below already matches
        out.push(
          <Image
            key={`${z}_${x}_${y}`}
            source={src}
            style={{
              position: 'absolute',
              left: x * step - win.u * scale,
              top: y * step - win.v * scale,
              width: step + 0.5,
              height: step + 0.5,
            }}
            contentFit="fill"
            cachePolicy="memory-disk"
            transition={0}
          />,
        );
      }
    }
    return out;
  }, [have, n, scale, win, z]);

  const base = have['0_0_0'];

  // one dot per ~12 px of screen: spaced so dots never touch, which is what
  // turned the dense middle into a moire of overlapping rings
  const dots = useMemo(() => thin(points, 12 / scale), [points, scale]);

  return (
    <View style={{ width: side, height: side, overflow: 'hidden', backgroundColor: '#06121a' }}>
      {base ? (
        <Image
          source={base}
          style={{
            position: 'absolute',
            left: -win.u * scale,
            top: -win.v * scale,
            width: scale,
            height: scale,
          }}
          contentFit="fill"
          cachePolicy="memory-disk"
          transition={0}
        />
      ) : null}
      {tiles}
      {dots.map((p, i) => {
        const r = p.alpha ? 9 : 4.5;
        // three points stacked in one cell is as opaque as it gets — beyond
        // that the eye reads "dense" and extra ink only muddies the terrain
        const weight = Math.min(1, 0.45 + p.weight * 0.18);
        return (
          <View
            key={i}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: (p.u - win.u) * scale - r,
              top: (p.v - win.v) * scale - r,
              width: r * 2,
              height: r * 2,
              borderRadius: r,
              // bosses stay ringed markers; spawn points are solid, so a
              // cluster reads as one habitat rather than a pile of outlines
              borderWidth: p.alpha ? 2.5 : 0,
              borderColor: p.alpha ? '#F0B441' : 'transparent',
              backgroundColor: p.alpha ? 'rgba(240,180,65,0.32)' : '#5FE3E9',
              opacity: p.alpha ? 1 : weight,
            }}
          />
        );
      })}
      {children}
    </View>
  );
}
