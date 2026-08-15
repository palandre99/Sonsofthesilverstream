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
export function FilterSheet({ filters, sort, onApply, onClose }: {
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

