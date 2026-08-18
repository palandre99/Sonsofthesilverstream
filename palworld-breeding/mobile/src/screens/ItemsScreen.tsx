/** The Items index — every item in the game, searchable, with real numbers.
 *
 * Phase A of the Items fane (documents/09_ITEMS_PLAN.md). One shared index
 * over the whole 1,892-item catalogue: the tab it lives on picks the
 * starting group (Weapons first), the search always spans everything, and
 * every number on screen is the game's own — the backbone from the atlas
 * tables, the stats from paldb's raw cards at exact identity.
 *
 * No item artwork yet (the icon pipeline is a later step) — rows lead with
 * a rarity-tinted tier chip instead of pretending to have art.
 */
import React, { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, Text, View } from 'react-native';
import { T } from '../theme';
import { Badge, Btn, Card, DataStamp, PageHead, SearchInput, s } from '../ui/kit';
import { Icon } from '../ui/Icon';
import {
  familyOf, groupOf, idsInGroup, ITEM_GROUPS, ITEM_STATS, ITEMS,
  kindsInGroup, kindWord, searchItems, sortItems, tierWord, type ItemSort,
} from '../itemsData';

/** Tier tints — presentation colours for the game's own tier words. */
const TIER_TINTS: Record<string, string> = {
  Common: '#9AA5AC',
  Uncommon: '#5BBF6E',
  Rare: '#4FA3E3',
  Epic: '#A66BE8',
  Legendary: '#E8A13C',
};

const SORT_LABELS: Record<ItemSort, string> = {
  power: 'Strongest first',
  name: 'A–Z',
  rarity: 'Rarest first',
};

/** The chip row: the whole catalogue first, then every player group. */
const CHIP_GROUPS: { id: string; label: string }[] = [
  { id: 'all', label: 'Everything' },
  ...ITEM_GROUPS,
];

function statLine(id: string): string {
  const st = ITEM_STATS[id];
  const bits: string[] = [];
  if (st?.atk != null) bits.push(`Attack ${st.atk}`);
  if (st?.def != null) bits.push(`Defense ${st.def}`);
  if (st?.hp != null) bits.push(`+${st.hp} Health`);
  if (st?.durability != null) bits.push(`durability ${st.durability}`);
  if (st?.magazine != null) bits.push(`${st.magazine} round${st.magazine === 1 ? '' : 's'}`);
  return bits.join(' · ');
}

function TierChip({ id, size = 12 }: { id: string; size?: number }) {
  const word = ITEM_STATS[id]?.tier ?? tierWord(ITEMS[id].rarity);
  return (
    <Text style={{
      color: TIER_TINTS[word] ?? T.muted, fontSize: size, fontWeight: '800',
    }}>{word}</Text>
  );
}

function ItemRow({ id, showGroup, onOpen }: {
  id: string; showGroup: boolean; onOpen: (id: string) => void;
}) {
  const it = ITEMS[id];
  const line = statLine(id);
  return (
    <Pressable
      onPress={() => onOpen(id)}
      accessibilityRole="button"
      accessibilityLabel={`${it.name}, ${ITEM_STATS[id]?.tier ?? tierWord(it.rarity)}. Open its card`}
      style={({ pressed }) => ({
        paddingVertical: 9, paddingHorizontal: 12, borderRadius: 12,
        backgroundColor: pressed ? T.surface2 : T.surface,
        borderWidth: 1, borderColor: T.line, marginBottom: 6,
      })}>
      <View style={[s.row, { gap: 8 }]}>
        <Text style={{ color: T.ink, fontWeight: '800', fontSize: 14.5, flex: 1 }}
          numberOfLines={1}>{it.name}</Text>
        <TierChip id={id} />
      </View>
      <View style={[s.row, { gap: 8, marginTop: 2 }]}>
        <Text style={{ color: T.muted, fontSize: 12, flex: 1 }} numberOfLines={1}>
          {line || kindWord(id)}
          {showGroup && groupOf(id) ? `  ·  ${groupOf(id)}` : ''}
        </Text>
        {it.weight != null && it.weight > 0 && (
          <Text style={{ color: T.faint, fontSize: 11 }}>{it.weight} wt</Text>
        )}
      </View>
    </Pressable>
  );
}

function ItemDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const it = ITEMS[id];
  const st = ITEM_STATS[id];
  const family = familyOf(id);
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: T.bg2, padding: 16 }}>
        <View style={[s.row, { marginBottom: 6 }]}>
          <Text style={[s.h2, { flex: 1 }]} numberOfLines={2}>{it.name}</Text>
          <Btn small label="Close" onPress={onClose} />
        </View>
        <View style={[s.wrap, { marginBottom: 10 }]}>
          <TierChip id={id} size={13} />
          {groupOf(id) && <Badge kind="plain">{groupOf(id)}</Badge>}
          {kindWord(id) !== groupOf(id) && (
            <Badge kind="plain">{kindWord(id)}</Badge>
          )}
        </View>

        {it.description ? (
          <Card><Text style={s.body}>{it.description}</Text></Card>
        ) : (
          <Card><Text style={[s.body, { color: T.faint }]}>
            The game files carry no description for this item.
          </Text></Card>
        )}

        {(st || (it.weight ?? 0) > 0 || (it.price ?? 0) > 0
          || (it.maxStack ?? 0) > 1) && (
          <Card style={{ marginTop: 10 }}>
            <Text style={s.h3}>The numbers</Text>
            <View style={{ marginTop: 6, gap: 3 }}>
              {st?.atk != null && <Fact label="Attack" value={String(st.atk)} />}
              {st?.def != null && <Fact label="Defense" value={String(st.def)} />}
              {st?.hp != null && <Fact label="Health bonus" value={`+${st.hp}`} />}
              {st?.shield != null && <Fact label="Shield" value={String(st.shield)} />}
              {st?.durability != null && <Fact label="Durability" value={String(st.durability)} />}
              {st?.magazine != null && <Fact label="Magazine" value={`${st.magazine} round${st.magazine === 1 ? '' : 's'}`} />}
              {st?.passives && st.passives.length > 0 && (
                <Fact label="Wears the passive" value={st.passives.join(', ')} />
              )}
              {it.weight != null && it.weight > 0 && (
                <Fact label="Weight" value={String(it.weight)} />
              )}
              {it.price != null && it.price > 0 && (
                <Fact label="Sells for" value={`${it.price} gold`} />
              )}
              {it.maxStack != null && it.maxStack > 1 && (
                <Fact label="Stacks to" value={String(it.maxStack)} />
              )}
            </View>
          </Card>
        )}

        {family.length > 1 && (
          <Card style={{ marginTop: 10 }}>
            <Text style={s.h3}>Every tier of this {kindWord(id).toLowerCase()}</Text>
            <View style={{ marginTop: 6, gap: 4 }}>
              {family.map((fid) => (
                <View key={fid} style={[s.row, { gap: 10 }]}>
                  <View style={{ width: 86 }}><TierChip id={fid} /></View>
                  <Text style={[s.body, { fontSize: 12.5, flex: 1 }]}>
                    {statLine(fid) || '—'}
                  </Text>
                </View>
              ))}
            </View>
          </Card>
        )}

        <Text style={[s.body, { marginTop: 12, fontSize: 11, color: T.faint }]}>
          Names, descriptions and numbers are the game's own — the item table
          from the official server package and the per-tier stats accepted only
          when their internal id matches it exactly.
        </Text>
      </View>
    </Modal>
  );
}

const Fact = ({ label, value }: { label: string; value: string }) => (
  <View style={[s.row, { gap: 10 }]}>
    <Text style={{ color: T.muted, width: 110, fontSize: 12.5, fontWeight: '700' }}>{label}</Text>
    <Text style={{ color: T.ink, fontSize: 12.5, flex: 1 }}>{value}</Text>
  </View>
);

export function ItemsScreen({ initialGroup = 'weapons' }: { initialGroup?: string }) {
  const [q, setQ] = useState('');
  const [group, setGroup] = useState(initialGroup);
  const [kind, setKind] = useState<string | null>(null);
  const [sort, setSort] = useState<ItemSort>('power');
  const [open, setOpen] = useState<string | null>(null);

  const searching = q.trim().length > 0;
  // every kind inside the current group — 2+ means the group has depth
  // worth its own chip row ("many sub ones" — CEO 2026-08-18)
  const kinds = useMemo(
    () => (group === 'all' ? [] : kindsInGroup(group)),
    [group],
  );
  const ids = useMemo(() => {
    let base = searching ? searchItems(q) : idsInGroup(group);
    if (!searching && kind) base = base.filter((i) => kindWord(i) === kind);
    return sortItems(base, sort);
  }, [q, group, kind, sort, searching]);

  const pickGroup = (g: string) => {
    setGroup(g);
    setKind(null);
  };

  return (
    <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 10 }}>
      <PageHead title="Items"
        sub="Every item in the game with its real numbers — nothing estimated."
        stamp />
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
        <View style={{ flex: 1 }}>
          <SearchInput value={q} onChange={setQ}
            placeholder={`Search all ${Object.keys(ITEMS).length} items…`} />
        </View>
        <Btn small label={SORT_LABELS[sort]}
          onPress={() => setSort(sort === 'power' ? 'name' : sort === 'name' ? 'rarity' : 'power')} />
      </View>
      {!searching && (
        <FlatList
          horizontal showsHorizontalScrollIndicator={false}
          data={CHIP_GROUPS}
          keyExtractor={(g) => g.id}
          style={{ flexGrow: 0, marginBottom: 8 }}
          renderItem={({ item: g }) => (
            <Pressable
              onPress={() => pickGroup(g.id)}
              accessibilityRole="button"
              accessibilityLabel={`${g.label}${group === g.id ? ', showing now' : ''}`}
              style={{
                backgroundColor: group === g.id ? T.accentSoft : T.surface2,
                borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6,
                marginRight: 6,
              }}>
              <Text style={{
                color: group === g.id ? T.accentInk : T.muted,
                fontSize: 12, fontWeight: '700',
              }}>{g.label} · {idsInGroup(g.id).length}</Text>
            </Pressable>
          )}
        />
      )}
      {!searching && kinds.length >= 2 && (
        <FlatList
          horizontal showsHorizontalScrollIndicator={false}
          data={[{ kind: null as string | null, count: idsInGroup(group).length },
            ...kinds]}
          keyExtractor={(k) => k.kind ?? '__all'}
          style={{ flexGrow: 0, marginBottom: 8 }}
          renderItem={({ item: k }) => {
            const on = kind === k.kind;
            const label = k.kind ?? `All ${groupOf(idsInGroup(group)[0]) ?? ''}`.trim();
            return (
              <Pressable
                onPress={() => setKind(k.kind)}
                accessibilityRole="button"
                accessibilityLabel={`${label}${on ? ', showing now' : ''}`}
                style={{
                  backgroundColor: on ? T.accentSoft : T.surface,
                  borderWidth: 1, borderColor: on ? T.accentSoft : T.line,
                  borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4,
                  marginRight: 6,
                }}>
                <Text style={{
                  color: on ? T.accentInk : T.muted,
                  fontSize: 11.5, fontWeight: '700',
                }}>{label} · {k.count}</Text>
              </Pressable>
            );
          }}
        />
      )}
      {searching && (
        <Text style={[s.body, { marginBottom: 6, fontSize: 12.5 }]}>
          {ids.length === 0
            ? `No item matches “${q.trim()}”.`
            : ids.length === 1 ? '1 item found — across everything'
            : `${ids.length} items found — across everything`}
        </Text>
      )}
      <FlatList
        data={ids}
        keyExtractor={(id) => id}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={14}
        renderItem={({ item: id }) => (
          <ItemRow id={id} showGroup={searching} onOpen={setOpen} />
        )}
        ListEmptyComponent={!searching ? (
          <Card><Text style={s.body}>Nothing in this group.</Text></Card>
        ) : null}
        contentContainerStyle={{ paddingBottom: 40 }}
      />
      {open && <ItemDetail id={open} onClose={() => setOpen(null)} />}
    </View>
  );
}
