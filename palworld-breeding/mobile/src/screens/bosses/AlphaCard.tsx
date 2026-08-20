/** The Boss Card for an alpha — the SAME anatomy and the same sections as
 * the tower/raid card, with the three things that are genuinely different
 * about a world boss:
 *
 *  - its numbers are the MEASURED DIFFERENCES from the normal species
 *    (alphaFacts.bossLine, E133) rather than a fight HP bar;
 *  - it stands somewhere, so "Where" is the real spawn map;
 *  - you can catch it, so the record has two ticks, not one.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { T } from '../../theme';
import { getBox, getPlayerLevel, pals } from '../../store';
import { navigateTo } from '../../nav/intent';
import { Badge, Btn, Card, DataStamp, PalIcon, s } from '../../ui/kit';
import { Icon } from '../../ui/Icon';
import { PalMap } from '../../ui/PalMap';
import type { AlphaStat } from '../../data/alphaStats.g';
import { bossLine } from '../../alphaFacts';
import { ownedCounterRows } from '../../bosses/counterPicks';
import { boxKeyOf } from '../../logic/recommend';
import { levelFit } from '../../logic/bossText';
import { isBeaten, loadRecord, onRecordChange, toggleBeaten } from '../../bosses/record';
import {
  BossElementChips, coverageLine, MovesList, ReadySection, RewardsSection,
} from './sections';

export const alphaBeatKey = (title: string) => `alpha:${title}`;
export const alphaCaughtKey = (title: string) => `alphacaught:${title}`;

export function AlphaCard({ species, stat, onClose }: {
  species: string;
  stat: AlphaStat;
  onClose: () => void;
}) {
  const [, bump] = useState(0);
  useEffect(() => {
    void loadRecord();
    return onRecordChange(() => bump((x) => x + 1));
  }, []);

  const p = pals[species];
  const elements = p?.elements ?? [];
  const moves = stat.moves ?? [];
  const drops = stat.drops ?? [];
  const playerLevel = getPlayerLevel();
  const fit = stat.lv != null ? levelFit(playerLevel, stat.lv) : null;
  const fitColor = fit
    ? { ok: T.ok, warn: T.warn, bad: T.bad, plain: T.muted }[fit.tone] : T.muted;

  const boxNames = Object.keys(getBox());
  // memoized: this ranks the whole box, and ReadySection ranks it again
  // for the list — without this the card pays for it twice on EVERY
  // render (measured on the QA harness with a 117-pal box)
  const hasEdge = useMemo(
    () => ownedCounterRows(
      boxNames, elements, moves.map((m) => m.element),
    )[0]?.offense === 2,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [boxKeyOf(boxNames), elements, moves],
  );

  const beaten = isBeaten(alphaBeatKey(stat.title));
  const caught = isBeaten(alphaCaughtKey(stat.title));

  // the measured differences from the ordinary species (E133)
  const differences = bossLine(stat, {
    hp: p?.hp ?? null, atk: p?.atk ?? null, def: p?.def ?? null,
    size: p?.size ?? null,
  });

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: T.bg }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 12,
          paddingHorizontal: 16, paddingVertical: 12,
          borderBottomWidth: 1, borderBottomColor: T.line, backgroundColor: T.bg2,
        }}>
          <PalIcon name={species} size={44} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: T.ink, fontSize: 17, fontWeight: '800' }} numberOfLines={1}>
              {stat.title}
            </Text>
            <Text style={{ color: T.faint, fontSize: 11.5 }} numberOfLines={1}>
              The alpha {species}
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10}
            accessibilityRole="button" accessibilityLabel="Close">
            <Icon name="close" size={22} color={T.muted} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
          <Card style={{ padding: 14 }}>
            <View style={[s.wrap]}>
              <BossElementChips elements={elements} />
              {stat.lv != null && <Badge kind="plain">{`LV ${stat.lv}`}</Badge>}
              {beaten && <Badge kind="ok">beaten</Badge>}
              {caught && <Badge kind="gold">caught</Badge>}
            </View>
            {fit && (
              <Text style={[s.body, { marginTop: 8, color: fitColor, fontWeight: '700' }]}>
                {fit.text}
              </Text>
            )}
            <Text style={[s.body, { marginTop: 4 }]}>
              {coverageLine(elements, hasEdge, boxNames.length)}
            </Text>
          </Card>

          <ReadySection elements={elements} moves={moves}
            bossName={species} onLeave={onClose} />

          <Card style={{ padding: 14 }}>
            <Text style={s.h3}>The fight</Text>
            <Text style={[s.body, { marginTop: 6 }]}>
              {/* only what actually DIFFERS from a normal one, or the
                  honest sentence that nothing does (E133) */}
              As the fixed boss{stat.lv != null ? ` (Lv ${stat.lv})` : ''}
              {' — '}{differences}.
            </Text>
            <MovesList moves={moves} />
          </Card>

          <Card style={{ padding: 14 }}>
            <Text style={s.h3}>Where</Text>
            <View style={{ marginTop: 8 }}>
              <PalMap name={species} />
            </View>
          </Card>

          <RewardsSection drops={drops} />

          <Card style={{ padding: 14 }}>
            <Text style={s.h3}>Your record</Text>
            {([
              ['Beaten it', beaten, alphaBeatKey(stat.title)],
              ['Caught it', caught, alphaCaughtKey(stat.title)],
            ] as const).map(([label, on, key]) => (
              <Pressable key={key}
                onPress={() => {
                  void Haptics.selectionAsync();
                  toggleBeaten(key);
                }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={label}
                style={({ pressed }) => [s.row, {
                  gap: 10, paddingVertical: 9, opacity: pressed ? 0.6 : 1,
                }]}
              >
                <Icon name={on ? 'checkbox-marked' : 'checkbox-blank-outline'}
                  size={22} color={on ? T.ok : T.muted} />
                <Text style={{
                  color: on ? T.ok : T.ink, fontWeight: '700', fontSize: 14,
                }}>{label}</Text>
              </Pressable>
            ))}
            <Text style={[s.body, { fontSize: 11.5, color: T.faint, marginTop: 2 }]}>
              An alpha can be caught as well as beaten — the sphere is
              {stat.capture != null && stat.capture !== 1
                ? ` ${stat.capture}× as likely to hold as on a normal one.`
                : ' as likely to hold as on a normal one.'}
              {' '}Both ticks are saved to this profile.
            </Text>
            <View style={[s.wrap, { marginTop: 10 }]}>
              <Btn small label={`${species}’s own card`} onPress={() => {
                onClose();
                navigateTo({ domain: 'bosses', tab: 'paldex', payload: { pal: species } });
              }} />
            </View>
          </Card>

          <DataStamp beforeNavigate={onClose} />
        </ScrollView>
      </View>
    </Modal>
  );
}
