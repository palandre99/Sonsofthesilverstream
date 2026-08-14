/** The left panel: every section of the companion, swipe or tap to open,
 * swipe/tap-away to close. Profiles live at the bottom (Dododex pattern —
 * one profile per world/save). Pure RN Animated + PanResponder, no libs. */
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated, Dimensions, Modal, PanResponder, Pressable, ScrollView, Text,
  TextInput, View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { T } from '../theme';
import { Btn, Card, s } from './kit';
import {
  createProfile, deleteProfile, getActiveProfile, getProfiles, switchProfile,
  useAppVersion,
} from '../store';

export interface Section {
  id: string;
  title: string;
  glyph: string;
  group: 'Breeding' | 'Encyclopedia' | 'Coming soon';
  soon?: boolean;
}

export const SECTIONS: Section[] = [
  { id: 'calc', title: 'Calculator', glyph: '🧮', group: 'Breeding' },
  { id: 'plan', title: 'Route Planner', glyph: '🥚', group: 'Breeding' },
  { id: 'odds', title: 'Odds Lab', glyph: '🎲', group: 'Breeding' },
  { id: 'paldex', title: 'Paldex', glyph: '📖', group: 'Encyclopedia' },
  { id: 'ref', title: 'Reference', glyph: 'ℹ️', group: 'Encyclopedia' },
  { id: 'map', title: 'Map & Spawns', glyph: '🗺️', group: 'Coming soon', soon: true },
  { id: 'items', title: 'Items & Tech', glyph: '⚙️', group: 'Coming soon', soon: true },
  { id: 'base', title: 'Base & Builds', glyph: '🏠', group: 'Coming soon', soon: true },
  { id: 'bosses', title: 'Bosses & Raids', glyph: '⚔️', group: 'Coming soon', soon: true },
  { id: 'import', title: 'Save Import', glyph: '📥', group: 'Coming soon', soon: true },
];

const WIDTH = Math.min(300, Dimensions.get('window').width * 0.8);

export function Drawer({ open, section, onSelect, onClose }: {
  open: boolean;
  section: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  useAppVersion();
  const x = useRef(new Animated.Value(-WIDTH)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const [naming, setNaming] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    Animated.parallel([
      Animated.spring(x, {
        toValue: open ? 0 : -WIDTH,
        useNativeDriver: true,
        bounciness: 4,
        speed: 18,
      }),
      Animated.timing(fade, { toValue: open ? 1 : 0, duration: 180, useNativeDriver: true }),
    ]).start();
  }, [open, x, fade]);

  // drag the panel itself back closed
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => g.dx < -8 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderMove: (_e, g) => {
      x.setValue(Math.min(0, g.dx));
    },
    onPanResponderRelease: (_e, g) => {
      if (g.dx < -WIDTH * 0.3 || g.vx < -0.5) onClose();
      else {
        Animated.spring(x, { toValue: 0, useNativeDriver: true, bounciness: 4, speed: 18 }).start();
      }
    },
  })).current;

  const groups: Section['group'][] = ['Breeding', 'Encyclopedia', 'Coming soon'];
  const active = getActiveProfile();

  return (
    <View pointerEvents={open ? 'auto' : 'none'}
      style={{ position: 'absolute', inset: 0, zIndex: 40 }}>
      <Animated.View style={{ position: 'absolute', inset: 0, backgroundColor: '#000', opacity: fade.interpolate({ inputRange: [0, 1], outputRange: [0, 0.55] }) }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close menu" />
      </Animated.View>

      <Animated.View
        {...pan.panHandlers}
        style={{
          position: 'absolute', top: 0, bottom: 0, left: 0, width: WIDTH,
          backgroundColor: T.bg2, borderRightWidth: 1, borderRightColor: T.line,
          transform: [{ translateX: x }], paddingTop: 54,
        }}
      >
        <View style={[s.row, { paddingHorizontal: 18, marginBottom: 14, gap: 10 }]}>
          <Text style={{ fontSize: 24 }}>🔵</Text>
          <Text style={{ color: T.accentInk, fontSize: 21, fontWeight: '800' }}>Palforge</Text>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16 }}>
          {groups.map((g) => (
            <View key={g} style={{ marginBottom: 10 }}>
              <Text style={{
                color: T.faint, fontSize: 10.5, fontWeight: '800', letterSpacing: 1,
                textTransform: 'uppercase', paddingHorizontal: 18, marginBottom: 4,
              }}>{g}</Text>
              {SECTIONS.filter((sec) => sec.group === g).map((sec) => {
                const on = section === sec.id;
                return (
                  <Pressable
                    key={sec.id}
                    onPress={() => {
                      void Haptics.selectionAsync();
                      onSelect(sec.id);
                      onClose();
                    }}
                    style={({ pressed }) => [{
                      flexDirection: 'row', alignItems: 'center', gap: 12,
                      paddingVertical: 11, paddingHorizontal: 18,
                      backgroundColor: on ? T.accentSoft : pressed ? T.surface : 'transparent',
                      borderRightWidth: on ? 3 : 0, borderRightColor: T.accent,
                    }]}
                  >
                    <Text style={{ fontSize: 17, opacity: sec.soon ? 0.5 : 1 }}>{sec.glyph}</Text>
                    <Text style={{
                      color: on ? T.accentInk : sec.soon ? T.faint : T.ink,
                      fontWeight: '700', fontSize: 14.5, flex: 1,
                    }}>{sec.title}</Text>
                    {sec.soon && (
                      <Text style={{
                        color: T.goldInk, backgroundColor: T.goldSoft, fontSize: 8.5,
                        fontWeight: '800', borderRadius: 5, paddingHorizontal: 6,
                        paddingVertical: 2, overflow: 'hidden', letterSpacing: 0.5,
                      }}>SOON</Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </ScrollView>

        {/* profiles: one per world/save */}
        <View style={{ borderTopWidth: 1, borderTopColor: T.line, padding: 14, gap: 8 }}>
          <Text style={{
            color: T.faint, fontSize: 10.5, fontWeight: '800', letterSpacing: 1,
            textTransform: 'uppercase',
          }}>Save profile</Text>
          {getProfiles().map((p) => {
            const on = p.id === active.id;
            return (
              <Pressable
                key={p.id}
                onPress={() => {
                  void Haptics.selectionAsync();
                  void switchProfile(p.id);
                }}
                onLongPress={() => {
                  if (p.id !== 'default') void deleteProfile(p.id);
                }}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                  backgroundColor: on ? T.accentSoft : T.surface,
                  borderWidth: 1, borderColor: on ? T.accent : T.line,
                  borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12,
                }}
              >
                <Text style={{
                  width: 8, height: 8, borderRadius: 4, overflow: 'hidden',
                  backgroundColor: on ? T.ok : T.line2,
                }} />
                <Text style={{
                  color: on ? T.accentInk : T.muted, fontWeight: '700', fontSize: 13, flex: 1,
                }}>{p.name}</Text>
                {p.id !== 'default' && (
                  <Text style={{ color: T.faint, fontSize: 9 }}>hold to delete</Text>
                )}
              </Pressable>
            );
          })}
          <Btn small label="+ New profile" onPress={() => setNaming(true)} />
        </View>
      </Animated.View>

      <Modal visible={naming} transparent animationType="fade"
        onRequestClose={() => setNaming(false)}>
        <View style={{
          flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
          alignItems: 'center', justifyContent: 'center', padding: 28,
        }}>
          <Card style={{ width: '100%' }}>
            <Text style={s.h2}>New save profile</Text>
            <Text style={[s.body, { marginTop: 4 }]}>
              A separate collection + plan for another world or save.
            </Text>
            <TextInput
              value={newName}
              onChangeText={setNewName}
              placeholder="e.g. Hardcore world"
              placeholderTextColor={T.faint}
              autoFocus
              style={[s.search, { marginTop: 12 }]}
            />
            <View style={[s.wrap, { marginTop: 12 }]}>
              <Btn primary label="Create"
                onPress={() => {
                  void createProfile(newName);
                  setNewName('');
                  setNaming(false);
                }} />
              <Btn label="Cancel" onPress={() => { setNewName(''); setNaming(false); }} />
            </View>
          </Card>
        </View>
      </Modal>
    </View>
  );
}
