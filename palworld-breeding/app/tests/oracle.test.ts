/** The correctness gate: replay EVERY precomputed 1.0 breeding result from the
 * game files (via palcalc) against the TypeScript engine. Zero mismatches
 * allowed. If this fails after a game patch, the DATA changed — re-run the
 * pipeline; if it fails after an engine edit, the edit is wrong. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { BreedingEngine } from '../src/engine/formula';
import { closure, planFor } from '../src/engine/planner';
import type { BreedingData } from '../src/engine/types';

const dir = join(__dirname, '..');
const data = JSON.parse(
  readFileSync(join(dir, 'public/data/breeding_1_0.json'), 'utf8'),
) as BreedingData;
const oracle = JSON.parse(
  gunzipSync(readFileSync(join(dir, 'tests/oracle_pairs.json.gz'))).toString('utf8'),
) as { rows: [string, string, string, string][] };

const engine = new BreedingEngine(data);
const known = new Set(engine.species);

describe('oracle replay', () => {
  it('reproduces all 44,851 game-file results with zero mismatches', () => {
    let ok = 0;
    const bad: string[] = [];
    for (const [a, b, c] of oracle.rows) {
      if (!known.has(a) || !known.has(b)) continue;
      const got = engine.childrenOf(a, b).map((x) => x.species);
      if (got.includes(c)) ok++;
      else bad.push(`${a} + ${b}: oracle ${c}, engine ${got.join('/')}`);
    }
    expect(bad.slice(0, 10)).toEqual([]);
    expect(ok).toBeGreaterThanOrEqual(44000);
  });

  it('flags the tie-break case and resolves it upward', () => {
    const ch = engine.childOf('Turtacle', 'Aegidron');
    expect(ch.species).toBe('Nitemary');
    expect(ch.tieBreak).toBe(true);
  });

  it('handles the gendered pair both ways', () => {
    const kids = engine.childrenOf('Katress', 'Wixen');
    expect(new Set(kids.map((k) => k.species))).toEqual(
      new Set(['Katress Ignis', 'Wixen Noct']),
    );
    const ignis = kids.find((k) => k.species === 'Katress Ignis')!;
    expect(ignis.genderNote).toContain('female Katress');
  });

  it('never produces an excluded species from the generic formula', () => {
    const excluded = new Set(data.excluded_from_generic_pool);
    for (const [a, b] of oracle.rows.slice(0, 2000)) {
      const ch = engine.childOf(a, b);
      if (ch.kind === 'generic') expect(excluded.has(ch.species)).toBe(false);
    }
  });
});

describe('route planner parity with the Python reference', () => {
  // Pål-Andre's roster + targets, frozen as the M1 acceptance fixture.
  const ROSTER = ['Arsox', 'Beakon', 'Beegarde', 'Blazehowl', 'Bristla', 'Broncherry',
    'Caprity', 'Caprity Noct', 'Cattiva', 'Celaray', 'Chikipi', 'Chillet', 'Cinnamoth',
    'Clovee', 'Cremis', 'Croajiro', 'Daedream', 'Dazzi', 'Digtoise', 'Direhowl', 'Dumud',
    'Eikthyrdeer', 'Elizabee', 'Elphidran', 'Felbat', 'Flambelle', 'Flopie', 'Foxcicle',
    'Foxparks', 'Fuddler', 'Galeclaw', 'Gobfin', 'Grintale', 'Gumoss', 'Hangyu',
    'Helzephyr', 'Herbil', 'Hoocrates', 'Incineram', 'Jolthog', 'Jolthog Cryst',
    'Katress', 'Kelpsea', 'Killamari', 'Killamari Primo', 'Lamball', 'Leafan',
    'Leezpunk', 'Lifmunk', 'Loupmoon', 'Lunaris', 'Mammorest', 'Mau', 'Melpaca',
    'Menasting', 'Mossanda', 'Mozzarina', 'Muffly', 'Munchill', 'Nitewing', 'Pengullet',
    'Penking', 'Petallia', 'Pupperai', 'Pyrin', 'Quivern', 'Rayhound', 'Reindrix',
    'Ribbuny', 'Ribbuny Botan', 'Robinquill', 'Rooby', 'Rushoar', 'Sibelyx', 'Sparkit',
    'Surfent', 'Suzaku', 'Swee', 'Tanzee', 'Tarantriss', 'Teafant', 'Tocotoco',
    'Tombat', 'Univolt', 'Vaelet', 'Vanwyrm', 'Vanwyrm Cryst', 'Verdash', 'Vixy',
    'Wispaw', 'Wixen', 'Woolipop', 'Xenovader', 'Wistella', 'Broncherry Aqua', 'Fuack',
    'Helzephyr Lux', 'Reptyro', 'Reptyro Cryst', 'Warsect', 'Warsect Terra'];
  const TARGETS = ['Solenne', 'Celesdir Noct', 'Renjishi', 'Knocklem', 'Starryon Primo',
    'Ophydia', 'Anubis', 'Astegon', 'Blazamut', 'Sibelyx Primo', 'Venusa', 'Mycora',
    'Univolt Cryst', 'Whalaska Ignis', 'Solmora Lux', 'Tetroise', 'Wumpo', 'Amione',
    'Eikthyrdeer Terra', 'Katress Ignis', 'Puffolt', 'Smokie Cryst', 'Braloha',
    'Dynamoff', 'Lullu', 'Prunelia', 'Sekhmet'];

  it('reaches 259 of 299 species from the reference roster', () => {
    expect(closure(engine, ROSTER).size).toBe(259);
  });

  it('reproduces the reference 48-step plan to all 27 targets', () => {
    const plan = planFor(engine, ROSTER, TARGETS);
    expect(plan.unreachable).toEqual([]);
    expect(plan.steps.length).toBe(48);
    expect(Math.max(...plan.steps.map((s) => s.wave))).toBe(8);
    expect(plan.steps.filter((s) => s.tieBreak).length).toBe(2);
    // spot-check two known steps
    const anubis = plan.steps.find((s) => s.child === 'Anubis')!;
    expect(anubis.parents).toEqual(['Beakon Cryst', 'Moldron Cryst']);
    const ignis = plan.steps.find((s) => s.child === 'Katress Ignis')!;
    expect(ignis.genderNote).toBe('female Katress + male Wixen');
  });
});
