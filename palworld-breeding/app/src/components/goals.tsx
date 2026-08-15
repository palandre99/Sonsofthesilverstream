/** Suggested goals — web parity for the mobile sheet (same brain, same
 * sections): squads from the verified helper registry, community-consensus
 * best-in-game (labelled, data/meta.ts), fighting by dump stats, mounts with
 * saddle levels, utility squads from partner-skill text, dynamic per-job
 * lists — every chip stage-aware from THIS box via one derivations pass. */
import { useEffect, useMemo, useState } from 'preact/hooks';
import { box, engine, breedingRaw, ownedAny, pals } from '../state';
import { PalIcon } from './shared';
import { derivations } from '../engine/planner';
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

const AURA_SQUAD = ['Ribbuny', 'Cinnamoth', 'Clovee', 'Petallia', 'Tetroise', 'Wumpo',
  'Amione', 'Eikthyrdeer Terra', 'Katress Ignis', 'Mycora', 'Puffolt', 'Smokie Cryst'];

/** effect squads built from the game's own partner-skill text */
function palsWithEffect(re: RegExp): string[] {
  const p = pals.value;
  return Object.keys(p).filter((n) => re.test(p[n].partner_effect ?? ''));
}
const LOOT_RE = /defeated|dropped by enemies/i;
const RANCH_RE = /assigned to Ranch/i;

type Attain =
  | { kind: 'have' }
  | { kind: 'breed'; steps: number }
  | { kind: 'catch'; lv: number }
  | { kind: 'later'; unlock?: string };

function attainFactory(): (n: string) => Attain {
  const owned = Object.keys(box.value);
  const e = engine;
  const derivs = e && owned.length
    ? derivations(e, new Set(owned)) : new Map<string, Set<string>>();
  const stage = Math.max(15, ...owned.map((n) => PALCALC_FACTS[n]?.maxWild ?? 0));
  const catchable = (n: string): boolean => {
    const f = PALCALC_FACTS[n];
    return !!pals.value[n]?.wild && f?.minWild != null && f.minWild <= stage + 10;
  };
  return (n: string): Attain => {
    if (ownedAny(n)) return { kind: 'have' };
    const d = derivs.get(n);
    if (d) return { kind: 'breed', steps: Math.max(1, d.size) };
    if (catchable(n)) return { kind: 'catch', lv: PALCALC_FACTS[n]!.minWild! };
    for (const c of breedingRaw.value?.unique_combos ?? []) {
      if (c.child !== n) continue;
      const [pa, pb] = c.parents;
      if ((derivs.has(pa) || ownedAny(pa)) && catchable(pb)) return { kind: 'later', unlock: pb };
      if ((derivs.has(pb) || ownedAny(pb)) && catchable(pa)) return { kind: 'later', unlock: pa };
    }
    return { kind: 'later' };
  };
}

function attainScore(a: Attain): number {
  if (a.kind === 'breed') return Math.min(a.steps, 9);
  if (a.kind === 'catch') return 10;
  if (a.kind === 'later') return a.unlock ? 20 : 30;
  return 40;
}

function bestAt(job: string, n = 14): { name: string; lvl: number }[] {
  const p = pals.value;
  return Object.keys(p)
    .map((name) => ({ name, lvl: (p[name].work ?? {})[job] ?? 0 }))
    .filter((x) => x.lvl > 0)
    .sort((a, b) => b.lvl - a.lvl
      || ((p[b.name].hp ?? 0) + (p[b.name].atk ?? 0) + (p[b.name].def ?? 0))
      - ((p[a.name].hp ?? 0) + (p[a.name].atk ?? 0) + (p[a.name].def ?? 0)))
    .slice(0, n);
}

/** Composite work crews — "best farmer" = Planting+Gathering+Transporting,
 * scores straight from work levels; formula stated in each blurb. */
const CREWS = [
  {
    id: 'crew-farm', title: 'Farm crew', anchor: 'Planting',
    jobs: ['Planting', 'Gathering', 'Transporting'],
    blurb: 'Plants, gathers AND hauls — the whole farm loop in one pal. Ranked by Planting + Gathering + Transporting.',
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

function crewRank(crew: { jobs: string[]; anchor: string }, n = 12):
{ name: string; score: number; parts: string }[] {
  const p = pals.value;
  return Object.keys(p)
    .map((name) => {
      const w = p[name].work ?? {};
      if (crew.anchor && !((w[crew.anchor] ?? 0) > 0)) return null;
      const jobs = crew.jobs.length ? crew.jobs : Object.keys(w);
      const score = jobs.reduce((s, j) => s + (w[j] ?? 0), 0);
      const parts = jobs.filter((j) => (w[j] ?? 0) > 0)
        .map((j) => `${workLabel(j)[0]}${w[j]}`).join('·');
      return { name, score, parts };
    })
    .filter((x): x is { name: string; score: number; parts: string } => !!x && x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

function bestFighters(n = 12): string[] {
  const p = pals.value;
  return Object.keys(p)
    .map((name) => ({
      name, score: (p[name].atk ?? 0) * 2 + (p[name].hp ?? 0) + (p[name].def ?? 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((x) => x.name);
}

export function GoalsSheet({ open, onClose, targets, onAdd, onRemove }: {
  open: boolean;
  onClose: () => void;
  targets: string[];
  onAdd: (names: string[]) => void;
  /** un-add — every added pal must be removable right here (CEO 2026-08-15) */
  onRemove: (names: string[]) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const attain = useMemo(attainFactory, [open]);
  const fighters = useMemo(() => bestFighters(), [open]);
  const best = useMemo(
    () => Object.fromEntries(WORK_KEYS.map((w) => [w, bestAt(w)])), [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;

  const byAttain = (names: string[]) =>
    [...new Set(names)].sort((a, b) => attainScore(attain(a)) - attainScore(attain(b)));

  const Chip = ({ name, lvl, note, star }: {
    name: string; lvl?: number; note?: string; star?: boolean;
  }) => {
    const added = targets.includes(name);
    const owned = ownedAny(name);
    const a = attain(name);
    const status = added ? 'IN PLAN'
      : a.kind === 'have' ? 'HAVE IT'
        : a.kind === 'breed' ? `BREED · ${a.steps} STEP${a.steps === 1 ? '' : 'S'}`
          : a.kind === 'catch' ? `CATCH LV ${a.lv}`
            : a.unlock ? `CATCH ${a.unlock.toUpperCase()} TO UNLOCK` : 'ENDGAME';
    const color = added || a.kind === 'have' ? 'var(--ok)'
      : a.kind === 'breed' ? 'var(--accent-ink, var(--accent))'
        : a.kind === 'catch' ? 'var(--warn)'
          : a.unlock ? 'var(--gold-ink, var(--gold))' : 'var(--faint)';
    return (
      <div style={{
        position: 'relative', width: '78px', textAlign: 'center', padding: '6px 2px',
        border: `1px solid ${added ? 'var(--ok)' : 'var(--line)'}`, borderRadius: '12px',
        background: added ? 'var(--ok-soft, transparent)' : 'var(--surface)',
        opacity: owned && !added ? 0.55 : 1,
      }} title={`${name} — ${status.toLowerCase()}`}>
        {!added && !owned && (
          <button aria-label={`Add ${name} to the plan`}
            onClick={() => onAdd([name])}
            style={{
              position: 'absolute', left: '-6px', top: '-6px', width: '20px', height: '20px',
              borderRadius: '10px', border: 'none', background: 'var(--accent)',
              color: '#08191B', fontWeight: 800, cursor: 'pointer', lineHeight: 1,
            }}>+</button>
        )}
        {added && (
          <button aria-label={`Remove ${name} from the plan`}
            onClick={() => onRemove([name])}
            style={{
              position: 'absolute', left: '-6px', top: '-6px', width: '20px', height: '20px',
              borderRadius: '10px', border: '1px solid var(--line)', background: 'var(--surface)',
              color: 'var(--ink, inherit)', fontWeight: 800, cursor: 'pointer', lineHeight: 1,
            }}>−</button>
        )}
        <PalIcon name={name} size={40} />
        {star && <span style={{ position: 'absolute', right: '4px', top: '2px' }}>✦</span>}
        <div style={{
          fontSize: '9.5px', fontWeight: 700, overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{name}</div>
        {lvl != null && (
          <div style={{ color: 'var(--accent-ink, var(--accent))', fontSize: '10px', fontWeight: 800 }}>
            Lv {lvl}
          </div>
        )}
        {note && (
          <div style={{
            color: 'var(--gold-ink, var(--gold))', fontSize: '8px', fontWeight: 700,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{note}</div>
        )}
        <div style={{
          color, fontSize: '8px', fontWeight: 800, overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{status}</div>
      </div>
    );
  };

  const Section = ({ id, title, blurb, names, notes, lvls, stars, cap = 6, preserveOrder }: {
    id: string; title: string; blurb: string; names: string[];
    notes?: (n: string) => string | undefined;
    lvls?: Record<string, number>; stars?: Set<string>; cap?: number;
    /** keep the caller's ranking (job lists are ordered by work level) */
    preserveOrder?: boolean;
  }) => {
    const ranked = preserveOrder ? [...new Set(names)] : byAttain(names);
    const isOpen = expanded === id;
    const shown = isOpen ? ranked.slice(0, 20) : ranked.slice(0, cap);
    const missing = shown.filter((n) => !targets.includes(n) && !ownedAny(n));
    const inPlanHere = shown.filter((n) => targets.includes(n));
    return (
      <div class="card" style={{ padding: '12px', display: 'grid', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h3 style={{ margin: 0, flex: 1 }}>{title}</h3>
          {ranked.length > cap && (
            <button class="btn sm" onClick={() => setExpanded(isOpen ? null : id)}>
              {isOpen ? 'less −' : `top ${Math.min(cap, ranked.length)} of ${ranked.length} +`}
            </button>
          )}
          {missing.length > 1 ? (
            <button class="btn sm primary" onClick={() => onAdd(missing)}>
              Add {missing.length}
            </button>
          ) : inPlanHere.length > 1 ? (
            <button class="btn sm" onClick={() => onRemove(inPlanHere)}>
              Remove {inPlanHere.length}
            </button>
          ) : null}
        </div>
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: '12px' }}>{blurb}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {shown.map((n) => (
            <Chip key={n} name={n} lvl={lvls?.[n]} note={notes?.(n)} star={stars?.has(n)} />
          ))}
        </div>
      </div>
    );
  };

  const mountNote = (n: string) => MOUNT_CALLOUTS[n]
    ?? (SADDLE_LEVELS[n] != null ? `saddle Lv ${SADDLE_LEVELS[n]}` : undefined);

  return (
    <div class="hatchback" onClick={onClose}>
      <div class="card bigcard" role="dialog" aria-modal="true" aria-label="Suggested goals"
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: '86vh', overflowY: 'auto', display: 'grid', gap: '10px', maxWidth: '680px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h2 style={{ margin: 0, flex: 1 }}>Suggested goals</h2>
          <button class="btn sm" onClick={onClose}>Done</button>
        </div>

        <Section id="cake" title="Cake supply" cap={4}
          blurb="The four ranch pals that feed every cake — eggs, milk, honey, berries."
          names={HELPERS.filter((h) => h.role === 'ranch').map((h) => h.name)} />
        <Section id="speed" title="Breeding speed & luck" cap={6}
          blurb="Faster egg production, faster hatching, extra eggs — verified partner skills."
          names={HELPERS.filter((h) => h.role === 'speed' || h.role === 'luck').map((h) => h.name)} />
        <Section id="aura" title="Aura squad" cap={12}
          blurb="Each gives +1 work suitability to every other pal in its base (doesn't stack). All twelve, verified."
          names={AURA_SQUAD} />
        <Section id="bestof" title="The best pals in the game" cap={12}
          blurb="Community consensus (game8 + pindrop, Aug 2026), ordered by what YOU can act on now."
          names={BEST_OVERALL.map((m) => m.name)} stars={new Set(COMBAT_COMMUNITY)} />
        <Section id="fight" title="Fighting" cap={8}
          blurb="Highest battle stats in the game data (attack counted double); ✦ marks community favourites."
          names={fighters} stars={new Set(COMBAT_COMMUNITY)} />
        <Section id="m-fly" title="Flying mounts"
          blurb="Every flyable pal — saddle unlock levels from paldb; speed callouts community-measured."
          names={MOUNTS.flying} notes={mountNote} />
        <Section id="m-ground" title="Ground mounts"
          blurb="Every ground mount, closest-to-yours first."
          names={MOUNTS.ground} notes={mountNote} />
        <Section id="m-glide" title="Gliders & swimmers"
          blurb="Glider partner skills plus the swimmers."
          names={[...UTILITY_ROLES.glider.pals.map((p) => p.name), ...MOUNTS.swim]}
          notes={mountNote} />
        <Section id="u-weight" title="Weight & carrying helpers" cap={8}
          blurb="Ore/stone/wood/food weight cuts and carry capacity — the game's own partner skills."
          names={UTILITY_ROLES.weight.pals.map((p) => p.name)} />
        <Section id="u-eff" title="Work efficiency boosters" cap={9}
          blurb="Mining, logging and crafting multipliers from partner skills."
          names={UTILITY_ROLES.efficiency.pals.map((p) => p.name)} />

        <Section id="u-born" title="Born with a passive" cap={8}
          blurb="46 species are ALWAYS born carrying a passive (datamined) — catch or breed one and it's yours to breed onward."
          names={Object.keys(pals.value).filter((n) => PALCALC_FACTS[n]?.passives?.length)}
          notes={(n) => PALCALC_FACTS[n]?.passives?.join(' + ')} />
        <Section id="u-loot" title="Loot boosters" cap={8}
          blurb="More drops from enemies you defeat — element-specific hunting partners, plus Dumud Gild's gold bonus."
          names={palsWithEffect(LOOT_RE)} />
        <Section id="u-ranch" title="Ranch producers" cap={8}
          blurb="Every pal that makes something at the Ranch — eggs, milk, berries, wool, mushrooms and more."
          names={palsWithEffect(RANCH_RE)} />

        {CREWS.map((crew) => {
          const list = crewRank(crew);
          if (!list.length) return null;
          return (
            <Section key={crew.id} id={crew.id} title={crew.title} cap={6}
              preserveOrder blurb={crew.blurb}
              names={list.map((x) => x.name)}
              lvls={Object.fromEntries(list.map((x) => [x.name, x.score]))}
              notes={(n) => list.find((x) => x.name === n)?.parts} />
          );
        })}

        <h3 style={{ margin: '4px 0 0', color: 'var(--faint)', fontSize: '11px', letterSpacing: '1px' }}>
          BEST AT EACH JOB — FROM THE GAME'S OWN NUMBERS
        </h3>
        {WORK_KEYS.map((w) => {
          const list = best[w];
          if (!list?.length) return null;
          // dynamic: top 5 by level PLUS anything nearly as good that this
          // save can reach cheaply, labelled — same rule as mobile
          const topLvl = list[0].lvl;
          const close = list.slice(5).filter((x) =>
            x.lvl >= topLvl - 2 && attainScore(attain(x.name)) <= 4);
          const collapsed = [...list.slice(0, 5), ...close].slice(0, 9);
          const names = [...new Set([
            ...collapsed.map((x) => x.name), ...list.map((x) => x.name)])];
          const lvls = Object.fromEntries(list.map((x) => [x.name, x.lvl]));
          const closeSet = new Set(close.map((x) => x.name));
          return (
            <Section key={w} id={`job-${w}`} title={workLabel(w)}
              cap={collapsed.length} preserveOrder blurb=""
              names={names} lvls={lvls}
              notes={(n) => (closeSet.has(n) ? 'good & close' : undefined)} />
          );
        })}
      </div>
    </div>
  );
}
