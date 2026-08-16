/** "Where to find it" on a pal's card — a real map, not a picture of one.
 *
 * WHAT CHANGED AND WHY (CEO feedback 2026-08-15 ~12:25, two items):
 *   "the asset looks terrible, not like the game" and "way too small, just an
 *   image — tap to open fullscreen with pan and pinch".
 *
 * The old version drew ONE teal dot per spawn REGION, positioned at that
 * region's label. A pal that roams half a biome got a 16 px dot on a place
 * name. That is a label, not a location, and it could never meet the "no room
 * for error on locations" bar. This draws the species' real datamined spawn
 * points, cropped to where they actually are, with the level band and whether
 * it only comes out at night — and hands the player to the full Map fane with
 * the species already selected.
 */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { T } from '../theme';
import { s } from './kit';
import { Icon } from './Icon';
import { ALPHA_SPOTS } from '../data/alphaSpots.g';
import { MapPreview, type PreviewPoint } from '../map/MapPreview';
import { decodePoints } from '../map/points';
import { REGION_BY_INDEX, type RegionId } from '../map/projection';
import { MAP_ALPHAS, MAP_SPAWNS } from '../data/mapSpawns.g';
import { spawnSplit } from '../map/layers';
import { navigateTo } from '../nav/intent';

const PREVIEW = 260;

interface RegionView {
  region: RegionId;
  label: string;
  points: PreviewPoint[];
  lo: number;
  hi: number;
  nightOnly: boolean;
  spawns: number;
}

/** Everything we can show for this pal, one entry per map it lives on. */
function viewsFor(name: string): RegionView[] {
  const groups = MAP_SPAWNS[name] ?? [];
  const byRegion = new Map<RegionId, RegionView>();

  for (const g of groups) {
    if (g.dun) continue;   // dungeon spawners are not places on the surface
    const region = REGION_BY_INDEX[g.m];
    const set = decodePoints(g.pts);
    const view = byRegion.get(region) ?? {
      region,
      label: region === 'palpagos' ? 'Palpagos Islands' : 'The World Tree',
      points: [],
      lo: g.lo,
      hi: g.hi,
      nightOnly: true,
      spawns: 0,
    };
    for (let i = 0; i < set.n; i++) {
      view.points.push({ u: set.xy[i * 2], v: set.xy[i * 2 + 1] });
    }
    view.lo = Math.min(view.lo, g.lo);
    view.hi = Math.max(view.hi, g.hi);
    view.nightOnly = view.nightOnly && g.night;
    view.spawns += set.n;
    byRegion.set(region, view);
  }

  // Fixed boss spots know which map they are on, so a World Tree boss can
  // never be drawn on the Palpagos map. A pal can be boss-only, in which case
  // this creates the region's view rather than decorating one.
  for (const spot of MAP_ALPHAS[name] ?? []) {
    const region = REGION_BY_INDEX[spot.m];
    const view = byRegion.get(region) ?? {
      region,
      label: region === 'palpagos' ? 'Palpagos Islands' : 'The World Tree',
      points: [],
      lo: spot.lv,
      hi: spot.lv,
      nightOnly: false,
      spawns: 0,
    };
    view.points.push({ u: spot.u, v: spot.v, alpha: true });
    byRegion.set(region, view);
  }

  return [...byRegion.values()].sort((a, b) => b.spawns - a.spawns);
}

export function PalMap({ name }: { name: string }) {
  const views = React.useMemo(() => viewsFor(name), [name]);
  const alphas = (ALPHA_SPOTS[name] ?? []).filter((sp) => !sp.off);
  const offMap = (ALPHA_SPOTS[name] ?? []).filter((sp) => sp.off);

  if (!views.length && !alphas.length && !offMap.length) {
    return (
      <Text style={[s.body, { fontSize: 12.5, color: T.faint }]}>
        {/* Says only what the data supports. The old wording — "hatch it or
            beat its boss" — invented a route: ALL 26 pals with no wild spawn
            also have no boss anywhere in our tables, so it sent players
            looking for something we have no record of. The badges under this
            line carry the real route, straight from the game's own notes. */}
        This one has no spawns anywhere on the map.
      </Text>
    );
  }

  const openFullMap = () => {
    navigateTo({ domain: 'map', tab: 'map', payload: { pal: name, fromCard: name } });
  };

  return (
    <View style={{ gap: 10 }}>
      {views.map((view) => (
        <Pressable
          key={view.region}
          onPress={openFullMap}
          accessibilityRole="button"
          accessibilityLabel={`Open ${name} on the full map`}
          style={({ pressed }) => ({
            borderRadius: 12,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: pressed ? T.accent : T.line,
          })}
        >
          <MapPreview region={view.region} points={view.points} side={PREVIEW}>
            <View style={{
              position: 'absolute', top: 8, left: 8,
              backgroundColor: 'rgba(12,22,24,0.85)', borderRadius: 8,
              paddingHorizontal: 8, paddingVertical: 4,
            }}>
              <Text style={{ color: T.ink, fontSize: 11, fontWeight: '800' }}>
                {view.label}
              </Text>
            </View>
            <View style={{
              position: 'absolute', top: 8, right: 8,
              backgroundColor: 'rgba(12,22,24,0.85)', borderRadius: 8,
              paddingHorizontal: 7, paddingVertical: 4,
              flexDirection: 'row', alignItems: 'center', gap: 4,
            }}>
              <Icon name="arrow-expand-all" size={12} color={T.accentInk} />
              <Text style={{ color: T.accentInk, fontSize: 10.5, fontWeight: '800' }}>
                Open full map
              </Text>
            </View>
          </MapPreview>

          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            paddingHorizontal: 10, paddingVertical: 8, backgroundColor: T.surface,
          }}>
            <Icon
              name={view.nightOnly ? 'weather-night' : 'white-balance-sunny'}
              size={14}
              color={view.nightOnly ? '#9B8CFF' : T.muted}
            />
            <Text style={[s.body, { fontSize: 12.5, flex: 1 }]}>
              {view.spawns > 0
                ? `${view.spawns} ${view.spawns === 1 ? 'spot' : 'spots'} · `
                : 'Boss only · '}
              {view.lo === view.hi ? `Lv ${view.lo}` : `Lv ${view.lo}–${view.hi}`}
              {view.nightOnly && view.spawns > 0 ? ' · only at night' : ''}
              {spawnSplit(name, view.region).dungeon > 0
                ? ` · plus ${spawnSplit(name, view.region).dungeon} in dungeons`
                : ''}
            </Text>
          </View>
        </Pressable>
      ))}

      {alphas.map((sp, i) => (
        <View key={`a${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="crown-outline" size={14} color={T.gold} />
          <Text style={[s.body, { fontSize: 12.5, flex: 1 }]}>
            Fixed boss{sp.lv != null ? ` (Lv ${sp.lv})` : ''} — {sp.place}
          </Text>
        </View>
      ))}
      {offMap.map((sp, i) => (
        <View key={`o${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="star-four-points-outline" size={14} color={T.goldInk} />
          <Text style={[s.body, { fontSize: 12.5, color: T.goldInk, flex: 1 }]}>
            {sp.place}{sp.lv != null ? ` (Lv ${sp.lv})` : ''} — beyond the base map
          </Text>
        </View>
      ))}
    </View>
  );
}
