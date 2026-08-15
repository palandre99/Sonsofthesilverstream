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
  pairReadyCount, palNumberSort, pals, useAppVersion,
  type OwnedGenders,
} from '../store';
import { closure } from '../engine/planner';
import { PalDetail } from '../ui/PalDetail';
import { rarityTint } from '../data/rarity';
import * as Haptics from 'expo-haptics';
import { WORK_ICONS } from '../data/workIcons';
import { ELEMENT_ICONS } from '../data/statIcons';
import { Image } from 'react-native';

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
        borderLeftWidth: 3, borderLeftColor: rarityTint(p?.rarity, T.line),
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

/* ---------------- sorting + filtering ---------------- */

const WORK_LABELS: Record<string, string> = { Generating_Electricity: 'Electricity' };
function workLabel(k: string): string {
  return WORK_LABELS[k] ?? k.replace(/_/g, ' ');
}

type SortKey = 'number' | 'name' | 'rarity_desc' | 'rarity_asc'
  | 'hp' | 'atk' | 'def' | `work:${string}`;

const RARITY_RANK: Record<string, number> = { Legendary: 3, Epic: 2, Rare: 1, Common: 0 };

const WORK_KEYS = ['Kindling', 'Watering', 'Planting', 'Generating_Electricity',
  'Handiwork', 'Gathering', 'Lumbering', 'Mining', 'Medicine', 'Cooling',
  'Transporting', 'Farming'];

function sorted(list: string[], key: SortKey): string[] {
  const arr = [...list];
  switch (key) {
    case 'number': return arr.sort(palNumberSort);
    case 'name': return arr.sort((a, b) => a.localeCompare(b));
    case 'rarity_desc': return arr.sort((a, b) =>
      (RARITY_RANK[pals[b]?.rarity ?? ''] ?? -1) - (RARITY_RANK[pals[a]?.rarity ?? ''] ?? -1)
      || palNumberSort(a, b));
    case 'rarity_asc': return arr.sort((a, b) =>
      (RARITY_RANK[pals[a]?.rarity ?? ''] ?? -1) - (RARITY_RANK[pals[b]?.rarity ?? ''] ?? -1)
      || palNumberSort(a, b));
    case 'hp': return arr.sort((a, b) => (pals[b]?.hp ?? 0) - (pals[a]?.hp ?? 0));
    case 'atk': return arr.sort((a, b) => (pals[b]?.atk ?? 0) - (pals[a]?.atk ?? 0));
    case 'def': return arr.sort((a, b) => (pals[b]?.def ?? 0) - (pals[a]?.def ?? 0));
    default: {
      const job = key.slice(5);
      return arr.sort((a, b) =>
        ((pals[b]?.work ?? {})[job] ?? 0) - ((pals[a]?.work ?? {})[job] ?? 0)
        || palNumberSort(a, b));
    }
  }
}

interface Filters {
  own: 'all' | 'owned' | 'missing' | 'pairready' | 'onegender';
  elements: string[];
  work: string | null;
}

const NO_FILTERS: Filters = { own: 'all', elements: [], work: null };

function applyFilters(list: string[], f: Filters): string[] {
  let out = list;
  if (f.elements.length) {
    out = out.filter((n) => f.elements.some((e) => pals[n].elements.includes(e)));
  }
  if (f.work) out = out.filter((n) => ((pals[n].work ?? {})[f.work!] ?? 0) > 0);
  switch (f.own) {
    case 'owned': return out.filter(ownedAny);
    case 'missing': return out.filter((n) => !ownedAny(n));
    case 'pairready': return out.filter((n) => hasGender(n, 'm') && hasGender(n, 'f'));
    case 'onegender':
      return out.filter((n) => ownedAny(n) && !(hasGender(n, 'm') && hasGender(n, 'f')));
    default: return out;
  }
}

/** The Filter & Sort sheet — in-game sorting, but better. */
function FilterSheet({ filters, sort, onApply, onClose }: {
  filters: Filters; sort: SortKey;
  onApply: (f: Filters, s: SortKey) => void; onClose: () => void;
}) {
  const [f, setF] = useState<Filters>(filters);
  const [sk, setSk] = useState<SortKey>(sort);

  const Chip = ({ on, label, icon, onPress }: {
    on: boolean; label: string; icon?: number; onPress: () => void;
  }) => (
    <Pressable
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 5,
        backgroundColor: on ? T.accentSoft : T.surface2,
        borderWidth: 1.5, borderColor: on ? T.accent : T.line,
        borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7,
      }}
    >
      {icon != null && <Image source={icon} style={{ width: 17, height: 17 }} />}
      <Text style={{
        color: on ? T.accentInk : T.muted, fontWeight: '700', fontSize: 12.5,
      }}>{label}</Text>
    </Pressable>
  );

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View style={{ gap: 7 }}>
      <Text style={{
        color: T.faint, fontSize: 10.5, fontWeight: '800',
        letterSpacing: 1, textTransform: 'uppercase',
      }}>{title}</Text>
      <View style={[s.wrap]}>{children}</View>
    </View>
  );

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: T.bg2 }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center', padding: 16,
          borderBottomWidth: 1, borderBottomColor: T.line,
        }}>
          <Text style={[s.h2, { flex: 1 }]}>Filter & sort</Text>
          <Btn small label="Reset" onPress={() => { setF(NO_FILTERS); setSk('number'); }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: 30 }}>
          <Section title="Sort by">
            <Chip on={sk === 'number'} label="Number" onPress={() => setSk('number')} />
            <Chip on={sk === 'name'} label="Name" onPress={() => setSk('name')} />
            <Chip on={sk === 'rarity_desc'} label="Rarest first" onPress={() => setSk('rarity_desc')} />
            <Chip on={sk === 'rarity_asc'} label="Common first" onPress={() => setSk('rarity_asc')} />
            <Chip on={sk === 'hp'} label="HP" onPress={() => setSk('hp')} />
            <Chip on={sk === 'atk'} label="Attack" onPress={() => setSk('atk')} />
            <Chip on={sk === 'def'} label="Defense" onPress={() => setSk('def')} />
          </Section>
          <Section title="Sort by work suitability">
            {WORK_KEYS.map((w) => (
              <Chip key={w} on={sk === `work:${w}`} icon={WORK_ICONS[w]}
                label={workLabel(w)} onPress={() => setSk(`work:${w}` as SortKey)} />
            ))}
          </Section>
          <Section title="Ownership">
            <Chip on={f.own === 'all'} label="All" onPress={() => setF({ ...f, own: 'all' })} />
            <Chip on={f.own === 'owned'} label="Owned" onPress={() => setF({ ...f, own: 'owned' })} />
            <Chip on={f.own === 'missing'} label="Missing" onPress={() => setF({ ...f, own: 'missing' })} />
            <Chip on={f.own === 'pairready'} label="Have ♂ + ♀" onPress={() => setF({ ...f, own: 'pairready' })} />
            <Chip on={f.own === 'onegender'} label="One gender" onPress={() => setF({ ...f, own: 'onegender' })} />
          </Section>
          <Section title="Element">
            {ELEMENTS.map((e) => (
              <Chip key={e} on={f.elements.includes(e)} icon={ELEMENT_ICONS[e]} label={e}
                onPress={() => setF({
                  ...f,
                  elements: f.elements.includes(e)
                    ? f.elements.filter((x) => x !== e)
                    : [...f.elements, e],
                })} />
            ))}
          </Section>
          <Section title="Must have work suitability">
            {WORK_KEYS.map((w) => (
              <Chip key={w} on={f.work === w} icon={WORK_ICONS[w]} label={workLabel(w)}
                onPress={() => setF({ ...f, work: f.work === w ? null : w })} />
            ))}
          </Section>
        </ScrollView>
        <View style={{
          flexDirection: 'row', gap: 10, padding: 16,
          borderTopWidth: 1, borderTopColor: T.line,
        }}>
          <View style={{ flex: 1 }}>
            <Btn primary label={`Show ${applyFilters(Object.keys(pals), f).length} pals`}
              onPress={() => onApply(f, sk)} />
          </View>
          <Btn label="Cancel" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

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
    return sorted(list, sort);
  }, [q, filters, sort, box]);

  const OWN_LABELS: Record<Filters['own'], string> = {
    all: 'All', owned: 'Owned', missing: 'Missing',
    pairready: 'Have ♂+♀', onegender: 'One gender',
  };
  const activeBits: string[] = [];
  if (filters.own !== 'all') activeBits.push(OWN_LABELS[filters.own]);
  if (filters.elements.length) activeBits.push(filters.elements.join('/'));
  if (filters.work) activeBits.push(workLabel(filters.work));
  if (sort !== 'number') {
    const sortNames: Record<string, string> = {
      name: 'A–Z', rarity_desc: 'Rarest first', rarity_asc: 'Common first',
      hp: 'by HP', atk: 'by Attack', def: 'by Defense',
    };
    activeBits.push(sort.startsWith('work:')
      ? `by ${workLabel(sort.slice(5))}` : sortNames[sort] ?? sort);
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
        data={names}
        keyExtractor={(n) => n}
        initialNumToRender={12}
        windowSize={7}
        renderItem={({ item }) => <Row name={item} onOpen={setOpen} />}
        ListEmptyComponent={<Text style={[s.body, { textAlign: 'center', marginTop: 30 }]}>Nothing matches those filters.</Text>}
        ListFooterComponent={
          <View style={[s.wrap, { justifyContent: 'center', paddingVertical: 14 }]}>
            <Btn small label="Import list…" onPress={() => setSheet('import')} />
            <Btn small disabled={!ownedNames.length} label="Copy my list…"
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
