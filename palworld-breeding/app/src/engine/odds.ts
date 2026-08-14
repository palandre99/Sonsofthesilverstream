/** Breeding odds: passive-skill inheritance, IV inheritance, cakes and mutation.
 *
 * PROVENANCE — the three weight tables below are the game's own values, read
 * from GameSettings by palcalc's DB generator (PalCalc.GenDB/BuildDBProgram.cs):
 *
 *   PassiveInheritNum   -> how many passives are drawn from the parents' pool
 *   PassiveRandomAddNum -> how many brand-new random passives are added
 *   TalentInheritNum    -> how many IV categories are taken from the parents
 *
 * They are stored as integer weights and normalised here, exactly as
 * PalCalc.Model/BreedingMechanics.cs does it.
 *
 * The resulting model reproduces the community's published inheritance table
 * (40% / 24% / 12% / 10% for a clean 1/2/3/4-passive result) as a derived
 * consequence rather than an assumption — see oddsTable() and the tests.
 */

/* ------------------------------------------------------------------ *
 * Game constants
 * ------------------------------------------------------------------ */

/** A Pal has four passive slots. */
export const MAX_PASSIVES = 4;
/** There are three IV categories: HP, Attack, Defence. */
export const IV_CATEGORIES = 3;

/** GameSettings.PassiveInheritNum — count drawn from the parents' pool. */
export const PASSIVE_INHERIT_WEIGHTS: Record<number, number> = { 1: 4, 2: 3, 3: 2, 4: 1 };
/** GameSettings.PassiveRandomAddNum — count of new random passives added. */
export const PASSIVE_RANDOM_WEIGHTS: Record<number, number> = { 0: 4, 1: 3, 2: 2, 3: 1 };
/** GameSettings.TalentInheritNum — count of IV categories taken from parents. */
export const IV_INHERIT_WEIGHTS: Record<number, number> = { 1: 3, 2: 2, 3: 1 };

function normalise(weights: Record<number, number>): Map<number, number> {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  return new Map(Object.entries(weights).map(([k, v]) => [Number(k), v / total]));
}

/** P(X = n) for the number of passives drawn from the parents' pool. */
export const passiveInheritP = normalise(PASSIVE_INHERIT_WEIGHTS);
/** P(R = n) for the number of random passives added. */
export const passiveRandomP = normalise(PASSIVE_RANDOM_WEIGHTS);
/** P(I = n) for the number of IV categories inherited. */
export const ivInheritP = normalise(IV_INHERIT_WEIGHTS);

/* ------------------------------------------------------------------ *
 * Combinatorics
 * ------------------------------------------------------------------ */

/** n choose k, exact for the small n used here. */
export function choose(n: number, k: number): number {
  if (k < 0 || n < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let out = 1;
  for (let i = 0; i < k; i++) out = (out * (n - i)) / (i + 1);
  return Math.round(out);
}

/**
 * Probability that a uniformly random `chosen`-subset of `pool` distinct items
 * contains all `desired` specific items (hypergeometric).
 */
export function subsetContainsAll(pool: number, chosen: number, desired: number): number {
  if (desired === 0) return 1;
  if (chosen < desired || pool < desired) return 0;
  // you can never draw more than the pool holds
  const take = Math.min(chosen, pool);
  return choose(pool - desired, take - desired) / choose(pool, take);
}

/* ------------------------------------------------------------------ *
 * Passive skills
 * ------------------------------------------------------------------ */

/**
 * How the game builds a child's passives:
 *   1. pool  = both parents' passives, combined and de-duplicated
 *   2. X     ~ passiveInheritP; the child takes min(X, |pool|) at random from the pool
 *   3. R     ~ passiveRandomP;  R brand-new random passives are added
 *   4. the total is capped at four slots — surplus RANDOM passives are dropped,
 *      inherited ones are kept (this is the behaviour palcalc's solver assumes
 *      when it switches to "at least N random" for the 4-slot case)
 *
 * `inheritCap` overrides step 2's draw for the what-if Special Cake mode; it is
 * NOT a verified game value, so callers must label it as a hypothetical.
 */
export interface PassiveModel {
  /** distinct passives across both parents */
  poolSize: number;
  /** how many of those pool passives you actually want */
  desiredCount: number;
  /** forces the number drawn from the pool (Special Cake what-if); undefined = normal roll */
  inheritCap?: number;
}

export interface PassiveOdds {
  /** child ends up with every desired passive (junk alongside is allowed) */
  allDesired: number;
  /** child ends up with exactly the desired passives and nothing else */
  exactlyDesired: number;
  /** P(child has a total of k passives), k = 0..4 */
  totalCount: number[];
  /** eggs needed on average for `allDesired` (Infinity when impossible) */
  expectedEggs: number;
  /** eggs needed to be 90% sure of at least one success */
  eggsFor90: number;
}

/** Distribution of how many pool passives are actually inherited. */
function inheritedDistribution(poolSize: number, inheritCap?: number): Map<number, number> {
  const out = new Map<number, number>();
  const add = (k: number, p: number) => out.set(k, (out.get(k) ?? 0) + p);
  if (inheritCap !== undefined) {
    add(Math.min(inheritCap, poolSize), 1);
    return out;
  }
  for (const [x, p] of passiveInheritP) add(Math.min(x, poolSize), p);
  return out;
}

export function passiveOdds(model: PassiveModel): PassiveOdds {
  const { poolSize, desiredCount, inheritCap } = model;
  const inherited = inheritedDistribution(poolSize, inheritCap);

  // P(all desired inherited). Random additions never displace inherited
  // passives, so they do not enter this marginal at all.
  let allDesired = 0;
  for (const [a, p] of inherited) allDesired += p * subsetContainsAll(poolSize, a, desiredCount);

  // P(exactly the desired set): inherit precisely the desired passives and add
  // no randoms — unless all four slots are already full, in which case surplus
  // randoms are dropped and cannot contaminate the result.
  let exactlyDesired = 0;
  for (const [a, p] of inherited) {
    if (a !== desiredCount) continue;
    const pSubset = subsetContainsAll(poolSize, a, desiredCount);
    const room = MAX_PASSIVES - a;
    const pNoJunk = room === 0 ? 1 : (passiveRandomP.get(0) ?? 0);
    exactlyDesired += p * pSubset * pNoJunk;
  }

  // Total passive count = min(4, inherited + random).
  const totalCount = new Array<number>(MAX_PASSIVES + 1).fill(0);
  for (const [a, pa] of inherited) {
    for (const [r, pr] of passiveRandomP) {
      totalCount[Math.min(MAX_PASSIVES, a + r)] += pa * pr;
    }
  }

  return {
    allDesired,
    exactlyDesired,
    totalCount,
    expectedEggs: allDesired > 0 ? 1 / allDesired : Infinity,
    eggsFor90: attemptsFor(allDesired, 0.9),
  };
}

/** Attempts needed for `confidence` chance of at least one success. */
export function attemptsFor(p: number, confidence: number): number {
  if (p <= 0) return Infinity;
  if (p >= 1) return 1;
  return Math.ceil(Math.log(1 - confidence) / Math.log(1 - p));
}

/**
 * The published inheritance table, derived from the game weights:
 * the chance of a clean child carrying exactly K desired passives and no junk,
 * when the parents' pool contains exactly those K passives.
 */
export function oddsTable(): { skills: number; clean: number; withJunk: number }[] {
  return [1, 2, 3, 4].map((k) => {
    const o = passiveOdds({ poolSize: k, desiredCount: k });
    return { skills: k, clean: o.exactlyDesired, withJunk: o.allDesired };
  });
}

/* ------------------------------------------------------------------ *
 * IVs (HP / Attack / Defence)
 * ------------------------------------------------------------------ */

export interface IvOdds {
  /** the desired categories are all taken from a parent (either one) */
  categoriesInherited: number;
  /** ...and every one of them came from the specific parent you wanted */
  fromChosenParent: number;
  expectedEggs: number;
  eggsFor90: number;
}

/**
 * At least one IV category is always inherited; the count follows
 * TalentInheritNum (1: 50%, 2: 33.3%, 3: 16.7%). Which categories are taken is
 * uniform, and each inherited category independently takes the mother's or the
 * father's value on a coin flip. Categories that are not inherited are rolled
 * fresh.
 */
export function ivOdds(desiredCount: number): IvOdds {
  if (desiredCount < 1 || desiredCount > IV_CATEGORIES) {
    throw new RangeError(`desiredCount must be 1..${IV_CATEGORIES}`);
  }
  let categoriesInherited = 0;
  for (const [i, p] of ivInheritP) {
    categoriesInherited += p * subsetContainsAll(IV_CATEGORIES, i, desiredCount);
  }
  const fromChosenParent = categoriesInherited * Math.pow(0.5, desiredCount);
  return {
    categoriesInherited,
    fromChosenParent,
    expectedEggs: categoriesInherited > 0 ? 1 / categoriesInherited : Infinity,
    eggsFor90: attemptsFor(categoriesInherited, 0.9),
  };
}

/* ------------------------------------------------------------------ *
 * Cakes and mutation
 * ------------------------------------------------------------------ */

export type CakeId = 'cake' | 'mushroom' | 'vegetable' | 'extravagant' | 'special';

export interface Cake {
  id: CakeId;
  name: string;
  /** eggs produced per breeding cycle */
  eggsPerCycle: number;
  /** mutation chance per egg (null = same as the base cake) */
  mutationPerEgg: number | null;
  effect: string;
  /** how well-established the numbers are */
  confidence: 'game-data' | 'community';
}

/**
 * 1.0 breeding cakes. Egg counts and mutation rates are community-documented
 * (paldb.cc, wiki.gg); the game's own DA_BreedingItemEffectData table has not
 * been published field-by-field, so these carry a 'community' confidence and
 * the UI must say so.
 */
export const CAKES: Cake[] = [
  {
    id: 'cake',
    name: 'Cake',
    eggsPerCycle: 1,
    mutationPerEgg: 0.01,
    effect: 'The baseline. One egg, 1% chance it is mutated.',
    confidence: 'community',
  },
  {
    id: 'mushroom',
    name: 'Mushroom Cake',
    eggsPerCycle: 1,
    mutationPerEgg: 0.01,
    effect: 'Raises the odds of higher IVs. The exact bonus is not published.',
    confidence: 'community',
  },
  {
    id: 'vegetable',
    name: 'Vegetable Cake',
    eggsPerCycle: 2,
    mutationPerEgg: 0.01,
    effect: 'Two eggs per cycle, each still 1% to mutate — twice the throughput, not twice the rate.',
    confidence: 'community',
  },
  {
    id: 'extravagant',
    name: 'Extravagant Vegetable Cake',
    eggsPerCycle: 1,
    mutationPerEgg: 0.03,
    effect: 'The mutation cake: 3% per egg, and better stat rolls.',
    confidence: 'community',
  },
  {
    id: 'special',
    name: 'Special Cake',
    eggsPerCycle: 1,
    mutationPerEgg: 0.01,
    effect: 'Overrides how many passives are drawn from the parents — reported to carry up to 6.',
    confidence: 'community',
  },
];

export function cakeById(id: CakeId): Cake {
  const c = CAKES.find((x) => x.id === id);
  if (!c) throw new Error(`unknown cake: ${id}`);
  return c;
}

export interface MutationPlan {
  eggsPerCycle: number;
  mutationPerEgg: number;
  /** at least one mutation per breeding cycle */
  mutationPerCycle: number;
  expectedEggs: number;
  expectedCycles: number;
  cyclesFor90: number;
}

export function mutationPlan(id: CakeId): MutationPlan {
  const cake = cakeById(id);
  const per = cake.mutationPerEgg ?? 0.01;
  const eggs = cake.eggsPerCycle;
  const perCycle = 1 - Math.pow(1 - per, eggs);
  return {
    eggsPerCycle: eggs,
    mutationPerEgg: per,
    mutationPerCycle: perCycle,
    expectedEggs: 1 / per,
    expectedCycles: 1 / perCycle,
    cyclesFor90: attemptsFor(perCycle, 0.9),
  };
}

/** Combined odds of one egg being both a mutation and carrying the passives. */
export function combinedOdds(passive: number, mutation: number): number {
  return passive * mutation;
}
