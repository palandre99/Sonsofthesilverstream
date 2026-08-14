/** Calculator — pair→child and child→parents (reverse lookup). */
import { useMemo, useState } from 'preact/hooks';
import { canPairNow, engine, nav, ownedAny, pals, selfOnly } from '../state';
import { ElementChips, LockBadge, PalIcon, PalPicker, WorkChips } from '../components/shared';
import type { ChildResult } from '../engine/types';

function ResultFlags({ ch }: { ch: ChildResult }) {
  return (
    <div class="flagrow">
      {ch.kind === 'unique' && <span class="badge unique">unique recipe</span>}
      {ch.kind === 'gendered' && <LockBadge />}
      {ch.kind === 'self' && <span class="badge plain">same species</span>}
      {ch.tieBreak && <span class="badge warn">tie-break</span>}
      {ch.kind === 'generic' && ch.margin !== null && !ch.tieBreak && (
        <span class="badge plain">margin {ch.margin}</span>
      )}
    </div>
  );
}

function PairResult({ a, b }: { a: string; b: string }) {
  const e = engine!;
  const results = e.childrenOf(a, b);
  const bothOwned = ownedAny(a) && ownedAny(b);
  const ra = e.ranks.get(a)!;
  const rb = e.ranks.get(b)!;
  const target = Math.floor((ra + rb + 1) / 2);
  return (
    <>
      {results.map((ch) => (
        <div class="card resultcard">
          <span class="who">
            <PalIcon name={a} size={52}
              gender={ch.kind === 'gendered' ? (ch.genderNote!.includes(`female ${a}`) ? 'f' : 'm') : undefined} />
            <span class="plus" style={{ color: 'var(--faint)', fontWeight: 800 }}>+</span>
            <PalIcon name={b} size={52}
              gender={ch.kind === 'gendered' ? (ch.genderNote!.includes(`female ${b}`) ? 'f' : 'm') : undefined} />
          </span>
          <span class="arrow">→</span>
          <span class="childcol">
            <span class="who">
              <PalIcon name={ch.species} size={64} />
              <span>
                <b>{ch.species}</b>
                <div class="flagrow" style={{ marginTop: '5px' }}>
                  <ElementChips name={ch.species} />
                  <WorkChips name={ch.species} top={3} />
                </div>
              </span>
            </span>
            <ResultFlags ch={ch} />
            {ch.kind === 'generic' && (
              <span class="mathnote">
                rank target ⌊({ra} + {rb} + 1)/2⌋ = {target} → {ch.species} ({e.ranks.get(ch.species)})
                {ch.tieBreak && ' · exact tie resolved to the higher CombiRank (1.0 rule, verified)'}
              </span>
            )}
            {ch.kind === 'gendered' && (
              <span class="mathnote">{ch.genderNote} → {ch.species}. Swap the genders for the other child.</span>
            )}
            {bothOwned && !canPairNow(a, b, ch.genderNote) && (
              <span class="mathnote" style={{ color: 'var(--warn)' }}>
                ⚠ You own both species, but not a working ♂/♀ combination
                {ch.kind === 'gendered' ? ` — this child needs ${ch.genderNote}` : ''}.
                Swap a gender with the Pal Reverser or breed another copy.
              </span>
            )}
            <button class="btn" style={{ alignSelf: 'flex-start' }}
              onClick={() => nav(`paldex/${encodeURIComponent(ch.species)}`)}>
              View {ch.species} in Paldex
            </button>
          </span>
        </div>
      ))}
    </>
  );
}

function ReverseLookup({ target }: { target: string }) {
  const e = engine!;
  const [showAll, setShowAll] = useState(false);

  const pairs = useMemo(() => {
    const names = Object.keys(pals.value);
    const out: { a: string; b: string; kind: string; note: string | null }[] = [];
    for (let i = 0; i < names.length; i++) {
      for (let j = i; j < names.length; j++) {
        for (const ch of e.childrenOf(names[i], names[j])) {
          if (ch.species === target && !(names[i] === target && names[j] === target)) {
            out.push({ a: names[i], b: names[j], kind: ch.kind, note: ch.genderNote });
          }
        }
      }
    }
    return out;
  }, [target]);

  const groups = useMemo(() => {
    const ready: typeof pairs = [];
    const blocked: typeof pairs = [];
    const one: typeof pairs = [];
    const none: typeof pairs = [];
    for (const p of pairs) {
      if (canPairNow(p.a, p.b, p.note)) ready.push(p);
      else if (ownedAny(p.a) && ownedAny(p.b)) blocked.push(p);
      else if (ownedAny(p.a) || ownedAny(p.b)) one.push(p);
      else none.push(p);
    }
    return { ready, blocked, one, none };
  }, [pairs]);

  const Group = ({ title, items, hint }: { title: string; items: typeof pairs; hint: string }) => (
    <>
      <div class="grouphead">
        <h3>{title}</h3>
        <span>{items.length} pairs · {hint}</span>
      </div>
      {items.length === 0 && <div class="card pairitem"><span class="names" style={{ color: 'var(--faint)' }}>none</span></div>}
      <div class="pairlist">
        {(showAll ? items : items.slice(0, 12)).map((p) => (
          <div class="card pairitem">
            <PalIcon name={p.a} size={36} gender={p.note?.includes(`female ${p.a}`) ? 'f' : p.note ? 'm' : undefined} />
            <PalIcon name={p.b} size={36} gender={p.note?.includes(`female ${p.b}`) ? 'f' : p.note ? 'm' : undefined} />
            <span class="names">{p.a} <span class="plus">+</span> {p.b}</span>
            <span class="tag">
              {p.kind === 'unique' && <span class="badge unique">unique</span>}
              {p.kind === 'gendered' && <LockBadge />}
            </span>
          </div>
        ))}
      </div>
      {!showAll && items.length > 12 && (
        <button class="btn morebtn" onClick={() => setShowAll(true)}>
          Show all {items.length}
        </button>
      )}
    </>
  );

  if (selfOnly.value.has(target)) {
    return (
      <div class="notebox">
        {target} is <b>self-breed-only</b>: the only breeding pair that produces it is
        {' '}{target} + {target}. Catch or hatch your first one, then multiply it.
      </div>
    );
  }
  if (!pairs.length) {
    return <div class="notebox">No cross-species pair produces {target}.</div>;
  }
  return (
    <>
      <Group title="Breed right now" items={groups.ready}
        hint="you have the genders this pair needs" />
      {groups.blocked.length > 0 && (
        <Group title="Own both — wrong genders" items={groups.blocked}
          hint="fix with the Pal Reverser or another copy" />
      )}
      <Group title="One step away" items={groups.one} hint="you own one parent species" />
      <Group title="All other pairs" items={groups.none} hint="neither parent owned yet" />
    </>
  );
}

export function CalculatorPage() {
  const [mode, setMode] = useState<'pair' | 'reverse'>('pair');
  const [a, setA] = useState<string | null>(null);
  const [b, setB] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);

  return (
    <>
      <div class="pagehead">
        <h1>Calculator</h1>
        <p>Every result runs the exact 1.0 formula, verified against all 44,851 outcomes
          from the game files — unique recipes, the gender-locked pair, pool exclusions
          and the higher-rank tie-break included.</p>
      </div>
      <div class="calcmodes" role="tablist">
        <button class={mode === 'pair' ? 'on' : ''} onClick={() => setMode('pair')}>Pair → child</button>
        <button class={mode === 'reverse' ? 'on' : ''} onClick={() => setMode('reverse')}>Child → parents</button>
      </div>

      {mode === 'pair' ? (
        <>
          <div class="pairrow">
            <PalPicker value={a} onPick={setA} placeholder="Parent 1…" />
            <span class="op">+</span>
            <PalPicker value={b} onPick={setB} placeholder="Parent 2…" />
          </div>
          {a && b ? <PairResult a={a} b={b} /> : (
            <div class="card bigcard">
              <h2>Pick two parents</h2>
              <p>You'll get the child instantly, with the math shown — and a warning
                whenever a recipe, gender lock or tie-break changes the outcome.</p>
            </div>
          )}
        </>
      ) : (
        <>
          <div class="pairrow">
            <PalPicker value={target} onPick={setTarget} placeholder="I want this pal…" />
          </div>
          {target ? <ReverseLookup target={target} /> : (
            <div class="card bigcard">
              <h2>Pick a target</h2>
              <p>You'll see every parent pair that produces it — sorted by what's
                cheapest from your box.</p>
            </div>
          )}
        </>
      )}
    </>
  );
}
