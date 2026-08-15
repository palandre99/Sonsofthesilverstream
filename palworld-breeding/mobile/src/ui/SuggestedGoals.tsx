/** Suggested goals — the preset buttons grown into a real surface (CEO
 * 2026-08-15: "recommended pals should be a proper pop-up card… a suggestion
 * for all the best kindling, fighting, woodcutting etc").
 *
 * Everything here is computed from game data, never hand-picked:
 *   - "Best at <job>" = the top pals by that suitability level in the
 *     dataset, ties broken by base-stat total. Tap a pal for its card;
 *     add the whole squad or one at a time.
 *   - Cake supply / breeding support / aura squads come from the verified
 *     helper registry and the aura claim in verification.json.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { T } from '../theme';
import { Badge, Btn, PalIcon, s } from './kit';
import { Icon } from './Icon';
import { PalDetail } from './PalDetail';
import { WORK_ICONS } from '../data/workIcons';
import { breeding, engine, getBox, pals, ownedAny, workLabel } from '../store';
import { WORK_KEYS } from './palFilters';
import { HELPERS } from '../engine/helpers';
import { derivations } from '../engine/planner';
import { onNavIntent } from '../nav/intent';
import { PALCALC_FACTS } from '../data/palcalcFacts.g';
import { BEST_OVERALL, COMBAT_COMMUNITY, MOUNT_CALLOUTS } from '../data/meta';
import { MOUNTS, UTILITY_ROLES } from '../data/utilityRoles.g';
import { SADDLE_LEVELS } from '../data/saddleLevels.g';

/** top pals for one job — suitability level first, stat total second */
function bestAt(job: string, n = 14): { name: string; lvl: number }[] {
  return Object.keys(pals)
    .map((name) => ({ name, lvl: (pals[name].work ?? {})[job] ?? 0 }))
    .filter((x) => x.lvl > 0)
    .sort((a, b) => b.lvl - a.lvl
      || ((pals[b.name].hp ?? 0) + (pals[b.name].atk ?? 0) + (pals[b.name].def ?? 0))
      - ((pals[a.name].hp ?? 0) + (pals[a.name].atk ?? 0) + (pals[a.name].def ?? 0)))
    .slice(0, n);
}

/** Composite work crews — the CEO's "best farmer" insight (2026-08-15):
 * a pal with high Planting AND Gathering AND Transporting runs the whole
 * farm loop alone. Score = sum of the crew's work levels, from the dump;
 * the anchor job must be present. Formula stated plainly in each blurb. */
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

function crewRank(crew: { jobs: string[]; anchor: string }, n = 12):
{ name: string; score: number; parts: string }[] {
  return Object.keys(pals)
    .map((name) => {
      const w = pals[name].work ?? {};
      if (crew.anchor && !(w[crew.anchor] > 0)) return null;
      const jobs = crew.jobs.length ? crew.jobs : Object.keys(w);
      const score = jobs.reduce((s, j) => s + (w[j] ?? 0), 0);
      const parts = jobs.filter((j) => w[j] > 0)
        .map((j) => `${workLabel(j)[0]}${w[j]}`).join('·');
      return { name, score, parts };
    })
    .filter((x): x is { name: string; score: number; parts: string } => !!x && x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

/** highest battle stats, straight from the dump — attack weighted double
 * because that's what kills bosses; the label in the UI says exactly this */
function bestFighters(n = 12): { name: string; score: number }[] {
  return Object.keys(pals)
    .map((name) => ({
      name,
      score: (pals[name].atk ?? 0) * 2 + (pals[name].hp ?? 0) + (pals[name].def ?? 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

/** How attainable is this pal for THIS box, right now? (CEO: the engine must
 * think about what I have — early players get early picks, not endgame grind)
 *   have  — already in the Paldex
 *   breed — reachable from the box by breeding alone
 *   catch — spawns wild at a level near where the player already operates
 *   later — an endgame goal for now */
export type Attain =
  | { kind: 'have' }
  | { kind: 'breed'; steps: number }
  | { kind: 'catch'; lv: number }
  | { kind: 'later'; unlock?: string };

function attainFactory(): (n: string) => Attain {
  const box = Object.keys(getBox());
  // ONE derivations pass gives the exact minimal breeding-step count to
  // every reachable species — the sheet reacts to the world save for real
  // (CEO 2026-08-15: "it's not dynamic and reacting to the paldex")
  const derivs = box.length ? derivations(engine, new Set(box)) : new Map<string, Set<string>>();
  // stage proxy: the highest wild level the player's own pals occupy —
  // a box of Lv-40 spawns implies the player survives Lv ~50 zones
  const stage = Math.max(15, ...box.map((n) => PALCALC_FACTS[n]?.maxWild ?? 0));
  const catchable = (n: string): boolean => {
    const f = PALCALC_FACTS[n];
    return !!pals[n]?.wild && f?.minWild != null && f.minWild <= stage + 10;
  };
  return (n: string): Attain => {
    if (ownedAny(n)) return { kind: 'have' };
    const d = derivs.get(n);
    if (d) return { kind: 'breed', steps: Math.max(1, d.size) };
    if (catchable(n)) return { kind: 'catch', lv: PALCALC_FACTS[n]!.minWild! };
    // "catch X to unlock the breeding route": one producing pair where one
    // parent is already breedable and the other is a stage-appropriate
    // catch. Bounded: first hit wins, gendered pairs included via combos.
    for (const c of breeding.unique_combos) {
      if (c.child !== n) continue;
      const [pa, pb] = c.parents;
      if ((derivs.has(pa) || ownedAny(pa)) && catchable(pb)) return { kind: 'later', unlock: pb };
      if ((derivs.has(pb) || ownedAny(pb)) && catchable(pa)) return { kind: 'later', unlock: pa };
    }
    return { kind: 'later' };
  };
}

const ATTAIN_ORDER: Record<Attain['kind'], number> = {
  have: 3, breed: 0, catch: 1, later: 2,
};
/** breed-distance beats kind alone: 1-step breeds first, then cheap catches */
function attainScore(a: Attain): number {
  if (a.kind === 'breed') return Math.min(a.steps, 9);
  if (a.kind === 'catch') return 10;
  if (a.kind === 'later') return a.unlock ? 20 : 30;
  return 40;
}

const AURA_SQUAD = ['Ribbuny', 'Cinnamoth', 'Clovee', 'Petallia', 'Tetroise', 'Wumpo',
  'Amione', 'Eikthyrdeer Terra', 'Katress Ignis', 'Mycora', 'Puffolt', 'Smokie Cryst'];

/** pals whose partner-skill text matches — the honest way to build effect
 * squads without hand-picking (paldex order; text is the game's own) */
function palsWithEffect(re: RegExp): string[] {
  return Object.keys(pals).filter((n) => re.test(pals[n].partner_effect ?? ''));
}
/** combat loot: more drops from defeated enemies (Blazehowl-class + Dumud
 * Gild's gold bonus) */
const LOOT_RE = /defeated|dropped by enemies/i;
/** the full ranch roster — every "assigned to Ranch" producer */
const RANCH_RE = /assigned to Ranch/i;

export function SuggestedGoals({ visible, onClose, targets, onAdd }: {
  visible: boolean;
  onClose: () => void;
  /** current goal list — added pals show as such */
  targets: string[];
  onAdd: (names: string[]) => void;
}) {
  const [viewing, setViewing] = useState<string | null>(null);
  const [openJob, setOpenJob] = useState<string | null>(null);
  const best = useMemo(
    () => Object.fromEntries(WORK_KEYS.map((w) => [w, bestAt(w)])),
    [],
  );
  const fighters = useMemo(() => bestFighters(), []);
  // recomputed each time the sheet opens — the box may have grown
  const attain = useMemo(attainFactory, [visible]);
  /** stage-aware ordering: 1-step breeds, then cheap catches, then unlocks */
  const byAttain = (names: string[]) =>
    [...names].sort((a, b) => attainScore(attain(a)) - attainScore(attain(b)));
  // a pal card opened from here can navigate ("Plan how to get it") — if the
  // destination is the tab underneath us, nothing would remount, and the tap
  // would look dead behind this sheet. Any cross-screen jump closes it.
  useEffect(() => onNavIntent(() => {
    setViewing(null);
    onClose();
  }), [onClose]);

  const PalChip = ({ name, lvl, note, star }: {
    name: string; lvl?: number;
    /** short label under the name (e.g. a mount callout) */
    note?: string;
    /** community-favourite marker */
    star?: boolean;
  }) => {
    const added = targets.includes(name);
    const owned = ownedAny(name);
    const a = attain(name);
    // an owned pal is NOT a suggestion — quiet proof of coverage. Everything
    // else says exactly how you'd GET it from your world save: real step
    // counts, catch levels, or the pal that unlocks the breeding route.
    const status = added ? 'IN PLAN'
      : a.kind === 'have' ? 'HAVE IT'
        : a.kind === 'breed' ? (a.steps === 1 ? 'BREED · 1 STEP' : `BREED · ${a.steps} STEPS`)
          : a.kind === 'catch' ? `CATCH LV ${a.lv}`
            : a.unlock ? `CATCH ${a.unlock.toUpperCase()} TO UNLOCK` : 'ENDGAME';
    const statusColor = added || a.kind === 'have' ? T.ok
      : a.kind === 'breed' ? T.accentInk
        : a.kind === 'catch' ? T.warn
          : a.kind === 'later' && a.unlock ? T.goldInk : T.faint;
    const addable = !added && !owned;
    return (
      <Pressable onPress={() => setViewing(name)}
        style={({ pressed }) => [{
          alignItems: 'center', gap: 3, width: 74, paddingVertical: 6,
          borderRadius: 12, borderWidth: 1,
          borderColor: pressed ? T.accent : added ? T.ok : owned ? T.okSoft : T.line,
          backgroundColor: added ? T.okSoft : T.surface,
          opacity: owned && !added ? 0.55 : 1,
        }]}
      >
        <View>
          <PalIcon name={name} size={40} />
          {star && (
            <View style={{ position: 'absolute', right: -3, top: -3 }}>
              <Icon name="star-four-points" size={12} color={T.gold} />
            </View>
          )}
          {/* add JUST this one — the whole-table button was the only way in
              (CEO 2026-08-15) */}
          {addable && (
            <Pressable hitSlop={6}
              accessibilityLabel={`Add ${name} to the plan`}
              onPress={() => {
                void Haptics.selectionAsync();
                onAdd([name]);
              }}
              style={{ position: 'absolute', left: -7, top: -5 }}>
              <View style={{
                width: 18, height: 18, borderRadius: 9, backgroundColor: T.accent,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon name="plus" size={13} color="#08191B" />
              </View>
            </Pressable>
          )}
        </View>
        <Text numberOfLines={1} style={{
          color: T.ink, fontSize: 9.5, fontWeight: '700', maxWidth: 68,
        }}>{name}</Text>
        {lvl != null && (
          <Text style={{ color: T.accentInk, fontSize: 10, fontWeight: '800' }}>Lv {lvl}</Text>
        )}
        {note ? (
          <Text numberOfLines={1} style={{
            color: T.goldInk, fontSize: 8, fontWeight: '700', maxWidth: 70,
          }}>{note}</Text>
        ) : null}
        <Text numberOfLines={1} style={{
          color: statusColor, fontSize: 8, fontWeight: '800', maxWidth: 70,
        }}>{status}</Text>
      </Pressable>
    );
  };

  const SquadCard = ({ title, blurb, names, lvls }: {
    title: string; blurb: string; names: string[]; lvls?: Record<string, number>;
  }) => {
    // owned pals need no plan — never count them into "Add N"
    const missing = names.filter((n) => !targets.includes(n) && !ownedAny(n));
    const ownedCount = names.filter(ownedAny).length;
    const covered = missing.length === 0;
    // a fully covered squad stops selling and starts confirming: compact,
    // quiet, nothing to do here (CEO: don't suggest what I already have)
    return (
      <View style={{
        backgroundColor: T.surface,
        borderColor: covered ? T.okSoft : T.line, borderWidth: 1,
        borderRadius: 14, padding: 12, gap: 8, opacity: covered ? 0.8 : 1,
      }}>
        <View style={[s.row, { gap: 8 }]}>
          <Text style={[s.h3, { flex: 1 }]}>{title}</Text>
          {covered ? (
            <Text style={{ color: T.ok, fontSize: 11.5, fontWeight: '800' }}>
              covered{ownedCount < names.length ? ' or planned' : ''}
            </Text>
          ) : (
            <Btn small primary label={`Add ${missing.length}`}
              onPress={() => onAdd(missing)} />
          )}
        </View>
        {!covered && (
          <Text style={[s.body, { fontSize: 12 }]}>
            {blurb}{ownedCount > 0 ? `  You have ${ownedCount} of ${names.length}.` : ''}
          </Text>
        )}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6 }}>
          {/* stage-aware: what you can act on NOW first, owned proof last */}
          {(covered ? names : byAttain(names)).map((n) => (
            <PalChip key={n} name={n} lvl={lvls?.[n]} note={MOUNT_CALLOUTS[n]} />
          ))}
        </ScrollView>
      </View>
    );
  };

  /** Big lists, done cleanly: vertical wrap, ranked by attainability with
   * community callouts first among equals, capped with expand. */
  const RankedCard = ({ id, title, blurb, names }: {
    id: string; title: string; blurb: string; names: string[];
  }) => {
    const ranked = [...new Set(names)].sort((a, b) =>
      attainScore(attain(a)) - attainScore(attain(b))
      || Number(!!MOUNT_CALLOUTS[b]) - Number(!!MOUNT_CALLOUTS[a]));
    const expanded = openJob === id;
    const shown = expanded ? ranked.slice(0, 20) : ranked.slice(0, 6);
    const hidden = ranked.length - shown.length;
    const missing = shown.filter((n) => !targets.includes(n) && !ownedAny(n));
    return (
      <View style={{
        backgroundColor: T.surface, borderColor: T.line, borderWidth: 1,
        borderRadius: 14, padding: 12, gap: 8,
      }}>
        <Pressable style={[s.row, { gap: 8 }]}
          onPress={() => {
            void Haptics.selectionAsync();
            setOpenJob(expanded ? null : id);
          }}>
          <Text style={[s.h3, { flex: 1 }]}>{title}</Text>
          <Badge kind="plain">{expanded ? 'less −' : `top 6 of ${ranked.length} +`}</Badge>
        </Pressable>
        <Text style={[s.body, { fontSize: 11.5 }]}>{blurb}</Text>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {shown.map((n) => (
            // "saddle available Lv X" (CEO) — real tech levels from paldb;
            // community speed callouts win the one-line slot when present
            <PalChip key={n} name={n}
              note={MOUNT_CALLOUTS[n]
                ?? (SADDLE_LEVELS[n] != null ? `saddle Lv ${SADDLE_LEVELS[n]}` : undefined)} />
          ))}
        </View>
        {expanded && hidden > 0 && (
          <Text style={[s.body, { fontSize: 11, color: T.faint }]}>
            +{hidden} more — the Paldex filter finds them all.
          </Text>
        )}
        {missing.length > 1 && (
          <Btn small label={`Add all ${missing.length} shown`}
            onPress={() => onAdd(missing)} />
        )}
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: T.bg2 }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center', padding: 16,
          borderBottomWidth: 1, borderBottomColor: T.line,
        }}>
          <Text style={[s.h2, { flex: 1 }]}>Suggested goals</Text>
          <Btn small label="Done" onPress={onClose} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 40 }}>

          <SquadCard title="Cake supply"
            blurb="The four ranch pals that feed every cake — eggs, milk, honey, berries. The breeding farm stops without them."
            names={HELPERS.filter((h) => h.role === 'ranch').map((h) => h.name)} />

          <SquadCard title="Breeding speed & luck"
            blurb="Faster egg production, faster hatching, extra eggs — all verified partner skills."
            names={HELPERS.filter((h) => h.role === 'speed' || h.role === 'luck')
              .map((h) => h.name)} />

          <SquadCard title="Aura squad"
            blurb="Each gives +1 work suitability to every other pal in its base (auras don't stack — spread them across bases). All twelve, verified."
            names={AURA_SQUAD} />

          {/* ---- THE BEST IN THE GAME (community consensus, labelled) ---- */}
          <View style={{
            backgroundColor: T.surface, borderColor: T.goldSoft, borderWidth: 1,
            borderRadius: 14, padding: 12, gap: 8,
          }}>
            <View style={[s.row, { gap: 8 }]}>
              <Icon name="crown-outline" size={18} color={T.goldInk} />
              <Text style={[s.h3, { flex: 1 }]}>The best pals in the game</Text>
              <Btn small primary
                disabled={!BEST_OVERALL.some((m) => attain(m.name).kind !== 'have'
                  && !targets.includes(m.name))}
                label={`Add ${BEST_OVERALL.filter((m) => attain(m.name).kind !== 'have'
                  && !targets.includes(m.name)).length}`}
                onPress={() => onAdd(BEST_OVERALL
                  .filter((m) => attain(m.name).kind !== 'have' && !targets.includes(m.name))
                  .map((m) => m.name))} />
            </View>
            <Text style={[s.body, { fontSize: 11.5 }]}>
              What players rate highest across everything — community consensus
              (game8 + pindrop, Aug 2026). Ordered by what YOU can act on now.
            </Text>
            <View style={{ gap: 6 }}>
              {byAttain(BEST_OVERALL.map((m) => m.name)).map((n) => {
                const m = BEST_OVERALL.find((x) => x.name === n)!;
                const a = attain(n);
                return (
                  <Pressable key={n} onPress={() => setViewing(n)}
                    style={({ pressed }) => [s.row, {
                      gap: 10, paddingVertical: 4, borderRadius: 10,
                      opacity: a.kind === 'have' ? 0.55 : 1,
                      backgroundColor: pressed ? T.accentSoft : 'transparent',
                    }]}>
                    <PalIcon name={n} size={40} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: T.ink, fontWeight: '800', fontSize: 13.5 }}>{n}</Text>
                      <Text style={{ color: T.muted, fontSize: 11 }} numberOfLines={2}>{m.why}</Text>
                    </View>
                    <Badge kind={a.kind === 'have' ? 'ok'
                      : a.kind === 'breed' ? 'plain' : a.kind === 'catch' ? 'warn' : 'plain'}>
                      {a.kind === 'have' ? 'have it' : a.kind === 'breed' ? 'breed now'
                        : a.kind === 'catch' ? `catch Lv ${a.lv}` : 'endgame goal'}
                    </Badge>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* ---- FIGHTING (dump stats + community stars) ---- */}
          <View style={{
            backgroundColor: T.surface, borderColor: T.line, borderWidth: 1,
            borderRadius: 14, padding: 12, gap: 8,
          }}>
            <View style={[s.row, { gap: 8 }]}>
              <Icon name="sword-cross" size={18} color={T.accentInk} />
              <Text style={[s.h3, { flex: 1 }]}>Fighting</Text>
              <Btn small primary
                disabled={!fighters.some((f) => attain(f.name).kind !== 'have'
                  && !targets.includes(f.name))}
                label={`Add ${fighters.filter((f) => attain(f.name).kind !== 'have'
                  && !targets.includes(f.name)).length}`}
                onPress={() => onAdd(fighters
                  .filter((f) => attain(f.name).kind !== 'have' && !targets.includes(f.name))
                  .map((f) => f.name))} />
            </View>
            <Text style={[s.body, { fontSize: 11.5 }]}>
              Highest battle stats in the game data (attack counted double).
              A gold spark marks community-favourite fighters.
            </Text>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              {byAttain(fighters.map((f) => f.name)).map((n) => (
                <PalChip key={n} name={n} star={COMBAT_COMMUNITY.includes(n)} />
              ))}
            </View>
          </View>

          {/* ---- MOUNTS (dump typing + labelled community speed) ----
               Vertical, ranked, capped — 83 pals in a thumb-wide horizontal
               scroll was rightly called bad design (CEO 2026-08-15). */}
          <RankedCard id="m-fly" title="Flying mounts"
            blurb="Every flyable pal in the game data, closest-to-yours first. Speed callouts are community-measured."
            names={MOUNTS.flying} />
          <RankedCard id="m-ground" title="Ground mounts"
            blurb="Every ground mount, closest-to-yours first — the called-out ones are the community's elite."
            names={MOUNTS.ground} />
          <RankedCard id="m-glide" title="Gliders & swimmers"
            blurb="Glider partner skills from the game data, plus the swimmers."
            names={[...UTILITY_ROLES.glider.pals.map((p) => p.name), ...MOUNTS.swim]} />

          {/* ---- UTILITY PARTNER SKILLS (pure game data) ---- */}
          <SquadCard title="Weight & carrying helpers"
            blurb="Ore, stone, wood and food weight cuts plus carry capacity — the game's own partner skills (Turtacle cuts ore weight 80–100%)."
            names={UTILITY_ROLES.weight.pals.map((p) => p.name)} />
          <SquadCard title="Work efficiency boosters"
            blurb="Mining, logging and crafting multipliers from partner skills (Digtoise: ore mining +800–2000%). Tap a pal for the exact numbers."
            names={UTILITY_ROLES.efficiency.pals.map((p) => p.name)} />

          <RankedCard id="u-loot" title="Loot boosters"
            blurb="More drops from enemies you defeat — element-specific hunting partners, plus Dumud Gild's gold bonus. Tap a pal for its exact effect."
            names={palsWithEffect(LOOT_RE)} />
          <RankedCard id="u-ranch" title="Ranch producers"
            blurb="Every pal that makes something at the Ranch — eggs, milk, berries, wool, mushrooms, ice organs and more."
            names={palsWithEffect(RANCH_RE)} />

          {/* ---- COMPOSITE CREWS (CEO: "best farmer" = high planting+
               gathering+transporting) — scores straight from work levels ---- */}
          {CREWS.map((crew) => {
            const list = crewRank(crew);
            if (!list.length) return null;
            const expanded = openJob === crew.id;
            const shown = expanded ? list : list.slice(0, 6);
            const missing = shown
              .filter((x) => !targets.includes(x.name) && !ownedAny(x.name))
              .map((x) => x.name);
            return (
              <View key={crew.id} style={{
                backgroundColor: T.surface, borderColor: T.line, borderWidth: 1,
                borderRadius: 14, padding: 12, gap: 8,
              }}>
                <Pressable style={[s.row, { gap: 8 }]}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setOpenJob(expanded ? null : crew.id);
                  }}>
                  <Text style={[s.h3, { flex: 1 }]}>{crew.title}</Text>
                  <Badge kind="plain">{expanded ? 'less −' : `top 6 of ${list.length} +`}</Badge>
                </Pressable>
                <Text style={[s.body, { fontSize: 11.5 }]}>{crew.blurb}</Text>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  {shown.map((x) => (
                    <PalChip key={x.name} name={x.name} lvl={x.score} note={x.parts} />
                  ))}
                </View>
                {missing.length > 1 && (
                  <Btn small label={`Add all ${missing.length} shown`}
                    onPress={() => onAdd(missing)} />
                )}
              </View>
            );
          })}

          <Text style={{
            color: T.faint, fontSize: 10.5, fontWeight: '800',
            letterSpacing: 1, textTransform: 'uppercase', marginTop: 4,
          }}>Best at each job — from the game's own numbers</Text>

          {WORK_KEYS.map((w) => {
            const list = best[w];
            if (!list.length) return null;
            const expanded = openJob === w;
            // DYNAMIC (CEO 2026-08-15): the collapsed view is the absolute
            // top 5 PLUS anything nearly as good that your save can reach
            // cheaply — a Lv-7 worker two breeding steps away beats a Lv-8
            // endgame wall for most players. Those extras say why they're up.
            const topLvl = list[0].lvl;
            const closeGood = list.slice(5).filter((x) =>
              x.lvl >= topLvl - 2 && attainScore(attain(x.name)) <= 4);
            const shown = expanded
              ? list
              : [...list.slice(0, 5), ...closeGood].slice(0, 9);
            const isCloseGood = new Set(closeGood.map((x) => x.name));
            const missing = shown
              .filter((x) => !targets.includes(x.name) && !ownedAny(x.name))
              .map((x) => x.name);
            return (
              <View key={w} style={{
                backgroundColor: T.surface, borderColor: T.line, borderWidth: 1,
                borderRadius: 14, padding: 12, gap: 8,
              }}>
                <Pressable style={[s.row, { gap: 8 }]}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setOpenJob(expanded ? null : w);
                  }}>
                  {WORK_ICONS[w] && (
                    <Image source={WORK_ICONS[w]} style={{ width: 22, height: 22 }} />
                  )}
                  <Text style={[s.h3, { flex: 1 }]}>{workLabel(w)}</Text>
                  <Badge kind="plain">{expanded ? 'less −' : `top ${shown.length} of ${list.length} +`}</Badge>
                </Pressable>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  {shown.map((x) => (
                    <PalChip key={x.name} name={x.name} lvl={x.lvl}
                      note={isCloseGood.has(x.name) ? 'good & close' : undefined} />
                  ))}
                </View>
                {missing.length ? (
                  <Btn small primary label={`Add these ${missing.length}`}
                    onPress={() => onAdd(missing)} />
                ) : (
                  <Text style={{ color: T.ok, fontSize: 11.5, fontWeight: '800' }}>
                    You already have the best — nothing to add
                  </Text>
                )}
              </View>
            );
          })}
        </ScrollView>
      </View>
      {viewing && <PalDetail name={viewing} onClose={() => setViewing(null)} />}
    </Modal>
  );
}
