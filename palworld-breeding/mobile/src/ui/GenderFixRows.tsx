/** The how-to-fix rows under a gender-gap warning.
 *
 * The Planner's step cards and the Calculator's pair warning both name the
 * missing ♂/♀; these rows say how to actually get it, ranked by cheapness
 * from what the player owns (logic/genderFix.ts). One component, so the
 * two screens can never drift into different advice.
 *
 * Each row opens the named pal's card — the spawn map and every obtain
 * route already live there, so every branch of the advice ends somewhere
 * the player can act.
 */
import React, { useMemo } from 'react';
import { Pressable, Text } from 'react-native';
import { T } from '../theme';
import { Icon } from './Icon';
import {
  canPairNow, engine, genderUnsure, getBox, getPlan, pals,
} from '../store';
import { findPair, fixLine, type Need, type NeedFix } from '../logic/genderFix';
import { maleProb } from '../data/genderRatio.g';

export function GenderFixRows({ needs, onView }: {
  needs: Need[];
  onView: (name: string) => void;
}) {
  const box = getBox();
  const plan = getPlan();
  const fixes = useMemo(() => {
    const ownedNames = Object.keys(box);
    return needs.map((n): { n: Need; fix: NeedFix } => {
      const planStep = plan?.steps.find((st) => st.child === n.s);
      const { pair, fromPlan } = findPair(
        ownedNames,
        planStep ? [planStep.parents[0], planStep.parents[1]] : null,
        (x, y) => engine.childrenOf(x, y).some(
          (ch) => ch.species === n.s && canPairNow(x, y, ch.genderNote)),
      );
      return {
        n,
        fix: {
          species: n.s, gender: n.g, unsure: genderUnsure(n.s), pair, fromPlan,
          wild: !!pals[n.s]?.wild, maleProb: maleProb(n.s),
        },
      };
    });
  }, [needs, box, plan]);

  return (
    <>
      {fixes.map(({ n, fix }) => (
        <Pressable key={`${n.g}${n.s}`}
          onPress={() => onView(n.s)}
          accessibilityRole="button"
          accessibilityLabel={
            `How to get a ${n.g === 'm' ? 'male' : 'female'} ${n.s} — opens its card`}
          style={({ pressed }) => ({
            flexDirection: 'row', alignItems: 'center', gap: 6,
            paddingRight: 4, paddingVertical: 2,
            opacity: pressed ? 0.6 : 1,
          })}>
          <Text style={{ color: T.muted, fontSize: 12, flex: 1 }}>
            <Text style={{ color: T.accentInk, fontWeight: '800' }}>
              {n.g === 'm' ? '♂' : '♀'} {n.s}
            </Text>
            {'  '}{fixLine(fix)}
          </Text>
          <Icon name="chevron-right" size={14} color={T.faint} />
        </Pressable>
      ))}
    </>
  );
}
