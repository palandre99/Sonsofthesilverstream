/** My Box — ownership with gender detail, filters, bulk actions and
 * proper import/export (no prompt()/alert() — a real panel with preview). */
import { useMemo, useState } from 'preact/hooks';
import {
  box, engine, hasGender, ownedAny, pairReadyCount, palNumberSort, pals,
  toggleOwned, type OwnedGenders,
} from '../state';
import { closure } from '../engine/planner';
import { ElementChips, GenderToggles, PalIcon, WorkChips } from '../components/shared';

type Filter = 'all' | 'owned' | 'missing' | 'pairready' | 'onegender';

const FILTERS: [Filter, string][] = [
  ['all', 'All'],
  ['owned', 'Owned'],
  ['missing', 'Missing'],
  ['pairready', '♂ + ♀ ready'],
  ['onegender', 'One gender only'],
];

/** Parse a pasted roster: plain names (one per line) or exported JSON. */
function parseImport(text: string, valid: Set<string>): {
  entries: [string, OwnedGenders][]; unknown: string[];
} {
  const lower = new Map([...valid].map((n) => [n.toLowerCase(), n]));
  const entries: [string, OwnedGenders][] = [];
  const unknown: string[] = [];
  const trimmed = text.trim();

  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      const source = (obj.box ?? obj) as Record<string, unknown>;
      for (const [k, v] of Object.entries(source)) {
        const name = lower.get(k.toLowerCase());
        if (!name) { unknown.push(k); continue; }
        const g = v as Partial<OwnedGenders> | boolean;
        const owned: OwnedGenders = typeof g === 'object' && g !== null
          ? { m: !!g.m, f: !!g.f }
          : { m: true, f: true };
        if (owned.m || owned.f) entries.push([name, owned]);
      }
      return { entries, unknown };
    } catch { /* fall through to line parsing */ }
  }

  for (const raw of trimmed.split(/\r?\n/)) {
    const line = raw.trim().replace(/^[-*•]\s*/, '');
    if (!line || line.startsWith('#')) continue;
    // allow "Name ♂", "Name ♀", "Name m/f" suffixes
    const m = /^(.*?)(?:\s*[·|,]?\s*(♂|♀|\bm\b|\bf\b))?$/i.exec(line);
    const name = lower.get((m?.[1] ?? line).trim().toLowerCase());
    if (!name) { unknown.push(line); continue; }
    const g = (m?.[2] ?? '').toLowerCase();
    const prev = entries.find(([n]) => n === name);
    const add: OwnedGenders = g === '♂' || g === 'm' ? { m: true, f: false }
      : g === '♀' || g === 'f' ? { m: false, f: true }
      : { m: true, f: true };
    if (prev) { prev[1] = { m: prev[1].m || add.m, f: prev[1].f || add.f }; }
    else entries.push([name, add]);
  }
  return { entries, unknown };
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
    localStorage.setItem('hatchlab-box-v2', JSON.stringify(next));
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
          <span>Replace my box instead of merging</span>
        </label>
      </div>
      {parsed.unknown.length > 0 && (
        <p class="dim small">Not recognised: {parsed.unknown.slice(0, 8).join(', ')}
          {parsed.unknown.length > 8 ? ` and ${parsed.unknown.length - 8} more` : ''}</p>
      )}
      <div class="importbtns">
        <button class="btn primary" disabled={!parsed.entries.length} onClick={apply}>
          {replace ? 'Replace box' : 'Add'} {parsed.entries.length || ''} pals
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
      <h2>Clear the whole box?</h2>
      <p>This removes all {n} species from your box on this device. Your plan
        check-offs are kept. Consider copying a JSON backup first.</p>
      <div class="importbtns">
        <button class="btn danger" onClick={() => {
          box.value = {};
          localStorage.setItem('hatchlab-box-v2', '{}');
          onClose();
        }}>Yes, clear {n} species</button>
        <button class="btn" onClick={onClose}>Keep my box</button>
      </div>
    </div>
  );
}

export function BoxPage() {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [element, setElement] = useState('all');
  const [panel, setPanel] = useState<'none' | 'import' | 'clear'>('none');
  const [copied, setCopied] = useState<'' | 'list' | 'json'>('');

  const owned = box.value;
  const ownedNames = Object.keys(owned);
  const reachable = useMemo(
    () => (ownedNames.length ? closure(engine!, ownedNames).size : 0),
    [owned],
  );

  const elements = useMemo(() => {
    const set = new Set<string>();
    for (const p of Object.values(pals.value)) for (const e of p.elements ?? []) set.add(e);
    return [...set].sort();
  }, [pals.value]);

  const names = useMemo(() => {
    let list = Object.keys(pals.value).sort(palNumberSort);
    if (q) list = list.filter((n) => n.toLowerCase().includes(q.toLowerCase()));
    if (element !== 'all') {
      list = list.filter((n) => (pals.value[n].elements ?? []).includes(element));
    }
    switch (filter) {
      case 'owned': return list.filter(ownedAny);
      case 'missing': return list.filter((n) => !ownedAny(n));
      case 'pairready': return list.filter((n) => hasGender(n, 'm') && hasGender(n, 'f'));
      case 'onegender':
        return list.filter((n) => ownedAny(n) && !(hasGender(n, 'm') && hasGender(n, 'f')));
      default: return list;
    }
  }, [q, filter, element, pals.value, owned]);

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

  /** Mark every currently filtered pal as fully owned (or un-owned). */
  const bulkSet = (val: boolean) => {
    const next = { ...box.value };
    for (const n of names) {
      if (val) next[n] = { m: true, f: true };
      else delete next[n];
    }
    box.value = next;
    localStorage.setItem('hatchlab-box-v2', JSON.stringify(next));
  };

  return (
    <>
      <div class="pagehead">
        <h1>My Box</h1>
        <p>Everything you own — with gender detail, because two females can't breed.
          Tap ♂ and ♀ for each species. The Calculator and the Route Planner only
          call a pair "ready" when the genders actually work out.</p>
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
        <input type="search" placeholder="Search…" value={q}
          onInput={(e) => setQ(e.currentTarget.value)} aria-label="Search box" />
        <select value={element} aria-label="Filter by element"
          onChange={(e) => setElement(e.currentTarget.value)}>
          <option value="all">All elements</option>
          {elements.map((e) => <option value={e}>{e}</option>)}
        </select>
      </div>
      <div class="filterrow" role="tablist" aria-label="Ownership filter">
        {FILTERS.map(([id, label]) => (
          <button role="tab" aria-selected={filter === id}
            class={`fbtn${filter === id ? ' on' : ''}`}
            onClick={() => setFilter(id)}>{label}</button>
        ))}
        <span class="dim small" style={{ marginLeft: 'auto' }}>{names.length} shown</span>
        {filter !== 'all' || q || element !== 'all' ? (
          <span class="bulkbtns">
            <button class="btn sm" onClick={() => bulkSet(true)}>Own all shown</button>
            <button class="btn sm" onClick={() => bulkSet(false)}>Un-own all shown</button>
          </span>
        ) : null}
      </div>
      <div class="boxrows">
        {names.map((n) => {
          const has = ownedAny(n);
          return (
            <div class={`boxrow${has ? '' : ' off'}`}>
              <button class="rowmain" onClick={() => toggleOwned(n)}
                aria-label={`Toggle ownership of ${n}`}>
                <PalIcon name={n} size={34} />
                <span>
                  <div class="nm">{n}</div>
                  <div class="num">#{pals.value[n].number || '—'}</div>
                </span>
              </button>
              <span class="mid">
                <ElementChips name={n} />
                <WorkChips name={n} top={1} />
              </span>
              <GenderToggles name={n} />
            </div>
          );
        })}
        {names.length === 0 && <div class="empty">Nothing matches this filter.</div>}
      </div>
    </>
  );
}
