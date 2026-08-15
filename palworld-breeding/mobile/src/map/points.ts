/** Point decoding, spatial indexing and clustering — shared byte-for-byte
 * between the phone app and the website.
 *
 * The datasets hold 68,617 spawn points and 11,097 points of interest. Nothing
 * may ever iterate all of that while the user's finger is on the screen, so:
 *
 *   1. points ship base64-packed and are decoded ONCE, lazily, per layer;
 *   2. each decoded layer gets a fixed 64x64 bucket grid, so a pan only ever
 *      touches the buckets under the viewport;
 *   3. what survives culling is clustered on a screen-sized grid, so the
 *      renderer mounts a bounded number of views no matter how dense the data.
 *
 * That bound is the whole performance story: a planner fixpoint once froze this
 * app's JS thread for 4437 ms, and the lesson written into the workspace rules
 * is to design the cost out rather than measure it later.
 */

/** Fixed index resolution. 64x64 buckets over the map = ~64 px cells at 4096. */
const GRID = 64;

export interface PointSet {
  /** interleaved u,v pairs in 0..1 */
  xy: Float32Array;
  /** count of points */
  n: number;
  /** bucket key -> indices into xy (as point indices, not float offsets) */
  buckets: Map<number, Int32Array>;
}

export interface Cluster {
  u: number;
  v: number;
  /** how many points collapsed into this bubble; 1 means a real single point */
  count: number;
  /** index of a representative point, for tapping through to detail */
  index: number;
  /**
   * Grid cell this bubble came from — stable while the zoom holds, so it makes
   * a React key that survives a pan. Keying on the count instead unmounts and
   * remounts every pin the moment a cluster gains or loses a member, which is
   * exactly when the user is dragging.
   */
  cell: string;
}

/* --------------------------------------------------------------- decoding */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** base64 -> bytes. Hermes and every browser have atob, but this keeps the
 *  hot path free of platform branching and of string-per-byte garbage. */
export function unbase64(s: string): Uint8Array {
  const clean = s.endsWith('==') ? s.slice(0, -2) : s.endsWith('=') ? s.slice(0, -1) : s;
  const out = new Uint8Array((clean.length * 3) >> 2);
  let acc = 0;
  let bits = 0;
  let o = 0;
  for (let i = 0; i < clean.length; i++) {
    acc = (acc << 6) | B64.indexOf(clean[i]);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 0xff;
    }
  }
  return out.subarray(0, o);
}

/** Decode a packed layer into uv floats plus its bucket index. */
export function decodePoints(packed: string): PointSet {
  const bytes = unbase64(packed);
  const n = bytes.length >> 2;
  const xy = new Float32Array(n * 2);
  const counts = new Map<number, number>();
  const keys = new Int32Array(n);

  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const u = (bytes[o] | (bytes[o + 1] << 8)) / 65535;
    const v = (bytes[o + 2] | (bytes[o + 3] << 8)) / 65535;
    xy[i * 2] = u;
    xy[i * 2 + 1] = v;
    const key = bucketKey(u, v);
    keys[i] = key;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const buckets = new Map<number, Int32Array>();
  const fill = new Map<number, number>();
  for (const [key, count] of counts) buckets.set(key, new Int32Array(count));
  for (let i = 0; i < n; i++) {
    const key = keys[i];
    const at = fill.get(key) ?? 0;
    buckets.get(key)![at] = i;
    fill.set(key, at + 1);
  }
  return { xy, n, buckets };
}

function bucketKey(u: number, v: number): number {
  const bx = Math.min(GRID - 1, Math.max(0, (u * GRID) | 0));
  const by = Math.min(GRID - 1, Math.max(0, (v * GRID) | 0));
  return by * GRID + bx;
}

/* ---------------------------------------------------------------- culling */

/** Point indices inside the uv rectangle, touching only overlapping buckets. */
export function pointsInRect(
  set: PointSet,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
  limit = 20000,
): number[] {
  const bx0 = Math.max(0, (u0 * GRID) | 0);
  const bx1 = Math.min(GRID - 1, (u1 * GRID) | 0);
  const by0 = Math.max(0, (v0 * GRID) | 0);
  const by1 = Math.min(GRID - 1, (v1 * GRID) | 0);
  const hits: number[] = [];
  for (let by = by0; by <= by1; by++) {
    for (let bx = bx0; bx <= bx1; bx++) {
      const bucket = set.buckets.get(by * GRID + bx);
      if (!bucket) continue;
      for (let i = 0; i < bucket.length; i++) {
        const p = bucket[i];
        const u = set.xy[p * 2];
        const v = set.xy[p * 2 + 1];
        if (u >= u0 && u <= u1 && v >= v0 && v <= v1) {
          hits.push(p);
          if (hits.length >= limit) return hits;
        }
      }
    }
  }
  return hits;
}

/* -------------------------------------------------------------- clustering */

/**
 * Collapse points that would overlap on screen into one bubble.
 *
 * `cellPx` is how close two markers may get before they merge, in screen
 * pixels; `scale` is the current px-per-uv-unit. Bubbles sit at the mean of
 * their members so a cluster reads as "the pals are around here", which is
 * honest — a cluster pinned to one member would imply a precision the bubble
 * does not have.
 */
export function clusterPoints(
  set: PointSet,
  indices: number[],
  scale: number,
  cellPx = 34,
): Cluster[] {
  const cell = cellPx / Math.max(1, scale);
  const cells = new Map<string, { u: number; v: number; count: number; index: number }>();
  for (const p of indices) {
    const u = set.xy[p * 2];
    const v = set.xy[p * 2 + 1];
    const key = `${Math.floor(u / cell)}:${Math.floor(v / cell)}`;
    const got = cells.get(key);
    if (got) {
      got.u += u;
      got.v += v;
      got.count += 1;
    } else {
      cells.set(key, { u, v, count: 1, index: p });
    }
  }
  const out: Cluster[] = [];
  for (const [key, c] of cells) {
    out.push({
      u: c.u / c.count,
      v: c.v / c.count,
      count: c.count,
      index: c.index,
      cell: key,
    });
  }
  return out;
}

/** Nearest point to a uv position, within `maxDist` uv units. */
export function nearestPoint(
  set: PointSet,
  u: number,
  v: number,
  maxDist: number,
): number | null {
  const hits = pointsInRect(set, u - maxDist, v - maxDist, u + maxDist, v + maxDist);
  let best: number | null = null;
  let bestD = maxDist * maxDist;
  for (const p of hits) {
    const du = set.xy[p * 2] - u;
    const dv = set.xy[p * 2 + 1] - v;
    const d = du * du + dv * dv;
    if (d <= bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}
