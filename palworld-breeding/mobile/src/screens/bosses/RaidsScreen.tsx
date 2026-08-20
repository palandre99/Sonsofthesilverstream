/** The Raids tab — every boss you summon on purpose: who they are, what
 * they cost to call, how hard each difficulty really is, and your record.
 *
 * The roster comes from our own data twice over: the RAID_ parameter rows
 * (fight numbers, kits) and the slab items in the items table (the
 * summoning chain — the slab codes ARE item ids). The one non-datamined
 * sentence on the card is labelled player-reported.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { T } from '../../theme';
import { getPlayerLevel } from '../../store';
import { Badge, Card, PageHead, PalIcon, s } from '../../ui/kit';
import { Icon } from '../../ui/Icon';
import { RAID_BOSSES, type BossEncounter } from '../../data/towerRaid.g';
import { weaknessLabel } from '../../logic/counters';
import { fmtHp } from '../../logic/bossText';
import { isBeaten, loadRecord, onRecordChange } from '../../bosses/record';
import { BossCard } from './BossCard';

interface RaidPair {
  base: BossEncounter;
  hard: BossEncounter | null;
}

function raidPairs(): RaidPair[] {
  const byBp = new Map<string, BossEncounter>();
  for (const e of RAID_BOSSES) byBp.set(e.bp, e);
  const pairs: RaidPair[] = [];
  for (const e of RAID_BOSSES) {
    if (e.bp.endsWith('_2')) continue;
    pairs.push({ base: e, hard: byBp.get(`${e.bp}_2`) ?? null });
  }
  pairs.sort((a, b) => a.base.lv - b.base.lv || (a.base.title < b.base.title ? -1 : 1));
  return pairs;
}

/** the name a player says: the pal it is, or the title when it isn't one */
const raidName = (e: BossEncounter) => e.species ?? e.title;

function RaidRow({ pair, onOpen, playerLevel }: {
  pair: RaidPair; onOpen: () => void; playerLevel: number | undefined;
}) {
  const { base, hard } = pair;
  const doneBase = isBeaten(base.bp);
  const doneHard = hard ? isBeaten(hard.bp) : false;
  const allDone = doneBase && (!hard || doneHard);
  const weak = weaknessLabel(base.elements);
  const lvTone = playerLevel == null ? T.muted
    : playerLevel >= base.lv ? T.ok
      : base.lv - playerLevel <= 5 ? T.warn : T.bad;
  return (
    <Pressable
      onPress={() => {
        void Haptics.selectionAsync();
        onOpen();
      }}
      accessibilityRole="button"
      accessibilityLabel={
        `${raidName(base)}, level ${base.lv} when summoned. ${weak}`
        + `${doneBase ? ' Beaten.' : ''}${doneHard ? ` ${hard!.mode} beaten.` : ''}`
      }
      style={({ pressed }) => [{ opacity: pressed ? 0.7 : allDone ? 0.55 : 1 }]}
    >
      <Card style={{ padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {base.species ? (
          <PalIcon name={base.species} size={46} />
        ) : (
          <Icon name="lightning-bolt-outline" size={38} color={T.muted} />
        )}
        <View style={{ flex: 1 }}>
          <View style={[s.row, { gap: 7, flexWrap: 'wrap' }]}>
            <Text style={{ color: T.ink, fontWeight: '800', fontSize: 15 }}
              numberOfLines={1}>
              {raidName(base)}
            </Text>
            {doneBase && <Badge kind="ok">beaten</Badge>}
            {doneHard && <Badge kind="gold">{`${hard!.mode.toLowerCase()} too`}</Badge>}
          </View>
          <Text style={{ color: T.muted, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
            <Text style={{ color: lvTone, fontWeight: '800' }}>Lv {base.lv}</Text>
            {` · ${fmtHp(base.fightHp)} HP`}
            {hard ? ` · ${hard.mode}: Lv ${hard.lv}` : ''}
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

export function RaidsScreen() {
  const [open, setOpen] = useState<RaidPair | null>(null);
  const [, bump] = useState(0);
  useEffect(() => {
    void loadRecord();
    return onRecordChange(() => bump((x) => x + 1));
  }, []);

  const pairs = useMemo(raidPairs, []);
  const playerLevel = getPlayerLevel();
  const beaten = pairs.filter((p) => isBeaten(p.base.bp)).length;
  const hardDone = pairs.filter((p) => p.hard && isBeaten(p.hard.bp)).length;
  const hardTotal = pairs.filter((p) => p.hard).length;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }}>
      <PageHead
        title="Raid bosses"
        sub={`The ${pairs.length} fights you summon on purpose: offer a boss’s slab at a Summoning Altar and it appears at the level shown — each one’s card says what to bring and what the slab is called.`}
        stamp
      />

      <Card style={{ padding: 14, marginBottom: 12 }}>
        <Text style={{ color: T.ink, fontWeight: '800', fontSize: 14.5 }}>
          {beaten} of {pairs.length} beaten
          {hardTotal ? ` · ${hardDone} of ${hardTotal} on the top difficulty` : ''}
        </Text>
        <Text style={[s.body, { fontSize: 12, marginTop: 4 }]}>
          Slabs combine from fragments (the game’s own item text), and
          every boss has a harder version with a slab of its own.
        </Text>
      </Card>

      <View style={{ gap: 9 }}>
        {pairs.map((p) => (
          <RaidRow key={p.base.bp} pair={p} playerLevel={playerLevel}
            onOpen={() => setOpen(p)} />
        ))}
      </View>

      {open && (
        <BossCard base={open.base} hard={open.hard} onClose={() => setOpen(null)} />
      )}
    </ScrollView>
  );
}
