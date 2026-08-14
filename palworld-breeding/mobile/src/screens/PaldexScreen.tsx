/** Paldex — all species, search + filters, detail sheet with recipes. */
import React, { memo, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { T } from '../theme';
import {
  Badge, Btn, Card, ElementChips, GenderToggles, PageHead, PalIcon, SearchInput,
  WorkChips, s,
} from '../ui/kit';
import {
  breeding, engine, hasGender, ownedAny, palNumberSort, pals, selfOnly,
  topWork, useAppVersion, workLabel,
} from '../store';

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
  const full = hasGender(name, 'm') && hasGender(name, 'f');
  return (
    <Pressable
      onPress={() => onOpen(name)}
      style={({ pressed }) => [{
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: T.surface, borderColor: T.line, borderWidth: 1,
        borderRadius: 12, padding: 9, marginBottom: 7,
      }, pressed && { borderColor: T.accent }]}
    >
      <PalIcon name={name} size={42} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: T.ink, fontWeight: '800', fontSize: 14.5 }}>{name}</Text>
        <View style={[s.wrap, { marginTop: 3 }]}>
          <ElementChips name={name} />
          <WorkChips name={name} top={2} />
        </View>
      </View>
      <Text style={{ color: T.faint, fontSize: 11 }}>#{p.number || '—'}</Text>
      {owned && (
        <View style={{
          width: 10, height: 10, borderRadius: 5,
          backgroundColor: full ? T.ok : T.warn,
        }} />
      )}
    </Pressable>
  );
});

export function PaldexScreen() {
  useAppVersion();
  const [q, setQ] = useState('');
  const [el, setEl] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const names = useMemo(() => {
    let list = Object.keys(pals).sort(palNumberSort);
    if (q) list = list.filter((n) => n.toLowerCase().includes(q.toLowerCase()));
    if (el) list = list.filter((n) => pals[n].elements.includes(el));
    return list;
  }, [q, el]);

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <PageHead title="Paldex"
        sub={`All ${Object.keys(pals).length} species with 1.0 stats and every breeding recipe.`} />
      <SearchInput value={q} onChange={setQ} placeholder="Search pals…" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={{ marginVertical: 10, flexGrow: 0 }} contentContainerStyle={{ gap: 6 }}>
        <Text onPress={() => setEl('')}
          style={{
            color: el === '' ? T.accentInk : T.muted,
            backgroundColor: el === '' ? T.accentSoft : T.surface2,
            borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6,
            fontSize: 12.5, fontWeight: '700', overflow: 'hidden',
          }}>All</Text>
        {ELEMENTS.map((e) => (
          <Text key={e} onPress={() => setEl(el === e ? '' : e)}
            style={{
              color: el === e ? T.accentInk : T.muted,
              backgroundColor: el === e ? T.accentSoft : T.surface2,
              borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6,
              fontSize: 12.5, fontWeight: '700', overflow: 'hidden',
            }}>{e}</Text>
        ))}
      </ScrollView>
      <FlatList
        data={names}
        keyExtractor={(n) => n}
        initialNumToRender={12}
        windowSize={7}
        renderItem={({ item }) => <Row name={item} onOpen={setOpen} />}
        ListEmptyComponent={<Text style={[s.body, { textAlign: 'center', marginTop: 30 }]}>Nothing matches.</Text>}
      />
      {open && <Detail name={open} onClose={() => setOpen(null)} />}
    </View>
  );
}
