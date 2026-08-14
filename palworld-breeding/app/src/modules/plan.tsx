/** Route Planner — multi-target shortest shared breeding tree from your box,
 * gender-aware: a step only counts as "ready" when you actually have a working
 * male/female combination (bred intermediates can be rebred to either gender,
 * so they count as both — that's what the keep-both-genders warnings are for).
 * Planning runs in a Web Worker; targets, results and check-offs persist. */
import { useMemo, useState } from 'preact/hooks';
import { box, hasGender, nav, ownedAny, selfOnly, setOwnedGender, storage } from '../state';
import { GenderToggles, LockBadge, PalIcon, PalPicker, WorkChips } from '../components/shared';
import { stepId } from '../engine/planner';
import { parseGenderNote } from '../engine/formula';
import { requestPlan } from '../engine/planClient';
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
}

function loadSaved(): SavedPlan | null {
  try {
    const raw = storage.get(PLAN_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as SavedPlan;
    return Array.isArray(p.targets) && Array.isArray(p.steps) ? p : null;
  } catch { return null; }
}

export function PlanPage() {
  const saved = useMemo(loadSaved, []);
  const [targets, setTargets] = useState<string[]>(saved?.targets ?? []);
  const [plan, setPlan] = useState<{ steps: PlanStep[]; unreachable: string[] } | null>(
    saved ? { steps: saved.steps, unreachable: saved.unreachable } : null,
  );
  const [busy, setBusy] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planMs, setPlanMs] = useState<number | null>(null);
  const [plannedAt, setPlannedAt] = useState<string | null>(saved?.planned ?? null);
  const [checks, setChecks] = useState<Record<string, CheckValue>>(loadChecks());
  const [hatching, setHatching] = useState<{ sid: string; child: string } | null>(null);
  const [managing, setManaging] = useState<'none' | 'reset' | 'clear'>('none');

  const ownedNames = Object.keys(box.value);

  const addTarget = (n: string) => {
    if (!targets.includes(n)) setTargets([...targets, n]);
  };
  const addPreset = (key: string) => {
    const merged = new Set([...targets, ...PRESETS[key].targets]);
    setTargets([...merged]);
  };

  const run = () => {
    setBusy(true);
    setPlanError(null);
    requestPlan(ownedNames, targets)
      .then((r) => {
        setPlan({ steps: r.steps, unreachable: r.unreachable });
        setPlanMs(r.ms);
        setPlannedAt(new Date().toISOString());
        // best-effort persist — a quota failure must not read as a plan failure
        storage.set(PLAN_KEY, JSON.stringify({
          targets, steps: r.steps, unreachable: r.unreachable,
          planned: new Date().toISOString(),
        } satisfies SavedPlan));
      })
      .catch((e) => setPlanError(String(e instanceof Error ? e.message : e)))
      .finally(() => setBusy(false));
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
    setTargets([]);
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

  // ready-state: bred intermediates count as either gender (you can rebreed),
  // owned-only species use the real gender toggles from My Box.
  const stepMeta = useMemo(() => {
    if (!plan) return new Map<string, { ready: boolean; missing: string[] }>();
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
    const meta = new Map<string, { ready: boolean; missing: string[] }>();
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
      if (!missing.length) {
        if (s.genderNote) {
          const parsed = parseGenderNote(s.genderNote);
          ready = parsed?.mother === a ? oa.f && ob.m : oa.m && ob.f;
        } else if (a === b) {
          ready = oa.m && oa.f;
        } else {
          ready = (oa.m && ob.f) || (oa.f && ob.m);
        }
        if (!ready && !missing.length) missing.push('a working ♂/♀ combo');
      }
      meta.set(stepId(a, b, s.child), { ready, missing });
    }
    return meta;
  }, [plan, checks, box.value]);

  const waves = useMemo(() => {
    if (!plan) return [];
    const byWave = new Map<number, PlanStep[]>();
    for (const s of plan.steps) {
      const list = byWave.get(s.wave) ?? [];
      list.push(s);
      byWave.set(s.wave, list);
    }
    return [...byWave.entries()].sort((x, y) => x[0] - y[0]);
  }, [plan]);

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
          {Object.entries(PRESETS).map(([key, p]) => (
            <button class="btn" onClick={() => addPreset(key)}>+ {p.label}</button>
          ))}
          <PalPicker value={null} onPick={addTarget} placeholder="Add a target…" />
        </div>
        {targets.length > 0 && (
          <div class="kv" style={{ marginBottom: '12px' }}>
            {targets.map((t) => (
              <span key={t} class="chip" style={{ gap: '6px' }}>
                <PalIcon name={t} size={20} />
                {t}
                {ownedAny(t) && ' ✓'}
                {selfOnly.value.has(t) && !ownedAny(t) && ' ⛔'}
                <button style={{ border: 'none', background: 'none', color: 'var(--faint)',
                  cursor: 'pointer', padding: 0, fontWeight: 800 }}
                  aria-label={`Remove ${t}`}
                  onClick={() => setTargets(targets.filter((x) => x !== t))}>✕</button>
              </span>
            ))}
          </div>
        )}
        <button class="btn primary" disabled={!targets.length || !ownedNames.length || busy}
          onClick={run}>
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
              <div class="tile"><b>{plannedAt.slice(0, 10)}</b><span>planned on — re-plan after box changes</span></div>
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
          {plan.unreachable.length > 0 && (
            <div class="notebox" style={{ marginBottom: '14px' }}>
              Not reachable from your box:{' '}
              {plan.unreachable.map((u) => (
                <b>{u}{selfOnly.value.has(u) ? ' (self-breed-only — catch it first)' : ''}{' '}</b>
              ))}
            </div>
          )}
          {waves.map(([wave, steps]) => (
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
                        <WorkChips name={s.child} top={2} />
                      </span>
                      <span class="tag" style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {s.isTarget && <span class="badge gold">Goal</span>}
                        {s.kind === 'unique' && <span class="badge unique">unique</span>}
                        {s.kind === 'gendered' && <LockBadge />}
                        {s.tieBreak && <span class="badge warn">tie-break</span>}
                        {s.reusedAsParent >= 2 && (
                          <span class="badge plain">keep ♂ + ♀ — parent in {s.reusedAsParent} steps</span>
                        )}
                        {partial && (
                          <span class="badge warn">half done — missing the {pGlyph === '♂' ? '♀' : '♂'}</span>
                        )}
                        {!checked && !partial && (m.ready
                          ? <span class="badge ok">ready now</span>
                          : <span class="badge plain">waiting for {m.missing.join(' + ')}</span>)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
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
            <h2>{managing === 'reset' ? 'Start this plan over?' : 'Clear the plan?'}</h2>
            <p style={{ color: 'var(--muted)', fontSize: '13.5px' }}>
              {managing === 'reset'
                ? 'Every tick is undone properly — pals that ticks registered are removed from your Paldex again; anything you owned before stays.'
                : 'Forgets the plan and its ticks so you can plan fresh. Your collection stays exactly as it is — hatched pals are still yours.'}
            </p>
            <div class="importbtns">
              <button class={managing === 'clear' ? 'btn danger' : 'btn primary'}
                onClick={() => (managing === 'reset' ? resetProgress() : clearPlan())}>
                {managing === 'reset' ? 'Start over' : 'Clear plan'}
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
    </>
  );
}
