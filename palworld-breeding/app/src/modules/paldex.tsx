/** Paldex — the encyclopedia AND your collection, one page.
 *
 * Every species with stats, recipes and search — and ownership lives right
 * here: ♂/♀ toggles on each row, import/export, bulk actions. (The separate
 * "My Box" tab was folded in — two near-identical lists confused the one
 * user who matters.)
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  box, breedingRaw, engine, hasGender, nav, ownedAny, pairReadyCount,
  palNumberSort, pals, route, selfOnly, storage, workLabel,
  type OwnedGenders,
} from '../state';
import { closure } from '../engine/planner';
import { ElementChips, GenderToggles, LockBadge, PalIcon, StatBars, WorkChips } from '../components/shared';

const ELEMENTS = ['Neutral', 'Fire', 'Water', 'Grass', 'Electric', 'Ice', 'Ground', 'Dark', 'Dragon'];
const WORKS = ['Kindling', 'Watering', 'Planting', 'Generating_Electricity', 'Handiwork',
  'Gathering', 'Lumbering', 'Mining', 'Medicine', 'Cooling', 'Transporting', 'Farming'];

type OwnFilter = 'all' | 'owned' | 'missing' | 'pairready' | 'onegender';
const OWN_FILTERS: [OwnFilter, string][] = [
  ['all', 'All'],
  ['owned', 'Owned'],
  ['missing', 'Missing'],
  ['pairready', '♂ + ♀ ready'],
  ['onegender', 'One gender only'],
];

/* ---------------- import / clear (moved from the old My Box tab) ---------------- */

/** Parse a pasted roster: plain names (one per line) or exported JSON. */
export function parseImport(text: string, valid: Set<string>): {
  entries: [string, OwnedGenders][]; unknown: string[];
} {
  const lower = new Map([...valid].map((n) => [n.toLowerCase(), n]));
  const byName = new Map<string, OwnedGenders>();
  const unknown: string[] = [];
  const trimmed = text.trim();

  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      const source = (obj.box ?? obj) as Record<string, unknown>;
      for (const [k, v] of Object.entries(source)) {
        const name = lower.get(k.toLowerCase());
        if (!name) { unknown.push(k); continue; }
        // only `true` or an {m,f} object mean "owned" — false/null/other
        // must NOT resurrect a species as owned
        let owned: OwnedGenders | null = null;
        if (v === true) owned = { m: true, f: true };
        else if (typeof v === 'object' && v !== null) {
          const g = v as Partial<OwnedGenders>;
          owned = { m: g.m === true, f: g.f === true };
        }
        if (owned && (owned.m || owned.f)) byName.set(name, owned);
      }
      return { entries: [...byName], unknown };
    } catch { /* fall through to line parsing */ }
  }

  for (const raw of trimmed.split(/\r?\n/)) {
    const line = raw.trim().replace(/^[-*•]\s*/, '');
    if (!line || line.startsWith('#')) continue;
    const m = /^(.*?)(?:\s*[·|,]?\s*(♂|♀|\bm\b|\bf\b))?$/i.exec(line);
    const name = lower.get((m?.[1] ?? line).trim().toLowerCase());
    if (!name) { unknown.push(line); continue; }
    const g = (m?.[2] ?? '').toLowerCase();
    const add: OwnedGenders = g === '♂' || g === 'm' ? { m: true, f: false }
      : g === '♀' || g === 'f' ? { m: false, f: true }
      : { m: true, f: true };
    const prev = byName.get(name);
    byName.set(name, prev ? { m: prev.m || add.m, f: prev.f || add.f } : add);
  }
  return { entries: [...byName], unknown };
}

function ImportPanel({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('');
  const [replace, setReplace] = useState(false);
  const valid = useMemo(() => new Set(Object.keys(pals.value)), [pals.value]);
  const parsed = useMemo(() => parseImport(text, valid), [text, valid]);

  const apply = () => {
    const next: Record<string, OwnedGenders> = replace ? {} : { ...box.value };
    for (const [name, g] of parsed.entries) {
      const cur = next[name];
      next[name] = cur ? { m: cur.m || g.m, f: cur.f || g.f } : g;
    }
    box.value = next;
    storage.set('hatchlab-box-v2', JSON.stringify(next));
    onClose();
  };

  return (
    <div class="card bigcard importpanel">
      <h2>Import a pal list</h2>
      <p>Paste plain names (one per line, optional ♂/♀ suffix) or a JSON backup
        exported from this page. Nothing is applied until you confirm.</p>
      <textarea rows={8} value={text} placeholder={'Anubis\nKatress ♀\nWixen ♂\n…'}
        aria-label="Pal list to import"
        onInput={(e) => setText(e.currentTarget.value)} />
      <div class="importmeta">
        <span class={parsed.entries.length ? 'okink' : 'dim'}>
          {parsed.entries.length} recognised
        </span>
        {parsed.unknown.length > 0 && (
          <span class="warnink" title={parsed.unknown.slice(0, 12).join(', ')}>
            {parsed.unknown.length} not recognised
          </span>
        )}
        <label class="inlinecheck" style={{ margin: 0 }}>
          <input type="checkbox" checked={replace}
            onChange={(e) => setReplace(e.currentTarget.checked)} />
          <span>Replace my collection instead of merging</span>
        </label>
      </div>
      {parsed.unknown.length > 0 && (
        <p class="dim small">Not recognised: {parsed.unknown.slice(0, 8).join(', ')}
          {parsed.unknown.length > 8 ? ` and ${parsed.unknown.length - 8} more` : ''}</p>
      )}
      <div class="importbtns">
        <button class="btn primary" disabled={!parsed.entries.length} onClick={apply}>
          {replace ? 'Replace collection' : 'Add'} {parsed.entries.length || ''} pals
        </button>
        <button class="btn" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

function ClearPanel({ onClose }: { onClose: () => void }) {
  const n = Object.keys(box.value).length;
  return (
    <div class="card bigcard importpanel dangerpanel">
      <h2>Clear the whole collection?</h2>
      <p>This removes all {n} species from your collection on this device. Your
        plan check-offs are kept. Consider copying a JSON backup first.</p>
      <div class="importbtns">
        <button class="btn danger" onClick={() => {
          box.value = {};
          storage.set('hatchlab-box-v2', '{}');
          onClose();
        }}>Yes, clear {n} species</button>
        <button class="btn" onClick={onClose}>Keep my collection</button>
      </div>
    </div>
  );
}

/* ---------------- detail drawer (unchanged behavior) ---------------- */

function Drawer({ name, onClose }: { name: string; onClose: () => void }) {
  const p = pals.value[name];
  const raw = breedingRaw.value!;
  const closeRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !drawerRef.current) return;
      const focusables = drawerRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const inside = drawerRef.current.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, [name, onClose]);

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
      <aside class="drawer" role="dialog" aria-modal="true" aria-label={name} ref={drawerRef}>
        <button class="close" ref={closeRef} onClick={onClose} aria-label="Close">✕</button>
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
          <span>In my collection
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
                <span key={job} class="chip work">{workLabel(job)} <b>{lvl}</b></span>
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
                <div key={c.parents.join()} class="recipe-line">
                  <span class="badge unique">unique</span>
                  <PalIcon name={c.parents[0]} size={26} /> {c.parents[0]}
                  <span class="plus">+</span>
                  <PalIcon name={c.parents[1]} size={26} /> {c.parents[1]}
                  <span class="eq">=</span> {name}
                </div>
              ))}
              {gendered.filter((g) => g.child === name).map((g) => (
                <div key={g.mother} class="recipe-line">
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
                onClick={() => nav(`calc/${encodeURIComponent(name)}`)}>
                All parent pairs for {name} →
              </button>
            </div>
          )}
        </section>

        {(asParent.length > 0 || gendered.some((g) => g.child !== name)) && (
          <section>
            <h4>Special recipes as a parent</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {asParent.map((c) => {
                const other = c.parents[0] === name ? c.parents[1] : c.parents[0];
                return (
                  <div key={c.child} class="recipe-line">
                    {name} <span class="plus">+</span>
                    <PalIcon name={other} size={26} /> {other}
                    <span class="eq">=</span>
                    <PalIcon name={c.child} size={26} /> {c.child}
                  </div>
                );
              })}
              {gendered.filter((g) => g.child !== name).map((g) => (
                <div key={g.child} class="recipe-line">
                  <LockBadge />
                  <PalIcon name={g.mother} size={26} gender="f" /> {g.mother}
                  <span class="plus">+</span>
                  <PalIcon name={g.father} size={26} gender="m" /> {g.father}
                  <span class="eq">=</span>
                  <PalIcon name={g.child} size={26} /> {g.child}
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <h4>In the wild</h4>
          <div class="kv">
            {p.wild
              ? p.regions.map((r) => <span key={r} class="chip">{r}</span>)
              : <span class="badge plain">no regular wild spawn</span>}
            {p.egg_types.map((e) => <span key={e} class="chip">🥚 {e}</span>)}
          </div>
        </section>
      </aside>
    </>
  );
}

/* ---------------- the merged page ---------------- */

export function PaldexPage() {
  const [q, setQ] = useState('');
  const [el, setEl] = useState('');
  const [work, setWork] = useState('');
  const [ownFilter, setOwnFilter] = useState<OwnFilter>('all');
  const [panel, setPanel] = useState<'none' | 'import' | 'clear'>('none');
  const [copied, setCopied] = useState<'' | 'list' | 'json'>('');
  const [armUnown, setArmUnown] = useState(false);
  const current = route.value.page === 'paldex' ? route.value.pal : undefined;

  const owned = box.value;
  const ownedNames = Object.keys(owned);
  const reachable = useMemo(
    () => (ownedNames.length ? closure(engine!, ownedNames).size : 0),
    [owned],
  );

  const names = useMemo(() => {
    let list = Object.keys(pals.value).sort(palNumberSort);
    if (q) list = list.filter((n) => n.toLowerCase().includes(q.toLowerCase()));
    if (el) list = list.filter((n) => pals.value[n].elements.includes(el));
    if (work) {
      list = list
        .filter((n) => (pals.value[n].work ?? {})[work] !== undefined)
        .sort((a, b) => (pals.value[b].work[work] ?? 0) - (pals.value[a].work[work] ?? 0));
    }
    switch (ownFilter) {
      case 'owned': return list.filter(ownedAny);
      case 'missing': return list.filter((n) => !ownedAny(n));
      case 'pairready': return list.filter((n) => hasGender(n, 'm') && hasGender(n, 'f'));
      case 'onegender':
        return list.filter((n) => ownedAny(n) && !(hasGender(n, 'm') && hasGender(n, 'f')));
      default: return list;
    }
  }, [q, el, work, ownFilter, box.value, pals.value]);

  // a different filter/search shows a different set — disarm the bulk delete
  useEffect(() => setArmUnown(false), [q, el, work, ownFilter]);

  const copy = async (what: 'list' | 'json') => {
    const text = what === 'list'
      ? ownedNames.sort().map((n) => {
          const g = owned[n];
          const suffix = g.m && g.f ? '' : g.m ? ' ♂' : ' ♀';
          return n + suffix;
        }).join('\n') + '\n'
      : JSON.stringify({ hatchlab: 1, exported: new Date().toISOString().slice(0, 10), box: owned }, null, 1);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(''), 1800);
    } catch { /* clipboard unavailable */ }
  };

  const bulkSet = (val: boolean) => {
    const next = { ...box.value };
    for (const n of names) {
      if (val) next[n] = { m: true, f: true };
      else delete next[n];
    }
    box.value = next;
    storage.set('hatchlab-box-v2', JSON.stringify(next));
  };

  const filtered = ownFilter !== 'all' || q || el || work;

  return (
    <>
      <div class="pagehead">
        <h1>Paldex</h1>
        <p>All {Object.keys(pals.value).length} species — and your collection in the
          same place. Tap ♂ and ♀ for what you own (two females can't breed, so the
          planner needs to know); tap a pal for stats and every breeding recipe.</p>
      </div>

      <div class="boxstats">
        <div class="tile"><b>{ownedNames.length}</b><span>species owned</span></div>
        <div class="tile"><b>{pairReadyCount.value}</b><span>with ♂ + ♀</span></div>
        <div class="tile"><b>{reachable}<i style={{ fontStyle: 'normal', fontSize: '15px', color: 'var(--muted)' }}>/{Object.keys(pals.value).length}</i></b><span>reachable by breeding</span></div>
        <div class="boxactions">
          <button class="btn" onClick={() => copy('list')}>{copied === 'list' ? 'Copied ✓' : 'Copy list'}</button>
          <button class="btn" onClick={() => copy('json')}>{copied === 'json' ? 'Copied ✓' : 'Copy JSON backup'}</button>
          <button class="btn" onClick={() => setPanel(panel === 'import' ? 'none' : 'import')}>Import…</button>
          <button class="btn" onClick={() => setPanel(panel === 'clear' ? 'none' : 'clear')}
            disabled={!ownedNames.length}>Clear…</button>
        </div>
      </div>

      {panel === 'import' && <ImportPanel onClose={() => setPanel('none')} />}
      {panel === 'clear' && <ClearPanel onClose={() => setPanel('none')} />}

      <div class="searchbar">
        <input type="search" placeholder="Search pals…" value={q}
          onInput={(e) => setQ(e.currentTarget.value)} aria-label="Search Paldex" />
        <select value={el} onChange={(e) => setEl(e.currentTarget.value)} aria-label="Element">
          <option value="">All elements</option>
          {ELEMENTS.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <select value={work} onChange={(e) => setWork(e.currentTarget.value)} aria-label="Work">
          <option value="">Any work</option>
          {WORKS.map((x) => <option key={x} value={x}>{workLabel(x)}</option>)}
        </select>
      </div>
      <div class="filterrow" role="group" aria-label="Ownership filter">
        {OWN_FILTERS.map(([id, label]) => (
          <button key={id} aria-pressed={ownFilter === id}
            class={`fbtn${ownFilter === id ? ' on' : ''}`}
            onClick={() => setOwnFilter(id)}>{label}</button>
        ))}
        <span class="dim small" style={{ marginLeft: 'auto' }}>{names.length} shown</span>
        {filtered ? (
          <span class="bulkbtns">
            <button class="btn sm" onClick={() => bulkSet(true)}>Own all shown</button>
            <button class={`btn sm${armUnown ? ' danger' : ''}`}
              onClick={() => {
                if (!armUnown) { setArmUnown(true); return; }
                bulkSet(false);
                setArmUnown(false);
              }}>
              {armUnown ? `Really un-own ${names.filter(ownedAny).length}?` : 'Un-own all shown'}
            </button>
          </span>
        ) : null}
      </div>

      <div class="boxrows">
        {names.map((n) => {
          const has = ownedAny(n);
          return (
            <div key={n} class={`boxrow${has ? '' : ' off'}`}>
              <button class="rowmain" onClick={() => nav(`paldex/${encodeURIComponent(n)}`)}
                aria-label={`Open ${n}`}>
                <PalIcon name={n} size={38} />
                <span>
                  <div class="nm">{n}</div>
                  <div class="num">#{pals.value[n].number || '—'}</div>
                </span>
              </button>
              <span class="mid">
                <ElementChips name={n} />
                {work
                  ? <span class="chip work">{workLabel(work)} <b>{pals.value[n].work[work]}</b></span>
                  : <WorkChips name={n} top={1} />}
              </span>
              <GenderToggles name={n} />
            </div>
          );
        })}
        {!names.length && <div class="empty">Nothing matches those filters.</div>}
      </div>

      {current && pals.value[current] && (
        <Drawer name={current} onClose={() => nav('paldex')} />
      )}
    </>
  );
}
