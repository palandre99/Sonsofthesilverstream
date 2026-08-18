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
 * Markers ride a second container on the same transform so they track the map
 * exactly; each owns its OWN counter-scale worklet (one read and a division).
 * A single style shared across markers is the documented-unsupported pattern
 * that made the pins render soft.
 *
 * Deliberately built on react-native-gesture-handler + reanimated + expo-image,
 * all already in the app: no new native module, so the whole Map fane ships as
 * an over-the-air update instead of costing the CEO a reinstall.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  AccessibilityInfo, PixelRatio, StyleSheet, View, type LayoutChangeEvent,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  type SharedValue,
  runOnJS,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import Svg, { Polyline } from 'react-native-svg';
import {
  MAP_SHEETS, MAP_TILES, MAX_TILE_Z, REGION_MAX_Z, TILE_GUTTER, TILE_SIZE,
} from '../data/tileIndex.g';
import { type RegionId } from './projection';

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
// 20, up from 14 ("I would also like to be able to zoom closer in" — the
// second ask of its kind, granted knowing the ground magnifies; the deepest
// tiles now bake an edge-preserving sharpen to carry it).
const MAX_ZOOM = 20;

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
// 5, up from 3 (CEO, with screenshots: "still i want to be able to zoom in
// closer"). Past ~3.2x the ground magnifies pixels the game does not ship —
// he knows, he asked anyway, and with markers and labels now drawn in screen
// space the overlay stays crisp all the way down. MAX_ZOOM (14x the floor)
// is the binding cap on a dpr-3 phone from here.
const OVERZOOM = 7;

function maxScaleFor(region: RegionId): number {
  const texture = TILE_PX * (1 << (REGION_MAX_Z[region] ?? MAX_TILE_Z));
  // DIVIDED BY PIXEL DENSITY. This is scale in CSS px per uv unit, but the
  // phone draws 3 device pixels for each of those, so texture/dpr is the
  // point where one texture pixel lands on one device pixel.
  return (texture * OVERZOOM) / PixelRatio.get();
}

/**
 * Does this phone want motion cut down?
 *
 * The map animates three things — double-tap zoom, framing a species, and
 * "back to the whole map". Each is a 220-320ms glide of the ENTIRE world,
 * which is exactly the large-field movement that provokes nausea in people
 * who switch Reduce Motion on. The blueprint's design bar names it outright
 * (criterion 12: "motion is physical and cancelable ... reduced-motion
 * respected") and the map was ignoring it.
 *
 * Cutting the duration to 0 keeps every destination identical: the map still
 * ends up in exactly the same place, it just arrives without the sweep.
 */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => { if (alive) setReduced(on); })
      .catch(() => { /* a phone that will not answer is a phone that wants motion */ });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

/**
 * One data pin, drawn in SCREEN space — the same treatment the place names
 * get, and now for the same PHOTOGRAPHED reason. Pins used to ride a second
 * container inside the map transform, counter-scaled per marker; the net
 * scale was 1, but iOS rasterises the subtree at its intermediate (counter-
 * scaled, tiny) size and the ancestor magnifies that raster — so pins grew
 * blurrier the deeper the zoom while the screen-space labels beside them
 * stayed sharp. The CEO's 20:05 screenshots show exactly that pair. Since
 * M28 every marker owns a worklet anyway, so drawing position instead of
 * counter-scale costs the same frame budget and renders at true resolution.
 */
function MarkerPin({ u, v, tx, ty, k, children }: {
  u: number;
  v: number;
  tx: SharedValue<number>;
  ty: SharedValue<number>;
  k: SharedValue<number>;
  children: React.ReactNode;
}) {
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value + u * k.value },
      { translateY: ty.value + v * k.value },
    ],
  }));
  return (
    <Animated.View
      pointerEvents="box-none"
      style={[{ position: 'absolute', left: 0, top: 0 }, style]}
    >
      {children}
    </Animated.View>
  );
}

const AnimatedPolyline = Animated.createAnimatedComponent(Polyline);

/**
 * The player's route, drawn in SCREEN space for the same reason the place
 * names are: anything inside the transformed container is rasterised at its
 * pre-zoom size and GPU-magnified, so a line in there would go soft AND its
 * stroke would fatten with the zoom — svg's non-scaling-stroke cannot help
 * against a transform applied outside the svg renderer. Here the geometry
 * itself is recomputed on the UI thread each frame (screen = u·k + tx, the
 * same arithmetic ScreenPin uses), so the stroke is constant-width and crisp
 * at every zoom by construction.
 *
 * Two polylines, not one: a dark casing under the colour keeps the dots
 * readable over snowfields and pale sand. Each owns its own animatedProps —
 * sharing one across views is the documented Reanimated mistake that made
 * the pins go soft.
 */
function RouteLine({ stops, tx, ty, k, colour, w, h }: {
  stops: { u: number; v: number }[];
  tx: SharedValue<number>;
  ty: SharedValue<number>;
  k: SharedValue<number>;
  colour: string;
  w: number;
  h: number;
}) {
  const casing = useAnimatedProps(() => ({
    points: stops
      .map((s) => `${s.u * k.value + tx.value},${s.v * k.value + ty.value}`)
      .join(' '),
  }));
  const core = useAnimatedProps(() => ({
    points: stops
      .map((s) => `${s.u * k.value + tx.value},${s.v * k.value + ty.value}`)
      .join(' '),
  }));
  return (
    // EXPLICIT width/height, not absoluteFill: an <svg> is a replaced element,
    // and CSS gives an absolutely-positioned replaced element its INTRINSIC
    // size (300×150) rather than stretching it between opposing offsets — the
    // route painted fine in the DOM and was invisible on screen, clipped to a
    // 300×150 box. Measured in the QA browser; explicit size is right on both
    // renderers.
    <Svg pointerEvents="none" width={w} height={h}
      style={{ position: 'absolute', top: 0, left: 0 }}>
      <AnimatedPolyline animatedProps={casing} fill="none"
        stroke="rgba(6,12,14,0.85)" strokeWidth={5.5}
        strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1 9" />
      <AnimatedPolyline animatedProps={core} fill="none"
        stroke={colour} strokeWidth={3}
        strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1 9" />
    </Svg>
  );
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
  route,
  onViewport,
  onPress,
  children,
  canvasRef,
}: {
  region: RegionId;
  markers: MapMarker[];
  /** drawn unscaled, above the map — use for text */
  screenMarkers?: ScreenMarker[];
  /** the player's own path, drawn as a dotted line under names and pins */
  route?: { stops: { u: number; v: number }[]; colour: string };
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
  /** 0 when the phone asks for less motion — same destination, no sweep */
  const glide = useReducedMotion() ? 0 : 1;

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
  /** k at the moment the CURRENT pinch anchor was captured. Distinct from
   *  startK once a mid-pinch rebase has happened: startK is what e.scale
   *  multiplies, anchorK is what the anchor's map-point division uses. */
  const anchorK = useSharedValue(0);
  /** how many touches defined the current pinch anchor — see onUpdate */
  const pinchPointers = useSharedValue(0);
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
  /**
   * Did THIS touch sequence ever have more than one finger on the glass?
   *
   * THE THIRD DISTINCT CAUSE of "it snaps over to where my first finger was".
   * The first two were real and are fixed (the pan/pinch hand-off, and the
   * pointer-count rebase). This one is the double tap, which is not a bug in
   * any formula at all — it is the map doing exactly what it was told, at a
   * moment nobody meant to tell it.
   *
   * `doubleTap.onEnd` ANIMATES the map to centre on the tap point. Lift two
   * fingers off a pinch and put them straight back — which is what everyone
   * does while framing something — and RNGH can read those lifts as two taps.
   * The old guard (`e.numberOfPointers > 1 || pinching.value`) cannot catch
   * it: by the time onEnd runs the pinch has ended, so `pinching` is 0, and
   * the pointer count is down to 1 or 0. TapGesture has no `maxPointers` to
   * lean on either — the type definitions only offer `minPointers`.
   *
   * So track the sequence itself. A fresh single finger clears the flag; a
   * second finger sets it, and it stays set until the next sequence begins.
   * A tap that shared a sequence with a pinch can never move the map.
   */
  const multiTouch = useSharedValue(0);
  /**
   * How many pointers the pan saw on its previous frame.
   *
   * The CEO pinned the symptom exactly: "it snaps over in the zoom to where my
   * first finger who hit the screen was". That is the pan's ORIGIN — captured
   * when finger one landed — being applied against a translation that is no
   * longer measured from finger one. Keying the rebase off pinch-end alone was
   * not enough, because the count can change without the pinch ending or
   * starting (a third finger, a finger lifting and landing again, a palm).
   * ANY change in the pointer count moves the reference point, so any change
   * must rebase.
   */
  const panPointers = useSharedValue(0);

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
      panPointers.value = 1;
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
      if (e.numberOfPointers !== panPointers.value) {
        // the reference point just moved — rebase against the NEW reading
        panPointers.value = e.numberOfPointers;
        startTx.value = tx.value - e.translationX;
        startTy.value = ty.value - e.translationY;
        rebase.value = 0;
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
      panPointers.value = 0;
    }), [clamp, gesturing, k, markTouched, panPointers, pinching, rebase, startTx, startTy,
    tx, ty]);

  const pinch = useMemo(() => Gesture.Pinch()
    .onTouchesDown((e) => {
      if (e.numberOfTouches > 1) multiTouch.value = 1;
    })
    .onStart((e) => {
      runOnJS(markTouched)();
      startK.value = k.value;
      anchorK.value = k.value;
      pinchPointers.value = e.numberOfPointers;
      pinchTx.value = tx.value;
      pinchTy.value = ty.value;
      pinchFx.value = e.focalX;
      pinchFy.value = e.focalY;
      gesturing.value = 1;
      pinching.value = 1;
    })
    .onUpdate((e) => {
      // A pinch does NOT end when one of two fingers lifts (RNGH #1214 — the
      // same issue behind the pan hand-off fix). It keeps tracking, with
      // focalX/Y TELEPORTED from the two-finger centroid to the one finger
      // still down. One more update then lands here and re-anchors the map
      // against a focal that jumped half the finger gap sideways — "it still
      // snap moved a bit to the side when I release my fingers". The maths
      // below is anchored on the focal captured at onStart, so it is only
      // valid while the pointer set that DEFINED that focal is still down.
      if (e.numberOfPointers < 2) return;
      if (e.numberOfPointers !== pinchPointers.value) {
        // THE FIFTH CAUSE, derived by re-walking the algebra after the CEO's
        // "it still snap moved a bit to the side when I release my fingers":
        // the guard above handles 2 fingers -> 1, but the count can also go
        // 3 -> 2 (a palm edge or resting knuckle lifting) or 2 -> 3, and RNGH
        // recomputes focalX/Y as the centroid of WHATEVER touches remain. The
        // anchor below is keyed to the OLD centroid, so the frame the count
        // changes, `e.focalX - u * next` moves the map by the centroid jump —
        // tens of pixels, sideways, exactly at (partial) release, with no
        // hand movement at all. Same medicine as the pan's pointer-count
        // rebase: re-capture the anchor against the CURRENT reading and write
        // NOTHING this frame, so the map holds still while the reference
        // point teleports. e.scale's basis can jump here too (the span is
        // measured between the remaining touches), which is why startK is
        // re-derived from the live reading rather than kept.
        pinchPointers.value = e.numberOfPointers;
        startK.value = k.value / e.scale;
        anchorK.value = k.value;
        pinchTx.value = tx.value;
        pinchTy.value = ty.value;
        pinchFx.value = e.focalX;
        pinchFy.value = e.focalY;
        return;
      }
            const next = Math.min(MAX_SCALE, Math.min(zoomFloor * MAX_ZOOM,
        Math.max(zoomFloor, startK.value * e.scale)));
      // The map point that was under the fingers when the pinch STARTED has to
      // stay under them as they both spread and move. Anchoring on the live
      // focal point instead (the old code) makes the focal its own reference,
      // which cancels out: the map zoomed about wherever the fingers happened
      // to be that frame and threw away two-finger dragging entirely.
      // divided by anchorK, NOT startK: they are equal until a mid-pinch
      // rebase, after which startK is the e.scale basis and anchorK is the
      // scale the anchor coordinates were captured at
      const u = (pinchFx.value - pinchTx.value) / anchorK.value;
      const v = (pinchFy.value - pinchTy.value) / anchorK.value;
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
    }), [MAX_SCALE, anchorK, clamp, gesturing, multiTouch, pinchPointers, pinching, rebase,
    zoomFloor, k, markTouched, pinchFx, pinchFy, pinchTx, pinchTy, startK, tx, ty]);

  const doubleTap = useMemo(() => Gesture.Tap()
    .onTouchesDown((e) => {
      // one finger down and nothing else on the glass = a new sequence
      if (e.numberOfTouches === 1) multiTouch.value = 0;
      else multiTouch.value = 1;
    })
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
      if (e.numberOfPointers > 1 || pinching.value || multiTouch.value) return;
      // Double tap walks IN, and only goes home once there is nowhere left to
      // go. The threshold used to be a flat `zoomFloor * 3.5`, which was dead
      // code while the ceiling was 3.2x — it could never be reached, so the
      // handler only ever zoomed in. Raising the ceiling to 9.6x brought it to
      // life in the worst way: from 6.25x a double tap flung the map all the
      // way back to the whole island, so you could never tap your way to the
      // deepest zoom and the gesture looked broken. Tie it to the ceiling
      // instead of a number tuned for a ceiling that no longer exists.
      const ceiling = Math.min(MAX_SCALE, zoomFloor * MAX_ZOOM);
      const atCeiling = k.value >= ceiling - 0.5;
      const next = atCeiling ? zoomFloor : Math.min(ceiling, k.value * 2.5);
      const ratio = next / k.value;
      const nx = e.x - (e.x - tx.value) * ratio;
      const ny = e.y - (e.y - ty.value) * ratio;
      const c = clamp(nx, ny, next);
      k.value = withTiming(next, { duration: 220 * glide });
      tx.value = withTiming(c.x, { duration: 220 * glide });
      ty.value = withTiming(c.y, { duration: 220 * glide });
    }), [MAX_SCALE, clamp, glide, multiTouch, pinching, zoomFloor, k, tx, ty]);

  const tap = useMemo(() => Gesture.Tap()
    .maxDuration(260)
    .onEnd((e) => {
      // same reason: a two-finger lift-off must not open a marker card either
      if (e.numberOfPointers > 1 || pinching.value || multiTouch.value) return;
      if (!onPress) return;
      runOnJS(onPress)((e.x - tx.value) / k.value, (e.y - ty.value) / k.value);
    })
    .requireExternalGestureToFail(doubleTap),
  [doubleTap, k, multiTouch, onPress, pinching, tx, ty]);

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
    k.value = withTiming(next, { duration: ms * glide }, (done) => {
      'worklet';
      if (done) runOnJS(settle)(next, c.x, c.y);
    });
    tx.value = withTiming(c.x, { duration: ms * glide });
    ty.value = withTiming(c.y, { duration: ms * glide });
  }, [MAX_SCALE, clamp, glide, zoomFloor, k, settle, size.h, size.w, tx, ty]);

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
      k.value = withTiming(zoomFloor, { duration: 320 * glide });
      tx.value = withTiming(c.x, { duration: 320 * glide });
      ty.value = withTiming(c.y, { duration: 320 * glide });
    },
  }), [applyFocus, clamp, glide, zoomFloor, k, size.h, size.w, tx, ty]);

  /* ------------------------------------------------------------- rendering */

  const mapStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: k.value / BASE },
    ],
  }));

  const tiles = useMemo(() => {
    const have = MAP_TILES[region] ?? {};
    const n = 1 << win.z;
    const step = BASE / n;
    // Tiles are baked with a 2-real-pixel gutter of their NEIGHBOURS' art on
    // every edge (build_map_tiles.py), so adjacent tiles overlap with
    // identical pixels and a seam is physically impossible at any zoom. The
    // old runtime "bleed" stretched each tile's own edge instead, and at 7x
    // overzoom that stretch was a visible band — the hard vertical line in
    // the CEO's 22:39 screenshot. g is the gutter in container units.
    const g = (TILE_GUTTER * BASE) / (TILE_PX * n);
    // The deepest level is SPARSE (the OTA asset cap keeps only the most
    // detailed tiles), so a missing tile no longer means open ocean. It used
    // to fall straight through to the z0 base — the whole map at 512px,
    // which is the pixelated terrain the CEO photographed three times. A
    // missing tile now paints its nearest existing ANCESTOR under the
    // window, so the worst any spot can look is the deepest art that exists
    // there, never the thumbnail. Ancestors go first: same-parent paint
    // order keeps them under the sharper tiles.
    const under = new Map<string, React.ReactNode>();
    // The deepest level ships as 2x2 SPRITE SHEETS (the OTA asset cap counts
    // files, so four tiles per file bought FULL z5 coverage). Each sheet cell
    // is a whole gutter-carrying tile; a clipping View shows exactly one
    // cell, so every seam rule holds unchanged.
    const sheets = win.z === (REGION_MAX_Z[region] ?? MAX_TILE_Z)
      ? (MAP_SHEETS[region] ?? {}) : null;
    const out: React.ReactNode[] = [];
    for (let y = win.y0; y <= win.y1; y++) {
      for (let x = win.x0; x <= win.x1; x++) {
        const src = have[`${win.z}_${x}_${y}`];
        if (!src) {
          const sh = sheets?.[`${x >> 1}_${y >> 1}`];
          if (sh) {
            const cw = step + 2 * g;   // one cell, gutter included
            out.push(
              <View
                key={`${win.z}_${x}_${y}`}
                style={{
                  position: 'absolute',
                  left: x * step - g,
                  top: y * step - g,
                  width: cw,
                  height: cw,
                  overflow: 'hidden',
                }}
              >
                <Image
                  source={sh}
                  style={{
                    position: 'absolute',
                    left: -(x & 1) * cw,
                    top: -(y & 1) * cw,
                    width: 2 * cw,
                    height: 2 * cw,
                  }}
                  contentFit="fill"
                  cachePolicy="disk"
                  recyclingKey={`s5_${x >> 1}_${y >> 1}`}
                  transition={0}
                />
              </View>,
            );
            continue;
          }
          for (let az = win.z - 1; az >= 1; az--) {
            const d = win.z - az;
            const akey = `${az}_${x >> d}_${y >> d}`;
            const asrc = have[akey];
            if (!asrc) continue;
            if (!under.has(akey)) {
              const an = 1 << az;
              const astep = BASE / an;
              const ag = (TILE_GUTTER * BASE) / (TILE_PX * an);
              under.set(akey, (
                <Image
                  key={`u${akey}`}
                  source={asrc}
                  style={{
                    position: 'absolute',
                    left: (x >> d) * astep - ag,
                    top: (y >> d) * astep - ag,
                    width: astep + 2 * ag,
                    height: astep + 2 * ag,
                  }}
                  contentFit="fill"
                  cachePolicy="disk"
                  recyclingKey={`u${akey}`}
                  transition={0}
                />
              ));
            }
            break;
          }
          continue;
        }
        out.push(
          <Image
            key={`${win.z}_${x}_${y}`}
            source={src}
            style={{
              position: 'absolute',
              left: x * step - g,
              top: y * step - g,
              width: step + 2 * g,
              height: step + 2 * g,
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
    return [...under.values(), ...out];
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

          {/* The route line sits directly on the terrain: under the place
              names, under every pin and badge — it is the ground the path
              crosses, not a thing standing on it. One stop draws nothing;
              a route begins when there are two. */}
          {route != null && route.stops.length >= 2 && size.w > 0 && (
            <RouteLine stops={route.stops} tx={tx} ty={ty} k={k}
              colour={route.colour} w={size.w} h={size.h} />
          )}

          {/* Place names sit BETWEEN the terrain and the pins.
              They used to be drawn last, so "Twilight Dunes" printed straight
              across Anubis's face. A pin is the thing you are looking for; a
              place name is context for it, and context does not go on top.

              They stay outside the transform because text inside it is
              rasterised at its pre-zoom size and then magnified, which came
              out jagged on the CEO's phone. */}
          {/* GLUED to their anchor — no edge-slide. Wide names used to be
              clamped inside the frame so they never clipped mid-word, and
              during a pan the clamped ones visibly detached from the terrain:
              "Location names move sometimes when I move around the map"
              (CEO, 20:10, with a screenshot). Real maps let edge labels clip
              and re-enter whole; a name that moves relative to its place
              spends the map's accuracy trust to save a truncation. */}
          {screenMarkers?.map((m) => (
            <MarkerPin key={m.key} u={m.u} v={m.v} tx={tx} ty={ty} k={k}>
              {m.render()}
            </MarkerPin>
          ))}

          {/* Data pins draw ABOVE the names, in screen space like them.
              The old second-container rationale (worklet budget) died with
              M28: every marker owns a worklet either way, and inside the
              transform iOS rasterises pins small and magnifies them — the
              photographed blur. */}
          {markers.map((m) => (
            <MarkerPin key={m.key} u={m.u} v={m.v} tx={tx} ty={ty} k={k}>
              {m.render()}
            </MarkerPin>
          ))}
        </Animated.View>
      </GestureDetector>
      {children}
    </View>
  );
}
