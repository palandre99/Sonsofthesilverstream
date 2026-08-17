/** The map surface: the game's own texture, panned and pinched at 60fps.
 *
 * HOW IT STAYS SMOOTH
 * Pan and pinch drive three Reanimated shared values (tx, ty, k) and nothing
 * else. The whole map is ONE transformed container, so a drag is a GPU
 * transform — the JS thread is not involved and cannot stutter it.
 *
 * React only re-renders when the *visible tile window* changes — an integer
 * rectangle derived on the UI thread and handed over with runOnJS only on
 * change. Panning within a tile costs zero renders.
 *
 * Markers live inside the same container so they track the map exactly, but
 * share ONE inverse-scale animated style, so a pin stays pin-sized at every
 * zoom without N worklets fighting for the frame.
 *
 * Deliberately built on react-native-gesture-handler + reanimated + expo-image,
 * all already in the app: no new native module, so the whole Map fane ships as
 * an over-the-air update instead of costing the CEO a reinstall.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { PixelRatio, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  type SharedValue,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { MAP_TILES, MAX_TILE_Z, REGION_MAX_Z, TILE_SIZE } from '../data/tileIndex.g';
import { type RegionId } from './projection';

/** One screen-space marker: follows the map on the UI thread, never scaled by
 *  it, so whatever it draws stays at its true resolution. */
function ScreenPin({ u, v, tx, ty, k, halfWidth, width, children }: {
  u: number;
  v: number;
  tx: SharedValue<number>;
  ty: SharedValue<number>;
  k: SharedValue<number>;
  halfWidth?: number;
  width: number;
  children: React.ReactNode;
}) {
  const style = useAnimatedStyle(() => {
    const raw = tx.value + u * k.value;
    let x = raw;
    let show = 1;
    // Slide a wide marker back inside the frame rather than letting it run off
    // and truncate mid-word. Culling by the viewport could not do this
    // reliably — that rectangle is pushed on a threshold and lags the view —
    // and it is what real map apps do with edge labels anyway.
    //
    // But ONLY for a marker whose own anchor is on screen. This clamp used to
    // apply to every marker unconditionally, so a name whose true position was
    // hundreds of pixels off screen was dragged to the edge and drawn there —
    // several at once, stacked at the identical x. That is not a decluttering
    // artefact, it is the map stating a place is somewhere it is not, which on
    // this fane is the one unforgivable bug. Off-screen anchors now stay off.
    if (halfWidth && width > halfWidth * 2) {
      if (raw < 0 || raw > width) show = 0;
      else x = Math.min(width - halfWidth, Math.max(halfWidth, raw));
    }
    return {
      opacity: show,
      transform: [{ translateX: x }, { translateY: ty.value + v * k.value }],
    };
  });
  return (
    <Animated.View pointerEvents="none"
      style={[{ position: 'absolute', left: 0, top: 0 }, style]}>
      {children}
    </Animated.View>
  );
}

/** Logical size of the map container. Tiles lay out against this once and are
 *  never re-laid-out; only the container's transform changes. */
const BASE = 1024;

/**
 * Local copies of the tile constants, because the animated reaction below runs
 * on the UI thread and closing over a value from another module is the same
 * class of hazard as calling an imported function there — which crashed the
 * app when the Map first shipped. A test pins these to tileIndex.g.
 */
const TILE_PX = TILE_SIZE;
const TILE_MAX_Z = MAX_TILE_Z;

/** How far past the zoom floor you may go. */
const MAX_ZOOM = 14;

/**
 * Zoom is bounded by the pixels that actually EXIST, never by a multiplier —
 * magnifying past the source only blurs it, which is what the CEO saw as "380
 * quality". It is per region now: Palpagos builds from the game's native 8192
 * texture and so allows 8192, while the World Tree has no 8192 export anywhere
 * and honestly stops at 4096. Derived from the tile pyramid rather than typed
 * in, so a rebuild at a deeper level raises this by itself.
 */
/**
 * How far past one-texture-pixel-per-device-pixel the map may still zoom.
 *
 * The cap used to be exactly 1.0, which is the sharpest the source can ever
 * be — and it is still where the GROUND stops gaining detail. But the CEO
 * asked for the opposite thing: "able to zoom way further in", because
 * "chests, small stuff may be hidden". Those are not the same complaint as
 * "pixelated", and the fix for one is not the fix for the other:
 *
 *   - Pins, counts and place names are drawn at a FIXED size, so they stay
 *     exactly as crisp at 9.6x as at 1x. Only the ground softens.
 *   - Clustering is driven by screen distance, so every extra step of zoom
 *     pulls overlapping markers apart. This is the ONLY thing that separates
 *     five chests sitting within a few metres of each other in game.
 *
 * So the ground goes soft at the very end of the range in exchange for being
 * able to tell two chests apart. That is the trade every map app makes — the
 * imagery stops improving long before the zoom does.
 */
const OVERZOOM = 3;

function maxScaleFor(region: RegionId): number {
  const texture = TILE_PX * (1 << (REGION_MAX_Z[region] ?? MAX_TILE_Z));
  // DIVIDED BY PIXEL DENSITY. This is scale in CSS px per uv unit, but the
  // phone draws 3 device pixels for each of those, so texture/dpr is the
  // point where one texture pixel lands on one device pixel.
  return (texture * OVERZOOM) / PixelRatio.get();
}

/**
 * A thing drawn in SCREEN space, tracking the map without being scaled by it.
 *
 * Anything inside the transformed container is rasterised by iOS at its
 * pre-scale size and then magnified, which is invisible on a round pin and
 * very visible on text — place names came out jagged on the CEO's phone.
 * These sit outside the transform and follow it via their own worklet, so the
 * text is drawn at its true size and stays crisp at every zoom.
 */
export interface ScreenMarker {
  key: string;
  u: number;
  v: number;
  render: () => React.ReactNode;
  /** half the drawn width; set it and the marker slides to stay on screen
   *  instead of running off the edge mid-word */
  halfWidth?: number;
}

export interface MapMarker {
  key: string;
  u: number;
  v: number;
  render: () => React.ReactNode;
}

interface TileWindow {
  z: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface MapCanvasHandle {
  /**
   * Frame a uv rectangle: centre on (u,v) and show `span` uv units across.
   *
   * Takes a SPAN rather than a zoom multiple on purpose. The multiplier
   * version was ambiguous — a caller naturally computes 1/span against the
   * whole map, while the multiplier is against the screen-fill scale, and the
   * two differ by the screen's aspect. That silently mis-framed anything
   * whose points were spread out.
   */
  focus: (u: number, v: number, span: number) => void;
  reset: () => void;
}

export function MapCanvas({
  region,
  markers,
  screenMarkers,
  onViewport,
  onPress,
  children,
  canvasRef,
}: {
  region: RegionId;
  markers: MapMarker[];
  /** drawn unscaled, above the map — use for text */
  screenMarkers?: ScreenMarker[];
  /** called (throttled to real change) with the current px-per-uv scale + rect */
  onViewport?: (v: { scale: number; u0: number; v0: number; u1: number; v1: number }) => void;
  onPress?: (u: number, v: number) => void;
  children?: React.ReactNode;
  canvasRef?: React.MutableRefObject<MapCanvasHandle | null>;
}) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  // The map is square and the screen is not. Zooming out to "zoomFloor" left
  // huge black bands above and below the map on a phone (CEO, with a
  // screenshot), so COVER is the floor: the map always fills the screen, the
  // way it does in game. There is no view in which you see empty space.
  const zoomFloor = Math.max(size.w, size.h) || 1;
  // deepest level this region HAS, and the zoom ceiling that follows from it
  const maxZ = REGION_MAX_Z[region] ?? MAX_TILE_Z;
  const MAX_SCALE = maxScaleFor(region);
  /**
   * How many real pixels the screen draws per layout pixel.
   *
   * Read here and captured as a plain NUMBER, because the reaction below is a
   * worklet and must not call into another module — that crashed the app twice
   * when this fane first shipped.
   */
  const dpr = PixelRatio.get();

  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const k = useSharedValue(0);        // px per uv unit; 0 until first layout
  const startK = useSharedValue(0);
  const startTx = useSharedValue(0);
  const startTy = useSharedValue(0);
  // The pinch keeps its OWN start values. Sharing them with the pan meant a
  // pan that began first could rewrite the pinch's reference mid-gesture.
  const pinchTx = useSharedValue(0);
  const pinchTy = useSharedValue(0);
  const pinchFx = useSharedValue(0);
  const pinchFy = useSharedValue(0);
  /** 1 while fingers are down: markers stop re-clustering until you let go */
  const gesturing = useSharedValue(0);
  /** 1 while two fingers are on the glass */
  const pinching = useSharedValue(0);
  /**
   * Set the instant a pinch ends. RNGH measures a Pan's translation from the
   * CENTROID of the pointers it is tracking, so the moment one of two fingers
   * lifts, translationX/Y jump by half the distance between them — hundreds of
   * pixels, in one frame, with no movement by the hand at all. The pan's
   * origin was re-anchored against the OLD centroid, so the first frame after
   * the pinch adds that jump straight to the map. That is the "snaps over to
   * some other place when I release" the CEO has now reported three times: it
   * is not the pinch maths, which is proven, it is the hand-off between two
   * gestures that measure from different points.
   */
  const rebase = useSharedValue(0);

  const [win, setWin] = useState<TileWindow>({ z: 0, x0: 0, x1: 0, y0: 0, y1: 0 });

  /** A focus asked for before we know our size, replayed once we do. */
  const pending = React.useRef<{ u: number; v: number; span: number } | null>(null);

  /** true once the player has panned or zoomed — after that we never re-fit. */
  const touched = React.useRef(false);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (!width || !height) return;
    setSize((prev) => {
      if (prev.w === width && prev.h === height) return prev;
      // Re-fit on EVERY layout until the player touches the map. Fitting only
      // on the first one locked the map to a height the screen did not have
      // yet — the safe area and tab bar settle a frame later — and left a
      // black band along the bottom. Exactly the bug the web map had.
      if (!touched.current) {
        const f = Math.max(width, height);   // open at cover
        k.value = f;
        tx.value = (width - f) / 2;
        ty.value = (height - f) / 2;
      }
      return { w: width, h: height };
    });
  }, [k, tx, ty]);

  /* ----------------------------------------------------------- gestures */

  const clamp = useCallback((nx: number, ny: number, nk: number) => {
    'worklet';
    const x = nk < size.w ? (size.w - nk) / 2 : Math.min(0, Math.max(size.w - nk, nx));
    const y = nk < size.h ? (size.h - nk) / 2 : Math.min(0, Math.max(size.h - nk, ny));
    return { x, y };
  }, [size.w, size.h]);

  const markTouched = useCallback(() => {
    touched.current = true;
  }, []);

  const pan = useMemo(() => Gesture.Pan()
    // ONE finger only. Pan and pinch run simultaneously, and both used to
    // write tx/ty every frame from different maths — pan from "where the
    // finger started plus how far it moved", pinch from the focal point. They
    // disagreed, the last writer each frame won, and the map fought itself:
    // the CEO reported zooming as laggy and "not even zooming in where I try
    // to". Two fingers now belong to the pinch alone, which does its own
    // panning from the focal point.
    .maxPointers(1)
    .onStart(() => {
      startTx.value = tx.value;
      startTy.value = ty.value;
      gesturing.value = 1;
      // a pan that begins cleanly has a valid origin already; a leftover
      // rebase flag here would swallow its first frame of movement
      rebase.value = 0;
      runOnJS(markTouched)();
    })
    .onUpdate((e) => {
      // While a pinch owns the map, the pan must not also write a position —
      // it computes from an origin captured BEFORE the pinch moved anything,
      // so the moment the fingers lift it yanks the map back to where that
      // origin implies. That is the "snaps to a different place when I release
      // fingers" the CEO reported. Re-anchor instead of writing: the pan
      // silently keeps its origin in step with wherever the pinch has put the
      // map, so when the pinch ends the pan carries on from there smoothly.
      if (pinching.value) {
        startTx.value = tx.value - e.translationX;
        startTy.value = ty.value - e.translationY;
        return;
      }
      if (rebase.value) {
        // First frame after the pinch let go. translationX/Y have just jumped
        // from a two-finger centroid to the one finger still down, so the
        // origin captured against the old reading is meaningless. Rebase on
        // the new reading and write nothing this frame: the map stays exactly
        // where the pinch left it, and the next frame pans from there.
        startTx.value = tx.value - e.translationX;
        startTy.value = ty.value - e.translationY;
        rebase.value = 0;
        return;
      }
      const c = clamp(startTx.value + e.translationX, startTy.value + e.translationY, k.value);
      tx.value = c.x;
      ty.value = c.y;
    })
    .onEnd(() => {
      gesturing.value = 0;
    }), [clamp, gesturing, k, markTouched, pinching, rebase, startTx, startTy, tx, ty]);

  const pinch = useMemo(() => Gesture.Pinch()
    .onStart((e) => {
      runOnJS(markTouched)();
      startK.value = k.value;
      pinchTx.value = tx.value;
      pinchTy.value = ty.value;
      pinchFx.value = e.focalX;
      pinchFy.value = e.focalY;
      gesturing.value = 1;
      pinching.value = 1;
    })
    .onUpdate((e) => {
      const next = Math.min(MAX_SCALE, Math.min(zoomFloor * MAX_ZOOM,
        Math.max(zoomFloor, startK.value * e.scale)));
      // The map point that was under the fingers when the pinch STARTED has to
      // stay under them as they both spread and move. Anchoring on the live
      // focal point instead (the old code) makes the focal its own reference,
      // which cancels out: the map zoomed about wherever the fingers happened
      // to be that frame and threw away two-finger dragging entirely.
      const u = (pinchFx.value - pinchTx.value) / startK.value;
      const v = (pinchFy.value - pinchTy.value) / startK.value;
      const c = clamp(e.focalX - u * next, e.focalY - v * next, next);
      k.value = next;
      tx.value = c.x;
      ty.value = c.y;
    })
    .onEnd(() => {
      gesturing.value = 0;
      pinching.value = 0;
      // whatever the pan reads next is measured from a different point than
      // what it read last — make it rebase before it writes anything
      rebase.value = 1;
    }), [MAX_SCALE, clamp, gesturing, pinching, rebase, zoomFloor, k, markTouched, pinchFx,
    pinchFy, pinchTx, pinchTy, startK, tx, ty]);

  const doubleTap = useMemo(() => Gesture.Tap()
    .numberOfTaps(2)
    // ONE finger. Both taps ran simultaneously with the pinch and neither
    // limited how many fingers could make them, so lifting two fingers off a
    // pinch could be read as a double tap — whose handler ANIMATES the map to
    // a new centre over 220ms. That is the "snaps to a different place when I
    // release fingers" the CEO reported, and it is a jump the map performs on
    // purpose, in the wrong circumstances.
    .onEnd((e) => {
      // A PINCH RELEASE IS NOT A TAP. Both taps run simultaneously with the
      // pinch, and TapGesture has no maximum-pointer setting — so lifting two
      // fingers off a pinch could be read as a double tap, whose handler
      // ANIMATES the map to a new centre over 220ms. That is the "snaps to a
      // different place when I release fingers" the CEO reported: a jump the
      // map makes on purpose, in entirely the wrong circumstances.
      if (e.numberOfPointers > 1 || pinching.value) return;
      const next = k.value > zoomFloor * 3.5
        ? zoomFloor
        : Math.min(MAX_SCALE, Math.min(zoomFloor * MAX_ZOOM, k.value * 2.5));
      const ratio = next / k.value;
      const nx = e.x - (e.x - tx.value) * ratio;
      const ny = e.y - (e.y - ty.value) * ratio;
      const c = clamp(nx, ny, next);
      k.value = withTiming(next, { duration: 220 });
      tx.value = withTiming(c.x, { duration: 220 });
      ty.value = withTiming(c.y, { duration: 220 });
    }), [MAX_SCALE, clamp, pinching, zoomFloor, k, tx, ty]);

  const tap = useMemo(() => Gesture.Tap()
    .maxDuration(260)
    .onEnd((e) => {
      // same reason: a two-finger lift-off must not open a marker card either
      if (e.numberOfPointers > 1 || pinching.value) return;
      if (!onPress) return;
      runOnJS(onPress)((e.x - tx.value) / k.value, (e.y - ty.value) / k.value);
    })
    .requireExternalGestureToFail(doubleTap), [doubleTap, k, onPress, pinching, tx, ty]);

  const gesture = useMemo(
    () => Gesture.Simultaneous(Gesture.Race(doubleTap, tap), Gesture.Simultaneous(pan, pinch)),
    [doubleTap, pan, pinch, tap],
  );

  /* ------------------------------------------- viewport -> React, on change */

  const pushWindow = useCallback((next: TileWindow) => {
    setWin((prev) => (
      prev.z === next.z && prev.x0 === next.x0 && prev.x1 === next.x1
        && prev.y0 === next.y0 && prev.y1 === next.y1 ? prev : next
    ));
  }, []);

  const pushViewport = useCallback((scale: number, u0: number, v0: number, u1: number, v1: number) => {
    onViewport?.({ scale, u0, v0, u1, v1 });
  }, [onViewport]);

  useAnimatedReaction(
    () => {
      const scale = k.value;
      if (scale === 0 || size.w === 0) return null;
      // INLINED ON PURPOSE. This runs on the UI thread, and calling a
      // function imported from another module inside a worklet crashes the
      // app on device — hard, no error boundary. react-native-web runs the
      // same code on the JS thread, so a browser pass cannot catch it. Keep
      // this in step with tileLevelFor() in projection.ts.
      // DEVICE pixels, not layout pixels. Choosing the level from `scale`
      // alone asked for a 4096 tile to cover 8192 real pixels at full zoom —
      // a flat 2x upscale on every phone, which is why the map still looked
      // soft after the 8192 texture landed: the deepest tiles were built and
      // then never requested.
      const z = Math.max(0, Math.min(maxZ,
        Math.ceil(Math.log2(Math.max(1, scale * dpr) / TILE_PX))));
      const n = 1 << z;
      const u0 = -tx.value / scale;
      const v0 = -ty.value / scale;
      const u1 = u0 + size.w / scale;
      const v1 = v0 + size.h / scale;
      return {
        z,
        x0: Math.max(0, Math.floor(u0 * n)),
        x1: Math.min(n - 1, Math.floor(u1 * n)),
        y0: Math.max(0, Math.floor(v0 * n)),
        y1: Math.min(n - 1, Math.floor(v1 * n)),
        scale,
        u0,
        v0,
        u1,
        v1,
        g: gesturing.value,
      };
    },
    (cur, prev) => {
      if (!cur) return;
      if (!prev || cur.z !== prev.z || cur.x0 !== prev.x0 || cur.x1 !== prev.x1
        || cur.y0 !== prev.y0 || cur.y1 !== prev.y1) {
        runOnJS(pushWindow)({ z: cur.z, x0: cur.x0, x1: cur.x1, y0: cur.y0, y1: cur.y1 });
      }
      // Marker culling wants the real rect, but not on every frame. The
      // thresholds are tight enough that place-name labels can trust this rect
      // to decide whether their box would run off the screen edge — at 12% of
      // a viewport the rect lagged far enough to clip names mid-word.
      // Re-clustering is real JS work over the whole point set, and pushing it
      // mid-pinch ran it many times a second against a thread that is also
      // rendering — which is what made zooming feel laggy. Tiles keep updating
      // live (above) so the map itself never goes soft; only the MARKERS wait,
      // and they catch up the instant the fingers lift.
      const settled = !!prev && prev.g === 1 && cur.g === 0;
      const moved = !prev || Math.abs(cur.scale - prev.scale) > prev.scale * 0.02
        || Math.abs(cur.u0 - prev.u0) > (cur.u1 - cur.u0) * 0.05
        || Math.abs(cur.v0 - prev.v0) > (cur.v1 - cur.v0) * 0.05;
      if (settled || (cur.g === 0 && moved)) {
        runOnJS(pushViewport)(cur.scale, cur.u0, cur.v0, cur.u1, cur.v1);
      }
    },
    [size.w, size.h, pushWindow, pushViewport],
  );

  /* --------------------------------------------------------------- imperative */

  const settle = useCallback((scale: number, x: number, y: number) => {
    onViewport?.({
      scale,
      u0: -x / scale,
      v0: -y / scale,
      u1: (-x + size.w) / scale,
      v1: (-y + size.h) / scale,
    });
  }, [dpr, maxZ, onViewport, size.h, size.w]);

  const applyFocus = useCallback((u: number, v: number, span: number, animate: boolean) => {
    // fit `span` uv units across the SHORTER screen edge, so the whole
    // rectangle is visible whichever way the phone is held
    const want = Math.min(size.w, size.h) / Math.max(1e-4, span);
    const next = Math.min(MAX_SCALE, Math.min(zoomFloor * MAX_ZOOM,
      Math.max(zoomFloor, want)));
    const c = clamp(size.w / 2 - u * next, size.h / 2 - v * next, next);
    const ms = animate ? 320 : 0;
    // Push the FINAL rect when the animation lands. The reaction below only
    // fires on thresholds, so its last push during a zoom happens while the
    // scale is still low — where the same screen width covers a far wider
    // slice of the map. Anything culling by that rect (place-name edge insets)
    // then thinks the view is much wider than it is.
    k.value = withTiming(next, { duration: ms }, (done) => {
      'worklet';
      if (done) runOnJS(settle)(next, c.x, c.y);
    });
    tx.value = withTiming(c.x, { duration: ms });
    ty.value = withTiming(c.y, { duration: ms });
  }, [MAX_SCALE, clamp, zoomFloor, k, settle, size.h, size.w, tx, ty]);

  // A pal card can ask us to frame a species the same frame it mounts us, so
  // the request routinely arrives BEFORE the first layout. Focusing then would
  // compute against a size of 0 and scale the whole map down to a few pixels —
  // a black screen. Hold the request and replay it once we know our size.
  React.useEffect(() => {
    if (size.w === 0 || !pending.current) return;
    const { u, v, span } = pending.current;
    pending.current = null;
    applyFocus(u, v, span, false);
  }, [applyFocus, size.w]);

  React.useImperativeHandle(canvasRef, () => ({
    focus: (u: number, v: number, span: number) => {
      if (size.w === 0) {
        pending.current = { u, v, span };
        return;
      }
      applyFocus(u, v, span, true);
    },
    reset: () => {
      const c = clamp((size.w - zoomFloor) / 2, (size.h - zoomFloor) / 2, zoomFloor);
      k.value = withTiming(zoomFloor, { duration: 320 });
      tx.value = withTiming(c.x, { duration: 320 });
      ty.value = withTiming(c.y, { duration: 320 });
    },
  }), [applyFocus, clamp, zoomFloor, k, size.h, size.w, tx, ty]);

  /* ------------------------------------------------------------- rendering */

  const mapStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: k.value / BASE },
    ],
  }));

  /** One worklet driving every marker: pins keep their size at any zoom. */
  const pinStyle = useAnimatedStyle(() => ({
    transform: [{ scale: BASE / Math.max(1, k.value) }],
  }));

  const tiles = useMemo(() => {
    const have = MAP_TILES[region] ?? {};
    const n = 1 << win.z;
    const step = BASE / n;
    // Half a SCREEN pixel, whatever the zoom. A flat 0.5 in container units is
    // half a pixel when the map is drawn at 1:1 and a four-pixel band of
    // stretched edge pixels at full zoom — which is exactly the straight lines
    // the CEO photographed cutting his map into quadrants.
    const bleed = (0.5 * BASE) / (TILE_PX * n);
    const out: React.ReactNode[] = [];
    for (let y = win.y0; y <= win.y1; y++) {
      for (let x = win.x0; x <= win.x1; x++) {
        const src = have[`${win.z}_${x}_${y}`];
        if (!src) continue;   // open ocean: the z0 base below is identical
        out.push(
          <Image
            key={`${win.z}_${x}_${y}`}
            source={src}
            style={{
              position: 'absolute',
              left: x * step,
              top: y * step,
              // bleed kills the hairline seams between tiles at every zoom
              width: step + bleed,
              height: step + bleed,
            }}
            contentFit="fill"
            // DISK, not memory-disk. Only ~6 tiles are ever on screen, but a
            // memory cache retains what you pan past, and all 140 bundled
            // tiles resident is ~140 MB of decoded bitmaps — an out-of-memory
            // kill on an older phone, which is a silent hard crash with no
            // error, the same class the Map already hit twice. Re-decoding a
            // 512px webp off disk is cheap; being killed is not.
            cachePolicy="disk"
            recyclingKey={`${win.z}_${x}_${y}`}
            transition={0}
          />,
        );
      }
    }
    return out;
  }, [region, win]);

  const base = (MAP_TILES[region] ?? {})['0_0_0'];

  return (
    // overflow hidden matters: without it the scaled tile container paints
    // straight over the app header when you zoom in (CEO screenshot).
    <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} onLayout={onLayout}>
      <GestureDetector gesture={gesture}>
        <Animated.View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}
          collapsable={false}>
          <Animated.View
            style={[
              { position: 'absolute', width: BASE, height: BASE, transformOrigin: 'top left' },
              mapStyle,
            ]}
          >
            {base ? (
              <Image
                source={base}
                style={{ position: 'absolute', width: BASE, height: BASE }}
                contentFit="fill"
                // the base is ONE tile and always visible, so it is the one
                // worth keeping decoded
                cachePolicy="memory-disk"
                transition={0}
              />
            ) : null}
            {tiles}
          </Animated.View>

          {/* Place names sit BETWEEN the terrain and the pins.
              They used to be drawn last, so "Twilight Dunes" printed straight
              across Anubis's face. A pin is the thing you are looking for; a
              place name is context for it, and context does not go on top.

              They stay outside the transform because text inside it is
              rasterised at its pre-zoom size and then magnified, which came
              out jagged on the CEO's phone. */}
          {screenMarkers?.map((m) => (
            <ScreenPin key={m.key} u={m.u} v={m.v} tx={tx} ty={ty} k={k}
              halfWidth={m.halfWidth} width={size.w}>
              {m.render()}
            </ScreenPin>
          ))}

          {/* Pins ride a SECOND container on the same transform rather than
              becoming screen-space markers themselves. Making each pin its own
              ScreenPin would have given ~200 markers ~200 worklets all
              recomputing every frame — precisely the "N worklets fighting for
              the frame" this file was built to avoid, and the CEO has just
              finished reporting the map as laggy. Two containers sharing two
              worklets costs nothing and gets the same stacking order. */}
          <Animated.View
            pointerEvents="box-none"
            style={[
              { position: 'absolute', width: BASE, height: BASE, transformOrigin: 'top left' },
              mapStyle,
            ]}
          >
            {markers.map((m) => (
              <Animated.View
                key={m.key}
                pointerEvents="box-none"
                style={[
                  { position: 'absolute', left: m.u * BASE, top: m.v * BASE },
                  pinStyle,
                ]}
              >
                {m.render()}
              </Animated.View>
            ))}
          </Animated.View>
        </Animated.View>
      </GestureDetector>
      {children}
    </View>
  );
}
