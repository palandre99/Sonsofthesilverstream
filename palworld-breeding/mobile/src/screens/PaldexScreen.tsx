/** Paldex — the encyclopedia AND your collection, one screen.
 * Ownership lives here: ♂/♀ toggles on every row, import, stats — the
 * separate Box tab was folded in (two near-identical lists were confusing). */
import React, { memo, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native';
import { T } from '../theme';
import {
  Badge, Btn, Card, ElementChips, GenderToggles, PageHead, PalIcon, SearchInput,
  WorkChips, s,
} from '../ui/kit';
import {
  clearBox, engine, getBox, hasGender, importNames, ownedAny,
  pairReadyCount, palNumberSort, pals, useAppVersion, workLabel,
  type OwnedGenders,
} from '../store';
import { closure } from '../engine/planner';
import { PalDetail } from '../ui/PalDetail';
import { rarityStyle } from '../data/rarity';
import * as Haptics from 'expo-haptics';
import { WORK_ICONS } from '../data/workIcons';
import { ELEMENT_ICONS } from '../data/statIcons';
import { Image } from 'react-native';

import { ELEMENTS } from '../data/elements';
import { FilterSheet } from '../ui/FilterSheet';
import {
  applyFilters, NO_FILTERS, sortedPals, type Filters, type SortKey,
} from '../ui/palFilters';

const Row = memo(function Row({ name, onOpen, focus }: {
  name: string; onOpen: (n: string) => void; focus?: string | null;
}) {
  const p = pals[name];
  const owned = ownedAny(name);
  // List rows stay calm (CEO 2026-08-15: NOT coloured cards here) — rarity
  // shows as a thin edge tint only; the dyed experience lives on the info
  // card you open.
  const r = rarityStyle(p?.rarity);
  return (
    <Pressable
      onPress={() => onOpen(name)}
      style={({ pressed }) => [{
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: T.surface, borderColor: T.line, borderWidth: 1,
        borderLeftWidth: 3, borderLeftColor: r.weight > 0 ? r.line : T.line,
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
          <WorkChips name={name} top={focus ? 2 : 1} focus={focus} />
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

/* ---------------- sorting + filtering ---------------- */

export function PaldexScreen() {
  useAppVersion();
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [sort, setSort] = useState<SortKey>('number');
  const [open, setOpen] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'none' | 'import' | 'clear' | 'filter'>('none');

  const box = getBox();
  const ownedNames = Object.keys(box);
  const reachable = useMemo(
    () => (ownedNames.length ? closure(engine, ownedNames).size : 0),
    [box],
  );

  const names = useMemo(() => {
    let list = Object.keys(pals);
    if (q) list = list.filter((n) => n.toLowerCase().includes(q.toLowerCase()));
    list = applyFilters(list, filters);
    return sortedPals(list, sort);
  }, [q, filters, sort, box]);

  // the job the list is currently about — highlighted on every row so a
  // filtered list is visibly still that filter as you scroll
  const focusJob = filters.work ?? (sort.startsWith('work:') ? sort.slice(5) : null);

  const OWN_LABELS: Record<Filters['own'], string> = {
    all: 'All', owned: 'Owned', missing: 'Missing',
    pairready: 'Have ♂+♀', onegender: 'One gender',
  };
  const activeBits: string[] = [];
  if (filters.own !== 'all') activeBits.push(OWN_LABELS[filters.own]);
  if (filters.elements.length) activeBits.push(filters.elements.join('/'));
  if (filters.work) activeBits.push(`${workLabel(filters.work)} pals`);
  if (sort !== 'number' && !(filters.work && sort === `work:${filters.work}`)) {
    const sortNames: Record<string, string> = {
      name: 'A–Z', rarity_desc: 'Rarest first', rarity_asc: 'Common first',
      hp: 'by Health', atk: 'by Attack', def: 'by Defense',
    };
    activeBits.push(sort.startsWith('work:')
      ? `best ${workLabel(sort.slice(5))} first` : sortNames[sort] ?? sort);
  }

  return (
    <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 10 }}>
      {/* compact header: one stat line, everything else in sheets */}
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
        <Text style={s.h1}>Paldex</Text>
        <Text style={{ color: T.muted, fontSize: 12.5, fontWeight: '700', flex: 1 }}>
          {ownedNames.length} owned · {reachable}/{Object.keys(pals).length} reachable
        </Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
        <View style={{ flex: 1 }}>
          <SearchInput value={q} onChange={setQ} placeholder="Search pals…" />
        </View>
        <Btn small label={activeBits.length ? `Filters · ${activeBits.length}` : 'Filters'}
          primary={activeBits.length > 0}
          onPress={() => setSheet('filter')} />
      </View>
      {activeBits.length > 0 && (
        <View style={[s.wrap, { marginBottom: 8 }]}>
          <Text style={{ color: T.accentInk, fontSize: 11.5, fontWeight: '700' }}>
            {activeBits.join(' · ')}
          </Text>
          <Pressable onPress={() => { setFilters(NO_FILTERS); setSort('number'); }}>
            <Text style={{ color: T.faint, fontSize: 11.5, fontWeight: '800' }}> ✕ clear</Text>
          </Pressable>
        </View>
      )}
      <FlatList
        keyboardShouldPersistTaps="handled"
        // the keyboard used to sit on top of the results the moment you
        // scrolled to read them (CEO 2026-08-15)
        keyboardDismissMode="on-drag"
        data={names}
        keyExtractor={(n) => n}
        initialNumToRender={12}
        windowSize={7}
        renderItem={({ item }) => <Row name={item} onOpen={setOpen} focus={focusJob} />}
        ListEmptyComponent={<Text style={[s.body, { textAlign: 'center', marginTop: 30 }]}>Nothing matches those filters.</Text>}
        ListFooterComponent={
          <View style={[s.wrap, { justifyContent: 'center', paddingVertical: 14 }]}>
            <Btn small label="Import list…" onPress={() => setSheet('import')} />
            <Btn small disabled={!ownedNames.length} label="Share my list…"
              onPress={() => {
                // gender-suffixed lines — the exact format Import understands,
                // so a collection moves between installs in two taps
                const text = ownedNames.sort().map((n) => {
                  const g = box[n];
                  return n + (g.m && g.f ? '' : g.m ? ' ♂' : ' ♀');
                }).join('\n');
                void Share.share({ message: text });
              }} />
            <Btn small danger disabled={!ownedNames.length} label="Clear collection…"
              onPress={() => setSheet('clear')} />
          </View>
        }
      />
      {open && <PalDetail name={open} onClose={() => setOpen(null)} />}
      {sheet === 'filter' && (
        <FilterSheet filters={filters} sort={sort}
          onApply={(f, sk) => { setFilters(f); setSort(sk); setSheet('none'); }}
          onClose={() => setSheet('none')} />
      )}
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
