/** The Teams tab — your box as a fighting force: which of the nine
 * elements you already counter, where you're thin, and — per element —
 * who to bring and who to go get. Same shared rules as the Boss Card
 * (bosses/counterPicks.ts), one level up.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ELEMENT_COLORS, T } from '../../theme';
import {
  addPlanTarget, breeding, engine, getBox, getPlayerLevel, ownedAny, pals,
} from '../../store';
import { navigateTo } from '../../nav/intent';
import { Badge, Card, DataStamp, PageHead, PalIcon, s } from '../../ui/kit';
import { Icon } from '../../ui/Icon';
import { ELEMENTS } from '../../data/elements';
import { ELEMENT_ICONS } from '../../data/statIcons';
import {
  boxKeyOf, cachedDerivations, derivationsReady, getAttainContext,
} from '../../logic/recommend';
import { attackMultiplier, matchupLabel } from '../../logic/counters';
import { counterSuggestions, ownedCounterRows } from '../../bosses/counterPicks';
import { CounterPalRow } from './BossCard';

export function TeamsScreen() {
  const [openEl, setOpenEl] = useState<string | null>(null);
  const box = getBox();
  const boxNames = Object.keys(box);
  const boxKey = boxKeyOf(boxNames);
  const playerLevel = getPlayerLevel();

  /* per defending element: your best owned answer (instant math) */
  const coverage = useMemo(() => ELEMENTS.map((el) => {
    const rows = ownedCounterRows(boxNames, [el], []);
    const best = rows.find((r) => r.offense === 2) ?? null;
    return { el, best, rows };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [boxKey]);
  const covered = coverage.filter((c) => c.best).length;

  /* the reachability pass for gap advice — gated like everywhere else */
  const ready = derivationsReady(boxNames);
  const [, bump] = useState(0);
  useEffect(() => {
    if (ready || openEl == null) return undefined;
    const t = setTimeout(() => {
      cachedDerivations(engine, boxNames);
      bump((x) => x + 1);
    }, 30);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxKey, ready, openEl]);
  const gaps = useMemo(() => {
    if (!ready || openEl == null) return null;
    const ctx = getAttainContext(engine, pals, breeding, boxNames, playerLevel, ownedAny);
    return counterSuggestions(ctx, ownedAny, [openEl], []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, boxKey, playerLevel, openEl]);

  const openPal = (pal: string) => {
    navigateTo({ domain: 'bosses', tab: 'paldex', payload: { pal } });
  };
  const planPal = (pal: string) => {
    void Haptics.selectionAsync();
    navigateTo({ domain: 'breeding', tab: 'plan', payload: { fromCard: pal } });
    setTimeout(() => {
      addPlanTarget(pal);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }, 60);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }}>
      <PageHead
        title="Your squad"
        sub={boxNames.length
          ? `Your box against every element a boss can be. It covers ${covered} of 9 — tap an element for who to bring and who to go get.`
          : 'Tick what you own in the Paldex and this page becomes your fight planner: who to bring against every element, and who to go get.'}
        stamp
      />

      <View style={{ gap: 9 }}>
        {coverage.map(({ el, best, rows }) => {
          const c = ELEMENT_COLORS[el.toLowerCase()] ?? ELEMENT_COLORS.neutral;
          const on = openEl === el;
          const bestResists = best
            ? attackMultiplier(el, pals[best.name]?.elements ?? []) <= 0.5
            : false;
          return (
            <Card key={el} style={{ padding: 12 }}>
              <Pressable
                onPress={() => {
                  void Haptics.selectionAsync();
                  setOpenEl(on ? null : el);
                }}
                accessibilityRole="button"
                accessibilityState={{ expanded: on }}
                accessibilityLabel={`Against ${el}: ${
                  best
                    ? `bring ${best.name}${bestResists ? ', which also resists it' : ''}`
                    : 'no counter in your box yet'
                }`}
                style={({ pressed }) => [s.row, { gap: 10, opacity: pressed ? 0.7 : 1 }]}
              >
                <View style={[s.chip, {
                  backgroundColor: c.bg, flexDirection: 'row',
                  alignItems: 'center', gap: 5, paddingHorizontal: 8,
                  paddingVertical: 4, minWidth: 92, justifyContent: 'center',
                }]}>
                  {ELEMENT_ICONS[el] && (
                    <Image source={ELEMENT_ICONS[el]} style={{ width: 15, height: 15 }} />
                  )}
                  <Text style={[s.chipText, { color: c.fg }]}>{el}</Text>
                </View>
                {best ? (
                  <>
                    <PalIcon name={best.name} size={32} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: T.ink, fontWeight: '800', fontSize: 13.5 }}
                        numberOfLines={1}>
                        {best.name}
                      </Text>
                      <Text style={{ color: T.faint, fontSize: 11 }} numberOfLines={1}>
                        hits it for double{bestResists ? ' — and resists it back' : ''}
                      </Text>
                    </View>
                  </>
                ) : (
                  <Text style={[s.body, { flex: 1, fontSize: 12.5 }]}>
                    {boxNames.length
                      ? 'no counter in your box yet'
                      : 'your box is empty'}
                  </Text>
                )}
                <Icon name={on ? 'chevron-up' : 'chevron-down'} size={18} color={T.faint} />
              </Pressable>

              {on && (
                <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: T.line, paddingTop: 4 }}>
                  {rows.filter((r) => r.offense === 2).slice(0, 4).map((r) => (
                    <CounterPalRow key={r.name} row={r}
                      why={matchupLabel(r, `a ${el} boss`)}
                      onOpen={() => openPal(r.name)} />
                  ))}
                  {!rows.some((r) => r.offense === 2) && boxNames.length > 0 && (
                    <Text style={[s.body, { fontSize: 12, marginTop: 4 }]}>
                      Nothing you own hits {el} for double — close the gap:
                    </Text>
                  )}
                  {gaps == null && (
                    <Text style={[s.body, { fontSize: 12, marginTop: 6 }]}>
                      Reading your save…
                    </Text>
                  )}
                  {gaps?.map(({ row, attain }) => (
                    <CounterPalRow key={row.name} row={row}
                      why={matchupLabel(row, `a ${el} boss`)}
                      attain={attain}
                      onOpen={() => openPal(row.name)}
                      onPlan={attain.kind === 'breed' ? () => planPal(row.name) : null} />
                  ))}
                  {gaps != null && !gaps.length && (
                    <Text style={[s.body, { fontSize: 12, marginTop: 6 }]}>
                      No catchable or breedable {el}-counters are in reach
                      of your save yet.
                    </Text>
                  )}
                </View>
              )}
            </Card>
          );
        })}
      </View>

      <View style={{ marginTop: 12 }}>
        <Badge kind="plain">how this is ranked</Badge>
        <Text style={[s.body, { fontSize: 12, marginTop: 6 }]}>
          Ranked by element matchups and base stats, closest-to-your-save
          first for pals you don’t own. It doesn’t simulate fights — for a
          specific boss, open it on the Tower or Raids tab and the same
          math runs against that boss’s own attack kit.
        </Text>
      </View>
      <DataStamp />
    </ScrollView>
  );
}
