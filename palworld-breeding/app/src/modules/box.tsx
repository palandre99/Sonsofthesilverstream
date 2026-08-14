/** My Box — ownership overview with import/export. */
import { useMemo, useState } from 'preact/hooks';
import { box, engine, ownedAny, pairReadyCount, palNumberSort, pals, toggleOwned } from '../state';
import { closure } from '../engine/planner';
import { ElementChips, GenderToggles, PalIcon, WorkChips } from '../components/shared';

export function BoxPage() {
  const [q, setQ] = useState('');
  const [copied, setCopied] = useState(false);

  const owned = box.value;
  const ownedNames = Object.keys(owned);
  const reachable = useMemo(
    () => (ownedNames.length ? closure(engine!, ownedNames).size : 0),
    [owned],
  );

  const names = useMemo(() => {
    let list = Object.keys(pals.value).sort(palNumberSort);
    if (q) list = list.filter((n) => n.toLowerCase().includes(q.toLowerCase()));
    return list;
  }, [q, pals.value]);

  const exportBox = async () => {
    const text = ownedNames.sort().join('\n') + '\n';
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
      if (name && !ownedAny(name)) {
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
        <p>Everything you own — with gender detail, because two females can't breed.
          Tap ♂ and ♀ for each species you have. The Calculator and the Route Planner
          only call a pair "ready" when the genders actually work out.</p>
      </div>
      <div class="boxstats">
        <div class="tile"><b>{ownedNames.length}</b><span>species owned</span></div>
        <div class="tile"><b>{pairReadyCount.value}</b><span>with ♂ + ♀</span></div>
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
          const has = ownedAny(n);
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
              <GenderToggles name={n} />
            </div>
          );
        })}
      </div>
    </>
  );
}
