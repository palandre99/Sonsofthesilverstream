/** Odds Lab — passive inheritance, IV inheritance, cakes and mutation.
 *
 * Every number on this page comes from src/engine/odds.ts, whose weights are
 * the game's own GameSettings values. The UI's job is to make the model legible:
 * show the pool being built, show what each roll does, and never present a
 * community-sourced figure as if it came from the game files.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { passives as allPassives, type PassiveInfo } from '../state';
import {
  attemptsFor,
  CAKES,
  cakeById,
  ivOdds,
  mutationPlan,
  oddsTable,
  passiveOdds,
  type CakeId,
} from '../engine/odds';

/* ---------------- formatting ---------------- */

function pct(p: number): string {
  if (!isFinite(p) || p <= 0) return '0%';
  if (p >= 0.99995) return '100%';
  if (p >= 0.01) return `${(p * 100).toFixed(1)}%`;
  return `${(p * 100).toFixed(2)}%`;
}

function oneIn(p: number): string {
  if (!isFinite(p) || p <= 0) return 'not possible';
  const n = 1 / p;
  return `1 in ${n < 10 ? n.toFixed(1) : Math.round(n)} eggs`;
}

const TIER_CLASS: Record<string, string> = {
  '5': 'gold', '4': 'ok', '3': 'ok', '2': 'plain', '1': 'plain',
  '-1': 'bad', '-2': 'bad', '-3': 'bad',
};

function PassiveChip({ p, onRemove }: { p: PassiveInfo; onRemove?: () => void }) {
  return (
    <span class={`pchip t${String(p.tier).replace('-', 'n')}`} title={p.effects}>
      <b>{p.name}</b>
      {onRemove && (
        <button type="button" aria-label={`Remove ${p.name}`} onClick={onRemove}>✕</button>
      )}
    </span>
  );
}

/* ---------------- passive picker ---------------- */

function PassivePicker({ onPick, exclude, label }: {
  onPick: (name: string) => void;
  exclude: Set<string>;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const needle = q.toLowerCase();
    return allPassives.value
      .filter((p) => !exclude.has(p.name))
      .filter((p) => !needle || p.name.toLowerCase().includes(needle)
        || p.effects.toLowerCase().includes(needle))
      .slice(0, 80);
  }, [q, exclude, allPassives.value]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const pick = (n: string) => {
    onPick(n);
    setOpen(false);
    setQ('');
    setHi(0);
  };

  return (
    <div class="picker ppicker" ref={rootRef}>
      <button type="button" onClick={() => setOpen(!open)} aria-haspopup="listbox"
        aria-expanded={open}>
        <span class="ph">+ {label}</span>
      </button>
      {open && (
        <div class="pop">
          <input ref={inputRef} type="text" placeholder="Search passives…" value={q}
            aria-label="Search passives"
            onInput={(e) => { setQ(e.currentTarget.value); setHi(0); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setHi(Math.min(hi + 1, matches.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(Math.max(hi - 1, 0)); }
              else if (e.key === 'Enter' && matches[hi]) pick(matches[hi].name);
              else if (e.key === 'Escape') setOpen(false);
            }} />
          <div class="list" role="listbox">
            {matches.map((p, i) => (
              <button key={p.name} type="button" class={i === hi ? 'hi' : ''} role="option"
                aria-selected={i === hi} onClick={() => pick(p.name)}>
                <span class={`badge ${TIER_CLASS[String(p.tier)] ?? 'plain'}`}>
                  {p.tier != null && p.tier > 0 ? `T${p.tier}` : 'neg'}
                </span>
                <span class="pname">{p.name}</span>
                <span class="peff">{p.effects}</span>
              </button>
            ))}
            {!matches.length && <div class="empty">No passive matches “{q}”</div>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- parent panel ---------------- */

function ParentPanel({ title, list, setList, other }: {
  title: string;
  list: string[];
  setList: (v: string[]) => void;
  other: string[];
}) {
  const byName = useMemo(
    () => new Map(allPassives.value.map((p) => [p.name, p])),
    [allPassives.value],
  );
  return (
    <div class="card parentpanel">
      <div class="pphead">
        <h3>{title}</h3>
        <span>{list.length} / 4 slots</span>
      </div>
      <div class="kv">
        {list.map((n) => {
          const p = byName.get(n);
          return p ? (
            <PassiveChip key={n} p={p} onRemove={() => setList(list.filter((x) => x !== n))} />
          ) : null;
        })}
        {list.length === 0 && <span class="dim">No passives yet.</span>}
      </div>
      {list.length < 4 && (
        <PassivePicker label="Add passive" exclude={new Set(list)}
          onPick={(n) => setList([...list, n])} />
      )}
      {other.some((n) => list.includes(n)) && (
        <p class="dim small">
          Shared passives merge into one pool entry — duplicates never double your odds.
        </p>
      )}
    </div>
  );
}

/* ---------------- odds readout ---------------- */

/** A pal has four passive slots — the game's own limit. */
const SLOTS = 4;

function OddsReadout({ poolSize, desiredCount, cake }: {
  poolSize: number; desiredCount: number; cake: CakeId;
}) {
  const odds = passiveOdds({ poolSize, desiredCount });
  const c = cakeById(cake);
  const cyclesFor90 = isFinite(odds.eggsFor90)
    ? Math.ceil(odds.eggsFor90 / c.eggsPerCycle)
    : null;

  return (
    <>
      <div class="oddsgrid">
        <div class="oddscard hero">
          <span class="lbl">All {desiredCount} wanted passives</span>
          <b>{pct(odds.allDesired)}</b>
          <span class="sub">{oneIn(odds.allDesired)}</span>
        </div>
        <div class="oddscard">
          <span class="lbl">Exactly those, no junk</span>
          <b>{pct(odds.exactlyDesired)}</b>
          <span class="sub">{oneIn(odds.exactlyDesired)}</span>
        </div>
        <div class="oddscard">
          {/* names the hero card it derives from: read against "exactly
              those, no junk" instead, this number is ten times wrong */}
          <span class="lbl">Eggs for 90% of all {desiredCount} wanted</span>
          <b>{isFinite(odds.eggsFor90) ? odds.eggsFor90 : '—'}</b>
          <span class="sub">
            {cyclesFor90 !== null ? `${cyclesFor90} cycles on ${c.name}` : 'not reachable'}
          </span>
        </div>
      </div>

      <div class="card bigcard" style={{ marginTop: '14px' }}>
        <h2>How many passives the child ends up with</h2>
        <p>Independent of which ones — this is the second roll, the one that adds
          brand-new random passives on top of what it inherited.</p>
        <div class="distbars">
          {odds.totalCount.map((p, k) => (
            <div key={k} class="distbar">
              <span class="dl">{k}</span>
              <span class="db"><span style={{ width: `${p === 0 ? 0 : Math.max(1, p * 100)}%` }} /></span>
              <span class="dv">{pct(p)}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* ---------------- passives tab ---------------- */

function PassivesTab() {
  const [a, setA] = useState<string[]>([]);
  const [b, setB] = useState<string[]>([]);
  const [want, setWant] = useState<string[]>([]);
  const [cake, setCake] = useState<CakeId>('cake');

  const byName = useMemo(
    () => new Map(allPassives.value.map((p) => [p.name, p])),
    [allPassives.value],
  );

  // the pool is the de-duplicated union of both parents
  const pool = useMemo(() => [...new Set([...a, ...b])], [a, b]);
  const desired = useMemo(() => want.filter((n) => pool.includes(n)), [want, pool]);

  // drop wants that are no longer in the pool
  useEffect(() => {
    if (want.some((n) => !pool.includes(n))) setWant(want.filter((n) => pool.includes(n)));
  }, [pool]);

  const warnings = useMemo(() => {
    const out: string[] = [];
    for (const n of pool) {
      const p = byName.get(n);
      if (!p) continue;
      if (p.mutation_exclusive) {
        out.push(`${n} only appears on a mutated pal first — you cannot breed it out of thin air, but once a pal has it, it passes down normally.`);
      } else if (p.exclusive_to.length) {
        out.push(`${n} is native to ${p.exclusive_to.slice(0, 3).join(', ')}${p.exclusive_to.length > 3 ? '…' : ''} — a parent must already carry it.`);
      } else if (!p.breedable) {
        out.push(`${n} is not inheritable by breeding.`);
      }
    }
    return out;
  }, [pool, byName]);

  const junk = pool.length - desired.length;

  return (
    <>
      <div class="parentrow">
        <ParentPanel title="Parent 1" list={a} setList={setA} other={b} />
        <ParentPanel title="Parent 2" list={b} setList={setB} other={a} />
      </div>

      <div class="card bigcard" style={{ marginTop: '14px' }}>
        <h2>The pool</h2>
        <p>Both parents' passives, combined and de-duplicated. Tick the ones you
          actually want in the child — everything else is junk that dilutes the draw.</p>
        {pool.length === 0 ? (
          <p class="dim" style={{ marginTop: '10px' }}>
            Add passives to a parent above and the pool appears here.
          </p>
        ) : (
          <div class="poolwrap">
            {pool.map((n) => {
              const p = byName.get(n);
              const on = want.includes(n);
              const capped = !on && desired.length >= SLOTS;
              return (
                <label key={n} class={`poolitem${on ? ' on' : ''}${capped ? ' capped' : ''}`}
                  title={capped ? 'A pal has four passive slots - wanting more than 4 is impossible' : undefined}>
                  <input type="checkbox" checked={on} disabled={capped}
                    onChange={() => setWant(on ? want.filter((x) => x !== n) : [...want, n])} />
                  <span class="pi-name">{n}</span>
                  {p && <span class="pi-eff">{p.effects}</span>}
                </label>
              );
            })}
          </div>
        )}
        {pool.length > 0 && (
          <p class="poolsum">
            Pool of <b>{pool.length}</b> · wanted <b>{desired.length}</b>
            {junk > 0 && <> · <span class="warnink">{junk} junk</span></>}
            {desired.length >= SLOTS && <> · <span class="dim">{SLOTS} is the slot cap</span></>}
          </p>
        )}
      </div>

      {warnings.map((w) => <div key={w} class="notebox">{w}</div>)}

      {/* The cap only blocks NEW ticks, so it can be walked around: tick four,
          remove two of them from a parent (the cap releases), tick two more,
          then put the first two back — six wanted, four slots. The maths is
          then honestly 0%, but reads as "unlucky pairing" rather than "you
          asked for the impossible". Say which it is. */}
      {desired.length > SLOTS && (
        <div class="notebox" style={{ marginTop: '14px' }}>
          You have {desired.length} passives ticked, but a pal only ever holds
          {' '}{SLOTS}. Untick {desired.length - SLOTS} of them to see real odds.
        </div>
      )}

      {desired.length > 0 && desired.length <= SLOTS ? (
        <>
          <div class="searchbar" style={{ margin: '18px 0 4px' }}>
            <label class="dim" for="cakesel">Cake</label>
            <select id="cakesel" value={cake}
              onChange={(e) => setCake(e.currentTarget.value as CakeId)}>
              {CAKES.filter((c) => c.id !== 'special')
                .map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <span class="dim small">{cakeById(cake).effect} (Special Cake is not
              listed: its passive override is not datamined, and this page does not
              invent numbers.)</span>
          </div>
          <OddsReadout poolSize={pool.length} desiredCount={desired.length} cake={cake} />
        </>
      ) : (
        <div class="card bigcard" style={{ marginTop: '14px' }}>
          <h2>Tick what you want</h2>
          <p>Choose at least one passive from the pool and the odds appear here,
            along with how many eggs it realistically takes.</p>
        </div>
      )}

      <div class="card bigcard" style={{ marginTop: '14px' }}>
        <h2>If parents carry only what you want</h2>
        <p>Your odds per egg. "Perfect" = the egg carries your passives and
          nothing else; "with extras" = all your passives, possibly plus random
          ones you'd breed out later. Computed from the game's inheritance
          weights — matches the community's measured numbers.</p>
        <table class="otable">
          <thead>
            <tr><th>Wanted passives</th><th>Perfect</th><th>With extras</th></tr>
          </thead>
          <tbody>
            {oddsTable().map((r) => (
              <tr key={r.skills}>
                <td>{r.skills}</td>
                <td><b>{pct(r.clean)}</b></td>
                <td>{pct(r.withJunk)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ---------------- IV tab ---------------- */

const IV_LABELS: [string, string][] = [
  ['hp', 'HP'], ['atk', 'Attack'], ['def', 'Defence'],
];

function IvTab() {
  const [picked, setPicked] = useState<string[]>(['atk']);
  const [specific, setSpecific] = useState(false);
  const n = picked.length;
  const odds = n >= 1 && n <= 3 ? ivOdds(n) : null;
  const p = odds ? (specific ? odds.fromChosenParent : odds.categoriesInherited) : 0;

  return (
    <>
      <div class="card bigcard">
        <h2>Which stats do you want inherited?</h2>
        <p>Every pal has three hidden potentials. At least one is always taken from
          a parent; the rest are rolled fresh. Pick the ones that matter for this pal.</p>
        <div class="ivrow">
          {IV_LABELS.map(([id, label]) => {
            const on = picked.includes(id);
            return (
              <button key={id} type="button" class={`ivbtn${on ? ' on' : ''}`} aria-pressed={on}
                onClick={() => setPicked(on ? picked.filter((x) => x !== id) : [...picked, id])}>
                {label}
              </button>
            );
          })}
        </div>
        <label class="inlinecheck">
          <input type="checkbox" checked={specific}
            onChange={(e) => setSpecific(e.currentTarget.checked)} />
          <span>They must come from one specific parent (the one with the good rolls)</span>
        </label>
      </div>

      {odds ? (
        <div class="oddsgrid" style={{ marginTop: '14px' }}>
          <div class="oddscard hero">
            <span class="lbl">{specific ? 'From your chosen parent' : 'Inherited from either parent'}</span>
            <b>{pct(p)}</b>
            <span class="sub">{oneIn(p)}</span>
          </div>
          <div class="oddscard">
            <span class="lbl">Eggs for 90%</span>
            <b>{attemptsFor(p, 0.9)}</b>
            <span class="sub">at {n} stat{n > 1 ? 's' : ''}</span>
          </div>
          <div class="oddscard">
            <span class="lbl">Average eggs</span>
            <b>{isFinite(1 / p) ? Math.round(1 / p) : '—'}</b>
            <span class="sub">one success expected</span>
          </div>
        </div>
      ) : (
        <div class="notebox">Pick at least one stat.</div>
      )}

      <div class="card bigcard" style={{ marginTop: '14px' }}>
        <h2>Why you cannot force all three at once</h2>
        <p>The game rolls how many stat categories to inherit — one half the time,
          two a third of the time, all three only one time in six. Then each inherited
          category takes the mother's or the father's value on a coin flip. That is why
          serious IV work is volume plus selection across generations, not one perfect egg.
          Mushroom Cake and Extravagant Vegetable Cake improve the rolls; the exact
          bonus has never been published.</p>
        <table class="otable" style={{ marginTop: '12px' }}>
          <thead>
            <tr><th>Stats wanted</th><th>Odds per egg</th><th>Eggs for 90%</th></tr>
          </thead>
          <tbody>
            {[1, 2, 3].map((k) => {
              const o = ivOdds(k);
              return (
                <tr key={k}>
                  <td>{k}</td>
                  <td><b>{pct(o.categoriesInherited)}</b></td>
                  <td>{o.eggsFor90}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ---------------- cakes tab ---------------- */

function CakesTab() {
  const mutationPassives = useMemo(
    () => allPassives.value.filter((p) => p.mutation_exclusive),
    [allPassives.value],
  );

  return (
    <>
      <div class="card bigcard">
        <h2>Which cake for which job</h2>
        <p>Cake is consumed per egg and is the real bottleneck on breeding. These
          effects come from the in-game item descriptions and community measurement,
          not from the game's data tables — so they are labelled as such.</p>
        <div class="tablewrap">
          <table class="otable">
            <thead>
              <tr>
                <th>Cake</th><th>Eggs / cycle</th><th>Mutation / egg</th>
                <th>Mutation / cycle</th><th>What it is for</th>
              </tr>
            </thead>
            <tbody>
              {CAKES.map((c) => {
                const m = mutationPlan(c.id);
                return (
                  <tr key={c.id}>
                    <td><b>{c.name}</b></td>
                    <td>{c.eggsPerCycle}</td>
                    <td>{pct(m.mutationPerEgg)}</td>
                    <td>{pct(m.mutationPerCycle)}</td>
                    <td class="dim">{c.effect}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p class="dim small" style={{ marginTop: '10px' }}>
          Note the Vegetable Cake row: two eggs at 1% each is a 1.99% chance per
          cycle, not 2% per egg. Guides that write "2%" are rounding a throughput
          gain into a rate.
        </p>
      </div>

      <div class="card bigcard" style={{ marginTop: '14px' }}>
        <h2>Hunting a mutation</h2>
        <p>A mutated egg produces a pal with higher base stats, alpha status and one
          passive that cannot be obtained any other way. On the best cake it is a
          3% roll per egg.</p>
        <div class="oddsgrid" style={{ marginTop: '12px' }}>
          {(['cake', 'vegetable', 'extravagant'] as CakeId[]).map((id) => {
            const m = mutationPlan(id);
            return (
              <div key={id} class={`oddscard${id === 'extravagant' ? ' hero' : ''}`}>
                <span class="lbl">{cakeById(id).name}</span>
                <b>{m.cyclesFor90}</b>
                <span class="sub">cycles for 90% · {Math.round(m.expectedEggs)} eggs average</span>
              </div>
            );
          })}
        </div>
      </div>

      {mutationPassives.length > 0 && (
        <div class="card bigcard" style={{ marginTop: '14px' }}>
          <h2>The mutation-only passives</h2>
          <p>{mutationPassives.length === 5 ? 'These five' : `These ${mutationPassives.length}`} exist nowhere else. Once a pal carries one, it breeds down
            like any other passive — so a single mutant is a permanent source.</p>
          <div class="poolwrap" style={{ marginTop: '10px' }}>
            {mutationPassives.map((p) => (
              <div key={p.name} class="poolitem on" style={{ cursor: 'default' }}>
                <span class="pi-name">{p.name}</span>
                <span class="pi-eff">{p.effects}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/* ---------------- page ---------------- */

export function OddsPage() {
  const [mode, setMode] = useState<'passives' | 'ivs' | 'cakes'>('passives');
  const tabs: [typeof mode, string][] = [
    ['passives', 'Passive skills'], ['ivs', 'Stats (IVs)'], ['cakes', 'Cakes & mutation'],
  ];

  return (
    <>
      <div class="pagehead">
        <h1>Odds Lab</h1>
        <p>What a given pairing actually costs you in eggs. The inheritance weights
          driving this page are the game's own values, and the model reproduces the
          community's measured inheritance table rather than assuming it.</p>
      </div>
      <div class="calcmodes" role="group" aria-label="Odds Lab section">
        {tabs.map(([id, label]) => (
          <button key={id} aria-pressed={mode === id} class={mode === id ? 'on' : ''}
            onClick={() => setMode(id)}>{label}</button>
        ))}
      </div>
      {mode === 'passives' ? <PassivesTab />
        : mode === 'ivs' ? <IvTab />
        : <CakesTab />}
    </>
  );
}
