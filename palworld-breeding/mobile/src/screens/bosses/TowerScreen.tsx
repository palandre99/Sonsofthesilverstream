/** The Tower tab — the fane's flagship: every tower fight in the order a
 * player meets them, with the one header line that matters ("what's my
 * next tower?"), the element story per row, and the record greying out
 * what is already done.
 *
 * Everything here comes from the game's own boss rows (towerRaid.g.ts);
 * the counters and readiness live on the Boss Card one tap deeper.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { T } from '../../theme';
import { getPlayerLevel } from '../../store';
import { Badge, Card, PageHead, PalIcon, s } from '../../ui/kit';
import { Icon } from '../../ui/Icon';
import { TOWER_BOSSES, type BossEncounter } from '../../data/towerRaid.g';
import { weaknessLabel } from '../../logic/counters';
import { fmtHp, shortName } from '../../bosses/format';
import { isBeaten, loadRecord, onRecordChange } from '../../bosses/record';
import { BossCard } from './BossCard';

interface TowerPair {
  base: BossEncounter;
  hard: BossEncounter | null;
}

/** Normal + Hard rows folded to one fight each, in level order. */
function towerPairs(): TowerPair[] {
  const byBp = new Map<string, BossEncounter>();
  for (const e of TOWER_BOSSES) byBp.set(e.bp, e);
  const pairs: TowerPair[] = [];
  for (const e of TOWER_BOSSES) {
    if (e.bp.endsWith('_2')) continue;
    pairs.push({ base: e, hard: byBp.get(`${e.bp}_2`) ?? null });
  }
  pairs.sort((a, b) => a.base.lv - b.base.lv || (a.base.title < b.base.title ? -1 : 1));
  return pairs;
}

function TowerRow({ pair, onOpen }: { pair: TowerPair; onOpen: () => void }) {
  const { base, hard } = pair;
  const name = shortName(base.title);
  const doneBase = isBeaten(base.bp);
  const doneHard = hard ? isBeaten(hard.bp) : false;
  const allDone = doneBase && (!hard || doneHard);
  const weak = weaknessLabel(base.elements);
  return (
    <Pressable
      onPress={() => {
        void Haptics.selectionAsync();
        onOpen();
      }}
      accessibilityRole="button"
      accessibilityLabel={
        `${name}, level ${base.lv}. ${weak}`
        + `${doneBase ? ' Beaten.' : ''}${doneHard ? ' Hard beaten.' : ''}`
      }
      style={({ pressed }) => [{ opacity: pressed ? 0.7 : allDone ? 0.55 : 1 }]}
    >
      <Card style={{ padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {base.species ? (
          <PalIcon name={base.species} size={46} />
        ) : (
          <Icon name="crown-outline" size={38} color={T.muted} />
        )}
        <View style={{ flex: 1 }}>
          <View style={[s.row, { gap: 7, flexWrap: 'wrap' }]}>
            <Text style={{ color: T.ink, fontWeight: '800', fontSize: 15 }}
              numberOfLines={1}>
              {name}
            </Text>
            {doneBase && <Badge kind="ok">beaten</Badge>}
            {doneHard && <Badge kind="gold">hard too</Badge>}
          </View>
          <Text style={{ color: T.muted, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
            Lv {base.lv} · {fmtHp(base.fightHp)} HP
            {hard ? ` · Hard: Lv ${hard.lv}` : ''}
          </Text>
          <Text style={{ color: T.faint, fontSize: 11.5, marginTop: 2 }} numberOfLines={1}>
            {weak}
          </Text>
        </View>
        <Icon name="chevron-right" size={20} color={T.faint} />
      </Card>
    </Pressable>
  );
}

export function TowerScreen() {
  const [open, setOpen] = useState<TowerPair | null>(null);
  const [, bump] = useState(0);
  useEffect(() => {
    void loadRecord();
    return onRecordChange(() => bump((x) => x + 1));
  }, []);

  const pairs = useMemo(towerPairs, []);
  const playerLevel = getPlayerLevel();

  const beatenNormals = pairs.filter((p) => isBeaten(p.base.bp)).length;
  const hardPairs = pairs.filter((p) => p.hard);
  const beatenHards = hardPairs.filter((p) => isBeaten(p.hard!.bp)).length;

  // the first fight in level order that is not beaten yet
  const next = pairs.find((p) => !isBeaten(p.base.bp)) ?? null;
  let nextLine: string | null = null;
  if (!next) {
    nextLine = hardPairs.length && beatenHards < hardPairs.length
      ? 'Every tower beaten on Normal — the Hard runs are what’s left.'
      : 'Every fight on this list is beaten. That’s the whole tower.';
  } else {
    const nn = shortName(next.base.title);
    nextLine = playerLevel == null
      ? `Next up: ${nn} (Lv ${next.base.lv}).`
      : playerLevel >= next.base.lv
        ? `You’re level ${playerLevel} — ready for ${nn} (Lv ${next.base.lv}).`
        : `You’re level ${playerLevel} — next up: ${nn} at level ${next.base.lv}.`;
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }}>
      <PageHead
        title="Tower bosses"
        sub={`All ${pairs.length} fights on the tower list, in the order you’ll meet them — levels, health bars and attack kits from the game’s own boss rows.`}
        stamp
      />

      <Card style={{
        padding: 14, marginBottom: 12,
        borderColor: next ? T.accent : T.ok, borderWidth: 1.5,
      }}>
        <Text style={{ color: T.ink, fontWeight: '800', fontSize: 14.5 }}>
          {nextLine}
        </Text>
        <Text style={[s.body, { fontSize: 12, marginTop: 4 }]}>
          {beatenNormals} of {pairs.length} beaten
          {hardPairs.length ? ` · ${beatenHards} of ${hardPairs.length} on Hard` : ''}
          {playerLevel == null
            ? ' · set your level on your save profile to tune this page'
            : ''}
        </Text>
      </Card>

      <View style={{ gap: 9 }}>
        {pairs.map((p) => (
          <TowerRow key={p.base.bp} pair={p} onOpen={() => setOpen(p)} />
        ))}
      </View>

      {open && (
        <BossCard base={open.base} hard={open.hard} onClose={() => setOpen(null)} />
      )}
    </ScrollView>
  );
}
