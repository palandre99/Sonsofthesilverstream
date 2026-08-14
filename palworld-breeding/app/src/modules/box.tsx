/** My Box — ownership overview with import/export. */
import { useMemo, useState } from 'preact/hooks';
import { box, engine, palNumberSort, pals, toggleOwned } from '../state';
import { closure } from '../engine/planner';
import { ElementChips, PalIcon, WorkChips } from '../components/shared';

export function BoxPage() {
  const [q, setQ] = useState('');
  const [copied, setCopied] = useState(false);

  const owned = box.value;
  const reachable = useMemo(
    () => (owned.size ? closure(engine!, owned).size : 0),
    [owned],
  );

  const names = useMemo(() => {
    let list = Object.keys(pals.value).sort(palNumberSort);
    if (q) list = list.filter((n) => n.toLowerCase().includes(q.toLowerCase()));
    return list;
  }, [q, pals.value]);

  const exportBox = async () => {
    const text = [...owned].sort().join('\n') + '\n';
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard unavailable */ }
  };

  const importBox = () => {
    const text = prompt('Paste a pal list (one name per line):');
    if (!text) return;
    const valid = new Set(Object.keys(pals.value));
    const lower = new Map([...valid].map((n) => [n.toLowerCase(), n]));
    let added = 0;
    for (const raw of text.split(/\r?\n/)) {
      const name = lower.get(raw.trim().toLowerCase());
      if (name && !box.value.has(name)) {
        toggleOwned(name);
        added++;
      }
    }
    alert(`Added ${added} pals to your box.`);
  };

  return (
    <>
      <div class="pagehead">
        <h1>My Box</h1>
        <p>Everything you own. The Calculator sorts parent pairs by your box, and the
          Route Planner (coming next) will plan from exactly this list.</p>
      </div>
      <div class="boxstats">
        <div class="tile"><b>{owned.size}</b><span>species owned</span></div>
        <div class="tile"><b>{reachable}<i style={{ fontStyle: 'normal', fontSize: '15px', color: 'var(--muted)' }}>/299</i></b><span>reachable by breeding</span></div>
        <button class="btn" onClick={exportBox}>{copied ? 'Copied ✓' : 'Copy list'}</button>
        <button class="btn" onClick={importBox}>Import list…</button>
      </div>
      <div class="searchbar">
        <input type="search" placeholder="Search…" value={q}
          onInput={(e) => setQ(e.currentTarget.value)} aria-label="Search box" />
      </div>
      <div class="boxrows">
        {names.map((n) => {
          const has = owned.has(n);
          return (
            <div class={`boxrow${has ? '' : ' off'}`}>
              <PalIcon name={n} size={34} />
              <span>
                <div class="nm">{n}</div>
                <div class="num">#{pals.value[n].number || '—'}</div>
              </span>
              <span class="mid">
                <ElementChips name={n} />
                <WorkChips name={n} top={1} />
              </span>
              <span class="switch">
                <input type="checkbox" checked={has} onChange={() => toggleOwned(n)}
                  aria-label={`Own ${n}`} />
                <span />
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}
