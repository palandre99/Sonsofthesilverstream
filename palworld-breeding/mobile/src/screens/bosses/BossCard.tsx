/** The Boss Card for a tower or raid fight — one fixed anatomy (Dododex
 * rule: a returning thumb knows where everything lives).
 *
 * Order, top to bottom: who it is → are you ready (YOUR pals first, then
 * what's worth getting and how) → the fight's real numbers and its actual
 * attacks → where it is → what winning gives you → your record. The alpha
 * card (AlphaCard.tsx) renders the SAME order from the same sections.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { T } from '../../theme';
import { getBox, getPlayerLevel } from '../../store';
import { navigateTo } from '../../nav/intent';
import { Badge, Btn, Card, DataStamp, PalIcon, s } from '../../ui/kit';
import { Icon } from '../../ui/Icon';
import type { BossEncounter } from '../../data/towerRaid.g';
import { ownedCounterRows } from '../../bosses/counterPicks';
import { boxKeyOf } from '../../logic/recommend';
import { fmtHp, levelFit, shortName } from '../../logic/bossText';
import { towerSpot } from '../../bosses/whereTower';
import { MapPreview } from '../../map/MapPreview';
import {
  summoningChain, summoningWords, type ItemFact,
} from '../../bosses/summoning';
import itemFactsJson from '../../data/item_facts_1_0.json';
import { isBeaten, loadRecord, onRecordChange, toggleBeaten } from '../../bosses/record';
import itemsJson from '../../data/items_1_0.json';
import {
  BossElementChips, coverageLine, MovesList, ReadySection, RewardsSection,
} from './sections';

/** slab codes are item ids verbatim (PalSummon_NightLady → "Bellanoir's
 * Slab"), so the summoning line uses the game's own item names */
const ITEM_NAMES = (itemsJson as unknown as {
  items: Record<string, { name: string }>;
}).items;
/** the Items lane's datamined recipes + drop sources, read-only */
const ITEM_FACTS = (itemFactsJson as unknown as {
  facts: Record<string, ItemFact>;
}).facts;
const itemName = (id: string): string | null => ITEM_NAMES[id]?.name ?? null;

export function BossCard({ base, hard, onClose }: {
  base: BossEncounter;
  hard: BossEncounter | null;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'base' | 'hard'>('base');
  const [mapSide, setMapSide] = useState(0);
  const enc = mode === 'hard' && hard ? hard : base;
  // the name a player says: the pal it is (raids), or the paired names
  const name = base.species && !base.arena ? base.species : shortName(base.title);
  const playerLevel = getPlayerLevel();
  const fit = levelFit(playerLevel, enc.lv);

  const [, bumpRecord] = useState(0);
  useEffect(() => {
    void loadRecord();
    return onRecordChange(() => bumpRecord((x) => x + 1));
  }, []);

  const boxNames = Object.keys(getBox());
  // memoized: this ranks the whole box, and ReadySection ranks it again
  // for the list — without this the card pays for it twice on EVERY
  // render (measured on the QA harness with a 117-pal box)
  const hasEdge = useMemo(
    () => ownedCounterRows(
      boxNames, enc.elements, enc.moves.map((m) => m.element),
    )[0]?.offense === 2,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [boxKeyOf(boxNames), enc.elements, enc.moves],
  );
  const fitColor = { ok: T.ok, warn: T.warn, bad: T.bad, plain: T.muted }[fit.tone];
  // where the tower actually stands, from the map lane's own spots
  const spot = useMemo(
    () => (enc.slab ? null : towerSpot(enc.title, enc.arena)),
    [enc],
  );
  // and for a raid, how you actually GET the slab you must offer
  const chain = useMemo(
    () => (enc.slab
      ? summoningChain(enc.slab, ITEM_FACTS, itemName) : null),
    [enc],
  );

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: T.bg }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 12,
          paddingHorizontal: 16, paddingVertical: 12,
          borderBottomWidth: 1, borderBottomColor: T.line, backgroundColor: T.bg2,
        }}>
          {base.species ? <PalIcon name={base.species} size={44} /> : (
            <Icon name="crown-outline" size={36} color={T.muted} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={{ color: T.ink, fontSize: 17, fontWeight: '800' }} numberOfLines={1}>
              {name}
            </Text>
            {name !== base.title && (
              <Text style={{ color: T.faint, fontSize: 11.5 }} numberOfLines={1}>
                {base.title}
              </Text>
            )}
          </View>
          <Pressable onPress={onClose} hitSlop={10}
            accessibilityRole="button" accessibilityLabel="Close">
            <Icon name="close" size={22} color={T.muted} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
          {hard && (
            <View style={[s.row, { gap: 8 }]}>
              {([['base', base] as const, ['hard', hard] as const]).map(([m, e]) => (
                <Pressable key={m}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setMode(m);
                  }}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: mode === m }}
                  accessibilityLabel={`${e.mode} difficulty, level ${e.lv}`}
                  style={[{
                    borderWidth: 1.5, borderRadius: 11,
                    paddingVertical: 7, paddingHorizontal: 14,
                    borderColor: mode === m ? T.accent : T.line,
                    backgroundColor: mode === m ? T.accentSoft : T.surface,
                  }]}
                >
                  <Text style={{
                    color: mode === m ? T.accentInk : T.muted,
                    fontWeight: '800', fontSize: 13,
                  }}>{e.mode} · Lv {e.lv}</Text>
                </Pressable>
              ))}
            </View>
          )}

          <Card style={{ padding: 14 }}>
            <View style={[s.wrap]}>
              <BossElementChips elements={enc.elements} />
              <Badge kind="plain">{`LV ${enc.lv}`}</Badge>
            </View>
            <Text style={[s.body, { marginTop: 8, color: fitColor, fontWeight: '700' }]}>
              {fit.text}
            </Text>
            <Text style={[s.body, { marginTop: 4 }]}>
              {coverageLine(enc.elements, hasEdge, boxNames.length)}
            </Text>
          </Card>

          <ReadySection elements={enc.elements} moves={enc.moves}
            bossName={name} onLeave={onClose} />

          <Card style={{ padding: 14 }}>
            <Text style={s.h3}>The fight</Text>
            <View style={[s.wrap, { marginTop: 8 }]}>
              <Badge kind="bad">{`${fmtHp(enc.fightHp)} HP`}</Badge>
              {enc.recvRate != null && enc.recvRate !== 1 && (
                <Badge kind="warn">
                  {`takes ${Math.round(enc.recvRate * 100)}% of your damage`}
                </Badge>
              )}
              {enc.dealRate != null && enc.dealRate !== 1 && (
                <Badge kind="warn">{`its hits land ×${enc.dealRate}`}</Badge>
              )}
              {/* the raid list's damage-reduction and attack-% figures are
                  pure derivations of the two rates above — proven identical
                  on all 11 rows and pinned in boss-data tests, so printing
                  both would say the same fact twice */}
            </View>
            <MovesList moves={enc.moves} />
          </Card>

          <Card style={{ padding: 14 }}>
            <Text style={s.h3}>{enc.slab ? 'Summoning it' : 'Where'}</Text>
            {enc.slab ? (
              <>
                <Text style={[s.body, { marginTop: 6 }]}>
                  {`You bring this fight to you: offer ${
                    chain?.slabName ?? 'its slab'
                  } at a Summoning Altar.`}
                </Text>
                {chain && summoningWords(chain) && (
                  <Text style={[s.body, { marginTop: 4 }]}>
                    {summoningWords(chain)}
                  </Text>
                )}
                <Text style={[s.body, {
                  fontSize: 11.5, color: T.faint, marginTop: 6,
                }]}>
                  Player-reported, not from the game files: a summoned boss
                  wrecks whatever it can reach — most players build the altar
                  far from their base.
                </Text>
              </>
            ) : (
              <>
                <Text style={[s.body, { marginTop: 6 }]}>
                  {enc.arena && !enc.arena.includes('？')
                    ? `Fought at ${enc.arena}.`
                    : 'Its arena stays hidden until the story takes you there — '
                      + 'the game lists it as ???.'}
                </Text>
                {/* the map's own spot for this tower, when the two
                    datasets agree on which one it is — drawn, not just
                    described, because a coordinate pair is not a place */}
                {spot && (
                  <>
                    <Text style={[s.body, { marginTop: 4 }]}>
                      {`It stands at ${spot.x}, ${spot.y}`}
                      {spot.from ? ` — ${spot.from}.` : '.'}
                    </Text>
                    <View style={{ marginTop: 10, alignItems: 'center' }}
                      onLayout={(e) => setMapSide(
                        Math.round(e.nativeEvent.layout.width))}>
                      {/* Rendered with a FALLBACK size, never gated on
                          layout — PalMap does the same, and gating is why
                          this drew nothing at all on the first render.
                          Capped because the preview picks its tile level
                          from side/window: a one-point crop on a wide
                          screen asks for z5, and the bundle carries only
                          z0-z4 (the interactive map gets z5 as sheets),
                          so an uncapped preview goes blank. */}
                      <MapPreview region={spot.region}
                        side={Math.min(mapSide || 320, 420)}
                        points={[{ u: spot.u, v: spot.v, alpha: true }]} />
                    </View>
                  </>
                )}
              </>
            )}
            <View style={[s.wrap, { marginTop: 10 }]}>
              {!enc.slab && (
                <Btn small label="Open the Map" onPress={() => {
                  onClose();
                  navigateTo({ domain: 'map', tab: '' });
                }} />
              )}
              {base.species && (
                <Btn small label={`${base.species}’s own card`}
                  onPress={() => {
                    onClose();
                    navigateTo({
                      domain: 'bosses', tab: 'paldex',
                      payload: { pal: base.species! },
                    });
                  }} />
              )}
            </View>
          </Card>

          <RewardsSection drops={enc.drops} />

          <Card style={{ padding: 14 }}>
            <Text style={s.h3}>Your record</Text>
            {([base, ...(hard ? [hard] : [])]).map((e) => {
              const done = isBeaten(e.bp);
              return (
                <Pressable key={e.bp}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    toggleBeaten(e.bp);
                  }}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: done }}
                  accessibilityLabel={`Beaten on ${e.mode}`}
                  style={({ pressed }) => [s.row, {
                    gap: 10, paddingVertical: 9, opacity: pressed ? 0.6 : 1,
                  }]}
                >
                  <Icon name={done ? 'checkbox-marked' : 'checkbox-blank-outline'}
                    size={22} color={done ? T.ok : T.muted} />
                  <Text style={{
                    color: done ? T.ok : T.ink, fontWeight: '700', fontSize: 14,
                  }}>
                    Beaten on {e.mode}
                  </Text>
                </Pressable>
              );
            })}
            <Text style={[s.body, { fontSize: 11.5, color: T.faint, marginTop: 2 }]}>
              Saved to this profile — switch saves and the record switches
              with you.
            </Text>
          </Card>

          <DataStamp beforeNavigate={onClose} />
        </ScrollView>
      </View>
    </Modal>
  );
}
