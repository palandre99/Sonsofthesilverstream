/** Suggested goals — the preset buttons grown into a real surface (CEO
 * 2026-08-15: "recommended pals should be a proper pop-up card… a suggestion
 * for all the best kindling, fighting, woodcutting etc" and "tap and open
 * the full card so it's bigger, cleaner and smoother").
 *
 * ONE card system: every category renders through SectionCard (collapsed
 * top-6 preview) and CategoryBrowser (full screen: search, big readable
 * rows, add/remove on every pal, RECOMMENDED tags where a real quality
 * gradient exists). Zero horizontal scrolling anywhere.
 *
 * Everything is computed from game data, never hand-picked; community
 * numbers are labelled. The attainability + scoring brain lives in
 * ../logic/recommend.ts — byte-identical on web and mobile.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList, Image, Modal, Pressable, ScrollView, Text, TextInput, View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { T } from '../theme';
import { cleanEffect } from '../data/palText';
import { Btn, Card, PalIcon, SearchInput, s } from './kit';
import { Icon } from './Icon';
import { PalDetail } from './PalDetail';
import { WORK_ICONS } from '../data/workIcons';
import {
  breeding, engine, getActiveProfile, getBox, getPlayerLevel, pals, ownedAny,
  setProfileLevel, workLabel,
} from '../store';
import {
  applyFilters, NO_FILTERS, sortedPals, WORK_KEYS,
  type Filters, type SortKey,
} from './palFilters';
import { FilterSheet } from './FilterSheet';
import { HELPERS } from '../engine/helpers';
import {
  attainLabel, attainScore, boxKeyOf, cachedDerivations, derivationsReady,
  getAttainContext, recommendedSet, saddleGap, scoreOf, type Attain,
} from '../logic/recommend';
import { onNavIntent } from '../nav/intent';
import { PALCALC_FACTS } from '../data/palcalcFacts.g';
import { BEST_OVERALL, COMBAT_COMMUNITY, MOUNT_CALLOUTS } from '../data/meta';
import { MOUNTS, UTILITY_ROLES } from '../data/utilityRoles.g';
import { SADDLE_LEVELS } from '../data/saddleLevels.g';

/* ---------------- section data ---------------- */

/** one pal inside a category, with everything its row can show */
interface GoalItem {
  name: string;
  /** a real level (job suitability) — shown as "Lv N" only when true level */
  lvl?: number;
  /** per-job breakdown — rendered as work ICONS with numbers, never letter
   * codes (CEO: "m7 t7 is terrible design") */
  jobs?: [string, number][];
  /** verbatim game partner-skill text */
  effect?: string;
  /** community why-line (labelled) */
  why?: string;
  /** community speed/quality callout (labelled) */
  note?: string;
  /** community favourite marker */
  star?: boolean;
  /** 0..1 within-section quality, for the scoring model */
  value?: number;
}

interface SectionDef {
  id: string;
  title: string;
  /** MaterialCommunityIcons name */
  icon?: string;
  /** WORK_ICONS key for job sections */
  workIcon?: string;
  gold?: boolean;
  blurb: string;
  items: GoalItem[];
  /** true = the section has a real quality gradient → scored ordering and
   * RECOMMENDED tags; false = membership list → actionable-first ordering */
  scored?: boolean;
}

/** every pal that can do a job, best first — full depth for the browser */
function bestAt(job: string): GoalItem[] {
  const list = Object.keys(pals)
    .map((name) => ({ name, lvl: (pals[name].work ?? {})[job] ?? 0 }))
    .filter((x) => x.lvl > 0)
    .sort((a, b) => b.lvl - a.lvl
      || ((pals[b.name].hp ?? 0) + (pals[b.name].atk ?? 0) + (pals[b.name].def ?? 0))
      - ((pals[a.name].hp ?? 0) + (pals[a.name].atk ?? 0) + (pals[a.name].def ?? 0)));
  const top = list[0]?.lvl ?? 1;
  return list.map((x) => ({
    name: x.name, lvl: x.lvl, jobs: [[job, x.lvl]], value: x.lvl / top,
  }));
}

/** Composite work crews — the CEO's "best farmer" insight (2026-08-15):
 * a pal with high Planting AND Gathering AND Transporting runs the whole
 * farm loop alone. Score = sum of the crew's work levels, from the dump;
 * the formula is stated plainly in each blurb. */
const CREWS: { id: string; title: string; jobs: string[]; anchor: string; blurb: string }[] = [
  {
    id: 'crew-farm', title: 'Farm crew', anchor: 'Planting',
    jobs: ['Planting', 'Gathering', 'Transporting'],
    blurb: 'Plants, gathers AND hauls — one pal running the whole farm loop. Ranked by Planting + Gathering + Transporting.',
  },
  {
    id: 'crew-log', title: 'Logging crew', anchor: 'Lumbering',
    jobs: ['Lumbering', 'Transporting'],
    blurb: 'Chops and hauls its own wood. Ranked by Lumbering + Transporting.',
  },
  {
    id: 'crew-mine', title: 'Mining crew', anchor: 'Mining',
    jobs: ['Mining', 'Transporting'],
    blurb: 'Digs and hauls its own ore. Ranked by Mining + Transporting.',
  },
  {
    id: 'crew-all', title: 'Base all-rounders', anchor: '',
    jobs: [],
    blurb: 'The widest useful pals — ranked by TOTAL work levels across every job they have.',
  },
];

function crewItems(crew: { jobs: string[]; anchor: string }): GoalItem[] {
  const rows = Object.keys(pals)
    .map((name) => {
      const w = pals[name].work ?? {};
      if (crew.anchor && !(w[crew.anchor] > 0)) return null;
      const jobs = crew.jobs.length ? crew.jobs : Object.keys(w);
      const score = jobs.reduce((sum, j) => sum + (w[j] ?? 0), 0);
      const parts = jobs.filter((j) => w[j] > 0)
        .map((j) => [j, w[j]] as [string, number]);
      return { name, score, parts };
    })
    .filter((x): x is { name: string; score: number; parts: [string, number][] } =>
      !!x && x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 40);
  const top = rows[0]?.score ?? 1;
  return rows.map((x) => ({ name: x.name, jobs: x.parts, value: x.score / top }));
}

/** highest battle stats, straight from the dump — attack weighted double
 * because that's what kills bosses; the blurb says exactly this */
function fighterItems(): GoalItem[] {
  const rows = Object.keys(pals)
    .map((name) => ({
      name,
      score: (pals[name].atk ?? 0) * 2 + (pals[name].hp ?? 0) + (pals[name].def ?? 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
  const top = rows[0]?.score ?? 1;
  return rows.map((x) => ({
    name: x.name, star: COMBAT_COMMUNITY.includes(x.name), value: x.score / top,
  }));
}


/** pals whose partner-skill text matches — the honest way to build effect
 * squads without hand-picking (text shown verbatim on the rows) */
function effectItems(re: RegExp): GoalItem[] {
  return Object.keys(pals)
    .filter((n) => re.test(pals[n].partner_effect ?? ''))
    .map((n) => ({ name: n, effect: cleanEffect(pals[n].partner_effect) || undefined }));
}
/** The base-wide aura pals, DERIVED from the game's own partner-effect text
 *  rather than hand-listed.
 *
 *  It used to be twelve names typed into this file, under a blurb promising
 *  "All twelve, verified." I checked, and the twelve were exactly right — but
 *  right by luck, not by construction: a patch adding a thirteenth aura pal
 *  would have left the app confidently stating a number that had become
 *  false, with nothing to catch it. This file already calls deriving from the
 *  effect text "the honest way to build effect squads without hand-picking";
 *  the aura squad is built that way now too, and the count counts itself.
 *  (self-found on a code read, 2026-08-16) */
const AURA_RE = /Work Suitability Level for all other/i;

const LOOT_RE = /defeated|dropped by enemies/i;
const RANCH_RE = /assigned to Ranch/i;

function helperItems(roles: string[]): GoalItem[] {
  return HELPERS.filter((h) => roles.includes(h.role))
    .map((h) => ({ name: h.name, effect: cleanEffect(pals[h.name]?.partner_effect) || undefined }));
}

function utilityItems(role: keyof typeof UTILITY_ROLES): GoalItem[] {
  return UTILITY_ROLES[role].pals.map((p) => ({ name: p.name, effect: p.effect }));
}

function mountItems(names: string[]): GoalItem[] {
  // Mounts had NO quality gradient, so they were ordered by nearness alone —
  // and at a full save nearly everything is one step away. The CEO's level-80
  // list showed six flying mounts all reading "BREED · 1 STEP", led by an
  // early-game flyer, because nothing broke the tie (2026-08-17: "Flying
  // mount first recommendation is a nitewing ... what is this? Engine is not
  // actually thinking?").
  //
  // The gradient is the game's own stat block — no invented numbers, and the
  // blurbs say so. Normalised inside each section so it sits on the same 0..1
  // scale every other scored section uses.
  const raw = names.map((n) => {
    const p = pals[n];
    return { n, q: (p?.hp ?? 0) + (p?.atk ?? 0) + (p?.def ?? 0) };
  });
  const top = Math.max(1, ...raw.map((x) => x.q));
  return raw.map((x) => ({
    name: x.n,
    note: MOUNT_CALLOUTS[x.n],
    effect: cleanEffect(pals[x.n]?.partner_effect) || undefined,
    value: x.q / top,
  }));
}

/** all the categories, one shape — the whole sheet is data-driven */
function buildSections(): SectionDef[] {
  return [
    {
      id: 'cake', title: 'Cake supply', icon: 'cake-variant-outline',
      blurb: 'The four ranch pals that feed every cake — eggs, milk, honey, berries. The breeding farm stops without them.',
      items: helperItems(['ranch']),
    },
    {
      id: 'speed', title: 'Breeding speed & luck', icon: 'clock-fast',
      blurb: 'Faster egg production, faster hatching, extra eggs — all verified partner skills.',
      items: helperItems(['speed', 'luck']),
    },
    {
      id: 'aura', title: 'Aura squad', icon: 'creation',
      blurb: `Each raises one work suitability for every other pal in its base (auras don't stack — spread them across bases). All ${effectItems(AURA_RE).length}, straight from the game's own effect text.`,
      items: effectItems(AURA_RE),
    },
    {
      id: 'bestof', title: 'The best pals in the game', icon: 'crown-outline', gold: true,
      blurb: 'What players rate highest across everything — community consensus (game8 + pindrop, Aug 2026). Ordered by what YOU can act on now.',
      items: BEST_OVERALL.map((m) => ({
        name: m.name, why: m.why, star: COMBAT_COMMUNITY.includes(m.name),
      })),
    },
    {
      id: 'fight', title: 'Fighting', icon: 'sword-cross', scored: true,
      blurb: 'Highest battle stats in the game data (attack counted double). A gold spark marks community-favourite fighters.',
      items: fighterItems(),
    },
    {
      id: 'm-fly', title: 'Flying mounts', icon: 'bird', scored: true,
      blurb: 'Every flyable pal in the game data, ranked by how strong it is (health + attack + defence) against how close it is to your pals. Speed callouts are community-measured; saddle levels from paldb.',
      items: mountItems(MOUNTS.flying),
    },
    {
      id: 'm-ground', title: 'Ground mounts', icon: 'horse-variant', scored: true,
      blurb: 'Every ground mount, ranked by how strong it is (health + attack + defence) against how close it is to your pals — the called-out ones are the community\'s elite.',
      items: mountItems(MOUNTS.ground),
    },
    {
      id: 'm-glide', title: 'Gliders & swimmers', icon: 'weather-windy',
      blurb: 'Glider partner skills from the game data, plus the swimmers.',
      items: [
        ...utilityItems('glider'),
        ...mountItems(MOUNTS.swim),
      ],
    },
    {
      id: 'u-catch', title: 'Catching helpers', icon: 'circle-double',
      blurb: 'Better catches from the game\'s own partner skills — capture-rate boosts and slower capture-gauge drain.',
      items: utilityItems('capture'),
    },
    {
      id: 'u-weight', title: 'Weight & carrying helpers', icon: 'weight',
      blurb: 'Ore, stone, wood and food weight cuts plus carry capacity — the game\'s own partner skills.',
      items: utilityItems('weight'),
    },
    {
      id: 'u-eff', title: 'Work efficiency boosters', icon: 'lightning-bolt-outline',
      blurb: 'Mining, logging and crafting multipliers from partner skills (Digtoise: ore mining +800–2000%).',
      items: utilityItems('efficiency'),
    },
    {
      id: 'u-born', title: 'Born with a passive', icon: 'dna',
      blurb: '46 species are ALWAYS born carrying a passive (datamined) — catch or breed one and the passive is yours to breed onward.',
      items: Object.keys(pals)
        .filter((n) => PALCALC_FACTS[n]?.passives?.length)
        .map((n) => ({ name: n, effect: `Born with: ${PALCALC_FACTS[n]!.passives!.join(' + ')}` })),
    },
    {
      id: 'u-loot', title: 'Loot boosters', icon: 'treasure-chest',
      blurb: 'More drops from enemies you defeat — element-specific hunting partners, plus Dumud Gild\'s gold bonus.',
      items: effectItems(LOOT_RE),
    },
    {
      id: 'u-ranch', title: 'Ranch producers', icon: 'barn',
      blurb: 'Every pal that makes something at the Ranch — eggs, milk, berries, wool, mushrooms, ice organs and more.',
      items: effectItems(RANCH_RE),
    },
    ...CREWS.map((crew) => ({
      id: crew.id, title: crew.title, icon: 'account-group-outline',
      blurb: crew.blurb, items: crewItems(crew), scored: true,
    })),
    ...WORK_KEYS.map((w) => ({
      id: `job-${w}`, title: workLabel(w), workIcon: w,
      blurb: `Every pal that can do ${workLabel(w)}, the best first — levels straight from the game data.`,
      items: bestAt(w), scored: true,
    })),
  ];
}

/* ---------------- shared row/chip context ---------------- */

/** everything the module-level pieces need — passed down so components keep
 * a stable identity (state like the browser's search must survive parent
 * re-renders, e.g. when a pal is added) */
interface BrowseCtx {
  attain: (n: string) => Attain;
  stage: number;
  targets: string[];
  onAdd: (names: string[]) => void;
  onRemove: (names: string[]) => void;
  onView: (n: string) => void;
}

function orderItems(sec: SectionDef, attain: (n: string) => Attain): GoalItem[] {
  const items = [...sec.items];
  if (sec.scored) {
    // the scoring model: quality vs closeness — a level-6 worker one breed
    // away outranks a level-7 worker 83 breeds away
    return items.sort((a, b) =>
      scoreOf(b.value ?? 1, attain(b.name)) - scoreOf(a.value ?? 1, attain(a.name)));
  }
  return items.sort((a, b) => attainScore(attain(a.name)) - attainScore(attain(b.name)));
}

function statusColor(a: Attain, added: boolean): string {
  return added || a.kind === 'have' ? T.ok
    : a.kind === 'breed' ? T.accentInk
      : a.kind === 'catch' ? T.warn
        : a.unlock ? T.goldInk : T.faint;
}

function SectionHeadIcon({ sec, size }: { sec: SectionDef; size: number }) {
  if (sec.workIcon && WORK_ICONS[sec.workIcon]) {
    return <Image source={WORK_ICONS[sec.workIcon]} style={{ width: size + 2, height: size + 2 }} />;
  }
  if (sec.icon) {
    return <Icon name={sec.icon} size={size} color={sec.gold ? T.goldInk : T.accentInk} />;
  }
  return null;
}

/* ---------------- the small chip (collapsed cards) ---------------- */

function PalChip({ name, lvl, star, bctx }: {
  name: string; lvl?: number; star?: boolean; bctx: BrowseCtx;
}) {
  const added = bctx.targets.includes(name);
  const owned = ownedAny(name);
  const a = bctx.attain(name);
  const status = added ? 'IN PLAN' : attainLabel(a).short;
  const addable = !added && !owned;
  return (
    <Pressable onPress={() => bctx.onView(name)}
      style={({ pressed }) => [{
        alignItems: 'center', gap: 3, width: 84, paddingVertical: 6,
        borderRadius: 12, borderWidth: 1,
        borderColor: pressed ? T.accent : added ? T.ok : owned ? T.okSoft : T.line,
        backgroundColor: added ? T.okSoft : T.surface,
        opacity: owned && !added ? 0.55 : 1,
      }]}
    >
      <View>
        <PalIcon name={name} size={44} />
        {star && (
          <View style={{ position: 'absolute', right: -3, top: -3 }}>
            <Icon name="star-four-points" size={12} color={T.gold} />
          </View>
        )}
        {addable && (
          /* 19 px + 6 of slop was 31 — under the 44 pt minimum, on the badge
             you tap to build a plan. The tiles are ~78 px wide and this sits
             on a corner, so 12 cannot collide with a neighbour's badge. */
          <Pressable hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={`Add ${name} to the plan`}
            onPress={() => {
              void Haptics.selectionAsync();
              bctx.onAdd([name]);
            }}
            style={{ position: 'absolute', left: -7, top: -5 }}>
            <View style={{
              width: 19, height: 19, borderRadius: 10, backgroundColor: T.accent,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon name="plus" size={14} color="#08191B" />
            </View>
          </Pressable>
        )}
        {added && (
          <Pressable hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${name} from the plan`}
            onPress={() => bctx.onRemove([name])}
            style={{ position: 'absolute', left: -7, top: -5 }}>
            <View style={{
              width: 19, height: 19, borderRadius: 10, backgroundColor: T.surface2,
              borderWidth: 1, borderColor: T.line,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon name="minus" size={14} color={T.ink} />
            </View>
          </Pressable>
        )}
      </View>
      <Text numberOfLines={1} style={{
        color: T.ink, fontSize: 10, fontWeight: '700', maxWidth: 78,
      }}>{name}</Text>
      {lvl != null && (
        <Text style={{ color: T.accentInk, fontSize: 10, fontWeight: '800' }}>Lv {lvl}</Text>
      )}
      <Text numberOfLines={2} style={{
        color: statusColor(a, added), fontSize: 8.5, fontWeight: '800',
        maxWidth: 78, textAlign: 'center',
      }}>{status}</Text>
    </Pressable>
  );
}

/* ---------------- one collapsed card per category ---------------- */

function SectionCard({ sec, bctx, onBrowse }: {
  sec: SectionDef; bctx: BrowseCtx; onBrowse: (id: string) => void;
}) {
  const shown = orderItems(sec, bctx.attain).slice(0, 6);
  const missing = shown
    .filter((x) => !bctx.targets.includes(x.name) && !ownedAny(x.name))
    .map((x) => x.name);
  const inPlanHere = shown.filter((x) => bctx.targets.includes(x.name)).map((x) => x.name);
  return (
    <View style={{
      backgroundColor: T.surface, borderWidth: 1, borderRadius: 14,
      borderColor: sec.gold ? T.goldSoft : T.line, padding: 12, gap: 8,
    }}>
      {/* the whole section header opens the browser, and it drew 21 px with
          no slop at all */}
      <Pressable hitSlop={10} style={[s.row, { gap: 8, paddingVertical: 4 }]}
        accessibilityRole="button"
        accessibilityLabel={`Browse all ${sec.title}`}
        onPress={() => {
          void Haptics.selectionAsync();
          onBrowse(sec.id);
        }}>
        <SectionHeadIcon sec={sec} size={18} />
        <Text style={[s.h3, { flex: 1 }]}>{sec.title}</Text>
        <Text style={{ color: T.accentInk, fontSize: 11.5, fontWeight: '800' }}>
          All {sec.items.length} ›
        </Text>
      </Pressable>
      <Text style={[s.body, { fontSize: 11.5 }]}>{sec.blurb}</Text>
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
        {shown.map((x) => (
          <PalChip key={x.name} name={x.name} lvl={x.lvl} star={x.star} bctx={bctx} />
        ))}
      </View>
      {missing.length > 1 ? (
        <Btn small label={`Add these ${missing.length}`} onPress={() => bctx.onAdd(missing)} />
      ) : inPlanHere.length > 1 ? (
        <Btn small label={`Remove these ${inPlanHere.length}`}
          onPress={() => bctx.onRemove(inPlanHere)} />
      ) : null}
    </View>
  );
}

/* ---------------- the full-screen category browser ---------------- */

function BrowserRow({ item, recommended, bctx }: {
  item: GoalItem; recommended: boolean; bctx: BrowseCtx;
}) {
  const added = bctx.targets.includes(item.name);
  const owned = ownedAny(item.name);
  const a = bctx.attain(item.name);
  const saddle = SADDLE_LEVELS[item.name] != null
    ? saddleGap(item.name, bctx.stage) ?? `saddle at Lv ${SADDLE_LEVELS[item.name]}`
    : null;
  return (
    <Pressable onPress={() => bctx.onView(item.name)}
      style={({ pressed }) => [{
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: pressed ? T.accentSoft : T.surface,
        borderWidth: 1, borderColor: added ? T.ok : T.line,
        borderRadius: 12, padding: 10, marginBottom: 6,
        opacity: owned && !added ? 0.6 : 1,
      }]}
    >
      <PalIcon name={item.name} size={44} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ color: T.ink, fontWeight: '800', fontSize: 14, flexShrink: 1 }}
            numberOfLines={1}>
            {item.name}
          </Text>
          {item.star && <Icon name="star-four-points" size={12} color={T.gold} />}
          {recommended && (
            <View style={{
              backgroundColor: T.goldSoft, borderRadius: 7,
              paddingHorizontal: 6, paddingVertical: 1,
            }}>
              <Text style={{ color: T.goldInk, fontSize: 8.5, fontWeight: '800' }}>
                RECOMMENDED
              </Text>
            </View>
          )}
        </View>
        {item.jobs && item.jobs.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            {item.jobs.map(([j, lv]) => (
              <View key={j} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                {WORK_ICONS[j] && (
                  <Image source={WORK_ICONS[j]} style={{ width: 15, height: 15 }} />
                )}
                <Text style={{ color: T.muted, fontSize: 11, fontWeight: '800' }}>{lv}</Text>
              </View>
            ))}
            {item.jobs.length > 1 && (
              <Text style={{ color: T.faint, fontSize: 10.5 }}>
                · total {item.jobs.reduce((sum, [, lv]) => sum + lv, 0)}
              </Text>
            )}
          </View>
        )}
        {item.why ? (
          <Text style={{ color: T.muted, fontSize: 11 }} numberOfLines={2}>{item.why}</Text>
        ) : item.effect ? (
          <Text style={{ color: T.muted, fontSize: 11 }} numberOfLines={2}>{item.effect}</Text>
        ) : null}
        <Text style={{ color: statusColor(a, added), fontSize: 11, fontWeight: '700' }}
          numberOfLines={2}>
          {added ? 'In your plan — tap the circle to remove it.' : attainLabel(a).long}
          {item.note ? `  ·  ${item.note}` : saddle ? `  ·  ${saddle}` : ''}
        </Text>
      </View>
      {a.kind !== 'have' ? (
        <Pressable hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={added
            ? `Remove ${item.name} from the plan` : `Add ${item.name} to the plan`}
          onPress={() => {
            void Haptics.selectionAsync();
            if (added) bctx.onRemove([item.name]); else bctx.onAdd([item.name]);
          }}>
          <View style={{
            width: 30, height: 30, borderRadius: 15,
            backgroundColor: added ? T.surface2 : T.accent,
            borderWidth: added ? 1 : 0, borderColor: T.line,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name={added ? 'minus' : 'plus'} size={18}
              color={added ? T.ink : '#08191B'} />
          </View>
        </Pressable>
      ) : (
        <Text style={{ color: T.ok, fontSize: 10, fontWeight: '800', width: 52 }}
          numberOfLines={2}>In your Paldex</Text>
      )}
    </Pressable>
  );
}

function CategoryBrowser({ sec, bctx, onClose }: {
  sec: SectionDef; bctx: BrowseCtx; onClose: () => void;
}) {
  const [q, setQ] = useState('');
  // the SAME Filter & Sort sheet the Paldex and the picker use — a big
  // category (83 ground mounts) needs narrowing, not just a search box
  // (CEO 2026-08-16: "why no filter similar to paldex filter search")
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [sort, setSort] = useState<SortKey>('number');
  const [sheetOpen, setSheetOpen] = useState(false);
  const ranked = orderItems(sec, bctx.attain);
  const rec = sec.scored
    ? recommendedSet(ranked.map((x) => ({ name: x.name, value: x.value ?? 0 })), bctx.attain)
    : new Set<string>();
  const filtersActive = filters.own !== 'all' || filters.elements.length > 0 || !!filters.work;
  const rows = useMemo(() => {
    const byName = new Map(ranked.map((x) => [x.name, x]));
    let names = applyFilters(ranked.map((x) => x.name), filters);
    // 'number' is the sheet's neutral value (same convention as PalPicker):
    // leave the category's own best-first ranking alone unless the player
    // actually picks a sort.
    if (sort !== 'number') names = sortedPals(names, sort);
    if (q) names = names.filter((n) => n.toLowerCase().includes(q.toLowerCase()));
    return names.map((n) => byName.get(n)!).filter(Boolean);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sec.id, q, filters, sort, bctx.targets]);
  const missing = rows
    .filter((x) => !bctx.targets.includes(x.name) && !ownedAny(x.name))
    .map((x) => x.name);
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: T.bg2 }}>
        <View style={{
          padding: 16, paddingBottom: 10, gap: 8,
          borderBottomWidth: 1, borderBottomColor: T.line,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <SectionHeadIcon sec={sec} size={20} />
            <Text style={[s.h2, { flex: 1 }]}>{sec.title}</Text>
            <Btn small label="Done" onPress={onClose} />
          </View>
          <Text style={[s.body, { fontSize: 11.5 }]}>{sec.blurb}</Text>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <SearchInput value={q} onChange={setQ}
                placeholder={sec.items.length === 1
                  ? 'Search 1 pal…' : `Search ${sec.items.length} pals…`} />
            </View>
            {/* read "Filters ·" — a separator with nothing after it. Say how
                many are on, like the website does. */}
            <Btn small label={(() => {
              const n = filters.elements.length + (filters.work ? 1 : 0)
                + (filters.own === 'all' ? 0 : 1) + (sort !== 'number' ? 1 : 0);
              return n ? `Filters (${n})` : 'Filters';
            })()}
              primary={filtersActive || sort !== 'number'}
              onPress={() => setSheetOpen(true)} />
            {missing.length > 1 && (
              <Btn small label={`Add ${missing.length}`} onPress={() => bctx.onAdd(missing)} />
            )}
          </View>
          {/* say what the list is narrowed to, and give one tap back out */}
          {(filtersActive || sort !== 'number' || !!q) && (
            <View style={[s.wrap, { alignItems: 'center' }]}>
              <Text style={{ color: T.accentInk, fontSize: 11.5, fontWeight: '700' }}>
                {rows.length} of {sec.items.length} shown
              </Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Clear the filters and search"
                onPress={() => { setFilters(NO_FILTERS); setSort('number'); setQ(''); }}>
                <Text style={{ color: T.faint, fontSize: 11.5, fontWeight: '800' }}> ✕ clear</Text>
              </Pressable>
            </View>
          )}
        </View>
        <FlatList
          data={rows}
          keyExtractor={(x) => x.name}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          initialNumToRender={10}
          windowSize={7}
          contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <BrowserRow item={item} recommended={rec.has(item.name)} bctx={bctx} />
          )}
          ListEmptyComponent={
            // name what actually emptied the list — a filter can do it now,
            // so blaming "that search" was wrong the moment filters landed
            <Text style={[s.body, { textAlign: 'center', marginTop: 30 }]}>
              {filtersActive && q
                ? 'Nothing here matches those filters and that search.'
                : filtersActive
                  ? 'No pal here matches those filters.'
                  : 'No pal here matches that search.'}
            </Text>
          }
        />
      </View>
      {sheetOpen && (
        <FilterSheet filters={filters} sort={sort}
          base={ranked.map((x) => x.name)}
          onApply={(f, sk) => { setFilters(f); setSort(sk); setSheetOpen(false); }}
          onClose={() => setSheetOpen(false)} />
      )}
    </Modal>
  );
}

/* ---------------- the sheet ---------------- */

interface SheetProps {
  onClose: () => void;
  /** current goal list — added pals show as such */
  targets: string[];
  onAdd: (names: string[]) => void;
  /** un-add — every added pal must be removable right here (CEO 2026-08-15:
   * "I can't un-add them") */
  onRemove: (names: string[]) => void;
}

export function SuggestedGoals({ visible, ...rest }: SheetProps & { visible: boolean }) {
  // A closed sheet computes NOTHING: the body only exists while visible,
  // so store writes elsewhere in the app no longer pay for crew rankings
  // and regex sweeps behind an invisible modal (perf trap, self-found).
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet"
      onRequestClose={rest.onClose}>
      {visible ? <SheetBody {...rest} /> : null}
    </Modal>
  );
}

function SheetBody({ onClose, targets, onAdd, onRemove }: SheetProps) {
  const [viewing, setViewing] = useState<string | null>(null);
  const [browsing, setBrowsing] = useState<string | null>(null);
  const [levelDialog, setLevelDialog] = useState(false);
  const [levelInput, setLevelInput] = useState('');
  const playerLevel = getPlayerLevel();
  const box = Object.keys(getBox());
  const boxKey = boxKeyOf(box);
  // the reachability pass is the one expensive computation — pay it once
  // per box change, a beat after opening so the sheet slides in smoothly,
  // behind a one-line "reading" state. Reopening is instant (cached).
  const ready = derivationsReady(box);
  const [, bump] = useState(0);
  useEffect(() => {
    if (ready) return;
    const t = setTimeout(() => {
      cachedDerivations(engine, box);
      bump((x) => x + 1);
    }, 30);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxKey, ready]);
  // MUST stay behind `ready`: getAttainContext runs the reachability
  // fixpoint, and a useMemo executes during RENDER. Computing it before the
  // "Reading your save…" early return blocked the thread for over a second
  // and only then painted the placeholder — the placeholder was covering
  // nothing (measured, self-found 2026-08-16).
  const ctx = useMemo(
    () => (ready
      ? getAttainContext(engine, pals, breeding, box, playerLevel, ownedAny)
      : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [boxKey, playerLevel, ready],
  );
  const sections = useMemo(buildSections, []);
  // a pal card opened from here can navigate ("Plan how to get it") — if the
  // destination is the tab underneath us, nothing would remount, and the tap
  // would look dead behind this sheet. Any cross-screen jump closes it.
  useEffect(() => onNavIntent(() => {
    setViewing(null);
    setBrowsing(null);
    onClose();
  }), [onClose]);

  // the placeholder must come BEFORE anything that touches ctx — every
  // hook above this point is unconditional, so returning here is safe
  if (!ready || !ctx) {
    // one quiet beat on first open per box change — never a frozen thread
    return (
      <View style={{
        flex: 1, backgroundColor: T.bg2,
        alignItems: 'center', justifyContent: 'center', gap: 8,
      }}>
        <Text style={[s.body, { fontWeight: '700' }]}>Reading your save…</Text>
      </View>
    );
  }

  const bctx: BrowseCtx = {
    attain: ctx.attain, stage: ctx.stage, targets, onAdd, onRemove,
    onView: setViewing,
  };
  const browsingSec = browsing ? sections.find((x) => x.id === browsing) : null;

  return (
    <>
      <View style={{ flex: 1, backgroundColor: T.bg2 }}>
        <View style={{
          padding: 16, paddingBottom: 10, gap: 6,
          borderBottomWidth: 1, borderBottomColor: T.line,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[s.h2, { flex: 1 }]}>Suggested goals</Text>
            <Btn small label="Done" onPress={onClose} />
          </View>
          {/* the sheet says what it's tuned to — and the level is settable
              right where it matters (CEO: player level on the world save) */}
          {/* measured at 15 px tall with 4 of slop = 23 effective — the
              smallest control in the app, and the one that tunes every
              suggestion below it */}
          <Pressable hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Set your player level"
            onPress={() => {
              setLevelInput(playerLevel != null ? String(playerLevel) : '');
              setLevelDialog(true);
            }}
            style={({ pressed }) => [{
              flexDirection: 'row', alignItems: 'center', gap: 5,
              alignSelf: 'flex-start', paddingVertical: 7, minHeight: 30,
              opacity: pressed ? 0.6 : 1,
            }]}>
            <Icon name="account-outline" size={14} color={T.accentInk} />
            <Text style={{ color: T.accentInk, fontSize: 11.5, fontWeight: '700' }}>
              {playerLevel != null
                ? `Tuned to your level ${playerLevel} — tap to change`
                : 'Tuned to your pals — tap to set your level for sharper picks'}
            </Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 40 }}>
          {sections.map((sec) => (
            <SectionCard key={sec.id} sec={sec} bctx={bctx} onBrowse={setBrowsing} />
          ))}
        </ScrollView>
      </View>
      {browsingSec && (
        <CategoryBrowser sec={browsingSec} bctx={bctx} onClose={() => setBrowsing(null)} />
      )}
      {viewing && <PalDetail name={viewing} onClose={() => setViewing(null)} />}
      {levelDialog && (
        <Modal visible transparent animationType="fade"
          onRequestClose={() => setLevelDialog(false)}>
          <View style={{
            flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
            alignItems: 'center', justifyContent: 'center', padding: 28,
          }}>
            <Card style={{ width: '100%' }}>
              <Text style={s.h2}>Your player level</Text>
              <Text style={[s.body, { marginTop: 6 }]}>
                Suggestions only recommend catches you can actually make.
                Leave empty and the app reads your reach from your pals
                instead. Saved on this world's profile.
              </Text>
              <TextInput
                value={levelInput}
                onChangeText={(t) => setLevelInput(t.replace(/[^0-9]/g, ''))}
                placeholder="Level (1–100)"
                placeholderTextColor={T.faint}
                keyboardType="number-pad"
                maxLength={3}
                autoFocus
                style={[s.search, { marginTop: 10 }]}
              />
              <View style={[s.wrap, { marginTop: 12 }]}>
                <Btn primary label="Save"
                  onPress={() => {
                    void setProfileLevel(getActiveProfile().id,
                      levelInput ? Number(levelInput) : undefined);
                    setLevelDialog(false);
                  }} />
                <Btn label="Cancel" onPress={() => setLevelDialog(false)} />
              </View>
            </Card>
          </View>
        </Modal>
      )}
    </>
  );
}
