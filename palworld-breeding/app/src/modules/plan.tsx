/** Route Planner — multi-target shortest shared breeding tree from your box,
 * gender-aware: a step only counts as "ready" when you actually have a working
 * male/female combination (bred intermediates can be rebred to either gender,
 * so they count as both — that's what the keep-both-genders warnings are for).
 * Planning runs in a Web Worker; targets, results and check-offs persist. */
import { useEffect, useMemo, useState } from 'preact/hooks';
import {
  addDraftTargets, box, clearDraftTargets, draftTargets, hasGender, nav,
  ownedAny, pals, removeDraftTargets, selfOnly, setOwnedGender, storage,
} from '../state';
import { GenderToggles, LockBadge, PalIcon, PalPicker, WorkChips } from '../components/shared';
import { GoalsSheet } from '../components/goals';
import { stepId } from '../engine/planner';
import { parseGenderNote } from '../engine/formula';
import { requestPlan } from '../engine/planClient';
import { cakeNeeds } from '../engine/boosters';
import { expectedEggs } from '../logic/economics';
import { maleProb } from '../data/genderRatio.g';
import { ADVICE_VERSION, HELPER_NAMES, type HelperAdvice } from '../engine/helpers';
import { wildLevelRange } from '../data/rarity';
import type { PlanStep } from '../engine/types';

const CHECKS_KEY = 'hatchlab-plan-checks-v1';
const PLAN_KEY = 'hatchlab-plan-v1';

/** A completed step records WHICH genders hatched and registers the child in
 * the collection at the same moment — one tick, no double entry. It also
 * remembers what it ADDED so unticking removes only that. Legacy `true`
 * values (pre-gender ticks) stay valid. */
export interface StepCheck { m: boolean; f: boolean; addedM: boolean; addedF: boolean }
export type CheckValue = true | StepCheck;

function loadChecks(): Record<string, CheckValue> {
  try { return JSON.parse(storage.get(CHECKS_KEY) || '{}'); } catch { return {}; }
}

/** "just now / today 22:40 / yesterday 09:15 / 12 Aug" — a stamp a player
 * reads at a glance, not a raw ISO date */
function plannedWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const mins = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (mins >= 0 && mins < 2) return 'just now';
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (d.toDateString() === now.toDateString()) return `today ${hm}`;
  const yesterday = new Date(now.getTime() - 86400000);
  if (d.toDateString() === yesterday.toDateString()) return `yesterday ${hm}`;
  return `${d.getDate()} ${d.toLocaleString(undefined, { month: 'short' })}`;
}

/** none / partial (one gender hatched, amber) / full (both, green). */
export function tickStateOf(c: CheckValue | undefined): 'none' | 'partial' | 'full' {
  if (!c) return 'none';
  if (c === true) return 'full';
  return c.m && c.f ? 'full' : 'partial';
}

interface SavedPlan {
  targets: string[];
  steps: PlanStep[];
  unreachable: string[];
  planned: string; // ISO date
  /** the box at plan time — reshapes re-plan against THIS so finished
   * steps (and their ticks) survive; absent on old saves */
  roster?: string[];
  /** helper recommendations, computed with the plan so the card renders
   * together with the steps */
  advice?: HelperAdvice[];
  /** contract version of `advice` — mismatch triggers a recompute */
  adviceVersion?: number;
}

function loadSaved(): SavedPlan | null {
  try {
    const raw = storage.get(PLAN_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as SavedPlan;
    return Array.isArray(p.targets) && Array.isArray(p.steps) ? p : null;
  } catch { return null; }
}

// seed the shared goal list from the saved plan ONCE per session — page
// remounts must never resurrect goals the player removed
draftTargets.value = loadSaved()?.targets ?? [];

export function PlanPage() {
  const saved = useMemo(loadSaved, []);
  // the goal list is shared state (state.ts draftTargets) — the sheet, the
  // picker, the chips and the advice card all edit the same list
  const targets = draftTargets.value;
  const [plan, setPlan] = useState<{ steps: PlanStep[]; unreachable: string[] } | null>(
    saved ? { steps: saved.steps, unreachable: saved.unreachable } : null,
  );
  const [busy, setBusy] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planMs, setPlanMs] = useState<number | null>(null);
  const [plannedAt, setPlannedAt] = useState<string | null>(saved?.planned ?? null);
  const [checks, setChecks] = useState<Record<string, CheckValue>>(loadChecks());
  const [hatching, setHatching] = useState<{ sid: string; child: string } | null>(null);
  const [goalsOpen, setGoalsOpen] = useState(false);
  // Escape closes the hatch dialog — click-away already works, the keyboard
  // path was missing (self-found queue item)
  useEffect(() => {
    if (!hatching) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setHatching(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hatching]);
  const [managing, setManaging] = useState<'none' | 'reset' | 'clear' | 'removeall'>('none');
  // the goal tray folds to one line once the plan matches the goals
  const [trayOpen, setTrayOpen] = useState(false);
  // the goals the current plan was computed for (draft may drift from it)
  const [planTargets, setPlanTargets] = useState<string[]>(saved?.targets ?? []);
  // the box the current plan was computed against — reshapes reuse it so
  // finished steps (and their ticks) survive
  const [planRoster, setPlanRoster] = useState<string[] | undefined>(saved?.roster);

  const ownedNames = Object.keys(box.value);

  const addTarget = (n: string) => addDraftTargets([n]);

  const run = (list: string[] = targets, roster: string[] = ownedNames) => {
    setBusy(true);
    setPlanError(null);
    requestPlan(roster, list, ownedNames)
      .then((r) => {
        setPlan({ steps: r.steps, unreachable: r.unreachable });
        setAdvice(r.advice);
        setPlanMs(r.ms);
        setPlannedAt(new Date().toISOString());
        setPlanRoster(roster);
        setPlanTargets(list);
        draftTargets.value = list; // the planned goals ARE the draft now
        // best-effort persist — a quota failure must not read as a plan failure
        storage.set(PLAN_KEY, JSON.stringify({
          targets: list, steps: r.steps, unreachable: r.unreachable,
          planned: new Date().toISOString(), roster, advice: r.advice,
          adviceVersion: ADVICE_VERSION,
        } satisfies SavedPlan));
      })
      .catch((e) => setPlanError(String(e instanceof Error ? e.message : e)))
      .finally(() => {
        setBusy(false);
        setHelperBusy(null);
      });
  };

  /** One tap from the advice card: add/remove a helper goal and re-plan
   * AGAINST THE PLAN'S ORIGINAL ROSTER — finished steps keep their ticks. */
  const [helperBusy, setHelperBusy] = useState<string | null>(null);
  const addHelper = (n: string) => {
    if (targets.includes(n)) return;
    setHelperBusy(n);
    const next = [...targets, n];
    addDraftTargets([n]);
    run(next, planRoster ?? ownedNames);
  };
  const removeHelper = (n: string) => {
    const next = targets.filter((t) => t !== n);
    if (!next.length) return;
    setHelperBusy(n);
    removeDraftTargets([n]);
    run(next, planRoster ?? ownedNames);
  };

  const completeStep = (sid: string, child: string, got: { m: boolean; f: boolean }) => {
    const entry: StepCheck = {
      m: got.m, f: got.f,
      addedM: got.m && !hasGender(child, 'm'),
      addedF: got.f && !hasGender(child, 'f'),
    };
    if (got.m) setOwnedGender(child, 'm', true);
    if (got.f) setOwnedGender(child, 'f', true);
    const next = { ...checks, [sid]: entry };
    setChecks(next);
    storage.set(CHECKS_KEY, JSON.stringify(next));
    setHatching(null);
  };

  /** "Start over": undo every tick properly — remove exactly what each tick
   * registered, keep anything owned beforehand. */
  const resetProgress = () => {
    for (const [sid, c] of Object.entries(checks)) {
      if (c && typeof c === 'object') {
        const child = sid.slice(sid.lastIndexOf('>') + 1);
        if (c.addedM) setOwnedGender(child, 'm', false);
        if (c.addedF) setOwnedGender(child, 'f', false);
      }
    }
    setChecks({});
    storage.set(CHECKS_KEY, JSON.stringify({}));
    setManaging('none');
  };

  /** "Clear plan": forget plan + ticks; the collection stays. */
  const clearPlan = () => {
    setPlan(null);
    setPlanMs(null);
    setPlannedAt(null);
    setPlanTargets([]);
    clearDraftTargets();
    setChecks({});
    storage.set(CHECKS_KEY, JSON.stringify({}));
    storage.set(PLAN_KEY, '');
    setManaging('none');
  };

  const uncheckStep = (sid: string, child: string) => {
    const c = checks[sid];
    const next = { ...checks };
    delete next[sid];
    if (c && typeof c === 'object') {
      // remove only what the tick contributed — never pre-owned pals
      if (c.addedM) setOwnedGender(child, 'm', false);
      if (c.addedF) setOwnedGender(child, 'f', false);
    }
    setChecks(next);
    storage.set(CHECKS_KEY, JSON.stringify(next));
  };

  // advice arrives WITH the plan (computed in the worker) and persists with
  // it — the card renders in the same frame as the steps. The effect below
  // only backfills plans saved before advice existed.
  const [advice, setAdvice] = useState<HelperAdvice[]>(saved?.advice ?? []);
  useEffect(() => {
    if (!plan || plan.steps.length === 0 || !targets.length
      || (advice.length > 0 && saved?.adviceVersion === ADVICE_VERSION)) return;
    let dead = false;
    requestPlan(planRoster ?? ownedNames, targets, ownedNames)
      .then((r) => {
        if (!dead) setAdvice(r.advice);
      })
      .catch(() => undefined);
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan]);
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

  // ready-state: bred intermediates count as either gender (you can rebreed),
  // owned-only species use the real gender toggles from My Box.
  const stepMeta = useMemo(() => {
    if (!plan) return new Map<string, { ready: boolean; missing: string[]; hint: string | null }>();
    // legacy boolean ticks predate gender recording — treat as both genders;
    // modern ticks wrote real genders into the box, which avail() reads
    const bred = new Set(
      plan.steps.filter((s) => checks[stepId(s.parents[0], s.parents[1], s.child)] === true)
        .map((s) => s.child),
    );
    const avail = (n: string): { m: boolean; f: boolean } => {
      if (bred.has(n)) return { m: true, f: true };
      return { m: hasGender(n, 'm'), f: hasGender(n, 'f') };
    };
    const meta = new Map<string, { ready: boolean; missing: string[]; hint: string | null }>();
    for (const s of plan.steps) {
      const [a, b] = s.parents;
      const oa = avail(a);
      const ob = avail(b);
      const hasSpecies = (n: string, o: { m: boolean; f: boolean }) =>
        bred.has(n) || ownedAny(n) || (o.m || o.f);
      const missing: string[] = [];
      if (!hasSpecies(a, oa)) missing.push(a);
      if (!hasSpecies(b, ob)) missing.push(b);
      let ready = false;
      let hint: string | null = null;
      if (!missing.length) {
        if (s.genderNote) {
          const parsed = parseGenderNote(s.genderNote);
          ready = parsed?.mother === a ? oa.f && ob.m : oa.m && ob.f;
        } else if (a === b) {
          ready = oa.m && oa.f;
        } else {
          ready = (oa.m && ob.f) || (oa.f && ob.m);
        }
        if (!ready) {
          // name the exact ♂/♀ that unlocks this step — never jargon
          const combos: string[][] = [];
          if (s.genderNote) {
            const parsed = parseGenderNote(s.genderNote);
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
      meta.set(stepId(a, b, s.child), { ready, missing, hint });
    }
    return meta;
  }, [plan, checks, box.value]);

  // Booster-aware ordering v2: not just the helper's final step — its WHOLE
  // subtree (every step feeding it) floats to the top of its phase and says
  // why. Cross-phase moves are impossible (a step's phase is set by when
  // its parents exist), so within-phase order is the honest, real version
  // of "do the accelerator branch first".
  const speedsRest = useMemo(() => {
    const out = new Set<string>();
    if (!plan) return out;
    const stepByChild = new Map(plan.steps.map((s) => [s.child, s] as const));
    const markUp = (child: string): void => {
      const s = stepByChild.get(child);
      if (!s) return;
      const sid = stepId(s.parents[0], s.parents[1], s.child);
      if (out.has(sid)) return;
      out.add(sid);
      markUp(s.parents[0]);
      markUp(s.parents[1]);
    };
    for (const s of plan.steps) if (HELPER_NAMES.has(s.child)) markUp(s.child);
    return out;
  }, [plan]);

  const waves = useMemo(() => {
    if (!plan) return [];
    const byWave = new Map<number, PlanStep[]>();
    for (const s of plan.steps) {
      const list = byWave.get(s.wave) ?? [];
      list.push(s);
      byWave.set(s.wave, list);
    }
    // helper subtrees first inside each phase — they pay off for every
    // later step; the helper's own step leads its branch
    const inLineage = (s: PlanStep): number =>
      Number(speedsRest.has(stepId(s.parents[0], s.parents[1], s.child)));
    for (const [, list] of byWave) {
      list.sort((x, y) =>
        inLineage(y) - inLineage(x)
        || Number(HELPER_NAMES.has(y.child)) - Number(HELPER_NAMES.has(x.child)));
    }
    return [...byWave.entries()].sort((x, y) => x[0] - y[0]);
  }, [plan, speedsRest]);

  const done = plan
    ? plan.steps.filter((s) => tickStateOf(checks[stepId(s.parents[0], s.parents[1], s.child)]) === 'full').length
    : 0;
  const partialCount = plan
    ? plan.steps.filter((s) => tickStateOf(checks[stepId(s.parents[0], s.parents[1], s.child)]) === 'partial').length
    : 0;

  // per-target progress: how many of the steps each goal depends on are done
  const targetProgress = useMemo(() => {
    if (!plan) return [];
    const byTarget = new Map<string, { total: number; done: number }>();
    for (const s of plan.steps) {
      const sid = stepId(s.parents[0], s.parents[1], s.child);
      const isDone = tickStateOf(checks[sid]) === 'full';
      for (const t of s.neededBy) {
        const cur = byTarget.get(t) ?? { total: 0, done: 0 };
        cur.total++;
        if (isDone) cur.done++;
        byTarget.set(t, cur);
      }
    }
    return [...byTarget.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((x, y) => (y.done / y.total) - (x.done / x.total) || x.name.localeCompare(y.name));
  }, [plan, checks]);

  return (
    <>
      <div class="pagehead">
        <h1>Route Planner</h1>
        <p>Pick any targets — the engine computes the shortest shared breeding tree from
          your box: shared intermediates counted once, phases that can run in parallel,
          and gender-aware ready-states on every step.</p>
      </div>

      {ownedNames.length === 0 && (
        <div class="notebox" style={{ marginBottom: '16px' }}>
          Your collection is empty — the planner needs to know what you own.
          Tick your pals in the <a href="#/paldex">Paldex</a> (or import a list there) first.
        </div>
      )}

      <div class="card bigcard" style={{ marginBottom: '18px' }}>
        <div class="searchbar" style={{ marginBottom: '10px' }}>
          <button class="btn primary" onClick={() => setGoalsOpen(true)}>
            Suggested goals…
          </button>
          <PalPicker value={null} onPick={addTarget} placeholder="Add a target…" />
        </div>
        {targets.length > 0 && (() => {
          const isPlanned = !!plan
            && [...targets].sort().join() === [...planTargets].sort().join();
          if (isPlanned && !trayOpen) {
            return (
              <button
                aria-label="Show the goals in this plan"
                onClick={() => setTrayOpen(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
                  background: 'var(--surface)', border: '1px solid var(--line)',
                  borderRadius: '12px', padding: '8px', marginBottom: '12px',
                  cursor: 'pointer', color: 'inherit', textAlign: 'left',
                }}>
                <span style={{ display: 'flex' }}>
                  {targets.slice(0, 5).map((t, i) => (
                    <span key={t} style={{ marginLeft: i ? '-10px' : 0, display: 'inline-flex' }}>
                      <PalIcon name={t} size={26} />
                    </span>
                  ))}
                </span>
                <span style={{ color: 'var(--muted)', fontSize: '12.5px', fontWeight: 700, flex: 1 }}>
                  {targets.length === 1
                    ? '1 goal in this plan — tap to edit'
                    : `${targets.length} goals in this plan — tap to edit`}
                </span>
                <span style={{ color: 'var(--faint)' }}>▾</span>
              </button>
            );
          }
          return (
            <div style={{ display: 'grid', gap: '8px', marginBottom: '12px' }}>
              <div class="kv">
                {targets.map((t) => (
                  <span key={t} class="chip" style={{ gap: '6px' }}>
                    <PalIcon name={t} size={24} />
                    {t}
                    {ownedAny(t) && ' ✓'}
                    {selfOnly.value.has(t) && !ownedAny(t) && ' ⚠'}
                    <button style={{ border: 'none', background: 'none', color: 'var(--faint)',
                      cursor: 'pointer', padding: 0, fontWeight: 800 }}
                      aria-label={`Remove ${t}`}
                      onClick={() => removeDraftTargets([t])}>✕</button>
                  </span>
                ))}
              </div>
              <div class="kv">
                {targets.length > 1 && (
                  <button class="btn sm" onClick={() => setManaging('removeall')}>
                    Remove all…
                  </button>
                )}
                {isPlanned && trayOpen && (
                  <button class="btn sm" onClick={() => setTrayOpen(false)}>Fold away</button>
                )}
              </div>
            </div>
          );
        })()}
        <button class="btn primary" disabled={!targets.length || !ownedNames.length || busy}
          onClick={() => run()}>
          {busy ? 'Planning…' : `Plan ${targets.length || ''} targets`}
        </button>
      </div>

      {planError && (
        <div class="notebox" style={{ marginBottom: '14px' }}>
          Planning failed: {planError}. Try again — if it persists, reload the page.
        </div>
      )}

      {plan && (
        <>
          <div class="boxstats">
            <div class="tile"><b>{plan.steps.length}</b><span>breeding steps</span></div>
            <div class="tile"><b>{done} / {plan.steps.length}</b><span>done{partialCount > 0 ? ` · ${partialCount} half` : ''}</span></div>
            <div class="tile"><b>{[...stepMeta.entries()].filter(([sid, m]) => m.ready && !checks[sid]).length}</b><span>ready right now</span></div>
            {planMs !== null && (
              <div class="tile"><b>{planMs < 1000 ? `${Math.round(planMs)}ms` : `${(planMs / 1000).toFixed(1)}s`}</b><span>planned in</span></div>
            )}
            {plannedAt && (
              <div class="tile"><b>{plannedWhen(plannedAt)}</b><span>planned — re-plan after box changes</span></div>
            )}
            <span class="bulkbtns" style={{ alignSelf: 'center' }}>
              <button class="btn sm" onClick={() => setManaging('reset')}>Start over</button>
              <button class="btn sm danger" onClick={() => setManaging('clear')}>Clear plan</button>
            </span>
          </div>

          {targetProgress.length > 0 && (
            <div class="card bigcard" style={{ marginBottom: '16px' }}>
              <h2>Goal progress</h2>
              <div class="goalgrid">
                {targetProgress.map((t) => (
                  <div key={t.name} class={`goalrow${t.done === t.total ? ' complete' : ''}`}>
                    <PalIcon name={t.name} size={30} />
                    <span class="gname">{t.name}</span>
                    <span class="gbar"><span style={{ width: `${(t.done / t.total) * 100}%` }} /></span>
                    <span class="gnum">{t.done}/{t.total}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {plan.steps.length === 0 && (
            <div class="card bigcard" style={{ marginBottom: '16px' }}>
              <h2>Nothing left to breed</h2>
              <p>Every goal in this plan is already in your Paldex. Add another
                target above, or clear the plan.</p>
            </div>
          )}

          {plan.steps.length > 0 && (() => {
            const needs = cakeNeeds(plan.steps.length);
            // gender luck priced honestly: keep-both steps average 3 eggs,
            // gender-locked recipes need one SPECIFIC gender (a male
            // Beegarde at 10% male averages 10). Datamined gender table.
            const est = expectedEggs(plan.steps, maleProb);
            const bits: string[] = [];
            if (est.bothGenderSteps > 0) {
              bits.push(`${est.bothGenderSteps} ${est.bothGenderSteps === 1
                ? 'step needs' : 'steps need'} both genders`);
            }
            if (est.pickyGenderSteps > 0) {
              bits.push(`${est.pickyGenderSteps} ${est.pickyGenderSteps === 1
                ? 'needs' : 'need'} one specific gender`);
            }
            return (
              <div class="card bigcard" style={{ marginBottom: '16px' }}>
                <h2>Make it faster</h2>
                <p style={{ fontSize: '13px' }}>
                  {plan.steps.length} {plan.steps.length === 1 ? 'step' : 'steps'} means
                  at least {needs.cakes} {needs.cakes === 1 ? 'cake' : 'cakes'}:
                  {' '}~{needs.flour} flour · {needs.berries} berries · {needs.milk} milk
                  · {needs.eggs} eggs · {needs.honey} honey.
                </p>
                {est.expectedEggs > est.minEggs && (
                  <p style={{ fontSize: '13px', color: 'var(--muted)' }}>
                    Counting gender luck, expect ~{est.expectedEggs} cakes:
                    {' '}{bits.join(' and ')}.
                  </p>
                )}
                {covered.length > 0 && (
                  <div class="kv" style={{ margin: '8px 0' }}>
                    {covered.map((a) => (
                      <span key={a.helper.name} class="badge ok">{a.helper.name} ✓</span>
                    ))}
                  </div>
                )}
                {activeAdvice.map((a) => {
                  const h = a.helper;
                  const isTarget = targets.includes(h.name);
                  return (
                    <div key={h.name} style={{
                      borderTop: '1px solid var(--line)', paddingTop: '9px', marginTop: '9px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                        <PalIcon name={h.name} size={30} />
                        <div style={{ flex: 1 }}>
                          <b style={{ fontSize: '13.5px' }}>
                            {h.name}
                            {a.status === 'suggest' && a.recommended && (
                              <span class="badge gold" style={{ marginLeft: '8px' }}>recommended</span>
                            )}
                            {a.status === 'in-plan' && (
                              <span class="badge plain" style={{ marginLeft: '8px' }}>phase {a.phase}</span>
                            )}
                          </b>
                          <div style={{ color: 'var(--muted)', fontSize: '12px' }}>{h.effect}</div>
                        </div>
                      </div>
                      <p style={{ fontSize: '12.5px', margin: '6px 0' }}>{a.note}</p>
                      {a.status === 'suggest' && (a.catchOnly || (a.addSteps ?? 0) >= 4)
                        && pals.value[h.name]?.wild && pals.value[h.name].regions.length > 0 && (
                        <p style={{ fontSize: '12px', margin: '0 0 6px', color: 'var(--accent-ink, var(--accent))' }}>
                          {a.catchOnly ? 'Where to catch it: ' : 'Faster to catch one: '}
                          {pals.value[h.name].regions.slice(0, 2).join(' · ')}
                          {wildLevelRange(h.name)
                            ? ` (${wildLevelRange(h.name)})`
                            : pals.value[h.name].max_wild_level
                              ? ` (up to Lv ${pals.value[h.name].max_wild_level})` : ''}
                        </p>
                      )}
                      {a.status === 'suggest' && !a.catchOnly && !isTarget && (
                        <button class={`btn sm${a.recommended ? ' primary' : ''}`} disabled={busy}
                          onClick={() => addHelper(h.name)}>
                          {helperBusy === h.name ? 'Adding…'
                            : a.addSteps === 0
                              ? 'Add to plan · free'
                              : `Add to plan · +${a.addSteps} step${a.addSteps === 1 ? '' : 's'}`}
                        </button>
                      )}
                      {isTarget && (
                        <button class="btn sm" disabled={busy} onClick={() => removeHelper(h.name)}>
                          {helperBusy === h.name ? 'Removing…' : 'Remove from plan'}
                        </button>
                      )}
                    </div>
                  );
                })}
                <p style={{ fontSize: '11.5px', color: 'var(--faint)', marginTop: '9px' }}>
                  All effects are the game's own partner-skill data. Adding or removing
                  reshapes the plan — steps you've ticked stay ticked.
                </p>
              </div>
            );
          })()}

          {plan.unreachable.length > 0 && (
            <div class="notebox" style={{ marginBottom: '14px' }}>
              Not reachable from your box:{' '}
              {plan.unreachable.map((u) => (
                <b>{u}{selfOnly.value.has(u) ? ' (self-breed-only — catch it first)' : ''}{' '}</b>
              ))}
            </div>
          )}
          {waves.map(([wave, steps]) => {
            // one badge per phase, on the FIRST unfinished helper-branch
            // step — the sort already floats the branch, the badge says why
            const leadHelperSid = steps
              .map((s) => stepId(s.parents[0], s.parents[1], s.child))
              .find((x) => speedsRest.has(x) && tickStateOf(checks[x]) !== 'full');
            return (
            <section key={wave} style={{ margin: '18px 0' }}>
              <div class="grouphead">
                <h3>Phase {wave}</h3>
                <span>
                  {steps.filter((s) => checks[stepId(s.parents[0], s.parents[1], s.child)]).length}
                  {' of '}{steps.length} steps · everything here can run in parallel
                </span>
              </div>
              <div class="pairlist">
                {steps.map((s) => {
                  const sid = stepId(s.parents[0], s.parents[1], s.child);
                  const m = stepMeta.get(sid)!;
                  const tick = tickStateOf(checks[sid]);
                  const checked = tick === 'full';
                  const partial = tick === 'partial';
                  const pGlyph = partial && typeof checks[sid] === 'object'
                    ? ((checks[sid] as StepCheck).m ? '♂' : '♀') : '';
                  return (
                    <div key={sid} class={`card pairitem planstep${checked ? ' done' : partial ? ' partial' : m.ready ? ' ready' : ''}`}>
                      <label class={`tick${partial ? ' half' : ''}`} data-glyph={pGlyph}>
                        <input type="checkbox" checked={checked}
                          aria-label={`Done: ${s.parents[0]} + ${s.parents[1]} = ${s.child}`}
                          onChange={() => {
                            if (checked) uncheckStep(sid, s.child);
                            else setHatching({ sid, child: s.child });
                          }} />
                        <span />
                      </label>
                      <PalIcon name={s.parents[0]} size={36}
                        gender={s.genderNote ? (parseGenderNote(s.genderNote)?.mother === s.parents[0] ? 'f' : 'm') : undefined} />
                      <PalIcon name={s.parents[1]} size={36}
                        gender={s.genderNote ? (parseGenderNote(s.genderNote)?.mother === s.parents[1] ? 'f' : 'm') : undefined} />
                      <span class="names">
                        {s.parents[0]} <span class="plus">+</span> {s.parents[1]}
                        <span class="plus"> = </span>
                        <PalIcon name={s.child} size={30} /> <b>{s.child}</b>
                        <WorkChips name={s.child} all />
                      </span>
                      <span class="tag" style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {s.isTarget && <span class="badge gold">Goal</span>}
                        {sid === leadHelperSid && (
                          <span class="badge plain">helper branch — do this first</span>
                        )}
                        {s.kind === 'unique' && <span class="badge unique">fixed recipe</span>}
                        {s.kind === 'gendered' && <LockBadge />}
                        {s.reusedAsParent >= 2 && (
                          <span class="badge plain">keep ♂ + ♀ — parent in {s.reusedAsParent} steps</span>
                        )}
                        {partial && (
                          <span class="badge warn">half done — missing the {pGlyph === '♂' ? '♀' : '♂'}</span>
                        )}
                        {!checked && !partial && (m.ready
                          ? <span class="badge ok">✓ ready to breed</span>
                          : m.hint
                            ? <span class="badge warn">{m.hint}</span>
                            : <span class="badge plain">waiting on {m.missing.join(' + ')}</span>)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
            );
          })}
          <div class="card bigcard" style={{ marginTop: '18px' }}>
            <h2>Gender check for this plan</h2>
            <p>Owned parents used by unchecked steps, where you're missing a gender —
              fix these with the Pal Reverser or by breeding another copy:</p>
            <div class="kv" style={{ marginTop: '10px' }}>
              {[...new Set(plan.steps
                .filter((s) => !checks[stepId(s.parents[0], s.parents[1], s.child)])
                .flatMap((s) => s.parents))]
                .filter((n) => ownedAny(n) && !(hasGender(n, 'm') && hasGender(n, 'f')))
                .map((n) => (
                  <span key={n} class="chip" style={{ gap: '7px', padding: '5px 12px' }}>
                    <PalIcon name={n} size={22} /> {n}
                    <GenderToggles name={n} size="sm" />
                  </span>
                ))}
            </div>
          </div>
        </>
      )}

      {managing !== 'none' && (
        <div class="hatchback" onClick={() => setManaging('none')}>
          <div class="card bigcard hatchcard" role="dialog" aria-modal="true"
            onClick={(e) => e.stopPropagation()}>
            <h2>{managing === 'reset' ? 'Start this plan over?'
              : managing === 'removeall' ? 'Remove all goals?'
              : 'Clear the plan?'}</h2>
            <p style={{ color: 'var(--muted)', fontSize: '13.5px' }}>
              {managing === 'reset'
                ? 'Every tick is undone properly — pals that ticks registered are removed from your Paldex again; anything you owned before stays.'
                : managing === 'removeall'
                  ? 'Empties your goal list so you can pick fresh. Your current plan and its progress stay until you press Plan again.'
                  : 'Forgets the plan and its ticks so you can plan fresh. Your collection stays exactly as it is — hatched pals are still yours.'}
            </p>
            <div class="importbtns">
              <button class={managing === 'clear' ? 'btn danger' : 'btn primary'}
                onClick={() => {
                  if (managing === 'reset') resetProgress();
                  else if (managing === 'removeall') { clearDraftTargets(); setManaging('none'); }
                  else clearPlan();
                }}>
                {managing === 'reset' ? 'Start over'
                  : managing === 'removeall' ? 'Remove all goals'
                  : 'Clear plan'}
              </button>
              <button class="btn" onClick={() => setManaging('none')}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {hatching && (() => {
        const cur = checks[hatching.sid];
        const have = cur && cur !== true ? cur : null;
        const isPartial = !!have && have.m !== have.f;
        return (
          <div class="hatchback" onClick={() => setHatching(null)}>
            <div class="card bigcard hatchcard" role="dialog" aria-modal="true"
              aria-label={`Hatched ${hatching.child}`}
              onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <PalIcon name={hatching.child} size={56} />
                <h2>{isPartial ? `Complete ${hatching.child}?` : `Hatched ${hatching.child}!`}</h2>
                <p style={{ color: 'var(--muted)', fontSize: '13.5px', textAlign: 'center', margin: 0 }}>
                  {isPartial
                    ? `You have the ${have!.m ? '♂' : '♀'} — hatch the ${have!.m ? '♀' : '♂'} and the step turns green.`
                    : 'Which genders do you have? It goes straight into your Paldex — no double registration.'}
                </p>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '8px' }}>
                  {isPartial ? (
                    <>
                      <button class="btn primary"
                        onClick={() => completeStep(hatching.sid, hatching.child, { m: true, f: true })}>
                        Got the {have!.m ? '♀' : '♂'} — complete it
                      </button>
                      <button class="btn danger" onClick={() => {
                        uncheckStep(hatching.sid, hatching.child);
                        setHatching(null);
                      }}>Untick step</button>
                    </>
                  ) : (
                    <>
                      <button class="btn" onClick={() => completeStep(hatching.sid, hatching.child, { m: true, f: false })}>♂ only</button>
                      <button class="btn" onClick={() => completeStep(hatching.sid, hatching.child, { m: false, f: true })}>♀ only</button>
                      <button class="btn primary" onClick={() => completeStep(hatching.sid, hatching.child, { m: true, f: true })}>♂ + ♀ both</button>
                    </>
                  )}
                </div>
                <button class="btn sm" style={{ marginTop: '4px' }} onClick={() => setHatching(null)}>Cancel</button>
              </div>
            </div>
          </div>
        );
      })()}

      {!plan && !busy && (
        <div class="card bigcard">
          <h2>The engine behind this</h2>
          <p>The same planner that produced a 48-step reference plan reproduced exactly by
            the game files' oracle (44,851 results, zero mismatches). Cost is counted in
            distinct breeding steps, so an intermediate shared by five goals is only bred
            once. Use a preset or add targets one by one, then hit Plan.</p>
          <p style={{ marginTop: '8px' }}>
            <button class="btn" onClick={() => nav('paldex')}>Browse the Paldex first</button>
          </p>
        </div>
      )}
      <GoalsSheet open={goalsOpen} onClose={() => setGoalsOpen(false)}
        targets={targets}
        onAdd={addDraftTargets}
        onRemove={removeDraftTargets} />
    </>
  );
}
