/** UNLOCK ADVISOR — when a goal has no breeding route, what actually gets
 * you in, ranked for the save you are actually playing.
 *
 * The Plan tab used to say "Not reachable from your box" and stop there.
 * That is useless in both directions: Chikipi (spawns from Lv 1, catch one
 * on your way past) got the same sentence as Bellanoir Libero (never spawns
 * in the wild at all — raid only). The CEO put it exactly right:
 *
 *   "Don't suggest catching a lvl 60 pal that is 2 steps away if you are
 *    level 20 — a lvl 10 pal that is 10 steps away is smarter. And if lvl 70
 *    and you can catch a 60 one step away, suggesting a lvl 10 pal 20 steps
 *    away first is not efficient."
 *
 * So effort has to be measured in the player's terms, and a catch you cannot
 * make yet has to cost more than a longer route you can walk today.
 *
 * THE MODEL — a shortest-path over the breeding graph where obtaining a
 * species is either catching it or breeding it from two others:
 *
 *   cost(X) = 0                                    if you own X
 *           = min( catch it , breed it )           otherwise
 *
 *   catch    — impossible if the species never spawns wild; otherwise one
 *              trip, plus a penalty per level the spawn sits above yours.
 *   breed    — cheapest parent pair (a,b) producing X: the catches both
 *              sides need, UNIONED so a shared catch is paid once (the same
 *              rule the route planner uses for shared intermediates), plus
 *              one step per breed.
 *
 * Every number it reasons from is datamined: minWild/maxWild come from
 * DT_PalMonsterParameter via palcalc (see data/palcalcFacts.g.ts).
 * `minWild === null` is the game's own way of saying "this one never spawns
 * in the wild" — it is not a gap in our data, and is reported as such.
 *
 * The two tuning constants below are OURS, not the game's — they are how we
 * weigh a long walk against a high wall, and they are labelled as judgement
 * in the UI copy rather than presented as game facts.
 */

/** one catch trip, in the same units as one breeding step */
const CATCH_TRIP = 1;
/** how much each level of "you are not high enough yet" hurts.
 *
 * Calibrated against the CEO's own two examples, which this must reproduce:
 *   Lv 20 player · Lv 60 spawn 2 steps out = 1 + 40*0.35 + 2 = 17.0
 *                · Lv 10 spawn 10 steps out = 1 + 0 + 10    = 11.0  → walk. ✓
 *   Lv 70 player · Lv 60 spawn 1 step out   = 1 + 0 + 1     =  2.0  → catch. ✓
 *                · Lv 10 spawn 20 steps out = 1 + 0 + 20    = 21.0
 */
const LEVEL_PENALTY = 0.35;

/** Minimal engine surface — keeps this module free of the engine's types so
 * both trees can import their own copy. */
export interface PairSource {
  species: string[];
  childrenOf(a: string, b: string): { species: string }[];
}

/** What the game files say about catching one species in the wild. */
export interface WildFact {
  /** lowest level it spawns at; null = never spawns wild (raid/tower/boss) */
  minWild: number | null;
  /** false when we hold no row for this species at all — say so, never guess */
  known: boolean;
}

export type UnlockKind =
  /** already reachable by breeding from what you own — no advice needed */
  | 'reachable'
  /** catch the listed pals, then breed */
  | 'catch'
  /** every route needs a pal that never spawns in the wild */
  | 'raid-only'
  /** we hold no spawn data for something on the route */
  | 'unknown';

export interface UnlockAdvice {
  target: string;
  kind: UnlockKind;
  /** wild catches the cheapest route needs, easiest first */
  catches: string[];
  /** breeding steps once you have them */
  steps: number;
  /** the highest spawn level among the catches — the real wall */
  gateLevel: number | null;
  /** true when every catch is at or below the player's level */
  withinLevel: boolean;
  /** total effort in the units above; Infinity when there is no route */
  cost: number;
}

interface Node {
  cost: number;
  catches: Set<string>;
  steps: number;
}

const UNREACHABLE: Node = { cost: Infinity, catches: new Set(), steps: 0 };

/** Effort of one catch, in the player's terms. `level` undefined means the
 * player has not told us their level: we cannot gate honestly, so we apply a
 * gentle preference for lower spawns and let the UI say the advice is
 * untuned rather than pretend it is personal. */
function catchCost(minWild: number | null, level: number | undefined): number {
  if (minWild == null) return Infinity;
  if (level == null) return CATCH_TRIP + minWild * 0.02;
  if (minWild <= level) return CATCH_TRIP;
  return CATCH_TRIP + (minWild - level) * LEVEL_PENALTY;
}

function nodeCost(
  catches: Set<string>, steps: number,
  wild: (n: string) => WildFact, level: number | undefined,
): number {
  let total = steps;
  for (const c of catches) {
    const k = catchCost(wild(c).minWild, level);
    if (!Number.isFinite(k)) return Infinity;
    total += k;
  }
  return total;
}

/** Cheaper wins; ties break on fewer catches, then fewer steps, then name
 * order — so both platforms and repeated runs agree exactly. */
function better(cand: Node, cur: Node): boolean {
  if (cand.cost !== cur.cost) return cand.cost < cur.cost;
  if (cand.catches.size !== cur.catches.size) return cand.catches.size < cur.catches.size;
  if (cand.steps !== cur.steps) return cand.steps < cur.steps;
  return [...cand.catches].sort().join(';') < [...cur.catches].sort().join(';');
}

/** One line of advice for a goal with no breeding route — a DIFFERENT
 * sentence per situation, because "catch a few more pals" was equally
 * useless for Chikipi (spawns at Lv 1) and Bellanoir Libero (never spawns at
 * all). CEO 2026-08-16.
 *
 * It lives HERE, in the parity-gated module, rather than in either screen,
 * so the phone and the website cannot drift into saying different things
 * about the same pal. */
export function unlockLine(u: UnlockAdvice, level: number | undefined): string {
  if (u.kind === 'raid-only') {
    return 'Never spawns in the wild — this one only comes from a raid or boss fight.';
  }
  if (u.kind === 'unknown') {
    return "We don't hold spawn data for this one, so we won't guess how to reach it.";
  }
  if (u.kind === 'reachable') return 'Within reach now — plan again to pick it up.';

  const who = u.catches.join(' and ');
  const after = u.steps === 0 ? ''
    : u.steps === 1 ? ', then one breeding step'
    : `, then ${u.steps} breeding steps`;
  const gate = u.gateLevel;
  if (gate == null) return `Catch ${who}${after}.`;
  if (!u.withinLevel && level != null) {
    return u.catches.length > 1
      ? `Catch ${who} — but the toughest spawns at Lv ${gate} and you're Lv ${level}${after}.`
      : `Spawns at Lv ${gate} and you're Lv ${level} — level up first${after}.`;
  }
  return u.catches.length > 1
    ? `Catch ${who} — the toughest spawns from Lv ${gate}${after}.`
    : `Catch one — spawns from Lv ${gate}${after}.`;
}

/** Where to actually go, from the game's own region names — the CEO asked to
 * be told "straight up where to catch the pal u want" (2026-08-16). Only the
 * pals the route needs you to CATCH get a location, and only when the data
 * holds one: 23 of 299 species carry no region and stay silent rather than
 * get a guessed one. `regionsOf` is injected because the two trees hold the
 * pal table differently. */
export function catchWhere(
  u: UnlockAdvice, regionsOf: (name: string) => string[],
): string | null {
  const spots: string[] = [];
  for (const name of u.catches) {
    for (const r of regionsOf(name)) if (!spots.includes(r)) spots.push(r);
  }
  // 165 of 299 species live in more than three places, so cutting to three
  // and saying nothing read as the complete answer — the same shape as the
  // catch hint fixed in E52, in a different code path (self-found).
  if (!spots.length) return null;
  const more = spots.length - 3;
  return spots.slice(0, 3).join(' · ') + (more > 0 ? ` and ${more} more` : '');
}

/**
 * Cheapest way to obtain every species, given what you own and your level.
 *
 * Runs a relaxation fixpoint over all parent pairs. It is deliberately a
 * separate pass from `derivations`: that one only ever explores species you
 * can already reach, so a goal with no route is invisible to it by
 * construction — which is exactly the case we are here to explain.
 */
export function unlockCosts(
  engine: PairSource,
  owned: Iterable<string>,
  wild: (name: string) => WildFact,
  level: number | undefined,
): Map<string, Node> {
  const names = [...engine.species].sort();
  const best = new Map<string, Node>();

  for (const n of names) best.set(n, UNREACHABLE);
  // owning it is free, and outranks every other way in
  for (const o of owned) best.set(o, { cost: 0, catches: new Set(), steps: 0 });
  // catching it is the other way to start a route
  for (const n of names) {
    if (best.get(n)!.cost === 0) continue;
    const c = catchCost(wild(n).minWild, level);
    if (Number.isFinite(c)) best.set(n, { cost: c, catches: new Set([n]), steps: 0 });
  }

  let changed = true;
  let rounds = 0;
  // the graph is small and costs only ever fall, so this settles quickly;
  // the cap is a guard against a pathological data change, never a normal path
  while (changed && rounds < 12) {
    changed = false;
    rounds++;
    for (const a of names) {
      const na = best.get(a)!;
      if (!Number.isFinite(na.cost)) continue;
      for (const b of names) {
        if (b < a) continue;
        const nb = best.get(b)!;
        if (!Number.isFinite(nb.cost)) continue;
        for (const ch of engine.childrenOf(a, b)) {
          const c = ch.species;
          if (c === a || c === b) continue;
          const cur = best.get(c);
          if (!cur || cur.cost === 0) continue; // already owned — nothing beats free
          const catches = new Set(na.catches);
          for (const x of nb.catches) catches.add(x);
          const steps = na.steps + nb.steps + 1;
          const cost = nodeCost(catches, steps, wild, level);
          if (!Number.isFinite(cost)) continue;
          if (better({ cost, catches, steps }, cur)) {
            best.set(c, { cost, catches, steps });
            changed = true;
          }
        }
      }
    }
  }
  return best;
}

/**
 * Turn the costs into advice for the goals that have no route today.
 * `reachableNow` is the planner's own closure — anything in it needs no
 * advice, and we never second-guess the planner about what it can already do.
 */
export function adviseUnlocks(
  engine: PairSource,
  owned: Iterable<string>,
  reachableNow: Set<string>,
  stuck: string[],
  wild: (name: string) => WildFact,
  level: number | undefined,
): UnlockAdvice[] {
  const costs = unlockCosts(engine, owned, wild, level);
  const out: UnlockAdvice[] = [];

  for (const target of stuck) {
    if (reachableNow.has(target)) {
      out.push({
        target, kind: 'reachable', catches: [], steps: 0,
        gateLevel: null, withinLevel: true, cost: 0,
      });
      continue;
    }
    const node = costs.get(target);
    if (!node || !Number.isFinite(node.cost)) {
      // no route exists even with catching — so something on every route
      // never spawns wild. Distinguish "the game says never" from "we hold
      // no data", because those deserve different sentences.
      const self = wild(target);
      out.push({
        target,
        kind: self.known ? 'raid-only' : 'unknown',
        catches: [], steps: 0, gateLevel: null, withinLevel: false,
        cost: Infinity,
      });
      continue;
    }
    // Nothing left to catch means it is already within reach — you own it,
    // or you can breed it from what you own. Without this the sentence
    // builder was handed an empty catch list and produced "Catch ." — which
    // is exactly what a player sees after following our own advice: catch
    // the pal, tick it in the Paldex, and the stale plan still lists it as
    // stuck (self-found 2026-08-16).
    if (node.catches.size === 0) {
      out.push({
        target, kind: 'reachable', catches: [], steps: node.steps,
        gateLevel: null, withinLevel: true, cost: node.cost,
      });
      continue;
    }
    const catches = [...node.catches].sort((x, y) => {
      const lx = wild(x).minWild ?? 0;
      const ly = wild(y).minWild ?? 0;
      return lx - ly || x.localeCompare(y);
    });
    let gate: number | null = null;
    for (const c of catches) {
      const lv = wild(c).minWild;
      if (lv != null && (gate == null || lv > gate)) gate = lv;
    }
    out.push({
      target,
      kind: 'catch',
      catches,
      steps: node.steps,
      gateLevel: gate,
      withinLevel: level == null ? true : gate == null || gate <= level,
      cost: node.cost,
    });
  }

  // Easiest first — the whole point of ranking them. Two catches you can
  // both make today cost the same, and falling through to alphabetical made
  // the list LOOK unranked: a Lv 30 spawn sat above a Lv 15 one. So ties
  // break on the lower spawn level, which is what "easier" means to a player
  // reading the list (self-found on the eye pass, 2026-08-16).
  const rank = (a: UnlockAdvice) => (a.gateLevel == null ? Infinity : a.gateLevel);
  out.sort((a, b) => (
    a.cost - b.cost || rank(a) - rank(b) || a.target.localeCompare(b.target)
  ));
  return out;
}
