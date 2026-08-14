/** Paldex — browsable grid of all species with a detail drawer. */
import { useMemo, useState } from 'preact/hooks';
import {
  box, breedingRaw, engine, hasGender, nav, ownedAny, palNumberSort, pals, route,
  selfOnly, workLabel,
} from '../state';
import { ElementChips, GenderToggles, LockBadge, PalIcon, StatBars, WorkChips } from '../components/shared';

const ELEMENTS = ['Neutral', 'Fire', 'Water', 'Grass', 'Electric', 'Ice', 'Ground', 'Dark', 'Dragon'];
const WORKS = ['Kindling', 'Watering', 'Planting', 'Generating_Electricity', 'Handiwork',
  'Gathering', 'Lumbering', 'Mining', 'Medicine', 'Cooling', 'Transporting', 'Farming'];

function Drawer({ name, onClose }: { name: string; onClose: () => void }) {
  const p = pals.value[name];
  const raw = breedingRaw.value!;
  if (!p) return null;

  const asChild = raw.unique_combos.filter((c) => c.child === name);
  const asParent = raw.unique_combos.filter((c) => c.parents.includes(name));
  const gendered = raw.gendered_combos.filter(
    (g) => g.child === name || g.mother === name || g.father === name,
  );
  const inPool = !new Set(raw.excluded_from_generic_pool).has(name);

  return (
    <>
      <div class="drawer-back" onClick={onClose} />
      <aside class="drawer" role="dialog" aria-label={name}>
        <button class="close" onClick={onClose} aria-label="Close">✕</button>
        <header>
          <PalIcon name={name} size={76} />
          <div>
            <h2>{name}</h2>
            <div class="sub">
              <span class="chip">#{p.number || '—'}</span>
              <ElementChips name={name} />
              {p.nocturnal && <span class="chip">nocturnal</span>}
            </div>
          </div>
        </header>

        <div class="ownrow">
          <PalIcon name={name} size={28} />
          <span>In my box
            <div style={{ fontSize: '11.5px', color: 'var(--muted)', fontWeight: 600 }}>
              mark which genders you have
            </div>
          </span>
          <span style={{ marginLeft: 'auto' }}><GenderToggles name={name} /></span>
        </div>

        <section>
          <h4>Stats</h4>
          <StatBars p={p} />
        </section>

        {Object.keys(p.work ?? {}).length > 0 && (
          <section>
            <h4>Work suitability</h4>
            <div class="kv">
              {Object.entries(p.work).sort((a, b) => b[1] - a[1]).map(([job, lvl]) => (
                <span class="chip work">{workLabel(job)} <b>{lvl}</b></span>
              ))}
            </div>
          </section>
        )}

        {p.partner_skill && (
          <section>
            <h4>Partner skill — {p.partner_skill}</h4>
            <p style={{ color: 'var(--muted)', fontSize: '13.5px', margin: 0 }}>
              {p.partner_effect}
            </p>
          </section>
        )}

        <section>
          <h4>How to breed it</h4>
          {selfOnly.value.has(name) ? (
            <div class="recipe-line">
              <span class="badge bad">self-breed-only</span>
              {name} <span class="plus">+</span> {name} <span class="eq">=</span> {name}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {asChild.map((c) => (
                <div class="recipe-line">
                  <span class="badge unique">unique</span>
                  <PalIcon name={c.parents[0]} size={26} /> {c.parents[0]}
                  <span class="plus">+</span>
                  <PalIcon name={c.parents[1]} size={26} /> {c.parents[1]}
                  <span class="eq">=</span> {name}
                </div>
              ))}
              {gendered.filter((g) => g.child === name).map((g) => (
                <div class="recipe-line">
                  <LockBadge />
                  <PalIcon name={g.mother} size={26} gender="f" /> {g.mother}
                  <span class="plus">+</span>
                  <PalIcon name={g.father} size={26} gender="m" /> {g.father}
                  <span class="eq">=</span> {name}
                </div>
              ))}
              {inPool && (
                <div class="recipe-line">
                  <span class="badge plain">generic · rank {engine!.ranks.get(name)}</span>
                  any pair whose rank target lands on {engine!.ranks.get(name)}
                </div>
              )}
              <button class="btn" style={{ alignSelf: 'flex-start', marginTop: '4px' }}
                onClick={() => { nav('calc'); }}>
                Find parent pairs in the Calculator
              </button>
            </div>
          )}
        </section>

        {asParent.length > 0 && (
          <section>
            <h4>Unique recipes as a parent</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {asParent.map((c) => {
                const other = c.parents[0] === name ? c.parents[1] : c.parents[0];
                return (
                  <div class="recipe-line">
                    {name} <span class="plus">+</span>
                    <PalIcon name={other} size={26} /> {other}
                    <span class="eq">=</span>
                    <PalIcon name={c.child} size={26} /> {c.child}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section>
          <h4>In the wild</h4>
          <div class="kv">
            {p.wild
              ? p.regions.map((r) => <span class="chip">{r}</span>)
              : <span class="badge plain">no regular wild spawn</span>}
            {p.egg_types.map((e) => <span class="chip">🥚 {e}</span>)}
          </div>
        </section>
      </aside>
    </>
  );
}

export function PaldexPage() {
  const [q, setQ] = useState('');
  const [el, setEl] = useState('');
  const [work, setWork] = useState('');
  const [ownFilter, setOwnFilter] = useState('');
  const current = route.value.page === 'paldex' ? route.value.pal : undefined;

  const names = useMemo(() => {
    let list = Object.keys(pals.value).sort(palNumberSort);
    if (q) list = list.filter((n) => n.toLowerCase().includes(q.toLowerCase()));
    if (el) list = list.filter((n) => pals.value[n].elements.includes(el));
    if (work) {
      list = list
        .filter((n) => (pals.value[n].work ?? {})[work] !== undefined)
        .sort((a, b) => (pals.value[b].work[work] ?? 0) - (pals.value[a].work[work] ?? 0));
    }
    if (ownFilter === 'owned') list = list.filter((n) => ownedAny(n));
    if (ownFilter === 'missing') list = list.filter((n) => !ownedAny(n));
    if (ownFilter === 'pairready') list = list.filter((n) => hasGender(n, 'm') && hasGender(n, 'f'));
    if (ownFilter === 'gendergap') list = list.filter((n) => ownedAny(n) && !(hasGender(n, 'm') && hasGender(n, 'f')));
    return list;
  }, [q, el, work, ownFilter, box.value, pals.value]);

  return (
    <>
      <div class="pagehead">
        <h1>Paldex</h1>
        <p>All {Object.keys(pals.value).length} species with 1.0 stats, work suitabilities
          and every breeding recipe. Tap a pal for details, toggle the ones you own.</p>
      </div>
      <div class="searchbar">
        <input type="search" placeholder="Search pals…" value={q}
          onInput={(e) => setQ(e.currentTarget.value)} aria-label="Search Paldex" />
        <select value={el} onChange={(e) => setEl(e.currentTarget.value)} aria-label="Element">
          <option value="">All elements</option>
          {ELEMENTS.map((x) => <option value={x}>{x}</option>)}
        </select>
        <select value={work} onChange={(e) => setWork(e.currentTarget.value)} aria-label="Work">
          <option value="">Any work</option>
          {WORKS.map((x) => <option value={x}>{workLabel(x)}</option>)}
        </select>
        <select value={ownFilter} onChange={(e) => setOwnFilter(e.currentTarget.value)}
          aria-label="Ownership">
          <option value="">Owned + missing</option>
          <option value="owned">Owned</option>
          <option value="pairready">Owned ♂ + ♀</option>
          <option value="gendergap">Missing a gender</option>
          <option value="missing">Missing</option>
        </select>
      </div>
      <div class="pdxgrid">
        {names.map((n) => (
          <button class="palcard" onClick={() => nav(`paldex/${encodeURIComponent(n)}`)}>
            <PalIcon name={n} size={46} />
            <span class="nm">
              <b>{n}</b>
              <span class="sub">
                <ElementChips name={n} />
                {work
                  ? <span class="chip work">{workLabel(work)} <b>{pals.value[n].work[work]}</b></span>
                  : <WorkChips name={n} top={2} />}
              </span>
            </span>
            <span class="num">#{pals.value[n].number || '—'}</span>
            {ownedAny(n) && (
              <span class={`owndot${hasGender(n, 'm') && hasGender(n, 'f') ? '' : ' half'}`}
                title={hasGender(n, 'm') && hasGender(n, 'f') ? 'owned ♂ + ♀' : 'owned — one gender only'} />
            )}
          </button>
        ))}
        {!names.length && <div class="empty">Nothing matches those filters.</div>}
      </div>
      {current && pals.value[current] && (
        <Drawer name={current} onClose={() => nav('paldex')} />
      )}
    </>
  );
}
