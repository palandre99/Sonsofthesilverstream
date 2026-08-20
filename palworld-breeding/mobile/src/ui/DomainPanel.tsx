/** The side panel: main domains of the companion. Swipe from the left edge
 * to open; drag its edge to snap between compact and full width; tap away
 * or swipe left to close. Pure RN Animated + PanResponder. */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, PanResponder, Pressable, ScrollView, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { T } from '../theme';
import { Icon } from './Icon';
import { DOMAINS } from '../nav/domains';
import { getActiveProfile, useAppVersion } from '../store';

const W_COMPACT = 224;
const W_FULL = 304;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const LOGO = require('../../assets/splash-icon.png');

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
  // release snaps to the nearest clean width. The responder is created once,
  // so it must read width through a ref — the raw state var would be a stale
  // closure frozen at first render.
  const widthRef = useRef(width);
  widthRef.current = width;
  const pan = useRef({ startWidth: W_COMPACT });
  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderGrant: () => {
        pan.current.startWidth = widthRef.current;
      },
      onPanResponderRelease: (_e, g) => {
        if (g.dx < -60 || g.vx < -0.6) {
          onClose();
          return;
        }
        const target = pan.current.startWidth + g.dx;
        const snapped = target > (W_COMPACT + W_FULL) / 2 ? W_FULL : W_COMPACT;
        if (snapped !== widthRef.current) void Haptics.selectionAsync();
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
        <Pressable style={{ flex: 1 }} onPress={onClose}
          accessibilityRole="button" accessibilityLabel="Close menu" />
      </Animated.View>

      <Animated.View
        {...responder.panHandlers}
        style={{
          position: 'absolute', top: 0, bottom: 0, left: 0, width,
          backgroundColor: T.bg2, borderRightWidth: 1, borderRightColor: T.line,
          transform: [{ translateX: x }], paddingTop: 58,
        }}
      >
        {/* brand */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          paddingHorizontal: 18, paddingBottom: 18,
        }}>
          <Image source={LOGO} style={{ width: 30, height: 30 }} />
          <View>
            <Text style={{
              color: T.ink, fontSize: 19, fontWeight: '900', letterSpacing: 0.3,
            }}>Paldexia</Text>
            {full && (
              <Text style={{ color: T.faint, fontSize: 10.5, marginTop: -1 }}>
                Palworld companion
              </Text>
            )}
          </View>
        </View>

        <Text style={{
          color: T.faint, fontSize: 10, fontWeight: '800', letterSpacing: 1.4,
          paddingHorizontal: 18, marginBottom: 6,
        }}>SECTIONS</Text>

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
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                // always the FULL title: the narrow panel abbreviates the
                // visible word ("Items" for "Items & Tech"), and a screen
                // reader should not be stuck with the abbreviation
                accessibilityLabel={d.soon ? `${d.title}, coming soon` : d.title}
                style={({ pressed }) => [{
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  marginHorizontal: 10, marginBottom: 2, borderRadius: 12,
                  paddingVertical: 9, paddingHorizontal: 8,
                  backgroundColor: on ? T.accentSoft : pressed ? T.surface : 'transparent',
                }]}
              >
                <View style={{
                  width: 34, height: 34, borderRadius: 10,
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: on ? 'transparent' : T.surface,
                  borderWidth: 1, borderColor: on ? T.accent : T.line,
                }}>
                  <Icon name={d.icon} size={19}
                    color={on ? T.accentInk : d.soon ? T.faint : T.muted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{
                    color: on ? T.accentInk : d.soon ? T.muted : T.ink,
                    fontWeight: on ? '800' : '700', fontSize: 14.5,
                  }} numberOfLines={1}>{full ? d.title : (d.short ?? d.title)}</Text>
                  {full && d.blurb && (
                    <Text style={{ color: T.faint, fontSize: 10.5, marginTop: 1 }}
                      numberOfLines={1}>{d.blurb}</Text>
                  )}
                </View>
                {d.soon && (
                  <Text style={{
                    color: T.goldInk, fontSize: 8, fontWeight: '800',
                    letterSpacing: 0.8, borderWidth: 1, borderColor: T.line,
                    borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2,
                    overflow: 'hidden',
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
          // a dot, a name and a cog say "settings" to the eye and nothing
          // at all to a screen reader
          accessibilityRole="button"
          accessibilityLabel={`Settings. Current world: ${active.name}`}
          style={{
            borderTopWidth: 1, borderTopColor: T.line,
            paddingVertical: 13, paddingHorizontal: 18,
            flexDirection: 'row', alignItems: 'center', gap: 9,
          }}
        >
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: T.ok }} />
          <Text style={{ color: T.muted, fontWeight: '700', fontSize: 12.5, flex: 1 }}
            numberOfLines={1}>{active.name}</Text>
          <Icon name="cog-outline" size={15} color={T.faint} />
        </Pressable>
      </Animated.View>
    </View>
  );
}
