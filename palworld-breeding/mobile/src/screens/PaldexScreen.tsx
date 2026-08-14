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
  breeding, clearBox, engine, getBox, hasGender, importNames, ownedAny,
  pairReadyCount, palNumberSort, pals, selfOnly, useAppVersion, workLabel,
  type OwnedGenders,
} from '../store';
import { closure } from '../engine/planner';

const ELEMENTS = ['Neutral', 'Fire', 'Water', 'Grass', 'Electric', 'Ice', 'Ground', 'Dark', 'Dragon'];

function StatBar({ label, v }: { label: string; v: number | null }) {
  return (
    <View style={[s.row, { gap: 8 }]}>
      <Text style={{ color: T.muted, width: 34, fontSize: 11, fontWeight: '800' }}>{label}</Text>
      <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: T.surface2 }}>
        <View style={{
          width: `${Math.min(100, ((v ?? 0) / 150) * 100)}%`,
          height: '100%', borderRadius: 4, backgroundColor: T.accent,
        }} />
      </View>
      <Text style={{ color: T.ink, width: 32, fontSize: 12, textAlign: 'right' }}>{v ?? '—'}</Text>
    </View>
  );
}

function Detail({ name, onClose }: { name: string; onClose: () => void }) {
  useAppVersion();
  const p = pals[name];
  if (!p) return null;
  const asChild = breeding.unique_combos.filter((c) => c.child === name);
  const asParent = breeding.unique_combos.filter((c) => c.parents.includes(name));
  const gendered = breeding.gendered_combos.filter(
    (g) => g.child === name || g.mother === name || g.father === name,
  );
  const inPool = !breeding.excluded_from_generic_pool.includes(name);

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView style={{ flex: 1, backgroundColor: T.bg2 }}
        contentContainerStyle={{ padding: 18, paddingBottom: 50 }}>
        <View style={[s.row, { gap: 14 }]}>
          <PalIcon name={name} size={72} />
          <View style={{ flex: 1 }}>
            <Text style={s.h1}>{name}</Text>
            <View style={[s.wrap, { marginTop: 5 }]}>
              <Badge kind="plain">#{p.number || '—'}</Badge>
              <ElementChips name={name} />
              {p.nocturnal ? <Badge kind="plain">nocturnal</Badge> : null}
            </View>
          </View>
          <Btn label="✕" onPress={onClose} small />
        </View>

        <Card style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ color: T.ink, fontWeight: '700', flex: 1 }}>In my box</Text>
          <GenderToggles name={name} />
        </Card>

        <Card style={{ marginTop: 10, gap: 6 }}>
          <Text style={s.h3}>Stats</Text>
          <StatBar label="HP" v={p.hp} />
          <StatBar label="ATK" v={p.atk} />
          <StatBar label="DEF" v={p.def} />
        </Card>

        {Object.keys(p.work ?? {}).length > 0 && (
          <Card style={{ marginTop: 10 }}>
            <Text style={s.h3}>Work suitability</Text>
            <View style={[s.wrap, { marginTop: 8 }]}>
              {Object.entries(p.work).sort((x, y) => y[1] - x[1]).map(([job, lvl]) => (
                <View key={job} style={[s.chip, { backgroundColor: T.surface2 }]}>
                  <Text style={[s.chipText, { color: T.ink }]}>
                    {workLabel(job)} <Text style={{ color: T.accentInk }}>{lvl}</Text>
                  </Text>
                </View>
              ))}
            </View>
          </Card>
        )}

        {p.partner_skill && (
          <Card style={{ marginTop: 10 }}>
            <Text style={s.h3}>Partner skill — {p.partner_skill}</Text>
            <Text style={[s.body, { marginTop: 4 }]}>{p.partner_effect}</Text>
          </Card>
        )}

        <Card style={{ marginTop: 10, gap: 8 }}>
          <Text style={s.h3}>How to breed it</Text>
          {selfOnly.has(name) ? (
            <View style={[s.wrap]}>
              <Badge kind="bad">self-breed-only</Badge>
              <Text style={s.body}>{name} + {name} = {name}</Text>
            </View>
          ) : (
            <>
              {asChild.map((c) => (
                <View key={c.parents.join()} style={[s.row, { gap: 6, flexWrap: 'wrap' }]}>
                  <Badge kind="unique">unique</Badge>
                  <PalIcon name={c.parents[0]} size={24} />
                  <Text style={s.body}>{c.parents[0]} +</Text>
                  <PalIcon name={c.parents[1]} size={24} />
                  <Text style={s.body}>{c.parents[1]} = {name}</Text>
                </View>
              ))}
              {gendered.filter((g) => g.child === name).map((g) => (
                <View key={g.mother} style={[s.row, { gap: 6, flexWrap: 'wrap' }]}>
                  <Badge kind="warn">♀♂</Badge>
                  <PalIcon name={g.mother} size={24} gender="f" />
                  <Text style={s.body}>{g.mother} +</Text>
                  <PalIcon name={g.father} size={24} gender="m" />
                  <Text style={s.body}>{g.father} = {name}</Text>
                </View>
              ))}
              {inPool && (
                <Text style={s.body}>
                  Generic pool · rank {engine.ranks.get(name)} — any pair whose rank target
                  lands on {engine.ranks.get(name)}. Use the Calculator's Child → parents.
                </Text>
              )}
            </>
          )}
        </Card>

        {(asParent.length > 0 || gendered.some((g) => g.child !== name)) && (
          <Card style={{ marginTop: 10, gap: 8 }}>
            <Text style={s.h3}>Special recipes as a parent</Text>
            {asParent.map((c) => {
              const other = c.parents[0] === name ? c.parents[1] : c.parents[0];
              return (
                <View key={c.child} style={[s.row, { gap: 6, flexWrap: 'wrap' }]}>
                  <Text style={s.body}>{name} +</Text>
                  <PalIcon name={other} size={24} />
                  <Text style={s.body}>{other} =</Text>
                  <PalIcon name={c.child} size={24} />
                  <Text style={s.body}>{c.child}</Text>
                </View>
              );
            })}
            {gendered.filter((g) => g.child !== name).map((g) => (
              <View key={g.child} style={[s.row, { gap: 6, flexWrap: 'wrap' }]}>
                <Badge kind="warn">♀♂</Badge>
                <PalIcon name={g.mother} size={24} gender="f" />
                <Text style={s.body}>{g.mother} +</Text>
                <PalIcon name={g.father} size={24} gender="m" />
                <Text style={s.body}>{g.father} = {g.child}</Text>
              </View>
            ))}
          </Card>
        )}

        <Card style={{ marginTop: 10 }}>
          <Text style={s.h3}>In the wild</Text>
          <View style={[s.wrap, { marginTop: 8 }]}>
            {p.wild
              ? p.regions.map((r) => <Badge key={r} kind="plain">{r}</Badge>)
              : <Badge kind="plain">no regular wild spawn</Badge>}
            {p.egg_types.map((e) => <Badge key={e} kind="plain">🥚 {e}</Badge>)}
          </View>
        </Card>
      </ScrollView>
    </Modal>
  );
}

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
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={{ marginTop: 8, flexGrow: 0 }} contentContainerStyle={{ gap: 6, alignItems: 'center' }}>
        {([['all', 'All'], ['owned', 'Owned'], ['missing', 'Missing'],
          ['pairready', '♂+♀'], ['onegender', 'One gender']] as const).map(([id, label]) => (
          <Text key={id} onPress={() => setOwn(id)} style={chip(own === id)}>{label}</Text>
        ))}
        <Text style={{ color: T.line2 }}>|</Text>
        {ELEMENTS.map((e) => (
          <Text key={e} onPress={() => setEl(el === e ? '' : e)} style={chip(el === e)}>{e}</Text>
        ))}
      </ScrollView>
      <FlatList
        style={{ marginTop: 8 }}
        keyboardShouldPersistTaps="handled"
        data={names}
        keyExtractor={(n) => n}
        initialNumToRender={12}
        windowSize={7}
        renderItem={({ item }) => <Row name={item} onOpen={setOpen} />}
        ListEmptyComponent={<Text style={[s.body, { textAlign: 'center', marginTop: 30 }]}>Nothing matches those filters.</Text>}
      />
      {open && <Detail name={open} onClose={() => setOpen(null)} />}
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
