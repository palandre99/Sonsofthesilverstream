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
import { engine, getBox, pals, ownedAny, workLabel } from '../store';
import { WORK_KEYS } from './palFilters';
import { HELPERS } from '../engine/helpers';
import { closure } from '../engine/planner';
import { onNavIntent } from '../nav/intent';
import { PALCALC_FACTS } from '../data/palcalcFacts.g';
import { BEST_OVERALL, COMBAT_COMMUNITY, MOUNT_CALLOUTS } from '../data/meta';
import { MOUNTS, UTILITY_ROLES } from '../data/utilityRoles.g';

/** top pals for one job — suitability level first, stat total second */
function bestAt(job: string, n = 8): { name: string; lvl: number }[] {
  return Object.keys(pals)
    .map((name) => ({ name, lvl: (pals[name].work ?? {})[job] ?? 0 }))
    .filter((x) => x.lvl > 0)
    .sort((a, b) => b.lvl - a.lvl
      || ((pals[b.name].hp ?? 0) + (pals[b.name].atk ?? 0) + (pals[b.name].def ?? 0))
      - ((pals[a.name].hp ?? 0) + (pals[a.name].atk ?? 0) + (pals[a.name].def ?? 0)))
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
  | { kind: 'breed' }
  | { kind: 'catch'; lv: number }
  | { kind: 'later' };

function attainFactory(): (n: string) => Attain {
  const box = Object.keys(getBox());
  const reach = box.length ? closure(engine, box) : new Set<string>();
  // stage proxy: the highest wild level the player's own pals occupy —
  // a box of Lv-40 spawns implies the player survives Lv ~50 zones
  const stage = Math.max(15, ...box.map((n) => PALCALC_FACTS[n]?.maxWild ?? 0));
  return (n: string): Attain => {
    if (ownedAny(n)) return { kind: 'have' };
    if (reach.has(n)) return { kind: 'breed' };
    const f = PALCALC_FACTS[n];
    if (pals[n]?.wild && f?.minWild != null && f.minWild <= stage + 10) {
      return { kind: 'catch', lv: f.minWild };
    }
    return { kind: 'later' };
  };
}

const ATTAIN_ORDER: Record<Attain['kind'], number> = {
  breed: 0, catch: 1, later: 2, have: 3,
};

const AURA_SQUAD = ['Ribbuny', 'Cinnamoth', 'Clovee', 'Petallia', 'Tetroise', 'Wumpo',
  'Amione', 'Eikthyrdeer Terra', 'Katress Ignis', 'Mycora', 'Puffolt', 'Smokie Cryst'];

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
  /** stage-aware ordering: what you can act on NOW comes first */
  const byAttain = (names: string[]) =>
    [...names].sort((a, b) => ATTAIN_ORDER[attain(a).kind] - ATTAIN_ORDER[attain(b).kind]);
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
    // an owned pal is NOT a suggestion — it reads as quiet proof of
    // coverage, visually stepped back (CEO 2026-08-15). Everything else
    // says how you'd GET it, from your actual box.
    const status = added ? 'IN PLAN'
      : a.kind === 'have' ? 'HAVE IT'
        : a.kind === 'breed' ? 'BREED NOW'
          : a.kind === 'catch' ? `CATCH LV ${a.lv}` : 'LATER';
    const statusColor = added || a.kind === 'have' ? T.ok
      : a.kind === 'breed' ? T.accentInk
        : a.kind === 'catch' ? T.warn : T.faint;
    return (
      <Pressable onPress={() => setViewing(name)}
        style={({ pressed }) => [{
          alignItems: 'center', gap: 3, width: 70, paddingVertical: 6,
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
        </View>
        <Text numberOfLines={1} style={{
          color: T.ink, fontSize: 9.5, fontWeight: '700', maxWidth: 64,
        }}>{name}</Text>
        {lvl != null && (
          <Text style={{ color: T.accentInk, fontSize: 10, fontWeight: '800' }}>Lv {lvl}</Text>
        )}
        {note ? (
          <Text numberOfLines={1} style={{
            color: T.goldInk, fontSize: 8, fontWeight: '700', maxWidth: 66,
          }}>{note}</Text>
        ) : null}
        <Text style={{ color: statusColor, fontSize: 8.5, fontWeight: '800' }}>{status}</Text>
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

          {/* ---- MOUNTS (dump typing + labelled community speed) ---- */}
          <SquadCard title="Flying mounts"
            blurb="Every flyable pal in the game data. Speed callouts are community-measured."
            names={[...MOUNTS.flying].sort((a, b) =>
              Number(!!MOUNT_CALLOUTS[b]) - Number(!!MOUNT_CALLOUTS[a]))} />
          <SquadCard title="Ground mounts"
            blurb="Every ground mount in the game data — the called-out ones are the community's elite."
            names={[...MOUNTS.ground].sort((a, b) =>
              Number(!!MOUNT_CALLOUTS[b]) - Number(!!MOUNT_CALLOUTS[a]))} />
          <SquadCard title="Gliders & swimmers"
            blurb="Glider partner skills from the game data, plus the swimmers."
            names={[...UTILITY_ROLES.glider.pals.map((p) => p.name),
              ...MOUNTS.swim].sort((a, b) =>
              Number(!!MOUNT_CALLOUTS[b]) - Number(!!MOUNT_CALLOUTS[a]))} />

          {/* ---- UTILITY PARTNER SKILLS (pure game data) ---- */}
          <SquadCard title="Weight & carrying helpers"
            blurb="Ore, stone, wood and food weight cuts plus carry capacity — the game's own partner skills (Turtacle cuts ore weight 80–100%)."
            names={UTILITY_ROLES.weight.pals.map((p) => p.name)} />
          <SquadCard title="Work efficiency boosters"
            blurb="Mining, logging and crafting multipliers from partner skills (Digtoise: ore mining +800–2000%). Tap a pal for the exact numbers."
            names={UTILITY_ROLES.efficiency.pals.map((p) => p.name)} />

          <Text style={{
            color: T.faint, fontSize: 10.5, fontWeight: '800',
            letterSpacing: 1, textTransform: 'uppercase', marginTop: 4,
          }}>Best at each job — from the game's own numbers</Text>

          {WORK_KEYS.map((w) => {
            const list = best[w];
            if (!list.length) return null;
            const expanded = openJob === w;
            const shown = expanded ? list : list.slice(0, 5);
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
                  <Badge kind="plain">{expanded ? 'top 8 −' : 'top 5 +'}</Badge>
                </Pressable>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  {shown.map((x) => <PalChip key={x.name} name={x.name} lvl={x.lvl} />)}
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
