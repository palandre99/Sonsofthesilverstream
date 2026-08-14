/** My Box — ownership with gender detail, filters, import via paste. */
import React, { memo, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { T } from '../theme';
import {
  Badge, Btn, Card, ElementChips, GenderToggles, PageHead, PalIcon, SearchInput, s,
} from '../ui/kit';
import {
  clearBox, getBox, hasGender, importNames, ownedAny, pairReadyCount,
  palNumberSort, pals, useAppVersion, type OwnedGenders,
} from '../store';
import { closure } from '../engine/planner';
import { engine } from '../store';

type Filter = 'all' | 'owned' | 'missing' | 'pairready' | 'onegender';
const FILTERS: [Filter, string][] = [
  ['all', 'All'], ['owned', 'Owned'], ['missing', 'Missing'],
  ['pairready', '♂+♀'], ['onegender', 'One gender'],
];

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

const Row = memo(function Row({ name }: { name: string }) {
  const owned = ownedAny(name);
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: T.surface, borderColor: T.line, borderWidth: 1,
      borderRadius: 11, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 6,
      opacity: owned ? 1 : 0.6,
    }}>
      <PalIcon name={name} size={34} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: T.ink, fontWeight: '700', fontSize: 13.5 }}>{name}</Text>
        <View style={[s.wrap, { marginTop: 2 }]}>
          <ElementChips name={name} />
        </View>
      </View>
      <GenderToggles name={name} size={28} />
    </View>
  );
});

export function BoxScreen() {
  useAppVersion();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
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
    switch (filter) {
      case 'owned': return list.filter(ownedAny);
      case 'missing': return list.filter((n) => !ownedAny(n));
      case 'pairready': return list.filter((n) => hasGender(n, 'm') && hasGender(n, 'f'));
      case 'onegender':
        return list.filter((n) => ownedAny(n) && !(hasGender(n, 'm') && hasGender(n, 'f')));
      default: return list;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, filter, box]);

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <PageHead title="My Box"
        sub="Tap ♂ and ♀ for what you own — two females can't breed, so the planner only calls a pair ready when the genders work out." />
      <View style={[s.wrap, { marginBottom: 10 }]}>
        <View style={s.tile}>
          <Text style={s.tileBig}>{ownedNames.length}</Text>
          <Text style={s.tileLabel}>SPECIES</Text>
        </View>
        <View style={s.tile}>
          <Text style={s.tileBig}>{pairReadyCount()}</Text>
          <Text style={s.tileLabel}>WITH ♂+♀</Text>
        </View>
        <View style={s.tile}>
          <Text style={s.tileBig}>{reachable}<Text style={{ fontSize: 13, color: T.muted }}>/{Object.keys(pals).length}</Text></Text>
          <Text style={s.tileLabel}>REACHABLE</Text>
        </View>
      </View>
      <View style={[s.wrap, { marginBottom: 10 }]}>
        <Btn small label="Import…" onPress={() => setSheet('import')} />
        <Btn small danger disabled={!ownedNames.length} label="Clear…"
          onPress={() => setSheet('clear')} />
      </View>
      <SearchInput value={q} onChange={setQ} />
      <View style={[s.wrap, { marginVertical: 10 }]}>
        {FILTERS.map(([id, label]) => (
          <Text key={id}
            onPress={() => setFilter(id)}
            style={{
              color: filter === id ? T.accentInk : T.muted,
              backgroundColor: filter === id ? T.accentSoft : T.surface2,
              borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6,
              fontSize: 12.5, fontWeight: '700', overflow: 'hidden',
            }}>{label}</Text>
        ))}
      </View>
      <FlatList
        data={names}
        keyExtractor={(n) => n}
        initialNumToRender={12}
        windowSize={7}
        renderItem={({ item }) => <Row name={item} />}
        ListEmptyComponent={<Text style={[s.body, { textAlign: 'center', marginTop: 30 }]}>Nothing matches this filter.</Text>}
      />
      {sheet === 'import' && <ImportSheet onClose={() => setSheet('none')} />}
      {sheet === 'clear' && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setSheet('none')}>
          <View style={{
            flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
            alignItems: 'center', justifyContent: 'center', padding: 24,
          }}>
            <Card style={{ borderColor: T.bad, width: '100%' }}>
              <Text style={s.h2}>Clear the whole box?</Text>
              <Text style={[s.body, { marginTop: 6 }]}>
                Removes all {ownedNames.length} species on this device. Plan check-offs
                are kept.
              </Text>
              <View style={[s.wrap, { marginTop: 14 }]}>
                <Btn danger label={`Yes, clear ${ownedNames.length}`}
                  onPress={() => { clearBox(); setSheet('none'); }} />
                <Btn label="Keep my box" onPress={() => setSheet('none')} />
              </View>
            </Card>
          </View>
        </Modal>
      )}
    </View>
  );
}
