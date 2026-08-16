/** Suggested goals — web parity for the mobile sheet: the same data-driven
 * card system (SectionCard preview + full CategoryBrowser with search, big
 * readable rows, add/remove on every pal, RECOMMENDED tags). The
 * attainability + scoring brain lives in ../logic/recommend.ts — one file,
 * byte-identical on web and mobile (logic-parity gate). */
import { useEffect, useMemo, useState } from 'preact/hooks';
import {
  box, engine, breedingRaw, ownedAny, pals, playerLevel, setPlayerLevel,
} from '../state';
import { PalIcon } from './shared';
import {
  attainLabel, attainScore, boxKeyOf, cachedDerivations, derivationsReady,
  getAttainContext, recommendedSet, saddleGap, scoreOf, type Attain,
} from '../logic/recommend';
import { HELPERS } from '../engine/helpers';
import { PALCALC_FACTS } from '../data/palcalcFacts.g';
import { BEST_OVERALL, COMBAT_COMMUNITY, MOUNT_CALLOUTS } from '../data/meta';
import { MOUNTS, UTILITY_ROLES } from '../data/utilityRoles.g';
import { SADDLE_LEVELS } from '../data/saddleLevels.g';

const WORK_KEYS = ['Kindling', 'Watering', 'Planting', 'Generating_Electricity',
  'Handiwork', 'Gathering', 'Lumbering', 'Mining', 'Medicine', 'Cooling',
  'Transporting', 'Farming'];
const workLabel = (j: string): string => {
  const l = j.replace(/_/g, ' ');
  return l === 'Generating Electricity' ? 'Electricity' : l;
};

/* ---------------- section data (mirrors mobile) ---------------- */

interface GoalItem {
  name: string;
  lvl?: number;
  jobs?: [string, number][];
  effect?: string;
  why?: string;
  note?: string;
  star?: boolean;
  value?: number;
}

interface SectionDef {
  id: string;
  title: string;
  gold?: boolean;
  blurb: string;
  items: GoalItem[];
  scored?: boolean;
}

function bestAt(job: string): GoalItem[] {
  const p = pals.value;
  const list = Object.keys(p)
    .map((name) => ({ name, lvl: (p[name].work ?? {})[job] ?? 0 }))
    .filter((x) => x.lvl > 0)
    .sort((a, b) => b.lvl - a.lvl
      || ((p[b.name].hp ?? 0) + (p[b.name].atk ?? 0) + (p[b.name].def ?? 0))
      - ((p[a.name].hp ?? 0) + (p[a.name].atk ?? 0) + (p[a.name].def ?? 0)));
  const top = list[0]?.lvl ?? 1;
  return list.map((x) => ({
    name: x.name, lvl: x.lvl, jobs: [[job, x.lvl]], value: x.lvl / top,
  }));
}

const CREWS = [
  {
    id: 'crew-farm', title: 'Farm crew', anchor: 'Planting',
    jobs: ['Planting', 'Gathering', 'Transporting'],
    blurb: 'Plants, gathers AND hauls — one pal running the whole farm loop. Ranked by Planting + Gathering + Transporting.',
  },
  {
    id: 'crew-log', title: 'Logging crew', anchor: 'Lumbering',
    jobs: ['Lumbering', 'Transporting'],
    blurb: 'Chops and hauls its own wood. Ranked by Lumbering + Transporting.',
  },
  {
    id: 'crew-mine', title: 'Mining crew', anchor: 'Mining',
    jobs: ['Mining', 'Transporting'],
    blurb: 'Digs and hauls its own ore. Ranked by Mining + Transporting.',
  },
  {
    id: 'crew-all', title: 'Base all-rounders', anchor: '',
    jobs: [] as string[],
    blurb: 'The widest useful pals — ranked by TOTAL work levels across every job they have.',
  },
];

function crewItems(crew: { jobs: string[]; anchor: string }): GoalItem[] {
  const p = pals.value;
  const rows = Object.keys(p)
    .map((name) => {
      const w = p[name].work ?? {};
      if (crew.anchor && !((w[crew.anchor] ?? 0) > 0)) return null;
      const jobs = crew.jobs.length ? crew.jobs : Object.keys(w);
      const score = jobs.reduce((sum, j) => sum + (w[j] ?? 0), 0);
      const parts = jobs.filter((j) => (w[j] ?? 0) > 0)
        .map((j) => [j, w[j]] as [string, number]);
      return { name, score, parts };
    })
    .filter((x): x is { name: string; score: number; parts: [string, number][] } =>
      !!x && x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 40);
  const top = rows[0]?.score ?? 1;
  return rows.map((x) => ({ name: x.name, jobs: x.parts, value: x.score / top }));
}

function fighterItems(): GoalItem[] {
  const p = pals.value;
  const rows = Object.keys(p)
    .map((name) => ({
      name, score: (p[name].atk ?? 0) * 2 + (p[name].hp ?? 0) + (p[name].def ?? 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
  const top = rows[0]?.score ?? 1;
  return rows.map((x) => ({
    name: x.name, star: COMBAT_COMMUNITY.includes(x.name), value: x.score / top,
  }));
}

const AURA_SQUAD = ['Ribbuny', 'Cinnamoth', 'Clovee', 'Petallia', 'Tetroise', 'Wumpo',
  'Amione', 'Eikthyrdeer Terra', 'Katress Ignis', 'Mycora', 'Puffolt', 'Smokie Cryst'];

function effectItems(re: RegExp): GoalItem[] {
  const p = pals.value;
  return Object.keys(p)
    .filter((n) => re.test(p[n].partner_effect ?? ''))
    .map((n) => ({ name: n, effect: p[n].partner_effect ?? undefined }));
}
const LOOT_RE = /defeated|dropped by enemies/i;
const RANCH_RE = /assigned to Ranch/i;

function helperItems(roles: string[]): GoalItem[] {
  const p = pals.value;
  return HELPERS.filter((h) => roles.includes(h.role))
    .map((h) => ({ name: h.name, effect: p[h.name]?.partner_effect ?? undefined }));
}

function utilityItems(role: keyof typeof UTILITY_ROLES): GoalItem[] {
  return UTILITY_ROLES[role].pals.map((p) => ({ name: p.name, effect: p.effect }));
}

function mountItems(names: string[]): GoalItem[] {
  const p = pals.value;
  return names.map((n) => ({
    name: n, note: MOUNT_CALLOUTS[n], effect: p[n]?.partner_effect ?? undefined,
  }));
}

function buildSections(): SectionDef[] {
  const p = pals.value;
  return [
    {
      id: 'cake', title: 'Cake supply',
      blurb: 'The four ranch pals that feed every cake — eggs, milk, honey, berries. The breeding farm stops without them.',
      items: helperItems(['ranch']),
    },
    {
      id: 'speed', title: 'Breeding speed & luck',
      blurb: 'Faster egg production, faster hatching, extra eggs — all verified partner skills.',
      items: helperItems(['speed', 'luck']),
    },
    {
      id: 'aura', title: 'Aura squad',
      blurb: 'Each gives +1 work suitability to every other pal in its base (auras don\'t stack). All twelve, verified.',
      items: AURA_SQUAD.map((n) => ({ name: n, effect: p[n]?.partner_effect ?? undefined })),
    },
    {
      id: 'bestof', title: 'The best pals in the game', gold: true,
      blurb: 'What players rate highest across everything — community consensus (game8 + pindrop, Aug 2026). Ordered by what YOU can act on now.',
      items: BEST_OVERALL.map((m) => ({
        name: m.name, why: m.why, star: COMBAT_COMMUNITY.includes(m.name),
      })),
    },
    {
      id: 'fight', title: 'Fighting', scored: true,
      blurb: 'Highest battle stats in the game data (attack counted double); ✦ marks community favourites.',
      items: fighterItems(),
    },
    {
      id: 'm-fly', title: 'Flying mounts',
      blurb: 'Every flyable pal — saddle unlock levels from paldb; speed callouts community-measured.',
      items: mountItems(MOUNTS.flying),
    },
    {
      id: 'm-ground', title: 'Ground mounts',
      blurb: 'Every ground mount, closest-to-yours first.',
      items: mountItems(MOUNTS.ground),
    },
    {
      id: 'm-glide', title: 'Gliders & swimmers',
      blurb: 'Glider partner skills plus the swimmers.',
      items: [...utilityItems('glider'), ...mountItems(MOUNTS.swim)],
    },
    {
      id: 'u-catch', title: 'Catching helpers',
      blurb: 'Better catches from the game\'s own partner skills — capture-rate boosts and slower capture-gauge drain.',
      items: utilityItems('capture'),
    },
    {
      id: 'u-weight', title: 'Weight & carrying helpers',
      blurb: 'Ore/stone/wood/food weight cuts and carry capacity — the game\'s own partner skills.',
      items: utilityItems('weight'),
    },
    {
      id: 'u-eff', title: 'Work efficiency boosters',
      blurb: 'Mining, logging and crafting multipliers from partner skills.',
      items: utilityItems('efficiency'),
    },
    {
      id: 'u-born', title: 'Born with a passive',
      blurb: '46 species are ALWAYS born carrying a passive (datamined) — catch or breed one and it\'s yours to breed onward.',
      items: Object.keys(p)
        .filter((n) => PALCALC_FACTS[n]?.passives?.length)
        .map((n) => ({ name: n, effect: `Born with: ${PALCALC_FACTS[n]!.passives!.join(' + ')}` })),
    },
    {
      id: 'u-loot', title: 'Loot boosters',
      blurb: 'More drops from enemies you defeat — element-specific hunting partners, plus Dumud Gild\'s gold bonus.',
      items: effectItems(LOOT_RE),
    },
    {
      id: 'u-ranch', title: 'Ranch producers',
      blurb: 'Every pal that makes something at the Ranch — eggs, milk, berries, wool, mushrooms and more.',
      items: effectItems(RANCH_RE),
    },
    ...CREWS.map((crew) => ({
      id: crew.id, title: crew.title, blurb: crew.blurb,
      items: crewItems(crew), scored: true,
    })),
    ...WORK_KEYS.map((w) => ({
      id: `job-${w}`, title: workLabel(w),
      blurb: `Every pal that can do ${workLabel(w)}, the best first — levels straight from the game data.`,
      items: bestAt(w), scored: true,
    })),
  ];
}

function orderItems(sec: SectionDef, attain: (n: string) => Attain): GoalItem[] {
  const items = [...sec.items];
  if (sec.scored) {
    return items.sort((a, b) =>
      scoreOf(b.value ?? 1, attain(b.name)) - scoreOf(a.value ?? 1, attain(a.name)));
  }
  return items.sort((a, b) => attainScore(attain(a.name)) - attainScore(attain(b.name)));
}

function statusColor(a: Attain, added: boolean): string {
  return added || a.kind === 'have' ? 'var(--ok)'
    : a.kind === 'breed' ? 'var(--accent-ink, var(--accent))'
      : a.kind === 'catch' ? 'var(--warn)'
        : a.unlock ? 'var(--gold-ink, var(--gold))' : 'var(--faint)';
}

/* ---------------- pieces ---------------- */

interface BrowseCtx {
  attain: (n: string) => Attain;
  stage: number;
  targets: string[];
  onAdd: (names: string[]) => void;
  onRemove: (names: string[]) => void;
}

function Chip({ name, lvl, star, bctx }: {
  name: string; lvl?: number; star?: boolean; bctx: BrowseCtx;
}) {
  const added = bctx.targets.includes(name);
  const owned = ownedAny(name);
  const a = bctx.attain(name);
  const status = added ? 'IN PLAN' : attainLabel(a).short;
  return (
    <div style={{
      position: 'relative', width: '84px', textAlign: 'center', padding: '6px 2px',
      border: `1px solid ${added ? 'var(--ok)' : 'var(--line)'}`, borderRadius: '12px',
      background: added ? 'var(--ok-soft, transparent)' : 'var(--surface)',
      opacity: owned && !added ? 0.55 : 1,
    }} title={`${name} — ${attainLabel(a).long}`}>
      {!added && !owned && (
        <button aria-label={`Add ${name} to the plan`}
          onClick={() => bctx.onAdd([name])}
          style={{
            position: 'absolute', left: '-6px', top: '-6px', width: '20px', height: '20px',
            borderRadius: '10px', border: 'none', background: 'var(--accent)',
            color: '#08191B', fontWeight: 800, cursor: 'pointer', lineHeight: 1,
          }}>+</button>
      )}
      {added && (
        <button aria-label={`Remove ${name} from the plan`}
          onClick={() => bctx.onRemove([name])}
          style={{
            position: 'absolute', left: '-6px', top: '-6px', width: '20px', height: '20px',
            borderRadius: '10px', border: '1px solid var(--line)', background: 'var(--surface)',
            color: 'inherit', fontWeight: 800, cursor: 'pointer', lineHeight: 1,
          }}>−</button>
      )}
      <PalIcon name={name} size={44} />
      {star && <span style={{ position: 'absolute', right: '4px', top: '2px' }}>✦</span>}
      <div style={{
        fontSize: '10px', fontWeight: 700, overflow: 'hidden',
        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{name}</div>
      {lvl != null && (
        <div style={{ color: 'var(--accent-ink, var(--accent))', fontSize: '10px', fontWeight: 800 }}>
          Lv {lvl}
        </div>
      )}
      <div style={{
        color: statusColor(a, added), fontSize: '8.5px', fontWeight: 800,
        overflow: 'hidden', maxHeight: '22px',
      }}>{status}</div>
    </div>
  );
}

function BrowserRow({ item, recommended, bctx }: {
  item: GoalItem; recommended: boolean; bctx: BrowseCtx;
}) {
  const added = bctx.targets.includes(item.name);
  const owned = ownedAny(item.name);
  const a = bctx.attain(item.name);
  const saddle = SADDLE_LEVELS[item.name] != null
    ? saddleGap(item.name, bctx.stage) ?? `saddle at Lv ${SADDLE_LEVELS[item.name]}`
    : null;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px',
      border: `1px solid ${added ? 'var(--ok)' : 'var(--line)'}`,
      borderRadius: '12px', padding: '10px', marginBottom: '6px',
      background: 'var(--surface)', opacity: owned && !added ? 0.6 : 1,
    }}>
      <PalIcon name={item.name} size={44} />
      <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: '2px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <strong style={{ fontSize: '14px' }}>{item.name}</strong>
          {item.star && <span>✦</span>}
          {recommended && (
            <span style={{
              background: 'var(--gold-soft, rgba(200,160,40,0.2))',
              color: 'var(--gold-ink, var(--gold))',
              borderRadius: '7px', padding: '1px 6px', fontSize: '8.5px', fontWeight: 800,
            }}>RECOMMENDED</span>
          )}
        </div>
        {item.jobs && item.jobs.length > 0 && (
          <div style={{ color: 'var(--muted)', fontSize: '11px', fontWeight: 700 }}>
            {item.jobs.map(([j, lv]) => `${workLabel(j)} ${lv}`).join(' · ')}
            {item.jobs.length > 1
              ? ` · total ${item.jobs.reduce((sum, [, lv]) => sum + lv, 0)}` : ''}
          </div>
        )}
        {(item.why ?? item.effect) && (
          <div style={{
            color: 'var(--muted)', fontSize: '11px', overflow: 'hidden',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>{item.why ?? item.effect}</div>
        )}
        <div style={{ color: statusColor(a, added), fontSize: '11px', fontWeight: 700 }}>
          {added ? 'In your plan — the circle removes it.' : attainLabel(a).long}
          {item.note ? `  ·  ${item.note}` : saddle ? `  ·  ${saddle}` : ''}
        </div>
      </div>
      {a.kind !== 'have' ? (
        <button
          aria-label={added
            ? `Remove ${item.name} from the plan` : `Add ${item.name} to the plan`}
          onClick={() => (added ? bctx.onRemove([item.name]) : bctx.onAdd([item.name]))}
          style={{
            width: '30px', height: '30px', borderRadius: '15px', flexShrink: 0,
            border: added ? '1px solid var(--line)' : 'none',
            background: added ? 'var(--surface)' : 'var(--accent)',
            color: added ? 'inherit' : '#08191B', fontWeight: 800,
            fontSize: '16px', cursor: 'pointer', lineHeight: 1,
          }}>{added ? '−' : '+'}</button>
      ) : (
        <span style={{
          color: 'var(--ok)', fontSize: '10px', fontWeight: 800, width: '58px',
        }}>In your Paldex</span>
      )}
    </div>
  );
}

function CategoryBrowser({ sec, bctx, onClose }: {
  sec: SectionDef; bctx: BrowseCtx; onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const ranked = orderItems(sec, bctx.attain);
  const rec = sec.scored
    ? recommendedSet(ranked.map((x) => ({ name: x.name, value: x.value ?? 0 })), bctx.attain)
    : new Set<string>();
  const rows = q
    ? ranked.filter((x) => x.name.toLowerCase().includes(q.toLowerCase()))
    : ranked;
  const missing = rows
    .filter((x) => !bctx.targets.includes(x.name) && !ownedAny(x.name))
    .map((x) => x.name);
  // the browser sits INSIDE the sheet's backdrop, so a bare onClick bubbled
  // up and closed the whole sheet — clicking away from a category must
  // return you to the sheet, not destroy it
  return (
    <div class="hatchback" style={{ zIndex: 60 }}
      onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div class="card bigcard" role="dialog" aria-modal="true" aria-label={sec.title}
        onClick={(e) => e.stopPropagation()}
        style={{
          maxHeight: '88vh', overflowY: 'auto', display: 'grid', gap: '8px',
          maxWidth: '640px', alignContent: 'start',
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h2 style={{ margin: 0, flex: 1 }}>{sec.title}</h2>
          <button class="btn sm" onClick={onClose}>Done</button>
        </div>
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: '12px' }}>{sec.blurb}</p>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            value={q}
            onInput={(e) => setQ((e.currentTarget as HTMLInputElement).value)}
            placeholder={`Search ${sec.items.length} pals…`}
            aria-label={`Search ${sec.title}`}
            style={{
              flex: 1, padding: '6px 10px', borderRadius: '10px',
              border: '1px solid var(--line)', background: 'var(--surface)',
              color: 'inherit', fontSize: '13px',
            }} />
          {missing.length > 1 && (
            <button class="btn sm primary" onClick={() => bctx.onAdd(missing)}>
              Add {missing.length}
            </button>
          )}
        </div>
        <div>
          {rows.map((item) => (
            <BrowserRow key={item.name} item={item}
              recommended={rec.has(item.name)} bctx={bctx} />
          ))}
          {rows.length === 0 && (
            <p style={{ color: 'var(--muted)', textAlign: 'center' }}>
              No pal here matches that search.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionCard({ sec, bctx, onBrowse }: {
  sec: SectionDef; bctx: BrowseCtx; onBrowse: (id: string) => void;
}) {
  const shown = orderItems(sec, bctx.attain).slice(0, 6);
  const missing = shown
    .filter((x) => !bctx.targets.includes(x.name) && !ownedAny(x.name))
    .map((x) => x.name);
  const inPlanHere = shown.filter((x) => bctx.targets.includes(x.name)).map((x) => x.name);
  return (
    <div class="card" style={{
      padding: '12px', display: 'grid', gap: '8px',
      borderColor: sec.gold ? 'var(--gold-soft, var(--line))' : undefined,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <h3 style={{ margin: 0, flex: 1 }}>{sec.title}</h3>
        {missing.length > 1 ? (
          <button class="btn sm primary" onClick={() => bctx.onAdd(missing)}>
            Add {missing.length}
          </button>
        ) : inPlanHere.length > 1 ? (
          <button class="btn sm" onClick={() => bctx.onRemove(inPlanHere)}>
            Remove {inPlanHere.length}
          </button>
        ) : null}
        <button class="btn sm" onClick={() => onBrowse(sec.id)}>
          All {sec.items.length} ›
        </button>
      </div>
      <p style={{ margin: 0, color: 'var(--muted)', fontSize: '12px' }}>{sec.blurb}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {shown.map((x) => (
          <Chip key={x.name} name={x.name} lvl={x.lvl} star={x.star} bctx={bctx} />
        ))}
      </div>
    </div>
  );
}

/* ---------------- the sheet ---------------- */

export function GoalsSheet({ open, onClose, targets, onAdd, onRemove }: {
  open: boolean;
  onClose: () => void;
  targets: string[];
  onAdd: (names: string[]) => void;
  /** un-add — every added pal must be removable right here (CEO 2026-08-15) */
  onRemove: (names: string[]) => void;
}) {
  const [browsing, setBrowsing] = useState<string | null>(null);
  const lvl = playerLevel.value;
  const e = engine;
  const owned = Object.keys(box.value);
  const bKey = boxKeyOf(owned);
  const dataOk = !!e && !!breedingRaw.value;
  // the reachability pass is the one expensive computation — pay it once
  // per box change, a beat after opening; reopening is instant (cached)
  const ready = dataOk && derivationsReady(owned);
  const [, bump] = useState(0);
  useEffect(() => {
    if (!open || ready || !e) return;
    const t = setTimeout(() => {
      cachedDerivations(e, owned);
      bump((x) => x + 1);
    }, 30);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, bKey, ready]);
  const ctx = useMemo(
    () => (ready && e && breedingRaw.value
      ? getAttainContext(e, pals.value, breedingRaw.value, owned, lvl, ownedAny)
      : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, bKey, lvl],
  );
  const sections = useMemo(buildSections, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') (browsing ? setBrowsing(null) : onClose());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, browsing]);
  if (!open) return null;
  if (!ready || !ctx) {
    return (
      <div class="hatchback" onClick={onClose}>
        <div class="card bigcard" role="dialog" aria-modal="true" aria-label="Suggested goals"
          onClick={(ev) => ev.stopPropagation()}
          style={{ maxWidth: '680px', padding: '32px', textAlign: 'center' }}>
          Reading your save…
        </div>
      </div>
    );
  }

  const bctx: BrowseCtx = {
    attain: ctx.attain, stage: ctx.stage, targets, onAdd, onRemove,
  };
  const browsingSec = browsing ? sections.find((x) => x.id === browsing) : null;

  return (
    <div class="hatchback" onClick={onClose}>
      <div class="card bigcard" role="dialog" aria-modal="true" aria-label="Suggested goals"
        onClick={(e2) => e2.stopPropagation()}
        style={{ maxHeight: '86vh', overflowY: 'auto', display: 'grid', gap: '10px', maxWidth: '680px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h2 style={{ margin: 0, flex: 1 }}>Suggested goals</h2>
          <button class="btn sm" onClick={onClose}>Done</button>
        </div>
        <label style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          color: 'var(--accent-ink, var(--accent))', fontSize: '11.5px', fontWeight: 700,
        }}>
          {lvl != null
            ? `Tuned to your level ${lvl}`
            : 'Tuned to your pals — set your level for sharper picks:'}
          <input type="number" min={1} max={100} value={lvl ?? ''}
            aria-label="Your player level"
            onChange={(e2) => {
              const v = (e2.currentTarget as HTMLInputElement).value;
              setPlayerLevel(v ? Number(v) : undefined);
            }}
            style={{
              width: '64px', padding: '2px 6px', borderRadius: '8px',
              border: '1px solid var(--line)', background: 'var(--surface)',
              color: 'inherit', fontSize: '12px',
            }} />
        </label>
        {sections.map((sec) => (
          <SectionCard key={sec.id} sec={sec} bctx={bctx} onBrowse={setBrowsing} />
        ))}
      </div>
      {browsingSec && (
        <CategoryBrowser sec={browsingSec} bctx={bctx}
          onClose={() => setBrowsing(null)} />
      )}
    </div>
  );
}
