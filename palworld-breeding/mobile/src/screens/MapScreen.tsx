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
  GROUP_LABEL, dungeonPoints, emptyFilters, isNightOnly, poiLayer, poiLayers, poiPoints,
  spawnLevels, spawnPoints, spawnablePals, wildBands, type LayerGroup, type MapFilters,
} from '../map/layers';
import { MAP_REGIONS } from '../data/mapMeta.g';
import { MAP_ICONS } from '../data/mapIcons.g';
import { REGION_SPOTS } from '../data/regionSpots.g';
import { takeIntentPayload } from '../nav/intent';
import { regionsFor } from '../map/layers';
import { ownedAny, pals } from '../store';

type Sheet = null | 'layers' | 'pals';

interface Viewport { scale: number; u0: number; v0: number; u1: number; v1: number }

export function MapScreen() {
  const insets = useSafeAreaInsets();
  const canvas = useRef<MapCanvasHandle | null>(null);
  const [filters, setFilters] = useState<MapFilters>(() => emptyFilters());
  const [sheet, setSheet] = useState<Sheet>(null);
  const [legend, setLegend] = useState(false);
  const [vp, setVp] = useState<Viewport>({ scale: 1, u0: 0, v0: 0, u1: 1, v1: 1 });
  const [focus, setFocus] = useState<{
    title: string; lines: string[]; at: string; colour: string; icon: string;
  } | null>(null);

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
    for (const pal of filters.pals) {
      const surface = spawnPoints(pal, region, filters.time, filters.level);
      if (surface && surface.n) {
        out.push({
          key: `pal:${pal}`,
          set: surface,
          colour: isNightOnly(pal, region) ? '#9B8CFF' : T.accent,
          icon: 'paw',
          label: pal,
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
            colour: '#8AA6FF',
            icon: 'door',
            label: `${pal} — in dungeons`,
            square: true,
          });
        }
      }
    }
    return out;
  }, [filters.dungeons, filters.level, filters.pals, filters.poi, filters.time, region]);

  const markers = useMemo<MapMarker[]>(() => {
    const out: MapMarker[] = [];
    // Each layer clusters on its own, so switching five of them on used to put
    // five independent swarms over each other — 1,958 spots of unreadable
    // overlap. The more layers are showing, the coarser every layer clusters,
    // and the total mounted count stays bounded either way.
    const budget = Math.max(24, Math.floor(200 / Math.max(1, active.length)));
    const cell = PIN + 14 + Math.max(0, active.length - 1) * 9;
    for (const layer of active) {
      const hits = pointsInRect(layer.set, vp.u0, vp.v0, vp.u1, vp.v1);
      const clusters = clusterPoints(layer.set, hits, vp.scale, cell).slice(0, budget);
      for (const c of clusters) {
        out.push({
          // stable while the zoom holds, so a pan never remounts a pin
          key: `${layer.key}:${c.cell}`,
          u: c.u,
          v: c.v,
          render: () => (
            <Pin colour={layer.colour} icon={layer.icon} count={c.count}
              square={layer.square} art={layer.art} />
          ),
        });
      }
    }
    return out;
  }, [active, vp]);

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
    // 0.75 of a box, not 0.5: the viewport rect this reads is pushed on a
    // threshold rather than every frame, so a little slack is what keeps names
    // from truncating mid-word at the edge. A name lost there costs nothing —
    // pan slightly and it appears.
    const inset = (LABEL_W * 0.75) / vp.scale;
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
        render: () => <PlaceName name={name} />,
      });
    }
    return out;
  }, [region, vp]);

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
    const span = Math.max(u1 - u0, v1 - v0, 0.08) * 1.25;
    canvas.current?.focus((u0 + u1) / 2, (v0 + v1) / 2, 1 / span);
  }, [focusKey]);

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
    let best: { layer: typeof active[number]; d: number } | null = null;
    for (const layer of active) {
      const p = nearestPoint(layer.set, u, v, reach);
      if (p == null) continue;
      const du = layer.set.xy[p * 2] - u;
      const dv = layer.set.xy[p * 2 + 1] - v;
      const d = du * du + dv * dv;
      if (!best || d < best.d) best = { layer, d };
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
      lines.push(`${layer.set.n} on this map`);
    }
    setFocus({ title: layer.label, lines, at, colour: layer.colour, icon: layer.icon });
  }, [active, region, vp.scale]);

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
        markers={markers}
        screenMarkers={labels}
        canvasRef={canvas}
        onViewport={setVp}
        onPress={onPress}
      />

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
                    <View style={{
                      width: 15, height: 15,
                      borderRadius: l.square ? 4 : 8,
                      borderWidth: 2, borderColor: l.colour,
                      backgroundColor: 'rgba(10,20,24,0.86)',
                    }} />
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
            label={filters.pals.size ? `Pals · ${filters.pals.size}` : 'Find a pal'}
            on={filters.pals.size > 0}
            onPress={() => setSheet('pals')}
          />
          <ControlBtn
            icon={filters.time.night && !filters.time.day ? 'weather-night' : 'white-balance-sunny'}
            label={filters.time.night && !filters.time.day ? 'Night' : 'All day'}
            on={filters.time.night && !filters.time.day}
            onPress={() => patch({
              time: filters.time.day
                ? { day: false, night: true }
                : { day: true, night: true },
            })}
          />
        </View>
      </View>

      {sheet === 'layers' && (
        <LayerSheet
          filters={filters}
          onToggle={togglePoi}
          onClear={() => patch({ poi: new Set() })}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'pals' && (
        <PalSheet
          filters={filters}
          region={region}
          onToggle={togglePal}
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
function textWidth(name: string): number {
  return Math.min(LABEL_W, name.length * 5.9);
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

/**
 * Dungeon pins are SQUARE and surface pins are round.
 *
 * Hue alone had run out of room: night-only pals sit at #9B8CFF and dungeon
 * spawns at #8AA6FF, which is the same colour to anyone not holding a swatch.
 * Shape survives colour-blindness, small sizes and a busy map in a way a
 * fourth shade of violet does not.
 */
function Pin({ colour, icon, count, square, art }: {
  colour: string; icon: string; count: number; square?: boolean; art?: number;
}) {
  const many = count > 1;
  return (
    <View style={{
      width: PIN, height: PIN, marginLeft: -PIN / 2, marginTop: -PIN / 2,
      borderRadius: square ? 6 : PIN / 2, alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'rgba(10,20,24,0.86)', borderWidth: 2, borderColor: colour,
    }}>
      {many ? (
        <Text style={{ color: colour, fontWeight: '900', fontSize: count > 99 ? 9 : 11 }}>
          {count > 999 ? '999+' : count}
        </Text>
      ) : art != null ? (
        // the GAME's own symbol — a player already knows what it means
        <Image source={art} style={{ width: 15, height: 15 }} resizeMode="contain" />
      ) : (
        <Icon name={icon} size={14} color={colour} />
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

function LayerSheet({ filters, onToggle, onClear, onClose }: {
  filters: MapFilters; onToggle: (id: string) => void; onClear: () => void; onClose: () => void;
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
                    accessibilityLabel={`${l.label}, ${l.n} on the map`}
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
                    <Text style={{ color: T.faint, fontWeight: '700', fontSize: 11 }}>{l.n}</Text>
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

function PalSheet({ filters, region, onToggle, onToggleDungeons, onClear, onClose }: {
  filters: MapFilters; region: RegionId;
  onToggle: (name: string) => void; onToggleDungeons: () => void;
  onClear: () => void; onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [missingOnly, setMissingOnly] = useState(false);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return spawnablePals().filter((n) => {
      if (needle && !n.toLowerCase().includes(needle)) return false;
      if (missingOnly && ownedAny(n)) return false;
      return spawnLevels(n, region) !== null;
    });
  }, [missingOnly, q, region]);

  return (
    <SheetShell title="Find a pal" onClear={onClear} onClose={onClose}>
      <View style={{ paddingHorizontal: 14, paddingTop: 12, gap: 10 }}>
        <SearchInput value={q} onChange={setQ} placeholder="Search pals…" />
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
        <Pressable
          onPress={() => setMissingOnly((m) => !m)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: missingOnly }}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
            paddingHorizontal: 11, paddingVertical: 9, borderRadius: 11, borderWidth: 1,
            borderColor: missingOnly ? T.accent : T.line,
            backgroundColor: missingOnly ? T.accentSoft : T.surface,
          }}
        >
          <Icon
            name={missingOnly ? 'checkbox-marked-outline' : 'checkbox-blank-outline'}
            size={16}
            color={missingOnly ? T.accentInk : T.muted}
          />
          <Text style={{ color: missingOnly ? T.accentInk : T.ink, fontWeight: '700', fontSize: 12.5 }}>
            Only pals I&apos;m missing
          </Text>
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={{ padding: 14, gap: 7 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {list.length === 0 && (
          <Text style={[s.body, { color: T.faint, paddingTop: 10 }]}>
            {missingOnly
              ? 'Nothing left to find here — you own every pal that spawns on this map.'
              : 'No pal by that name spawns on this map.'}
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
    </SheetShell>
  );
}

/** Kept honest: the Paldex is the name authority, so a species that is not in
 *  it must never reach the map's UI. */
export function mapKnowsPal(name: string): boolean {
  return Boolean(pals[name]);
}
