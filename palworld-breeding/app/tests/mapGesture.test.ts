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
import { tileLevelFor } from '../src/map/projection';

const W = 393;
const H = 852;
const FLOOR = Math.max(W, H);          // the map opens at cover
// The app's own ceiling, mirrored: texture * OVERZOOM / dpr. A test above
// pins this against MapCanvas so the two cannot drift apart silently.
const CEIL = (8192 * 3) / 3;

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

describe('letting go of a pinch', () => {
  /**
   * THE BUG THE CEO HAS REPORTED THREE TIMES.
   *
   * Pan and Pinch run simultaneously. RNGH measures a Pan's translation from
   * the CENTROID of the pointers it tracks, so the instant one of two fingers
   * lifts, translationX/Y jump by roughly half the gap between them — with no
   * movement of the hand at all. The pan's origin had been re-anchored against
   * the OLD centroid, so the first frame after the pinch adds that jump
   * straight into the map position. The formulas were never wrong; the
   * hand-off between two gestures measuring from different points was.
   */
  const FINGER_GAP = 240;          // a normal pinch spread
  const JUMP = FINGER_GAP / 2;     // centroid -> remaining finger

  /** the map mid-pinch: zoomed in, sitting somewhere specific */
  const afterPinch = { k: FLOOR * 2, tx: -300, ty: -450 };

  it('reproduces the snap when the pan trusts the jumped reading', () => {
    // what the code used to do: origin anchored against the last two-finger
    // reading, then the first one-finger frame is written straight through
    const lastTwoFinger = 40;
    const anchored = reanchorPan(afterPinch, lastTwoFinger, 0);
    const firstOneFinger = lastTwoFinger + JUMP;   // the discontinuity
    const moved = panStep({
      startTx: anchored.startTx, startTy: anchored.startTy,
      dx: firstOneFinger, dy: 0, k: afterPinch.k, w: W, h: H,
    });
    expect(Math.abs(moved.tx - afterPinch.tx)).toBeCloseTo(JUMP, 6);
  });

  it('and holds still when the pan rebases on the new reading first', () => {
    // what it does now: the frame after the pinch REBASES and writes nothing,
    // so the map stays exactly where the pinch left it
    const firstOneFinger = 40 + JUMP;
    const rebased = reanchorPan(afterPinch, firstOneFinger, 0);
    const next = panStep({
      startTx: rebased.startTx, startTy: rebased.startTy,
      dx: firstOneFinger, dy: 0, k: afterPinch.k, w: W, h: H,
    });
    expect(next.tx).toBeCloseTo(afterPinch.tx, 6);
    expect(next.ty).toBeCloseTo(afterPinch.ty, 6);
  });

  it('and real finger movement after the rebase still pans normally', () => {
    const atLift = 40 + JUMP;
    const rebased = reanchorPan(afterPinch, atLift, 0);
    const dragged = panStep({
      startTx: rebased.startTx, startTy: rebased.startTy,
      dx: atLift + 90, dy: 0, k: afterPinch.k, w: W, h: H,
    });
    expect(dragged.tx).toBeCloseTo(afterPinch.tx + 90, 6);
  });

  it('the canvas actually wires that rebase up', () => {
    const canvas = readFileSync(
      join(__dirname, '..', '..', 'mobile', 'src', 'map', 'MapCanvas.tsx'), 'utf8',
    );
    expect(canvas, 'a rebase flag must exist').toMatch(/const rebase = useSharedValue\(0\)/);
    // raised when the pinch lets go
    const pinchEnd = canvas.slice(canvas.indexOf('pinching.value = 0;'));
    expect(pinchEnd.slice(0, 260)).toContain('rebase.value = 1');
    // consumed by the pan BEFORE it writes a position
    const panUpdate = canvas.slice(canvas.indexOf('if (rebase.value) {'));
    expect(panUpdate.slice(0, 900)).toContain('rebase.value = 0');
    expect(panUpdate.indexOf('return;')).toBeLessThan(panUpdate.indexOf('const c = clamp('));
  });
});

describe('how far in it can actually go', () => {
  const canvas = readFileSync(
    join(__dirname, '..', '..', 'mobile', 'src', 'map', 'MapCanvas.tsx'), 'utf8',
  );

  it('zooms past the texture on purpose, and says why', () => {
    // "It should be better and able to zoom way further in .. chests, small
    // stuff may be hidden" (CEO). The old ceiling was exactly one texture
    // pixel per device pixel — the sharpest the ground can be, and the point
    // it stops improving. But sharpness and REACH are different complaints:
    // pins and labels are fixed-size so they stay crisp at any zoom, and
    // clustering is by screen distance, so only more zoom separates markers
    // that sit on top of each other.
    expect(canvas).toMatch(/const OVERZOOM = 3;/);
    expect(canvas).toMatch(/return \(texture \* OVERZOOM\) \/ PixelRatio\.get\(\);/);
  });

  it('which is 9.6x on his phone, up from 3.2x', () => {
    const TEXTURE = 512 * (1 << 4);      // palpagos z4 = 8192
    const DPR = 3;                        // his iPhone
    const floor = Math.max(393, 852);     // COVER: the long edge
    const ceil3 = (TEXTURE * 3) / DPR;
    expect(ceil3).toBe(8192);
    expect(ceil3 / floor).toBeCloseTo(9.6, 1);
    // and the other cap must not quietly become the binding one
    const MAX_ZOOM = 14;
    expect(floor * MAX_ZOOM).toBeGreaterThan(ceil3);
  });

  it('never asks for a tile level that does not exist', () => {
    // overzoom makes this matter far more than it used to: past the texture
    // there is no deeper pyramid, so the level MUST clamp or the map falls
    // through to the blurry base
    const MAXZ = 4;
    // tileLevelFor takes scale in DEVICE px and the TILE size, not the dpr
    for (const scale of [852, 2730, 5000, 8192]) {
      const z = tileLevelFor(scale * 3, 512, MAXZ);
      expect(z).toBeLessThanOrEqual(MAXZ);
      expect(z).toBeGreaterThanOrEqual(0);
    }
    // at the very top it should be sitting ON the deepest level, not below it
    expect(tileLevelFor(8192 * 3, 512, MAXZ)).toBe(MAXZ);
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
