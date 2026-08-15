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
import { PalDetail } from './PalDetail';
import { WORK_ICONS } from '../data/workIcons';
import { pals, ownedAny, workLabel } from '../store';
import { WORK_KEYS } from './palFilters';
import { HELPERS } from '../engine/helpers';
import { onNavIntent } from '../nav/intent';

/** top pals for one job — suitability level first, stat total second */
function bestAt(job: string, n = 5): { name: string; lvl: number }[] {
  return Object.keys(pals)
    .map((name) => ({ name, lvl: (pals[name].work ?? {})[job] ?? 0 }))
    .filter((x) => x.lvl > 0)
    .sort((a, b) => b.lvl - a.lvl
      || ((pals[b.name].hp ?? 0) + (pals[b.name].atk ?? 0) + (pals[b.name].def ?? 0))
      - ((pals[a.name].hp ?? 0) + (pals[a.name].atk ?? 0) + (pals[a.name].def ?? 0)))
    .slice(0, n);
}

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
  // a pal card opened from here can navigate ("Plan how to get it") — if the
  // destination is the tab underneath us, nothing would remount, and the tap
  // would look dead behind this sheet. Any cross-screen jump closes it.
  useEffect(() => onNavIntent(() => {
    setViewing(null);
    onClose();
  }), [onClose]);

  const PalChip = ({ name, lvl }: { name: string; lvl?: number }) => {
    const added = targets.includes(name);
    return (
      <Pressable onPress={() => setViewing(name)}
        style={({ pressed }) => [{
          alignItems: 'center', gap: 3, width: 64, paddingVertical: 6,
          borderRadius: 12, borderWidth: 1,
          borderColor: pressed ? T.accent : added ? T.ok : T.line,
          backgroundColor: added ? T.okSoft : T.surface,
        }]}
      >
        <PalIcon name={name} size={40} />
        <Text numberOfLines={1} style={{
          color: T.ink, fontSize: 9.5, fontWeight: '700', maxWidth: 58,
        }}>{name}</Text>
        {lvl != null && (
          <Text style={{ color: T.accentInk, fontSize: 10, fontWeight: '800' }}>Lv {lvl}</Text>
        )}
        {added
          ? <Text style={{ color: T.ok, fontSize: 8.5, fontWeight: '800' }}>IN PLAN</Text>
          : ownedAny(name)
            ? <Text style={{ color: T.faint, fontSize: 8.5, fontWeight: '800' }}>OWNED</Text>
            : null}
      </Pressable>
    );
  };

  const SquadCard = ({ title, blurb, names, lvls }: {
    title: string; blurb: string; names: string[]; lvls?: Record<string, number>;
  }) => {
    // owned pals need no plan — never count them into "Add N"
    const missing = names.filter((n) => !targets.includes(n) && !ownedAny(n));
    return (
      <View style={{
        backgroundColor: T.surface, borderColor: T.line, borderWidth: 1,
        borderRadius: 14, padding: 12, gap: 8,
      }}>
        <View style={[s.row, { gap: 8 }]}>
          <Text style={[s.h3, { flex: 1 }]}>{title}</Text>
          <Btn small primary={missing.length > 0} disabled={missing.length === 0}
            label={missing.length ? `Add ${missing.length}` : 'All added ✓'}
            onPress={() => onAdd(missing)} />
        </View>
        <Text style={[s.body, { fontSize: 12 }]}>{blurb}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6 }}>
          {names.map((n) => <PalChip key={n} name={n} lvl={lvls?.[n]} />)}
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

          <Text style={{
            color: T.faint, fontSize: 10.5, fontWeight: '800',
            letterSpacing: 1, textTransform: 'uppercase', marginTop: 4,
          }}>Best at each job — from the game's own numbers</Text>

          {WORK_KEYS.map((w) => {
            const list = best[w];
            if (!list.length) return null;
            const expanded = openJob === w;
            const shown = expanded ? list : list.slice(0, 3);
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
                  <Badge kind="plain">{expanded ? 'top 5 −' : 'top 3 +'}</Badge>
                </Pressable>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  {shown.map((x) => <PalChip key={x.name} name={x.name} lvl={x.lvl} />)}
                </View>
                <Btn small primary={missing.length > 0} disabled={!missing.length}
                  label={missing.length ? `Add these ${missing.length}` : 'All added or owned ✓'}
                  onPress={() => onAdd(missing)} />
              </View>
            );
          })}
        </ScrollView>
      </View>
      {viewing && <PalDetail name={viewing} onClose={() => setViewing(null)} />}
    </Modal>
  );
}
