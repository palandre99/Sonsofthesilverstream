/** Map maths shared byte-for-byte between the phone app and the website.
 *
 * Everything the map draws lives in ONE coordinate space: `uv`, the normalized
 * position on the game's own map texture, u = 0..1 west->east, v = 0..1
 * north->south. The datasets ship in that space already (see
 * tools/extract_map_data.py), so nothing here has to know about Unreal units
 * at draw time.
 *
 * The one place world units still matter is the coordinate READOUT — the
 * numbers the game prints on the player's screen. Showing the same numbers he
 * sees in game is the difference between a map he can navigate by and a
 * picture. That transform is confirmed identical across three independent
 * projects (palcalc, pal-atlas, palworld-atlas-data).
 */
import { MAP_READOUT, MAP_REGIONS, type MapRegion } from '../data/mapMeta.g';

export type RegionId = 'palpagos' | 'tree';

/** Dataset rows use 0 = Palpagos, 1 = World Tree. */
export const REGION_BY_INDEX: RegionId[] = ['palpagos', 'tree'];

export function regionOf(id: RegionId): MapRegion {
  const r = MAP_REGIONS.find((m) => m.id === id);
  if (!r) throw new Error(`unknown map region: ${id}`);
  return r;
}

export interface UV {
  u: number;
  v: number;
}

/** Unreal world position -> uv on that region's map texture. */
export function worldToUv(worldX: number, worldY: number, region: MapRegion): UV {
  return {
    u: (worldY - region.minY) / (region.maxY - region.minY),
    v: 1 - (worldX - region.minX) / (region.maxX - region.minX),
  };
}

/** uv -> the coordinate pair the GAME shows the player, e.g. "-134, -94". */
export function uvToReadout(uv: UV, region: MapRegion): { x: number; y: number } {
  const worldY = region.minY + uv.u * (region.maxY - region.minY);
  const worldX = region.minX + (1 - uv.v) * (region.maxX - region.minX);
  return {
    x: Math.round((worldY - MAP_READOUT.translY) / MAP_READOUT.scale),
    y: Math.round((worldX + MAP_READOUT.translX) / MAP_READOUT.scale),
  };
}

/* ------------------------------------------------------------------ viewport */

/** The map's on-screen placement: `scale` px per uv unit, panned by tx/ty. */
export interface Viewport {
  tx: number;
  ty: number;
  scale: number;
  width: number;
  height: number;
}

/** The uv rectangle currently on screen, padded by `pad` screen px. */
export function visibleRect(vp: Viewport, pad = 0): { u0: number; v0: number; u1: number; v1: number } {
  const u0 = (-vp.tx - pad) / vp.scale;
  const v0 = (-vp.ty - pad) / vp.scale;
  return {
    u0,
    v0,
    u1: u0 + (vp.width + pad * 2) / vp.scale,
    v1: v0 + (vp.height + pad * 2) / vp.scale,
  };
}

/**
 * Deepest tile level whose pixels are still worth fetching.
 *
 * A level-z tile covers 1/2^z of the map and is `tileSize` px of source art, so
 * it is displayed 1:1 when scale/2^z === tileSize. We pick the level at or
 * below that, then clamp to what the bundled pyramid actually has — going
 * deeper would only upscale the same pixels while costing memory.
 */
export function tileLevelFor(scale: number, tileSize: number, maxZ: number): number {
  const ideal = Math.log2(Math.max(1, scale) / tileSize);
  return Math.max(0, Math.min(maxZ, Math.ceil(ideal)));
}

/** Clamp pan so the map can never be dragged off into empty space. */
export function clampPan(vp: Viewport): { tx: number; ty: number } {
  const span = vp.scale;
  // When the map is smaller than the screen, centre it; otherwise keep its
  // edges outside the frame.
  const tx = span < vp.width
    ? (vp.width - span) / 2
    : Math.min(0, Math.max(vp.width - span, vp.tx));
  const ty = span < vp.height
    ? (vp.height - span) / 2
    : Math.min(0, Math.max(vp.height - span, vp.ty));
  return { tx, ty };
}
