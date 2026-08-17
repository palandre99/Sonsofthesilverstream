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
import {
  Alert, FlatList, Image, Pressable, ScrollView, Share, Text, TextInput, View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { T } from '../theme';
import { Icon } from '../ui/Icon';
import { PalIcon, SearchInput, s } from '../ui/kit';
import {
  MapCanvas, type MapCanvasHandle, type MapMarker, type ScreenMarker,
} from '../map/MapCanvas';
import { clusterPoints, nearestPoint, pointsInRect, type PointSet } from '../map/points';
import { uvToReadout, regionOf, type RegionId } from '../map/projection';
import {
  PIN_LABEL_MAX, addPin, clearPins, loadPins, onPinsChange, pinCount, pinsIn, removePin,
  renamePin, type MapPin,
} from '../map/pins';
import {
  addStop, clearRoute, importRoute, loadRoute, onRouteChange, removeStop,
  routeIn, stopCount,
} from '../map/routes';
import { decodeRoute, encodeRoute } from '../map/routeShare';
import {
  GROUP_LABEL, alphaSpots, closeMatches, dungeonPoints, emptyFilters, isNightOnly,
  poiLayer,
  poiLayers, poiPoints, searchPlaces,
  poiName, spawnLevels, spawnPoints, spawnablePals, wildBands,
  whereFromLine,
  type LayerGroup, type MapFilters,
} from '../map/layers';
import { MAP_REGIONS } from '../data/mapMeta.g';
import { MAP_ALPHAS } from '../data/mapSpawns.g';
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
  /** the player's pin whose card is open, if any */
  const [openPin, setOpenPin] = useState<MapPin | null>(null);
  /** a route spot whose card is open and has NO pin under it (the mark was
   *  deleted after the stop was added) — the stop must stay reachable */
  const [openStops, setOpenStops] = useState<{ u: number; v: number } | null>(null);
  /** the draft name while renaming that pin — null when not renaming */
  const [draft, setDraft] = useState<string | null>(null);

  React.useEffect(() => {
    void loadFound();
    void loadPins();
    void loadRoute();
    const offFound = onFoundChange(() => setTicks((n) => n + 1));
    const offPins = onPinsChange(() => setTicks((n) => n + 1));
    const offRoute = onRouteChange(() => setTicks((n) => n + 1));
    return () => { offFound(); offPins(); offRoute(); };
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
      // BIGGEST first, then cap. The cap used to keep whatever came out of the
      // grid first, which is the order points happen to sit in the file — so
      // the densest concentration on the map could be dropped while a cluster
      // of four survived. Measured: with six layers on, the largest berry
      // patch (1,016 points) was being hidden and the biggest badge drawn was
      // 843. If only N pins fit, they should be the N that matter.
      const clusters = clusterPoints(layer.set, hits, vp.scale, cell, li)
        .sort((a, b) => b.count - a.count)
        .slice(0, budget);
      for (const c of clusters) {
        out.push({
          // stable while the zoom holds, so a pan never remounts a pin
          key: `${layer.key}:${c.cell}`,
          u: c.u,
          v: c.v,
          render: () => (
            <Pin colour={layer.colour} icon={layer.icon} count={c.count}
              square={layer.square} art={layer.art}
              // A lone alpha shows the face of the pal it actually is. The
              // layer knows — it carries all 72 names — and "bosses etc must
              // be the image of the actual pal it is" (CEO) applies just as
              // much to the Alpha boss LAYER as it did to a boss you reach by
              // picking that pal. A cluster keeps the crown, because several
              // bosses cannot wear one face.
              photo={layer.photo ?? (c.count === 1 ? alphaPortrait(layer.key, region, c.index) : undefined)}
              night={layer.night} />
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
      // A mark's card is a card about a place on THIS map. Leaving it open
      // across a region switch left a Palpagos mark on screen while the World
      // Tree was drawn underneath it and not one of its pins was visible —
      // and its Remove button would have deleted a mark on the island you had
      // just left. Same fault as the Mau banner: the map asserting something
      // about a place that is not here.
      setOpenPin(null);
      setOpenStops(null);
      // the focus card too: it names a POI or a coordinate readout of the
      // island you just LEFT — same fault family, found surviving the
      // switch in QA while walking the routes work
      setFocus(null);
      setDraft(null);
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

  /**
   * The player's OWN pins.
   *
   * Never clustered and never culled by the layer budget: there are a handful
   * of them, they are the only markers on this map the player put there
   * themselves, and one of them vanishing into a cluster badge would make the
   * feature untrustworthy. They ride above everything for the same reason.
   */
  const myPins = useMemo<MapMarker[]>(
    () => pinsIn(region).map((p) => ({
      key: `mine:${p.id}`,
      u: p.u,
      v: p.v,
      render: () => (
        <Pressable
          onPress={() => { void Haptics.selectionAsync(); setOpenPin(p); setOpenStops(null); }}
          accessibilityRole="button"
          accessibilityLabel={`Your pin, ${p.label}`}
          style={{
            width: 26, height: 26, marginLeft: -13, marginTop: -13,
            borderRadius: 13, alignItems: 'center', justifyContent: 'center',
            backgroundColor: 'rgba(10,20,24,0.86)',
            borderWidth: 2, borderColor: MY_PIN,
          }}
        >
          <Icon name="map-marker-star" size={14} color={MY_PIN} />
        </Pressable>
      ),
    })),
    // `ticks` is what tells us a pin was added or removed
    [region, ticks],
  );

  /** this map's route, in the order the player added the stops */
  const myRoute = useMemo(() => routeIn(region), [region, ticks]);

  /** Has this player EVER marked or routed anything, on either island?
   *  The first-run hint teaches the controls; proof of learning is global,
   *  and asking the region-scoped question made the hint reappear on the
   *  World Tree for a player with four stops on Palpagos. */
  const neverMarked = useMemo(
    () => pinCount('palpagos') + pinCount('tree')
      + stopCount('palpagos') + stopCount('tree') === 0,
    [ticks],
  );

  /** Open whatever is at a route spot: the mark's card when a pin is still
   *  there (it carries the route verbs), or the bare-stop card when the mark
   *  was deleted — a stop with no card would be a stop you cannot remove. */
  const openSpot = useCallback((u: number, v: number) => {
    const pin = pinsIn(region).find((p) => p.u === u && p.v === v);
    setDraft(null);
    if (pin) { setOpenPin(pin); setOpenStops(null); return; }
    setOpenPin(null);
    setOpenStops({ u, v });
  }, [region]);

  /**
   * Stop badges: one per SPOT, so stops that share a place JOIN their
   * numbers ("1 · 4") instead of the later badge burying the earlier one.
   * Pressable since slice 2 — the badge owns the tap and routes it to the
   * card that holds the stop verbs (the pin card when the mark still
   * exists, the bare-stop card when it does not). Centred on the true spot:
   * width is estimated from the label (digits at this size are ~6px) — a
   * couple of px off-centre on a wide chip is invisible; REASONED, checked
   * by eye in QA, not measured per-frame.
   */
  const routeBadges = useMemo<MapMarker[]>(() => {
    const bySpot = new Map<string, { u: number; v: number; nums: number[] }>();
    myRoute.forEach((s, i) => {
      const key = `${s.u},${s.v}`;
      const hit = bySpot.get(key);
      if (hit) hit.nums.push(i + 1);
      else bySpot.set(key, { u: s.u, v: s.v, nums: [i + 1] });
    });
    return [...bySpot.values()].map((spot) => {
      const label = spot.nums.join(' · ');
      const w = Math.max(20, label.length * 6 + 12);
      return {
        key: `route:${spot.nums.join('-')}`,
        u: spot.u,
        v: spot.v,
        render: () => (
          <Pressable
            onPress={() => { void Haptics.selectionAsync(); openSpot(spot.u, spot.v); }}
            accessibilityRole="button"
            accessibilityLabel={`Route stop ${spot.nums.join(' and ')}`}
            style={{
              minWidth: 20, height: 20, width: w,
              marginLeft: -w / 2, marginTop: -10,
              borderRadius: 10, alignItems: 'center', justifyContent: 'center',
              backgroundColor: 'rgba(10,20,24,0.92)',
              borderWidth: 2, borderColor: MY_ROUTE,
            }}
          >
            <Text style={{ color: MY_ROUTE, fontSize: 9.5, fontWeight: '800' }}>
              {label}
            </Text>
          </Pressable>
        ),
      };
    });
  }, [myRoute, openSpot]);

  // boss pins ride above the spawn cloud — the guaranteed spot should not be
  // buried under a hundred maybes
  const allPins = useMemo(
    () => [...markers, ...bossPins, ...myPins, ...routeBadges],
    [bossPins, markers, myPins, routeBadges],
  );

  // Labels are SCREEN markers now — outside the map's transform, so their text
  // is drawn at true resolution instead of being rasterised small and blown up
  // (which is what made them jagged on device).

  // Picks that genuinely do not live on this map — underground included.
  // This used to ask the SURFACE-only question, which was fine until the 25
  // dungeon-only pals became pickable: the map then drew 174 Mau pins on
  // Palpagos while a banner over them read "Mau doesn't live on this map.
  // Try The World Tree." Both statements on screen at once, one of them false.
  const elsewhere = useMemo(
    () => [...filters.pals].filter((n) => spawnLevels(n, region, true) === null),
    [filters.pals, region],
  );
  /**
   * Picked pals that DO live here but only underground, while dungeon spawns
   * are switched off. Telling this player to try the other map would send them
   * to the wrong island; the fix is one tick away on this one.
   */
  const undergroundOnly = useMemo(
    () => (filters.dungeons ? [] : [...filters.pals].filter(
      (n) => spawnLevels(n, region) === null && spawnLevels(n, region, true) !== null,
    )),
    [filters.pals, region, filters.dungeons],
  );
  const otherRegionName = region === 'palpagos' ? 'The World Tree' : 'Palpagos Islands';
  /**
   * Has this player got a box yet?
   *
   * Decides WHICH thing the first-run hint teaches. "Only pals I'm missing" is
   * the one thing this map does that no competitor does — it turns the world
   * into a to-do list — but it is invisible until you open Find and then
   * Filter, and it does NOTHING for someone whose box is empty (everything is
   * missing, so nothing is filtered). Teaching it to an empty box would be
   * teaching a no-op; teaching only the buttons to someone with 200 pals
   * wastes the one line we allow ourselves on things they can already see.
   */
  const ownsSomething = useMemo(() => Object.keys(pals).some(ownedAny), []);

  /** why the map is blank, worked out once per render */
  const empty = emptyReason(filters, region);

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
      // A boss card without its level made the CEO tap through to the Paldex
      // just to know if he would be flattened (20:13, with a screenshot).
      // Alpha levels are datamined per spot; match this pin back to its
      // AlphaSpot by region and position.
      if (own.startsWith('Alpha ')) {
        const mi = region === 'palpagos' ? 0 : 1;
        const pu = layer.set.xy[best.index * 2];
        const pv = layer.set.xy[best.index * 2 + 1];
        const spot = MAP_ALPHAS[own.slice(6)]?.find((a) => a.m === mi
          && Math.abs(a.u - pu) < 0.002 && Math.abs(a.v - pv) < 0.002);
        if (spot) lines.push(`Level ${spot.lv}`);
      }
      // formatted: this line sits directly above a pill that says "1,572
      // spots on the map", and the same number in two formats one line apart
      // reads as a bug even when it is not
      lines.push(`${layer.set.n.toLocaleString()} on this map`);
      // "exactly where small hidden stuff is" (CEO): how far, which way,
      // from which statue — both ends datamined, the distance is arithmetic.
      // Not on the fast-travel layer itself: a statue IS the landmark.
      if (layer.key !== 'poi:fast_travel') {
        const where = whereFromLine(
          layer.set.xy[best.index * 2], layer.set.xy[best.index * 2 + 1], region,
        );
        if (where) lines.push(where);
      }
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
        route={{ stops: myRoute, colour: MY_ROUTE }}
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
            onPress={() => {
              // the same tick the side panel gives when it changes domain —
              // this throws the current view away and re-frames the world
              if (r.id !== region) void Haptics.selectionAsync();
              patch({ region: r.id as RegionId });
            }}
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
          onPress={() => {
            // Deliberately a BUTTON, not a long-press. Composing another
            // gesture into the existing pan/pinch/tap is what produced the
            // release-snap bug, and native gesture behaviour cannot be proved
            // from a browser. You line the map up and press; the pin lands in
            // the middle of what you are looking at.
            const u = (vp.u0 + vp.u1) / 2;
            const v = (vp.v0 + vp.v1) / 2;
            const at = uvToReadout({ u, v }, regionOf(region));
            const id = addPin(region, u, v, `${at.x}, ${at.y}`);
            if (id) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
          accessibilityRole="button"
          accessibilityLabel="Mark this spot"
          style={{
            padding: 9, borderRadius: 11, borderWidth: 1, borderColor: T.line,
            backgroundColor: 'rgba(12,22,24,0.82)', marginRight: 8,
          }}
        >
          <Icon name="map-marker-plus-outline" size={17} color={T.muted} />
        </Pressable>
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
              onPress={() => {
                // The map already ticks on the level cap, on a layer toggle
                // and on picking a pal — but not here, and not on switching
                // region. Same class of action, silent in two places out of
                // five. This one is the only map action that COMMITS anything
                // (it writes a tick to disk that survives a restart), so it
                // earns a real impact rather than a selection tick.
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                toggleFound(focus.mark!);
              }}
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

      {/* One of the player's own pins, opened. Its only job is to say where it
          is and let them take it off again — a mark you cannot remove is a
          mark you stop trusting. */}
      {openPin && (
        <View style={{
          position: 'absolute', top: 56, left: 12, right: 12,
          backgroundColor: 'rgba(12,22,24,0.94)', borderRadius: 12,
          borderWidth: 1, borderColor: MY_PIN, paddingHorizontal: 12,
          paddingVertical: 10, gap: 8,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="map-marker-star" size={16} color={MY_PIN} />
            {draft === null ? (
              <>
                <Text style={{ color: T.ink, fontWeight: '800', fontSize: 13.5, flex: 1 }}>
                  Your mark
                </Text>
                {/* the name can be long, so it gets the room and truncates
                    rather than pushing the card wider than the screen */}
                <Text
                  numberOfLines={1}
                  style={{
                    color: T.muted, fontWeight: '700', fontSize: 12,
                    flexShrink: 1, maxWidth: '55%', textAlign: 'right',
                  }}
                >
                  {openPin.label}
                </Text>
              </>
            ) : (
              <TextInput
                value={draft}
                onChangeText={setDraft}
                maxLength={PIN_LABEL_MAX}
                autoFocus
                placeholder="Name this spot"
                placeholderTextColor={T.faint}
                style={{
                  flex: 1, color: T.ink, fontSize: 13.5, fontWeight: '700',
                  paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9,
                  borderWidth: 1, borderColor: MY_PIN, backgroundColor: T.surface,
                }}
              />
            )}
          </View>
          {/* The route verb gets its own full-width row: a fourth button in
              the actions row does not fit 375pt and wraps onto a ragged
              second line. Hidden while renaming for the same reason Remove
              is — an edit mode offers exactly the two verbs that end an
              edit. "Add" only haptics when a stop was actually added: the
              store refuses a repeat of the LAST stop (a zero-length leg is a
              double-tap, not a route). */}
          {draft === null && (() => {
            const last = myRoute[myRoute.length - 1];
            const isLast = last != null
              && last.u === openPin.u && last.v === openPin.v;
            return (
              <Pressable
                onPress={() => {
                  if (addStop(region, openPin.u, openPin.v, openPin.label)) {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }
                }}
                accessibilityRole="button"
                accessibilityState={{ disabled: isLast }}
                style={{
                  flexDirection: 'row', alignItems: 'center',
                  justifyContent: 'center', gap: 6,
                  paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10,
                  borderWidth: 1, borderColor: isLast ? T.line : MY_ROUTE,
                  backgroundColor: T.surface,
                }}
              >
                <Icon name="map-marker-path" size={14}
                  color={isLast ? T.muted : MY_ROUTE} />
                <Text style={{
                  color: isLast ? T.muted : T.ink, fontWeight: '700', fontSize: 12,
                }}>
                  {isLast
                    ? `On my route — stop ${myRoute.length}`
                    : myRoute.length === 0
                      ? 'Start my route here'
                      : `Add to my route — stop ${myRoute.length + 1}`}
                </Text>
              </Pressable>
            );
          })()}
          {/* Every stop AT THIS SPOT, each removable on its own. The route
              verb above adds; these rows subtract. Hidden while renaming,
              like every verb that is not Save or Cancel. */}
          {draft === null && myRoute.map((s, i) => ({ s, n: i + 1 }))
            .filter(({ s }) => s.u === openPin.u && s.v === openPin.v)
            .map(({ n }) => (
              <View key={n}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: T.muted, fontSize: 12, fontWeight: '700', flex: 1 }}>
                  Stop {n} of {myRoute.length}
                </Text>
                <Pressable
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    removeStop(region, n - 1);
                  }}
                  accessibilityRole="button"
                  style={{
                    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10,
                    borderWidth: 1, borderColor: T.line, backgroundColor: T.surface,
                  }}
                >
                  <Text style={{ color: T.muted, fontWeight: '700', fontSize: 12 }}>
                    Remove stop {n}
                  </Text>
                </Pressable>
              </View>
            ))}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {draft !== null ? (
              <>
                <Pressable
                  onPress={() => {
                    // An empty name must not leave a nameless mark, so it
                    // falls back to where the mark actually is.
                    const at = uvToReadout(
                      { u: openPin.u, v: openPin.v }, regionOf(region),
                    );
                    const next = draft.trim() || `${at.x}, ${at.y}`;
                    void Haptics.selectionAsync();
                    renamePin(openPin.id, next);
                    setOpenPin({ ...openPin, label: next.slice(0, PIN_LABEL_MAX) });
                    setDraft(null);
                  }}
                  accessibilityRole="button"
                  style={{
                    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10,
                    borderWidth: 1, borderColor: MY_PIN, backgroundColor: T.surface,
                  }}
                >
                  <Text style={{ color: T.ink, fontWeight: '700', fontSize: 12 }}>Save</Text>
                </Pressable>
                <Pressable
                  // Cancel must leave the mark EXACTLY as it was — the draft is
                  // thrown away and nothing is written.
                  onPress={() => setDraft(null)}
                  accessibilityRole="button"
                  style={{
                    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10,
                    borderWidth: 1, borderColor: T.line, backgroundColor: T.surface,
                  }}
                >
                  <Text style={{ color: T.muted, fontWeight: '700', fontSize: 12 }}>Cancel</Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                onPress={() => { void Haptics.selectionAsync(); setDraft(openPin.label); }}
                accessibilityRole="button"
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10,
                  borderWidth: 1, borderColor: T.line, backgroundColor: T.surface,
                }}
              >
                <Icon name="pencil-outline" size={14} color={T.muted} />
                <Text style={{ color: T.muted, fontWeight: '700', fontSize: 12 }}>Rename</Text>
              </Pressable>
            )}
            {/* While a name is being typed, ONLY Save and Cancel exist.
                Four buttons showed here mid-edit, and one of them was Remove —
                deleting the whole mark one slip away from Save. An edit mode
                offers exactly the two verbs that end an edit. */}
            {draft === null && (
            <>
            <Pressable
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                removePin(openPin.id);
                setOpenPin(null);
              }}
              accessibilityRole="button"
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10,
                borderWidth: 1, borderColor: T.line, backgroundColor: T.surface,
              }}
            >
              <Icon name="trash-can-outline" size={14} color={T.muted} />
              <Text style={{ color: T.muted, fontWeight: '700', fontSize: 12 }}>
                Remove
              </Text>
            </Pressable>
            <Pressable
              onPress={() => { setOpenPin(null); setDraft(null); }}
              accessibilityRole="button"
              style={{
                paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10,
                borderWidth: 1, borderColor: T.line, backgroundColor: T.surface,
              }}
            >
              <Text style={{ color: T.muted, fontWeight: '700', fontSize: 12 }}>
                Close
              </Text>
            </Pressable>
            </>
            )}
          </View>
        </View>
      )}

      {/* A route stop whose mark was deleted still needs a card — a stop you
          cannot reach is a stop you cannot remove. Same chrome as the mark
          card, chartreuse edge, only the stop verbs. */}
      {openStops && !openPin && (() => {
        const here = myRoute.map((s, i) => ({ s, n: i + 1 }))
          .filter(({ s }) => s.u === openStops.u && s.v === openStops.v);
        if (here.length === 0) return null;
        return (
          <View style={{
            position: 'absolute', top: 56, left: 12, right: 12,
            backgroundColor: 'rgba(12,22,24,0.94)', borderRadius: 12,
            borderWidth: 1, borderColor: MY_ROUTE, paddingHorizontal: 12,
            paddingVertical: 10, gap: 8,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name="map-marker-path" size={16} color={MY_ROUTE} />
              <Text style={{ color: T.ink, fontWeight: '800', fontSize: 13.5, flex: 1 }}>
                Route stop
              </Text>
              <Text numberOfLines={1} style={{
                color: T.muted, fontWeight: '700', fontSize: 12,
                flexShrink: 1, maxWidth: '55%', textAlign: 'right',
              }}>
                {here[0].s.label}
              </Text>
            </View>
            {here.map(({ n }) => (
              <View key={n}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: T.muted, fontSize: 12, fontWeight: '700', flex: 1 }}>
                  Stop {n} of {myRoute.length}
                </Text>
                <Pressable
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    removeStop(region, n - 1);
                  }}
                  accessibilityRole="button"
                  style={{
                    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10,
                    borderWidth: 1, borderColor: T.line, backgroundColor: T.surface,
                  }}
                >
                  <Text style={{ color: T.muted, fontWeight: '700', fontSize: 12 }}>
                    Remove stop {n}
                  </Text>
                </Pressable>
              </View>
            ))}
            <Pressable
              onPress={() => setOpenStops(null)}
              accessibilityRole="button"
              style={{
                alignSelf: 'flex-start',
                paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10,
                borderWidth: 1, borderColor: T.line, backgroundColor: T.surface,
              }}
            >
              <Text style={{ color: T.muted, fontWeight: '700', fontSize: 12 }}>
                Close
              </Text>
            </Pressable>
          </View>
        );
      })()}

      {/* A pal picked on one map vanishes silently when you switch to the
          other. Say so, and say where it does live, instead of showing an
          empty world and letting the player wonder what broke. */}
      {(elsewhere.length > 0 || undergroundOnly.length > 0) && (
        <View style={{
          position: 'absolute', top: 56, left: 12, right: 12,
          backgroundColor: 'rgba(12,22,24,0.94)', borderRadius: 12,
          borderWidth: 1, borderColor: T.line, paddingHorizontal: 12, paddingVertical: 9,
          flexDirection: 'row', alignItems: 'center', gap: 8,
        }}>
          <Icon name="information-outline" size={15} color={T.muted} />
          <Text style={[s.body, { fontSize: 12.5, flex: 1 }]}>
            {elsewhere.length > 0 ? (
              <>
                {elsewhere.length === 1
                  ? `${elsewhere[0]} doesn't live on this map.`
                  : `${elsewhere.length} of your picks don't live on this map.`}
                {' '}Try {otherRegionName}.
              </>
            ) : (
              // lives here, just not above ground — do not send them away
              <>
                {undergroundOnly.length === 1
                  ? `${undergroundOnly[0]} is only found inside dungeons here.`
                  : `${undergroundOnly.length} of your picks are only found inside dungeons here.`}
                {' '}Tick “Also show dungeon spawns” under Find.
              </>
            )}
          </Text>
        </View>
      )}

      {/* An empty world with three buttons tells a new player nothing, so
          this points at what matters. It used to be a five-line explainer
          covering a third of the map. It is one line now, and tapping it
          makes it go away for good.
          WHICH line depends on whether they have a box yet: with one, the
          most valuable thing we can teach is the feature nobody else has,
          which is otherwise buried two taps deep inside Find. */}
      {/* Nothing is drawn AND nothing is switched on — a genuinely new map. */}
      {/* A player who has dropped a mark has already found the control
          cluster — the hint's job is done. This also ends the collision where
          the "My mark" pill drew on top of the hint's last line. */}
      {active.length === 0 && !sheet && !hintOff && neverMarked
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
            {ownsSomething ? (
              <>
                <Text style={{ color: T.accentInk, fontWeight: '800' }}>Find</Text>
                {' '}&rarr;{' '}
                <Text style={{ color: T.accentInk, fontWeight: '800' }}>Filter</Text>
                {' '}shows only the pals you are still missing.
              </>
            ) : (
              <>
                <Text style={{ color: T.accentInk, fontWeight: '800' }}>Find</Text>
                {' '}a pal, or{' '}
                <Text style={{ color: T.accentInk, fontWeight: '800' }}>Layers</Text>
                {' '}for chests, ore and dungeons.
              </>
            )}
          </Text>
          <Icon name="close" size={14} color={T.faint} />
        </Pressable>
      )}

      {/* Nothing is drawn but you DID pick something. The old code showed the
          first-run hint here — "Find a pal to see where it spawns" — to a
          player who had just found one, while the real reason sat one line
          away in the data. Say the actual reason. */}
      {active.length === 0 && !sheet
        && (filters.pals.size > 0 || filters.poi.size > 0)
        // The banner above already names the pal AND the map to try. This card
        // used to appear underneath it saying "Nothing here on this map - what
        // you switched on does not appear in this region", which is the same
        // answer in vaguer words, stacked on the same screen. It still shows
        // for every other reason, including when a POI layer is missing here
        // and the banner says nothing about it.
        && !(empty.kind === 'region'
          && (elsewhere.length > 0 || undergroundOnly.length > 0)) && (
        <View style={{
          position: 'absolute', left: 12, right: 12, bottom: insets.bottom + 74,
          backgroundColor: 'rgba(12,22,24,0.94)', borderRadius: 13,
          borderWidth: 1, borderColor: T.line, padding: 12, gap: 7,
        }}>
          <Text style={{ color: T.ink, fontWeight: '800', fontSize: 13.5 }}>
            {empty.title}
          </Text>
          <Text style={[s.body, { fontSize: 12.5 }]}>
            {empty.body}
          </Text>
        </View>
      )}

      {/* bottom controls */}
      <View style={{
        position: 'absolute', left: 12, right: 12, bottom: insets.bottom + 14, gap: 8,
      }}>
        {/* `shownCount` counts DATA points, so with only your own marks on the
            map the key used to stay hidden and the pin colour went unexplained.
            Your marks are a reason to show the key too. */}
        {(shownCount > 0 || myPins.length > 0 || myRoute.length > 0) && (
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
                {/* Only square pins need explaining, and only when some are
                    actually on screen. This line used to show every time the
                    key was opened, so the ordinary case — chests and ore on,
                    no pal picked — taught him to tell apart a shape that was
                    nowhere on his map. A key describes what is there. */}
                {active.some((l) => l.square) && (
                  <Text style={{ color: T.faint, fontSize: 10.5 }}>
                    {active.some((l) => !l.square)
                      ? 'Round pins are out in the world · square pins are inside dungeons'
                      : 'Square pins are inside dungeons — none of these are on the surface'}
                  </Text>
                )}
                {/* The player's own marks sit in the key like everything
                    else. Without this, dropping five pins changed the map and
                    the key said nothing about them — and the key is where you
                    look to find out what a colour means. */}
                {myPins.length > 0 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                    <View style={{
                      width: 19, height: 19, borderRadius: 9.5,
                      borderWidth: 2, borderColor: MY_PIN,
                      backgroundColor: 'rgba(10,20,24,0.86)',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Icon name="map-marker-star" size={10} color={MY_PIN} />
                    </View>
                    <Text style={{
                      color: T.ink, fontSize: 12.5, fontWeight: '700', flex: 1,
                    }}>
                      My marks
                    </Text>
                    <Text style={{ color: T.faint, fontSize: 11.5, fontWeight: '700' }}>
                      {myPins.length}
                    </Text>
                  </View>
                )}
                {/* The route sits in the key too: a chartreuse dotted
                    line with numbered stops is otherwise an unexplained
                    colour, and the key is where you look to find out what a
                    colour means. */}
                {myRoute.length > 0 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                    <View style={{
                      width: 19, height: 19, borderRadius: 9.5,
                      borderWidth: 2, borderColor: MY_ROUTE,
                      backgroundColor: 'rgba(10,20,24,0.86)',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{
                        color: MY_ROUTE, fontSize: 9, fontWeight: '800',
                      }}>1</Text>
                    </View>
                    <Text style={{
                      color: T.ink, fontSize: 12.5, fontWeight: '700', flex: 1,
                    }}>
                      My route
                    </Text>
                    <Text style={{ color: T.faint, fontSize: 11.5, fontWeight: '700' }}>
                      {myRoute.length === 1 ? '1 stop' : `${myRoute.length} stops`}
                    </Text>
                  </View>
                )}
                {/* "idk if it's accurate even?" — CEO, 2026-08-17. The answer
                    existed, in four independent proofs, and lived in the
                    Reference tab where he was never going to look for it. A
                    map that claims to have no room for error should say so on
                    the map. One line, only while the key is open, so it costs
                    nothing when he is using it. */}
                <Text style={{ color: T.faint, fontSize: 10.5 }}>
                  Every spot is read from the game&apos;s own files — none of it
                  is estimated or crowd-guessed. Game build 24575149, 12 August 2026.
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
                {/* Your own marks are on the map too, so the pill must not
                    say "0 spots on the map" while three of them are sitting
                    there — the map contradicting itself is the exact bug this
                    fane keeps getting caught by. They are counted SEPARATELY
                    from the datamined spots, never added to them: "1,575"
                    would quietly blend what the game files know with what you
                    put there yourself. */}
                {shownCount > 0
                  ? `${shownCount.toLocaleString()} ${shownCount === 1 ? 'spot' : 'spots'} on the map`
                  : ''}
                {shownCount > 0 && myPins.length > 0 ? ' · ' : ''}
                {/* "1 of my mark" was broken English, and even the plural
                    "N of my marks" implied a subset. It is all of them. */}
                {myPins.length > 0
                  ? (myPins.length === 1 ? 'My mark' : `My ${myPins.length} marks`)
                  : ''}
                {(shownCount > 0 || myPins.length > 0) && myRoute.length > 0 ? ' · ' : ''}
                {myRoute.length > 0
                  ? (myRoute.length === 1
                    ? 'My route: 1 stop' : `My route: ${myRoute.length} stops`)
                  : ''}
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
          onClearMine={() => { clearPins(region); setOpenPin(null); }}
          myMarks={myPins.length}
          onClearRoute={() => { clearRoute(region); setOpenStops(null); }}
          onShareRoute={() => {
            const name = MAP_REGIONS.find((r) => r.id === region)?.name ?? region;
            void Share.share({ message: encodeRoute(region, name, myRoute) });
          }}
          onImportRoute={async () => {
            const text = await Clipboard.getStringAsync();
            const parsed = decodeRoute(text);
            if (!parsed.ok) {
              Alert.alert('Nothing to import', parsed.why);
              return;
            }
            if (parsed.region !== region) {
              const name = MAP_REGIONS.find((r) => r.id === parsed.region)?.name
                ?? parsed.region;
              Alert.alert(
                'Wrong map',
                `This is a ${name} route — switch to that map to import it.`,
              );
              return;
            }
            const bring = () => {
              if (importRoute(region, parsed.stops)) {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setOpenStops(null);
              }
            };
            if (myRoute.length > 0) {
              // replacing is the ONLY combining rule — merging two routes
              // would invent an order nobody chose
              Alert.alert(
                'Replace your route?',
                `You already have ${myRoute.length === 1 ? '1 stop' : `${myRoute.length} stops`} on this map. Importing replaces them.`,
                [
                  { text: 'Keep mine', style: 'cancel' },
                  { text: 'Replace', style: 'destructive', onPress: bring },
                ],
              );
              return;
            }
            bring();
          }}
          routeStops={myRoute.length}
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

/** The player's own pins. Deliberately a colour NO data layer uses, so a mark
 *  you made can never be mistaken for something the game files put there. */
/** Magenta, MEASURED against the data palette: nearest layer colour is 85
 *  RGB-units away. The old pink #FF8FB1 sat at distance 1.0 from Skill
 *  fruit's #FF8FB0 — a mark you made was the same colour as 43 pins the
 *  game files put there, which is exactly what this colour must never be. */
const MY_PIN = '#F050FF';
/** chartreuse: verified absent from all 23 data-layer colours and far from
 *  MY_PIN — a path you drew must never read as something the game put there */
const MY_ROUTE = '#C8FF4D';

const PIN = 23;

/**
 * The portrait for a single alpha marker, or undefined.
 *
 * The alpha layer's names read "Alpha Anubis"; the Paldex keys are the plain
 * display names. Anything that does not resolve falls back to the crown rather
 * than guessing — a wrong face would be worse than a generic one.
 */
function alphaPortrait(layerKey: string, region: RegionId, index: number): number | undefined {
  if (layerKey !== 'poi:alpha_pals') return undefined;
  const name = poiName('alpha_pals', region, index).replace(/^Alpha /, '');
  return name ? PAL_ICONS[name] : undefined;
}

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
function emptyReason(f: MapFilters, region: RegionId): { kind: 'time' | 'level' | 'layers' | 'region'; title: string; body: string } {
  const mode = timeMode(f.time);
  if (mode !== 'any' && f.pals.size) {
    const wrongTime = [...f.pals].filter((n) => (
      mode === 'day' ? isNightOnly(n, region) : !isNightOnly(n, region)
    ));
    if (wrongTime.length === f.pals.size) {
      const who = wrongTime.length === 1 ? wrongTime[0] : `${wrongTime.length} pals you picked`;
      return {
        kind: 'time',
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
      kind: 'level',
      title: `Nothing at level ${f.level.hi} or under`,
      body: `What you switched on only spawns above level ${f.level.hi} on this `
        + 'map. Tap Any level to see all of it.',
    };
  }
  // `layers` names POI layers that are wholly absent here - information the
  // "picked elsewhere" banner does not carry, so that card must still show.
  // `region` is the bare fallback, which says only what the banner already
  // said and in vaguer words.
  const named = namedLayers(f, region);
  return {
    kind: named ? 'layers' : 'region',
    title: 'Nothing here on this map',
    body: `${named ?? 'What you switched on does not appear'} in `
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

function LayerSheet({
  filters, onToggle, onClear, onClearFound, onClearMine, myMarks,
  onClearRoute, onShareRoute, onImportRoute, routeStops, onClose,
}: {
  filters: MapFilters; onToggle: (id: string) => void; onClear: () => void;
  onClearFound: () => void; onClearMine: () => void; myMarks: number;
  onClearRoute: () => void; onShareRoute: () => void;
  onImportRoute: () => void; routeStops: number;
  onClose: () => void;
}) {
  const groups = useMemo(() => {
    const by = new Map<LayerGroup, ReturnType<typeof poiLayers>>();
    for (const l of poiLayers()) {
      const list = by.get(l.group) ?? [];
      list.push(l);
      by.set(l.group, list);
    }
    // Layers this map actually HAS come first; "none here" chips sink to the
    // end of their group. On the World Tree 15 of 23 layers are empty, and
    // the wide dimmed chips wrapped one-per-line and scattered the useful
    // ones apart — the sheet read as a list of what you cannot have. Stable
    // within each half, so the familiar order survives.
    const here = (id: string) => ((poiPoints(id, filters.region)?.n ?? 0) > 0 ? 0 : 1);
    return [...by.entries()].map(([g, list]) => [
      g,
      [...list].sort((a, b) => here(a.id) - here(b.id)),
    ] as [LayerGroup, ReturnType<typeof poiLayers>]);
  }, [filters.region]);

  return (
    <SheetShell title="What to show" onClear={onClear} onClose={onClose}>
      <ScrollView contentContainerStyle={{ padding: 14, gap: 16 }}>
        {myMarks > 0 && (
          <Pressable
            onPress={onClearMine}
            accessibilityRole="button"
            style={{
              alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7,
              paddingHorizontal: 11, paddingVertical: 9, borderRadius: 11,
              borderWidth: 1, borderColor: T.line, backgroundColor: T.surface,
            }}
          >
            <Icon name="map-marker-off-outline" size={15} color={T.muted} />
            <Text style={{ color: T.muted, fontWeight: '700', fontSize: 12.5 }}>
              {myMarks === 1 ? 'Clear my mark' : `Clear my ${myMarks} marks`}
            </Text>
          </Pressable>
        )}
        {routeStops > 0 && (
          <Pressable
            onPress={onShareRoute}
            accessibilityRole="button"
            style={{
              alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7,
              paddingHorizontal: 11, paddingVertical: 9, borderRadius: 11,
              borderWidth: 1, borderColor: T.line, backgroundColor: T.surface,
            }}
          >
            <Icon name="share-variant-outline" size={15} color={T.muted} />
            <Text style={{ color: T.muted, fontWeight: '700', fontSize: 12.5 }}>
              {routeStops === 1
                ? 'Share my route — 1 stop'
                : `Share my route — ${routeStops} stops`}
            </Text>
          </Pressable>
        )}
        <Pressable
          onPress={onImportRoute}
          accessibilityRole="button"
          style={{
            alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7,
            paddingHorizontal: 11, paddingVertical: 9, borderRadius: 11,
            borderWidth: 1, borderColor: T.line, backgroundColor: T.surface,
          }}
        >
          <Icon name="clipboard-arrow-down-outline" size={15} color={T.muted} />
          <Text style={{ color: T.muted, fontWeight: '700', fontSize: 12.5 }}>
            Import a route from the clipboard
          </Text>
        </Pressable>
        {routeStops > 0 && (
          <Pressable
            onPress={onClearRoute}
            accessibilityRole="button"
            style={{
              alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7,
              paddingHorizontal: 11, paddingVertical: 9, borderRadius: 11,
              borderWidth: 1, borderColor: T.line, backgroundColor: T.surface,
            }}
          >
            <Icon name="map-marker-path" size={15} color={T.muted} />
            <Text style={{ color: T.muted, fontWeight: '700', fontSize: 12.5 }}>
              {routeStops === 1
                ? 'Clear my route — 1 stop'
                : `Clear my route — ${routeStops} stops`}
            </Text>
          </Pressable>
        )}
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
                // The count for the map you are LOOKING AT, not both maps
                // added together. The sheet said "Fast travel 170" while the
                // map drew 155 and the World Tree drew 15, and the layer
                // search beside it already showed the honest per-region
                // number — three places, two answers.
                const here = poiPoints(l.id, filters.region)?.n ?? 0;
                return (
                  <Pressable
                    key={l.id}
                    onPress={() => onToggle(l.id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={here
                      ? `${l.label}, ${here.toLocaleString()} on this map`
                      : `${l.label}, none on this map`}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 7,
                      paddingHorizontal: 11, paddingVertical: 9, borderRadius: 11,
                      borderWidth: 1, borderColor: on ? l.colour : T.line,
                      backgroundColor: on ? T.surface2 : T.surface,
                      // 15 of the 23 layers have nothing on the World Tree.
                      // Dimming says so BEFORE you tap, which beats explaining
                      // it afterwards — but it stays tappable, because you may
                      // well be about to switch back to Palpagos.
                      opacity: here ? 1 : 0.45,
                    }}
                  >
                    {/* the GAME's own symbol, the same one the pin will draw —
                        the sheet used to show a generic glyph, so you picked a
                        map-pin and got a winged statue */}
                    {MAP_ICONS[l.id] != null
                      ? <Image source={MAP_ICONS[l.id]}
                          style={{ width: 16, height: 16 }} resizeMode="contain" />
                      : <Icon name={l.icon} size={16} color={on ? l.colour : T.muted} />}
                    <Text style={{ color: on ? T.ink : T.muted, fontWeight: '700', fontSize: 12.5 }}>
                      {l.label}
                    </Text>
                    <Text style={{ color: T.faint, fontWeight: '700', fontSize: 11 }}>
                      {here ? here.toLocaleString() : 'none here'}
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
    // With the dungeon box ticked, the list must include the pals that ONLY
    // live underground — otherwise the checkbox promises spawns it will not
    // let you ask for. 25 species on Palpagos are dungeon-only, Mau with 174
    // spawns among them, and every one of them was unsearchable.
    () => spawnablePals().filter((n) => spawnLevels(n, region, filters.dungeons) !== null),
    [region, filters.dungeons],
  );

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const named = needle ? base.filter((n) => n.toLowerCase().includes(needle)) : base;
    return sortedPals(applyFilters(named, pf), sort);
  }, [base, pf, q, sort]);

  /**
   * Names a typo was probably reaching for.
   *
   * Pal names are invented words typed on a phone keyboard — Foxparks,
   * Jormuntide, Katress Ignis — so transposing two letters is ordinary, not
   * exotic. "foxpraks" matched nothing and the app said so, correctly and
   * uselessly. Computed ONLY when the exact search came back empty, so the
   * common path is untouched and cannot regress.
   */
  const didYouMean = useMemo(
    () => (list.length === 0 && q.trim() ? closeMatches(q, base, 4) : []),
    [base, list.length, q],
  );

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
        {/* One ROW, scrolling sideways, never wrapping. Five chips do not fit
            343pt, and flexWrap broke the line as 4+1 — "Up to 60" stranded
            alone under a ragged gap, which reads as a layout accident rather
            than a control. A sideways row is the standard phone pattern, and
            the fifth chip peeking off the edge is its own scroll hint. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ flexDirection: 'row', gap: 6 }}
        >
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
        </ScrollView>
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
      {/* A FlatList, not a ScrollView. Every pal that spawns on the map is a
          row here - 224 of them on Palpagos - and a ScrollView mounts all of
          them the instant the sheet opens. That was survivable while a row was
          three text nodes; now each one carries the pal's face, so opening the
          sheet meant 224 image decodes at once on the CEO's phone. This mounts
          about a screenful and fills in as he scrolls.
          The search box is NOT in here (it sits above, outside the list), so
          nothing can steal its focus when the list re-renders. */}
      <FlatList
        data={list}
        keyExtractor={(n) => n}
        contentContainerStyle={{ padding: 14, gap: 7 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={14}
        windowSize={9}
        ListHeaderComponent={(
          <View style={{ gap: 7 }}>
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
            {didYouMean.length > 0 && (
              <View style={{
                flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center',
                gap: 7, paddingTop: 8,
              }}>
                <Text style={{ color: T.faint, fontSize: 12.5, fontWeight: '700' }}>
                  Did you mean
                </Text>
                {didYouMean.map((n) => (
                  <Pressable
                    key={n}
                    onPress={() => { void Haptics.selectionAsync(); setQ(n); }}
                    accessibilityRole="button"
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 6,
                      paddingHorizontal: 9, paddingVertical: 6, borderRadius: 11,
                      borderWidth: 1, borderColor: T.accent, backgroundColor: T.accentSoft,
                    }}
                  >
                    <PalIcon name={n} size={18} />
                    <Text style={{ color: T.accentInk, fontWeight: '800', fontSize: 12.5 }}>
                      {n}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}
        renderItem={({ item: n }) => {
          const on = filters.pals.has(n);
          const lv = spawnLevels(n, region, filters.dungeons);
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
              {/* The pal's own face. Every other surface shows it — the pins,
                  the legend, the Paldex — and the layer rows directly above
                  these already carry the game's symbol. The one place where
                  you actually CHOOSE a pal was the only place showing nothing
                  but text, which also makes 224 rows far slower to scan:
                  you read names instead of recognising creatures. */}
              <PalIcon name={n} size={26} />
              <Icon
                name={on ? 'eye-outline' : 'eye-off-outline'}
                size={16}
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
        }}
      />
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
