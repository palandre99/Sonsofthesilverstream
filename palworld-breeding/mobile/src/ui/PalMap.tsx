/** The game map with this pal's fixed alpha/boss locations.
 *
 * Every pin comes from real coordinates in the location dataset, projected
 * with the game's own map transforms (see tools/extract_alpha_spots.py) —
 * no invented positions, ever. Pals without fixed spots show their spawn
 * regions as labels; off-map spots (e.g. The World Tree) get a labeled row
 * instead of a fake pin.
 */
import React from 'react';
import { Image, Text, View } from 'react-native';
import { T } from '../theme';
import { s } from './kit';
import { ALPHA_SPOTS } from '../data/alphaSpots.g';

/* eslint-disable @typescript-eslint/no-require-imports */
const MAP = require('../../assets/map2048.jpg');

export function PalMap({ name }: { name: string }) {
  const spots = ALPHA_SPOTS[name] ?? [];
  const onMap = spots.filter((sp) => !sp.off);
  const offMap = spots.filter((sp) => sp.off);

  if (!spots.length) return null;

  return (
    <View style={{ gap: 8 }}>
      {onMap.length > 0 && (
        <View style={{
          borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: T.line,
        }}>
          <View style={{ width: '100%', aspectRatio: 1 }}>
            <Image source={MAP} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
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
          </View>
        </View>
      )}
      {onMap.map((sp, i) => (
        <Text key={`l${i}`} style={[s.body, { fontSize: 12.5 }]}>
          📍 Fixed boss{sp.lv != null ? ` (Lv ${sp.lv})` : ''} — {sp.place}
        </Text>
      ))}
      {offMap.map((sp, i) => (
        <Text key={`o${i}`} style={[s.body, { fontSize: 12.5, color: T.goldInk }]}>
          ✦ {sp.place}{sp.lv != null ? ` (Lv ${sp.lv})` : ''} — beyond the base map
        </Text>
      ))}
    </View>
  );
}
