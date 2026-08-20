/** One ranked pal in a fight's advice list — the row every Bosses screen
 * uses, so a pick reads the same everywhere it appears.
 *
 * "Plan it" sits BESIDE the tappable area, never inside it: a button
 * nested in a button is invalid on web (the QA render flagged the
 * hydration error) and a tap-conflict on the phone.
 */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { T } from '../../theme';
import { Badge, Btn, PalIcon, s } from '../../ui/kit';
import { attainLabel, type Attain } from '../../logic/recommend';
import type { CounterRow } from '../../logic/counters';

export function CounterPalRow({ row, why, attain, onOpen, onPlan, onWhere }: {
  row: CounterRow; why: string; attain?: Attain | null;
  onOpen: () => void;
  /** breeding route -> the Planner */
  onPlan?: (() => void) | null;
  /** catchable -> its card, which carries the spawn map */
  onWhere?: (() => void) | null;
}) {
  const label = attain ? attainLabel(attain) : null;
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
      {onWhere && <Btn small label="Where to catch" onPress={onWhere} />}
      {onPlan && <Btn small label="Breeding plan" onPress={onPlan} />}
    </View>
  );
}
