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
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, Share, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { T } from '../theme';
import { Badge, Btn, Card, PageHead, SearchInput, s } from '../ui/kit';
import {
  ammoForWeapon, collapseFamilies, effectNumber, familyOf, familyPowerOf,
  groupOf, hasNoKnownSource, idsInGroup, implantPassive, ITEM_GROUPS,
  ITEM_STATS, ITEMS,
  kindPhrase, kindsInGroup, kindWord, palsDropping, palsHatchingFrom, rawMaterialsFor,
  buildTotals, rankAxisOf, rankValueOf, rivalsOf, rollupOfMats, schematicsFor,
  searchItems, sortItems, statRank, TAB_GROUPS, teachesOf, TIER_WORDS,
  tierWord, usedInOf, weaponsForAmmo, type ItemSort,
} from '../itemsData';
import { equipPassiveName, ITEM_FACTS, type CraftRow } from '../itemFacts';
import { ItemIcon } from '../ui/ItemIcon';
import { Icon } from '../ui/Icon';
import { navigateTo, onNavIntent, takeIntentPayload } from '../nav/intent';
import {
  shareTextForBuild, shareTextForItem, techSentence,
} from '../itemShare';
import {
  addToBuild, breeding, buildQty, clearBuild, getBuildList, getPlayerLevel,
  setBuildQty, useAppVersion,
} from '../store';

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
  group: string;          // group id, 'other' or 'all'
  kind: string | null;    // a kindWord within the group
  tiers: string[];        // tier words, empty = all
  /** show every rarity tier as its own row (default: one row per family) */
  expand: boolean;
  /** IL21: only what the player's own technology level can unlock */
  reachable: boolean;
}

/** The family's easiest unlock level — a bow you can already build at 12
 * shouldn't hide because its Legendary tier wants 50. */
function unlockLevel(id: string): number | undefined {
  const levels = familyOf(id)
    .map((i) => ITEM_FACTS[i]?.tech?.level)
    .filter((n): n is number => n != null);
  return levels.length ? Math.min(...levels) : undefined;
}

function applyItemFilters(f: ItemFilters, q: string, level?: number): string[] {
  let ids = q.trim() ? searchItems(q) : idsInGroup(f.group);
  if (f.kind) ids = ids.filter((i) => kindWord(i) === f.kind);
  if (f.expand && f.tiers.length) {
    ids = ids.filter((i) => f.tiers.includes(
      ITEM_STATS[i]?.tier ?? tierWord(ITEMS[i].rarity)));
  }
  if (f.reachable && level != null) {
    // items with no technology entry aren't locked BY tech — they stay
    ids = ids.filter((i) => (unlockLevel(i) ?? 0) <= level);
  }
  return f.expand ? ids : collapseFamilies(ids);
}

function statLine(id: string): string {
  const st = ITEM_STATS[id];
  const bits: string[] = [];
  if (st?.atk != null) bits.push(`Attack ${st.atk}`);
  if (st?.def != null) bits.push(`Defense ${st.def}`);
  if (st?.hp != null) bits.push(`+${st.hp} Health`);
  if (st?.durability != null) bits.push(`durability ${st.durability}`);
  if (st?.magazine != null) bits.push(`${st.magazine} round${st.magazine === 1 ? '' : 's'}`);
  if (!bits.length) {
    // food and consumables compete on their effects, not combat stats
    const nut = effectNumber(id, 'Nutrition');
    const san = effectNumber(id, 'SAN');
    if (nut != null) bits.push(`Nutrition ${nut}`);
    if (san != null) bits.push(`SAN ${san}`);
  }
  if (!bits.length && ITEMS[id].category === 'Blueprint') {
    // a schematic row's whole point is what it teaches (IL15 — 490 rows
    // used to say nothing but "Schematic")
    const t = teachesOf(id);
    if (t) {
      bits.push(t.tier > 1
        ? `Teaches ${ITEMS[t.id].name} · tier ${t.tier}`
        : `Teaches ${ITEMS[t.id].name}`);
    }
  }
  if (!bits.length) {
    // an implant row's whole point is its passive (IL27 — the card
    // gained it at IL25 but the row still said "Passive skill item")
    const imp = implantPassive(id);
    if (imp) bits.push(`${imp.name} · ${imp.effects}`);
  }
  if (!bits.length) {
    // spheres show their capture power; accessories their grant; gliders
    // and meds their first effect (IL16 — the data was already shipped,
    // the rows just never used it)
    const facts = ITEM_FACTS[id];
    if (facts?.capture != null) {
      bits.push(`Capture Power ${facts.capture}`);
    } else if (facts?.grants?.length) {
      bits.push(facts.grants[0]
        + (facts.grants.length > 1 ? ` +${facts.grants.length - 1}` : ''));
    } else if (facts?.effects?.length) {
      const [k, v] = facts.effects[0];
      bits.push(`${k} ${v}`);
    }
  }
  return bits.join(' · ');
}

/** A collapsed row's line: the family's span, not one tier's numbers. */
function familyLine(fam: string[]): string {
  const lo = ITEM_STATS[fam[0]];
  const hi = ITEM_STATS[fam[fam.length - 1]];
  const span = (k: 'atk' | 'def' | 'hp'): string | null => {
    const a = lo?.[k];
    const b = hi?.[k];
    if (a == null || b == null) return null;
    return a === b ? `${a}` : `${a}–${b}`;
  };
  const atk = span('atk');
  if (atk) return `Attack ${atk}`;
  const def = span('def');
  if (def) return `Defense ${def}`;
  return statLine(fam[0]) || kindWord(fam[0]);
}

function TierChip({ id, size = 12 }: { id: string; size?: number }) {
  const word = ITEM_STATS[id]?.tier ?? tierWord(ITEMS[id].rarity);
  return (
    <Text style={{
      color: TIER_TINTS[word] ?? T.muted, fontSize: size, fontWeight: '800',
    }}>{word}</Text>
  );
}

function ItemRow({ id, showGroup, collapsed, level, onOpen }: {
  id: string; showGroup: boolean; collapsed?: boolean; level?: number;
  onOpen: (id: string) => void;
}) {
  const it = ITEMS[id];
  // out of reach at the player's own level — the row says so instead of
  // making them open the card to find out (IL21)
  const need = unlockLevel(id);
  const lockedAt = level != null && need != null && need > level ? need : null;
  const fam = collapsed ? familyOf(id) : [id];
  const tiers = fam.length;
  const line = tiers > 1 ? familyLine(fam) : statLine(id);
  const word = ITEM_STATS[id]?.tier ?? tierWord(it.rarity);
  const topWord = ITEM_STATS[fam[tiers - 1]]?.tier
    ?? tierWord(ITEMS[fam[tiers - 1]].rarity);
  const inBuild = buildQty(id);
  // only things you MAKE go on a build list — holding a raw material
  // would add a row nobody asked for
  const facts = ITEM_FACTS[id];
  const craftable = !!(facts?.recipe || facts?.crafts || facts?.recipesMore);
  return (
    <Pressable
      onPress={() => onOpen(id)}
      // IL45: a button in this row was MEASURED and refused — long
      // names already clip here ("Disposable Implant: Demon's Hand"
      // needs 252px in a 199px slot), so another control would make
      // the list worse to read. A long-press costs no width at all.
      onLongPress={craftable ? () => {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        void addToBuild(id);
      } : undefined}
      accessibilityRole="button"
      accessibilityLabel={(tiers > 1
        ? `${it.name}, ${tiers} tiers up to ${topWord}`
        : `${it.name}, ${word}`)
        + (inBuild > 0 ? `, ${inBuild} on your build list` : '')
        + '. Open its card'
        + (craftable ? '. Hold to add it to your build' : '')}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12,
        backgroundColor: pressed ? T.surface2 : T.surface,
        borderWidth: 1, borderColor: T.line, marginBottom: 6,
        borderLeftWidth: 3,
        borderLeftColor: TIER_TINTS[tiers > 1 ? topWord : word] ?? T.line,
      })}>
      <ItemIcon icon={it.icon} size={40}
        tint={TIER_TINTS[tiers > 1 ? topWord : word]} />
      <View style={{ flex: 1 }}>
        <View style={[s.row, { gap: 8 }]}>
          <Text style={{ color: T.ink, fontWeight: '800', fontSize: 14.5, flex: 1 }}
            numberOfLines={1}>{it.name}</Text>
          {tiers > 1 ? (
            <Text style={{
              color: TIER_TINTS[topWord] ?? T.muted, fontSize: 11.5, fontWeight: '800',
            }}>{tiers} tiers</Text>
          ) : <TierChip id={id} />}
        </View>
        <View style={[s.row, { gap: 8, marginTop: 2 }]}>
          <Text style={{ color: T.muted, fontSize: 12, flex: 1 }} numberOfLines={1}>
            {line || kindWord(id)}
            {showGroup && groupOf(id) ? `  ·  ${groupOf(id)}` : ''}
          </Text>
          {/* the player's own state outranks the game's trivia — a row
              on the build list says so before it says its weight.
              BOTH show together when both apply: IL45's marker was
              REPLACING the out-of-reach level, so adding a thing you
              cannot build yet quietly hid the one warning about it
              (self-caught at IL46, the tick that reads these levels). */}
          {inBuild > 0 ? (
            <View style={[s.row, { gap: 5 }]}>
              {lockedAt != null && (
                <Text style={{ color: T.goldInk, fontSize: 11, fontWeight: '700' }}>
                  Lv {lockedAt}
                </Text>
              )}
              <Text style={{ color: T.accentInk, fontSize: 11, fontWeight: '800' }}>
                ×{inBuild} building
              </Text>
            </View>
          ) : lockedAt != null ? (
            <Text style={{ color: T.goldInk, fontSize: 11, fontWeight: '700' }}>
              Lv {lockedAt}
            </Text>
          ) : it.weight != null && it.weight > 0 && (
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

/** A material list as tappable chips (IL34). The card's rule since IL31
 * is that every item name is a door; these lists were the last places
 * where a name was flat text, so "40× Nightstar Sand" inside a tier now
 * opens the same card the identical row above it does. Wraps, so a
 * five-material tier and an eleven-step bill both fit a phone. */
function MatChips({ rows, onOpenItem, dim = false }: {
  rows: CraftRow[]; onOpenItem: (id: string) => void; dim?: boolean;
}) {
  return (
    <View style={[s.row, { flexWrap: 'wrap', gap: 6, marginTop: 4 }]}>
      {rows.map((r) => {
        const it = ITEMS[r.id];
        if (!it) return null;
        return (
          <Pressable
            key={r.id}
            onPress={() => onOpenItem(r.id)}
            accessibilityRole="button"
            accessibilityLabel={`${r.n} ${it.name}. Open its card`}
            style={({ pressed }) => ({
              paddingVertical: 3, paddingHorizontal: 7, borderRadius: T.rSm,
              backgroundColor: pressed ? T.raised : T.surface2,
            })}>
            <Text style={{
              color: dim ? T.muted : T.accentInk,
              fontSize: 11.5, fontWeight: '700',
            }}>
              {r.n}× {it.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The build list, summed (IL43) — the question the per-item bills
 * could not answer: "I want all of THIS, what do I actually need?"
 * Collapsed to one line until the player opens it, and invisible
 * entirely until they put something on it, so the index a player who
 * never uses this feature sees is exactly the index they see today. */
function BuildPanel({ onOpenItem }: { onOpenItem: (id: string) => void }) {
  useAppVersion();
  const [open, setOpen] = useState(false);
  const list = getBuildList();
  const ids = Object.keys(list);
  if (!ids.length) return null;
  const totals = buildTotals(list);
  const things = ids.reduce((a, i) => a + list[i], 0);
  // IL46: the row already says "Lv 67" when the player's own technology
  // level cannot reach a thing, and this panel ignored it — so a list
  // could send someone off to farm 376 Ore for something twenty levels
  // away. Only when a level is actually SET (IL21's rule: no level, no
  // claim), and never a block — planning ahead is allowed.
  const level = getPlayerLevel();
  const locked = level == null
    ? [] : ids.filter((i) => (unlockLevel(i) ?? 0) > level);
  return (
    <Card style={{ marginBottom: 8 }}>
      <Pressable
        onPress={() => setOpen(!open)}
        accessibilityRole="button"
        accessibilityLabel={open
          ? 'Hide what your build needs'
          : `Your build: ${things} thing${things === 1 ? '' : 's'}. Show what it needs`}
        style={[s.row, { gap: 8 }]}>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} color={T.accentInk} />
        <Text style={[s.h3, { flex: 1 }]}>
          My build — {things} thing{things === 1 ? '' : 's'}
        </Text>
        {/* collapsed, this line is all a player reads before going off
            to farm — so an out-of-reach item outranks the count */}
        {locked.length > 0 ? (
          <Text style={{ color: T.goldInk, fontSize: 12, fontWeight: '700' }}>
            {locked.length} out of reach
          </Text>
        ) : (
          <Text style={{ color: T.muted, fontSize: 12 }}>
            {totals.gather.length} to gather
          </Text>
        )}
      </Pressable>
      {open && (
        <View style={{ marginTop: 8 }}>
          <Text style={[s.body, { fontSize: 11.5, color: T.muted }]}>
            What you are making
          </Text>
          <View style={{ marginTop: 4 }}>
            {ids.map((i) => (
              <View key={i} style={[s.row, { gap: 8, paddingVertical: 3 }]}>
                <Text style={{ color: T.ink, width: 34, fontSize: 12.5, fontWeight: '800', textAlign: 'right' }}>
                  {list[i]}×
                </Text>
                <Pressable
                  onPress={() => onOpenItem(i)}
                  accessibilityRole="button"
                  accessibilityLabel={`${list[i]} ${ITEMS[i].name}. Open its card`}
                  style={{ flex: 1 }}>
                  <Text style={{ color: T.accentInk, fontSize: 12.5, fontWeight: '700' }}
                    numberOfLines={1}>
                    {ITEMS[i].name}
                  </Text>
                </Pressable>
                <Btn small label="Remove"
                  onPress={() => { void setBuildQty(i, 0); }} />
              </View>
            ))}
          </View>
          {locked.length > 0 && (
            <Text style={[s.body, {
              fontSize: 12, color: T.goldInk, marginTop: 6,
            }]}>
              {locked.length === 1
                ? `${ITEMS[locked[0]].name} needs technology level ${unlockLevel(locked[0])} — you are level ${level}.`
                : `${locked.length} of these need a higher technology level than ${level}: `
                  + locked.map((i) => `${ITEMS[i].name} (Lv ${unlockLevel(i)})`).join(', ')}
            </Text>
          )}
          <Text style={[s.body, {
            fontSize: 11.5, color: T.muted, marginTop: 8, paddingTop: 8,
            borderTopWidth: 1, borderTopColor: T.line,
          }]}>
            Everything you need from scratch
          </Text>
          <MatChips rows={totals.gather} onOpenItem={onOpenItem} />
          {totals.steps.length > 0 && (
            <>
              <Text style={[s.body, { fontSize: 11.5, color: T.faint, marginTop: 8 }]}>
                Crafted along the way, in this order
              </Text>
              <MatChips rows={totals.steps} onOpenItem={onOpenItem} dim />
            </>
          )}
          <View style={[s.row, { gap: 8, marginTop: 10 }]}>
            <Btn small label="Share my build…"
              onPress={() => {
                void Share.share({
                  message: shareTextForBuild(list, breeding.game_version),
                });
              }} />
            <Btn small label="Clear my build"
              onPress={() => { void clearBuild(); }} />
          </View>
        </View>
      )}
    </Card>
  );
}

const techLine = techSentence;

/** "1h6m40s" -> "1h 6m 40s" — the page's compact time, made readable. */
const spaceTime = (t: string): string =>
  t.replace(/([hms])(?=[0-9])/g, '$1 ');

function ItemDetail({ id, trail = [], onClose, onBack, onOpenItem }: {
  id: string; trail?: string[]; onClose: () => void; onBack?: () => void;
  onOpenItem: (id: string) => void;
}) {
  // which schematic tier has its full cost opened out (one at a time)
  const [openTier, setOpenTier] = useState<string | null>(null);
  useAppVersion();                       // the build stepper reads the store
  const wanted = buildQty(id);
  const cameFrom = trail.length ? ITEMS[trail[trail.length - 1]] : null;
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
          {cameFrom && onBack && (
            <Pressable
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel={`Back to ${cameFrom.name}`}
              style={({ pressed }) => [s.row, {
                gap: 5, marginBottom: 8, alignSelf: 'flex-start',
                opacity: pressed ? 0.6 : 1,
              }]}>
              <Icon name="chevron-left" size={16} color={T.accentInk} />
              <Text style={{ color: T.accentInk, fontSize: 12.5, fontWeight: '700' }}
                numberOfLines={1}>
                {cameFrom.name}
              </Text>
            </Pressable>
          )}
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
            <View style={{ gap: 6 }}>
              <Btn small label="Close" onPress={onClose} />
              <Btn small label="Share"
                onPress={() => {
                  void Share.share({
                    message: shareTextForItem(id, breeding.game_version),
                  });
                }} />
            </View>
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
                {st?.atk != null && (
                  <Fact label="Attack" value={(() => {
                    const r = statRank(id, 'atk');
                    return r ? `${st.atk} · #${r.rank} of ${r.of}` : String(st.atk);
                  })()} />
                )}
                {st?.def != null && (
                  <Fact label="Defense" value={(() => {
                    const r = statRank(id, 'def');
                    return r ? `${st.def} · #${r.rank} of ${r.of}` : String(st.def);
                  })()} />
                )}
                {st?.hp != null && (
                  <Fact label="Health bonus" value={(() => {
                    const r = statRank(id, 'hp');
                    return r ? `+${st.hp} · #${r.rank} of ${r.of}` : `+${st.hp}`;
                  })()} />
                )}
                {st?.shield != null && <Fact label="Shield" value={String(st.shield)} />}
                {st?.durability != null && <Fact label="Durability" value={String(st.durability)} />}
                {st?.magazine != null && <Fact label="Magazine" value={`${st.magazine} round${st.magazine === 1 ? '' : 's'}`} />}
                {facts?.capture != null && (
                  <Fact label="Capture Power" value={facts.capture} />
                )}
                {st?.passives && st.passives.length > 0 && (
                  <Fact label={st.passives.length === 1
                    ? 'Wears the passive' : 'Wears the passives'}
                    value={st.passives.map(equipPassiveName).join(' · ')} />
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

          {(() => {
            // IL25: an implant's whole point is the passive it gives —
            // read from the same datamined passives table the breeding
            // fane uses (40 of 40 implants join exactly)
            const p = implantPassive(id);
            if (!p) return null;
            return (
              <Card style={{ marginTop: 10 }}>
                <Text style={s.h3}>The passive it gives</Text>
                <View style={[s.row, { gap: 8, marginTop: 5 }]}>
                  <Text style={{ color: T.accentInk, fontSize: 13.5, fontWeight: '800' }}>
                    {p.name}
                  </Text>
                  <Badge kind="plain">{`Tier ${p.tier}`}</Badge>
                </View>
                <Text style={[s.body, { marginTop: 4, fontSize: 12.5 }]}>
                  {p.effects}
                </Text>
              </Card>
            );
          })()}

          {facts?.grants && facts.grants.length > 0 && (
            <Card style={{ marginTop: 10 }}>
              <Text style={s.h3}>What it grants</Text>
              <Text style={[s.body, { marginTop: 5, fontSize: 12.5 }]}>
                {facts.grants.join(' · ')}
              </Text>
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
              {facts.craftWork != null && (
                <Text style={[s.body, { marginTop: 3, fontSize: 12, color: T.muted }]}>
                  {facts.craftTime
                    ? `${facts.craftWork.toLocaleString()} work — about ${spaceTime(facts.craftTime)} with Handiwork Lv. 1`
                    : `${facts.craftWork.toLocaleString()} work`}
                </Text>
              )}
              {facts.recipe && (
                <View style={{ marginTop: 6 }}>
                  {facts.recipe.map((r) => (
                    <IngredientRow key={r.id} row={r} onOpenItem={onOpenItem} />
                  ))}
                </View>
              )}
              {(() => {
                // IL32: the recipe says "30 Plasteel"; this says what
                // that COSTS you at the ore. Only when the tree is
                // deeper than the recipe — otherwise it repeats it.
                const roll = rawMaterialsFor(id);
                if (!roll.steps.length) return null;
                return (
                  <View style={{
                    marginTop: 10, paddingTop: 8,
                    borderTopWidth: 1, borderTopColor: T.line,
                  }}>
                    <Text style={[s.body, { fontSize: 12, color: T.muted }]}>
                      Everything you need from scratch
                    </Text>
                    <View style={{ marginTop: 4 }}>
                      {roll.gather.map((r) => (
                        <IngredientRow key={r.id} row={r} onOpenItem={onOpenItem} />
                      ))}
                    </View>
                    <Text style={[s.body, {
                      fontSize: 12, color: T.faint, marginTop: 6,
                    }]}>
                      Crafted along the way, in this order:
                    </Text>
                    <MatChips rows={roll.steps} onOpenItem={onOpenItem} />
                  </View>
                );
              })()}
              {facts.crafts && facts.crafts.length > 0 ? (
                <View style={{ marginTop: 8 }}>
                  <Text style={[s.body, { fontSize: 12, color: T.muted }]}>
                    {facts.crafts.length === 1 && facts.crafts[0].product === id
                      ? 'Crafted with its schematic:'
                      : 'Higher tiers, each with its schematic:'}
                  </Text>
                  {facts.crafts.map((c) => {
                    // IL33: a tier's own recipe hides the same depth the
                    // base one did — the Legendary Beam Sword's "60
                    // Plasteel" is really 376 Ore. Opened on tap, one at
                    // a time, so five tiers can't bury the card.
                    const roll = rollupOfMats(c.mats, c.product);
                    const deep = roll.steps.length > 0;
                    const shown = openTier === c.product;
                    // every tier shares the family's name, so the tier
                    // word is the only thing that tells them apart when
                    // the label is read aloud
                    const tierName = [
                      ITEM_STATS[c.product]?.tier ?? tierWord(ITEMS[c.product]?.rarity ?? 0),
                      ITEMS[c.product]?.name ?? c.product,
                    ].join(' ');
                    return (
                      <View key={c.product} style={{ marginTop: 5 }}>
                        <View style={[s.row, { gap: 8 }]}>
                          <TierChip id={c.product} />
                          {c.schematic && (
                            <Pressable
                              onPress={() => onOpenItem(c.schematic!)}
                              accessibilityRole="button"
                              accessibilityLabel={`${ITEMS[c.schematic]?.name}. Open its card`}>
                              <Text style={{ color: T.accentInk, fontSize: 12, fontWeight: '700' }}>
                                {ITEMS[c.schematic]?.name}
                              </Text>
                            </Pressable>
                          )}
                        </View>
                        <MatChips rows={c.mats} onOpenItem={onOpenItem} />
                        {deep && (
                          <Pressable
                            onPress={() => setOpenTier(shown ? null : c.product)}
                            accessibilityRole="button"
                            accessibilityLabel={shown
                              ? `Hide what the ${tierName} really costs`
                              : `Show what the ${tierName} really costs from scratch`}
                            style={({ pressed }) => [s.row, {
                              gap: 3, marginTop: 3, alignSelf: 'flex-start',
                              opacity: pressed ? 0.6 : 1,
                            }]}>
                            <Icon name={shown ? 'chevron-up' : 'chevron-down'}
                              size={14} color={T.accentInk} />
                            <Text style={{ color: T.accentInk, fontSize: 11.5, fontWeight: '700' }}>
                              {shown ? 'Hide the full cost' : 'What it really costs'}
                            </Text>
                          </Pressable>
                        )}
                        {deep && shown && (
                          <View style={{
                            marginTop: 4, paddingLeft: 8,
                            borderLeftWidth: 2, borderLeftColor: T.line2,
                          }}>
                            <Text style={[s.body, { fontSize: 11.5, color: T.muted }]}>
                              From scratch
                            </Text>
                            <MatChips rows={roll.gather} onOpenItem={onOpenItem} />
                            <Text style={[s.body, {
                              fontSize: 11.5, marginTop: 6, color: T.faint,
                            }]}>
                              Crafted along the way
                            </Text>
                            <MatChips rows={roll.steps} onOpenItem={onOpenItem} dim />
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              ) : facts.recipesMore && facts.recipesMore.length > 0 && (
                <View style={{ marginTop: 8 }}>
                  <Text style={[s.body, { fontSize: 12, color: T.muted }]}>
                    Higher tiers are crafted with the schematic and cost more:
                  </Text>
                  {facts.recipesMore.map((block, i) => (
                    <MatChips key={i} rows={block} onOpenItem={onOpenItem} />
                  ))}
                </View>
              )}
              {/* IL43: the one thing a per-item bill cannot do is add
                  up. This lives on things you MAKE — a stepper on all
                  1,892 cards would be clutter that answers nothing. */}
              <View style={[s.row, {
                gap: 8, marginTop: 10, paddingTop: 8,
                borderTopWidth: 1, borderTopColor: T.line,
              }]}>
                {wanted > 0 ? (
                  <>
                    <Text style={[s.body, { fontSize: 12, color: T.muted, flex: 1 }]}>
                      On your build list — {wanted}
                    </Text>
                    <Btn small label="−"
                      onPress={() => { void setBuildQty(id, wanted - 1); }} />
                    <Btn small label="+"
                      onPress={() => { void addToBuild(id); }} />
                  </>
                ) : (
                  <>
                    <Btn small label="Add to my build"
                      onPress={() => { void addToBuild(id); }} />
                    {/* the long-press shortcut is invisible unless it is
                        taught, and this is exactly where a player is
                        already thinking about their build (IL45) */}
                    <Text style={[s.body, {
                      fontSize: 11, color: T.faint, flex: 1,
                    }]}>
                      or hold any row in the list
                    </Text>
                  </>
                )}
              </View>
            </Card>
          )}

          {(() => {
            // spheres <-> modules: the game frames every module as a
            // sphere attachment ("Equipping it makes the sphere...") —
            // surface the whole family both ways
            const sub = ITEMS[id].subcategory;
            const linked2 = sub === 'SPWeaponCaptureBall'
              ? {
                title: 'Sphere modules',
                ids: idsInGroup('spheres')
                  .filter((i) => ITEMS[i].category === 'CaptureItemModifier'),
              }
              : sub === 'CaptureItemModifier'
                ? {
                  title: 'Attaches to capture spheres',
                  ids: idsInGroup('spheres')
                    .filter((i) => ITEMS[i].subcategory === 'SPWeaponCaptureBall'),
                }
                : null;
            if (!linked2 || !linked2.ids.length) return null;
            return (
              <Card style={{ marginTop: 10 }}>
                <Text style={s.h3}>{linked2.title}</Text>
                <View style={[s.wrap, { marginTop: 6 }]}>
                  {linked2.ids.map((lid) => (
                    <Pressable key={lid}
                      onPress={() => onOpenItem(lid)}
                      accessibilityRole="button"
                      accessibilityLabel={`${ITEMS[lid].name}. Open its card`}
                      style={({ pressed }) => ({
                        flexDirection: 'row', alignItems: 'center', gap: 6,
                        backgroundColor: pressed ? T.surface2 : T.surface,
                        borderWidth: 1, borderColor: T.accentSoft,
                        borderRadius: 9, paddingHorizontal: 8, paddingVertical: 4,
                      })}>
                      <ItemIcon icon={ITEMS[lid].icon} size={18} />
                      <Text style={{ color: T.accentInk, fontSize: 12, fontWeight: '700' }}>
                        {ITEMS[lid].name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </Card>
            );
          })()}

          {(() => {
            const linked = ITEMS[id].category === 'Ammo'
              ? { title: 'Fits these weapons', ids: weaponsForAmmo(id) }
              : { title: 'Fires', ids: ammoForWeapon(id) };
            if (!linked.ids.length) return null;
            return (
              <Card style={{ marginTop: 10 }}>
                <Text style={s.h3}>{linked.title}</Text>
                <View style={{ marginTop: 6 }}>
                  {linked.ids.map((lid) => (
                    <Pressable key={lid}
                      onPress={() => onOpenItem(lid)}
                      accessibilityRole="button"
                      accessibilityLabel={`${ITEMS[lid].name}. Open its card`}
                      style={({ pressed }) => [s.row, {
                        gap: 10, paddingVertical: 5, paddingHorizontal: 8,
                        borderRadius: 8,
                        backgroundColor: pressed ? T.surface2 : 'transparent',
                      }]}>
                      <ItemIcon icon={ITEMS[lid].icon} size={22} />
                      <Text style={{ color: T.accentInk, fontSize: 12.5, fontWeight: '700', flex: 1 }}>
                        {ITEMS[lid].name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </Card>
            );
          })()}

          {(() => {
            const teaches = teachesOf(id);
            if (!teaches) return null;
            const target = ITEMS[teaches.id];
            return (
              <Card style={{ marginTop: 10 }}>
                <Text style={s.h3}>What it teaches</Text>
                <Pressable
                  onPress={() => onOpenItem(teaches.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${target.name}. Open its card`}
                  style={({ pressed }) => [s.row, {
                    gap: 10, marginTop: 6, paddingVertical: 5, paddingHorizontal: 8,
                    borderRadius: 8,
                    backgroundColor: pressed ? T.surface2 : 'transparent',
                  }]}>
                  <ItemIcon icon={target.icon} size={26} />
                  <Text style={{ color: T.accentInk, fontSize: 12.5, fontWeight: '700', flex: 1 }}>
                    {teaches.tier > 1
                      ? `The tier-${teaches.tier} craft of ${target.name}`
                      : `How to craft ${target.name}`}
                  </Text>
                </Pressable>
              </Card>
            );
          })()}

          {(() => {
            const schems = schematicsFor(id);
            if (!schems.length) return null;
            // the tier-craft rows above already name each schematic with
            // its exact costs — repeating them here was the IL10 sweep's
            // duplication find (Life Pendant said the same thing twice)
            if (facts?.crafts && facts.crafts.length > 0) return null;
            return (
              <Card style={{ marginTop: 10 }}>
                <Text style={s.h3}>Schematics for higher tiers</Text>
                <View style={{ marginTop: 6 }}>
                  {schems.map((sc) => {
                    const best = ITEM_FACTS[sc.id]?.boxes?.[0];
                    return (
                      <Pressable key={sc.id}
                        onPress={() => onOpenItem(sc.id)}
                        accessibilityRole="button"
                        accessibilityLabel={`${ITEMS[sc.id].name}. Open its card`}
                        style={({ pressed }) => [s.row, {
                          gap: 8, paddingVertical: 5, paddingHorizontal: 8,
                          borderRadius: 8,
                          backgroundColor: pressed ? T.surface2 : 'transparent',
                        }]}>
                        <TierChip id={sc.id} />
                        <Text style={{ color: T.accentInk, fontSize: 12.5, fontWeight: '700', flex: 1 }}
                          numberOfLines={1}>
                          {ITEMS[sc.id].name}
                        </Text>
                        {best && (
                          <Text style={{ color: T.muted, fontSize: 11.5 }} numberOfLines={1}>
                            {best.src} · {best.p}
                          </Text>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </Card>
            );
          })()}

          {(() => {
            const hatchers = palsHatchingFrom(id);
            if (!hatchers.length) {
              // IL26: the Mutated/Ominous/Dragon eggs match no pal in the
              // game's own egg table. Silence reads like a bug, so the
              // card says what we know and what we don't — and offers
              // the breeding suite, which is what a player holding an
              // egg actually wants next.
              if (ITEMS[id].subcategory !== 'MaterialPalEgg') return null;
              return (
                <Card style={{ marginTop: 10 }}>
                  <Text style={s.h3}>What hatches from it</Text>
                  <Text style={[s.body, { marginTop: 4, fontSize: 12.5 }]}>
                    The game files don&apos;t list which pals come out of this
                    egg — only the common egg types name their pals.
                  </Text>
                  <View style={{ marginTop: 8 }}>
                    <Btn small label="Open the breeding calculator"
                      onPress={() => {
                        onClose();
                        navigateTo({ domain: 'breeding', tab: 'calc' });
                      }} />
                  </View>
                </Card>
              );
            }
            return (
              <Card style={{ marginTop: 10 }}>
                <Text style={s.h3}>
                  {hatchers.length === 1
                    ? 'Hatches into this pal' : 'Hatches into these pals'}
                </Text>
                <View style={[s.wrap, { marginTop: 6 }]}>
                  {hatchers.map((pal) => (
                    <Pressable key={pal}
                      onPress={() => {
                        onClose();
                        navigateTo({
                          domain: 'breeding', tab: 'paldex',
                          payload: { pal },
                        });
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`${pal} hatches from this egg. Open the pal's card`}
                      style={({ pressed }) => ({
                        backgroundColor: pressed ? T.surface2 : T.surface,
                        borderWidth: 1, borderColor: T.accentSoft,
                        borderRadius: 9, paddingHorizontal: 8, paddingVertical: 4,
                      })}>
                      <Text style={{ color: T.accentInk, fontSize: 12, fontWeight: '700' }}>
                        {pal}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </Card>
            );
          })()}

          {hasNoKnownSource(id) && (
            /* IL41: 102 cards could say NOTHING about where the item
               comes from — no recipe, no tech, no drop, no chest, no
               shop — so they just ended, which reads like a half-built
               app rather than an honest gap. Say it plainly instead.
               The eggs get the breeding route on top, because that is
               the one thing this app can genuinely do about an egg. */
            <Card style={{ marginTop: 10 }}>
              <Text style={s.h3}>Where to find it</Text>
              <Text style={[s.body, { marginTop: 4, fontSize: 12.5 }]}>
                {ITEMS[id].subcategory === 'MaterialPalEgg'
                  ? "The game files record no drop, chest or merchant for this egg."
                  : "The game files record no recipe, drop, chest or merchant for this — nothing in the data says where it comes from."}
              </Text>
              {ITEMS[id].subcategory === 'MaterialPalEgg'
                /* the 10 eggs with no hatch table already carry this
                   button in their IL26 card — one per card, not two */
                && palsHatchingFrom(id).length > 0 && (
                <View style={{ marginTop: 8 }}>
                  <Btn small label="Open the breeding calculator"
                    onPress={() => {
                      onClose();
                      navigateTo({ domain: 'breeding', tab: 'calc' });
                    }} />
                </View>
              )}
            </Card>
          )}

          {(facts?.drops || facts?.boxes || facts?.shops
            || palsDropping(id).length > 0) && (
            <Card style={{ marginTop: 10 }}>
              <View style={[s.row, { gap: 8 }]}>
                <Text style={[s.h3, { flex: 1 }]}>Where to find it</Text>
                {/* the fence (AAA criterion 13): pal chips are game-file
                    fact; the rate rows below are the community database's
                    loot-table readings — say so where the eyes are */}
                {(facts?.drops || facts?.boxes) && (
                  <Badge kind="plain">community rates</Badge>
                )}
              </View>
              {(() => {
                // one pal, one mention: when a community rate row names a
                // pal we chip (exact name match), the rate rides the chip
                // and the row disappears (the IL11 sweep's polish note)
                const pals = palsDropping(id);
                const palSet = new Set(pals);
                const rateFor = new Map<string, string>();
                for (const d of facts?.drops ?? []) {
                  if (palSet.has(d.src) && !rateFor.has(d.src)) {
                    rateFor.set(d.src, `${d.n ? `${d.n} · ` : ''}${d.p}`);
                  }
                }
                const rows = (facts?.drops ?? []).filter((d) => !palSet.has(d.src));
                return (
                  <>
                    {pals.length > 0 && (
                      <View style={[s.wrap, { marginTop: 6 }]}>
                        {/* from OUR pal table (game files) — each chip
                            opens the pal's Paldex card */}
                        {pals.map((pal) => (
                          <Pressable key={pal}
                            onPress={() => {
                              onClose();
                              navigateTo({
                                domain: 'breeding', tab: 'paldex',
                                payload: { pal },
                              });
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={`${pal} drops this. Open the pal's card`}
                            style={({ pressed }) => ({
                              backgroundColor: pressed ? T.surface2 : T.surface,
                              borderWidth: 1, borderColor: T.accentSoft,
                              borderRadius: 9, paddingHorizontal: 8, paddingVertical: 4,
                            })}>
                            <Text style={{ color: T.accentInk, fontSize: 12, fontWeight: '700' }}>
                              {pal}
                              {rateFor.has(pal) && (
                                <Text style={{ color: T.muted, fontWeight: '600' }}>
                                  {'  '}{rateFor.get(pal)}
                                </Text>
                              )}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    )}
                    {rows.length > 0 && (
                      <View style={{ marginTop: 6, gap: 3 }}>
                        {rows.slice(0, 8).map((d, i) => (
                          <View key={i} style={[s.row, { gap: 8 }]}>
                            <Text style={[s.body, { fontSize: 12.5, flex: 1 }]} numberOfLines={1}>
                              {d.src}
                            </Text>
                            <Text style={{ color: T.muted, fontSize: 12 }}>
                              {d.n ? `${d.n} · ` : ''}{d.p}
                            </Text>
                          </View>
                        ))}
                        {rows.length > 8 && (
                          <Text style={[s.body, { fontSize: 11.5, color: T.faint }]}>
                            …and {rows.length - 8} more drop sources
                          </Text>
                        )}
                      </View>
                    )}
                  </>
                );
              })()}
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


          {facts?.research && facts.research.length > 0 && (
            <Card style={{ marginTop: 10 }}>
              <Text style={s.h3}>Feeds lab research</Text>
              <Text style={[s.body, { marginTop: 5, fontSize: 12.5 }]}>
                {facts.research.join(' · ')}
              </Text>
            </Card>
          )}

          {(() => {
            // IL20: the other half of a recipe — what this item is FOR.
            // Capped at 10 because Ancient Civilization Parts feeds 1,285
            // recipes; the count tells the honest total.
            const uses = usedInOf(id);
            if (!uses.length) return null;
            const shown = uses.slice(0, 10);
            return (
              <Card style={{ marginTop: 10 }}>
                <Text style={s.h3}>What you can make with it</Text>
                <View style={{ marginTop: 6 }}>
                  {shown.map((uid) => (
                    <Pressable key={uid}
                      onPress={() => onOpenItem(uid)}
                      accessibilityRole="button"
                      accessibilityLabel={`${ITEMS[uid].name}. Open its card`}
                      style={({ pressed }) => [s.row, {
                        gap: 10, paddingVertical: 5, paddingHorizontal: 8,
                        borderRadius: 8,
                        backgroundColor: pressed ? T.surface2 : 'transparent',
                      }]}>
                      <ItemIcon icon={ITEMS[uid].icon} size={22} />
                      <Text style={{ color: T.accentInk, fontSize: 12.5, fontWeight: '700', flex: 1 }}
                        numberOfLines={1}>{ITEMS[uid].name}</Text>
                      <Text style={{ color: T.faint, fontSize: 11.5 }}>
                        {kindWord(uid)}
                      </Text>
                    </Pressable>
                  ))}
                  {uses.length > shown.length && (
                    <Text style={[s.body, { fontSize: 11.5, color: T.faint, marginTop: 3 }]}>
                      {`…and ${uses.length - shown.length} more `
                        + `${uses.length - shown.length === 1 ? 'thing' : 'things'} it goes into.`}
                    </Text>
                  )}
                </View>
              </Card>
            );
          })()}

          {(() => {
            // IL19 compare: no picker UI on a phone — the card shows the
            // item's own kind ranked, with this family marked. One row
            // per family so five tiers of one bow can't crowd out the
            // other bows.
            const rivals = rivalsOf(id);
            // two is enough to answer "is this the good one?" (IL42);
            // it used to need three, which silently denied a rank to
            // every small kind — the Gatling guns, the raw fish
            if (rivals.length < 2) return null;
            const axis = rankAxisOf(kindWord(id));
            const mine = familyOf(id)[0];
            const at = rivals.indexOf(mine);
            const top = rivals.slice(0, 5);
            const rows = at >= 0 && at > 4 ? [...top, mine] : top;
            return (
              <Card style={{ marginTop: 10 }}>
                <Text style={s.h3}>How it stacks up</Text>
                <Text style={[s.body, { fontSize: 11.5, color: T.faint, marginTop: 2 }]}>
                  {/* say what the ranking is BY when it is not the
                      stat — "most EXP first" beats a bare number */}
                  {axis
                    ? `Every ${kindPhrase(id)} in the game, most ${axis} first`
                    : `Every ${kindPhrase(id)} in the game, best tier first`}
                </Text>
                <View style={{ marginTop: 6 }}>
                  {rows.map((rid) => {
                    const here = rid === mine;
                    const place = rivals.indexOf(rid) + 1;
                    return (
                      <Pressable key={rid}
                        onPress={() => !here && onOpenItem(rid)}
                        accessibilityRole={here ? 'text' : 'button'}
                        accessibilityLabel={here
                          ? `${ITEMS[rid].name}, number ${place}, the one you are looking at`
                          : `${ITEMS[rid].name}, number ${place}. Open its card`}
                        style={({ pressed }) => [s.row, {
                          gap: 8, paddingVertical: 5, paddingHorizontal: 8,
                          borderRadius: 8,
                          backgroundColor: here ? T.accentSoft
                            : pressed ? T.surface2 : 'transparent',
                        }]}>
                        <Text style={{
                          color: here ? T.accentInk : T.faint,
                          width: 26, fontSize: 12, fontWeight: '800',
                        }}>#{place}</Text>
                        <Text style={{
                          color: here ? T.accentInk : T.ink,
                          fontSize: 12.5, fontWeight: here ? '800' : '600', flex: 1,
                        }} numberOfLines={1}>{ITEMS[rid].name}</Text>
                        <Text style={{ color: T.muted, fontSize: 12 }}>
                          {rankValueOf(rid)}
                        </Text>
                      </Pressable>
                    );
                  })}
                  {at > 5 && (
                    <Text style={[s.body, { fontSize: 11.5, color: T.faint, marginTop: 3 }]}>
                      {`${at - 5} more sit between #5 and this one.`}
                    </Text>
                  )}
                </View>
              </Card>
            );
          })()}

          {/* a tier table of em-dashes is noise, not information — eggs
              and other stat-less families skip it (caught on the IL26
              render pass) */}
          {family.length > 1 && family.some((fid) => statLine(fid)) && (
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
  const kinds = kindsInGroup(f.group);
  const level = getPlayerLevel();

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

  const n = applyItemFilters(f, '', level).length;
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
            onPress={() => {
              setF({ group: home, kind: null, tiers: [], expand: false, reachable: false });
              setSk('power');
            }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 30 }}>
          <Section title="Sort by">
            <Chip on={sk === 'power'} label="Strongest" onPress={() => setSk('power')} />
            <Chip on={sk === 'name'} label="A–Z" onPress={() => pickSort('name')} />
            <Chip on={sk === 'rarity'} label="Rarest" onPress={() => pickSort('rarity')} />
          </Section>
          {kinds.length >= 2 && (
            <Section title="Kind">
              <Chip on={f.kind == null} label="Any"
                onPress={() => setF({ ...f, kind: null })} />
              {kinds.map((k) => (
                <Chip key={k.kind} on={f.kind === k.kind}
                  label={`${k.kind} · ${k.count}`}
                  onPress={() => pickKind(k.kind)} />
              ))}
            </Section>
          )}
          <Section title="Show">
            <Chip on={f.group === home}
              label={`This tab · ${idsInGroup(home).length}`}
              onPress={() => pickGroup(home)} />
            <Chip on={f.group === 'all'} label={`Everything · ${idsInGroup('all').length}`}
              onPress={() => pickGroup('all')} />
            {ITEM_GROUPS.filter((g) => g.id !== home).map((g) => (
              <Chip key={g.id} on={f.group === g.id}
                label={`${g.label} · ${idsInGroup(g.id).length}`}
                onPress={() => pickGroup(g.id)} />
            ))}
          </Section>
          <Section title="Technology">
            {/* the level comes from the player's own profile — the same
                one the Tower tab reads; no second place to set it */}
            <Chip on={!f.reachable} label="Everything"
              onPress={() => setF({ ...f, reachable: false })} />
            <Chip on={f.reachable}
              label={level != null
                ? `Only what I can unlock (Lv ${level})`
                : 'Only what I can unlock'}
              onPress={() => setF({ ...f, reachable: true })} />
            {f.reachable && level == null && (
              <Text style={[s.body, { fontSize: 11.5, color: T.goldInk, width: '100%' }]}>
                Set your level on the Profiles screen and this filters to
                what your technology can actually build.
              </Text>
            )}
          </Section>
          <Section title="Tiers">
            {/* collapsed rows already stand for every tier, so the tier
                filter only appears once tiers are their own rows — that
                is 5 fewer chips in the default view (CEO: "filter looks
                chaotic") */}
            <Chip on={!f.expand} label="One row per item"
              onPress={() => setF({ ...f, expand: false, tiers: [] })} />
            <Chip on={f.expand} label="Every tier separately"
              onPress={() => setF({ ...f, expand: true })} />
          </Section>
          {f.expand && (
            <Section title="Only these tiers">
              {TIER_WORDS.map((t) => (
                <Chip key={t} on={f.tiers.includes(t)} label={t}
                  tint={TIER_TINTS[t]} onPress={() => pickTier(t)} />
              ))}
            </Section>
          )}
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
    group: initialGroup, kind: null, tiers: [], expand: false, reachable: false,
  });
  const [sort, setSort] = useState<ItemSort>('power');
  const [sheet, setSheet] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  /** the cards tapped through to reach `open`, oldest first */
  const [trail, setTrail] = useState<string[]>([]);
  useAppVersion();          // rows carry a build marker now (IL45)

  const searching = q.trim().length > 0;
  const level = getPlayerLevel();
  const ids = useMemo(
    () => sortItems(applyItemFilters(filters, q, level), sort, !filters.expand),
    [filters, q, sort, level],
  );

  // a pal card's drop chip — or a search hit — lands here with the item
  // preselected. Only the CENTER tab takes the payload (intents target
  // 'allitems'; a sibling tab instance must not steal it mid-switch).
  // Its group is 'other' since 2026-08-20 — the guard tracked the old
  // 'all' for one commit and silently swallowed every jump, caught on
  // the render pass.
  useEffect(() => {
    if (initialGroup !== 'other') return undefined;
    const apply = () => {
      const p = takeIntentPayload('allitems');
      if (p?.item) setOpen(p.item);
    };
    apply(); // payload waiting from before this screen mounted
    return onNavIntent(apply);
  }, [initialGroup]);

  // the summary line: everything narrowing the list beyond the tab's home
  const activeBits: string[] = [];
  if (filters.group !== initialGroup) {
    activeBits.push(filters.group === 'all' ? 'Everything'
      : filters.group === 'other' ? 'Items'
      : ITEM_GROUPS.find((g) => g.id === filters.group)?.label ?? filters.group);
  }
  if (filters.kind) activeBits.push(filters.kind);
  if (filters.reachable && level != null) activeBits.push(`Lv ${level} or lower`);
  if (filters.expand) activeBits.push('every tier');
  if (filters.tiers.length) activeBits.push(filters.tiers.join('/'));
  if (sort !== 'power') activeBits.push(SORT_LABELS[sort]);

  return (
    <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 10 }}>
      <PageHead title="Items"
        sub="Every item in the game with its real numbers — nothing estimated."
        stamp />
      <BuildPanel onOpenItem={setOpen} />
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
              setFilters({ group: initialGroup, kind: null, tiers: [], expand: false, reachable: false });
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
          <ItemRow id={id} collapsed={!filters.expand} level={level}
            showGroup={searching || filters.group === 'all' || filters.group === 'other'}
            onOpen={setOpen} />
        )}
        ListEmptyComponent={!searching ? (
          <Text style={[s.body, { textAlign: 'center', marginTop: 30 }]}>
            Nothing matches those filters.
          </Text>
        ) : null}
        contentContainerStyle={{ paddingBottom: 40 }}
      />
      {open && (
        <ItemDetail id={open}
          // the card holds per-item state (which tier is opened out),
          // so walking the trail must give it a fresh one
          key={open}
          // IL28: tapping an ingredient, a rival or a schematic used to
          // REPLACE the card with no way back — the same "it takes me
          // out and I can't return" the CEO hit on the Paldex->Map jump
          // (pal-map-return.test.ts). The trail is that way back.
          trail={trail}
          onClose={() => { setOpen(null); setTrail([]); }}
          onBack={() => {
            const prev = trail[trail.length - 1];
            setTrail(trail.slice(0, -1));
            setOpen(prev ?? null);
          }}
          onOpenItem={(next) => {
            if (next === open) return;
            setTrail([...trail, open]);
            setOpen(next);
          }} />
      )}
      {sheet && (
        <ItemFilterSheet filters={filters} sort={sort} home={initialGroup}
          onApply={(f, sk) => { setFilters(f); setSort(sk); setSheet(false); }}
          onClose={() => setSheet(false)} />
      )}
    </View>
  );
}
