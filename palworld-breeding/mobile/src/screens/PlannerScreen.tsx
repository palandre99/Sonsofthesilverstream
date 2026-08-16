/** Route Planner — shortest shared breeding tree from your box, on-device. */
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { AnimatedCheck, HatchBurst, type Rarity, type TickState } from '../ui/celebrate';
import { PalDetail } from '../ui/PalDetail';
import { cakeNeeds } from '../engine/boosters';
import { ADVICE_VERSION, HELPER_NAMES, helperAdvice, type HelperAdvice } from '../engine/helpers';
import { T } from '../theme';
import {
  BackToCardChip, Badge, Btn, Card, PageHead, PalIcon, WorkChips, s,
} from '../ui/kit';
import { Icon } from '../ui/Icon';
import { onNavIntent, takeIntentPayload } from '../nav/intent';
import { wildLevelRange } from '../data/rarity';
import { PalPicker } from '../ui/PalPicker';
import { SuggestedGoals } from '../ui/SuggestedGoals';
import {
  clearPlan, completeStep, getBox, getChecks, getPlan, hasGender, ownedAny,
  addPlanTarget, pals, removePlanTarget, resetPlanProgress, savePlan, selfOnly,
  uncheckStep, useAppVersion,
  addDraftTargets, clearDraftTargets, getDraftTargets, removeDraftTargets,
  engine,
} from '../store';

/** "planned just now / today 22:40 / yesterday 09:15 / 12 Aug" — a stamp a
 * player reads at a glance, not a raw ISO date */
function plannedWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const mins = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (mins >= 0 && mins < 2) return 'planned just now';
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (d.toDateString() === now.toDateString()) return `planned today ${hm}`;
  const yesterday = new Date(now.getTime() - 86400000);
  if (d.toDateString() === yesterday.toDateString()) return `planned yesterday ${hm}`;
  return `planned ${d.getDate()} ${d.toLocaleString(undefined, { month: 'short' })}`;
}

/** none / partial (one gender hatched) / full (both, or a legacy tick). */
function tickStateOf(c: unknown): TickState {
  if (!c) return 'none';
  if (c === true) return 'full';
  const sc = c as { m: boolean; f: boolean };
  return sc.m && sc.f ? 'full' : 'partial';
}

function partialGlyph(c: unknown): string | undefined {
  if (!c || c === true) return undefined;
  const sc = c as { m: boolean; f: boolean };
  return sc.m ? '♂' : sc.f ? '♀' : undefined;
}
import { planFor, stepId } from '../engine/planner';
import { cachedDerivations } from '../logic/recommend';
import { parseGenderNote } from '../engine/formula';
import type { PlanStep } from '../engine/types';

// Preset squads live in ui/SuggestedGoals.tsx now — computed from game data,
// not hand-picked lists. (Tick rendering lives in ui/celebrate.tsx.)

/** "Hatched it! Which genders do you have?" — one tick registers the pal in
 * the Paldex too, so nothing is entered twice. */
function HatchSheet({ child, sid, have, onClose }: {
  child: string; sid: string;
  /** genders already recorded (partial tick) — undefined for a fresh tick */
  have?: { m: boolean; f: boolean };
  onClose: () => void;
}) {
  const pick = (m: boolean, f: boolean) => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    completeStep(sid, child, { m, f });
    onClose();
  };
  const partial = have && (have.m !== have.f);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={{
        flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
        alignItems: 'center', justifyContent: 'center', padding: 28,
      }}>
        <Card style={{ width: '100%', alignItems: 'center' }}>
          <PalIcon name={child} size={56} />
          <Text style={[s.h2, { marginTop: 8 }]}>
            {partial ? `Complete ${child}?` : `Hatched ${child}!`}
          </Text>
          <Text style={[s.body, { marginTop: 4, textAlign: 'center' }]}>
            {partial
              ? `You have the ${have!.m ? '♂' : '♀'} — hatch the ${have!.m ? '♀' : '♂'} and the step turns green.`
              : 'Which genders do you have? It goes straight into your Paldex — no double registration.'}
          </Text>
          <View style={[s.wrap, { marginTop: 14, justifyContent: 'center' }]}>
            {partial ? (
              <>
                <Btn primary label={`Got the ${have!.m ? '♀' : '♂'} — complete it`}
                  onPress={() => pick(true, true)} />
                <Btn danger label="Untick step" onPress={() => {
                  uncheckStep(sid, child);
                  onClose();
                }} />
              </>
            ) : (
              <>
                <Btn label="♂ only" onPress={() => pick(true, false)} />
                <Btn label="♀ only" onPress={() => pick(false, true)} />
                <Btn primary label="♂ + ♀ both" onPress={() => pick(true, true)} />
              </>
            )}
          </View>
          <View style={{ marginTop: 10 }}>
            <Btn small label="Cancel" onPress={onClose} />
          </View>
        </Card>
      </View>
    </Modal>
  );
}

export function PlannerScreen() {
  useAppVersion();
  const saved = getPlan();
  const checks = getChecks();
  // the goal list lives in the store (draftTargets) — screens remount on
  // every tab switch, and the sheet/picker/chips/advice all edit this list
  const targets = getDraftTargets();
  const [busy, setBusy] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [hatching, setHatching] = useState<{ sid: string; child: string } | null>(null);
  const [managing, setManaging] = useState<'none' | 'reset' | 'clear' | 'replace' | 'removeall'>('none');
  // the goal tray folds to one line once the plan matches the goals
  const [trayOpen, setTrayOpen] = useState(false);
  const [bursts, setBursts] = useState<Record<string, number>>({});
  // finished phases fold up; a tap reopens one for review
  const [openPhases, setOpenPhases] = useState<Set<number>>(new Set());
  const [viewing, setViewing] = useState<string | null>(null);
  // "Plan how to get it" on a pal card lands here — keep a one-tap way back
  // to that exact card so the player never re-scrolls the Paldex for it
  const [fromCard, setFromCard] = useState<string | null>(null);
  useEffect(() => {
    const apply = () => {
      const p = takeIntentPayload('plan');
      if (p?.fromCard) setFromCard(p.fromCard);
      // no target syncing here: the goal list lives in the store now, so a
      // card's "Plan how to get it" lands in the chips through the same
      // draft the screen reads — no timing hacks, nothing to overwrite
    };
    apply();
    return onNavIntent((i) => {
      if (i.tab === 'plan') apply();
    });
  }, []);

  const box = getBox();
  const ownedNames = Object.keys(box);
  const plan = saved;

  /** Planning replaces the current plan — when one is mid-flight with real
   * progress and DIFFERENT goals, ask first (self-found queue item). */
  const confirmRun = () => {
    if (plan && plan.steps.length > 0
      && done < plan.steps.length
      && [...targets].sort().join() !== [...plan.targets].sort().join()) {
      setManaging('replace');
      return;
    }
    run();
  };

  const run = () => {
    setManaging('none');
    setBusy(true);
    setPlanError(null);
    // yield one frame so the spinner paints, then compute on the JS thread
    setTimeout(() => {
      try {
        // one shared derivations pass: plan AND its recommendations arrive
        // together — and it's the same cached pass the suggestions sheet
        // already paid for, so planning after browsing is near-instant
        const derivs = cachedDerivations(engine, ownedNames);
        const { steps, unreachable } = planFor(engine, ownedNames, targets, derivs);
        const advice = helperAdvice(
          engine, ownedNames, ownedAny,
          { targets, steps, roster: ownedNames }, derivs);
        savePlan({
          targets, steps, unreachable, advice, adviceVersion: ADVICE_VERSION,
          planned: new Date().toISOString(), roster: ownedNames,
        });
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (e) {
        setPlanError(String(e instanceof Error ? e.message : e));
      } finally {
        setBusy(false);
      }
    }, 60);
  };

  // gender-aware ready-states: bred intermediates count as either gender
  const stepMeta = useMemo(() => {
    const meta = new Map<string, { ready: boolean; missing: string[]; hint: string | null }>();
    if (!plan) return meta;
    // legacy boolean ticks predate gender recording — treat as both genders;
    // modern ticks wrote real genders into the box, so the box is the truth
    const legacyBred = new Set(
      plan.steps.filter((st) => checks[stepId(st.parents[0], st.parents[1], st.child)] === true)
        .map((st) => st.child),
    );
    const bred = legacyBred;
    const avail = (n: string) => ({
      m: legacyBred.has(n) || hasGender(n, 'm'),
      f: legacyBred.has(n) || hasGender(n, 'f'),
    });
    for (const st of plan.steps) {
      const [a, b] = st.parents;
      const oa = avail(a);
      const ob = avail(b);
      const hasSpecies = (n: string, o: { m: boolean; f: boolean }) =>
        bred.has(n) || ownedAny(n) || o.m || o.f;
      const missing: string[] = [];
      if (!hasSpecies(a, oa)) missing.push(a);
      if (!hasSpecies(b, ob)) missing.push(b);
      let ready = false;
      let hint: string | null = null;
      if (!missing.length) {
        if (st.genderNote) {
          const parsed = parseGenderNote(st.genderNote);
          ready = parsed?.mother === a ? oa.f && ob.m : oa.m && ob.f;
        } else if (a === b) {
          ready = oa.m && oa.f;
        } else {
          ready = (oa.m && ob.f) || (oa.f && ob.m);
        }
        if (!ready) {
          // name the exact ♂/♀ that unlocks this step — never jargon
          const combos: string[][] = [];
          if (st.genderNote) {
            const parsed = parseGenderNote(st.genderNote);
            const motherIsA = parsed?.mother === a;
            const need: string[] = [];
            if (motherIsA) {
              if (!oa.f) need.push(`♀ ${a}`);
              if (!ob.m) need.push(`♂ ${b}`);
            } else {
              if (!ob.f) need.push(`♀ ${b}`);
              if (!oa.m) need.push(`♂ ${a}`);
            }
            combos.push(need);
          } else if (a === b) {
            const need: string[] = [];
            if (!oa.m) need.push(`♂ ${a}`);
            if (!oa.f) need.push(`♀ ${a}`);
            combos.push(need);
          } else {
            const n1: string[] = [];
            if (!oa.m) n1.push(`♂ ${a}`);
            if (!ob.f) n1.push(`♀ ${b}`);
            const n2: string[] = [];
            if (!oa.f) n2.push(`♀ ${a}`);
            if (!ob.m) n2.push(`♂ ${b}`);
            combos.push(n1, n2);
          }
          const real = combos.filter((c) => c.length);
          const min = Math.min(...real.map((c) => c.length));
          const best = real.filter((c) => c.length === min);
          hint = best.length
            ? `need a ${best.map((c) => c.join(' + ')).join(' — or a ')}`
            : null;
        }
      }
      meta.set(stepId(a, b, st.child), { ready, missing, hint });
    }
    return meta;
  }, [plan, checks, box]);

  // Booster-aware ordering v2 (SMART PLANNING queue): not just the helper's
  // final step — its WHOLE subtree (every step feeding it) floats to the
  // top of its phase and says why. Cross-phase moves are impossible (a
  // step's phase is set by when its parents exist), so within-phase order
  // is the honest, real version of "do the accelerator branch first".
  const speedsRest = useMemo(() => {
    const out = new Set<string>();
    if (!plan) return out;
    const stepByChild = new Map(plan.steps.map((st) => [st.child, st] as const));
    const markUp = (child: string): void => {
      const st = stepByChild.get(child);
      if (!st) return;
      const sid = stepId(st.parents[0], st.parents[1], st.child);
      if (out.has(sid)) return;
      out.add(sid);
      markUp(st.parents[0]);
      markUp(st.parents[1]);
    };
    for (const st of plan.steps) if (HELPER_NAMES.has(st.child)) markUp(st.child);
    return out;
  }, [plan]);

  const waves = useMemo(() => {
    if (!plan) return [];
    const byWave = new Map<number, PlanStep[]>();
    for (const st of plan.steps) {
      const list = byWave.get(st.wave) ?? [];
      list.push(st);
      byWave.set(st.wave, list);
    }
    // helper subtrees first inside each phase — they pay off for every
    // later step; the helper's own step leads its branch
    const inLineage = (st: PlanStep): number =>
      Number(speedsRest.has(stepId(st.parents[0], st.parents[1], st.child)));
    for (const [, list] of byWave) {
      list.sort((a, b) =>
        inLineage(b) - inLineage(a)
        || Number(HELPER_NAMES.has(b.child)) - Number(HELPER_NAMES.has(a.child)));
    }
    return [...byWave.entries()].sort((x, y) => x[0] - y[0]);
  }, [plan, speedsRest]);

  const done = plan
    ? plan.steps.filter((st) =>
        tickStateOf(checks[stepId(st.parents[0], st.parents[1], st.child)]) === 'full').length
    : 0;
  const partialCount = plan
    ? plan.steps.filter((st) =>
        tickStateOf(checks[stepId(st.parents[0], st.parents[1], st.child)]) === 'partial').length
    : 0;
  const readyNow = plan
    ? [...stepMeta.entries()].filter(([sid, m]) => m.ready && !checks[sid]).length
    : 0;

  // per-goal progress: how many of the steps each goal depends on are done
  const goalProgress = useMemo(() => {
    if (!plan) return [];
    const byGoal = new Map<string, { total: number; done: number }>();
    for (const st of plan.steps) {
      const isDone = tickStateOf(checks[stepId(st.parents[0], st.parents[1], st.child)]) === 'full';
      for (const g of st.neededBy) {
        const cur = byGoal.get(g) ?? { total: 0, done: 0 };
        cur.total++;
        if (isDone) cur.done++;
        byGoal.set(g, cur);
      }
    }
    return [...byGoal.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((x, y) => (y.done / y.total) - (x.done / x.total) || x.name.localeCompare(y.name));
  }, [plan, checks]);

  const needs = plan ? cakeNeeds(plan.steps.length) : null;
  // advice is computed WITH the plan and stored on it — the card renders in
  // the same frame as the steps. This effect only backfills plans saved
  // before advice existed, once, off the first paint.
  const advice = plan?.advice ?? [];
  useEffect(() => {
    // recompute for plans with no advice at all AND for plans whose advice
    // predates the current contract — a pre-v2 plan would otherwise keep a
    // Chikipi-less card forever (found on the 8085 QA pass, 2026-08-15)
    if (!plan || plan.steps.length === 0
      || (plan.advice && plan.adviceVersion === ADVICE_VERSION)) return;
    const t = setTimeout(() => {
      try {
        savePlan({
          ...plan,
          advice: helperAdvice(engine, Object.keys(getBox()), ownedAny, plan),
          adviceVersion: ADVICE_VERSION,
        });
      } catch (e) {
        console.error('advice backfill failed:', e);
      }
    }, 60);
    return () => clearTimeout(t);
  }, [plan]);
  // one-tap add/remove needs visible feedback the instant the thumb lands
  const [helperBusy, setHelperBusy] = useState<string | null>(null);
  // ownership is checked LIVE at render so a freshly hatched helper flips to
  // covered instantly without paying the planner again
  const covered = advice.filter((a) => a.status === 'covered' || ownedAny(a.helper.name));
  // every RECOMMENDED helper always shows — a hard slice once hid the egg
  // pal entirely (CEO 2026-08-15); only the "your call" tail is capped
  const uncovered = advice.filter((a) => a.status !== 'covered' && !ownedAny(a.helper.name));
  const activeAdvice = [
    ...uncovered.filter((a) => a.recommended || a.status === 'in-plan'),
    ...uncovered.filter((a) => !a.recommended && a.status !== 'in-plan').slice(0, 2),
  ];

  // cake supply checklist — every cake is 5 flour + 8 berries + 7 milk +
  // 8 eggs + 2 honey (verified recipe); the hands-free sources are ranch
  // pals, so "which ingredients does my box already produce?" is the first
  // question a player actually asks. Data-true: scans ranch_produce.
  const cakeSupply = useMemo(() => {
    const wants: { item: string; label: string }[] = [
      { item: 'Egg', label: 'Eggs' },
      { item: 'Milk', label: 'Milk' },
      { item: 'Honey', label: 'Honey' },
      { item: 'Red Berries', label: 'Berries' },
    ];
    // a producer this plan already breeds counts as coming supply — the
    // checklist must never say "need Caprity" while Caprity sits two cards
    // up as a goal of the same plan (hostile-review find, 2026-08-15)
    const bredPhase = new Map<string, number>();
    for (const st of plan?.steps ?? []) {
      if (!bredPhase.has(st.child)) bredPhase.set(st.child, st.wave);
    }
    return wants.map(({ item, label }) => {
      const producers = Object.keys(pals)
        .filter((n) => (pals[n].ranch_produce ?? []).includes(item));
      const ownedProducer = producers.find(ownedAny);
      const planned = producers.find((n) => bredPhase.has(n));
      return {
        label, ownedProducer, best: producers[0],
        planned,
        plannedPhase: planned ? bredPhase.get(planned) : undefined,
      };
    });
    // box changes flow through useAppVersion re-renders
  }, [box, plan]);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <PageHead title="Route Planner"
        sub="Shortest shared breeding tree from your box — shared intermediates counted once, phases run in parallel, gender-aware ready-states." />

      {fromCard && (
        <BackToCardChip name={fromCard}
          onOpen={() => setViewing(fromCard)}
          onDismiss={() => setFromCard(null)} />
      )}

      {ownedNames.length === 0 && (
        <Card style={{ backgroundColor: T.warnSoft, borderColor: T.warn, marginBottom: 12 }}>
          <Text style={[s.body, { color: T.warn }]}>
            Your collection is empty — tick your pals in the Paldex tab first (or import a list there).
          </Text>
        </Card>
      )}

      <View style={[s.wrap, { marginBottom: 10 }]}>
        <Btn small primary label="Suggested goals…" onPress={() => setSuggesting(true)} />
        <Btn small label="+ Add target…" onPress={() => setPicking(true)} />
      </View>

      {/* the goal tray — proper cards with icons and a real remove target,
          folding to one quiet line once the plan matches the goals (CEO:
          "why is it just small text… it should look good and fold away") */}
      {targets.length > 0 && (() => {
        const planned = plan
          && [...targets].sort().join() === [...plan.targets].sort().join();
        if (planned && !trayOpen) {
          return (
            <Pressable
              accessibilityLabel="Show the goals in this plan"
              onPress={() => setTrayOpen(true)}
              style={({ pressed }) => [{
                flexDirection: 'row', alignItems: 'center', gap: 10,
                backgroundColor: T.surface, borderWidth: 1,
                borderColor: pressed ? T.accent : T.line,
                borderRadius: 12, padding: 8, marginBottom: 12,
              }]}
            >
              <View style={{ flexDirection: 'row' }}>
                {targets.slice(0, 5).map((t, i) => (
                  <View key={t} style={{ marginLeft: i ? -10 : 0 }}>
                    <PalIcon name={t} size={26} />
                  </View>
                ))}
              </View>
              <Text style={{ color: T.muted, fontSize: 12.5, fontWeight: '700', flex: 1 }}>
                {targets.length === 1
                  ? '1 goal in this plan — tap to edit'
                  : `${targets.length} goals in this plan — tap to edit`}
              </Text>
              <Icon name="chevron-down" size={16} color={T.faint} />
            </Pressable>
          );
        }
        return (
          <View style={{ gap: 8, marginBottom: 12 }}>
            <View style={s.wrap}>
              {targets.map((t) => {
                const owned = ownedAny(t);
                return (
                  <View key={t} style={{
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    backgroundColor: T.surface2, borderWidth: 1,
                    borderColor: owned ? T.okSoft : T.line,
                    borderRadius: 12, paddingVertical: 5,
                    paddingLeft: 6, paddingRight: 4,
                  }}>
                    <PalIcon name={t} size={28} />
                    <Text style={{
                      color: owned ? T.ok : T.ink, fontSize: 12.5, fontWeight: '700',
                    }}>{t}</Text>
                    {owned && <Icon name="check" size={13} color={T.ok} />}
                    {selfOnly.has(t) && !owned && (
                      <Icon name="alert-outline" size={13} color={T.warn} />
                    )}
                    <Pressable hitSlop={8}
                      accessibilityLabel={`Remove ${t} from the goals`}
                      onPress={() => removeDraftTargets([t])}
                      style={{ padding: 2 }}>
                      <Icon name="close" size={14} color={T.faint} />
                    </Pressable>
                  </View>
                );
              })}
            </View>
            <View style={s.wrap}>
              {targets.length > 1 && (
                <Btn small label="Remove all…" onPress={() => setManaging('removeall')} />
              )}
              {planned && trayOpen && (
                <Btn small label="Fold away" onPress={() => setTrayOpen(false)} />
              )}
            </View>
          </View>
        );
      })()}

      <Btn
        primary
        disabled={!targets.length || !ownedNames.length || busy}
        label={busy ? 'Planning…'
          : targets.length ? `Plan ${targets.length} target${targets.length > 1 ? 's' : ''}`
          : 'Plan targets'}
        onPress={confirmRun}
      />
      {busy && <ActivityIndicator color={T.accent} style={{ marginTop: 14 }} />}

      {planError && (
        <Card style={{ backgroundColor: T.badSoft, borderColor: T.bad, marginTop: 12 }}>
          <Text style={[s.body, { color: T.bad }]}>Planning failed: {planError}</Text>
        </Card>
      )}

      {plan && (
        <>
          <View style={[s.wrap, { marginTop: 16 }]}>
            <View style={s.tile}>
              <Text style={s.tileBig}>{plan.steps.length}</Text>
              <Text style={s.tileLabel}>STEPS</Text>
            </View>
            <View style={s.tile}>
              <Text style={s.tileBig}>{done}<Text style={{ fontSize: 14, color: T.muted }}>/{plan.steps.length}</Text></Text>
              <Text style={s.tileLabel}>DONE</Text>
              {partialCount > 0 && (
                <Text style={{ color: T.warn, fontSize: 10, fontWeight: '800' }}>
                  +{partialCount} half
                </Text>
              )}
            </View>
            <View style={s.tile}>
              <Text style={s.tileBig}>{readyNow}</Text>
              <Text style={s.tileLabel}>READY NOW</Text>
            </View>
          </View>
          <View style={[s.wrap, { marginTop: 8, alignItems: 'center' }]}>
            <Text style={[s.body, { fontSize: 12 }]}>
              {plannedWhen(plan.planned)}
            </Text>
            <Btn small label="Start over" onPress={() => setManaging('reset')} />
            <Btn small danger label="Clear plan" onPress={() => setManaging('clear')} />
          </View>

          {plan.unreachable.length > 0 && (
            <Card style={{ backgroundColor: T.warnSoft, borderColor: T.warn, marginTop: 12 }}>
              <Text style={[s.body, { color: T.warn }]}>
                Not reachable from your box: {plan.unreachable.join(', ')}
              </Text>
            </Card>
          )}

          {goalProgress.length > 0 && (
            <Card style={{ marginTop: 12 }}>
              <Text style={s.h3}>Goal progress</Text>
              <View style={{ marginTop: 8, gap: 7 }}>
                {goalProgress.map((g) => {
                  const complete = g.done === g.total;
                  return (
                    <View key={g.name} style={[s.row, { gap: 8 }]}>
                      <Pressable onPress={() => setViewing(g.name)} hitSlop={4}>
                        <PalIcon name={g.name} size={26} />
                      </Pressable>
                      <Text style={{
                        color: T.ink, fontWeight: '700', fontSize: 14, width: 132,
                      }} numberOfLines={1}>{g.name}</Text>
                      <View style={{
                        flex: 1, height: 8, borderRadius: 4, backgroundColor: T.surface2,
                      }}>
                        <View style={{
                          width: `${(g.done / g.total) * 100}%`, height: '100%',
                          borderRadius: 4, backgroundColor: complete ? T.ok : T.accent,
                        }} />
                      </View>
                      <Text style={{
                        color: T.muted, fontSize: 11.5, fontWeight: '700', width: 38,
                        textAlign: 'right',
                      }}>{g.done}/{g.total}</Text>
                    </View>
                  );
                })}
              </View>
            </Card>
          )}

          {plan!.steps.length === 0 && plan!.unreachable.length === 0 && (
            <Card style={{ marginTop: 12 }}>
              <Text style={s.h3}>Nothing left to breed</Text>
              <Text style={[s.body, { marginTop: 4 }]}>
                Every goal in this plan is already in your Paldex. Add another
                target above, or clear the plan.
              </Text>
            </Card>
          )}

          {needs && plan!.steps.length > 0 && (
            <Card style={{ marginTop: 12, gap: 10 }}>
              <Text style={s.h3}>Make it faster</Text>
              <Text style={[s.body, { fontSize: 12.5 }]}>
                {plan!.steps.length} {plan!.steps.length === 1 ? 'step' : 'steps'} means
                at least {needs.cakes} {needs.cakes === 1 ? 'cake' : 'cakes'}:
                {' '}~{needs.flour} flour · {needs.berries} berries · {needs.milk} milk
                · {needs.eggs} eggs · {needs.honey} honey.
              </Text>
              {/* the first question a player asks: which of those can my
                  ranch already make? */}
              <View style={[s.wrap]}>
                {cakeSupply.map((c) => (
                  <Pressable key={c.label} disabled={!!c.ownedProducer}
                    onPress={() => {
                      const show = c.ownedProducer ?? c.planned ?? c.best;
                      if (show) setViewing(show);
                    }}>
                    <Badge kind={c.ownedProducer ? 'ok' : c.planned ? 'plain' : 'warn'}>
                      {c.ownedProducer
                        ? `${c.label} ✓ ${c.ownedProducer}`
                        : c.planned
                          ? `${c.label} — ${c.planned} hatches in Phase ${c.plannedPhase}`
                          : `${c.label}: need ${c.best ?? '?'}`}
                    </Badge>
                  </Pressable>
                ))}
              </View>
              {covered.length > 0 && (
                <View style={[s.wrap]}>
                  {covered.map((a) => (
                    <Badge key={a.helper.name} kind="ok">{a.helper.name} ✓</Badge>
                  ))}
                </View>
              )}
              {activeAdvice.map((a) => {
                const h = a.helper;
                const isTarget = plan!.targets.includes(h.name);
                return (
                  <View key={h.name} style={{
                    borderTopWidth: 1, borderTopColor: T.line, paddingTop: 9, gap: 6,
                  }}>
                    <Pressable style={[s.row, { gap: 9 }]} onPress={() => setViewing(h.name)}>
                      <PalIcon name={h.name} size={30} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: T.ink, fontWeight: '800', fontSize: 13.5 }}>
                          {h.name}
                          {a.status === 'suggest' && a.recommended && (
                            <Text style={{ color: T.goldInk, fontSize: 10 }}>
                              {'   '}RECOMMENDED
                            </Text>
                          )}
                          {a.status === 'in-plan' && (
                            <Text style={{ color: T.accentInk, fontSize: 10 }}>
                              {'   '}PHASE {a.phase}
                            </Text>
                          )}
                        </Text>
                        <Text style={{ color: T.muted, fontSize: 11.5 }}>{h.effect}</Text>
                      </View>
                    </Pressable>
                    <Text style={[s.body, { fontSize: 12 }]}>{a.note}</Text>
                    {a.status === 'suggest' && (a.catchOnly || (a.addSteps ?? 0) >= 4)
                      && pals[h.name]?.wild && pals[h.name].regions.length > 0 && (
                      <Text style={[s.body, { fontSize: 12, color: T.accentInk }]}>
                        {a.catchOnly ? 'Where to catch it: ' : 'Faster to catch one: '}
                        {pals[h.name].regions.slice(0, 2).join(' · ')}
                        {wildLevelRange(h.name)
                          ? ` (${wildLevelRange(h.name)})`
                          : pals[h.name].max_wild_level
                            ? ` (up to Lv ${pals[h.name].max_wild_level})` : ''}
                      </Text>
                    )}
                    {a.status === 'suggest' && !a.catchOnly && !isTarget && (
                      <View style={[s.wrap]}>
                        <Btn small primary={a.recommended}
                          disabled={helperBusy != null}
                          label={helperBusy === h.name
                            ? 'Adding…'
                            : a.addSteps === 0
                              ? 'Add to plan · free'
                              : `Add to plan · +${a.addSteps} step${a.addSteps === 1 ? '' : 's'}`}
                          onPress={() => {
                            // react NOW, compute a beat later so the busy
                            // label paints before the planner runs
                            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                            setHelperBusy(h.name);
                            setTimeout(() => {
                              addPlanTarget(h.name); // draft syncs in the store
                              setHelperBusy(null);
                            }, 30);
                          }} />
                      </View>
                    )}
                    {isTarget && plan!.targets.length > 1 && (
                      <View style={[s.wrap]}>
                        <Btn small disabled={helperBusy != null}
                          label={helperBusy === h.name ? 'Removing…' : 'Remove from plan'}
                          onPress={() => {
                            void Haptics.selectionAsync();
                            setHelperBusy(h.name);
                            setTimeout(() => {
                              removePlanTarget(h.name); // draft syncs in the store
                              setHelperBusy(null);
                            }, 30);
                          }} />
                      </View>
                    )}
                  </View>
                );
              })}
              <Text style={[s.body, { fontSize: 11, color: T.faint }]}>
                All effects are the game's own partner-skill data. Adding or removing
                reshapes the plan — steps you've ticked stay ticked.
              </Text>
            </Card>
          )}

          {waves.map(([wave, steps]) => {
            // a finished phase folds into one quiet line — scrolling past
            // walls of struck-through cards to find the work is busywork
            const allDone = steps.every((st) =>
              tickStateOf(checks[stepId(st.parents[0], st.parents[1], st.child)]) === 'full');
            // one badge per phase, on the FIRST unfinished helper-branch
            // step — the sort already floats the branch, the badge says why
            const leadHelperSid = steps
              .map((st) => stepId(st.parents[0], st.parents[1], st.child))
              .find((x) => speedsRest.has(x) && tickStateOf(checks[x]) !== 'full');
            if (allDone && !openPhases.has(wave)) {
              return (
                <Pressable key={wave}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setOpenPhases((prev) => new Set(prev).add(wave));
                  }}
                  style={({ pressed }) => [{
                    marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 8,
                    backgroundColor: T.surface, borderColor: T.okSoft, borderWidth: 1,
                    borderRadius: 12, padding: 12, opacity: pressed ? 0.8 : 0.75,
                  }]}
                >
                  <Text style={{ color: T.ok, fontWeight: '800', fontSize: 13.5, flex: 1 }}>
                    Phase {wave} complete
                  </Text>
                  <Text style={{ color: T.muted, fontSize: 12, fontWeight: '700' }}>
                    {steps.length} {steps.length === 1 ? 'step' : 'steps'} · tap to show
                  </Text>
                </Pressable>
              );
            }
            return (
            <View key={wave} style={{ marginTop: 18 }}>
              <Text style={[s.h3, { marginBottom: 8 }]}>
                Phase {wave}{' '}
                <Text style={{ color: T.muted, fontWeight: '600', fontSize: 12.5 }}>
                  {allDone ? '· complete' : '· everything here can run in parallel'}
                </Text>
              </Text>
              <View style={{ gap: 8 }}>
                {steps.map((st) => {
                  const sid = stepId(st.parents[0], st.parents[1], st.child);
                  const m = stepMeta.get(sid)!;
                  const tick = tickStateOf(checks[sid]);
                  const checked = tick === 'full';
                  const partial = tick === 'partial';
                  const mother = st.genderNote ? parseGenderNote(st.genderNote)?.mother : undefined;
                  return (
                    <Card key={sid} style={{
                      padding: 14, gap: 10, opacity: checked ? 0.55 : 1,
                      borderLeftWidth: 4,
                      borderLeftColor: checked ? T.line
                        : partial ? T.warn
                        : m.ready ? T.ok : T.line,
                    }}>
                      {/* parents — ONE row always: each parent is a
                          shrinkable icon+name cell, names auto-fit instead
                          of wrapping (CEO callout 2026-08-15) */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <AnimatedCheck state={tick} glyph={partialGlyph(checks[sid])}
                          label={`Done: ${st.parents[0]} + ${st.parents[1]} = ${st.child}`}
                          onPress={() => {
                            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            if (tick === 'full') uncheckStep(sid, st.child);
                            else setHatching({ sid, child: st.child });
                          }} />
                        <Pressable onPress={() => setViewing(st.parents[0])} hitSlop={4}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
                          <PalIcon name={st.parents[0]} size={38}
                            gender={st.genderNote ? (mother === st.parents[0] ? 'f' : 'm') : undefined} />
                          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}
                            style={{
                              color: T.ink, fontWeight: '700', fontSize: 15.5, flexShrink: 1,
                              textDecorationLine: checked ? 'line-through' : 'none',
                            }}>{st.parents[0]}</Text>
                        </Pressable>
                        <Text style={{ color: T.faint, fontWeight: '800', fontSize: 15 }}>+</Text>
                        <Pressable onPress={() => setViewing(st.parents[1])} hitSlop={4}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
                          <PalIcon name={st.parents[1]} size={38}
                            gender={st.genderNote ? (mother === st.parents[1] ? 'f' : 'm') : undefined} />
                          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}
                            style={{
                              color: T.ink, fontWeight: '700', fontSize: 15.5, flexShrink: 1,
                              textDecorationLine: checked ? 'line-through' : 'none',
                            }}>{st.parents[1]}</Text>
                        </Pressable>
                      </View>
                      {/* result — the hero line */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 36 }}>
                        <Text style={{ color: T.accent, fontWeight: '800', fontSize: 18 }}>→</Text>
                        <Pressable onPress={() => setViewing(st.child)} hitSlop={4}>
                          <PalIcon name={st.child} size={46} />
                          <HatchBurst burstKey={bursts[sid] ?? 0}
                            rarity={(pals[st.child]?.rarity ?? 'Common') as Rarity} />
                        </Pressable>
                        <Text style={{
                          color: T.accentInk, fontWeight: '800', fontSize: 19, flexShrink: 1,
                          textDecorationLine: checked ? 'line-through' : 'none',
                        }}>{st.child}</Text>
                      </View>
                      <View style={[s.wrap]}>
                        {st.isTarget && <Badge kind="gold">Goal</Badge>}
                        {sid === leadHelperSid && (
                          <Badge kind="plain">helper branch — do this first</Badge>
                        )}
                        {st.kind === 'unique' && <Badge kind="unique">fixed recipe</Badge>}
                        {st.kind === 'gendered' && <Badge kind="warn">gender locked</Badge>}
                        {st.reusedAsParent >= 2 && (
                          <Badge kind="plain">keep ♂+♀ — parent in {st.reusedAsParent} steps</Badge>
                        )}
                        {partial && (
                          <Badge kind="warn">half done — missing the {partialGlyph(checks[sid]) === '♂' ? '♀' : '♂'}</Badge>
                        )}
                        {!checked && !partial && (m.ready
                          ? <Badge kind="ok">✓ ready to breed</Badge>
                          : m.hint
                            ? <Badge kind="warn">{m.hint}</Badge>
                            : <Badge kind="plain">waiting on {m.missing.join(' + ')}</Badge>)}
                      </View>
                      {/* the result's full work suitabilities — always its own row */}
                      <View style={[s.wrap, { paddingLeft: 36 }]}>
                        <WorkChips name={st.child} all />
                      </View>
                    </Card>
                  );
                })}
              </View>
            </View>
            );
          })}
        </>
      )}

      {viewing && <PalDetail name={viewing} onClose={() => setViewing(null)} />}

      {hatching && (
        <HatchSheet child={hatching.child} sid={hatching.sid}
          have={(() => {
            const c = checks[hatching.sid];
            return c && c !== true ? { m: c.m, f: c.f } : undefined;
          })()}
          onClose={() => {
            const c = getChecks()[hatching.sid];
            if (tickStateOf(c) !== 'none') {
              setBursts((b) => ({ ...b, [hatching.sid]: (b[hatching.sid] ?? 0) + 1 }));
            }
            setHatching(null);
          }} />
      )}

      {managing !== 'none' && (
        <Modal visible transparent animationType="fade"
          onRequestClose={() => setManaging('none')}>
          <View style={{
            flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
            alignItems: 'center', justifyContent: 'center', padding: 28,
          }}>
            <Card style={{ width: '100%', borderColor: managing === 'clear' ? T.bad : T.line }}>
              <Text style={s.h2}>
                {managing === 'reset' ? 'Start this plan over?'
                  : managing === 'replace' ? 'Replace the current plan?'
                  : managing === 'removeall' ? 'Remove all goals?'
                  : 'Clear the plan?'}
              </Text>
              <Text style={[s.body, { marginTop: 6 }]}>
                {managing === 'reset'
                  ? 'Every tick is undone properly — pals that ticks registered are removed from your Paldex again; anything you owned before stays.'
                  : managing === 'replace'
                    ? `Your current plan still has unfinished steps (${done} of ${plan?.steps.length ?? 0} done). Planning these goals builds a fresh route — finished steps whose pals you hatched stay yours, but the old route is gone.`
                    : managing === 'removeall'
                      ? 'Empties your goal list so you can pick fresh. Your current plan and its progress stay until you press Plan again.'
                      : 'Forgets the plan and its ticks so you can plan fresh. Your collection stays exactly as it is — hatched pals are still yours.'}
              </Text>
              <View style={[s.wrap, { marginTop: 14 }]}>
                <Btn danger={managing === 'clear'}
                  primary={managing === 'reset' || managing === 'replace'}
                  label={managing === 'reset' ? 'Start over'
                    : managing === 'replace' ? 'Plan the new goals'
                    : managing === 'removeall' ? 'Remove all goals'
                    : 'Clear plan'}
                  onPress={() => {
                    if (managing === 'reset') { resetPlanProgress(); setManaging('none'); }
                    else if (managing === 'replace') run();
                    else if (managing === 'removeall') { clearDraftTargets(); setManaging('none'); }
                    else { clearPlan(); setManaging('none'); }
                  }} />
                <Btn label="Cancel" onPress={() => setManaging('none')} />
              </View>
            </Card>
          </View>
        </Modal>
      )}

      <PalPicker
        visible={picking}
        onClose={() => setPicking(false)}
        title="Add a target"
        exclude={new Set(targets)}
        onPick={(n) => addDraftTargets([n])}
      />
      <SuggestedGoals
        visible={suggesting}
        onClose={() => setSuggesting(false)}
        targets={targets}
        onAdd={(names) => {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          addDraftTargets(names);
        }}
        onRemove={(names) => {
          void Haptics.selectionAsync();
          removeDraftTargets(names);
        }}
      />
    </ScrollView>
  );
}
