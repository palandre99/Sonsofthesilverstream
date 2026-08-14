/** Shared presentational components. */
import { useEffect, useRef, useState } from 'preact/hooks';
import { iconFiles, pals, workLabel, topWork, type PalInfo } from '../state';

export function PalIcon({ name, size = 44, gender }: {
  name: string; size?: number; gender?: 'm' | 'f';
}) {
  const p = pals.value[name];
  const el = (p?.elements?.[0] ?? 'Neutral').toLowerCase();
  const mono = name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const file = iconFiles.value[name];
  const icon = (
    <span class={`pic el-${el}${file ? '' : ' noimg'}`}
      style={{ '--s': `${size}px` }} data-mono={mono}>
      {file && (
        <img src={file.startsWith('data:') ? file : `icons/${file}`} alt="" loading="lazy"
          onError={(e) => (e.currentTarget.parentElement!.classList.add('noimg'))} />
      )}
    </span>
  );
  if (!gender) return icon;
  return (
    <span class="gwrap">
      {icon}
      <i class={`gpin ${gender}`} title={gender === 'f' ? 'must be female' : 'must be male'}>
        {gender === 'f' ? '♀' : '♂'}
      </i>
    </span>
  );
}

export function ElementChips({ name }: { name: string }) {
  const p = pals.value[name];
  return (
    <>
      {(p?.elements ?? []).map((e) => (
        <span class={`chip el-${e.toLowerCase()}`}>{e}</span>
      ))}
    </>
  );
}

export function WorkChips({ name, top = 3 }: { name: string; top?: number }) {
  const p = pals.value[name];
  if (!p) return null;
  return (
    <>
      {topWork(p, top).map(([job, lvl]) => (
        <span class="chip work">{workLabel(job)} <b>{lvl}</b></span>
      ))}
    </>
  );
}

export function StatBars({ p }: { p: PalInfo }) {
  const rows: [string, number | null][] = [['HP', p.hp], ['ATK', p.atk], ['DEF', p.def]];
  return (
    <div class="stats">
      {rows.map(([label, v]) => (
        <div class="stat">
          <span class="sl">{label}</span>
          <span class="sb"><span style={{ width: `${Math.min(100, ((v ?? 0) / 150) * 100)}%` }} /></span>
          <span class="sv">{v ?? '—'}</span>
        </div>
      ))}
    </div>
  );
}

export function LockBadge() {
  return (
    <span class="badge warn">
      <svg viewBox="0 0 10 12" aria-hidden="true">
        <rect x="1" y="5" width="8" height="6" rx="1.4" />
        <path d="M3 5V3.4a2 2 0 0 1 4 0V5" fill="none" stroke="currentColor" stroke-width="1.5" />
      </svg>
      gender locked
    </span>
  );
}

/** Searchable pal picker with icons. */
export function PalPicker({ value, onPick, placeholder = 'Choose a pal…', filter }: {
  value: string | null;
  onPick: (name: string) => void;
  placeholder?: string;
  filter?: (name: string) => boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const all = Object.keys(pals.value).sort();
  const usable = filter ? all.filter(filter) : all;
  const matches = q
    ? usable.filter((n) => n.toLowerCase().includes(q.toLowerCase()))
    : usable;

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
  };

  return (
    <div class="picker" ref={rootRef}>
      <button type="button" onClick={() => setOpen(!open)} aria-haspopup="listbox"
        aria-expanded={open}>
        {value ? (
          <>
            <PalIcon name={value} size={34} />
            <b>{value}</b>
          </>
        ) : (
          <span class="ph">{placeholder}</span>
        )}
      </button>
      {open && (
        <div class="pop">
          <input ref={inputRef} type="text" placeholder="Search…" value={q}
            onInput={(e) => { setQ(e.currentTarget.value); setHi(0); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setHi(Math.min(hi + 1, matches.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(Math.max(hi - 1, 0)); }
              else if (e.key === 'Enter' && matches[hi]) pick(matches[hi]);
              else if (e.key === 'Escape') setOpen(false);
            }} />
          <div class="list" role="listbox">
            {matches.slice(0, 120).map((n, i) => (
              <button type="button" class={i === hi ? 'hi' : ''} role="option"
                onClick={() => pick(n)}>
                <PalIcon name={n} size={28} />
                {n}
                <span class="num">#{pals.value[n]?.number || '—'}</span>
              </button>
            ))}
            {!matches.length && <div class="empty">No pals match “{q}”</div>}
          </div>
        </div>
      )}
    </div>
  );
}
