/** Route Planner — shortest shared breeding tree from your box, on-device. */
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { AnimatedCheck, HatchBurst, type Rarity, type TickState } from '../ui/celebrate';
import { PalDetail } from '../ui/PalDetail';
import { T } from '../theme';
import {
  Badge, Btn, Card, PageHead, PalIcon, PalPicker, WorkChips, s,
} from '../ui/kit';
import {
  clearPlan, completeStep, getBox, getChecks, getPlan, hasGender, ownedAny,
  pals, resetPlanProgress, savePlan, selfOnly, uncheckStep, useAppVersion,
  engine,
} from '../store';

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
import { parseGenderNote } from '../engine/formula';
import type { PlanStep } from '../engine/types';

const PRESETS: Record<string, { label: string; targets: string[] }> = {
  workers: {
    label: 'Best workers',
    targets: ['Solenne', 'Celesdir Noct', 'Renjishi', 'Knocklem', 'Starryon Primo',
      'Ophydia', 'Anubis', 'Astegon', 'Blazamut', 'Sibelyx Primo', 'Venusa', 'Mycora',
      'Univolt Cryst', 'Whalaska Ignis', 'Solmora Lux'],
  },
  aura: {
    label: 'All aura pals',
    targets: ['Ribbuny', 'Cinnamoth', 'Clovee', 'Petallia', 'Tetroise', 'Wumpo',
      'Amione', 'Eikthyrdeer Terra', 'Katress Ignis', 'Mycora', 'Puffolt', 'Smokie Cryst'],
  },
  support: {
    label: 'Breeding support',
    targets: ['Braloha', 'Dynamoff', 'Lullu', 'Prunelia', 'Sekhmet'],
  },
};

// (tick rendering lives in ui/celebrate.tsx — AnimatedCheck)

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
  const [targets, setTargets] = useState<string[]>(saved?.targets ?? []);
  const [busy, setBusy] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [hatching, setHatching] = useState<{ sid: string; child: string } | null>(null);
  const [managing, setManaging] = useState<'none' | 'reset' | 'clear'>('none');
  const [bursts, setBursts] = useState<Record<string, number>>({});
  const [viewing, setViewing] = useState<string | null>(null);

  const box = getBox();
  const ownedNames = Object.keys(box);
  const plan = saved;

  const run = () => {
    setBusy(true);
    setPlanError(null);
    // yield one frame so the spinner paints, then compute on the JS thread
    setTimeout(() => {
      try {
        const { steps, unreachable } = planFor(engine, ownedNames, targets);
        savePlan({ targets, steps, unreachable, planned: new Date().toISOString() });
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
    const meta = new Map<string, { ready: boolean; missing: string[] }>();
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
      if (!missing.length) {
        if (st.genderNote) {
          const parsed = parseGenderNote(st.genderNote);
          ready = parsed?.mother === a ? oa.f && ob.m : oa.m && ob.f;
        } else if (a === b) {
          ready = oa.m && oa.f;
        } else {
          ready = (oa.m && ob.f) || (oa.f && ob.m);
        }
        if (!ready) missing.push('a working ♂/♀ combo');
      }
      meta.set(stepId(a, b, st.child), { ready, missing });
    }
    return meta;
  }, [plan, checks, box]);

  const waves = useMemo(() => {
    if (!plan) return [];
    const byWave = new Map<number, PlanStep[]>();
    for (const st of plan.steps) {
      const list = byWave.get(st.wave) ?? [];
      list.push(st);
      byWave.set(st.wave, list);
    }
    return [...byWave.entries()].sort((x, y) => x[0] - y[0]);
  }, [plan]);

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

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <PageHead title="Route Planner"
        sub="Shortest shared breeding tree from your box — shared intermediates counted once, phases run in parallel, gender-aware ready-states." />

      {ownedNames.length === 0 && (
        <Card style={{ backgroundColor: T.warnSoft, borderColor: T.warn, marginBottom: 12 }}>
          <Text style={[s.body, { color: T.warn }]}>
            Your collection is empty — tick your pals in the Paldex tab first (or import a list there).
          </Text>
        </Card>
      )}

      <View style={[s.wrap, { marginBottom: 10 }]}>
        {Object.entries(PRESETS).map(([key, p]) => (
          <Btn key={key} small label={`+ ${p.label}`}
            onPress={() => setTargets([...new Set([...targets, ...p.targets])])} />
        ))}
        <Btn small label="+ Add target…" onPress={() => setPicking(true)} />
      </View>

      {targets.length > 0 && (
        <View style={[s.wrap, { marginBottom: 12 }]}>
          {targets.map((t) => (
            <Text
              key={t}
              onPress={() => setTargets(targets.filter((x) => x !== t))}
              style={{
                color: ownedAny(t) ? T.ok : T.ink, backgroundColor: T.surface2,
                borderRadius: 16, paddingHorizontal: 11, paddingVertical: 5,
                fontSize: 12.5, fontWeight: '700', overflow: 'hidden',
              }}
            >
              {t}{ownedAny(t) ? ' ✓' : ''}{selfOnly.has(t) && !ownedAny(t) ? ' ⛔' : ''}  ✕
            </Text>
          ))}
        </View>
      )}

      <Btn
        primary
        disabled={!targets.length || !ownedNames.length || busy}
        label={busy ? 'Planning…'
          : targets.length ? `Plan ${targets.length} target${targets.length > 1 ? 's' : ''}`
          : 'Plan targets'}
        onPress={run}
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
              planned {plan.planned.slice(0, 10)}
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

          {waves.map(([wave, steps]) => (
            <View key={wave} style={{ marginTop: 18 }}>
              <Text style={[s.h3, { marginBottom: 8 }]}>
                Phase {wave}{' '}
                <Text style={{ color: T.muted, fontWeight: '600', fontSize: 12.5 }}>
                  · everything here can run in parallel
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
                      {/* parents */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <AnimatedCheck state={tick} glyph={partialGlyph(checks[sid])}
                          onPress={() => {
                            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            if (tick === 'full') uncheckStep(sid, st.child);
                            else setHatching({ sid, child: st.child });
                          }} />
                        <Pressable onPress={() => setViewing(st.parents[0])} hitSlop={4}>
                          <PalIcon name={st.parents[0]} size={38}
                            gender={st.genderNote ? (mother === st.parents[0] ? 'f' : 'm') : undefined} />
                        </Pressable>
                        <Text style={{
                          color: T.ink, fontWeight: '700', fontSize: 15.5, flexShrink: 1,
                          textDecorationLine: checked ? 'line-through' : 'none',
                        }}>{st.parents[0]}</Text>
                        <Text style={{ color: T.faint, fontWeight: '800', fontSize: 15 }}>+</Text>
                        <Pressable onPress={() => setViewing(st.parents[1])} hitSlop={4}>
                          <PalIcon name={st.parents[1]} size={38}
                            gender={st.genderNote ? (mother === st.parents[1] ? 'f' : 'm') : undefined} />
                        </Pressable>
                        <Text style={{
                          color: T.ink, fontWeight: '700', fontSize: 15.5, flexShrink: 1,
                          textDecorationLine: checked ? 'line-through' : 'none',
                        }}>{st.parents[1]}</Text>
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
                        {st.kind === 'unique' && <Badge kind="unique">fixed recipe</Badge>}
                        {st.kind === 'gendered' && <Badge kind="warn">gender locked</Badge>}
                        {st.reusedAsParent >= 2 && (
                          <Badge kind="plain">keep ♂+♀ — parent in {st.reusedAsParent} steps</Badge>
                        )}
                        {partial && (
                          <Badge kind="warn">half done — missing the {partialGlyph(checks[sid]) === '♂' ? '♀' : '♂'}</Badge>
                        )}
                        {!checked && !partial && (m.ready
                          ? <Badge kind="ok">ready now</Badge>
                          : <Badge kind="plain">waiting for {m.missing.join(' + ')}</Badge>)}
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
          ))}
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
                {managing === 'reset' ? 'Start this plan over?' : 'Clear the plan?'}
              </Text>
              <Text style={[s.body, { marginTop: 6 }]}>
                {managing === 'reset'
                  ? 'Every tick is undone properly — pals that ticks registered are removed from your Paldex again; anything you owned before stays.'
                  : 'Forgets the plan and its ticks so you can plan fresh. Your collection stays exactly as it is — hatched pals are still yours.'}
              </Text>
              <View style={[s.wrap, { marginTop: 14 }]}>
                <Btn danger={managing === 'clear'} primary={managing === 'reset'}
                  label={managing === 'reset' ? 'Start over' : 'Clear plan'}
                  onPress={() => {
                    if (managing === 'reset') resetPlanProgress();
                    else clearPlan();
                    setManaging('none');
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
        onPick={(n) => {
          if (!targets.includes(n)) setTargets([...targets, n]);
        }}
      />
    </ScrollView>
  );
}
