/** Paldex — the encyclopedia AND your collection, one screen.
 * Ownership lives here: ♂/♀ toggles on every row, import, stats — the
 * separate Box tab was folded in (two near-identical lists were confusing). */
import React, { memo, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { T } from '../theme';
import {
  Badge, Btn, Card, ElementChips, GenderToggles, PageHead, PalIcon, SearchInput,
  WorkChips, s,
} from '../ui/kit';
import {
  clearBox, engine, getBox, hasGender, importNames, ownedAny,
  pairReadyCount, palNumberSort, pals, useAppVersion,
  type OwnedGenders,
} from '../store';
import { closure } from '../engine/planner';
import { PalDetail } from '../ui/PalDetail';

const ELEMENTS = ['Neutral', 'Fire', 'Water', 'Grass', 'Electric', 'Ice', 'Ground', 'Dark', 'Dragon'];

const Row = memo(function Row({ name, onOpen }: { name: string; onOpen: (n: string) => void }) {
  const p = pals[name];
  const owned = ownedAny(name);
  return (
    <Pressable
      onPress={() => onOpen(name)}
      style={({ pressed }) => [{
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: T.surface, borderColor: T.line, borderWidth: 1,
        borderRadius: 12, padding: 8, marginBottom: 6, opacity: owned ? 1 : 0.65,
      }, pressed && { borderColor: T.accent }]}
    >
      <PalIcon name={name} size={40} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: T.ink, fontWeight: '800', fontSize: 14 }}>
          {name} <Text style={{ color: T.faint, fontSize: 10.5 }}>#{p.number || '—'}</Text>
        </Text>
        <View style={[s.wrap, { marginTop: 2 }]}>
          <ElementChips name={name} />
          <WorkChips name={name} top={1} />
        </View>
      </View>
      <GenderToggles name={name} size={28} />
    </Pressable>
  );
});

/* ---------------- import sheet (from the old Box tab) ---------------- */

function parseImport(text: string): { entries: [string, OwnedGenders][]; unknown: string[] } {
  const lower = new Map(Object.keys(pals).map((n) => [n.toLowerCase(), n]));
  const byName = new Map<string, OwnedGenders>();
  const unknown: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/^[-*•]\s*/, '');
    if (!line || line.startsWith('#')) continue;
    const m = /^(.*?)(?:\s*[·|,]?\s*(♂|♀|\bm\b|\bf\b))?$/i.exec(line);
    const name = lower.get((m?.[1] ?? line).trim().toLowerCase());
    if (!name) { unknown.push(line); continue; }
    const g = (m?.[2] ?? '').toLowerCase();
    const add: OwnedGenders = g === '♂' || g === 'm' ? { m: true, f: false }
      : g === '♀' || g === 'f' ? { m: false, f: true }
      : { m: true, f: true };
    const prev = byName.get(name);
    byName.set(name, prev ? { m: prev.m || add.m, f: prev.f || add.f } : add);
  }
  return { entries: [...byName], unknown };
}

function ImportSheet({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('');
  const parsed = useMemo(() => parseImport(text), [text]);
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: T.bg2, padding: 18 }}>
        <View style={[s.row, { marginBottom: 8 }]}>
          <Text style={[s.h2, { flex: 1 }]}>Import a pal list</Text>
          <Btn label="Close" onPress={onClose} small />
        </View>
        <Text style={s.body}>
          Paste names, one per line (optional ♂/♀ suffix). Nothing is applied until
          you confirm.
        </Text>
        <TextInput
          multiline value={text} onChangeText={setText}
          placeholder={'Anubis\nKatress ♀\nWixen ♂'}
          placeholderTextColor={T.faint}
          autoCorrect={false} autoCapitalize="none"
          style={[s.search, { marginTop: 10, height: 170, textAlignVertical: 'top' }]}
        />
        <View style={[s.wrap, { marginTop: 10 }]}>
          <Badge kind={parsed.entries.length ? 'ok' : 'plain'}>
            {parsed.entries.length} recognised
          </Badge>
          {parsed.unknown.length > 0 && (
            <Badge kind="warn">{parsed.unknown.length} not recognised</Badge>
          )}
        </View>
        <View style={{ marginTop: 12 }}>
          <Btn primary disabled={!parsed.entries.length}
            label={`Add ${parsed.entries.length || ''} pals`}
            onPress={() => {
              importNames(parsed.entries, false);
              onClose();
            }} />
        </View>
      </View>
    </Modal>
  );
}

export function PaldexScreen() {
  useAppVersion();
  const [q, setQ] = useState('');
  const [el, setEl] = useState('');
  const [own, setOwn] = useState<'all' | 'owned' | 'missing' | 'pairready' | 'onegender'>('all');
  const [open, setOpen] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'none' | 'import' | 'clear'>('none');

  const box = getBox();
  const ownedNames = Object.keys(box);
  const reachable = useMemo(
    () => (ownedNames.length ? closure(engine, ownedNames).size : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [box],
  );

  const names = useMemo(() => {
    let list = Object.keys(pals).sort(palNumberSort);
    if (q) list = list.filter((n) => n.toLowerCase().includes(q.toLowerCase()));
    if (el) list = list.filter((n) => pals[n].elements.includes(el));
    switch (own) {
      case 'owned': return list.filter(ownedAny);
      case 'missing': return list.filter((n) => !ownedAny(n));
      case 'pairready': return list.filter((n) => hasGender(n, 'm') && hasGender(n, 'f'));
      case 'onegender':
        return list.filter((n) => ownedAny(n) && !(hasGender(n, 'm') && hasGender(n, 'f')));
      default: return list;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, el, own, box]);

  const chip = (on: boolean) => ({
    color: on ? T.accentInk : T.muted,
    backgroundColor: on ? T.accentSoft : T.surface2,
    borderRadius: 16, paddingHorizontal: 11, paddingVertical: 6,
    fontSize: 12, fontWeight: '700' as const, overflow: 'hidden' as const,
  });

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <PageHead title="Paldex"
        sub={`All ${Object.keys(pals).length} species — and your collection. Tap ♂/♀ for what you own; tap a pal for stats and recipes.`} />
      <View style={[s.wrap, { marginBottom: 8 }]}>
        <View style={s.tile}>
          <Text style={s.tileBig}>{ownedNames.length}</Text>
          <Text style={s.tileLabel}>OWNED</Text>
        </View>
        <View style={s.tile}>
          <Text style={s.tileBig}>{pairReadyCount()}</Text>
          <Text style={s.tileLabel}>WITH ♂+♀</Text>
        </View>
        <View style={s.tile}>
          <Text style={s.tileBig}>{reachable}<Text style={{ fontSize: 12, color: T.muted }}>/{Object.keys(pals).length}</Text></Text>
          <Text style={s.tileLabel}>REACHABLE</Text>
        </View>
        <Btn small label="Import…" onPress={() => setSheet('import')} />
        <Btn small danger disabled={!ownedNames.length} label="Clear…"
          onPress={() => setSheet('clear')} />
      </View>
      <SearchInput value={q} onChange={setQ} placeholder="Search pals…" />
      <View style={{ height: 40, marginTop: 8 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 6, alignItems: 'center', paddingRight: 16 }}>
        {([['all', 'All'], ['owned', 'Owned'], ['missing', 'Missing'],
          ['pairready', '♂+♀'], ['onegender', 'One gender']] as const).map(([id, label]) => (
          <Text key={id} onPress={() => setOwn(id)} style={chip(own === id)}>{label}</Text>
        ))}
        <Text style={{ color: T.line2 }}>|</Text>
        {ELEMENTS.map((e) => (
          <Text key={e} onPress={() => setEl(el === e ? '' : e)} style={chip(el === e)}>{e}</Text>
        ))}
      </ScrollView>
      </View>
      <FlatList
        style={{ marginTop: 4 }}
        keyboardShouldPersistTaps="handled"
        data={names}
        keyExtractor={(n) => n}
        initialNumToRender={12}
        windowSize={7}
        renderItem={({ item }) => <Row name={item} onOpen={setOpen} />}
        ListEmptyComponent={<Text style={[s.body, { textAlign: 'center', marginTop: 30 }]}>Nothing matches those filters.</Text>}
      />
      {open && <PalDetail name={open} onClose={() => setOpen(null)} />}
      {sheet === 'import' && <ImportSheet onClose={() => setSheet('none')} />}
      {sheet === 'clear' && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setSheet('none')}>
          <View style={{
            flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
            alignItems: 'center', justifyContent: 'center', padding: 24,
          }}>
            <Card style={{ borderColor: T.bad, width: '100%' }}>
              <Text style={s.h2}>Clear the whole collection?</Text>
              <Text style={[s.body, { marginTop: 6 }]}>
                Removes all {ownedNames.length} species on this device. Plan check-offs
                are kept.
              </Text>
              <View style={[s.wrap, { marginTop: 14 }]}>
                <Btn danger label={`Yes, clear ${ownedNames.length}`}
                  onPress={() => { clearBox(); setSheet('none'); }} />
                <Btn label="Keep my collection" onPress={() => setSheet('none')} />
              </View>
            </Card>
          </View>
        </Modal>
      )}
    </View>
  );
}
