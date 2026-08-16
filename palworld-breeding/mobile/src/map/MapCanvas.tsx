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
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
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
import { MAP_TILES, MAX_TILE_Z, TILE_SIZE } from '../data/tileIndex.g';
import { type RegionId } from './projection';

/** One screen-space marker: follows the map on the UI thread, never scaled by
 *  it, so whatever it draws stays at its true resolution. */
function ScreenPin({ u, v, tx, ty, k, children }: {
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
 * Hard ceiling: the source texture is 4096 px, so magnifying past that only
 * blurs it. Raising the zoom floor to cover doubled every zoom multiple and
 * pushed the auto-framing straight past this — the terrain went soft. Zoom is
 * now bounded by the pixels that actually exist, not by a multiplier.
 */
const MAX_SCALE = 4096;

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
  /** Centre the view on a uv point at a given zoom multiple of the fit scale. */
  focus: (u: number, v: number, zoom?: number) => void;
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

  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const k = useSharedValue(0);        // px per uv unit; 0 until first layout
  const startK = useSharedValue(0);
  const startTx = useSharedValue(0);
  const startTy = useSharedValue(0);

  const [win, setWin] = useState<TileWindow>({ z: 0, x0: 0, x1: 0, y0: 0, y1: 0 });

  /** A focus asked for before we know our size, replayed once we do. */
  const pending = React.useRef<{ u: number; v: number; zoom: number } | null>(null);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) => {
      if (prev.w === width && prev.h === height) return prev;
      const f = Math.max(width, height);   // open at cover
      if (k.value === 0) {
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

  const pan = useMemo(() => Gesture.Pan()
    .onStart(() => {
      startTx.value = tx.value;
      startTy.value = ty.value;
    })
    .onUpdate((e) => {
      const c = clamp(startTx.value + e.translationX, startTy.value + e.translationY, k.value);
      tx.value = c.x;
      ty.value = c.y;
    }), [clamp, k, startTx, startTy, tx, ty]);

  const pinch = useMemo(() => Gesture.Pinch()
    .onStart(() => {
      startK.value = k.value;
      startTx.value = tx.value;
      startTy.value = ty.value;
    })
    .onUpdate((e) => {
      const next = Math.min(MAX_SCALE, Math.min(zoomFloor * MAX_ZOOM,
        Math.max(zoomFloor, startK.value * e.scale)));
      const ratio = next / startK.value;
      // keep the pinch focal point pinned under the fingers
      const nx = e.focalX - (e.focalX - startTx.value) * ratio;
      const ny = e.focalY - (e.focalY - startTy.value) * ratio;
      const c = clamp(nx, ny, next);
      k.value = next;
      tx.value = c.x;
      ty.value = c.y;
    }), [clamp, zoomFloor, k, startK, startTx, startTy, tx, ty]);

  const doubleTap = useMemo(() => Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((e) => {
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
    }), [clamp, zoomFloor, k, tx, ty]);

  const tap = useMemo(() => Gesture.Tap()
    .maxDuration(260)
    .onEnd((e) => {
      if (!onPress) return;
      runOnJS(onPress)((e.x - tx.value) / k.value, (e.y - ty.value) / k.value);
    })
    .requireExternalGestureToFail(doubleTap), [doubleTap, k, onPress, tx, ty]);

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
      const z = Math.max(0, Math.min(TILE_MAX_Z,
        Math.ceil(Math.log2(Math.max(1, scale) / TILE_PX))));
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
      if (!prev || Math.abs(cur.scale - prev.scale) > prev.scale * 0.02
        || Math.abs(cur.u0 - prev.u0) > (cur.u1 - cur.u0) * 0.05
        || Math.abs(cur.v0 - prev.v0) > (cur.v1 - cur.v0) * 0.05) {
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
  }, [onViewport, size.h, size.w]);

  const applyFocus = useCallback((u: number, v: number, zoom: number, animate: boolean) => {
    const next = Math.min(MAX_SCALE,
      Math.min(zoomFloor * MAX_ZOOM, Math.max(zoomFloor, zoomFloor * zoom)));
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
  }, [clamp, zoomFloor, k, settle, size.h, size.w, tx, ty]);

  // A pal card can ask us to frame a species the same frame it mounts us, so
  // the request routinely arrives BEFORE the first layout. Focusing then would
  // compute against a size of 0 and scale the whole map down to a few pixels —
  // a black screen. Hold the request and replay it once we know our size.
  React.useEffect(() => {
    if (size.w === 0 || !pending.current) return;
    const { u, v, zoom } = pending.current;
    pending.current = null;
    applyFocus(u, v, zoom, false);
  }, [applyFocus, size.w]);

  React.useImperativeHandle(canvasRef, () => ({
    focus: (u: number, v: number, zoom = 4) => {
      if (size.w === 0) {
        pending.current = { u, v, zoom };
        return;
      }
      applyFocus(u, v, zoom, true);
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
              // half-pixel bleed kills the hairline seams between tiles
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
                cachePolicy="memory-disk"
                transition={0}
              />
            ) : null}
            {tiles}
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
      {screenMarkers?.map((m) => (
        <ScreenPin key={m.key} u={m.u} v={m.v} tx={tx} ty={ty} k={k}>
          {m.render()}
        </ScreenPin>
      ))}
      {children}
    </View>
  );
}
