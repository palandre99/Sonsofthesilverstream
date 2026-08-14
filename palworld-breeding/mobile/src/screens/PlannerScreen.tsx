/** Route Planner — shortest shared breeding tree from your box, on-device. */
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { T } from '../theme';
import {
  Badge, Btn, Card, PageHead, PalIcon, PalPicker, WorkChips, s,
} from '../ui/kit';
import {
  getBox, getChecks, getPlan, hasGender, ownedAny, savePlan, selfOnly,
  toggleCheck, useAppVersion, engine,
} from '../store';
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

function Check({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <Text
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onToggle();
      }}
      style={{
        width: 26, height: 26, borderRadius: 8, borderWidth: 2,
        borderColor: on ? T.ok : T.line2, backgroundColor: on ? T.ok : T.surface2,
        color: '#fff', textAlign: 'center', lineHeight: 22, fontWeight: '800',
        overflow: 'hidden',
      }}
    >{on ? '✓' : ' '}</Text>
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
    const bred = new Set(
      plan.steps.filter((st) => checks[stepId(st.parents[0], st.parents[1], st.child)])
        .map((st) => st.child),
    );
    const avail = (n: string) => bred.has(n)
      ? { m: true, f: true }
      : { m: hasGender(n, 'm'), f: hasGender(n, 'f') };
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
    ? plan.steps.filter((st) => checks[stepId(st.parents[0], st.parents[1], st.child)]).length
    : 0;
  const readyNow = plan
    ? [...stepMeta.entries()].filter(([sid, m]) => m.ready && !checks[sid]).length
    : 0;

  // per-goal progress: how many of the steps each goal depends on are done
  const goalProgress = useMemo(() => {
    if (!plan) return [];
    const byGoal = new Map<string, { total: number; done: number }>();
    for (const st of plan.steps) {
      const isDone = !!checks[stepId(st.parents[0], st.parents[1], st.child)];
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
        label={busy ? 'Planning…' : `Plan ${targets.length || ''} targets`}
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
              <Text style={s.tileBig}>{done}/{plan.steps.length}</Text>
              <Text style={s.tileLabel}>DONE</Text>
            </View>
            <View style={s.tile}>
              <Text style={s.tileBig}>{readyNow}</Text>
              <Text style={s.tileLabel}>READY NOW</Text>
            </View>
          </View>
          <Text style={[s.body, { marginTop: 6, fontSize: 12 }]}>
            planned {plan.planned.slice(0, 10)} — re-plan after box changes
          </Text>

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
                      <PalIcon name={g.name} size={26} />
                      <Text style={{
                        color: T.ink, fontWeight: '700', fontSize: 12.5, width: 118,
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
                  const checked = !!checks[sid];
                  const mother = st.genderNote ? parseGenderNote(st.genderNote)?.mother : undefined;
                  return (
                    <Card key={sid} style={{
                      padding: 10, opacity: checked ? 0.55 : 1,
                      borderLeftWidth: 4,
                      borderLeftColor: checked ? T.line : m.ready ? T.ok : T.line,
                    }}>
                      <View style={[s.row, { gap: 8 }]}>
                        <Check on={checked} onToggle={() => toggleCheck(sid)} />
                        <PalIcon name={st.parents[0]} size={32}
                          gender={st.genderNote ? (mother === st.parents[0] ? 'f' : 'm') : undefined} />
                        <PalIcon name={st.parents[1]} size={32}
                          gender={st.genderNote ? (mother === st.parents[1] ? 'f' : 'm') : undefined} />
                        <Text style={{
                          color: T.ink, fontWeight: '700', fontSize: 13, flex: 1,
                          textDecorationLine: checked ? 'line-through' : 'none',
                        }}>
                          {st.parents[0]} + {st.parents[1]}
                          {'\n'}<Text style={{ color: T.accentInk }}>= {st.child}</Text>
                        </Text>
                        <PalIcon name={st.child} size={38} />
                      </View>
                      <View style={[s.wrap, { marginTop: 7 }]}>
                        {st.isTarget && <Badge kind="gold">Goal</Badge>}
                        {st.kind === 'unique' && <Badge kind="unique">unique</Badge>}
                        {st.kind === 'gendered' && <Badge kind="warn">gender locked</Badge>}
                        {st.tieBreak && <Badge kind="warn">tie-break</Badge>}
                        {st.reusedAsParent >= 2 && (
                          <Badge kind="plain">keep ♂+♀ — parent in {st.reusedAsParent} steps</Badge>
                        )}
                        {!checked && (m.ready
                          ? <Badge kind="ok">ready now</Badge>
                          : <Badge kind="plain">waiting for {m.missing.join(' + ')}</Badge>)}
                        <WorkChips name={st.child} top={1} />
                      </View>
                    </Card>
                  );
                })}
              </View>
            </View>
          ))}
        </>
      )}

      <PalPicker
        visible={picking}
        onClose={() => setPicking(false)}
        title="Add a target"
        onPick={(n) => {
          if (!targets.includes(n)) setTargets([...targets, n]);
        }}
      />
    </ScrollView>
  );
}
