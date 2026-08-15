/** The game map for a pal: gold pins = fixed alpha/boss locations, teal
 * markers = spawn regions. Every position comes from real coordinates in
 * the location datasets, projected with the game's own map transforms
 * (tools/extract_alpha_spots.py, tools/extract_region_spots.py) — no
 * invented positions, ever. Off-map spots (e.g. The World Tree) get a
 * labeled row instead of a fake pin.
 */
import React, { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { T } from '../theme';
import { s } from './kit';
import { Icon } from './Icon';
import { ALPHA_SPOTS } from '../data/alphaSpots.g';
import { REGION_SPOTS } from '../data/regionSpots.g';
import { pals } from '../store';
import { MapViewer, type MapPin } from './MapViewer';

/* eslint-disable @typescript-eslint/no-require-imports */
const MAP = require('../../assets/map2048.jpg');

/** Dataset region strings can carry level brackets and data notes — clean
 * them before they reach the user (reviewer catch 2026-08-15). */
function cleanRegion(r: string): string {
  const base = r.replace(/\s*\[[^\]]*\]\s*$/, '').trim();
  // long data notes ("X - explanation of where that is") -> just the name
  return base.length > 40 && base.includes(' - ') ? base.split(' - ')[0].trim() : base;
}

export function PalMap({ name }: { name: string }) {
  const [expanded, setExpanded] = useState(false);
  const spots = ALPHA_SPOTS[name] ?? [];
  const onMap = spots.filter((sp) => !sp.off);
  const offMap = spots.filter((sp) => sp.off);
  const rawRegions = pals[name]?.regions ?? [];
  const regions = rawRegions.filter((r) => REGION_SPOTS[r]);
  const cleaned = rawRegions
    .filter((r) => !REGION_SPOTS[r])
    .map(cleanRegion);
  // areas beyond the base map get the labeled-row treatment, like alphas
  const beyond = [...new Set(cleaned.filter((r) => /world tree/i.test(r)))];
  const unknownRegions = [...new Set(cleaned.filter((r) => !/world tree/i.test(r)))];

  if (!spots.length && !regions.length && !unknownRegions.length && !beyond.length) return null;

  return (
    <View style={{ gap: 8 }}>
      {(onMap.length > 0 || regions.length > 0) && (
        <Pressable
          onPress={() => setExpanded(true)}
          accessibilityRole="button"
          accessibilityLabel="Open the map fullscreen"
          style={({ pressed }) => [{
            borderRadius: 12, overflow: 'hidden', borderWidth: 1,
            borderColor: pressed ? T.accent : T.line,
          }]}
        >
          <View style={{ width: '100%', aspectRatio: 1 }}>
            <Image source={MAP} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            {regions.map((r) => (
              <View
                key={r}
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: `${REGION_SPOTS[r].x * 100}%`,
                  top: `${REGION_SPOTS[r].y * 100}%`,
                  transform: [{ translateX: -8 }, { translateY: -8 }],
                }}
              >
                <View style={{
                  width: 16, height: 16, borderRadius: 8,
                  borderWidth: 2.5, borderColor: T.accent,
                  backgroundColor: 'rgba(63,193,201,0.30)',
                  shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 3,
                }} />
              </View>
            ))}
            {onMap.map((sp, i) => (
              <View
                key={i}
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: `${sp.x * 100}%`,
                  top: `${sp.y * 100}%`,
                  transform: [{ translateX: -11 }, { translateY: -11 }],
                  alignItems: 'center',
                }}
              >
                <View style={{
                  width: 22, height: 22, borderRadius: 11,
                  borderWidth: 3, borderColor: T.gold,
                  backgroundColor: 'rgba(240,180,65,0.28)',
                  shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 3,
                }} />
                {sp.lv != null && (
                  <Text style={{
                    color: '#fff', backgroundColor: 'rgba(12,22,24,0.85)',
                    fontSize: 10, fontWeight: '800', borderRadius: 5,
                    paddingHorizontal: 5, paddingVertical: 1, overflow: 'hidden',
                    marginTop: 2,
                  }}>Lv {sp.lv}</Text>
                )}
              </View>
            ))}
            {/* expand affordance — the map is a real screen, not a picture */}
            <View style={{
              position: 'absolute', top: 8, right: 8,
              backgroundColor: 'rgba(12,22,24,0.8)', borderRadius: 8,
              paddingHorizontal: 7, paddingVertical: 4,
              flexDirection: 'row', alignItems: 'center', gap: 4,
            }}>
              <Icon name="arrow-expand-all" size={13} color={T.accentInk} />
              <Text style={{ color: T.accentInk, fontSize: 10.5, fontWeight: '800' }}>
                Tap to zoom
              </Text>
            </View>
          </View>
        </Pressable>
      )}
      {expanded && (
        <MapViewer
          title={`${name} — where to find it`}
          onClose={() => setExpanded(false)}
          pins={[
            ...regions.map((r): MapPin => ({
              x: REGION_SPOTS[r].x, y: REGION_SPOTS[r].y, kind: 'region',
            })),
            ...onMap.map((sp): MapPin => ({
              x: sp.x, y: sp.y, kind: 'alpha', lv: sp.lv,
            })),
          ]}
        />
      )}
      {/* legend + labels — vector icons, never emoji */}
      {onMap.map((sp, i) => (
        <View key={`l${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="map-marker" size={14} color={T.gold} />
          <Text style={[s.body, { fontSize: 12.5, flex: 1 }]}>
            Fixed boss{sp.lv != null ? ` (Lv ${sp.lv})` : ''} — {sp.place}
          </Text>
        </View>
      ))}
      {regions.length > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="map-marker-radius-outline" size={14} color={T.accentInk} />
          <Text style={[s.body, { fontSize: 12.5, flex: 1 }]}>
            Spawns: {regions.join(' · ')}
          </Text>
        </View>
      )}
      {unknownRegions.length > 0 && (
        <Text style={[s.body, { fontSize: 12, color: T.faint }]}>
          Also roams: {unknownRegions.join(' · ')}
        </Text>
      )}
      {beyond.map((r) => (
        <View key={`b-${r}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="star-four-points-outline" size={14} color={T.goldInk} />
          <Text style={[s.body, { fontSize: 12.5, color: T.goldInk, flex: 1 }]}>
            {r} — beyond the base map
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
