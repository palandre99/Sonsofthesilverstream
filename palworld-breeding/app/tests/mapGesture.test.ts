/** The map's pan/pinch arithmetic, exercised without a finger.
 *
 * The QA harness can tap and type. It cannot pinch, pan, double-tap or scroll,
 * so three gesture fixes shipped to the CEO unverified and he came back each
 * time saying the zoom was still wrong. This is the answer to that: the
 * arithmetic is pure, so it can be driven through whole gestures here.
 *
 * MapCanvas INLINES the same maths — an imported call inside a Reanimated
 * worklet crashed the app twice on device — and the last test in this file
 * pins the two together.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  clampView, panStep, pinchStep, reanchorPan, screenToUv,
} from '../../mobile/src/map/gesture';

const W = 393;
const H = 852;
const FLOOR = Math.max(W, H);          // the map opens at cover
const CEIL = 8192 / 3;                 // one texture pixel per device pixel

/** the view you get when the map first lays out */
const opened = { k: FLOOR, tx: (W - FLOOR) / 2, ty: (H - FLOOR) / 2 };

describe('the map stays inside its frame', () => {
  it('centres an axis smaller than the viewport', () => {
    const c = clampView(-999, -999, 200, W, H);
    expect(c.x).toBeCloseTo((W - 200) / 2, 6);
    expect(c.y).toBeCloseTo((H - 200) / 2, 6);
  });

  it('never lets an edge come inside the frame when zoomed in', () => {
    const k = 4000;
    for (const [tx, ty] of [[500, 500], [-99999, -99999], [0, 0]]) {
      const c = clampView(tx, ty, k, W, H);
      expect(c.x).toBeLessThanOrEqual(0);
      expect(c.y).toBeLessThanOrEqual(0);
      expect(c.x).toBeGreaterThanOrEqual(W - k);
      expect(c.y).toBeGreaterThanOrEqual(H - k);
    }
  });
});

describe('a pinch keeps the point under your fingers', () => {
  it('holds the starting focal point still while spreading', () => {
    // fingers centred, spreading to 3x, never moving
    const fx = 200;
    const fy = 400;
    const before = screenToUv(fx, fy, opened);
    for (const scale of [1.2, 1.8, 2.5, 3]) {
      const v = pinchStep({
        startK: opened.k, startTx: opened.tx, startTy: opened.ty,
        focalX0: fx, focalY0: fy, focalX: fx, focalY: fy,
        scale, minK: FLOOR, maxK: CEIL, w: W, h: H,
      });
      const after = screenToUv(fx, fy, v);
      expect(after.u).toBeCloseTo(before.u, 6);
      expect(after.v).toBeCloseTo(before.v, 6);
    }
  });

  it('follows the fingers when they spread AND slide', () => {
    // this is the case that fails if you anchor on the LIVE focal point
    const before = screenToUv(150, 300, opened);
    const v = pinchStep({
      startK: opened.k, startTx: opened.tx, startTy: opened.ty,
      focalX0: 150, focalY0: 300, focalX: 260, focalY: 520,
      scale: 2, minK: FLOOR, maxK: CEIL, w: W, h: H,
    });
    const after = screenToUv(260, 520, v);
    expect(after.u).toBeCloseTo(before.u, 6);
    expect(after.v).toBeCloseTo(before.v, 6);
  });

  it('cannot zoom past the pixels that exist, or below cover', () => {
    const inTight = pinchStep({
      startK: opened.k, startTx: opened.tx, startTy: opened.ty,
      focalX0: 200, focalY0: 400, focalX: 200, focalY: 400,
      scale: 500, minK: FLOOR, maxK: CEIL, w: W, h: H,
    });
    expect(inTight.k).toBe(CEIL);
    const out = pinchStep({
      startK: opened.k, startTx: opened.tx, startTy: opened.ty,
      focalX0: 200, focalY0: 400, focalX: 200, focalY: 400,
      scale: 0.001, minK: FLOOR, maxK: CEIL, w: W, h: H,
    });
    expect(out.k).toBe(FLOOR);
  });
});

describe('letting go after a pinch does not move the map', () => {
  it('hands over to a one-finger pan with no jump', () => {
    // pinch to 2.5x while sliding, then lift one finger and keep dragging
    const pinched = pinchStep({
      startK: opened.k, startTx: opened.tx, startTy: opened.ty,
      focalX0: 180, focalY0: 360, focalX: 240, focalY: 300,
      scale: 2.5, minK: FLOOR, maxK: CEIL, w: W, h: H,
    });
    // the pan was live throughout and had accumulated this much translation
    const dx = 60;
    const dy = -60;
    const anchored = reanchorPan(pinched, dx, dy);
    const handover = panStep({
      startTx: anchored.startTx, startTy: anchored.startTy,
      dx, dy, k: pinched.k, w: W, h: H,
    });
    // the very first frame after the pinch must land exactly where it was
    expect(handover.tx).toBeCloseTo(pinched.tx, 6);
    expect(handover.ty).toBeCloseTo(pinched.ty, 6);
  });

  it('jumps if the pan keeps its pre-pinch origin — the bug this replaced', () => {
    const pinched = pinchStep({
      startK: opened.k, startTx: opened.tx, startTy: opened.ty,
      focalX0: 180, focalY0: 360, focalX: 240, focalY: 300,
      scale: 2.5, minK: FLOOR, maxK: CEIL, w: W, h: H,
    });
    const stale = panStep({
      startTx: opened.tx, startTy: opened.ty,      // captured BEFORE the pinch
      dx: 60, dy: -60, k: pinched.k, w: W, h: H,
    });
    const jump = Math.hypot(stale.tx - pinched.tx, stale.ty - pinched.ty);
    expect(jump).toBeGreaterThan(100);   // hundreds of px: exactly the snap
  });
});

describe('a whole gesture never leaves the map somewhere impossible', () => {
  it('survives a long random sequence of pinches and pans', () => {
    let view = { ...opened };
    let seed = 7;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let i = 0; i < 400; i++) {
      if (i % 2 === 0) {
        view = pinchStep({
          startK: view.k, startTx: view.tx, startTy: view.ty,
          focalX0: rnd() * W, focalY0: rnd() * H,
          focalX: rnd() * W, focalY: rnd() * H,
          scale: 0.5 + rnd() * 3, minK: FLOOR, maxK: CEIL, w: W, h: H,
        });
      } else {
        const p = panStep({
          startTx: view.tx, startTy: view.ty,
          dx: (rnd() - 0.5) * 900, dy: (rnd() - 0.5) * 900,
          k: view.k, w: W, h: H,
        });
        view = { k: view.k, tx: p.tx, ty: p.ty };
      }
      expect(Number.isFinite(view.k)).toBe(true);
      expect(view.k).toBeGreaterThanOrEqual(FLOOR);
      expect(view.k).toBeLessThanOrEqual(CEIL);
      // and no empty space beside the world, ever
      expect(view.tx).toBeLessThanOrEqual(0.0001);
      expect(view.ty).toBeLessThanOrEqual(0.0001);
      expect(view.tx).toBeGreaterThanOrEqual(W - view.k - 0.0001);
      expect(view.ty).toBeGreaterThanOrEqual(H - view.k - 0.0001);
    }
  });
});

describe('the map at its extreme edges', () => {
  /** zoom all the way in about a point, then shove the map as far as it goes */
  const driveTo = (focalX: number, focalY: number, dx: number, dy: number) => {
    const zoomed = pinchStep({
      startK: FLOOR, startTx: opened.tx, startTy: opened.ty,
      focalX0: focalX, focalY0: focalY, focalX, focalY,
      scale: 999, minK: FLOOR, maxK: CEIL, w: W, h: H,
    });
    const p = panStep({
      startTx: zoomed.tx, startTy: zoomed.ty, dx, dy, k: zoomed.k, w: W, h: H,
    });
    return { k: zoomed.k, tx: p.tx, ty: p.ty };
  };

  it('pins the top-left corner exactly, with nothing beside it', () => {
    const v = driveTo(0, 0, 5000, 5000);
    expect(v.k).toBe(CEIL);
    expect(v.tx).toBe(0);
    expect(v.ty).toBe(0);
  });

  it('pins the bottom-right corner exactly', () => {
    const v = driveTo(W, H, -5000, -5000);
    expect(v.k).toBe(CEIL);
    expect(v.tx).toBeCloseTo(W - v.k, 6);
    expect(v.ty).toBeCloseTo(H - v.k, 6);
  });

  it('never resolves a tap to a point off the map, in any corner', () => {
    // A tap at the very edge of the screen while hard against a corner is the
    // case most likely to land outside [0,1] through accumulated float error,
    // and a uv outside the map would query a pixel that does not exist.
    const corners: [number, number, number, number][] = [
      [0, 0, 5000, 5000],
      [W, 0, -5000, 5000],
      [0, H, 5000, -5000],
      [W, H, -5000, -5000],
    ];
    for (const [fx, fy, dx, dy] of corners) {
      const v = driveTo(fx, fy, dx, dy);
      for (const [x, y] of [[0, 0], [W, 0], [0, H], [W, H], [W / 2, H / 2]]) {
        const { u, v: vv } = screenToUv(x, y, v);
        expect(u, `u at ${x},${y} from corner ${fx},${fy}`).toBeGreaterThanOrEqual(0);
        expect(u).toBeLessThanOrEqual(1);
        expect(vv, `v at ${x},${y} from corner ${fx},${fy}`).toBeGreaterThanOrEqual(0);
        expect(vv).toBeLessThanOrEqual(1);
      }
    }
  });

  it('zooming out in a corner leaves you in that corner, not yanked to the middle', () => {
    // I expected this to re-centre and it does not, which is correct: the map
    // is 852 wide against a 393 viewport at the zoom floor, so both the
    // centred opening view (tx -229.5) and the flush-left corner (tx 0) are
    // legal. Re-centring would drag the view out from under the player's
    // thumb the instant they pinched out. It only centres an axis SMALLER
    // than the viewport, which at the floor is neither of them.
    const corner = driveTo(0, 0, 5000, 5000);
    const out = pinchStep({
      startK: corner.k, startTx: corner.tx, startTy: corner.ty,
      focalX0: 0, focalY0: 0, focalX: 0, focalY: 0,
      scale: 0.0001, minK: FLOOR, maxK: CEIL, w: W, h: H,
    });
    expect(out.k).toBe(FLOOR);
    expect(out.tx).toBe(0);
    expect(out.ty).toBe(0);
    // and still no empty space beside the world
    expect(out.tx).toBeLessThanOrEqual(0);
    expect(out.tx).toBeGreaterThanOrEqual(W - out.k);
    expect(out.ty).toBeLessThanOrEqual(0);
    expect(out.ty).toBeGreaterThanOrEqual(H - out.k);
  });
});

describe('the worklet copy matches this one', () => {
  const canvas = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'map', 'MapCanvas.tsx'), 'utf8',
  );

  it('inlines the same focal maths, rather than importing it', () => {
    // importing would be the crash that took this fane down twice on device
    expect(canvas).not.toMatch(/from '\.\/gesture'/);
    expect(canvas).toMatch(/const u = \(pinchFx\.value - pinchTx\.value\) \/ startK\.value/);
    expect(canvas).toMatch(/const v = \(pinchFy\.value - pinchTy\.value\) \/ startK\.value/);
    expect(canvas).toMatch(/e\.focalX - u \* next/);
  });

  it('inlines the same clamp', () => {
    expect(canvas).toMatch(/nk < size\.w \? \(size\.w - nk\) \/ 2 : Math\.min\(0, Math\.max\(size\.w - nk, nx\)\)/);
  });

  it('inlines the same re-anchor', () => {
    expect(canvas).toMatch(/startTx\.value = tx\.value - e\.translationX/);
    expect(canvas).toMatch(/startTy\.value = ty\.value - e\.translationY/);
  });
});
