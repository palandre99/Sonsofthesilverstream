/** The Items index — every item in the game, searchable, with real numbers.
 *
 * One shared index over the whole 1,892-item catalogue: the tab it lives on
 * picks the starting group (the center Items tab is everything), the search
 * always spans everything, and every number on screen is the game's own —
 * the backbone from the atlas tables, the stats from paldb's raw cards at
 * exact identity.
 *
 * Filtering follows the Paldex's pattern EXACTLY (CEO 2026-08-18, on a
 * phone screenshot of the first chip-row version: "the filters suck, look
 * at paldex pal filter compared to this.. it's even being overlapped"):
 * a Filters button opening a sheet — group, kind, tier, order — plus an
 * active-filters summary line with a clear action. No stacked chip strips.
 */
import React, { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { T } from '../theme';
import { Badge, Btn, Card, PageHead, SearchInput, s } from '../ui/kit';
import {
  familyOf, groupOf, idsInGroup, ITEM_GROUPS, ITEM_STATS, ITEMS,
  kindsInGroup, kindWord, searchItems, sortItems, TIER_WORDS, tierWord,
  type ItemSort,
} from '../itemsData';
import { ITEM_FACTS, type CraftRow } from '../itemFacts';
import { ItemIcon } from '../ui/ItemIcon';

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

interface ItemFilters {
  group: string;          // group id or 'all'
  kind: string | null;    // a kindWord within the group
  tiers: string[];        // tier words, empty = all
}

function applyItemFilters(f: ItemFilters, q: string): string[] {
  let ids = q.trim() ? searchItems(q) : idsInGroup(f.group);
  if (!q.trim() && f.kind) ids = ids.filter((i) => kindWord(i) === f.kind);
  if (f.tiers.length) {
    ids = ids.filter((i) => f.tiers.includes(
      ITEM_STATS[i]?.tier ?? tierWord(ITEMS[i].rarity)));
  }
  return ids;
}

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
  const word = ITEM_STATS[id]?.tier ?? tierWord(it.rarity);
  return (
    <Pressable
      onPress={() => onOpen(id)}
      accessibilityRole="button"
      accessibilityLabel={`${it.name}, ${word}. Open its card`}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12,
        backgroundColor: pressed ? T.surface2 : T.surface,
        borderWidth: 1, borderColor: T.line, marginBottom: 6,
        borderLeftWidth: 3,
        borderLeftColor: TIER_TINTS[word] ?? T.line,
      })}>
      <ItemIcon icon={it.icon} size={40} tint={TIER_TINTS[word]} />
      <View style={{ flex: 1 }}>
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
      </View>
    </Pressable>
  );
}

/** One craft ingredient — tappable, so a recipe walks like a wiki. */
function IngredientRow({ row, onOpenItem }: {
  row: CraftRow; onOpenItem: (id: string) => void;
}) {
  const ing = ITEMS[row.id];
  if (!ing) return null;
  return (
    <Pressable
      onPress={() => onOpenItem(row.id)}
      accessibilityRole="button"
      accessibilityLabel={`${row.n} ${ing.name}. Open its card`}
      style={({ pressed }) => [s.row, {
        gap: 10, paddingVertical: 5, paddingHorizontal: 8, borderRadius: 8,
        backgroundColor: pressed ? T.surface2 : 'transparent',
      }]}>
      <Text style={{ color: T.ink, width: 34, fontSize: 12.5, fontWeight: '800', textAlign: 'right' }}>
        {row.n}×
      </Text>
      <ItemIcon icon={ing.icon} size={22} />
      <Text style={{ color: T.accentInk, fontSize: 12.5, fontWeight: '700', flex: 1 }}>
        {ing.name}
      </Text>
    </Pressable>
  );
}

const techLine = (t: { level: number; cost?: number; ancient?: boolean }): string => {
  const pts = t.cost == null ? null
    : `${t.cost} ${t.ancient ? 'ancient ' : ''}technology point${t.cost === 1 ? '' : 's'}`;
  if (t.ancient && pts) return `Ancient Technology — unlocks at level ${t.level} for ${pts}`;
  if (pts) return `Unlocks at level ${t.level} for ${pts}`;
  return `Unlocks at technology level ${t.level}`;
};

function ItemDetail({ id, onClose, onOpenItem }: {
  id: string; onClose: () => void; onOpenItem: (id: string) => void;
}) {
  const it = ITEMS[id];
  const st = ITEM_STATS[id];
  const facts = ITEM_FACTS[id];
  const family = familyOf(id);
  const desc = facts?.desc ?? it.description;
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: T.bg2 }}>
        <View style={{ padding: 16, paddingBottom: 8 }}>
          <View style={[s.row, { marginBottom: 6, gap: 12, alignItems: 'flex-start' }]}>
            <ItemIcon icon={it.icon} size={56}
              tint={TIER_TINTS[ITEM_STATS[id]?.tier ?? tierWord(it.rarity)]} />
            <View style={{ flex: 1 }}>
              <Text style={[s.h2]} numberOfLines={2}>{it.name}</Text>
              <View style={[s.wrap, { marginTop: 4 }]}>
                <TierChip id={id} size={13} />
                {groupOf(id) && <Badge kind="plain">{groupOf(id)}</Badge>}
                {kindWord(id) !== groupOf(id) && (
                  <Badge kind="plain">{kindWord(id)}</Badge>
                )}
              </View>
            </View>
            <Btn small label="Close" onPress={onClose} />
          </View>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}>
          {desc ? (
            <Card><Text style={s.body}>{desc}</Text></Card>
          ) : (
            <Card><Text style={[s.body, { color: T.faint }]}>
              The game files carry no description for this item.
            </Text></Card>
          )}

          {(st || facts?.capture != null || (it.weight ?? 0) > 0
            || (it.price ?? 0) > 0 || (it.maxStack ?? 0) > 1) && (
            <Card style={{ marginTop: 10 }}>
              <Text style={s.h3}>The numbers</Text>
              <View style={{ marginTop: 6, gap: 3 }}>
                {st?.atk != null && <Fact label="Attack" value={String(st.atk)} />}
                {st?.def != null && <Fact label="Defense" value={String(st.def)} />}
                {st?.hp != null && <Fact label="Health bonus" value={`+${st.hp}`} />}
                {st?.shield != null && <Fact label="Shield" value={String(st.shield)} />}
                {st?.durability != null && <Fact label="Durability" value={String(st.durability)} />}
                {st?.magazine != null && <Fact label="Magazine" value={`${st.magazine} round${st.magazine === 1 ? '' : 's'}`} />}
                {facts?.capture != null && (
                  <Fact label="Capture Power" value={facts.capture} />
                )}
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

          {facts?.effects && facts.effects.length > 0 && (
            <Card style={{ marginTop: 10 }}>
              <Text style={s.h3}>What it does</Text>
              <View style={{ marginTop: 6, gap: 3 }}>
                {facts.effects.map(([k, v]) => (
                  <Fact key={k + v} label={k} value={v} />
                ))}
              </View>
            </Card>
          )}

          {(facts?.recipe || facts?.tech) && (
            <Card style={{ marginTop: 10 }}>
              <Text style={s.h3}>How to craft it</Text>
              {facts.tech && (
                <Text style={[s.body, {
                  marginTop: 4, fontSize: 12.5,
                  color: facts.tech.ancient ? T.goldInk : T.accentInk,
                }]}>
                  {techLine(facts.tech)}
                </Text>
              )}
              {facts.recipe && (
                <View style={{ marginTop: 6 }}>
                  {facts.recipe.map((r) => (
                    <IngredientRow key={r.id} row={r} onOpenItem={onOpenItem} />
                  ))}
                </View>
              )}
              {facts.recipesMore && facts.recipesMore.length > 0 && (
                <View style={{ marginTop: 8 }}>
                  <Text style={[s.body, { fontSize: 12, color: T.muted }]}>
                    Higher tiers are crafted with the schematic and cost more:
                  </Text>
                  {facts.recipesMore.map((block, i) => (
                    <Text key={i} style={[s.body, { fontSize: 12, marginTop: 3, color: T.faint }]}>
                      {block.map((r) => `${r.n}× ${ITEMS[r.id]?.name ?? r.id}`).join(' · ')}
                    </Text>
                  ))}
                </View>
              )}
            </Card>
          )}

          {(facts?.drops || facts?.boxes || facts?.shops) && (
            <Card style={{ marginTop: 10 }}>
              <Text style={s.h3}>Where to find it</Text>
              {facts.drops && facts.drops.length > 0 && (
                <View style={{ marginTop: 6, gap: 3 }}>
                  {facts.drops.slice(0, 8).map((d, i) => (
                    <View key={i} style={[s.row, { gap: 8 }]}>
                      <Text style={[s.body, { fontSize: 12.5, flex: 1 }]} numberOfLines={1}>
                        {d.src}
                      </Text>
                      <Text style={{ color: T.muted, fontSize: 12 }}>
                        {d.n ? `${d.n} · ` : ''}{d.p}
                      </Text>
                    </View>
                  ))}
                  {facts.drops.length > 8 && (
                    <Text style={[s.body, { fontSize: 11.5, color: T.faint }]}>
                      …and {facts.drops.length - 8} more drop sources
                    </Text>
                  )}
                </View>
              )}
              {facts.boxes && facts.boxes.length > 0 && (
                <View style={{ marginTop: facts.drops ? 10 : 6, gap: 3 }}>
                  <Text style={{ color: T.faint, fontSize: 10.5, fontWeight: '800', letterSpacing: 1 }}>
                    TREASURE & CHESTS
                  </Text>
                  {facts.boxes.slice(0, 6).map((b, i) => (
                    <View key={i} style={[s.row, { gap: 8 }]}>
                      <Text style={[s.body, { fontSize: 12.5, flex: 1 }]} numberOfLines={1}>
                        {b.src}
                      </Text>
                      <Text style={{ color: T.muted, fontSize: 12 }}>
                        {b.n ? `${b.n} · ` : ''}{b.p}
                      </Text>
                    </View>
                  ))}
                  {facts.boxes.length > 6 && (
                    <Text style={[s.body, { fontSize: 11.5, color: T.faint }]}>
                      …and {facts.boxes.length - 6} more chests and boxes
                    </Text>
                  )}
                </View>
              )}
              {facts.shops && facts.shops.length > 0 && (
                <View style={{ marginTop: (facts.drops || facts.boxes) ? 10 : 6 }}>
                  <Text style={{ color: T.faint, fontSize: 10.5, fontWeight: '800', letterSpacing: 1 }}>
                    SOLD BY
                  </Text>
                  <Text style={[s.body, { fontSize: 12.5, marginTop: 3 }]}>
                    {facts.shops.join(' · ')}
                  </Text>
                </View>
              )}
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
            Names, descriptions and numbers are the game's own — the item
            table from the official server package, per-tier stats and
            recipes accepted only at exact internal-id identity, and the
            technology tree's levels and point costs joined the same way.
            Drop rates and shop listings are the community database's
            readings of the game's loot tables.
          </Text>
        </ScrollView>
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

/* ---------------- the filter sheet (the Paldex's pattern) ---------------- */

/** Stable identity, same as ui/FilterSheet's Chip — declared at module level
 * so chips aren't rebuilt on every tap. */
function Chip({ on, label, tint, onPress }: {
  on: boolean; label: string; tint?: string; onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${label}${on ? ', selected' : ''}`}
      style={{
        backgroundColor: on ? T.accentSoft : T.surface2,
        borderWidth: 1.5, borderColor: on ? T.accent : T.line,
        borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7,
      }}>
      <Text style={{
        color: on ? T.accentInk : tint ?? T.muted,
        fontWeight: '700', fontSize: 12.5,
      }}>{label}</Text>
    </Pressable>
  );
}

const Section = ({ title, children }: {
  title: string; children: React.ReactNode;
}) => (
  <View style={{ gap: 7 }}>
    <Text style={{
      color: T.faint, fontSize: 10.5, fontWeight: '800',
      letterSpacing: 1, textTransform: 'uppercase',
    }}>{title}</Text>
    <View style={[s.wrap]}>{children}</View>
  </View>
);

function ItemFilterSheet({ filters, sort, home, onApply, onClose }: {
  filters: ItemFilters; sort: ItemSort; home: string;
  onApply: (f: ItemFilters, sk: ItemSort) => void; onClose: () => void;
}) {
  const [f, setF] = useState<ItemFilters>(filters);
  const [sk, setSk] = useState<ItemSort>(sort);
  const kinds = f.group === 'all' ? [] : kindsInGroup(f.group);

  // every chip turns OFF when tapped again (the CEO once hit a sort chip
  // he could not un-choose) — radio groups fall back to neutral
  const pickGroup = (g: string) =>
    setF({ ...f, group: f.group === g ? home : g, kind: null });
  const pickKind = (k: string) =>
    setF({ ...f, kind: f.kind === k ? null : k });
  const pickTier = (t: string) =>
    setF({
      ...f,
      tiers: f.tiers.includes(t)
        ? f.tiers.filter((x) => x !== t) : [...f.tiers, t],
    });
  const pickSort = (k: ItemSort) => setSk(sk === k ? 'power' : k);

  const n = applyItemFilters(f, '').length;
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: T.bg2 }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center', padding: 16,
          borderBottomWidth: 1, borderBottomColor: T.line,
        }}>
          <Text style={[s.h2, { flex: 1 }]}>Filter & sort</Text>
          <Btn small label="Reset"
            onPress={() => { setF({ group: home, kind: null, tiers: [] }); setSk('power'); }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: 30 }}>
          <Section title="Group">
            <Chip on={f.group === 'all'} label={`Everything · ${idsInGroup('all').length}`}
              onPress={() => pickGroup('all')} />
            {ITEM_GROUPS.map((g) => (
              <Chip key={g.id} on={f.group === g.id}
                label={`${g.label} · ${idsInGroup(g.id).length}`}
                onPress={() => pickGroup(g.id)} />
            ))}
          </Section>
          {kinds.length >= 2 && (
            <Section title="Kind">
              {kinds.map((k) => (
                <Chip key={k.kind} on={f.kind === k.kind}
                  label={`${k.kind} · ${k.count}`}
                  onPress={() => pickKind(k.kind)} />
              ))}
            </Section>
          )}
          <Section title="Tier">
            {TIER_WORDS.map((t) => (
              <Chip key={t} on={f.tiers.includes(t)} label={t}
                tint={TIER_TINTS[t]} onPress={() => pickTier(t)} />
            ))}
          </Section>
          <Section title="Order">
            <Chip on={sk === 'power'} label="Strongest first" onPress={() => setSk('power')} />
            <Chip on={sk === 'name'} label="A–Z" onPress={() => pickSort('name')} />
            <Chip on={sk === 'rarity'} label="Rarest first" onPress={() => pickSort('rarity')} />
          </Section>
        </ScrollView>
        <View style={{
          flexDirection: 'row', gap: 10, padding: 16,
          borderTopWidth: 1, borderTopColor: T.line,
        }}>
          <View style={{ flex: 1 }}>
            <Btn primary label={`Show ${n} ${n === 1 ? 'item' : 'items'}`}
              onPress={() => onApply(f, sk)} />
          </View>
          <Btn label="Cancel" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

/* ---------------- the screen ---------------- */

export function ItemsScreen({ initialGroup = 'weapons' }: { initialGroup?: string }) {
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<ItemFilters>({
    group: initialGroup, kind: null, tiers: [],
  });
  const [sort, setSort] = useState<ItemSort>('power');
  const [sheet, setSheet] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const searching = q.trim().length > 0;
  const ids = useMemo(
    () => sortItems(applyItemFilters(filters, q), sort),
    [filters, q, sort],
  );

  // the summary line: everything narrowing the list beyond the tab's home
  const activeBits: string[] = [];
  if (filters.group !== initialGroup) {
    activeBits.push(filters.group === 'all' ? 'Everything'
      : ITEM_GROUPS.find((g) => g.id === filters.group)?.label ?? filters.group);
  }
  if (filters.kind) activeBits.push(filters.kind);
  if (filters.tiers.length) activeBits.push(filters.tiers.join('/'));
  if (sort !== 'power') activeBits.push(SORT_LABELS[sort]);

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
        <Btn small label={activeBits.length ? `Filters · ${activeBits.length}` : 'Filters'}
          primary={activeBits.length > 0}
          onPress={() => setSheet(true)} />
      </View>
      {activeBits.length > 0 && !searching && (
        <View style={[s.wrap, { marginBottom: 8 }]}>
          <Text style={{ color: T.accentInk, fontSize: 11.5, fontWeight: '700' }}>
            {activeBits.join(' · ')}
          </Text>
          <Pressable
            onPress={() => {
              setFilters({ group: initialGroup, kind: null, tiers: [] });
              setSort('power');
            }}
            accessibilityRole="button"
            accessibilityLabel="Clear all filters and sorting">
            <Text style={{ color: T.faint, fontSize: 11.5, fontWeight: '800' }}> ✕ clear</Text>
          </Pressable>
        </View>
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
        keyboardDismissMode="on-drag"
        initialNumToRender={14}
        windowSize={7}
        renderItem={({ item: id }) => (
          <ItemRow id={id} showGroup={searching || filters.group === 'all'} onOpen={setOpen} />
        )}
        ListEmptyComponent={!searching ? (
          <Text style={[s.body, { textAlign: 'center', marginTop: 30 }]}>
            Nothing matches those filters.
          </Text>
        ) : null}
        contentContainerStyle={{ paddingBottom: 40 }}
      />
      {open && (
        <ItemDetail id={open} onClose={() => setOpen(null)} onOpenItem={setOpen} />
      )}
      {sheet && (
        <ItemFilterSheet filters={filters} sort={sort} home={initialGroup}
          onApply={(f, sk) => { setFilters(f); setSort(sk); setSheet(false); }}
          onClose={() => setSheet(false)} />
      )}
    </View>
  );
}
