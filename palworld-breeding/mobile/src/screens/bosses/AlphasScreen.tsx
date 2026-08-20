/** The Alphas tab — every titled boss in the game as a browse the player
 * can actually hunt from: search, level order, what each one is weak to,
 * where it stands (or that it's a dungeon fight), and two ticks per boss
 * (beaten / caught) that follow the save profile.
 *
 * Every stat row was CombiRank-validated (E133); the respawn note is the
 * one community-measured figure on the screen and says so.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { T } from '../../theme';
import { getPlayerLevel, pals } from '../../store';
import { onNavIntent, takeIntentPayload } from '../../nav/intent';
import { Badge, Card, DataStamp, PalIcon, SearchInput, s } from '../../ui/kit';
import { Icon } from '../../ui/Icon';
import { ALPHA_STATS, type AlphaStat } from '../../data/alphaStats.g';
import { weaknessLabel } from '../../logic/counters';
import { isBeaten, loadRecord, onRecordChange, toggleBeaten } from '../../bosses/record';
import { AlphaCard, alphaBeatKey, alphaCaughtKey } from './AlphaCard';

interface AlphaRow {
  species: string;
  stat: AlphaStat;
  title: string;
  lv: number | null;
  /** where it stands, from the pal data's own location lines — or null
   * for the dungeon end-bosses that have no fixed spot */
  place: string | null;
  elements: string[];
}

/** "Guardian of ... Aegidron (Lv. 79) - The World Tree (-59,756)" → the
 * place words, without the coordinate pair the map already owns. */
function placeOf(species: string, title: string): string | null {
  for (const line of pals[species]?.alpha_locations ?? []) {
    if (!line.startsWith(title)) continue;
    const m = line.match(/ - (.+?)(?:\s*\(-?\d+,\s*-?\d+\))?\s*$/);
    if (m) return m[1].trim();
  }
  return null;
}

function buildRows(): AlphaRow[] {
  const rows: AlphaRow[] = [];
  for (const [species, entries] of Object.entries(ALPHA_STATS)) {
    for (const a of entries) {
      rows.push({
        species,
        stat: a,
        title: a.title,
        lv: a.lv,
        place: placeOf(species, a.title),
        elements: pals[species]?.elements ?? [],
      });
    }
  }
  rows.sort((a, b) => (a.lv ?? 999) - (b.lv ?? 999)
    || (a.title < b.title ? -1 : 1));
  return rows;
}

type StatusFilter = 'all' | 'todo' | 'beaten' | 'caught';

function Tick({ on, label, iconOn, iconOff, onPress }: {
  on: boolean; label: string; iconOn: string; iconOff: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [{
        alignItems: 'center', gap: 1, minWidth: 44,
        opacity: pressed ? 0.6 : 1,
      }]}
    >
      <Icon name={on ? iconOn : iconOff} size={20}
        color={on ? T.ok : T.faint} />
      <Text style={{
        fontSize: 8.5, fontWeight: '700',
        color: on ? T.ok : T.faint, textTransform: 'uppercase',
      }}>{label}</Text>
    </Pressable>
  );
}

function AlphaListRow({ row, playerLevel, onOpen }: {
  row: AlphaRow; playerLevel: number | undefined; onOpen: () => void;
}) {
  const beaten = isBeaten(alphaBeatKey(row.title));
  const caught = isBeaten(alphaCaughtKey(row.title));
  const lvTone = row.lv == null || playerLevel == null
    ? T.muted
    : playerLevel >= row.lv ? T.ok
      : row.lv - playerLevel <= 5 ? T.warn : T.bad;
  return (
    <Card style={{
      padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10,
      opacity: beaten ? 0.55 : 1,
    }}>
      <Pressable
        onPress={() => {
          void Haptics.selectionAsync();
          onOpen();
        }}
        accessibilityRole="button"
        accessibilityLabel={
          `${row.title}${row.lv != null ? `, level ${row.lv}` : ''}. `
          + `${weaknessLabel(row.elements)}`
        }
        style={({ pressed }) => [{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          flex: 1, opacity: pressed ? 0.6 : 1,
        }]}
      >
        <PalIcon name={row.species} size={42} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: T.ink, fontWeight: '800', fontSize: 13.5 }}
            numberOfLines={1}>
            {row.title}
          </Text>
          <View style={[s.row, { gap: 6, marginTop: 2, flexWrap: 'wrap' }]}>
            {row.lv != null && (
              <Text style={{ color: lvTone, fontSize: 11.5, fontWeight: '800' }}>
                Lv {row.lv}
              </Text>
            )}
            <Text style={{ color: T.faint, fontSize: 11.5, flexShrink: 1 }}
              numberOfLines={1}>
              {row.place ?? 'no fixed spot — a dungeon fight'}
            </Text>
          </View>
          <Text style={{ color: T.faint, fontSize: 11, marginTop: 1 }}
            numberOfLines={1}>
            {weaknessLabel(row.elements)}
          </Text>
        </View>
      </Pressable>
      <Tick on={beaten} label="beaten"
        iconOn="checkbox-marked" iconOff="checkbox-blank-outline"
        onPress={() => toggleBeaten(alphaBeatKey(row.title))} />
      <Tick on={caught} label="caught"
        iconOn="pokeball" iconOff="circle-outline"
        onPress={() => toggleBeaten(alphaCaughtKey(row.title))} />
    </Card>
  );
}

export function AlphasScreen() {
  const [open, setOpen] = useState<AlphaRow | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [, bump] = useState(0);
  useEffect(() => {
    void loadRecord();
    return onRecordChange(() => bump((x) => x + 1));
  }, []);

  const rows = useMemo(buildRows, []);
  const playerLevel = getPlayerLevel();

  // arriving from a pal card's "prep this fight" opens that exact boss
  useEffect(() => {
    const apply = () => {
      const t = takeIntentPayload('alphas')?.boss;
      if (t) {
        const hit = rows.find((r) => r.title === t);
        if (hit) setOpen(hit);
      }
    };
    apply();
    return onNavIntent(apply);
  }, [rows]);

  const beatenCountAll = rows.filter((r) => isBeaten(alphaBeatKey(r.title))).length;
  const caughtCountAll = rows.filter((r) => isBeaten(alphaCaughtKey(r.title))).length;

  const q = query.trim().toLowerCase();
  const shown = rows.filter((r) => {
    if (q && !r.title.toLowerCase().includes(q)
      && !r.species.toLowerCase().includes(q)) return false;
    const beaten = isBeaten(alphaBeatKey(r.title));
    const caught = isBeaten(alphaCaughtKey(r.title));
    if (status === 'todo') return !beaten;
    if (status === 'beaten') return beaten;
    if (status === 'caught') return caught;
    return true;
  });

  const FILTERS: [StatusFilter, string][] = [
    ['all', 'All'], ['todo', 'Still to beat'],
    ['beaten', 'Beaten'], ['caught', 'Caught'],
  ];

  return (
    <FlatList
      data={shown}
      keyExtractor={(r) => r.title}
      contentContainerStyle={{ padding: 16, paddingBottom: 28, gap: 8 }}
      initialNumToRender={12}
      windowSize={7}
      ListHeaderComponent={(
        <View style={{ marginBottom: 6 }}>
          <PageHeadBlock
            total={rows.length}
            beaten={beatenCountAll}
            caught={caughtCountAll}
          />
          <SearchInput value={query} onChange={setQuery}
            placeholder="Search a boss or a pal…" />
          <View style={[s.wrap, { marginTop: 8 }]}>
            {FILTERS.map(([id, label]) => {
              const on = status === id;
              return (
                <Pressable key={id}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setStatus(id);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={label}
                  style={[s.chip, {
                    backgroundColor: on ? T.accentSoft : T.surface2,
                    borderWidth: 1, borderColor: on ? T.accent : 'transparent',
                    paddingVertical: 5, paddingHorizontal: 11,
                  }]}
                >
                  <Text style={[s.chipText, { color: on ? T.accentInk : T.muted }]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {shown.length !== rows.length && (
            <Text style={[s.body, { fontSize: 12, marginTop: 8 }]}>
              Showing {shown.length} of {rows.length} bosses.
            </Text>
          )}
        </View>
      )}
      renderItem={({ item }) => (
        <AlphaListRow row={item} playerLevel={playerLevel}
          onOpen={() => setOpen(item)} />
      )}
      ListFooterComponent={open ? (
        <AlphaCard species={open.species} stat={open.stat}
          onClose={() => setOpen(null)} />
      ) : null}
      ListEmptyComponent={(
        <Text style={[s.body, { marginTop: 12 }]}>
          No boss matches that — try part of its title or its pal’s name.
        </Text>
      )}
    />
  );
}

function PageHeadBlock({ total, beaten, caught }: {
  total: number; beaten: number; caught: number;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={s.h1}>Alpha bosses</Text>
      <Text style={s.pageSub}>
        All {total} titled bosses, easiest first — tap one for its pal’s
        full card, spawn map and stats. {beaten} beaten · {caught} caught
        on this save.
      </Text>
      <View style={[s.wrap, { marginTop: 8 }]}>
        <Badge kind="plain">community-measured</Badge>
        <Text style={[s.body, { fontSize: 11.5, flex: 1 }]}>
          Players measure a beaten alpha’s respawn at about an hour of
          real time — it shifts with your world’s day-length settings.
          Not read from the game files.
        </Text>
      </View>
      <DataStamp />
    </View>
  );
}
