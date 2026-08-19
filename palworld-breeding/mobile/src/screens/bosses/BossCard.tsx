/** The Boss Card — one fixed anatomy for every boss fight (Dododex rule:
 * a returning thumb knows where everything lives).
 *
 * Order, top to bottom: who it is → are you ready (YOUR pals first, then
 * what's worth getting and how) → the fight's real numbers and its actual
 * attacks → where it is → your record. Every number is a game-table fact
 * or labelled; the ranking logic is stated in a player's words.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ELEMENT_COLORS, T } from '../../theme';
import {
  addPlanTarget, breeding, engine, getBox, getPlayerLevel, ownedAny, pals,
} from '../../store';
import { navigateTo } from '../../nav/intent';
import {
  Badge, Btn, Card, DataStamp, PalIcon, s,
} from '../../ui/kit';
import { Icon } from '../../ui/Icon';
import { ELEMENT_ICONS } from '../../data/statIcons';
import type { BossEncounter } from '../../data/towerRaid.g';
import {
  attainLabel, boxKeyOf, cachedDerivations, derivationsReady,
  getAttainContext, type Attain,
} from '../../logic/recommend';
import { matchupLabel, weaknessLabel, type CounterRow } from '../../logic/counters';
import { counterSuggestions, ownedCounterRows } from '../../bosses/counterPicks';
import { effectWords, fmtHp, levelFit, shortName } from '../../bosses/format';
import { isBeaten, loadRecord, onRecordChange, toggleBeaten } from '../../bosses/record';
import itemsJson from '../../data/items_1_0.json';

/** slab codes are item ids verbatim (PalSummon_NightLady → "Bellanoir's
 * Slab"), so the summoning line uses the game's own item names */
const ITEM_NAMES = (itemsJson as unknown as {
  items: Record<string, { name: string }>;
}).items;

/** boss elements as chips — the BOSS's own row, which can differ from the
 * species (Zenara & Astralym fight typeless while Astralym has elements) */
function BossElementChips({ elements }: { elements: string[] }) {
  if (!elements.length) {
    return (
      <View style={[s.chip, { backgroundColor: T.surface2 }]}>
        <Text style={[s.chipText, { color: T.muted }]}>No element</Text>
      </View>
    );
  }
  return (
    <>
      {elements.map((e) => {
        const c = ELEMENT_COLORS[e.toLowerCase()] ?? ELEMENT_COLORS.neutral;
        return (
          <View key={e} style={[s.chip, {
            backgroundColor: c.bg, flexDirection: 'row',
            alignItems: 'center', gap: 4, paddingHorizontal: 7,
          }]}>
            {ELEMENT_ICONS[e] && (
              <Image source={ELEMENT_ICONS[e]} style={{ width: 14, height: 14 }} />
            )}
            <Text style={[s.chipText, { color: c.fg }]}>{e}</Text>
          </View>
        );
      })}
    </>
  );
}

export function CounterPalRow({ row, why, attain, onOpen, onPlan }: {
  row: CounterRow; why: string; attain?: Attain | null;
  onOpen: () => void; onPlan?: (() => void) | null;
}) {
  const label = attain ? attainLabel(attain) : null;
  // "Plan it" sits BESIDE the tappable area, never inside it — a button
  // nested in a button is invalid on web (the QA render flagged the
  // hydration error) and a tap-conflict on the phone.
  return (
    <View style={[s.row, { gap: 10, paddingVertical: 7 }]}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${row.name}. ${why}${label ? ` ${label.long}` : ''}`}
        style={({ pressed }) => [{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          flex: 1, opacity: pressed ? 0.6 : 1,
        }]}
      >
        <PalIcon name={row.name} size={40} />
        <View style={{ flex: 1 }}>
          <View style={[s.row, { gap: 6, flexWrap: 'wrap' }]}>
            <Text style={{ color: T.ink, fontWeight: '800', fontSize: 14 }}>
              {row.name}
            </Text>
            {label && <Badge kind="plain">{label.short}</Badge>}
          </View>
          <Text style={[s.body, { fontSize: 12, lineHeight: 16, marginTop: 1 }]}>
            {why}
          </Text>
        </View>
      </Pressable>
      {onPlan && (
        <Btn small label="Plan it" onPress={onPlan} />
      )}
    </View>
  );
}

export function BossCard({ base, hard, onClose }: {
  base: BossEncounter;
  hard: BossEncounter | null;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'base' | 'hard'>('base');
  const enc = mode === 'hard' && hard ? hard : base;
  // the name a player says: the pal it is (raids), or the paired names
  const name = base.species && !base.arena
    ? base.species : shortName(base.title);
  const playerLevel = getPlayerLevel();
  const fit = levelFit(playerLevel, enc);
  const moveEls = useMemo(() => enc.moves.map((m) => m.element), [enc]);

  // the record ticks re-render this card and the list behind it
  const [, bumpRecord] = useState(0);
  useEffect(() => {
    void loadRecord();
    return onRecordChange(() => bumpRecord((x) => x + 1));
  }, []);

  /* ---- your best pals: pure element math over the box, instant ---- */
  const box = getBox();
  const ownedRows = useMemo(
    () => ownedCounterRows(Object.keys(box), enc.elements, moveEls),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [boxKeyOf(Object.keys(box)), enc],
  );
  const ownedTop = ownedRows.slice(0, 5);
  const ownedMoreWithEdge = ownedRows.slice(5).filter((r) => r.offense > 1).length;

  /* ---- worth getting: needs the reachability pass — gated exactly like
   * SuggestedGoals so the card never opens frozen (the 4437 ms lesson) */
  const boxNames = Object.keys(box);
  const ready = derivationsReady(boxNames);
  const [, bumpReady] = useState(0);
  useEffect(() => {
    if (ready) return undefined;
    const t = setTimeout(() => {
      cachedDerivations(engine, boxNames);
      bumpReady((x) => x + 1);
    }, 30);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxKeyOf(boxNames), ready]);
  const suggestions = useMemo(() => {
    if (!ready || !enc.elements.length) return null;
    const ctx = getAttainContext(engine, pals, breeding, boxNames, playerLevel, ownedAny);
    return counterSuggestions(ctx, ownedAny, enc.elements, moveEls);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, boxKeyOf(boxNames), playerLevel, enc]);

  const openPal = (pal: string) => {
    onClose();
    navigateTo({ domain: 'bosses', tab: 'paldex', payload: { pal } });
  };
  const planPal = (pal: string) => {
    void Haptics.selectionAsync();
    onClose();
    navigateTo({ domain: 'breeding', tab: 'plan', payload: { fromCard: pal } });
    // let the navigation paint before planner-grade work (PalDetail's rule)
    setTimeout(() => {
      addPlanTarget(pal);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }, 60);
  };

  const coverage = ownedTop[0]?.offense === 2
    ? 'Your box has the counters — bring the pals below.'
    : boxNames.length
      ? enc.elements.length
        ? 'Nothing you own hits it for double yet — the pals under '
          + '"Worth getting" close that gap.'
        : 'It has no element, so no pal hits it harder than any other — '
          + 'bring your strongest.'
      : 'Your box is empty — tick what you own in the Paldex and this '
        + 'section will pick your team.';

  const fitColor = { ok: T.ok, warn: T.warn, bad: T.bad, plain: T.muted }[fit.tone];

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
              {weaknessLabel(enc.elements)} {coverage}
            </Text>
          </Card>

          <Card style={{ padding: 14 }}>
            <Text style={s.h3}>Your best pals for this fight</Text>
            <Text style={[s.body, { fontSize: 12, marginTop: 2 }]}>
              Ranked by element matchups against this boss and its own
              attacks, then base attack. It doesn’t simulate the fight —
              it tells you why each pick is here.
            </Text>
            <View style={{ marginTop: 6 }}>
              {ownedTop.map((r) => (
                <CounterPalRow key={r.name} row={r}
                  why={matchupLabel(r, name)}
                  onOpen={() => openPal(r.name)} />
              ))}
              {!ownedTop.length && (
                <Text style={[s.body, { marginTop: 4 }]}>
                  Nothing ticked as owned yet — your box picks this list.
                </Text>
              )}
              {ownedMoreWithEdge > 0 && (
                <Text style={[s.body, { fontSize: 12, color: T.faint, marginTop: 4 }]}>
                  …and {ownedMoreWithEdge} more you own with the same
                  element edge.
                </Text>
              )}
            </View>
          </Card>

          {enc.elements.length > 0 && (
            <Card style={{ padding: 14 }}>
              <Text style={s.h3}>Worth getting for this fight</Text>
              <Text style={[s.body, { fontSize: 12, marginTop: 2 }]}>
                Pals that hit it for double, ranked the same way, closest
                to your save first. Tap one for where to catch it; Plan it
                sends a breeding route to the Planner.
              </Text>
              <View style={{ marginTop: 6 }}>
                {suggestions == null && (
                  <Text style={[s.body, { marginTop: 4 }]}>Reading your save…</Text>
                )}
                {suggestions?.map(({ row, attain }) => (
                  <CounterPalRow key={row.name} row={row}
                    why={matchupLabel(row, name)}
                    attain={attain}
                    onOpen={() => openPal(row.name)}
                    onPlan={attain.kind === 'breed' ? () => planPal(row.name) : null} />
                ))}
                {suggestions != null && !suggestions.length && (
                  <Text style={[s.body, { marginTop: 4 }]}>
                    No catchable or breedable counters are in reach of your
                    save yet.
                  </Text>
                )}
              </View>
            </Card>
          )}

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
              {/* the raid list's damage-reduction and attack-% figures
                  are pure derivations of the two rates above — proven
                  identical on all 11 rows and pinned in boss-data tests,
                  so printing both would say the same fact twice */}
            </View>
            {enc.moves.length ? (
              <View style={{ marginTop: 10, gap: 7 }}>
                <Text style={[s.body, { fontSize: 12, color: T.faint }]}>
                  Its attacks — {enc.moves.length} in this difficulty’s own
                  kit:
                </Text>
                {enc.moves.map((m) => {
                  const c = ELEMENT_COLORS[m.element.toLowerCase()] ?? ELEMENT_COLORS.neutral;
                  const eff = effectWords(m.effects);
                  return (
                    <View key={`${m.lv}-${m.name}`} style={[s.row, { gap: 8 }]}
                      accessible
                      accessibilityLabel={`${m.name}, ${m.element}, power ${m.power}${eff ? `, causes ${eff}` : ''}`}>
                      <View style={[s.chip, {
                        backgroundColor: c.bg, flexDirection: 'row',
                        alignItems: 'center', gap: 4, paddingHorizontal: 6,
                      }]}>
                        {ELEMENT_ICONS[m.element] && (
                          <Image source={ELEMENT_ICONS[m.element]}
                            style={{ width: 12, height: 12 }} />
                        )}
                      </View>
                      <Text style={{ color: T.ink, fontSize: 13, fontWeight: '700', flex: 1 }}
                        numberOfLines={1}>
                        {m.name}
                      </Text>
                      {eff && (
                        <Text style={{ color: T.muted, fontSize: 11.5 }}>{eff}</Text>
                      )}
                      <Text style={{ color: T.accentInk, fontSize: 12, fontWeight: '800' }}>
                        {m.power} power
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : (
              <Text style={[s.body, { marginTop: 8 }]}>
                Its move list isn’t in the boss tables we mirror — nothing
                made up to fill the gap.
              </Text>
            )}
          </Card>

          <Card style={{ padding: 14 }}>
            <Text style={s.h3}>{enc.slab ? 'Summoning it' : 'Where'}</Text>
            {enc.slab ? (
              <>
                <Text style={[s.body, { marginTop: 6 }]}>
                  {`You bring this fight to you: offer ${
                    ITEM_NAMES[enc.slab]?.name ?? 'its slab'
                  } at a Summoning Altar — the slab is combined from its `
                  + 'fragments (the game’s own item text).'}
                </Text>
                <Text style={[s.body, {
                  fontSize: 11.5, color: T.faint, marginTop: 6,
                }]}>
                  Player-reported, not from the game files: a summoned
                  boss wrecks whatever it can reach — most players build
                  the altar far from their base.
                </Text>
              </>
            ) : (
              <Text style={[s.body, { marginTop: 6 }]}>
                {enc.arena && !enc.arena.includes('？')
                  ? `Fought at ${enc.arena}.`
                  : 'Its arena stays hidden until the story takes you '
                    + 'there — the game lists it as ???.'}
              </Text>
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
                  onPress={() => openPal(base.species!)} />
              )}
            </View>
          </Card>

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
