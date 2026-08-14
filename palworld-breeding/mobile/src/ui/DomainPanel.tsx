/** The side panel: main domains of the companion. Swipe from the left edge
 * to open; drag its edge to snap between compact and full width; tap away
 * or swipe left to close. Pure RN Animated + PanResponder. */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { T } from '../theme';
import { s } from './kit';
import { DOMAINS } from '../nav/domains';
import { getActiveProfile, useAppVersion } from '../store';

const W_COMPACT = 216;
const W_FULL = 300;

export function DomainPanel({ open, domain, onSelect, onClose }: {
  open: boolean;
  domain: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  useAppVersion();
  const [width, setWidth] = useState(W_COMPACT);
  const x = useRef(new Animated.Value(-W_FULL)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(x, {
        toValue: open ? 0 : -W_FULL,
        useNativeDriver: true, bounciness: 4, speed: 18,
      }),
      Animated.timing(fade, { toValue: open ? 1 : 0, duration: 180, useNativeDriver: true }),
    ]).start();
  }, [open, x, fade]);

  // drag anywhere on the panel: left = close, right = grow to full,
  // release snaps to the nearest clean width
  const pan = useRef({ startWidth: W_COMPACT });
  const responder = useRef(
    require('react-native').PanResponder.create({
      onMoveShouldSetPanResponder: (_e: unknown, g: { dx: number; dy: number }) =>
        Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderGrant: () => {
        pan.current.startWidth = width;
      },
      onPanResponderRelease: (_e: unknown, g: { dx: number; vx: number }) => {
        if (g.dx < -60 || g.vx < -0.6) {
          onClose();
          return;
        }
        const target = pan.current.startWidth + g.dx;
        const snapped = target > (W_COMPACT + W_FULL) / 2 ? W_FULL : W_COMPACT;
        if (snapped !== width) void Haptics.selectionAsync();
        setWidth(snapped);
      },
    }),
  ).current;

  const active = getActiveProfile();
  const full = width === W_FULL;

  return (
    <View pointerEvents={open ? 'auto' : 'none'}
      style={{ position: 'absolute', inset: 0, zIndex: 40 }}>
      <Animated.View style={{
        position: 'absolute', inset: 0, backgroundColor: '#000',
        opacity: fade.interpolate({ inputRange: [0, 1], outputRange: [0, 0.55] }),
      }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close menu" />
      </Animated.View>

      <Animated.View
        {...responder.panHandlers}
        style={{
          position: 'absolute', top: 0, bottom: 0, left: 0, width,
          backgroundColor: T.bg2, borderRightWidth: 1, borderRightColor: T.line,
          transform: [{ translateX: x }], paddingTop: 56,
        }}
      >
        <View style={[s.row, { paddingHorizontal: 16, marginBottom: 16, gap: 10 }]}>
          <Text style={{ fontSize: 22 }}>🔵</Text>
          <Text style={{ color: T.accentInk, fontSize: 20, fontWeight: '800' }}>Palforge</Text>
        </View>

        <ScrollView style={{ flex: 1 }}>
          {DOMAINS.map((d) => {
            const on = domain === d.id;
            return (
              <Pressable
                key={d.id}
                onPress={() => {
                  void Haptics.selectionAsync();
                  onSelect(d.id);
                  onClose();
                }}
                style={({ pressed }) => [{
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  paddingVertical: 13, paddingHorizontal: 16,
                  backgroundColor: on ? T.accentSoft : pressed ? T.surface : 'transparent',
                  borderRightWidth: on ? 3 : 0, borderRightColor: T.accent,
                }]}
              >
                <Text style={{ fontSize: 20, opacity: d.soon ? 0.55 : 1 }}>{d.glyph}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{
                    color: on ? T.accentInk : d.soon ? T.faint : T.ink,
                    fontWeight: '800', fontSize: 15,
                  }}>{d.title}</Text>
                  {full && d.blurb && (
                    <Text style={{ color: T.faint, fontSize: 11, marginTop: 1 }}
                      numberOfLines={2}>{d.blurb}</Text>
                  )}
                </View>
                {d.soon && (
                  <Text style={{
                    color: T.goldInk, backgroundColor: T.goldSoft, fontSize: 8.5,
                    fontWeight: '800', borderRadius: 5, paddingHorizontal: 6,
                    paddingVertical: 2, overflow: 'hidden', letterSpacing: 0.5,
                  }}>SOON</Text>
                )}
              </Pressable>
            );
          })}
        </ScrollView>

        <Pressable
          onPress={() => {
            void Haptics.selectionAsync();
            onSelect('settings');
            onClose();
          }}
          style={{
            borderTopWidth: 1, borderTopColor: T.line, padding: 14,
            flexDirection: 'row', alignItems: 'center', gap: 8,
          }}
        >
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: T.ok }} />
          <Text style={{ color: T.muted, fontWeight: '700', fontSize: 12.5, flex: 1 }}
            numberOfLines={1}>{active.name}</Text>
          <Text style={{ color: T.faint, fontSize: 10.5 }}>{full ? 'manage in Settings' : '⚙️'}</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}
