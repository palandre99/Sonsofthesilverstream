/** The satisfying bits: animated tick + rarity-tiered hatch bursts.
 *
 * Tick states: none → partial (amber, shows the gender glyph you have) →
 * full (green ✓). Completing a step fires a burst over the child icon —
 * the rarer the pal, the bigger the moment:
 *   Common     1 teal ring
 *   Rare       2 teal rings
 *   Epic       3 rings, gold-tinted
 *   Legendary  4 gold rings + flying sparks
 * Pure RN Animated, native driver, respects nothing heavier than springs.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';
import { T } from '../theme';

export type TickState = 'none' | 'partial' | 'full';

export function AnimatedCheck({ state, glyph, onPress, label }: {
  state: TickState;
  /** shown when partial: the gender you already have (♂ or ♀) */
  glyph?: string;
  onPress: () => void;
  /** screen-reader name for this step */
  label?: string;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const prev = useRef(state);

  useEffect(() => {
    if (prev.current !== state) {
      prev.current = state;
      if (state !== 'none') {
        scale.setValue(0.6);
        Animated.spring(scale, {
          toValue: 1, useNativeDriver: true, bounciness: 14, speed: 24,
        }).start();
      }
    }
  }, [state, scale]);

  const bg = state === 'full' ? T.ok : state === 'partial' ? T.warn : T.surface2;
  const border = state === 'full' ? T.ok : state === 'partial' ? T.warn : T.line2;

  return (
    <Pressable onPress={onPress} hitSlop={8}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: state === 'full' ? true : state === 'partial' ? 'mixed' : false }}
      accessibilityLabel={label ?? 'step done'}>
      <Animated.View style={{
        width: 27, height: 27, borderRadius: 9, borderWidth: 2,
        borderColor: border, backgroundColor: bg,
        alignItems: 'center', justifyContent: 'center',
        transform: [{ scale }],
      }}>
        <Text style={{
          color: state === 'none' ? 'transparent' : '#fff',
          fontWeight: '800', fontSize: state === 'partial' ? 14 : 15, lineHeight: 18,
        }}>
          {state === 'partial' ? (glyph ?? '½') : '✓'}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

export type Rarity = 'Common' | 'Rare' | 'Epic' | 'Legendary';

const TIER: Record<Rarity, { rings: number; color: string; sparks: number }> = {
  Common: { rings: 1, color: T.accent, sparks: 0 },
  Rare: { rings: 2, color: T.accent, sparks: 0 },
  Epic: { rings: 3, color: T.gold, sparks: 0 },
  Legendary: { rings: 4, color: T.gold, sparks: 6 },
};
const TIER_ORDER: Rarity[] = ['Common', 'Rare', 'Epic', 'Legendary'];

/** The hero icon pops when its burst fires — wrap it in this. */
export function HeroPop({ burstKey, children }: {
  burstKey: number; children: React.ReactNode;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const prev = useRef(burstKey);
  useEffect(() => {
    if (burstKey && prev.current !== burstKey) {
      prev.current = burstKey;
      scale.setValue(0.8);
      Animated.spring(scale, {
        toValue: 1, useNativeDriver: true, bounciness: 16, speed: 20,
      }).start();
    }
  }, [burstKey, scale]);
  return <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>;
}

/** Mount with a changing `burstKey` to fire; renders over its parent.
 * `boost` bumps the moment one tier — finishing a GOAL always feels
 * bigger than an intermediate step. */
export function HatchBurst({ burstKey, rarity, boost }: {
  burstKey: number; rarity: Rarity; boost?: boolean;
}) {
  const idx = Math.max(0, TIER_ORDER.indexOf(rarity));
  const tier = TIER[TIER_ORDER[Math.min(TIER_ORDER.length - 1, idx + (boost ? 1 : 0))]];
  const rings = useRef(
    Array.from({ length: 4 }, () => new Animated.Value(0)),
  ).current;
  const sparks = useRef(
    Array.from({ length: 6 }, () => new Animated.Value(0)),
  ).current;

  useEffect(() => {
    if (!burstKey) return;
    const anims = rings.slice(0, tier.rings).map((v, i) => {
      v.setValue(0);
      return Animated.timing(v, {
        toValue: 1, duration: 620 + i * 130, delay: i * 90,
        easing: Easing.out(Easing.cubic), useNativeDriver: true,
      });
    });
    const sparkAnims = sparks.slice(0, tier.sparks).map((v, i) => {
      v.setValue(0);
      return Animated.timing(v, {
        toValue: 1, duration: 700, delay: 60 + i * 40,
        easing: Easing.out(Easing.quad), useNativeDriver: true,
      });
    });
    Animated.parallel([...anims, ...sparkAnims]).start();
  }, [burstKey, tier.rings, tier.sparks, rings, sparks]);

  if (!burstKey) return null;

  return (
    <View pointerEvents="none" style={{
      position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center',
    }}>
      {rings.slice(0, tier.rings).map((v, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute', width: 46, height: 46, borderRadius: 23,
            borderWidth: 2.5 - i * 0.4, borderColor: tier.color,
            opacity: v.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.9, 0] }),
            transform: [{
              scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.7, 2.1 + i * 0.5] }),
            }],
          }}
        />
      ))}
      {sparks.slice(0, tier.sparks).map((v, i) => {
        const angle = (i / tier.sparks) * Math.PI * 2;
        return (
          <Animated.Text
            key={`s${i}`}
            style={{
              position: 'absolute', color: T.goldInk, fontSize: 14,
              opacity: v.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0] }),
              transform: [
                { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(angle) * 56] }) },
                { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(angle) * 56] }) },
                { scale: v.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.4, 1.15, 0.6] }) },
                { rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] }) },
              ],
            }}
          >✦</Animated.Text>
        );
      })}
    </View>
  );
}
