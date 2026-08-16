/** The Map fane — fullscreen, filters inside the map (CEO-final, 2026-08-15).
 *
 * Its scope is EVERYTHING in the game, not just pals: statues, towers,
 * dungeons, chests, eggs, effigies, ore, coal, paldium, quartz, sulfur,
 * soralite, oil, berries, mushrooms, merchants, NPCs, bounties, sealed realms
 * — plus every species' real spawn area, with its level band and whether it
 * only comes out at night.
 *
 * The wedge nobody else has: the map knows what is in your box. "Only pals I'm
 * missing" turns the whole world into a to-do list, which is the breeding suite
 * reaching out into the map rather than the map being a separate product.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { T } from '../theme';
import { Icon } from '../ui/Icon';
import { SearchInput, s } from '../ui/kit';
import {
  MapCanvas, type MapCanvasHandle, type MapMarker, type ScreenMarker,
} from '../map/MapCanvas';
import { clusterPoints, nearestPoint, pointsInRect, type PointSet } from '../map/points';
import { uvToReadout, regionOf, type RegionId } from '../map/projection';
import {
  GROUP_LABEL, alphaSpots, dungeonPoints, emptyFilters, isNightOnly, poiLayer,
  poiLayers, poiPoints, searchPlaces,
  poiName, spawnLevels, spawnPoints, spawnablePals, wildBands,
  type LayerGroup, type MapFilters,
} from '../map/layers';
import { MAP_REGIONS } from '../data/mapMeta.g';
import { MAP_ICONS } from '../data/mapIcons.g';
import { PAL_ICONS } from '../data/icons.g';
import { REGION_SPOTS } from '../data/regionSpots.g';
import { takeIntentPayload } from '../nav/intent';
import { regionsFor } from '../map/layers';
import { ownedAny, pals, workLabel } from '../store';
import { FilterSheet } from '../ui/FilterSheet';
import {
  applyFilters, NO_FILTERS, sortedPals, type Filters, type SortKey,
} from '../ui/palFilters';
import { PalDetail } from '../ui/PalDetail';
import {
  clearFound, foundCount, foundKey, isFound, loadFound, onFoundChange, toggleFound,
} from '../map/found';

type Sheet = null | 'layers' | 'pals';

interface Viewport { scale: number; u0: number; v0: number; u1: number; v1: number }

export function MapScreen() {
  const insets = useSafeAreaInsets();
  const canvas = useRef<MapCanvasHandle | null>(null);
  const [filters, setFilters] = useState<MapFilters>(() => emptyFilters());
  const [sheet, setSheet] = useState<Sheet>(null);
  const [legend, setLegend] = useState(false);
  /** the first-run hint, once dismissed, stays dismissed */
  const [hintOff, setHintOff] = useState(false);
  const [vp, setVp] = useState<Viewport>({ scale: 1, u0: 0, v0: 0, u1: 1, v1: 1 });
  const [focus, setFocus] = useState<{
    title: string; lines: string[]; at: string; colour: string; icon: string;
    /** set only for a POI, so the card can offer to tick it off */
    mark?: string;
    /** a pal this marker IS, so the card can open its Paldex entry */
    pal?: string;
  } | null>(null);
  const [openPal, setOpenPal] = useState<string | null>(null);
  const [ticks, setTicks] = useState(0);   // bumps when a tick changes

  React.useEffect(() => {
    void loadFound();
    return onFoundChange(() => setTicks((n) => n + 1));
  }, []);

  const region = filters.region;

  // A pal card can hand us a species ("show me where this lives"). Take it
  // once, switch to a map it actually appears on, and frame it — arriving on
  // an empty world map with a filter silently applied would be worse than not
  // navigating at all.
  React.useEffect(() => {
    const pal = takeIntentPayload('map')?.pal;
    if (!pal) return;
    const where = regionsFor(pal);
    if (!where.length) return;
    setFilters((f) => ({ ...f, pals: new Set([pal]), region: where[0] }));
  }, []);

  const patch = useCallback((p: Partial<MapFilters>) => {
    setFilters((f) => ({ ...f, ...p }));
  }, []);

  /* ------------------------------------------------- what is on the map now */

  const active = useMemo(() => {
    const out: {
      key: string; set: PointSet; colour: string; icon: string; label: string;
      square?: boolean; art?: number;
      /** a pal's own portrait — drawn instead of a glyph, so a pin IS the pal */
      photo?: number; night?: boolean;
    }[] = [];
    for (const id of filters.poi) {
      const set = poiPoints(id, region);
      const layer = poiLayer(id);
      if (set && layer && set.n) {
        out.push({
          key: `poi:${id}`, set, colour: layer.colour, icon: layer.icon,
          label: layer.label, art: MAP_ICONS[id],
        });
      }
    }
    // Colour says WHICH pal; shape says where and when. Every pal used to be
    // the same teal, so picking four of them drew 1,393 identical dots and the
    // one question you opened the map to ask — "which of these is Pengullet?" —
    // had no answer on screen. Night-only pals keep their signal as a moon
    // glyph instead of a hue, so nothing is lost by spending hue on identity.
    for (const [i, pal] of [...filters.pals].entries()) {
      const hue = PAL_HUES[i % PAL_HUES.length];
      const surface = spawnPoints(pal, region, filters.time, filters.level);
      if (surface && surface.n) {
        out.push({
          key: `pal:${pal}`,
          set: surface,
          colour: hue,
          icon: 'paw',                       // fallback only, if art is missing
          label: pal,
          photo: PAL_ICONS[pal],
          night: isNightOnly(pal, region),
        });
      }
      // Dungeon spawners are a DIFFERENT instruction to the player — "go
      // inside" rather than "walk here" — so they get their own colour and a
      // door icon instead of being blended into the open-world cloud.
      if (filters.dungeons) {
        const inside = dungeonPoints(pal, region, filters.time, filters.level);
        if (inside && inside.n) {
          out.push({
            key: `dun:${pal}`,
            set: inside,
            colour: hue,          // same pal, same colour — the SQUARE says "inside"
            icon: 'door',
            label: `${pal} — in dungeons`,
            square: true,
            photo: PAL_ICONS[pal],
            night: isNightOnly(pal, region),
          });
        }
      }
    }
    return out;
  }, [filters.dungeons, filters.level, filters.pals, filters.poi, filters.time, region]);

  /** The fixed boss of any pal you have picked — the one guaranteed place. */
  const bossPins = useMemo<MapMarker[]>(() => {
    const out: MapMarker[] = [];
    for (const pal of filters.pals) {
      for (const [i, a] of alphaSpots(pal, region).entries()) {
        out.push({
          key: `boss:${pal}:${i}`,
          u: a.u,
          v: a.v,
          // The alpha IS a specific pal, so the pin is that pal's face in a
          // gold ring with a crown on it — a generic crown told you a boss was
          // here but not WHICH, which is the only thing you wanted to know.
          render: () => (
            <Pin colour={T.gold} icon="crown-outline" count={1}
              photo={PAL_ICONS[pal]} boss />
          ),
        });
      }
    }
    return out;
  }, [filters.pals, region]);

  const markers = useMemo<MapMarker[]>(() => {
    const out: MapMarker[] = [];
    // Each layer clusters on its own, so switching five of them on used to put
    // five independent swarms over each other — 1,958 spots of unreadable
    // overlap. The more layers are showing, the coarser every layer clusters,
    // and the total mounted count stays bounded either way.
    // MEASURED, not guessed: with eight layers on this used to put 130 pins on
    // screen, 64 of which overlapped another by more than a third of its area
    // and one of which was 96% hidden. Each layer clusters on its OWN grid, so
    // widening the cell only spaces a layer from itself — the collisions are
    // BETWEEN layers, and the only honest lever is drawing fewer, coarser
    // pins as more layers pile on. A pin may never be nudged off its spot to
    // make room; where it sits is the one thing this map must not lie about.
    const n = Math.max(1, active.length);
    const budget = Math.max(16, Math.floor(170 / n));
    const cell = PIN + 14 + Math.max(0, n - 1) * 12;
    for (const [li, layer] of active.entries()) {
      const hits = pointsInRect(layer.set, vp.u0, vp.v0, vp.u1, vp.v1);
      const clusters = clusterPoints(layer.set, hits, vp.scale, cell, li).slice(0, budget);
      for (const c of clusters) {
        out.push({
          // stable while the zoom holds, so a pan never remounts a pin
          key: `${layer.key}:${c.cell}`,
          u: c.u,
          v: c.v,
          render: () => (
            <Pin colour={layer.colour} icon={layer.icon} count={c.count}
              square={layer.square} art={layer.art}
              photo={layer.photo} night={layer.night} />
          ),
        });
      }
    }
    return out;
  }, [active, region, ticks, vp]);

  const shownCount = useMemo(
    () => active.reduce((n, l) => n + l.set.n, 0),
    [active],
  );

  /**
   * Place names, the way the game shows them.
   *
   * Held back until you have zoomed past twice the whole-map view: all 76 at
   * once is a wall of text over the terrain, and at that distance the names
   * are unreadable anyway. Only the ones in view are built.
   *
   * Positions are the paldb region labels projected in regionSpots.g.ts. That
   * file predates the projection proof and uses palcalc's matrix, whose
   * residual is bounded at 6 px of 4096 — invisible under a text label, but
   * the reason these are labels and never pins.
   */
  const labels = useMemo<ScreenMarker[]>(() => {
    if (region !== 'palpagos' || vp.scale < 760) return [];
    // Keep the label box clear of the screen edge, or names truncate mid-word
    // ("Gobfin's Tu..."), which reads as a bug rather than as a map.
    // No edge inset any more: ScreenPin clamps a wide label back inside the
    // frame, so a name near the edge slides rather than truncating. Culling
    // for it only ever threw away names that were perfectly showable.
    const inset = 0;
    const near = Object.entries(REGION_SPOTS).filter(([, at]) => (
      at.x > vp.u0 + inset && at.x < vp.u1 - inset
      && at.y > vp.v0 && at.y < vp.v1
    ));
    // Greedy declutter, north-first so the result is stable while panning:
    // a name is dropped if its box would overlap one already placed. Two names
    // on top of each other ("Golden HiSmall Settlement") is worse than one.
    near.sort((a, b) => a[1].y - b[1].y || a[0].localeCompare(b[0]));
    // The collision box is sized from the NAME, not from a constant. A fixed
    // box makes short names hog space they do not use and long ones
    // under-reserve, which is how "Isle of the Glacial Core" still landed on
    // top of its neighbour.
    const placed: { x: number; y: number; w: number }[] = [];
    const minY = LABEL_H / vp.scale;
    const out: ScreenMarker[] = [];
    for (const [name, at] of near) {
      const w = textWidth(name) / vp.scale;
      if (placed.some((q) => (
        Math.abs(q.x - at.x) < (w + q.w) / 2 && Math.abs(q.y - at.y) < minY
      ))) {
        continue;
      }
      placed.push({ x: at.x, y: at.y, w });
      out.push({
        key: `label:${name}`,
        u: at.x,
        v: at.y,
        // half the INK, not half the 150px box the ink is centred in: a short
        // name near the edge should barely move, and clamping it by the box
        // shoved "Arena" 75px from where Arena is
        halfWidth: Math.min(LABEL_W, textWidth(name)) / 2,
        render: () => <PlaceName name={name} />,
      });
    }
    return out;
  }, [region, vp]);

  /* Changing region re-frames the new one.
   *
   * The canvas deliberately never re-fits once you have panned — otherwise the
   * map would snap back under your finger. But the two regions are different
   * WORLDS, and a pan position on Palpagos means nothing on the World Tree:
   * pan south-east, tap The World Tree, and you landed on an arbitrary corner
   * with the map's edge and dead space on screen. Framing the region you just
   * asked for is the only sensible answer.
   *
   * Skipped on first mount so it cannot fight the auto-focus below, which is
   * what frames a species handed over from a pal card. */
  const prevRegion = useRef<RegionId | null>(null);
  React.useEffect(() => {
    if (prevRegion.current !== null && prevRegion.current !== region) {
      canvas.current?.reset();
    }
    prevRegion.current = region;
  }, [region]);

  // Picking a single pal should SHOW you where it is, not leave you to hunt
  // the world map for teal dots.
  const focusKey = active.length === 1 && filters.pals.size === 1 ? active[0].key : null;
  React.useEffect(() => {
    if (!focusKey) return;
    const set = active[0].set;
    let u0 = 1; let v0 = 1; let u1 = 0; let v1 = 0;
    for (let i = 0; i < set.n; i++) {
      const u = set.xy[i * 2]; const v = set.xy[i * 2 + 1];
      if (u < u0) u0 = u; if (u > u1) u1 = u;
      if (v < v0) v0 = v; if (v > v1) v1 = v;
    }
    // Include the fixed boss. Anubis's wild spawns sit on one small islet
    // while its alpha stands in the desert, so framing the spawns alone hid
    // the one guaranteed place to meet it — the thing you were most likely
    // looking for.
    for (const a of bossPins) {
      if (a.u < u0) u0 = a.u; if (a.u > u1) u1 = a.u;
      if (a.v < v0) v0 = a.v; if (a.v > v1) v1 = a.v;
    }
    const span = Math.max(u1 - u0, v1 - v0, 0.06) * 1.25;
    canvas.current?.focus((u0 + u1) / 2, (v0 + v1) / 2, span);
  }, [bossPins, focusKey]);

  // boss pins ride above the spawn cloud — the guaranteed spot should not be
  // buried under a hundred maybes
  const allPins = useMemo(() => [...markers, ...bossPins], [bossPins, markers]);

  // Labels are SCREEN markers now — outside the map's transform, so their text
  // is drawn at true resolution instead of being rasterised small and blown up
  // (which is what made them jagged on device).

  // picks that have no spawns on the map currently shown
  const elsewhere = useMemo(
    () => [...filters.pals].filter((n) => spawnLevels(n, region) === null),
    [filters.pals, region],
  );
  const otherRegionName = region === 'palpagos' ? 'The World Tree' : 'Palpagos Islands';

  /* ------------------------------------------------------------ interaction */

  /**
   * Tapping should answer "what IS that?" — the pin's layer, and for a pal its
   * level band and whether it only comes out at night. Showing only a
   * coordinate was the map talking to itself.
   *
   * The hit radius is in screen pixels converted to map units, so it stays a
   * thumb-sized target at every zoom rather than shrinking as you zoom in.
   */
  const onPress = useCallback((u: number, v: number) => {
    const reach = 26 / Math.max(1, vp.scale);
    let best: { layer: typeof active[number]; d: number; index: number } | null = null;
    for (const layer of active) {
      const p = nearestPoint(layer.set, u, v, reach);
      if (p == null) continue;
      const du = layer.set.xy[p * 2] - u;
      const dv = layer.set.xy[p * 2 + 1] - v;
      const d = du * du + dv * dv;
      if (!best || d < best.d) best = { layer, d, index: p };
    }
    const r = uvToReadout({ u, v }, regionOf(region));
    const at = `${r.x}, ${r.y}`;
    if (!best) {
      setFocus(active.length
        ? null
        : { title: 'Nothing switched on yet', lines: ['Pick a layer or a pal below.'], at, colour: T.muted, icon: 'map-marker-question-outline' });
      return;
    }

    const { layer } = best;
    const lines: string[] = [];
    // a statue's own name beats the layer's name every time
    const own = layer.key.startsWith('poi:')
      ? poiName(layer.key.slice(4), region, best.index)
      : '';
    const palName = layer.key.startsWith('pal:') || layer.key.startsWith('dun:')
      ? layer.key.slice(4) : null;
    if (palName) {
      const lv = layer.key.startsWith('dun:')
        ? wildBands(palName).dungeon : spawnLevels(palName, region);
      if (lv) lines.push(lv.lo === lv.hi ? `Level ${lv.lo}` : `Level ${lv.lo}–${lv.hi}`);
      if (isNightOnly(palName, region)) lines.push('Only comes out at night');
      if (layer.key.startsWith('dun:')) lines.push('Inside a dungeon, not on the surface');
      if (ownedAny(palName)) lines.push('Already in your box');
      // no "N spots on the map" here — the pill at the bottom already says it
    } else {
      // formatted: this line sits directly above a pill that says "1,572
      // spots on the map", and the same number in two formats one line apart
      // reads as a bug even when it is not
      lines.push(`${layer.set.n.toLocaleString()} on this map`);
    }
    setFocus({
      title: own || layer.label,
      lines: own ? [layer.label, ...lines] : lines,
      at,
      colour: layer.colour,
      icon: layer.icon,
      mark: layer.key.startsWith('poi:')
        ? foundKey(layer.key.slice(4), region, best.index)
        : undefined,
      // an alpha pin IS a pal — let the player open it without leaving the map
      pal: palName ?? (own.startsWith('Alpha ') && pals[own.slice(6)]
        ? own.slice(6)
        : undefined),
    });
  }, [active, region, vp.scale]);

  const setLevelCap = useCallback((hi: number) => {
    void Haptics.selectionAsync();
    setFilters((f) => ({ ...f, level: { lo: 1, hi } }));
  }, []);

  const togglePoi = useCallback((id: string) => {
    void Haptics.selectionAsync();
    setFilters((f) => {
      const poi = new Set(f.poi);
      if (poi.has(id)) poi.delete(id); else poi.add(id);
      return { ...f, poi };
    });
  }, []);

  const togglePal = useCallback((name: string) => {
    void Haptics.selectionAsync();
    setFilters((f) => {
      const next = new Set(f.pals);
      if (next.has(name)) next.delete(name); else next.add(name);
      return { ...f, pals: next };
    });
  }, []);

  /* ---------------------------------------------------------------- render */

  return (
    <View style={{ flex: 1, backgroundColor: '#04090b' }}>
      <MapCanvas
        region={region}
        markers={allPins}
        screenMarkers={labels}
        canvasRef={canvas}
        onViewport={setVp}
        onPress={onPress}
      />

      {/* Corner brackets — the game frames its map panel this way. Purely
          chrome, and deliberately thin: on a phone the map needs the pixels. */}
      <View pointerEvents="none" style={{
        position: 'absolute', top: 8, left: 8, width: 24, height: 24,
        borderTopWidth: 2, borderLeftWidth: 2, borderColor: T.accent, opacity: 0.5,
      }} />
      <View pointerEvents="none" style={{
        position: 'absolute', top: 8, right: 8, width: 24, height: 24,
        borderTopWidth: 2, borderRightWidth: 2, borderColor: T.accent, opacity: 0.5,
      }} />

      {/* top bar — region switch + what's showing. The app shell already
          consumed the top safe area, so this only needs breathing room. */}
      <View style={{
        position: 'absolute', top: 10, left: 12, right: 12,
        flexDirection: 'row', alignItems: 'center', gap: 8,
      }}>
        {MAP_REGIONS.map((r) => (
          <Pressable
            key={r.id}
            onPress={() => patch({ region: r.id as RegionId })}
            accessibilityRole="button"
            accessibilityState={{ selected: region === r.id }}
            style={{
              paddingHorizontal: 12, paddingVertical: 8, borderRadius: 11,
              borderWidth: 1,
              borderColor: region === r.id ? T.accent : T.line,
              backgroundColor: region === r.id ? T.accentSoft : 'rgba(12,22,24,0.82)',
            }}
          >
            <Text style={{
              color: region === r.id ? T.accentInk : T.muted,
              fontWeight: '800', fontSize: 12.5,
            }}>{r.name}</Text>
          </Pressable>
        ))}
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={() => canvas.current?.reset()}
          accessibilityRole="button"
          accessibilityLabel="Back to the whole map"
          style={{
            padding: 9, borderRadius: 11, borderWidth: 1, borderColor: T.line,
            backgroundColor: 'rgba(12,22,24,0.82)',
          }}
        >
          <Icon name="fit-to-screen-outline" size={17} color={T.muted} />
        </Pressable>
      </View>

      {/* the readout, in the game's own numbers */}
      {focus && (
        <Pressable
          onPress={() => setFocus(null)}
          accessibilityRole="button"
          accessibilityLabel={`${focus.title}. Tap to dismiss.`}
          style={{
            position: 'absolute', top: 54, left: 12, right: 12,
            backgroundColor: 'rgba(12,22,24,0.94)', borderRadius: 13,
            borderWidth: 1, borderColor: focus.colour,
            paddingHorizontal: 12, paddingVertical: 10, gap: 4,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name={focus.icon} size={16} color={focus.colour} />
            <Text style={{ color: T.ink, fontWeight: '800', fontSize: 14, flex: 1 }}>
              {focus.title}
            </Text>
            <Text style={{ color: T.faint, fontSize: 11, fontWeight: '700' }}>{focus.at}</Text>
          </View>
          {focus.lines.map((line) => (
            <Text key={line} style={{ color: T.muted, fontSize: 12, fontWeight: '600' }}>
              {line}
            </Text>
          ))}
          {focus.pal && (
            <Pressable
              onPress={() => setOpenPal(focus.pal!)}
              accessibilityRole="button"
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4,
                alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 6,
                borderRadius: 9, borderWidth: 1, borderColor: T.accent,
                backgroundColor: T.accentSoft,
              }}
            >
              <Icon name="book-open-variant" size={14} color={T.accentInk} />
              <Text style={{ color: T.accentInk, fontSize: 12, fontWeight: '700' }}>
                Open {focus.pal}
              </Text>
            </Pressable>
          )}
          {focus.mark && (
            <Pressable
              onPress={() => toggleFound(focus.mark!)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isFound(focus.mark) }}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4,
                alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 6,
                borderRadius: 9, borderWidth: 1,
                borderColor: isFound(focus.mark) ? T.ok : T.line,
                backgroundColor: isFound(focus.mark) ? T.okSoft : T.surface,
              }}
            >
              <Icon
                name={isFound(focus.mark) ? 'check-circle' : 'checkbox-blank-circle-outline'}
                size={14}
                color={isFound(focus.mark) ? T.ok : T.muted}
              />
              <Text style={{
                color: isFound(focus.mark) ? T.ok : T.ink, fontSize: 12, fontWeight: '700',
              }}>
                {isFound(focus.mark) ? 'Got this one' : 'Mark as found'}
              </Text>
            </Pressable>
          )}
        </Pressable>
      )}

      {/* A pal picked on one map vanishes silently when you switch to the
          other. Say so, and say where it does live, instead of showing an
          empty world and letting the player wonder what broke. */}
      {elsewhere.length > 0 && (
        <View style={{
          position: 'absolute', top: 56, left: 12, right: 12,
          backgroundColor: 'rgba(12,22,24,0.94)', borderRadius: 12,
          borderWidth: 1, borderColor: T.line, paddingHorizontal: 12, paddingVertical: 9,
          flexDirection: 'row', alignItems: 'center', gap: 8,
        }}>
          <Icon name="information-outline" size={15} color={T.muted} />
          <Text style={[s.body, { fontSize: 12.5, flex: 1 }]}>
            {elsewhere.length === 1
              ? `${elsewhere[0]} doesn't live on this map.`
              : `${elsewhere.length} of your picks don't live on this map.`}
            {' '}Try {otherRegionName}.
          </Text>
        </View>
      )}

      {/* An empty world with three buttons tells a new player nothing, so
          this points at the two that matter. It used to be a five-line
          explainer covering a third of the map. It is one line now, and
          tapping it makes it go away for good. */}
      {/* Nothing is drawn AND nothing is switched on — a genuinely new map. */}
      {active.length === 0 && !sheet && !hintOff
        && filters.pals.size === 0 && filters.poi.size === 0 && (
        <Pressable
          onPress={() => setHintOff(true)}
          accessibilityRole="button"
          accessibilityLabel="Hide this hint"
          style={{
            position: 'absolute', left: 12, right: 12, bottom: insets.bottom + 74,
            backgroundColor: 'rgba(12,22,24,0.92)', borderRadius: 11,
            borderWidth: 1, borderColor: T.line,
            paddingHorizontal: 11, paddingVertical: 9,
            flexDirection: 'row', alignItems: 'center', gap: 8,
          }}
        >
          <Icon name="gesture-tap" size={15} color={T.accentInk} />
          <Text style={[s.body, { fontSize: 12.5, flex: 1 }]}>
            <Text style={{ color: T.accentInk, fontWeight: '800' }}>Find</Text>
            {' '}a pal, or{' '}
            <Text style={{ color: T.accentInk, fontWeight: '800' }}>Layers</Text>
            {' '}for chests, ore and dungeons.
          </Text>
          <Icon name="close" size={14} color={T.faint} />
        </Pressable>
      )}

      {/* Nothing is drawn but you DID pick something. The old code showed the
          first-run hint here — "Find a pal to see where it spawns" — to a
          player who had just found one, while the real reason sat one line
          away in the data. Say the actual reason. */}
      {active.length === 0 && !sheet
        && (filters.pals.size > 0 || filters.poi.size > 0) && (
        <View style={{
          position: 'absolute', left: 12, right: 12, bottom: insets.bottom + 74,
          backgroundColor: 'rgba(12,22,24,0.94)', borderRadius: 13,
          borderWidth: 1, borderColor: T.line, padding: 12, gap: 7,
        }}>
          <Text style={{ color: T.ink, fontWeight: '800', fontSize: 13.5 }}>
            {emptyReason(filters, region).title}
          </Text>
          <Text style={[s.body, { fontSize: 12.5 }]}>
            {emptyReason(filters, region).body}
          </Text>
        </View>
      )}

      {/* bottom controls */}
      <View style={{
        position: 'absolute', left: 12, right: 12, bottom: insets.bottom + 14, gap: 8,
      }}>
        {shownCount > 0 && (
          <>
            {/* The legend only lists what is ON — a static key to 23 layers
                would be a wall of colour the player has to filter by eye. */}
            {legend && (
              <View style={{
                backgroundColor: 'rgba(12,22,24,0.94)', borderRadius: 12,
                borderWidth: 1, borderColor: T.line, padding: 10, gap: 8,
              }}>
                {active.map((l) => (
                  <View key={l.key}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                    {/* the swatch is a miniature of the actual pin — same
                        colour, same shape, same glyph — so the key can be
                        matched to the map without reading a word of it */}
                    <View style={{
                      width: 19, height: 19,
                      borderRadius: l.square ? 5 : 9.5,
                      borderWidth: 2, borderColor: l.colour,
                      backgroundColor: 'rgba(10,20,24,0.86)',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      {l.photo != null
                        ? <Image source={l.photo}
                            style={{ width: 15, height: 15, borderRadius: 7.5 }}
                            resizeMode="cover" />
                        : l.art != null
                          ? <Image source={l.art} style={{ width: 11, height: 11 }}
                              resizeMode="contain" />
                          : <Icon name={l.icon} size={10} color={l.colour} />}
                    </View>
                    <Text style={{ color: T.ink, fontSize: 12.5, fontWeight: '700', flex: 1 }}>
                      {l.label}
                    </Text>
                    <Text style={{ color: T.faint, fontSize: 11.5, fontWeight: '700' }}>
                      {l.set.n.toLocaleString()}
                    </Text>
                  </View>
                ))}
                <Text style={{ color: T.faint, fontSize: 10.5 }}>
                  Round pins are out in the world · square pins are inside dungeons
                </Text>
              </View>
            )}
            <Pressable
              onPress={() => setLegend((v) => !v)}
              accessibilityRole="button"
              accessibilityState={{ expanded: legend }}
              accessibilityLabel={legend ? 'Hide the key' : 'Show what the pins mean'}
              style={{
                alignSelf: 'flex-start', backgroundColor: 'rgba(12,22,24,0.88)',
                borderRadius: 10, borderWidth: 1, borderColor: legend ? T.accent : T.line,
                paddingHorizontal: 10, paddingVertical: 6,
                flexDirection: 'row', alignItems: 'center', gap: 6,
              }}
            >
              <Icon name={legend ? 'chevron-down' : 'chevron-up'} size={13}
                color={legend ? T.accentInk : T.muted} />
              <Text style={{
                color: legend ? T.accentInk : T.muted, fontSize: 11.5, fontWeight: '700',
              }}>
                {shownCount.toLocaleString()} {shownCount === 1 ? 'spot' : 'spots'} on the map
              </Text>
            </Pressable>
          </>
        )}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <ControlBtn
            icon="layers-outline"
            label={filters.poi.size ? `Layers · ${filters.poi.size}` : 'Layers'}
            on={filters.poi.size > 0}
            onPress={() => setSheet('layers')}
          />
          <ControlBtn
            icon="paw-outline"
            label={filters.pals.size ? `Pals · ${filters.pals.size}` : 'Find'}
            on={filters.pals.size > 0}
            onPress={() => setSheet('pals')}
          />
          {/* Three states, not two. It used to flip between "All day" and
              "Night", so the one question a player asks standing in daylight —
              "what can I catch RIGHT NOW?" — had no setting. The engine always
              supported day-only; only this button did not.

              "All day" is gone as a label too: it reads as DAYTIME to anyone
              who has not seen the code, which is exactly the ambiguity that
              made a two-state toggle confusing. */}
          <ControlBtn
            icon={timeMode(filters.time) === 'night' ? 'weather-night' : 'white-balance-sunny'}
            label={TIME_LABEL[timeMode(filters.time)]}
            on={timeMode(filters.time) !== 'any'}
            onPress={() => patch({ time: NEXT_TIME[timeMode(filters.time)] })}
          />
        </View>
      </View>

      {/* the pal's own card, over the map — you keep your place */}
      {openPal && <PalDetail name={openPal} onClose={() => setOpenPal(null)} />}

      {sheet === 'layers' && (
        <LayerSheet
          filters={filters}
          onToggle={togglePoi}
          onClear={() => patch({ poi: new Set() })}
          onClearFound={clearFound}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'pals' && (
        <PalSheet
          filters={filters}
          region={region}
          onToggle={togglePal}
          onTogglePoi={togglePoi}
          onSetLevel={setLevelCap}
          onGoToPlace={(u, v) => {
            setSheet(null);
            canvas.current?.focus(u, v, 0.07);
          }}
          onToggleDungeons={() => patch({ dungeons: !filters.dungeons })}
          onClear={() => patch({ pals: new Set() })}
          onClose={() => setSheet(null)}
        />
      )}
    </View>
  );
}

/* -------------------------------------------------------------- pieces */

/** A place name, drawn like the game draws them: light letters with a dark
 *  halo so they stay readable over snow, sand and ocean alike. */
const LABEL_W = 150;
const LABEL_H = 26;

/** Rough on-screen width of a place name at the label's 10.5px bold face.
 *  Measuring text properly would cost a layout pass per label per frame; this
 *  is within a few px and only ever decides whether two names collide. */
/**
 * Widest the name can be drawn, in px.
 *
 * 6.8 is the MEASURED per-character maximum, not a guess: the 30 place names
 * on screen at the default fit run 5.21 to 6.67 px per character at this size
 * and weight. The old 5.9 was mid-range, which is the wrong end to pick — this
 * number bounds the label's box, so under-reserving truncates a name at the
 * screen edge ("Duneshelte…") and over-reserving only costs a little spacing.
 *
 * Measured on the web build's font. iOS renders San Francisco, so the exact
 * figure there may differ slightly; that is why this is the max plus a margin
 * rather than a fitted average.
 */
function textWidth(name: string): number {
  return Math.min(LABEL_W, name.length * 6.8);
}

function PlaceName({ name }: { name: string }) {
  return (
    // Centred with a negative MARGIN, not a transform. Tried the transform —
    // it shifted every name half a box to the right, because the marker
    // wrapper's counter-scale already turns about the laid-out box's centre.
    <View pointerEvents="none"
      style={{ width: LABEL_W, marginLeft: -LABEL_W / 2, marginTop: -9 }}>
      <Text
        numberOfLines={2}
        style={{
          color: '#EAF6F8', fontSize: 10.5, fontWeight: '800', textAlign: 'center',
          letterSpacing: 0.4, textShadowColor: 'rgba(4,12,16,0.95)',
          textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
        }}
      >
        {name}
      </Text>
    </View>
  );
}

const PIN = 23;

/** the game's level cap — "Any level" is this, so no spawn is ever excluded */
const ALL_LEVEL_CAP = 80;
/** upper bounds a player actually thinks in, roughly the game's own pacing */
const LEVEL_CAPS = [ALL_LEVEL_CAP, 15, 30, 45, 60];

/**
 * Why the map is empty when the player HAS switched something on.
 *
 * Never a generic shrug: the data knows the answer. A night-only pal in
 * daytime is the common case and the app can name both the pal and the fix.
 */
function emptyReason(f: MapFilters, region: RegionId): { title: string; body: string } {
  const mode = timeMode(f.time);
  if (mode !== 'any' && f.pals.size) {
    const wrongTime = [...f.pals].filter((n) => (
      mode === 'day' ? isNightOnly(n, region) : !isNightOnly(n, region)
    ));
    if (wrongTime.length === f.pals.size) {
      const who = wrongTime.length === 1 ? wrongTime[0] : `${wrongTime.length} pals you picked`;
      return {
        title: mode === 'day' ? 'Nothing out in the daytime' : 'Nothing out at night',
        body: mode === 'day'
          ? `${who} only comes out at night. Tap Daytime again for Night, or once more for Any time.`
          : `${who} does not come out at night. Tap Night again for Any time.`,
      };
    }
  }
  if (f.level.hi < ALL_LEVEL_CAP) {
    // name the cap the player actually set, rather than "those levels" — the
    // control is an upper bound, so the sentence should read like one
    return {
      title: `Nothing at level ${f.level.hi} or under`,
      body: `What you switched on only spawns above level ${f.level.hi} on this `
        + 'map. Tap Any level to see all of it.',
    };
  }
  return {
    title: 'Nothing here on this map',
    body: `${namedLayers(f, region) ?? 'What you switched on does not appear'} in `
      + 'this region. Try the other map at the top.',
  };
}

/**
 * The layers you switched on, written out, when NONE of them exist here.
 *
 * 15 of the 23 layers have no points at all on the World Tree — ore, coal,
 * sulfur, paldium, quartz, dungeons and more are Palpagos-only. Telling a
 * player "what you switched on does not appear in this region" makes them go
 * and check which of the three it was; the app already knows it was all of
 * them, and naming them is the same courtesy the day/night message gives.
 * Returns null when only some are missing, because then the map is not empty
 * and this message is not the one being shown.
 */
function namedLayers(f: MapFilters, region: RegionId): string | null {
  const names: string[] = [];
  for (const id of f.poi) {
    if ((poiPoints(id, region)?.n ?? 0) > 0) return null;   // not all missing
    const label = poiLayer(id)?.label;
    if (label) names.push(label.toLowerCase());
  }
  if (!names.length) return null;
  // carry the verb with the subject, or a list reads "Ore, sulfur and coal
  // DOES not appear" — bad grammar in his app is as bad as jargon in it
  if (names.length === 1) return `${capitalise(names[0])} does not appear`;
  const last = names.pop()!;
  return `${capitalise(`${names.join(', ')} and ${last}`)} do not appear`;
}

function capitalise(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** which of the three time settings a filter represents */
function timeMode(t: { day: boolean; night: boolean }): 'any' | 'day' | 'night' {
  if (t.day && t.night) return 'any';
  return t.day ? 'day' : 'night';
}

const TIME_LABEL: Record<'any' | 'day' | 'night', string> = {
  any: 'Any time',
  day: 'Daytime',
  night: 'Night',
};

/** Any time -> Daytime -> Night -> Any time */
const NEXT_TIME: Record<'any' | 'day' | 'night', { day: boolean; night: boolean }> = {
  any: { day: true, night: false },
  day: { day: false, night: true },
  night: { day: true, night: true },
};

/** the same words the Paldex uses for these filters, so they read as one app */
const OWN_LABEL: Record<string, string> = {
  owned: 'In my box',
  missing: "I'm missing",
  pairready: 'Pair ready',
  onegender: 'One gender only',
};

const SORT_LABEL: Record<string, string> = {
  name: 'A–Z',
  rarity_desc: 'Rarest first',
  rarity_asc: 'Common first',
};

/**
 * One colour per pal you have picked, in the order you picked them.
 *
 * Chosen against the map itself, not on a swatch sheet: the terrain runs
 * green, snow-white, teal sea and desert sand, so mid greens and pale yellows
 * vanish into it. These eight are all high-chroma and none of them is a
 * terrain colour. The first is the app accent, so picking a single pal — much
 * the commonest case — looks exactly as it always has.
 */
const PAL_HUES = [
  T.accent,   // teal
  '#FFB454',  // amber
  '#FF7597',  // rose
  '#A98BFF',  // violet
  '#5AD1FF',  // sky
  '#FFE066',  // lemon
  '#FF6B4A',  // vermilion
  '#E86BFF',  // magenta
];

/**
 * Dungeon pins are SQUARE and surface pins are round.
 *
 * Hue is spent on WHICH pal a pin belongs to (see PAL_HUES), so "out in the
 * world" versus "inside a dungeon" cannot also be a colour. Shape survives
 * colour-blindness, small sizes and a busy map in a way another shade would
 * not, and it stays readable when two pals sit at adjacent hues.
 */
function Pin({ colour, icon, count, square, art, done, photo, night, boss }: {
  colour: string; icon: string; count: number; square?: boolean; art?: number;
  done?: boolean;
  /** the pal's own portrait, drawn filling the pin */
  photo?: number;
  night?: boolean;
  boss?: boolean;
}) {
  const many = count > 1;
  // A pal pin is bigger than a resource pin on purpose: it carries a face, and
  // a face at 23px is a smudge. Bosses are bigger again — there is one of them.
  const size = boss ? PIN + 9 : photo != null ? PIN + 5 : PIN;
  return (
    <View style={{
      width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2,
      borderRadius: square ? 6 : size / 2, alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'rgba(10,20,24,0.86)', borderWidth: 2, borderColor: colour,
      // a found marker fades back so what stands out is what you still need
      opacity: done ? 0.32 : 1,
    }}>
      {/* A cluster used to replace the symbol with a bare count, which threw
          away the one thing that says WHAT it is — and at the default fit
          almost every pin is a cluster, so a map with chests, ore and NPCs on
          was a field of anonymous numbers. The glyph always shows; the count
          rides in a badge on the corner. */}
      {photo != null ? (
        // the pal itself. "Bosses etc must be the image of the actual pal it
        // is" (CEO) — and the same is true of a spawn: a paw print tells you
        // something is here, a face tells you WHAT.
        <Image
          source={photo}
          style={{
            width: size - 5, height: size - 5,
            borderRadius: square ? 3 : (size - 5) / 2,
          }}
          resizeMode="cover"
        />
      ) : art != null ? (
        // the GAME's own symbol — a player already knows what it means
        <Image
          source={art}
          style={{ width: many ? 13 : 15, height: many ? 13 : 15 }}
          resizeMode="contain"
        />
      ) : (
        <Icon name={icon} size={many ? 12 : 14} color={colour} />
      )}
      {boss && (
        // the crown sits ON the portrait rather than replacing it
        <View style={{
          position: 'absolute', top: -7, alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name="crown" size={13} color={T.gold} />
        </View>
      )}
      {night && (
        // the night signal survives the portrait taking the middle
        <View style={{
          position: 'absolute', left: -4, top: -3,
          width: 12, height: 12, borderRadius: 6,
          backgroundColor: 'rgba(8,18,22,0.92)',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name="weather-night" size={9} color="#B9AEFF" />
        </View>
      )}
      {many && (
        <View style={{
          position: 'absolute', right: -5, bottom: -4,
          minWidth: 14, height: 13, borderRadius: 6.5,
          paddingHorizontal: 3, backgroundColor: colour,
          borderWidth: 1, borderColor: 'rgba(8,18,22,0.92)',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{
            color: '#08161A', fontWeight: '900', fontSize: count > 99 ? 7.5 : 8.5,
          }}>
            {count > 999 ? '999+' : count}
          </Text>
        </View>
      )}
    </View>
  );
}

function ControlBtn({ icon, label, on, onPress }: {
  icon: string; label: string; on: boolean; onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12,
        borderWidth: 1, borderColor: on ? T.accent : T.line,
        backgroundColor: pressed ? T.surface2 : on ? T.accentSoft : 'rgba(12,22,24,0.88)',
      })}
    >
      <Icon name={icon} size={16} color={on ? T.accentInk : T.muted} />
      <Text style={{ color: on ? T.accentInk : T.ink, fontWeight: '800', fontSize: 12.5 }}>
        {label}
      </Text>
    </Pressable>
  );
}

function SheetShell({ title, onClear, onClose, children }: {
  title: string; onClear: () => void; onClose: () => void; children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{
      position: 'absolute', left: 0, right: 0, bottom: 0, top: '40%',
      backgroundColor: T.bg2, borderTopLeftRadius: 20, borderTopRightRadius: 20,
      borderTopWidth: 1, borderColor: T.line,
    }}>
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10,
        borderBottomWidth: 1, borderBottomColor: T.line,
      }}>
        <Text style={{ color: T.ink, fontWeight: '800', fontSize: 16, flex: 1 }}>{title}</Text>
        <Pressable onPress={onClear} hitSlop={8} accessibilityRole="button">
          <Text style={{ color: T.muted, fontWeight: '700', fontSize: 12.5 }}>Clear</Text>
        </Pressable>
        <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button"
          accessibilityLabel="Close">
          <Icon name="close" size={22} color={T.muted} />
        </Pressable>
      </View>
      <View style={{ flex: 1, paddingBottom: insets.bottom }}>{children}</View>
    </View>
  );
}

function LayerSheet({ filters, onToggle, onClear, onClearFound, onClose }: {
  filters: MapFilters; onToggle: (id: string) => void; onClear: () => void;
  onClearFound: () => void; onClose: () => void;
}) {
  const groups = useMemo(() => {
    const by = new Map<LayerGroup, ReturnType<typeof poiLayers>>();
    for (const l of poiLayers()) {
      const list = by.get(l.group) ?? [];
      list.push(l);
      by.set(l.group, list);
    }
    return [...by.entries()];
  }, []);

  return (
    <SheetShell title="What to show" onClear={onClear} onClose={onClose}>
      <ScrollView contentContainerStyle={{ padding: 14, gap: 16 }}>
        {foundCount() > 0 && (
          <Pressable
            onPress={onClearFound}
            accessibilityRole="button"
            style={{
              alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7,
              paddingHorizontal: 11, paddingVertical: 9, borderRadius: 11,
              borderWidth: 1, borderColor: T.line, backgroundColor: T.surface,
            }}
          >
            <Icon name="backup-restore" size={15} color={T.muted} />
            <Text style={{ color: T.muted, fontWeight: '700', fontSize: 12.5 }}>
              Clear {foundCount()} found {foundCount() === 1 ? 'mark' : 'marks'}
            </Text>
          </Pressable>
        )}
        {groups.map(([group, list]) => (
          <View key={group} style={{ gap: 9 }}>
            <Text style={{
              color: T.faint, fontSize: 10.5, fontWeight: '800', letterSpacing: 1.1,
            }}>{GROUP_LABEL[group].toUpperCase()}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {list.map((l) => {
                const on = filters.poi.has(l.id);
                return (
                  <Pressable
                    key={l.id}
                    onPress={() => onToggle(l.id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={`${l.label}, ${l.n.toLocaleString()} on the map`}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 7,
                      paddingHorizontal: 11, paddingVertical: 9, borderRadius: 11,
                      borderWidth: 1, borderColor: on ? l.colour : T.line,
                      backgroundColor: on ? T.surface2 : T.surface,
                    }}
                  >
                    <Icon name={l.icon} size={16} color={on ? l.colour : T.muted} />
                    <Text style={{ color: on ? T.ink : T.muted, fontWeight: '700', fontSize: 12.5 }}>
                      {l.label}
                    </Text>
                    <Text style={{ color: T.faint, fontWeight: '700', fontSize: 11 }}>
                      {l.n.toLocaleString()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
    </SheetShell>
  );
}

function PalSheet({
  filters, region, onToggle, onTogglePoi, onToggleDungeons, onSetLevel, onGoToPlace,
  onClear, onClose,
}: {
  filters: MapFilters; region: RegionId;
  onToggle: (name: string) => void;
  onTogglePoi: (id: string) => void;
  onToggleDungeons: () => void;
  onSetLevel: (hi: number) => void;
  onGoToPlace: (u: number, v: number) => void;
  onClear: () => void; onClose: () => void;
}) {
  const [q, setQ] = useState('');
  // The SAME filter model the Paldex uses, not a second one that looks like
  // it. "Only pals I'm missing" was a bespoke checkbox here while the Paldex
  // had element, work and ownership filters plus sorting — the CEO called this
  // search "garbage bad filters" and asked for parity, so it now runs the very
  // same applyFilters/sortedPals and opens the very same FilterSheet.
  const [pf, setPf] = useState<Filters>(NO_FILTERS);
  const [sort, setSort] = useState<SortKey>('number');
  const [filterSheet, setFilterSheet] = useState(false);

  const places = useMemo(() => searchPlaces(q, region), [q, region]);

  /** Layers whose NAME matches what you typed.
   *
   * Asking "where do I get sulfur" is the most ordinary thing a player does
   * with a map, and typing it here used to answer "No pal by that name spawns
   * on this map" — a dead end, while a Sulfur layer with hundreds of nodes sat
   * one tap away behind a different button. The app knew the answer and would
   * not give it. */
  const layerHits = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    return poiLayers()
      .filter((l) => l.label.toLowerCase().includes(needle))
      .map((l) => ({ ...l, n: poiPoints(l.id, region)?.n ?? 0 }))
      .filter((l) => l.n > 0);
  }, [q, region]);

  /** every pal that actually spawns on THIS map — the base the filters see */
  const base = useMemo(
    () => spawnablePals().filter((n) => spawnLevels(n, region) !== null),
    [region],
  );

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const named = needle ? base.filter((n) => n.toLowerCase().includes(needle)) : base;
    return sortedPals(applyFilters(named, pf), sort);
  }, [base, pf, q, sort]);

  /** what the filter button says out loud, so an active filter is never hidden */
  const bits: string[] = [];
  if (pf.own !== 'all') bits.push(OWN_LABEL[pf.own]);
  if (pf.elements.length) bits.push(pf.elements.join('/'));
  if (pf.work) bits.push(workLabel(pf.work));
  if (sort !== 'number') bits.push(SORT_LABEL[sort] ?? sort);

  return (
    <SheetShell title="Find anything on the map" onClear={onClear} onClose={onClose}>
      <View style={{ paddingHorizontal: 14, paddingTop: 12, gap: 10 }}>
        <SearchInput value={q} onChange={setQ} placeholder="Search pals, places, chests, ore…" />
        <Pressable
          onPress={onToggleDungeons}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: filters.dungeons }}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
            paddingHorizontal: 11, paddingVertical: 9, borderRadius: 11, borderWidth: 1,
            borderColor: filters.dungeons ? '#8AA6FF' : T.line,
            backgroundColor: filters.dungeons ? T.surface2 : T.surface,
          }}
        >
          <Icon
            name={filters.dungeons ? 'checkbox-marked-outline' : 'checkbox-blank-outline'}
            size={16}
            color={filters.dungeons ? '#8AA6FF' : T.muted}
          />
          <Text style={{ color: T.ink, fontWeight: '700', fontSize: 12.5 }}>
            Also show dungeon spawns
          </Text>
        </Pressable>
        {/* "What can I actually catch at my level" — the map has known every
            spawn's level band since the pipeline landed, and until now there
            was no way to ask. An upper bound is the question players have:
            a level 25 player wants to see what is at or under 25, and still
            wants the low ones for breeding stock. */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {LEVEL_CAPS.map((cap) => {
            const on = filters.level.hi === cap;
            return (
              <Pressable
                key={cap}
                onPress={() => onSetLevel(cap)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={cap === ALL_LEVEL_CAP
                  ? 'Any level' : `Only pals up to level ${cap}`}
                style={{
                  paddingHorizontal: 11, paddingVertical: 7, borderRadius: 10,
                  borderWidth: 1, borderColor: on ? T.accent : T.line,
                  backgroundColor: on ? T.accentSoft : T.surface,
                }}
              >
                <Text style={{
                  color: on ? T.accentInk : T.muted, fontWeight: '700', fontSize: 12,
                }}>
                  {cap === ALL_LEVEL_CAP ? 'Any level' : `Up to ${cap}`}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable
          onPress={() => setFilterSheet(true)}
          accessibilityRole="button"
          accessibilityLabel="Filter and sort the pals"
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
            paddingHorizontal: 11, paddingVertical: 9, borderRadius: 11, borderWidth: 1,
            borderColor: bits.length ? T.accent : T.line,
            backgroundColor: bits.length ? T.accentSoft : T.surface,
          }}
        >
          <Icon name="tune-variant" size={16}
            color={bits.length ? T.accentInk : T.muted} />
          <Text style={{
            color: bits.length ? T.accentInk : T.ink, fontWeight: '700', fontSize: 12.5,
          }}>
            {bits.length ? bits.join(' · ') : 'Filter & sort'}
          </Text>
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={{ padding: 14, gap: 7 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {/* Layers first: "sulfur" or "chest" is a request for a KIND of thing,
            and one tap should put every one of them on the map. */}
        {layerHits.length > 0 && (
          <>
            <Text style={{
              color: T.faint, fontSize: 10.5, fontWeight: '800', letterSpacing: 1.1,
            }}>ON THE MAP</Text>
            {layerHits.map((l) => {
              const on = filters.poi.has(l.id);
              return (
                <Pressable
                  key={`layer:${l.id}`}
                  onPress={() => onTogglePoi(l.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                    paddingHorizontal: 12, paddingVertical: 11, borderRadius: 12,
                    borderWidth: 1, borderColor: on ? l.colour : T.line,
                    backgroundColor: on ? T.surface2 : T.surface,
                  }}
                >
                  {MAP_ICONS[l.id] != null
                    ? <Image source={MAP_ICONS[l.id]}
                        style={{ width: 18, height: 18 }} resizeMode="contain" />
                    : <Icon name={l.icon} size={17} color={l.colour} />}
                  <Text style={{ color: T.ink, fontWeight: '800', fontSize: 14, flex: 1 }}>
                    {l.label}
                  </Text>
                  <Text style={{ color: T.muted, fontWeight: '700', fontSize: 11.5 }}>
                    {on ? 'on the map' : l.n.toLocaleString()}
                  </Text>
                </Pressable>
              );
            })}
          </>
        )}
        {/* Places next: someone typing "fisherman" wants the point, and the
            names are real ones out of the game's own tables. */}
        {places.length > 0 && (
          <>
            <Text style={{
              color: T.faint, fontSize: 10.5, fontWeight: '800', letterSpacing: 1.1,
            }}>PLACES</Text>
            {places.map((pl) => (
              <Pressable
                key={`${pl.layerId}:${pl.name}`}
                onPress={() => onGoToPlace(pl.u, pl.v)}
                accessibilityRole="button"
                accessibilityLabel={`Go to ${pl.name}`}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  paddingHorizontal: 12, paddingVertical: 11, borderRadius: 12,
                  borderWidth: 1, borderColor: T.line, backgroundColor: T.surface,
                }}
              >
                <Icon name="map-marker" size={17} color={pl.colour} />
                <Text style={{ color: T.ink, fontWeight: '800', fontSize: 14, flex: 1 }}>
                  {pl.name}
                </Text>
                <Text style={{ color: T.muted, fontWeight: '700', fontSize: 11.5 }}>
                  {pl.label}
                </Text>
              </Pressable>
            ))}
            <Text style={{
              color: T.faint, fontSize: 10.5, fontWeight: '800', letterSpacing: 1.1,
              marginTop: 6,
            }}>PALS</Text>
          </>
        )}
        {list.length === 0 && (
          <Text style={[s.body, { color: T.faint, paddingTop: 10 }]}>
            {/* The list is narrowed by BOTH the search box and the filters, so
                "you own every pal that spawns here" was a claim the app could
                not stand behind: search "zzz" with a filter on and it said so
                while knowing nothing of the sort. Each case says only what is
                actually true of it. */}
            {layerHits.length || places.length
              ? ''
              : q.trim() && bits.length
                ? 'No pal by that name matches those filters.'
                : q.trim()
                  ? 'Nothing on this map goes by that name.'
                : bits.length
                  ? 'No pal on this map matches those filters.'
                  : 'Nothing left to find here — you own every pal that spawns on this map.'}
          </Text>
        )}
        {list.map((n) => {
          const on = filters.pals.has(n);
          const lv = spawnLevels(n, region);
          const night = isNightOnly(n, region);
          return (
            <Pressable
              key={n}
              onPress={() => onToggle(n)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 10,
                paddingHorizontal: 12, paddingVertical: 11, borderRadius: 12,
                borderWidth: 1, borderColor: on ? T.accent : T.line,
                backgroundColor: on ? T.accentSoft : T.surface,
              }}
            >
              <Icon
                name={on ? 'eye-outline' : 'eye-off-outline'}
                size={17}
                color={on ? T.accentInk : T.faint}
              />
              <Text style={{ color: T.ink, fontWeight: '800', fontSize: 14, flex: 1 }}>{n}</Text>
              {ownedAny(n) && <Icon name="check-circle-outline" size={15} color={T.ok} />}
              {night && <Icon name="weather-night" size={15} color="#9B8CFF" />}
              {lv && (
                <Text style={{ color: T.muted, fontWeight: '700', fontSize: 11.5 }}>
                  Lv {lv.lo === lv.hi ? lv.lo : `${lv.lo}–${lv.hi}`}
                </Text>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
      {filterSheet && (
        // The Paldex's own sheet, handed the pals that spawn on THIS map as its
        // base — so "Show 44 pals" is a promise it can keep here too.
        <FilterSheet
          filters={pf}
          sort={sort}
          base={base}
          onApply={(f, sk) => { setPf(f); setSort(sk); setFilterSheet(false); }}
          onClose={() => setFilterSheet(false)}
        />
      )}
    </SheetShell>
  );
}

/** Kept honest: the Paldex is the name authority, so a species that is not in
 *  it must never reach the map's UI. */
export function mapKnowsPal(name: string): boolean {
  return Boolean(pals[name]);
}
