/** Fullscreen map viewer: pan + pinch zoom (native ScrollView zoom on iOS),
 * showing one pal's spawn regions (teal) and fixed boss pins (gold).
 * The seed of the future Map section — here scoped to the pal being viewed. */
import React from 'react';
import {
  Dimensions, Image, Modal, Pressable, ScrollView, Text, View,
} from 'react-native';
import { T } from '../theme';
import { Icon } from './Icon';

/* eslint-disable @typescript-eslint/no-require-imports */
const MAP = require('../../assets/map2048.jpg');

export interface MapPin {
  x: number;
  y: number;
  kind: 'region' | 'alpha';
  lv?: number | null;
}

export function MapViewer({ title, pins, onClose }: {
  title: string;
  pins: MapPin[];
  onClose: () => void;
}) {
  const side = Dimensions.get('window').width;
  return (
    <Modal visible animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#04090b' }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          paddingTop: 54, paddingBottom: 10, paddingHorizontal: 16,
          backgroundColor: T.bg2, borderBottomWidth: 1, borderBottomColor: T.line,
        }}>
          <Icon name="map-outline" size={18} color={T.accentInk} />
          <Text style={{ color: T.ink, fontWeight: '800', fontSize: 16, flex: 1 }}>
            {title}
          </Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button"
            accessibilityLabel="Close map">
            <Icon name="close" size={24} color={T.muted} />
          </Pressable>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            flexGrow: 1, alignItems: 'center', justifyContent: 'center',
          }}
          maximumZoomScale={5}
          minimumZoomScale={1}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          bouncesZoom
          centerContent
        >
          <View style={{ width: side, height: side }}>
            <Image source={MAP} style={{ width: '100%', height: '100%' }}
              resizeMode="cover" />
            {pins.map((p, i) => (
              <View key={i} pointerEvents="none" style={{
                position: 'absolute',
                left: `${p.x * 100}%`, top: `${p.y * 100}%`,
                transform: [
                  { translateX: p.kind === 'alpha' ? -9 : -7 },
                  { translateY: p.kind === 'alpha' ? -9 : -7 },
                ],
                alignItems: 'center',
              }}>
                <View style={p.kind === 'alpha' ? {
                  width: 18, height: 18, borderRadius: 9,
                  borderWidth: 2.5, borderColor: T.gold,
                  backgroundColor: 'rgba(240,180,65,0.35)',
                } : {
                  width: 14, height: 14, borderRadius: 7,
                  borderWidth: 2, borderColor: T.accent,
                  backgroundColor: 'rgba(63,193,201,0.35)',
                }} />
                {p.kind === 'alpha' && p.lv != null && (
                  <Text style={{
                    color: '#fff', backgroundColor: 'rgba(12,22,24,0.85)',
                    fontSize: 8, fontWeight: '800', borderRadius: 4,
                    paddingHorizontal: 4, paddingVertical: 1, overflow: 'hidden',
                    marginTop: 1,
                  }}>Lv {p.lv}</Text>
                )}
              </View>
            ))}
          </View>
        </ScrollView>

        <Text style={{
          color: T.faint, fontSize: 11.5, textAlign: 'center',
          paddingVertical: 12, paddingHorizontal: 20,
        }}>
          Pinch to zoom · drag to pan
        </Text>
      </View>
    </Modal>
  );
}
