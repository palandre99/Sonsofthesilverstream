/** The Palworld 1.0 species formula.
 *
 * Ported 1:1 from the Python reference implementation (../../planner.py) and
 * verified by replaying all 44,851 precomputed results from the game files
 * (tests/oracle.test.ts). Do not change behavior without re-running the oracle.
 */
import type { BreedingData, ChildResult } from './types';

export class BreedingEngine {
  readonly ranks: Map<string, number>;
  readonly selfOnly: Set<string>;
  readonly excluded: Set<string>;
  /** key: 'A|B' with A<B */
  private readonly unique: Map<string, string>;
  /** key: 'A|B' with A<B -> both gendered children */
  private readonly gendered: Map<string, { mother: string; father: string; child: string }[]>;
  /** generic pool sorted ascending by rank */
  private readonly pool: { name: string; rank: number }[];
  private readonly cache = new Map<string, ChildResult[]>();

  constructor(data: BreedingData) {
    this.ranks = new Map(Object.entries(data.combi_ranks));
    this.selfOnly = new Set(data.self_breed_only);
    this.excluded = new Set(data.excluded_from_generic_pool);
    this.unique = new Map();
    for (const c of data.unique_combos) {
      this.unique.set(pairKey(c.parents[0], c.parents[1]), c.child);
    }
    this.gendered = new Map();
    for (const g of data.gendered_combos) {
      const k = pairKey(g.mother, g.father);
      const list = this.gendered.get(k) ?? [];
      list.push(g);
      this.gendered.set(k, list);
    }
    this.pool = [...this.ranks.entries()]
      .filter(([name]) => !this.excluded.has(name))
      .map(([name, rank]) => ({ name, rank }))
      .sort((a, b) => a.rank - b.rank);
  }

  get species(): string[] {
    return [...this.ranks.keys()];
  }

  /** All possible children of a pair (two only for the gendered pair). */
  childrenOf(a: string, b: string): ChildResult[] {
    const k = pairKey(a, b);
    const hit = this.cache.get(k);
    if (hit) return hit;
    const out = this.compute(a, b);
    this.cache.set(k, out);
    return out;
  }

  /** Primary child of a pair. */
  childOf(a: string, b: string): ChildResult {
    return this.childrenOf(a, b)[0];
  }

  private compute(a: string, b: string): ChildResult[] {
    if (a === b) {
      return [{ species: a, kind: 'self', tieBreak: false, margin: null, genderNote: null }];
    }
    const k = pairKey(a, b);
    const gendered = this.gendered.get(k);
    if (gendered) {
      return gendered.map((g) => ({
        species: g.child,
        kind: 'gendered' as const,
        tieBreak: false,
        margin: null,
        genderNote: `female ${g.mother} + male ${g.father}`,
      }));
    }
    const unique = this.unique.get(k);
    if (unique !== undefined) {
      return [{ species: unique, kind: 'unique', tieBreak: false, margin: null, genderNote: null }];
    }
    const ra = this.ranks.get(a);
    const rb = this.ranks.get(b);
    if (ra === undefined || rb === undefined) {
      throw new Error(`unknown species: ${ra === undefined ? a : b}`);
    }
    const target = Math.floor((ra + rb + 1) / 2);
    // nearest rank in the pool; exact tie -> higher CombiRank wins (1.0-verified)
    let best = this.pool[0];
    let bestDist = Math.abs(best.rank - target);
    let secondDist = Infinity;
    for (let i = 1; i < this.pool.length; i++) {
      const cand = this.pool[i];
      const d = Math.abs(cand.rank - target);
      if (d < bestDist || (d === bestDist && cand.rank > best.rank)) {
        secondDist = bestDist === d ? d : bestDist;
        best = cand;
        bestDist = d;
      } else if (d < secondDist) {
        secondDist = d;
      }
    }
    return [{
      species: best.name,
      kind: 'generic',
      tieBreak: secondDist === bestDist,
      margin: secondDist === Infinity ? null : secondDist - bestDist,
      genderNote: null,
    }];
  }
}

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Parse a genderNote ("female Katress + male Wixen") into its parents.
 * Exact-boundary parsing — substring checks like includes(`female ${name}`)
 * break as soon as a gendered combo involves a prefix-colliding species name
 * (85 such names exist, e.g. Katress / Katress Ignis). */
export function parseGenderNote(note: string): { mother: string; father: string } | null {
  const m = /^female (.+) \+ male (.+)$/.exec(note);
  return m ? { mother: m[1], father: m[2] } : null;
}
