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
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { T } from '../theme';
import { Icon } from '../ui/Icon';
import { SearchInput, s } from '../ui/kit';
import { MapCanvas, type MapCanvasHandle, type MapMarker } from '../map/MapCanvas';
import { clusterPoints, pointsInRect, type PointSet } from '../map/points';
import { uvToReadout, regionOf, type RegionId } from '../map/projection';
import {
  GROUP_LABEL, emptyFilters, isNightOnly, poiLayer, poiLayers, poiPoints,
  spawnLevels, spawnPoints, spawnablePals, type LayerGroup, type MapFilters,
} from '../map/layers';
import { MAP_REGIONS } from '../data/mapMeta.g';
import { ownedAny, pals } from '../store';

type Sheet = null | 'layers' | 'pals';

interface Viewport { scale: number; u0: number; v0: number; u1: number; v1: number }

export function MapScreen() {
  const insets = useSafeAreaInsets();
  const canvas = useRef<MapCanvasHandle | null>(null);
  const [filters, setFilters] = useState<MapFilters>(() => emptyFilters());
  const [sheet, setSheet] = useState<Sheet>(null);
  const [vp, setVp] = useState<Viewport>({ scale: 1, u0: 0, v0: 0, u1: 1, v1: 1 });
  const [focus, setFocus] = useState<{ label: string; sub: string } | null>(null);

  const region = filters.region;

  const patch = useCallback((p: Partial<MapFilters>) => {
    setFilters((f) => ({ ...f, ...p }));
  }, []);

  /* ------------------------------------------------- what is on the map now */

  const active = useMemo(() => {
    const out: { key: string; set: PointSet; colour: string; icon: string; label: string }[] = [];
    for (const id of filters.poi) {
      const set = poiPoints(id, region);
      const layer = poiLayer(id);
      if (set && layer && set.n) {
        out.push({ key: `poi:${id}`, set, colour: layer.colour, icon: layer.icon, label: layer.label });
      }
    }
    for (const pal of filters.pals) {
      const set = spawnPoints(pal, region, filters.time, filters.level);
      if (set && set.n) {
        out.push({
          key: `pal:${pal}`,
          set,
          colour: isNightOnly(pal, region) ? '#9B8CFF' : T.accent,
          icon: 'paw',
          label: pal,
        });
      }
    }
    return out;
  }, [filters.level, filters.pals, filters.poi, filters.time, region]);

  const markers = useMemo<MapMarker[]>(() => {
    const out: MapMarker[] = [];
    // A hard ceiling per layer keeps the mounted view count bounded no matter
    // how many layers the user switches on at once.
    const budget = Math.max(40, Math.floor(360 / Math.max(1, active.length)));
    for (const layer of active) {
      const hits = pointsInRect(layer.set, vp.u0, vp.v0, vp.u1, vp.v1);
      const clusters = clusterPoints(layer.set, hits, vp.scale, PIN + 14).slice(0, budget);
      for (const c of clusters) {
        out.push({
          key: `${layer.key}:${c.index}:${c.count}`,
          u: c.u,
          v: c.v,
          render: () => <Pin colour={layer.colour} icon={layer.icon} count={c.count} />,
        });
      }
    }
    return out;
  }, [active, vp]);

  const shownCount = useMemo(
    () => active.reduce((n, l) => n + l.set.n, 0),
    [active],
  );

  /* ------------------------------------------------------------ interaction */

  const onPress = useCallback((u: number, v: number) => {
    if (!active.length) return;
    const r = uvToReadout({ u, v }, regionOf(region));
    setFocus({ label: `${r.x}, ${r.y}`, sub: 'map position' });
  }, [active.length, region]);

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
          accessibilityLabel="Fit the whole map on screen"
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
        <View style={{
          position: 'absolute', top: 56, alignSelf: 'center',
          backgroundColor: 'rgba(12,22,24,0.9)', borderRadius: 10,
          borderWidth: 1, borderColor: T.line, paddingHorizontal: 11, paddingVertical: 6,
        }}>
          <Text style={{ color: T.ink, fontWeight: '800', fontSize: 13 }}>{focus.label}</Text>
        </View>
      )}

      {/* bottom controls */}
      <View style={{
        position: 'absolute', left: 12, right: 12, bottom: insets.bottom + 14, gap: 8,
      }}>
        {shownCount > 0 && (
          <View style={{
            alignSelf: 'flex-start', backgroundColor: 'rgba(12,22,24,0.88)',
            borderRadius: 10, borderWidth: 1, borderColor: T.line,
            paddingHorizontal: 10, paddingVertical: 6,
          }}>
            <Text style={{ color: T.muted, fontSize: 11.5, fontWeight: '700' }}>
              {shownCount.toLocaleString()} {shownCount === 1 ? 'spot' : 'spots'} on the map
            </Text>
          </View>
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
          onClear={() => patch({ pals: new Set() })}
          onClose={() => setSheet(null)}
        />
      )}
    </View>
  );
}

/* -------------------------------------------------------------- pieces */

const PIN = 23;

function Pin({ colour, icon, count }: { colour: string; icon: string; count: number }) {
  const many = count > 1;
  return (
    <View style={{
      width: PIN, height: PIN, marginLeft: -PIN / 2, marginTop: -PIN / 2,
      borderRadius: PIN / 2, alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'rgba(10,20,24,0.86)', borderWidth: 2, borderColor: colour,
    }}>
      {many ? (
        <Text style={{ color: colour, fontWeight: '900', fontSize: count > 99 ? 9 : 11 }}>
          {count > 999 ? '999+' : count}
        </Text>
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

function PalSheet({ filters, region, onToggle, onClear, onClose }: {
  filters: MapFilters; region: RegionId;
  onToggle: (name: string) => void; onClear: () => void; onClose: () => void;
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
