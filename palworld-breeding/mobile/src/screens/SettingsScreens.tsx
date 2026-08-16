/** Settings domain: Profiles (live) and About (live).
 * Worlds/Look are coming-soon tabs defined in nav/domains.ts. */
import React, { useState , useEffect } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { T } from '../theme';
import { Btn, Card, PageHead, s } from '../ui/kit';
import { Icon } from '../ui/Icon';
import * as Updates from 'expo-updates';
import { Image } from 'react-native';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const LOGO = require('../../assets/splash-icon.png');
import {
  createProfile, deleteProfile, getActiveProfile, getProfiles, profileStats,
  renameProfile, setProfileLevel, switchProfile, useAppVersion,
  type ProfileStats,
} from '../store';

export function ProfilesScreen() {
  const version = useAppVersion();
  const [stats, setStats] = useState<Record<string, ProfileStats>>({});
  useEffect(() => {
    let dead = false;
    void Promise.all(
      getProfiles().map(async (p) => [p.id, await profileStats(p.id)] as const),
    ).then((rows) => {
      if (!dead) setStats(Object.fromEntries(rows));
    });
    return () => {
      dead = true;
    };
  }, [version]);
  const [naming, setNaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [managing, setManaging] = useState<{ id: string; name: string } | null>(null);
  const [editName, setEditName] = useState('');
  const [editLevel, setEditLevel] = useState('');
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
                <View style={{ flex: 1 }}>
                  <Text style={{
                    color: on ? T.accentInk : T.muted, fontWeight: '700', fontSize: 14,
                  }}>{p.name}</Text>
                  {stats[p.id] && (
                    <Text style={{ color: T.faint, fontSize: 11 }}>
                      {p.playerLevel != null ? `Lv ${p.playerLevel} · ` : ''}
                      {stats[p.id].owned
                        ? `${stats[p.id].owned} pals`
                        : 'empty'}
                      {stats[p.id].planTotal > 0
                        ? ` · plan ${stats[p.id].planDone}/${stats[p.id].planTotal}`
                        : ''}
                    </Text>
                  )}
                </View>
              </Pressable>
              <Pressable
                onPress={() => {
                  void Haptics.selectionAsync();
                  setEditName(p.name);
                  setEditLevel(p.playerLevel != null ? String(p.playerLevel) : '');
                  setArmDelete(false);
                  setManaging({ id: p.id, name: p.name });
                }}
                hitSlop={8}
                accessibilityRole="button"
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
              <Text style={[s.body, { marginTop: 12, fontSize: 12.5 }]}>
                Your level in this world — suggestions only recommend catches
                you can actually make. Leave empty and the app reads it from
                your pals instead.
              </Text>
              <TextInput
                value={editLevel}
                onChangeText={(t) => setEditLevel(t.replace(/[^0-9]/g, ''))}
                placeholder="Player level (1–100)"
                placeholderTextColor={T.faint}
                keyboardType="number-pad"
                maxLength={3}
                style={[s.search, { marginTop: 6 }]}
              />
              <View style={[s.wrap, { marginTop: 12 }]}>
                <Btn primary label="Save"
                  onPress={() => {
                    void renameProfile(managing.id, editName);
                    void setProfileLevel(managing.id,
                      editLevel ? Number(editLevel) : undefined);
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
        <Image source={LOGO} style={{ width: 64, height: 64 }} />
        <Text style={[s.h1, { marginTop: 8 }]}>Palforge</Text>
        <Text style={[s.body, { marginTop: 2 }]}>The Palworld companion with receipts</Text>
      </View>
      <Card style={{ marginBottom: 10 }}>
        <Text style={s.h3}>This version</Text>
        <Text style={[s.body, { marginTop: 4 }]}>
          {Updates.isEmbeddedLaunch
            ? 'Running the version that shipped with the install — an update will land shortly after opening.'
            : `Update ${Updates.updateId?.slice(0, 8) ?? '?'} · ${Updates.createdAt ? new Date(Updates.createdAt).toLocaleString() : ''}`}
        </Text>
        <Text style={[s.body, { fontSize: 12, color: T.faint, marginTop: 2 }]}>
          Channel {Updates.channel || 'dev'} · runtime {Updates.runtimeVersion || '—'}
        </Text>
      </Card>
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
