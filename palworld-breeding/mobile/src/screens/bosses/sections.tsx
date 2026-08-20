/** The Boss Card's shared sections.
 *
 * Every boss in the game — tower, raid, alpha — gets the SAME anatomy in
 * the SAME order (the Dododex rule: a returning thumb knows where things
 * live). These are the pieces that are identical across all three, so the
 * wording exists once: change it here and every card changes.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Image, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ELEMENT_COLORS, T } from '../../theme';
import {
  addPlanTarget, breeding, engine, getBox, getPlayerLevel, ownedAny, pals,
} from '../../store';
import { navigateTo } from '../../nav/intent';
import { Card, s } from '../../ui/kit';
import { Icon } from '../../ui/Icon';
import { ELEMENT_ICONS } from '../../data/statIcons';
import type { BossDrop, BossMove } from '../../data/towerRaid.g';
import {
  boxKeyOf, cachedDerivations, derivationsReady, getAttainContext,
  type Attain,
} from '../../logic/recommend';
import { matchupLabel, weaknessLabel, type CounterRow } from '../../logic/counters';
import { counterSuggestions, ownedCounterRows } from '../../bosses/counterPicks';
import { effectWords, groupDrops } from '../../logic/bossText';
import { CounterPalRow } from './CounterPalRow';

/** the BOSS's own elements, which can differ from the species' (Zenara &
 * Astralym fight typeless while Astralym itself has elements) */
export function BossElementChips({ elements }: { elements: string[] }) {
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

/** "Are you ready" — your own pals first, then what is worth getting and
 * how to get it. The expensive reachability pass is gated exactly like
 * SuggestedGoals so a card never opens frozen (the 4437 ms lesson). */
export function ReadySection({ elements, moves, bossName, onLeave }: {
  elements: string[];
  moves: BossMove[];
  /** what the WHY lines call this boss */
  bossName: string;
  /** cards are modals; a jump has to close the one on screen first */
  onLeave: () => void;
}) {
  const box = getBox();
  const boxNames = Object.keys(box);
  const boxKey = boxKeyOf(boxNames);
  const playerLevel = getPlayerLevel();
  const moveEls = useMemo(() => moves.map((m) => m.element), [moves]);
  const elKey = elements.join(',');

  const ownedRows = useMemo(
    () => ownedCounterRows(boxNames, elements, moveEls),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [boxKey, elKey, moveEls],
  );
  const ownedTop = ownedRows.slice(0, 5);
  const ownedMoreWithEdge = ownedRows.slice(5).filter((r) => r.offense > 1).length;

  const ready = derivationsReady(boxNames);
  const [, bump] = useState(0);
  useEffect(() => {
    if (ready) return undefined;
    const t = setTimeout(() => {
      cachedDerivations(engine, boxNames);
      bump((x) => x + 1);
    }, 30);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxKey, ready]);

  const suggestions = useMemo(() => {
    if (!ready || !elements.length) return null;
    const ctx = getAttainContext(
      engine, pals, breeding, boxNames, playerLevel, ownedAny);
    return counterSuggestions(ctx, ownedAny, elements, moveEls);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, boxKey, playerLevel, elKey, moveEls]);

  const openPal = (pal: string) => {
    onLeave();
    navigateTo({ domain: 'bosses', tab: 'paldex', payload: { pal } });
  };
  const planPal = (pal: string) => {
    void Haptics.selectionAsync();
    onLeave();
    navigateTo({ domain: 'breeding', tab: 'plan', payload: { fromCard: pal } });
    // let the navigation paint before planner-grade work (PalDetail's rule)
    setTimeout(() => {
      addPlanTarget(pal);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }, 60);
  };

  return (
    <>
      <Card style={{ padding: 14 }}>
        <Text style={s.h3}>Your best pals for this fight</Text>
        <Text style={[s.body, { fontSize: 12, marginTop: 2 }]}>
          Ranked by element matchups against this boss and its own attacks,
          then base attack. It doesn’t simulate the fight — it tells you why
          each pick is here.
        </Text>
        <View style={{ marginTop: 6 }}>
          {ownedTop.map((r: CounterRow) => (
            <CounterPalRow key={r.name} row={r}
              why={matchupLabel(r, bossName)}
              onOpen={() => openPal(r.name)} />
          ))}
          {!ownedTop.length && (
            <Text style={[s.body, { marginTop: 4 }]}>
              Nothing ticked as owned yet — your box picks this list.
            </Text>
          )}
          {ownedMoreWithEdge > 0 && (
            <Text style={[s.body, { fontSize: 12, color: T.faint, marginTop: 4 }]}>
              …and {ownedMoreWithEdge} more you own that also hit it for double.
            </Text>
          )}
        </View>
      </Card>

      {elements.length > 0 && (
        <Card style={{ padding: 14 }}>
          <Text style={s.h3}>Worth getting for this fight</Text>
          <Text style={[s.body, { fontSize: 12, marginTop: 2 }]}>
            Pals that hit it for double, ranked the same way, closest to your
            save first. Tap one for where to catch it; Plan it sends a
            breeding route to the Planner.
          </Text>
          <View style={{ marginTop: 6 }}>
            {suggestions == null && (
              <Text style={[s.body, { marginTop: 4 }]}>Reading your save…</Text>
            )}
            {suggestions?.map(({ row, attain }: { row: CounterRow; attain: Attain }) => (
              <CounterPalRow key={row.name} row={row}
                why={matchupLabel(row, bossName)}
                attain={attain}
                onOpen={() => openPal(row.name)}
                onPlan={attain.kind === 'breed' ? () => planPal(row.name) : null} />
            ))}
            {suggestions != null && !suggestions.length && (
              <Text style={[s.body, { marginTop: 4 }]}>
                No catchable or breedable counters are in reach of your save yet.
              </Text>
            )}
          </View>
        </Card>
      )}
    </>
  );
}

/** One line per attack: its element, its name, what it inflicts, its power. */
export function MovesList({ moves }: { moves: BossMove[] }) {
  if (!moves.length) {
    return (
      <Text style={[s.body, { marginTop: 8 }]}>
        Its move list isn’t in the boss tables we mirror — nothing made up to
        fill the gap.
      </Text>
    );
  }
  return (
    <View style={{ marginTop: 10, gap: 7 }}>
      <Text style={[s.body, { fontSize: 12, color: T.faint }]}>
        Its attacks — the {moves.length} it uses at this difficulty:
      </Text>
      {moves.map((m) => {
        const c = ELEMENT_COLORS[m.element.toLowerCase()] ?? ELEMENT_COLORS.neutral;
        const eff = effectWords(m.effects);
        return (
          <View key={`${m.lv}-${m.name}`} style={[s.row, { gap: 8 }]}
            accessible
            accessibilityLabel={`${m.name}, ${m.element}, power ${m.power}${
              eff ? `, causes ${eff}` : ''}`}>
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
            {eff && <Text style={{ color: T.muted, fontSize: 11.5 }}>{eff}</Text>}
            <Text style={{ color: T.accentInk, fontSize: 12, fontWeight: '800' }}>
              {m.power} power
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** What beating it gives you, in the game's own odds. */
export function RewardsSection({ drops }: { drops: BossDrop[] }) {
  return (
    <Card style={{ padding: 14 }}>
      <Text style={s.h3}>Winning gets you</Text>
      {drops.length ? (
        <View style={{ marginTop: 8, gap: 6 }}>
          {groupDrops(drops).map((d) => (
            <View key={d.item} style={[s.row, { gap: 8 }]}
              accessible
              accessibilityLabel={`${d.item}, ${d.amount}${
                d.twice ? ', listed twice in the drop table' : ''}`}>
              <Icon name="package-variant-closed" size={15} color={T.faint} />
              <Text style={{ color: T.ink, fontSize: 13, fontWeight: '700', flex: 1 }}
                numberOfLines={2}>
                {d.item}
              </Text>
              <Text style={{ color: T.muted, fontSize: 11.5 }}>
                {d.amount}{d.twice ? ' · listed twice' : ''}
              </Text>
            </View>
          ))}
          <Text style={[s.body, { fontSize: 11, color: T.faint, marginTop: 2 }]}>
            The game’s own drop table for this fight.
          </Text>
        </View>
      ) : (
        <Text style={[s.body, { marginTop: 6 }]}>
          Its drop table isn’t in the boss pages we mirror — nothing invented
          to fill the gap.
        </Text>
      )}
    </Card>
  );
}

/** The weakness + coverage sentence every card opens with. */
export function coverageLine(
  elements: string[], hasEdge: boolean, boxSize: number,
): string {
  const weak = weaknessLabel(elements);
  if (!boxSize) {
    return `${weak} Your box is empty — tick what you own in the Paldex and `
      + 'this section will pick your team.';
  }
  if (hasEdge) return `${weak} Your box has the counters — bring the pals below.`;
  if (!elements.length) {
    return `${weak} Bring your strongest — no pal hits it harder than another.`;
  }
  return `${weak} Nothing you own hits it for double yet — the pals under `
    + '"Worth getting" close that gap.';
}
