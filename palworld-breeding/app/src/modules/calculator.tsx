/** Calculator — pair→child and child→parents (reverse lookup).
 * Deep link: #/calc/<name> opens reverse mode with that target picked. */
import { useEffect, useMemo, useState } from 'preact/hooks';
import { box, canPairNow, engine, nav, ownedAny, pals, route, selfOnly } from '../state';
import { parseGenderNote } from '../engine/formula';
import { genderGap } from '../logic/genderGap';
import { ElementChips, LockBadge, PalIcon, PalPicker, WorkChips } from '../components/shared';
import type { ChildResult } from '../engine/types';

/** what an unowned species looks like in the box */
const NONE = { m: false, f: false };

function ResultFlags({ ch }: { ch: ChildResult }) {
  return (
    <div class="flagrow">
      {/* "fixed recipe" everywhere — the Plan tab, Paldex and Reference all
          already used it; only here did the same mechanic have a second name */}
      {ch.kind === 'unique' && <span class="badge unique">fixed recipe</span>}
      {ch.kind === 'gendered' && <LockBadge />}
      {ch.kind === 'self' && <span class="badge plain">same species</span>}
      {ch.tieBreak && <span class="badge warn">close call — higher rank wins</span>}
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
        <div key={ch.species} class="card resultcard">
          <span class="who">
            <PalIcon name={a} size={52}
              gender={ch.kind === 'gendered' ? (parseGenderNote(ch.genderNote!)?.mother === a ? 'f' : 'm') : undefined} />
            <span class="plus" style={{ color: 'var(--faint)', fontWeight: 800 }}>+</span>
            <PalIcon name={b} size={52}
              gender={ch.kind === 'gendered' ? (parseGenderNote(ch.genderNote!)?.mother === b ? 'f' : 'm') : undefined} />
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
                ⚠ You have both species, but not a pair that can breed.{' '}
                {genderGap(a, b, box.value[a] ?? NONE, box.value[b] ?? NONE,
                  ch.genderNote ? parseGenderNote(ch.genderNote) : null)}{' '}
                Swap a gender with the Pal Reverser, or breed another copy.
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
          <div key={`${p.a}|${p.b}`} class="card pairitem">
            <PalIcon name={p.a} size={36} gender={p.note ? (parseGenderNote(p.note)?.mother === p.a ? 'f' : 'm') : undefined} />
            <PalIcon name={p.b} size={36} gender={p.note ? (parseGenderNote(p.note)?.mother === p.b ? 'f' : 'm') : undefined} />
            <span class="names">{p.a} <span class="plus">+</span> {p.b}</span>
            <span class="tag">
              {p.kind === 'unique' && <span class="badge unique">fixed recipe</span>}
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

  // Two of the 28 self-breed-only species ALSO have a fixed recipe (Mossanda
  // Lux = Grizzbolt + Mossanda, Relaxaurus Lux = Relaxaurus + Sparkit), so
  // firing on the flag alone HID a usable recipe and told the player to go
  // catch one. Only claim it when no other pair really exists.
  if (selfOnly.value.has(target) && pairs.length === 0) {
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


/** What the tab shows before you have picked anything. It used to be a
 *  heading and one sentence — the same emptiness the CEO called out on the
 *  Plan tab's home screen. Your own pals become one-click shortcuts, and the
 *  three steps say what the tab actually does. */
function CalcStartHelp({ onPick, mode }: {
  onPick: (name: string) => void; mode: 'pair' | 'reverse';
}) {
  // "…and N more — use the picker above" was a dead end: that picker holds
  // all 299 pals, not yours, so with a big collection you saw a handful of
  // chips and had no way to reach the rest of your own (CEO 2026-08-16).
  // The page is wide and 50-odd chips cost nothing, so it opens in place.
  const [showAllOwned, setShowAllOwned] = useState(false);
  const owned = Object.keys(box.value).filter((n) => Object.hasOwn(pals.value, n));
  const steps = [
    mode === 'pair'
      ? { n: '1', h: 'Pair → child', b: 'Pick any two pals and you get exactly what they make, with the maths shown.' }
      : { n: '1', h: 'Child → parents', b: 'Pick the pal you want and you get every pair that produces it.' },
    mode === 'pair'
      ? { n: '2', h: 'Swap to Child → parents', b: 'Already know what you want? Use the other tab above to work backwards instead.' }
      : { n: '2', h: 'Swap to Pair → child', b: 'Curious what two pals make? Use the other tab above to work forwards instead.' },
    { n: '3', h: 'It tells you when the rule changes', b: 'Special recipes and gender-locked pairs are called out, so a surprise result is never unexplained.' },
  ];
  return (
    <>
      <div class="card calcstart">
        {owned.length > 0 ? (
          <>
            <span class="eyebrow">START FROM YOUR PALDEX</span>
            <div class="picks">
              {(showAllOwned ? owned : owned.slice(0, 12)).map((n) => (
                <button key={n} onClick={() => onPick(n)} aria-label={`Use ${n}`}>
                  <PalIcon name={n} size={26} />{n}
                </button>
              ))}
            </div>
            {owned.length > 12 && !showAllOwned && (
              <button class="btn" style={{ alignSelf: 'flex-start' }}
                onClick={() => setShowAllOwned(true)}>
                Show all {owned.length} of your pals
              </button>
            )}
          </>
        ) : (
          <span class="more">
            Tick the pals you own in the Paldex and they will show up here as
            one-click shortcuts.
          </span>
        )}
      </div>
      <div class="card calcsteps">
        {steps.map((r) => (
          <div class="row" key={r.n}>
            <span class="num">{r.n}</span>
            <span><b>{r.h}</b><em>{r.b}</em></span>
          </div>
        ))}
      </div>
    </>
  );
}

export function CalculatorPage() {
  const linked = route.value.page === 'calc' ? route.value.target : undefined;
  const validLink = linked && Object.hasOwn(pals.value, linked) ? linked : null;
  const [mode, setMode] = useState<'pair' | 'reverse'>(validLink ? 'reverse' : 'pair');
  const [a, setA] = useState<string | null>(null);
  const [b, setB] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(validLink);

  // follow deep-link changes while the page is mounted (e.g. from a drawer)
  useEffect(() => {
    if (validLink) {
      setMode('reverse');
      setTarget(validLink);
    }
  }, [validLink]);

  return (
    <>
      <div class="pagehead">
        <h1>Calculator</h1>
        <p>Every result runs the exact 1.0 formula, verified against all 44,851 outcomes
          from the game files — fixed recipes, the gender-locked pair, pool exclusions
          and exact ties resolved the way the game resolves them.</p>
      </div>
      <div class="calcmodes" role="group" aria-label="Calculator mode">
        <button aria-pressed={mode === 'pair'} class={mode === 'pair' ? 'on' : ''}
          onClick={() => setMode('pair')}>Pair → child</button>
        <button aria-pressed={mode === 'reverse'} class={mode === 'reverse' ? 'on' : ''}
          onClick={() => setMode('reverse')}>Child → parents</button>
      </div>

      {mode === 'pair' ? (
        <>
          <div class="pairrow">
            <PalPicker value={a} onPick={setA} placeholder="Parent 1…" />
            <span class="op">+</span>
            <PalPicker value={b} onPick={setB} placeholder="Parent 2…" />
          </div>
          {a && b ? <PairResult a={a} b={b} /> : (
            <CalcStartHelp mode="pair" onPick={(n) => (a ? setB(n) : setA(n))} />
          )}
        </>
      ) : (
        <>
          <div class="pairrow">
            <PalPicker value={target} onPick={setTarget} placeholder="I want this pal…" />
          </div>
          {target ? <ReverseLookup target={target} /> : (
            <CalcStartHelp mode="reverse" onPick={setTarget} />
          )}
        </>
      )}
    </>
  );
}
