/** Full-screen pal picker — the Paldex's search + Filter & Sort sheet in a
 * modal, used by the Plan and Calculator. */
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList, Image, Modal, Pressable, ScrollView, Text, TextInput, View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { T } from '../theme';
import {
  Badge, Btn, ElementChips, getRecentPicks, PalIcon, rememberPick, s, WorkChips,
} from './kit';
import { Icon } from './Icon';
import { rarityTint } from '../data/rarity';
import { ELEMENTS as PICKER_ELEMENTS } from '../data/elements';
import { ELEMENT_ICONS } from '../data/statIcons';
import { ownedAny, pals, useAppVersion } from '../store';
import { FilterSheet } from './FilterSheet';
import {
  applyFilters, NO_FILTERS, sortedPals, type Filters, type SortKey,
} from './palFilters';

/** One row of the picker list.
 *
 *  This was declared INSIDE PalPicker, which made it a brand-new component
 *  type on every render — so React unmounted and rebuilt every visible row,
 *  and every row's pal image, on each keystroke in a 299-pal search. Out
 *  here and memoised, a keystroke re-renders only the rows that changed.
 *  `owned` is passed IN rather than read from the store, so memo can still
 *  see an ownership tick and update the dot. */
const PickerRow = memo(function PickerRow({ n, excluded, owned, focusWork, onChoose }: {
  n: string; excluded: boolean; owned: boolean;
  focusWork?: string | null; onChoose: (n: string) => void;
}) {
  return (
      <Pressable
        disabled={excluded}
        onPress={() => onChoose(n)}
        // the row said nothing to a screen reader: no role, and "you own
        // this one" was a bare coloured dot with no text at all
        accessibilityRole="button"
        accessibilityState={{ disabled: excluded }}
        accessibilityLabel={`${n}. ${
          excluded ? 'already one of your goals'
            : owned ? 'in your Paldex' : 'not in your Paldex yet'}`}
        style={({ pressed }) => [{
          flexDirection: 'row', alignItems: 'center', gap: 12,
          paddingVertical: 9, paddingHorizontal: 12, borderRadius: 12,
          backgroundColor: pressed ? T.accentSoft : T.surface,
          borderWidth: 1, borderColor: pressed ? T.accent : T.line,
          borderLeftWidth: 3,
          borderLeftColor: pressed ? T.accent : rarityTint(pals[n]?.rarity, T.line),
          marginBottom: 6, opacity: excluded ? 0.45 : 1,
        }]}
      >
        <PalIcon name={n} size={46} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ color: T.ink, fontWeight: '800', fontSize: 16 }}>
            {n} <Text style={{ color: T.faint, fontSize: 11, fontWeight: '700' }}>#{pals[n]?.number || '—'}</Text>
          </Text>
          <View style={{ flexDirection: 'row', gap: 5, flexWrap: 'wrap' }}>
            <ElementChips name={n} />
          </View>
          {/* what the pal can DO — the picker showed only its elements, so
              you could not tell a miner from a lumberjack while choosing
              (CEO 2026-08-16). `focus` keeps the job you filtered by first,
              so a Mining-filtered list still visibly reads as Mining. */}
          <View style={{ flexDirection: 'row', gap: 5, flexWrap: 'wrap' }}>
            <WorkChips name={n} top={3} focus={focusWork} />
          </View>
        </View>
        {excluded ? (
          <Badge kind="plain">added</Badge>
        ) : owned ? (
          <View style={{
            width: 10, height: 10, borderRadius: 5, backgroundColor: T.ok,
          }} />
        ) : null}
      </Pressable>
  );
});

export function PalPicker({ visible, onClose, onPick, title, exclude, initialOwn }: {
  visible: boolean;
  onClose: () => void;
  onPick: (name: string) => void;
  title: string;
  /** names that can't be picked again (already targets) — shown, but dimmed */
  exclude?: Set<string>;
  /** open already filtered — "show me MY pals" needs to land on your pals,
   *  not on all 299 with the work left to you (CEO 2026-08-16) */
  initialOwn?: Filters['own'];
}) {
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [sort, setSort] = useState<SortKey>('number');
  const [sheet, setSheet] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const version = useAppVersion();

  /** is a FILTER narrowing the list, as opposed to the search box? */
  const filtering = filters.own !== NO_FILTERS.own
    || filters.elements.length > 0
    || filters.work != null;

  const names = useMemo(() => {
    let list = Object.keys(pals);
    if (q) {
      const needle = q.toLowerCase();
      list = list.filter((n) => n.toLowerCase().includes(needle));
    }
    list = applyFilters(list, filters);
    return sortedPals(list, sort);
    // version: ownership filters must see box changes while the picker is open
  }, [q, filters, sort, version]);
  const filtersActive =
    filters.own !== 'all' || filters.elements.length > 0 || filters.work != null;

  useEffect(() => {
    if (visible) {
      setQ('');
      setFilters(initialOwn ? { ...NO_FILTERS, own: initialOwn } : NO_FILTERS);
      setSort('number');
      setTimeout(() => inputRef.current?.focus(), 250);
    }
  }, [visible, initialOwn]);

  const recents = getRecentPicks().filter((n) => Object.hasOwn(pals, n));
  const showRecents = !q && !filtersActive && sort === 'number' && recents.length > 0;

  const choose = useCallback((n: string) => {
    void Haptics.selectionAsync();
    rememberPick(n);
    onPick(n);
    onClose();
  }, [onPick, onClose]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: T.bg2 }}>
        <View style={{
          paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10, gap: 12,
          borderBottomWidth: 1, borderBottomColor: T.line, backgroundColor: T.bg2,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[s.h2, { flex: 1 }]}>{title}</Text>
            <Btn label="Close" onPress={onClose} small />
          </View>
          <TextInput
            ref={inputRef}
            value={q}
            onChangeText={setQ}
            placeholder={`Search ${Object.keys(pals).length} pals…`}
            placeholderTextColor={T.faint}
            // a raw TextInput, so E32's shared SearchInput fix never reached
            // it — and a placeholder stops being read the moment you type
            accessibilityLabel="Search pals"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
            style={{
              backgroundColor: T.surface, borderColor: T.line2, borderWidth: 1.5,
              borderRadius: 13, paddingHorizontal: 16, paddingVertical: 13,
              color: T.ink, fontSize: 16.5, fontWeight: '600',
            }}
          />
          {/* quick filters: ownership + element — one glanceable row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {(['all', 'missing', 'owned'] as const).map((o) => (
              <Pressable key={o}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setFilters({ ...filters, own: o });
                }}
                accessibilityRole="button"
                // which one is active was carried by colour alone
                accessibilityLabel={`Show ${
                  o === 'all' ? 'all pals' : o === 'owned' ? 'pals you own' : 'pals you are missing'
                }${filters.own === o ? ', showing now' : ''}`}
                style={{
                  backgroundColor: filters.own === o ? T.accentSoft : T.surface,
                  borderWidth: 1.5,
                  borderColor: filters.own === o ? T.accent : T.line,
                  borderRadius: 9, paddingHorizontal: 9, paddingVertical: 5,
                }}>
                <Text style={{
                  color: filters.own === o ? T.accentInk : T.muted,
                  fontWeight: '700', fontSize: 11.5,
                }}>{o === 'all' ? 'All' : o === 'owned' ? 'Owned' : 'Missing'}</Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => {
                void Haptics.selectionAsync();
                setSheet(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Filters and sort${
                filtersActive || sort !== 'number' ? ', some are on' : ''}`}
              style={{
                backgroundColor: filtersActive || sort !== 'number'
                  ? T.accentSoft : T.surface,
                borderWidth: 1.5,
                borderColor: filtersActive || sort !== 'number' ? T.accent : T.line,
                borderRadius: 9, paddingHorizontal: 9, paddingVertical: 5,
              }}>
              <Text style={{
                color: filtersActive || sort !== 'number' ? T.accentInk : T.muted,
                fontWeight: '700', fontSize: 11.5,
              }}>Filters & sort…</Text>
            </Pressable>
            <View style={{ width: 1, height: 18, backgroundColor: T.line }} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 5, alignItems: 'center' }}>
              {PICKER_ELEMENTS.map((e) => {
                const on = filters.elements.includes(e);
                return (
                  <Pressable key={e}
                    onPress={() => {
                      void Haptics.selectionAsync();
                      setFilters({
                        ...filters,
                        elements: on
                          ? filters.elements.filter((x) => x !== e)
                          : [...filters.elements, e],
                      });
                    }}
                    accessibilityRole="button"
                    // it had a label but no role, and no way to hear whether
                    // the element was currently filtering
                    accessibilityLabel={`${e} pals${on ? ', filtering now' : ''}`}
                    style={{
                      width: 30, height: 30, borderRadius: 9,
                      alignItems: 'center', justifyContent: 'center',
                      backgroundColor: on ? T.accentSoft : T.surface,
                      borderWidth: 1.5, borderColor: on ? T.accent : T.line,
                    }}>
                    <Image source={ELEMENT_ICONS[e]} style={{ width: 19, height: 19 }} />
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
          <Text style={{
            color: T.faint, fontSize: 11, fontWeight: '700', textAlign: 'right',
          }}>{names.length} of {Object.keys(pals).length}</Text>
        </View>
        <FlatList
          data={names}
          keyExtractor={(n) => n}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          initialNumToRender={12}
          windowSize={7}
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          ListHeaderComponent={showRecents ? (
            <View style={{ marginBottom: 10 }}>
              <Text style={{
                color: T.faint, fontSize: 10.5, fontWeight: '800',
                letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6,
                paddingHorizontal: 2,
              }}>Recent</Text>
              {recents.map((n) => (
                <PickerRow key={`r-${n}`} n={n} owned={ownedAny(n)}
                  excluded={exclude?.has(n) ?? false}
                  focusWork={filters.work} onChoose={choose} />
              ))}
              <Text style={{
                color: T.faint, fontSize: 10.5, fontWeight: '800',
                letterSpacing: 1, textTransform: 'uppercase',
                marginTop: 8, marginBottom: 2, paddingHorizontal: 2,
              }}>All pals</Text>
            </View>
          ) : null}
          renderItem={({ item: n }) => (
            <PickerRow n={n} owned={ownedAny(n)}
              excluded={exclude?.has(n) ?? false}
              focusWork={filters.work} onChoose={choose} />
          )}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 40, gap: 6 }}>
              <Icon name="magnify" size={34} color={T.faint} />
              {/* The Paldex hit this exact bug and fixed it: with a search AND a
                  filter both narrowing, saying "No pal matches X" blames the
                  search alone and sends the player to re-type a word that was
                  never the problem. The fix was never carried across to the
                  picker. Same three branches, same words. */}
              <Text style={{ color: T.muted, fontWeight: '700' }}>
                {q && filtering ? `Nothing matches “${q}” with those filters.`
                  : q ? `No pal matches “${q}”.`
                  : 'Nothing matches those filters.'}
              </Text>
              <Text style={{ color: T.faint, fontSize: 12.5 }}>
                {q && filtering ? 'Clear a filter, or check the spelling.'
                  : q ? 'Check the spelling.'
                  : 'Tap a filter again to clear it.'}
              </Text>
            </View>
          }
        />
      </View>
      {sheet && (
        <FilterSheet filters={filters} sort={sort}
          onApply={(f, sk) => {
            setFilters(f);
            setSort(sk);
            setSheet(false);
          }}
          onClose={() => setSheet(false)} />
      )}
    </Modal>
  );
}
