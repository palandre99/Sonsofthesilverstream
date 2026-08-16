/** Shared presentational components. */
import { useEffect, useRef, useState } from 'preact/hooks';
import { hasGender, iconFiles, ownedAny, pals, setOwnedGender, topWork, workLabel, type PalInfo } from '../state';
import { rarityTint } from '../data/rarity';
import iKindling from '../assets/work/Kindling.png';
import iWatering from '../assets/work/Watering.png';
import iPlanting from '../assets/work/Planting.png';
import iElectric from '../assets/work/ElectricityGeneration.png';
import iHandiwork from '../assets/work/Handiwork.png';
import iGathering from '../assets/work/Gathering.png';
import iLumbering from '../assets/work/Lumbering.png';
import iMining from '../assets/work/Mining.png';
import iMedicine from '../assets/work/MedicineProduction.png';
import iCooling from '../assets/work/Cooling.png';
import iTransporting from '../assets/work/Transporting.png';
import iFarming from '../assets/work/Farming.png';

/** The game's own work-suitability icons (game dump via palcalc). */
const WORK_ICONS: Record<string, string> = {
  Kindling: iKindling, Watering: iWatering, Planting: iPlanting,
  Generating_Electricity: iElectric, Handiwork: iHandiwork,
  Gathering: iGathering, Lumbering: iLumbering, Mining: iMining,
  Medicine: iMedicine, Cooling: iCooling, Transporting: iTransporting,
  Farming: iFarming,
};

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

export function WorkChips({ name, top = 3, all = false }: {
  name: string; top?: number; all?: boolean;
}) {
  const p = pals.value[name];
  if (!p) return null;
  const jobs = all
    ? (Object.entries(p.work ?? {}).sort((a, b) => b[1] - a[1]) as [string, number][])
    : topWork(p, top);
  // 75 of the 299 pals do more jobs than a compact row can show (Beegarde does
  // seven). Cutting the list and saying nothing read as the whole answer, so
  // the row now admits what it left out — same rule as the catch hints.
  const hidden = Object.keys(p.work ?? {}).length - jobs.length;
  return (
    <>
      {jobs.map(([job, lvl]) => (
        <span key={job} class="chip work" title={workLabel(job)}>
          {WORK_ICONS[job]
            ? <img src={WORK_ICONS[job]} alt={workLabel(job)} />
            : workLabel(job)}{' '}
          <b>{lvl}</b>
        </span>
      ))}
      {!all && hidden > 0 && (
        <span class="chip work" style="opacity:.65"
          title={`and ${hidden} more job${hidden === 1 ? '' : 's'}`}>
          +{hidden}
        </span>
      )}
    </>
  );
}

export function StatBars({ p, boost = 0 }: { p: PalInfo; boost?: number }) {
  const up = (v: number | null) => (v == null ? v : Math.round(v * (1 + boost)));
  const rows: [string, number | null][] = [['HP', up(p.hp)], ['ATK', up(p.atk)], ['DEF', up(p.def)]];
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
      {/* named the mechanic, not the consequence — the parents beside it
          already show which must be ♀ and which ♂ (matches the phone) */}
      only works with the genders shown
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
  const [own, setOwn] = useState<'all' | 'owned' | 'missing'>('all');
  const [el, setEl] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const all = Object.keys(pals.value).sort();
  const usable = filter ? all.filter(filter) : all;
  let matches = q
    ? usable.filter((n) => n.toLowerCase().includes(q.toLowerCase()))
    : usable;
  if (el) matches = matches.filter((n) => pals.value[n].elements.includes(el));
  if (own === 'owned') matches = matches.filter(ownedAny);
  if (own === 'missing') matches = matches.filter((n) => !ownedAny(n));

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
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap', padding: '6px 6px 2px' }}>
            {(['all', 'missing', 'owned'] as const).map((o) => (
              <button type="button" key={o} class={`fbtn${own === o ? ' on' : ''}`}
                style={{ fontSize: '11px', padding: '3px 8px' }}
                onClick={() => { setOwn(o); setHi(0); }}>
                {o === 'all' ? 'All' : o === 'owned' ? 'Owned' : 'Missing'}
              </button>
            ))}
            {['Neutral', 'Fire', 'Water', 'Grass', 'Electric', 'Ice', 'Ground', 'Dark', 'Dragon'].map((e) => (
              <button type="button" key={e} class={`fbtn${el === e ? ' on' : ''}`}
                aria-label={`Filter ${e}`} title={e}
                style={{ fontSize: '11px', padding: '3px 6px' }}
                onClick={() => { setEl(el === e ? null : e); setHi(0); }}>
                {e.slice(0, 3)}
              </button>
            ))}
            <span class="dim small" style={{ marginLeft: 'auto' }}>{matches.length}</span>
          </div>
          <div class="list" role="listbox">
            {matches.slice(0, 120).map((n, i) => (
              <button type="button" class={i === hi ? 'hi' : ''} role="option"
                style={{ borderLeft: `3px solid ${rarityTint(pals.value[n]?.rarity, 'transparent')}` }}
                onClick={() => pick(n)}>
                <PalIcon name={n} size={28} />
                {n}
                <span class="num">#{pals.value[n]?.number || '—'}</span>
                {/* what the pal can DO — the picker showed only its name, so
                    you could not tell a miner from a lumberjack while
                    choosing (CEO 2026-08-16, same fix as the phone) */}
                <span class="pickerjobs">
                  <WorkChips name={n} top={3} />
                </span>
              </button>
            ))}
            {!matches.length && <div class="empty">No pals match “{q}”</div>}
          </div>
        </div>
      )}
    </div>
  );
}


/** ♂/♀ ownership toggles for one species. */
export function GenderToggles({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  return (
    <span class={`gtoggles ${size}`}>
      {(['m', 'f'] as const).map((g) => {
        const on = hasGender(name, g);
        return (
          <button type="button" class={`gt ${g}${on ? ' on' : ''}`}
            aria-pressed={on}
            aria-label={`I have a ${g === 'm' ? 'male' : 'female'} ${name}`}
            title={`I have a ${g === 'm' ? 'male' : 'female'} ${name}`}
            onClick={(e) => { e.stopPropagation(); setOwnedGender(name, g, !on); }}>
            {g === 'm' ? '♂' : '♀'}
          </button>
        );
      })}
    </span>
  );
}
