/** Settings domain: Profiles (live) and About (live).
 * Worlds/Look are coming-soon tabs defined in nav/domains.ts. */
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { T } from '../theme';
import { Btn, Card, PageHead, s } from '../ui/kit';
import { Icon } from '../ui/Icon';
import {
  createProfile, deleteProfile, getActiveProfile, getProfiles, renameProfile,
  switchProfile, useAppVersion,
} from '../store';

export function ProfilesScreen() {
  useAppVersion();
  const [naming, setNaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [managing, setManaging] = useState<{ id: string; name: string } | null>(null);
  const [editName, setEditName] = useState('');
  const [armDelete, setArmDelete] = useState(false);
  const active = getActiveProfile();

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <PageHead title="Save profiles"
        sub="One profile per world or save — its own collection, plan and progress. World-save import lands in the Worlds tab." />
      <Card style={{ gap: 8 }}>
        {getProfiles().map((p) => {
          const on = p.id === active.id;
          return (
            <View
              key={p.id}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 8,
                backgroundColor: on ? T.accentSoft : T.surface2,
                borderWidth: 1, borderColor: on ? T.accent : T.line,
                borderRadius: 10, paddingVertical: 6, paddingHorizontal: 12,
              }}
            >
              <Pressable
                onPress={() => {
                  void Haptics.selectionAsync();
                  void switchProfile(p.id);
                }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, paddingVertical: 5 }}
              >
                <View style={{
                  width: 8, height: 8, borderRadius: 4,
                  backgroundColor: on ? T.ok : T.line2,
                }} />
                <Text style={{
                  color: on ? T.accentInk : T.muted, fontWeight: '700', fontSize: 14,
                }}>{p.name}</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  void Haptics.selectionAsync();
                  setEditName(p.name);
                  setArmDelete(false);
                  setManaging({ id: p.id, name: p.name });
                }}
                hitSlop={8}
                accessibilityLabel={`Manage ${p.name}`}
                style={({ pressed }) => [{
                  paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
                  backgroundColor: pressed ? T.surface : 'transparent',
                }]}
              >
                <Icon name="pencil-outline" size={17} color={T.muted} />
              </Pressable>
            </View>
          );
        })}
        <Btn small label="+ New profile" onPress={() => setNaming(true)} />
      </Card>

      {managing && (
        <Modal visible transparent animationType="fade"
          onRequestClose={() => setManaging(null)}>
          <View style={{
            flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
            alignItems: 'center', justifyContent: 'center', padding: 28,
          }}>
            <Card style={{ width: '100%' }}>
              <Text style={s.h2}>Edit profile</Text>
              <TextInput
                value={editName}
                onChangeText={setEditName}
                placeholder="Profile name"
                placeholderTextColor={T.faint}
                autoFocus
                style={[s.search, { marginTop: 12 }]}
              />
              <View style={[s.wrap, { marginTop: 12 }]}>
                <Btn primary label="Save name"
                  onPress={() => {
                    void renameProfile(managing.id, editName);
                    setManaging(null);
                  }} />
                <Btn label="Cancel" onPress={() => setManaging(null)} />
              </View>
              {getProfiles().length > 1 && (
                <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: T.line, paddingTop: 12 }}>
                  <Btn danger
                    label={armDelete
                      ? `Really delete "${managing.name}" and its data?`
                      : 'Delete this profile…'}
                    onPress={() => {
                      if (!armDelete) { setArmDelete(true); return; }
                      void deleteProfile(managing.id);
                      setManaging(null);
                    }} />
                </View>
              )}
            </Card>
          </View>
        </Modal>
      )}

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

export function AboutScreen() {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={{ alignItems: 'center', marginTop: 30, marginBottom: 18 }}>
        <Text style={{ fontSize: 52 }}>🔵</Text>
        <Text style={[s.h1, { marginTop: 8 }]}>Palforge</Text>
        <Text style={[s.body, { marginTop: 2 }]}>The Palworld companion with receipts</Text>
      </View>
      <Card>
        <Text style={s.h3}>Provably correct</Text>
        <Text style={[s.body, { marginTop: 4 }]}>
          Every breeding result is verified against all 44,851 outcomes computed
          from the game files — zero mismatches. Probabilities come from the
          game's own inheritance weights. Community-measured numbers are always
          labelled as such.
        </Text>
      </Card>
      <Card style={{ marginTop: 10 }}>
        <Text style={s.h3}>Private by design</Text>
        <Text style={[s.body, { marginTop: 4 }]}>
          No ads, no accounts, no tracking. Your collection and plans live on
          this device only.
        </Text>
      </Card>
      <Card style={{ marginTop: 10 }}>
        <Text style={s.h3}>Credits</Text>
        <Text style={[s.body, { marginTop: 4 }]}>
          Fan project — not affiliated with Pocketpair. Game data © Pocketpair.
          Data sources: paldb.cc via palworld-kb, palcalc (game-file oracle),
          PalDex icons (game dump).
        </Text>
      </Card>
    </ScrollView>
  );
}
