/** The pal info card — stats, work, partner skill, every breeding recipe.
 * Shared: opened from the Paldex grid AND from any pal icon in the Plan. */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { T } from '../theme';
import { Badge, Btn, Card, DataStamp, ElementChips, GenderToggles, PalIcon, s } from './kit';
import { Image } from 'react-native';
import {
  addPlanTarget, breeding, engine, getPlan, ownedAny, pals, selfOnly, useAppVersion, workLabel,
} from '../store';
import type { PalInfo } from '../store';
import { navigateTo } from '../nav/intent';
import { itemIdByName } from '../itemsData';
import { wildBands } from '../map/layers';
import { WORK_ICONS } from '../data/workIcons';
import { PalMap } from './PalMap';
import { cleanEffect } from '../data/palText';
import { STAT_ICONS } from '../data/statIcons';
import {
  rarityGrade, rarityTint, wildLevelRange, type RarityGrade,
} from '../data/rarity';
import { ABOUT } from '../data/about';
import { Icon } from './Icon';
import { ALPHA_SPOTS } from '../data/alphaSpots.g';
import { PALCALC_FACTS } from '../data/palcalcFacts.g';
import { ALPHA_STATS } from '../data/alphaStats.g';
import { bossLine } from '../alphaFacts';

/** The real ceiling of each stat, read from the data instead of guessed. The
 * bar used to divide by a hard-coded 150 and clamp, so all nine pals with 150
 * or more attack drew an identical full bar — a 200 looked the same as a 150,
 * and every ordinary pal's bar was overstated by a third. */
const STAT_MAX: Record<'hp' | 'atk' | 'def', number> = (() => {
  const m = { hp: 1, atk: 1, def: 1 };
  for (const q of Object.values(pals)) {
    for (const k of ['hp', 'atk', 'def'] as const) {
      const v = q[k];
      if (v != null && v > m[k]) m[k] = v;
    }
  }
  return m;
})();

/** The hungriest pal in the game, read from the data. The gauge below used to
 * draw a flat ten slots, so even a 9 — the real maximum — showed one empty
 * pip, implying an appetite tier that does not exist. Same mistake the stat
 * bars made with their invented ceiling of 150. */
const FOOD_MAX = Math.max(1, ...Object.values(pals).map((q) => q.food ?? 0));

/** Where a value sits among all species for one stat (1 = best), and how many
 * other species sit on exactly the same spot. The ties here are enormous —
 * 121 pals have exactly 100 attack — so a bare "#132 of 299" read as a precise
 * placing when four pals in five actually share theirs with nine or more. */
function statRank(
  stat: 'hp' | 'atk' | 'def',
  v: number | null,
): { rank: string; tied: number } | null {
  if (v == null) return null;
  let better = 0;
  let total = 0;
  let same = 0;
  for (const q of Object.values(pals)) {
    const qv = q[stat];
    if (qv == null) continue;
    total++;
    if (qv > v) better++;
    else if (qv === v) same++;
  }
  return { rank: `#${better + 1} of ${total}`, tied: same - 1 };
}

/** The obtain_notes worth showing. The only line in all 670 that leaks a data
 * field name is "no regular wild spawn - catch its boss/alpha (see
 * alpha_locations)", and its plain half is already the badge below and the map
 * above — so lines that start that way are dropped and the rest are the
 * dataset's own words, untouched. */
/** Three cards on this screen are gated on the pal having the data, and on a
 * handful of species the data is empty — so the card silently vanished. Every
 * OTHER pal shows it, which makes the gap read as a broken screen rather than
 * as a fact. E114's lesson, one screen along: an absence nobody explains reads
 * as a bug.
 *
 * The counts are read from the data, never typed, so the sentence cannot go
 * stale if the files change. */
const missingCounts = new Map<string, number>();
function countWithout(key: string, has: (q: PalInfo) => boolean): number {
  let n = missingCounts.get(key);
  if (n == null) {
    n = Object.values(pals).filter((q) => !has(q)).length;
    missingCounts.set(key, n);
  }
  return n;
}

/** Says what is true of THE FILES WE READ — never that the game intends it.
 * We can prove our extraction lists nothing; we cannot prove the pal has
 * nothing. Same words on all three cards, so the app never explains the same
 * silence two different ways. */
function NothingListed(
  { what, name, others }: { what: string; name: string; others: number },
) {
  return (
    <Text style={[s.body, { marginTop: 4 }]}>
      The game files we read list no {what} for {name} — {others === 1
        ? 'the only pal in the Paldex like that'
        : `one of only ${others} pals in the Paldex like that`}.
      Rather than guess, the app shows that as it is.
    </Text>
  );
}

function otherWays(p: { obtain_notes?: string[] | null }): string[] {
  return (p.obtain_notes ?? []).filter((l) => !l.startsWith('no regular wild spawn'));
}

/** Deterministic sparkle field — positions fixed so nothing shifts between
 * renders, density scales with the pal's own rarity integer. */
const SPARKS: { t: number; l: `${number}%`; s: number; o: number }[] = [
  { t: 26, l: '64%', s: 15, o: 0.6 },
  { t: 74, l: '88%', s: 11, o: 0.5 },
  { t: 128, l: '7%', s: 12, o: 0.45 },
  { t: 44, l: '22%', s: 9, o: 0.4 },
  { t: 156, l: '72%', s: 10, o: 0.5 },
  { t: 100, l: '44%', s: 8, o: 0.35 },
  { t: 12, l: '38%', s: 7, o: 0.3 },
  { t: 170, l: '30%', s: 8, o: 0.35 },
  { t: 62, l: '52%', s: 6, o: 0.28 },
];

/** The atmosphere behind the sheet's hero zone — drama scales with the tier
 * (CEO 2026-08-15: commons show NOTHING; a legendary must obviously outclass
 * an epic, and nothing may look like one flat colour):
 *   soft   → one aura + 3 sparkles, still
 *   full   → two-tone aurora, sparkle field, one light sweep
 *   legend → layered two-tone aurora, dense two-colour sparkles, DOUBLE sweep
 * The sweep is one native-driver transform loop, alive only while this modal
 * is open — the GPU pays, the JS thread does not. */
function RarityAtmosphere({ r }: { r: RarityGrade }) {
  const sweep = useRef(new Animated.Value(0)).current;
  const animated = r.tier === 'full' || r.tier === 'legend';
  useEffect(() => {
    if (!animated) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(sweep, {
        toValue: 1, duration: 3800, easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.delay(r.tier === 'legend' ? 1800 : 2600),
      Animated.timing(sweep, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [animated, r.tier, sweep]);
  if (r.tier === 'none') return null;

  const sparkCount = r.tier === 'soft' ? 3 : r.tier === 'full' ? 6 : 9;
  const sweepX = sweep.interpolate({ inputRange: [0, 1], outputRange: [0, 560] });
  // the echo trails the main band using the same clock — no second timer
  const echoX = sweep.interpolate({ inputRange: [0, 1], outputRange: [-90, 470] });
  return (
    <View pointerEvents="none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 240, overflow: 'hidden' }}>
      {/* aurora — primary hue top-left under the name, second hue answering
          from the right so the zone never reads as one flat colour */}
      <View style={{
        position: 'absolute', top: -110, left: -70, width: 300, height: 300,
        borderRadius: 150, backgroundColor: r.aura,
      }} />
      {r.tier !== 'soft' && (
        <View style={{
          position: 'absolute', top: -60, right: -90, width: 320, height: 320,
          borderRadius: 160, backgroundColor: r.aura2,
        }} />
      )}
      {r.tier === 'legend' && (
        <View style={{
          position: 'absolute', top: 60, left: '30%', width: 220, height: 220,
          borderRadius: 110, backgroundColor: r.aura2, opacity: 0.8,
        }} />
      )}
      {animated && (
        <>
          <Animated.View style={{
            position: 'absolute', top: -60, left: -120, width: 90, height: 380,
            backgroundColor: r.shine,
            transform: [{ translateX: sweepX }, { rotate: '24deg' }],
          }} />
          {r.tier === 'legend' && (
            <Animated.View style={{
              position: 'absolute', top: -60, left: -120, width: 28, height: 380,
              backgroundColor: r.shine,
              transform: [{ translateX: echoX }, { rotate: '24deg' }],
            }} />
          )}
        </>
      )}
      {SPARKS.slice(0, sparkCount).map((sp, i) => (
        <View key={i} style={{ position: 'absolute', top: sp.t, left: sp.l, opacity: sp.o }}>
          <Icon name="star-four-points" size={sp.s}
            color={i % 2 ? r.sparkle2 : r.sparkle} />
        </View>
      ))}
    </View>
  );
}

function StatBar({ label, icon, v, stat, rank }: {
  label: string; icon?: number; v: number | null;
  stat: 'hp' | 'atk' | 'def'; rank?: { rank: string; tied: number } | null;
}) {
  return (
    <View style={[s.row, { gap: 8 }]}>
      {icon != null && <Image source={icon} style={{ width: 18, height: 18 }} />}
      <Text style={{ color: T.muted, width: 56, fontSize: 11, fontWeight: '800' }}>{label}</Text>
      <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: T.surface2 }}>
        <View style={{
          width: `${Math.min(100, ((v ?? 0) / STAT_MAX[stat]) * 100)}%`,
          height: '100%', borderRadius: 4, backgroundColor: T.accent,
        }} />
      </View>
      {rank != null && (
        <View style={{ width: 78 }}>
          <Text style={{ color: T.faint, fontSize: 10, textAlign: 'right' }}>{rank.rank}</Text>
          {rank.tied > 0 && (
            <Text style={{ color: T.faint, fontSize: 9, textAlign: 'right', opacity: 0.8 }}>
              {rank.tied} pal{rank.tied === 1 ? '' : 's'} tied
            </Text>
          )}
        </View>
      )}
      <Text style={{ color: T.ink, width: 32, fontSize: 12, textAlign: 'right' }}>{v ?? '—'}</Text>
    </View>
  );
}

export function PalDetail({ name, onClose }: { name: string; onClose: () => void }) {
  useAppVersion();
  // condensation preview: +5% HP/ATK/DEF per star, partner skill level 1-5,
  // every existing work suitability +1 at 4 stars (1.0, wiki-verified)
  const [stars, setStars] = useState(0);
  const [aboutOpen, setAboutOpen] = useState(false);
  // Whether the blurb actually overflows two lines — MEASURED at layout time,
  // not guessed from its length. The old rule showed "tap to read more" past
  // 120 characters, but the text is clamped by LINES: Vixy's 111-character
  // blurb lost a whole line with nothing offering to show it, while
  // Hoocrates' 91 fitted fine. Where the third line begins depends on which
  // letters are in it, so no character count can answer this.
  //
  // The length rule stays as a FLOOR, OR'd with the measurement. onTextLayout
  // is an iOS/Android prop that react-native-web does not implement, so it
  // cannot be verified on the QA render — and dropping the old rule on the
  // strength of an unverifiable API would have taken the hint away from the
  // 272 blurbs it already serves in order to fix 15. OR'd, the measurement
  // can only ever ADD the hint where it was missing.
  const [aboutClipped, setAboutClipped] = useState(false);
  useEffect(() => {
    setStars(0);
    setAboutOpen(false);
    setAboutClipped(false);
  }, [name]);
  const p = pals[name];
  if (!p) return null;
  // derived live: reopening the card of an already-planned pal must say so
  const planned = getPlan()?.targets.includes(name) ?? false;
  const boost = (v: number | null) => (v == null ? v : Math.round(v * (1 + 0.05 * stars)));
  const asChild = breeding.unique_combos.filter((c) => c.child === name);
  const asParent = breeding.unique_combos.filter((c) => c.parents.includes(name));
  const gendered = breeding.gendered_combos.filter(
    (g) => g.child === name || g.mother === name || g.father === name,
  );
  const inPool = !breeding.excluded_from_generic_pool.includes(name);
  // VANILLA look (CEO 2026-08-15 evening): the rarity colour experiments are
  // PARKED — plain sheet, plain cards, no atmosphere, no ring. The grade
  // still feeds the badge's integer + RarityAtmosphere stays in the file for
  // when the CEO returns to the design.
  const r = rarityGrade(name, p.rarity);

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView style={{ flex: 1, backgroundColor: T.bg2 }}
        contentContainerStyle={{ padding: 18, paddingBottom: 50 }}>
        <View style={[s.row, { gap: 14 }]}>
          <PalIcon name={name} size={72} />
          <View style={{ flex: 1 }}>
            <Text style={s.h1}>{name}</Text>
            <View style={[s.wrap, { marginTop: 5 }]}>
              <Badge kind="plain">#{p.number || '—'}</Badge>
              <ElementChips name={name} />
              {p.nocturnal ? <Badge kind="plain">nocturnal</Badge> : null}
            </View>
          </View>
          <Btn label="✕" onPress={onClose} small />
        </View>
        {/* The densest datamined surface in the app — stats, rank, work
            levels, drops, spawn levels, passives — and it was the one screen
            with no provenance and no way to reach the proof without closing
            it first. Criterion #1 asks for the stamp one tap from any RESULT;
            the card is a result. */}
        <DataStamp beforeNavigate={onClose} />

        {ABOUT[name] && (
          <Pressable onPress={() => setAboutOpen(!aboutOpen)}
            accessibilityRole="button"
            accessibilityState={{ expanded: aboutOpen }}
            style={({ pressed }) => [{
            marginTop: 14, backgroundColor: T.surface, borderWidth: 1,
            borderColor: pressed ? T.accent : T.line, borderRadius: 14,
            padding: 12, gap: 4,
          }]}>
            <View style={[s.row, { gap: 6 }]}>
              <Icon name="book-open-variant" size={14} color={T.accentInk} />
              <Text style={{
                color: T.faint, fontSize: 10, fontWeight: '800', letterSpacing: 1.2,
              }}>ABOUT {name.toUpperCase()}</Text>
            </View>
            <Text style={[s.body, { fontStyle: 'italic' }]}
              numberOfLines={aboutOpen ? undefined : 2}>
              {ABOUT[name]}
            </Text>
            {/* Laid out unclamped and invisible purely to count the lines the
                blurb really needs. Absolute, so it takes no space; it sits
                inside the card's padding box, so its width matches the text
                above it exactly. */}
            {!aboutOpen && (
              <Text
                style={[s.body, {
                  fontStyle: 'italic', position: 'absolute',
                  left: 0, right: 0, opacity: 0,
                }]}
                pointerEvents="none"
                onTextLayout={(e) => setAboutClipped(e.nativeEvent.lines.length > 2)}>
                {ABOUT[name]}
              </Text>
            )}
            {/* A state you can enter must say how to leave it — the CEO made
                exactly this point about finished plan phases. */}
            {(aboutOpen || aboutClipped || ABOUT[name].length > 120) && (
              <Text style={{ color: T.accentInk, fontSize: 11, fontWeight: '700' }}>
                {aboutOpen ? 'tap to show less' : 'tap to read more'}
              </Text>
            )}
          </Pressable>
        )}

        <Card style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ color: T.ink, fontWeight: '700', flex: 1 }}>In my box</Text>
          <GenderToggles name={name} />
        </Card>

        <Card style={{ marginTop: 10, gap: 7 }}>
          <View style={[s.row, { gap: 8 }]}>
            <Text style={[s.h3, { flex: 1 }]}>Base stats</Text>
            {/* MEASURED at 21 px tall with 6 of slop = 33 — the smallest
                control left in the app after the 44 pt sweep, and one you tap
                repeatedly to compare stat gains. The stars sit 23 px apart, so
                slop has to be generous VERTICALLY (where the thumb misses) and
                tight horizontally (or neighbouring stars swallow each other's
                taps, which is worse than a small target). */}
            <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}>
              {[1, 2, 3, 4].map((n) => (
                <Pressable key={n} hitSlop={{ top: 11, bottom: 11, left: 2, right: 2 }}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setStars(stars === n ? 0 : n);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: stars >= n }}
                  accessibilityLabel={`${n} star${n === 1 ? '' : 's'} condensed`}>
                  <Icon name={stars >= n ? 'star' : 'star-outline'} size={24}
                    color={stars >= n ? T.gold : T.faint} />
                </Pressable>
              ))}
              {stars > 0 && (
                <Text style={{ color: T.goldInk, fontSize: 11, fontWeight: '800' }}>
                  {' '}+{stars * 5}%
                </Text>
              )}
            </View>
          </View>
          <StatBar label="Health" icon={STAT_ICONS.health} v={boost(p.hp)}
            stat="hp" rank={statRank('hp', p.hp)} />
          <StatBar label="Attack" icon={STAT_ICONS.attack} v={boost(p.atk)}
            stat="atk" rank={statRank('atk', p.atk)} />
          <StatBar label="Defense" icon={STAT_ICONS.defense} v={boost(p.def)}
            stat="def" rank={statRank('def', p.def)} />
          {stars > 0 && (
            <>
              <Text style={[s.body, { fontSize: 11.5, color: T.goldInk }]}>
                Condensed {stars}★: stats +{stars * 5}% · partner skill level {stars + 1} of 5
                {stars === 4 ? ' · every work suitability below +1' : ''} · ranks
                compare base stats
                
              </Text>
              {/* The base stats above ARE datamined. These condensing figures
                  are not — they are community-measured, and the app's whole
                  promise is that you can tell which is which. They were sitting
                  in gold right next to datamined numbers with nothing to
                  separate them (self-found on a code read, 2026-08-16). */}
              <Text style={[s.body, { fontSize: 11, color: T.faint }]}>
                Condensing figures are community-measured, not read from the
                game files. The base stats above are.
              </Text>
            </>
          )}
          {/* The fixed boss is its own creature in the game's parameter
              table (its own row, per-row validated against our CombiRank).
              CEO 2026-08-17: "should show alpha version? Does it not have
              different stats?" — here is exactly how it differs; when a
              boss happens to match its species, the line says that too
              rather than inventing a difference. */}
          {(ALPHA_STATS[name] ?? []).map((a2) => (
            <View key={a2.title}
              style={{ borderTopWidth: 1, borderTopColor: T.line, marginTop: 6, paddingTop: 8, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icon name="crown-outline" size={14} color={T.gold} />
                <Text style={{ color: T.goldInk, fontSize: 12, fontWeight: '800', flex: 1 }}>
                  As the fixed boss{a2.lv != null ? ` (Lv ${a2.lv})` : ''}
                </Text>
              </View>
              <Text style={[s.body, { fontSize: 12 }]}>
                {bossLine(a2, { hp: p.hp, atk: p.atk, def: p.def, size: p.size })}
              </Text>
            </View>
          ))}
          {p.food != null && (
            <View style={[s.row, { gap: 8, marginTop: 2 }]}>
              <Image source={STAT_ICONS.food_on} style={{ width: 18, height: 18 }} />
              <Text style={{ color: T.muted, width: 56, fontSize: 11, fontWeight: '800' }}>Food</Text>
              <View style={{ flexDirection: 'row', gap: 2 }}>
                {Array.from({ length: FOOD_MAX }, (_, i) => (
                  <Image
                    key={i}
                    source={i < (p.food ?? 0) ? STAT_ICONS.food_on : STAT_ICONS.food_off}
                    style={{ width: 15, height: 15, opacity: i < (p.food ?? 0) ? 1 : 0.45 }}
                  />
                ))}
              </View>
            </View>
          )}
          <View style={[s.wrap, { marginTop: 4 }]}>
            {p.size && <Badge kind="plain">size {p.size}</Badge>}
            {p.rarity && (
              <View style={{
                borderWidth: 1.5,
                borderColor: rarityTint(p.rarity, T.line),
                borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2,
              }}>
                <Text style={{
                  color: rarityTint(p.rarity, T.muted), fontSize: 10.5,
                  fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase',
                }}>
                  {p.rarity}
                  {/* the game's own rarity integer — the real measure behind
                      the four bucket words; kept, it's data not paint */}
                  {r.agrees && (
                    <Text style={{ opacity: 0.7 }}>
                      {'  '}rarity {r.n}
                    </Text>
                  )}
                </Text>
              </View>
            )}
            {/* No "work speed" badge. The extractor's craft_speed is 0 for 298
                of the 299 species and null for the last one, so it never said
                anything — and reading "work speed 0" next to a full list of
                work suitabilities suggests the pal cannot work, which is wrong
                for 297 of them. A number that is always zero is not data. */}
            {/* The FLOOR matters as much as the ceiling — "up to Lv 13" never
                told you it also spawns at 6 (CEO 2026-08-15).
                WHERE you meet it matters just as much: the old single range
                came from palcalc, which unions open-world, dungeon and boss
                spawns, so this badge said "wild Lv 5 to 18" for Foxparks while
                the map on the same card said 5-7. 167 of 260 species disagreed
                that way. Open-world and dungeon levels are now stated apart,
                straight from the game's spawner table; palcalc's union is the
                fallback for the ~25 species with no wild spawners at all. */}
            {(() => {
              const bands = wildBands(name);
              if (!bands.surface && !bands.dungeon) {
                return wildLevelRange(name)
                  ? <Badge kind="plain">found in wild {wildLevelRange(name)}</Badge>
                  : p.max_wild_level != null
                    ? <Badge kind="plain">found in wild up to Lv {p.max_wild_level}</Badge>
                    : null;
              }
              return (
                <>
                  {bands.surface && (
                    <Badge kind="plain">
                      found in wild {bands.surface.lo === bands.surface.hi
                        ? `Lv ${bands.surface.lo}`
                        : `Lv ${bands.surface.lo} to ${bands.surface.hi}`}
                    </Badge>
                  )}
                  {bands.dungeon && (
                    <Badge kind="plain">
                      in dungeons {bands.dungeon.lo === bands.dungeon.hi
                        ? `Lv ${bands.dungeon.lo}`
                        : `Lv ${bands.dungeon.lo} to ${bands.dungeon.hi}`}
                    </Badge>
                  )}
                </>
              );
            })()}
          </View>
        </Card>

        {!(p.drops?.length > 0 || (p.ranch_produce?.length ?? 0) > 0) && (
          <Card style={{ marginTop: 10 }}>
            <Text style={s.h3}>Drops</Text>
            <NothingListed
              what="drops or ranch produce"
              name={name}
              others={countWithout('drops', (q) => (q.drops?.length ?? 0) > 0
                || (q.ranch_produce?.length ?? 0) > 0)}
            />
          </Card>
        )}

        {(p.drops?.length > 0 || (p.ranch_produce?.length ?? 0) > 0) && (
          <Card style={{ marginTop: 10 }}>
            <Text style={s.h3}>Drops</Text>
            <View style={[s.wrap, { marginTop: 8 }]}>
              {/* each drop opens its item card in the Items fane — the
                  drop names resolve against the item table exactly (115/115,
                  pinned), so a dead tap here means broken data, not design */}
              {p.drops.map((d) => {
                const target = itemIdByName(d);
                if (!target) return <Badge key={d} kind="plain">{d}</Badge>;
                return (
                  <Pressable key={d}
                    onPress={() => {
                      onClose();
                      navigateTo({
                        domain: 'items', tab: 'allitems',
                        payload: { item: target, fromCard: name },
                      });
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${d}. Open its item card`}
                    style={({ pressed }) => ({
                      backgroundColor: pressed ? T.surface2 : T.surface,
                      borderWidth: 1, borderColor: T.accentSoft,
                      borderRadius: 9, paddingHorizontal: 8, paddingVertical: 4,
                    })}>
                    <Text style={{ color: T.accentInk, fontSize: 12, fontWeight: '700' }}>
                      {d}
                    </Text>
                  </Pressable>
                );
              })}
              {(p.ranch_produce ?? []).map((r) => {
                // ranch produce is an item too — it sat as a dead badge
                // while the drops beside it were links (IL31)
                const target = itemIdByName(r);
                if (!target) return <Badge key={`r-${r}`} kind="ok">Ranch: {r}</Badge>;
                return (
                  <Pressable key={`r-${r}`}
                    onPress={() => {
                      onClose();
                      navigateTo({
                        domain: 'items', tab: 'allitems',
                        payload: { item: target },
                      });
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Ranch produce ${r}. Open its item card`}
                    style={({ pressed }) => ({
                      backgroundColor: pressed ? T.surface2 : T.surface,
                      borderWidth: 1, borderColor: T.okSoft,
                      borderRadius: 9, paddingHorizontal: 8, paddingVertical: 4,
                    })}>
                    <Text style={{ color: T.ok, fontSize: 12, fontWeight: '700' }}>
                      Ranch: {r}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Card>
        )}

        {Object.keys(p.work ?? {}).length === 0 && (
          <Card style={{ marginTop: 10 }}>
            <Text style={s.h3}>Work suitability</Text>
            <NothingListed
              what="work suitabilities"
              name={name}
              others={countWithout('work', (q) => Object.keys(q.work ?? {}).length > 0)}
            />
          </Card>
        )}

        {Object.keys(p.work ?? {}).length > 0 && (
          <Card style={{ marginTop: 10 }}>
            <View style={[s.row, { gap: 8 }]}>
              <Text style={[s.h3, { flex: 1 }]}>Work suitability</Text>
              {stars === 4 && (
                <Text style={{ color: T.goldInk, fontSize: 11, fontWeight: '800' }}>
                  4★ — every job +1
                </Text>
              )}
            </View>
            <View style={[s.wrap, { marginTop: 8 }]}>
              {Object.entries(p.work).sort((x, y) => y[1] - x[1]).map(([job, lvl]) => {
                // 4★ raises EVERY existing suitability by 1 (wiki-verified).
                // At 1-3★ the game raises ONE job and does not say which, so
                // we refuse to guess a number here — see the note below.
                const boosted = stars === 4 ? lvl + 1 : lvl;
                return (
                  <View key={job} style={[s.chip, {
                    backgroundColor: boosted > lvl ? T.goldSoft : T.surface2,
                    borderWidth: boosted > lvl ? 1 : 0,
                    borderColor: boosted > lvl ? T.gold : 'transparent',
                    flexDirection: 'row',
                    alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3,
                  }]}>
                    {WORK_ICONS[job] && (
                      <Image source={WORK_ICONS[job]} style={{ width: 20, height: 20 }} />
                    )}
                    <Text style={[s.chipText, { color: T.ink }]}>
                      {workLabel(job)}{' '}
                      {boosted > lvl ? (
                        <Text style={{ color: T.goldInk }}>
                          <Text style={{
                            color: T.faint, textDecorationLine: 'line-through',
                          }}>{lvl}</Text> {boosted}
                        </Text>
                      ) : (
                        <Text style={{ color: T.accentInk }}>{lvl}</Text>
                      )}
                    </Text>
                  </View>
                );
              })}
            </View>
            {stars > 0 && stars < 4 && (
              <Text style={[s.body, { fontSize: 11.5, marginTop: 8, color: T.goldInk }]}>
                At {stars}★ the game raises one of its work suitabilities by +1 — it
                never says which one, so we don't put a made-up number on it. At 4★
                every job above goes up.
              </Text>
            )}
          </Card>
        )}

        {(PALCALC_FACTS[name]?.passives?.length ?? 0) > 0 && (
          <Card style={{ marginTop: 10 }}>
            <Text style={s.h3}>Born with</Text>
            <Text style={[s.body, { marginTop: 4 }]}>
              Every {name} always carries{' '}
              {PALCALC_FACTS[name]!.passives!.join(' + ')} — datamined, and
              breedable into your lines.
            </Text>
            <View style={[s.wrap, { marginTop: 8 }]}>
              {PALCALC_FACTS[name]!.passives!.map((ps) => (
                <Badge key={ps} kind="gold">{ps}</Badge>
              ))}
            </View>
          </Card>
        )}

        {!p.partner_skill && (
          <Card style={{ marginTop: 10 }}>
            <Text style={s.h3}>Partner skill</Text>
            <NothingListed
              what="partner skill"
              name={name}
              others={countWithout('partner', (q) => !!q.partner_skill)}
            />
          </Card>
        )}

        {p.partner_skill && (
          <Card style={{ marginTop: 10 }}>
            <View style={[s.row, { gap: 8 }]}>
              <Text style={[s.h3, { flex: 1 }]}>Partner skill — {p.partner_skill}</Text>
              <View style={{
                borderWidth: 1, borderColor: stars > 0 ? T.gold : T.line,
                backgroundColor: stars > 0 ? T.goldSoft : T.surface2,
                borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2,
              }}>
                <Text style={{
                  color: stars > 0 ? T.goldInk : T.muted, fontSize: 10.5, fontWeight: '800',
                }}>LEVEL {stars + 1} OF 5</Text>
              </View>
            </View>
            <Text style={[s.body, { marginTop: 4 }]}>{cleanEffect(p.partner_effect)}</Text>
          </Card>
        )}

        <Card style={{ marginTop: 10, gap: 8 }}>
          <Text style={s.h3}>How to breed it</Text>
          {/* This used to be a TERNARY: flagged self-breed-only meant the
              fixed-recipe list below never rendered at all. Mossanda Lux and
              Relaxaurus Lux are flagged AND have a real recipe (Grizzbolt +
              Mossanda, Relaxaurus + Sparkit), so their card hid the very
              thing the player came for. The self-breed line is an ADDITION
              now, not a replacement (self-found 2026-08-16, same root as the
              Calculator fix). */}
          {selfOnly.has(name) && (
            <View style={[s.wrap]}>
              <Badge kind="bad">self-breed-only</Badge>
              <Text style={s.body}>{name} + {name} = {name}</Text>
            </View>
          )}
          {(!selfOnly.has(name) || asChild.length > 0
            || gendered.some((g) => g.child === name)) && (
            <>
              {asChild.map((c) => (
                <View key={c.parents.join()} style={[s.row, { gap: 6, flexWrap: 'wrap' }]}>
                  <Badge kind="unique">fixed recipe</Badge>
                  <PalIcon name={c.parents[0]} size={24} />
                  <Text style={s.body}>{c.parents[0]} +</Text>
                  <PalIcon name={c.parents[1]} size={24} />
                  <Text style={s.body}>{c.parents[1]} = {name}</Text>
                </View>
              ))}
              {gendered.filter((g) => g.child === name).map((g) => (
                <View key={g.mother} style={[s.row, { gap: 6, flexWrap: 'wrap' }]}>
                  <Badge kind="warn">genders as shown</Badge>
                  <PalIcon name={g.mother} size={24} gender="f" />
                  <Text style={s.body}>{g.mother} +</Text>
                  <PalIcon name={g.father} size={24} gender="m" />
                  <Text style={s.body}>{g.father} = {name}</Text>
                </View>
              ))}
              {inPool && !selfOnly.has(name) && (() => {
                // show real example pairs INLINE — competitors do, and a
                // cross-tab homework assignment is not a feature
                // The scan runs to the END now. It used to stop at 40 hits,
                // which cost two things: the card could only say "many" when
                // it could have said 1,270, and a pair the player ALREADY OWNS
                // sitting past the 40th was never found — the one example
                // worth showing, missed. Measured: a full scan is ~11 ms per
                // pal in node and moved card-open time by nothing you can see.
                const pairs: [string, string][] = [];
                const names = Object.keys(pals);
                let total = 0;
                for (let i = 0; i < names.length; i++) {
                  for (let j = i; j < names.length; j++) {
                    const kids = engine.childrenOf(names[i], names[j]);
                    if (kids.length === 1 && kids[0].species === name
                      && kids[0].kind === 'generic') {
                      total++;
                      const bothOwned = ownedAny(names[i]) && ownedAny(names[j]);
                      // keep the display shortlist small; owned pairs first
                      if (bothOwned) pairs.unshift([names[i], names[j]]);
                      else if (pairs.length < 8) pairs.push([names[i], names[j]]);
                    }
                  }
                }
                const show = pairs.slice(0, 3);
                const some = show.length === 3 ? 'Three of them'
                  : show.length === 2 ? 'Two of them' : 'One of them';
                return (
                  <View style={{ gap: 6 }}>
                    <Text style={s.body}>
                      No fixed recipe — {total.toLocaleString()} different pairs
                      make {name}. {some}:
                    </Text>
                    {show.map(([pa, pb]) => (
                      <View key={`${pa}+${pb}`}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <PalIcon name={pa} size={26} />
                        <Text style={[s.body, { flexShrink: 1 }]} numberOfLines={1}>{pa}</Text>
                        <Text style={{ color: T.faint, fontWeight: '800' }}>+</Text>
                        <PalIcon name={pb} size={26} />
                        <Text style={[s.body, { flexShrink: 1 }]} numberOfLines={1}>{pb}</Text>
                        {ownedAny(pa) && ownedAny(pb) && (
                          <Badge kind="ok">you own both</Badge>
                        )}
                      </View>
                    ))}
                  </View>
                );
              })()}
            </>
          )}
          {/* the card DOES something now — it used to end by telling the
              player to go navigate somewhere themselves (CEO 2026-08-15) */}
          <View style={[s.wrap, { marginTop: 2 }]}>
            <Btn small primary label="Show me every pair"
              onPress={() => {
                onClose();
                navigateTo({
                  domain: 'breeding', tab: 'calc',
                  payload: { pal: name, mode: 'reverse', fromCard: name },
                });
              }} />
            {!ownedAny(name) && (
              <Btn small disabled={planned}
                label={planned ? 'Already a goal ✓' : 'Plan how to get it'}
                onPress={() => {
                  void Haptics.selectionAsync();
                  onClose();
                  navigateTo({
                    domain: 'breeding', tab: 'plan',
                    payload: { fromCard: name },
                  });
                  // the replan is planner-grade work — let the navigation
                  // paint first instead of freezing the tap (the 4437 ms
                  // helperAdvice lesson applies to THIS thread too)
                  setTimeout(() => {
                    addPlanTarget(name);
                    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  }, 60);
                }} />
            )}
          </View>
        </Card>

        {(asParent.length > 0 || gendered.some((g) => g.child !== name)) && (
          <Card style={{ marginTop: 10, gap: 8 }}>
            <Text style={s.h3}>Special recipes as a parent</Text>
            {asParent.map((c) => {
              const other = c.parents[0] === name ? c.parents[1] : c.parents[0];
              return (
                <View key={c.child} style={[s.row, { gap: 6, flexWrap: 'wrap' }]}>
                  <Text style={s.body}>{name} +</Text>
                  <PalIcon name={other} size={24} />
                  <Text style={s.body}>{other} =</Text>
                  <PalIcon name={c.child} size={24} />
                  <Text style={s.body}>{c.child}</Text>
                </View>
              );
            })}
            {gendered.filter((g) => g.child !== name).map((g) => (
              <View key={g.child} style={[s.row, { gap: 6, flexWrap: 'wrap' }]}>
                <Badge kind="warn">genders as shown</Badge>
                <PalIcon name={g.mother} size={24} gender="f" />
                <Text style={s.body}>{g.mother} +</Text>
                <PalIcon name={g.father} size={24} gender="m" />
                <Text style={s.body}>{g.father} = {g.child}</Text>
              </View>
            ))}
          </Card>
        )}

        <Card style={{ marginTop: 10, gap: 8 }}>
          <Text style={s.h3}>Where to find it</Text>
          <PalMap name={name} />
          {/* Only for the pals the MAP cannot speak for. 207 species have a
              named boss, but just 91 carry coordinates the map can pin and
              summarise as "Fixed boss (Lv N) — Place" above; the other 116
              are dungeon end-bosses that showed nothing at all. Gating on
              ALPHA_SPOTS keeps the mapped ones from saying it twice. */}
          {!ALPHA_SPOTS[name] && (p.alpha_locations ?? []).length > 0 && (
            <View style={{ gap: 5 }}>
              <Text style={[s.body, { fontWeight: '800', color: T.ink }]}>Alpha boss</Text>
              {(p.alpha_locations ?? []).map((line) => (
                <Text key={line} style={[s.body, { fontSize: 12.5 }]}>· {line}</Text>
              ))}
            </View>
          )}
          {otherWays(p).length > 0 && (
            <View style={{ gap: 5 }}>
              <Text style={[s.body, { fontWeight: '800', color: T.ink }]}>
                Other ways to get one
              </Text>
              {otherWays(p).map((line) => (
                <Text key={line} style={[s.body, { fontSize: 12.5 }]}>· {line}</Text>
              ))}
            </View>
          )}
          <View style={[s.wrap]}>
            {/* the map + its Spawns line carry the regions now — chips here
                only for what the map can't say */}
            {/* It used to say "no regular wild spawn — breed it". That advice
                is impossible for 11 of the 13 pals it appeared on: ten can
                only be bred from their OWN kind, so you need one already, and
                Bellanoir has no recipe at all. The real routes were sitting
                unused in obtain_notes and are listed above now. */}
            {!p.wild && !ALPHA_SPOTS[name] && (
              <Badge kind="plain">no regular wild spawn</Badge>
            )}
            {/* the egg a pal comes from is an ITEM we hold a full card
                for — it was a dead badge while drops right above were
                tappable (IL31 drift audit) */}
            {p.egg_types.map((e) => {
              const eggId = itemIdByName(e);
              if (!eggId) return <Badge key={e} kind="plain">Egg: {e}</Badge>;
              return (
                <Pressable key={e}
                  onPress={() => {
                    onClose();
                    navigateTo({
                      domain: 'items', tab: 'allitems',
                      payload: { item: eggId },
                    });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${e}. Open the egg's card`}
                  style={({ pressed }) => ({
                    backgroundColor: pressed ? T.surface2 : T.surface,
                    borderWidth: 1, borderColor: T.accentSoft,
                    borderRadius: 9, paddingHorizontal: 8, paddingVertical: 4,
                  })}>
                  <Text style={{ color: T.accentInk, fontSize: 12, fontWeight: '700' }}>
                    Egg: {e}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Card>
      </ScrollView>
    </Modal>
  );
}

