/** The Filter & Sort sheet — in-game sorting, but better. Shared by the
 * Paldex and the pal picker. */
import React, { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { T } from '../theme';
import { Btn, s } from './kit';
import { WORK_ICONS } from '../data/workIcons';
import { ELEMENT_ICONS } from '../data/statIcons';
import { ELEMENTS } from '../data/elements';
import { pals, workLabel } from '../store';
import {
  applyFilters, NO_FILTERS, WORK_KEYS, type Filters, type SortKey,
} from './palFilters';

/** The Filter & Sort sheet — in-game sorting, but better. */
export function FilterSheet({ filters, sort, onApply, onClose, base }: {
  filters: Filters; sort: SortKey;
  onApply: (f: Filters, s: SortKey) => void; onClose: () => void;
  /** the list being filtered — defaults to every pal. A category browser
   * passes its own subset so the button can't promise "Show 44 pals" and
   * then hand back 14 (self-found 2026-08-16). */
  base?: string[];
}) {
  const [f, setF] = useState<Filters>(filters);
  const [sk, setSk] = useState<SortKey>(sort);

  /** Every chip in this sheet turns OFF when you tap it again — the CEO hit a
   * sort chip he could not un-choose (2026-08-15). Radio-style groups fall
   * back to their neutral value rather than staying stuck. */
  const pickSort = (k: SortKey) => setSk(sk === k ? 'number' : k);
  const pickOwn = (o: Filters['own']) =>
    setF({ ...f, own: f.own === o ? 'all' : o });

  /** One tap on a job means what a player means: "only pals that can do this,
   * best first." Two controls that looked identical — one sorting, one
   * filtering — is what made a Kindling filter look broken as you scrolled. */
  const pickWork = (w: string) => {
    if (f.work === w) {
      setF({ ...f, work: null });
      if (sk === `work:${w}`) setSk('number');
    } else {
      setF({ ...f, work: w });
      setSk(`work:${w}` as SortKey);
    }
  };

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

  const Section = ({ title, hint, children }: {
    title: string; hint?: string; children: React.ReactNode;
  }) => (
    <View style={{ gap: 7 }}>
      <Text style={{
        color: T.faint, fontSize: 10.5, fontWeight: '800',
        letterSpacing: 1, textTransform: 'uppercase',
      }}>{title}</Text>
      <View style={[s.wrap]}>{children}</View>
      {hint ? (
        <Text style={{ color: T.accentInk, fontSize: 11.5, fontWeight: '600' }}>{hint}</Text>
      ) : null}
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
          <Section title="Work — shows only pals that can do it"
            hint={f.work
              ? sk === `work:${f.work}`
                ? `Showing ${workLabel(f.work)} pals, highest level first.`
                : `Showing only ${workLabel(f.work)} pals.`
              : undefined}>
            {WORK_KEYS.map((w) => (
              <Chip key={w} on={f.work === w} icon={WORK_ICONS[w]} label={workLabel(w)}
                onPress={() => pickWork(w)} />
            ))}
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
          <Section title="Ownership">
            <Chip on={f.own === 'owned'} label="Owned" onPress={() => pickOwn('owned')} />
            <Chip on={f.own === 'missing'} label="Missing" onPress={() => pickOwn('missing')} />
            <Chip on={f.own === 'pairready'} label="Have ♂ + ♀" onPress={() => pickOwn('pairready')} />
            <Chip on={f.own === 'onegender'} label="One gender" onPress={() => pickOwn('onegender')} />
          </Section>
          <Section title="Order">
            {sk.startsWith('work:') && (
              <Chip on icon={WORK_ICONS[sk.slice(5)]}
                label={`Best ${workLabel(sk.slice(5))}`}
                onPress={() => setSk('number')} />
            )}
            <Chip on={sk === 'number'} label="Paldex number" onPress={() => setSk('number')} />
            <Chip on={sk === 'name'} label="A–Z" onPress={() => pickSort('name')} />
            <Chip on={sk === 'rarity_desc'} label="Rarest first" onPress={() => pickSort('rarity_desc')} />
            <Chip on={sk === 'rarity_asc'} label="Common first" onPress={() => pickSort('rarity_asc')} />
            <Chip on={sk === 'hp'} label="Health" onPress={() => pickSort('hp')} />
            <Chip on={sk === 'atk'} label="Attack" onPress={() => pickSort('atk')} />
            <Chip on={sk === 'def'} label="Defense" onPress={() => pickSort('def')} />
          </Section>
        </ScrollView>
        <View style={{
          flexDirection: 'row', gap: 10, padding: 16,
          borderTopWidth: 1, borderTopColor: T.line,
        }}>
          <View style={{ flex: 1 }}>
            <Btn primary label={(() => {
              // "1 pal", never "1 pals" — the banned grammar, and this
              // sheet is shared with the Paldex and the picker
              const n = applyFilters(base ?? Object.keys(pals), f).length;
              return `Show ${n} ${n === 1 ? 'pal' : 'pals'}`;
            })()}
              onPress={() => onApply(f, sk)} />
          </View>
          <Btn label="Cancel" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

