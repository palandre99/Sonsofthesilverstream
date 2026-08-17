/** The map's pan/pinch arithmetic, as pure functions.
 *
 * WHY THIS FILE EXISTS
 * Three gesture fixes shipped to the CEO's phone unverified, because the QA
 * harness cannot pinch, pan, double-tap or scroll — it can only tap and type.
 * Each fix was reasoned from the code and each time he came back and said the
 * zoom was still wrong. Guessing at handlers we cannot exercise is not a
 * method, so the arithmetic lives here instead, where it can be exercised
 * exhaustively without a finger.
 *
 * THESE ARE NOT CALLED BY THE GESTURE HANDLERS. Calling an imported function
 * inside a Reanimated worklet crashed this app twice on device, hard and
 * without an error boundary, and react-native-web runs worklets on the JS
 * thread so a browser pass never catches it. MapCanvas therefore INLINES the
 * same maths, and a test pins the two together — the pattern already used for
 * tileLevelFor. If you change one, change the other; the test will tell you.
 */

export interface View {
  /** px per uv unit */
  k: number;
  /** translation of the map container, in px */
  tx: number;
  ty: number;
}

/**
 * Keep the map inside the frame.
 *
 * Smaller than the viewport on an axis: centre it, because a map floating
 * against one edge with a gap on the other reads as broken. Larger: stop the
 * edge coming inside the frame, so there is never empty space beside the world.
 */
export function clampView(tx: number, ty: number, k: number, w: number, h: number): {
  x: number; y: number;
} {
  const x = k < w ? (w - k) / 2 : Math.min(0, Math.max(w - k, tx));
  const y = k < h ? (h - k) / 2 : Math.min(0, Math.max(h - k, ty));
  return { x, y };
}

/**
 * One frame of a pinch.
 *
 * The map point that sat under the fingers when the pinch STARTED must stay
 * under them as they both spread and move. Anchoring on the live focal point
 * instead makes the focal its own reference, which cancels out: the map then
 * zooms about wherever the fingers happen to be that frame and two-finger
 * dragging does nothing at all.
 */
export function pinchStep(args: {
  /** scale when the pinch began */
  startK: number;
  /** scale at the moment the CURRENT anchor was captured. Equal to startK
   *  until a mid-pinch rebase (see rebasePinchAnchor); omitted = startK. */
  anchorK?: number;
  /** translation when the pinch began */
  startTx: number;
  startTy: number;
  /** focal point when the pinch began, in screen px */
  focalX0: number;
  focalY0: number;
  /** focal point now */
  focalX: number;
  focalY: number;
  /** the gesture's cumulative scale factor */
  scale: number;
  minK: number;
  maxK: number;
  w: number;
  h: number;
}): View {
  const next = Math.min(args.maxK, Math.max(args.minK, args.startK * args.scale));
  // where the anchoring focal sat on the map, in uv — divided by the scale
  // AT ANCHOR TIME, which is startK only until a mid-pinch rebase
  const aK = args.anchorK ?? args.startK;
  const u = (args.focalX0 - args.startTx) / aK;
  const v = (args.focalY0 - args.startTy) / aK;
  const c = clampView(args.focalX - u * next, args.focalY - v * next, next, args.w, args.h);
  return { k: next, tx: c.x, ty: c.y };
}

/**
 * Re-anchor a pinch when its POINTER COUNT changes while two or more touches
 * remain — the fifth distinct cause of "it snap moved a bit to the side when
 * I release my fingers".
 *
 * RNGH's focalX/Y is the centroid of whatever touches it is tracking, and
 * its scale is measured between them. 2 -> 1 is guarded (the update returns),
 * but 3 -> 2 and 2 -> 3 sail through: the centroid teleports by half the
 * lifted finger's gap and the old anchor turns that jump into map movement,
 * tens of pixels sideways at partial release with no hand movement at all.
 *
 * The rebase captures a fresh anchor against the CURRENT view and the LIVE
 * readings, chosen so that the very next pinchStep with unchanged readings
 * returns the view unchanged — the map holds still while the reference
 * point moves. A test executes exactly that invariant.
 */
export function rebasePinchAnchor(view: View, focalX: number, focalY: number, scale: number): {
  startK: number; anchorK: number; startTx: number; startTy: number;
  focalX0: number; focalY0: number;
} {
  return {
    // e.scale keeps counting from the ORIGINAL span basis (and its basis can
    // itself jump with the pointer set), so fold the current k into a fresh
    // basis: startK * live-scale must equal k exactly at the rebase frame.
    startK: view.k / scale,
    anchorK: view.k,
    startTx: view.tx,
    startTy: view.ty,
    focalX0: focalX,
    focalY0: focalY,
  };
}

/** One frame of a one-finger pan. */
export function panStep(args: {
  startTx: number;
  startTy: number;
  dx: number;
  dy: number;
  k: number;
  w: number;
  h: number;
}): { tx: number; ty: number } {
  const c = clampView(args.startTx + args.dx, args.startTy + args.dy, args.k, args.w, args.h);
  return { tx: c.x, ty: c.y };
}

/**
 * Where a pan must re-anchor its origin while a pinch owns the map.
 *
 * The pan is still receiving updates during a two-finger gesture, and its
 * origin was captured BEFORE the pinch moved anything — so the moment the
 * fingers lift it yanks the map back to where that stale origin implies.
 * Keeping the origin in step with wherever the pinch has put the map means the
 * pan carries on smoothly from there instead.
 */
export function reanchorPan(view: View, dx: number, dy: number): {
  startTx: number; startTy: number;
} {
  return { startTx: view.tx - dx, startTy: view.ty - dy };
}

/** Screen point -> uv, the inverse of how markers are placed. */
export function screenToUv(x: number, y: number, view: View): { u: number; v: number } {
  return { u: (x - view.tx) / view.k, v: (y - view.ty) / view.k };
}
