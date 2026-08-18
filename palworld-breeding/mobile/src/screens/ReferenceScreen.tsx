/** Reference — mechanics handbook + the verified-claims table. */
import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { T } from '../theme';
import { Badge, Btn, Card, PageHead, PalIcon, s, type BadgeKind } from '../ui/kit';
import { HELPERS } from '../engine/helpers';
import { claims, claimsCheckedOn } from '../store';

/** Every verdict the claims file actually uses must be mapped, or it falls
 * to an amber badge — which read as DOUBT on three claims that deserve the
 * opposite ("verified" and the two upstream defects we corrected), on the
 * one screen whose whole job is proof. A test derives the required keys
 * from the shipped claims file, so a new verdict can never slip through. */
const VERDICT: Record<string, [string, BadgeKind]> = {
  confirmed: ['confirmed', 'ok'],
  verified: ['verified', 'ok'],
  plausible: ['likely', 'warn'],
  contradicted: ['contradicted', 'bad'],
  not_found: ['not found', 'warn'],
  'upstream defect, normalised': ['upstream defect, normalised', 'plain'],
  'upstream defect, overridden': ['upstream defect, overridden', 'plain'],
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card style={{ marginBottom: 10 }}>
      <Text style={s.h2}>{title}</Text>
      <View style={{ marginTop: 6 }}>{children}</View>
    </Card>
  );
}

const P = ({ children }: { children: React.ReactNode }) => (
  <Text style={[s.body, { marginTop: 4 }]}>{children}</Text>
);

export function ReferenceScreen() {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? claims : claims.slice(0, 5);
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <PageHead title="Reference"
        sub="How 1.0 breeding actually works — with receipts. Community-measured numbers are labelled as such." />

      <Section title="The species formula">
        {/* said "⌊(A + B + 1)/2⌋" — floor brackets, the exact notation shape
            E105 banned from the Calculator. Same mechanic, same words as the
            Calculator's own sentence: average them, rounding up. */}
        <P>134 pairs have a fixed recipe and one pair (Katress/Wixen) is gender-locked:
        female Katress + male Wixen gives Katress Ignis, the reverse gives Wixen Noct.
        Every other pair averages the parents' hidden breeding numbers, rounding up,
        and the child is the species closest to that target among the 183 in the
        generic pool. Exact ties go to the higher number. This engine replays all
        44,851 precomputed game-file results with zero mismatches.</P>
      </Section>

      <Section title="What an egg rolls">
        <P>• Passives from the parents: pooled together, each listed once; the child draws
        1–4 with weights 40/30/20/10.</P>
        <P>• Random passives: an independent roll adds 0–3 new ones (40/30/20/10),
        capped at four slots.</P>
        <P>• IVs: 1, 2 or all 3 stat categories come from the parents (50/33/17);
        each inherited category picks mother or father on a coin flip.</P>
        <P>The Odds Lab turns these into per-egg probabilities for any real pairing.</P>
      </Section>

      <Section title="Cakes">
        <P>Cake is consumed per egg. Breeding Farm is tech 19, standard Cake tech 17
        (5 Flour · 8 Red Berries · 7 Milk · 8 Eggs · 2 Honey). Mushroom Cake (tech 30):
        better IVs. Vegetable Cake (47): two eggs per cycle. Extravagant Vegetable Cake
        (60): ~3% mutation per egg. Special Cake (74): carries more parent passives —
        exact override not datamined. Cake in the farm's chest does not spoil.</P>
      </Section>

      <Section title="Helper pals worth getting early">
        <P>Straight from the game's partner-skill data — the Planner recommends
        these automatically when a plan needs them. Stars = how much they matter.</P>
        <View style={{ gap: 9, marginTop: 10 }}>
          {HELPERS.map((h) => (
            <View key={h.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
              <PalIcon name={h.name} size={30} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: T.ink, fontWeight: '800', fontSize: 13 }}>
                  {h.name}
                  {'  '}
                  <Text style={{ color: T.goldInk, fontSize: 10.5 }}>{'★'.repeat(h.score)}</Text>
                </Text>
                <Text style={{ color: T.muted, fontSize: 11.5 }}>{h.effect}</Text>
              </View>
            </View>
          ))}
        </View>
      </Section>

      <Section title="Mutation (new in 1.0)">
        <P>~1% of eggs (3% on Extravagant) hatch mutated: an Alpha at 2★ condensation,
        IVs ~91–100, and passives from the mutation-only rainbow set (Immortality,
        Idiosyncratic, Babysitter, Heavily Armored, Skymarcher). The species can differ
        from the pair's normal child. One mutant is a permanent source — rainbow
        passives breed down normally.</P>
      </Section>

      <Section title="The order for one perfect pal">
        <P>1) Species (Route Planner) → 2) passives (Pal Surgery Table, tech 38 —
        standard implants aren't consumed, so chain-breeding purely for passives is
        obsolete) → 3) IVs (Mushroom Cake + same-species) → 4) condensing →
        5) Awakening last. Gender swaps with the Pal Reverser.</P>
      </Section>

      <Section title="Condensing (1.0)">
        <P>4★ costs 48 copies — 4/8/12/24 per star (old guides say 116; that's pre-1.0).
        Mutant eggs hatch at 2★, leaving 36. Starfruit (Dog Coins) substitutes for
        copies.</P>
      </Section>

      <Text style={[s.h2, { marginTop: 8, marginBottom: 2 }]}>Verified claims</Text>
      {claimsCheckedOn && (
        <Text style={[s.body, { fontSize: 11.5, color: T.faint, marginBottom: 8 }]}>
          Last checked {claimsCheckedOn}.
        </Text>
      )}
      <View style={{ gap: 8 }}>
        {shown.map((c) => {
          const [label, kind] = VERDICT[c.verdict] ?? [c.verdict, 'warn' as BadgeKind];
          return (
            <Card key={c.claim} style={{ padding: 12 }}>
              <View style={[s.wrap]}>
                <Badge kind={kind}>{label}</Badge>
              </View>
              <Text style={{ color: T.ink, fontWeight: '700', fontSize: 13, marginTop: 6 }}>
                {c.claim}
              </Text>
              <Text style={[s.body, { fontSize: 12, marginTop: 4 }]}>{c.evidence}</Text>
              {/* 77 citations across 30 of the 36 claims were in the file and
                  shown nowhere — on the one screen whose whole job is proving
                  where the numbers come from. The other 6 name their sources
                  inside the evidence text above, so they get no line rather
                  than an empty one. */}
              {(c.sources?.length ?? 0) > 0 && (
                <Text style={[s.body, { fontSize: 11, color: T.faint, marginTop: 5 }]}>
                  Checked against: {c.sources!.join(' · ')}
                </Text>
              )}
            </Card>
          );
        })}
      </View>
      {!showAll && claims.length > 5 && (
        <View style={{ marginTop: 10 }}>
          <Btn label={`Show all ${claims.length} claims`} onPress={() => setShowAll(true)} />
        </View>
      )}

      <Card style={{ marginTop: 12 }}>
        <Text style={s.h3}>Where the map comes from</Text>
        <P>Every spot on the map is datamined, never estimated. The 68,617 wild
        spawn points, their level ranges and whether a pal only comes out at
        night are extracted from the game&apos;s own spawner tables by
        palworld-atlas-data (MIT), which reads the official dedicated-server
        package. The 11,097 chests, ore nodes, statues, dungeons and the rest
        come from pal-atlas (MIT).</P>
        <P>The map picture is the game&apos;s own map texture. Palpagos is drawn
        from the full-size 8192 version published by PalMiniMap (MIT); the World
        Tree comes from pal-atlas (MIT) at half that, because no larger copy of
        it has been published. Most of the map symbols are the game&apos;s
        own too — eight of them at full size from PalMiniMap, the rest from
        pal-atlas.</P>
        <P>Positions use the game&apos;s own DT_WorldMapUIData bounds, checked
        against 58,504 spawn points and a second project&apos;s markers; the worst
        error left is about 6 pixels in 4096.</P>
        <P>Spawns inside dungeons are kept apart from the ones out in the world,
        because standing on the surface above a dungeon spawn finds you nothing.</P>

        <Text style={[s.h3, { marginTop: 12 }]}>Data & provenance</Text>
        <P>paldb.cc CombiRanks via beliarance/palworld-kb, cross-validated against
        palcalc's 44,851 game-file results (zero mismatches) and the raw
        DT_PalCombiUnique table. Inheritance weights from GameSettings via palcalc.
        Icons: game-dump via dbgoodm/PalDex.</P>
        <P>Palforge is a fan project — not affiliated with Pocketpair. No ads, no
        tracking, no accounts; your box lives on this device only.</P>
      </Card>
    </ScrollView>
  );
}
