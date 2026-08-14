/** Route Planner — multi-target shortest shared breeding tree from your box,
 * gender-aware: a step only counts as "ready" when you actually have a working
 * male/female combination (bred intermediates can be rebred to either gender,
 * so they count as both — that's what the keep-both-genders warnings are for). */
import { useMemo, useState } from 'preact/hooks';
import { box, engine, hasGender, nav, ownedAny, selfOnly } from '../state';
import { GenderToggles, LockBadge, PalIcon, PalPicker, WorkChips } from '../components/shared';
import { planFor, stepId } from '../engine/planner';
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

function loadChecks(): Record<string, true> {
  try { return JSON.parse(localStorage.getItem(CHECKS_KEY) || '{}'); } catch { return {}; }
}

export function PlanPage() {
  const [targets, setTargets] = useState<string[]>([]);
  const [plan, setPlan] = useState<{ steps: PlanStep[]; unreachable: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [checks, setChecks] = useState<Record<string, true>>(loadChecks());

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
    setPlan(null);
    setTimeout(() => {
      try {
        setPlan(planFor(engine!, ownedNames, targets));
      } finally {
        setBusy(false);
      }
    }, 30);
  };

  const toggleCheck = (sid: string) => {
    const next = { ...checks };
    if (next[sid]) delete next[sid];
    else next[sid] = true;
    setChecks(next);
    localStorage.setItem(CHECKS_KEY, JSON.stringify(next));
  };

  // ready-state: bred intermediates count as either gender (you can rebreed),
  // owned-only species use the real gender toggles from My Box.
  const stepMeta = useMemo(() => {
    if (!plan) return new Map<string, { ready: boolean; missing: string[] }>();
    const bred = new Set(
      plan.steps.filter((s) => checks[stepId(s.parents[0], s.parents[1], s.child)])
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
          ready = s.genderNote.includes(`female ${a}`) ? oa.f && ob.m : oa.m && ob.f;
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
    ? plan.steps.filter((s) => checks[stepId(s.parents[0], s.parents[1], s.child)]).length
    : 0;

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
          Your box is empty — the planner needs to know what you own.
          Fill it in <a href="#/box">My Box</a> (or import a list there) first.
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
              <span class="chip" style={{ gap: '6px' }}>
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

      {plan && (
        <>
          <div class="boxstats">
            <div class="tile"><b>{plan.steps.length}</b><span>breeding steps</span></div>
            <div class="tile"><b>{done} / {plan.steps.length}</b><span>done</span></div>
            <div class="tile"><b>{[...stepMeta.values()].filter((m) => m.ready).length}</b><span>ready right now</span></div>
          </div>
          {plan.unreachable.length > 0 && (
            <div class="notebox" style={{ marginBottom: '14px' }}>
              Not reachable from your box:{' '}
              {plan.unreachable.map((u) => (
                <b>{u}{selfOnly.value.has(u) ? ' (self-breed-only — catch it first)' : ''}{' '}</b>
              ))}
            </div>
          )}
          {waves.map(([wave, steps]) => (
            <section style={{ margin: '18px 0' }}>
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
                  const checked = !!checks[sid];
                  return (
                    <div class={`card pairitem planstep${checked ? ' done' : m.ready ? ' ready' : ''}`}>
                      <label class="tick">
                        <input type="checkbox" checked={checked}
                          aria-label={`Done: ${s.parents[0]} + ${s.parents[1]} = ${s.child}`}
                          onChange={() => toggleCheck(sid)} />
                        <span />
                      </label>
                      <PalIcon name={s.parents[0]} size={36}
                        gender={s.genderNote?.includes(`female ${s.parents[0]}`) ? 'f' : s.genderNote ? 'm' : undefined} />
                      <PalIcon name={s.parents[1]} size={36}
                        gender={s.genderNote?.includes(`female ${s.parents[1]}`) ? 'f' : s.genderNote ? 'm' : undefined} />
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
                        {!checked && (m.ready
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
                  <span class="chip" style={{ gap: '7px', padding: '5px 12px' }}>
                    <PalIcon name={n} size={22} /> {n}
                    <GenderToggles name={n} size="sm" />
                  </span>
                ))}
            </div>
          </div>
        </>
      )}

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
