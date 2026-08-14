/** More — the hub: profiles, Reference, every future section, about.
 * The HoYoLAB/Dododex pattern: daily tools live on the tab bar, everything
 * else is one tap away in a designed grid — no hamburger hiding features. */
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { T } from '../theme';
import { Badge, Btn, Card, s } from '../ui/kit';
import {
  createProfile, deleteProfile, getActiveProfile, getProfiles, switchProfile,
  useAppVersion,
} from '../store';
import { ReferenceScreen } from './ReferenceScreen';
import { ComingSoonScreen } from './ComingSoonScreen';

interface Entry {
  id: string;
  title: string;
  glyph: string;
  soon?: boolean;
  blurb: string;
  planned?: string[];
}

const ENTRIES: Entry[] = [
  {
    id: 'ref', title: 'Reference', glyph: 'ℹ️',
    blurb: 'How breeding works — with receipts.',
  },
  {
    id: 'map', title: 'Map & Spawns', glyph: '🗺️', soon: true,
    blurb: 'Find every pal — tied to your collection.',
    planned: ['Spawn areas per species', 'Alpha + dungeon markers', 'Egg locations', 'Filter by missing pals'],
  },
  {
    id: 'items', title: 'Items & Tech', glyph: '⚙️', soon: true,
    blurb: 'Items, recipes and the tech tree.',
    planned: ['Item database with sources', 'Tech tree', 'Cake ingredient planner tied to your plan'],
  },
  {
    id: 'base', title: 'Base & Builds', glyph: '🏠', soon: true,
    blurb: 'Worker planning from your own pals.',
    planned: ['Best-worker suggestions', 'Production chains', 'Stage checklists'],
  },
  {
    id: 'bosses', title: 'Bosses & Raids', glyph: '⚔️', soon: true,
    blurb: 'Counters and teams from your Paldex.',
    planned: ['Boss guides', 'Team builder from owned pals', 'Raid prep checklists'],
  },
  {
    id: 'import', title: 'Save Import', glyph: '📥', soon: true,
    blurb: 'Your save in, collection auto-filled.',
    planned: ['Read-only save import', 'Automatic collection sync', 'Passive/IV import'],
  },
];

export function MoreScreen() {
  useAppVersion();
  const [open, setOpen] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [newName, setNewName] = useState('');
  const active = getActiveProfile();

  if (open) {
    const e = ENTRIES.find((x) => x.id === open)!;
    return (
      <View style={{ flex: 1 }}>
        <Pressable
          onPress={() => setOpen(null)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 14 }}
        >
          <Text style={{ color: T.accentInk, fontSize: 16, fontWeight: '800' }}>‹ More</Text>
        </Pressable>
        {e.id === 'ref'
          ? <ReferenceScreen />
          : <ComingSoonScreen title={e.title} glyph={e.glyph} blurb={e.blurb}
              planned={e.planned ?? []} />}
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={{ marginBottom: 14 }}>
        <Text style={s.h1}>More</Text>
      </View>

      {/* save profiles — one per world/save */}
      <Card style={{ gap: 8 }}>
        <Text style={s.h3}>Save profile</Text>
        <Text style={[s.body, { fontSize: 12.5 }]}>
          A separate collection + plan per world or save.
        </Text>
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
                backgroundColor: on ? T.accentSoft : T.surface2,
                borderWidth: 1, borderColor: on ? T.accent : T.line,
                borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12,
              }}
            >
              <View style={{
                width: 8, height: 8, borderRadius: 4,
                backgroundColor: on ? T.ok : T.line2,
              }} />
              <Text style={{
                color: on ? T.accentInk : T.muted, fontWeight: '700', fontSize: 13.5, flex: 1,
              }}>{p.name}</Text>
              {p.id !== 'default' && (
                <Text style={{ color: T.faint, fontSize: 9 }}>hold to delete</Text>
              )}
            </Pressable>
          );
        })}
        <Btn small label="+ New profile" onPress={() => setNaming(true)} />
      </Card>

      {/* the hub grid */}
      <View style={{
        flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14,
      }}>
        {ENTRIES.map((e) => (
          <Pressable
            key={e.id}
            onPress={() => {
              void Haptics.selectionAsync();
              setOpen(e.id);
            }}
            style={({ pressed }) => [{
              width: '48%', flexGrow: 1, backgroundColor: T.surface,
              borderWidth: 1, borderColor: pressed ? T.accent : T.line,
              borderRadius: T.r, padding: 14, gap: 6,
            }]}
          >
            <View style={[s.row, { justifyContent: 'space-between' }]}>
              <Text style={{ fontSize: 26, opacity: e.soon ? 0.6 : 1 }}>{e.glyph}</Text>
              {e.soon && <Badge kind="gold">SOON</Badge>}
            </View>
            <Text style={{
              color: e.soon ? T.muted : T.ink, fontWeight: '800', fontSize: 14.5,
            }}>{e.title}</Text>
            <Text style={{ color: T.faint, fontSize: 11.5, lineHeight: 15 }} numberOfLines={2}>
              {e.blurb}
            </Text>
          </Pressable>
        ))}
      </View>

      <Card style={{ marginTop: 14 }}>
        <Text style={s.h3}>About Palforge</Text>
        <Text style={[s.body, { marginTop: 4 }]}>
          The Palworld companion with receipts: every breeding result is verified
          against all 44,851 outcomes computed from the game files — zero
          mismatches. No ads, no accounts, no tracking; your data lives on this
          device. Fan project, not affiliated with Pocketpair.
        </Text>
      </Card>

      <Modal visible={naming} transparent animationType="fade"
        onRequestClose={() => setNaming(false)}>
        <View style={{
          flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
          alignItems: 'center', justifyContent: 'center', padding: 28,
        }}>
          <Card style={{ width: '100%' }}>
            <Text style={s.h2}>New save profile</Text>
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
    </ScrollView>
  );
}
