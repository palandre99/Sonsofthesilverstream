/** Reachability and shortest-shared-tree route planning.
 *
 * Port of the Python reference (../../planner.py). Cost of a derivation is the
 * number of DISTINCT steps (a shared intermediate counts once); the fixpoint
 * is deterministic, so it reproduces the reference plans exactly.
 */
import type { BreedingEngine } from './formula';
import type { PlanStep } from './types';

/** step encoded as 'A|B>C' with A<B */
export type StepId = string;

export function stepId(a: string, b: string, c: string): StepId {
  return a < b ? `${a}|${b}>${c}` : `${b}|${a}>${c}`;
}

export function parseStep(id: StepId): { a: string; b: string; c: string } {
  const gt = id.lastIndexOf('>');
  const pair = id.slice(0, gt);
  const bar = pair.indexOf('|');
  return { a: pair.slice(0, bar), b: pair.slice(bar + 1), c: id.slice(gt + 1) };
}

/** All species reachable from the roster by breeding alone. */
export function closure(engine: BreedingEngine, roster: Iterable<string>): Set<string> {
  const known = new Set(roster);
  let frontier = [...known];
  while (frontier.length) {
    const fresh: string[] = [];
    for (const a of frontier) {
      for (const b of known) {
        for (const ch of engine.childrenOf(a, b)) {
          if (!known.has(ch.species)) {
            known.add(ch.species);
            fresh.push(ch.species);
          }
        }
      }
    }
    frontier = fresh;
  }
  return known;
}

interface Derivation {
  steps: Set<StepId>;
  ties: number;
  key: string; // deterministic tiebreaker: sorted step list
}

/** Cheapest derivation (set of steps) for every reachable species. */
export function derivations(
  engine: BreedingEngine,
  roster: Iterable<string>,
): Map<string, Set<StepId>> {
  const derivs = new Map<string, Derivation>();
  for (const s of roster) derivs.set(s, { steps: new Set(), ties: 0, key: '' });

  const better = (cand: Derivation, cur: Derivation | undefined): boolean => {
    if (!cur) return true;
    if (cand.steps.size !== cur.steps.size) return cand.steps.size < cur.steps.size;
    if (cand.ties !== cur.ties) return cand.ties < cur.ties;
    return cand.key < cur.key;
  };

  let changed = true;
  while (changed) {
    changed = false;
    const names = [...derivs.keys()].sort();
    for (const a of names) {
      for (const b of names) {
        if (b < a) continue;
        for (const ch of engine.childrenOf(a, b)) {
          const c = ch.species;
          if (c === a || c === b) continue;
          const id = stepId(a, b, c);
          const da = derivs.get(a)!;
          const db = derivs.get(b)!;
          const steps = new Set(da.steps);
          for (const s of db.steps) steps.add(s);
          steps.add(id);
          let ties = 0;
          for (const s of steps) {
            const p = parseStep(s);
            if (engine.childOf(p.a, p.b).tieBreak) ties++;
          }
          const cand: Derivation = { steps, ties, key: [...steps].sort().join(';') };
          if (better(cand, derivs.get(c))) {
            derivs.set(c, cand);
            changed = true;
          }
        }
      }
    }
  }
  return new Map([...derivs].map(([k, v]) => [k, v.steps]));
}

export interface PlanResult {
  steps: PlanStep[];
  unreachable: string[];
}

/** Union of cheapest derivations for the targets, in dependency order. */
export function planFor(
  engine: BreedingEngine,
  roster: Iterable<string>,
  targets: string[],
  /** optional precomputed derivations(engine, roster) — derivations depends
   * only on the roster, so callers re-planning many target variations can
   * pay the expensive fixpoint once and reuse it */
  precomputed?: ReturnType<typeof derivations>,
): PlanResult {
  const rosterSet = new Set(roster);
  const derivs = precomputed ?? derivations(engine, rosterSet);
  const unreachable = targets.filter((t) => !derivs.has(t));
  const wanted = new Set(targets.filter((t) => derivs.has(t)));

  let all = new Set<StepId>();
  let neededBy = new Map<StepId, Set<string>>();
  for (const t of wanted) {
    for (const s of derivs.get(t)!) {
      all.add(s);
      let n = neededBy.get(s);
      if (!n) neededBy.set(s, (n = new Set()));
      n.add(t);
    }
  }

  // ---- one recipe per pal -------------------------------------------------
  //
  // The Plan tab promises "pals needed by several goals are bred once, not
  // twice", and until 2026-08-17 that could be false. `derivations` improves
  // species one at a time and never rebuilds the ancestors that already routed
  // through an older recipe for an intermediate, so a goal can carry a stale
  // one for ever. Measured on a ten-pal box: Whalaska's own cheapest recipe is
  // Frostplume + Univolt Cryst, Blazamut's route used exactly that, and
  // Astegon's still used Petallia Ignis + Reptyro Cryst. Union the two and the
  // player was told to breed Whalaska twice — phases 18 and 21 — and since
  // breeding never consumes a parent, the second chain is pure wasted work.
  //
  // The obvious fix — force every route to use each species' own cheapest
  // recipe — was tried and REJECTED on measurement: across twelve boxes it
  // took the total from 299 steps to 323, because the "stale" recipes were
  // often the ones two goals SHARED. Correctness is not worth an 8% longer
  // plan.
  //
  // So this instead: when a pal really does have two recipes in the union,
  // keep whichever ONE leaves the smallest plan and drop the steps that only
  // existed to feed the other. It walks back from the goals, so orphaned
  // feeder chains disappear with the recipe they served. The result is always
  // a SUBSET of what we already had — the plan can only get shorter, never
  // longer — and it runs at all only in the rare case that a duplicate exists.
  const recipesFor = new Map<string, StepId[]>();
  for (const s of all) {
    const { c } = parseStep(s);
    const list = recipesFor.get(c);
    if (list) list.push(s);
    else recipesFor.set(c, [s]);
  }
  const contested = [...recipesFor].filter(([, v]) => v.length > 1);

  if (contested.length) {
    /** steps still needed once each pal is made exactly one way */
    const reachedFrom = (seeds: Iterable<string>, choice: Map<string, StepId>) => {
      const keep = new Set<StepId>();
      const stack = [...seeds];
      while (stack.length) {
        const name = stack.pop()!;
        if (rosterSet.has(name)) continue;
        const id = choice.get(name);
        if (!id || keep.has(id)) continue;
        keep.add(id);
        const p = parseStep(id);
        stack.push(p.a, p.b);
      }
      return keep;
    };

    // start from the cheapest-looking recipe for each contested pal, then try
    // the alternatives one pal at a time and keep whichever shrinks the plan.
    // Ties break on the sorted step id so the plan stays deterministic.
    const choice = new Map<string, StepId>();
    for (const [c, list] of recipesFor) choice.set(c, [...list].sort()[0]);

    for (const [c, list] of contested) {
      let best = choice.get(c)!;
      let bestSize = reachedFrom(wanted, choice).size;
      for (const cand of [...list].sort()) {
        if (cand === best) continue;
        choice.set(c, cand);
        const size = reachedFrom(wanted, choice).size;
        if (size < bestSize) { best = cand; bestSize = size; }
      }
      choice.set(c, best);
    }

    all = reachedFrom(wanted, choice);
    neededBy = new Map<StepId, Set<string>>();
    for (const t of wanted) {
      for (const s of reachedFrom([t], choice)) {
        let n = neededBy.get(s);
        if (!n) neededBy.set(s, (n = new Set()));
        n.add(t);
      }
    }
  }

  const have = new Set(rosterSet);
  const remaining = new Set(all);
  const steps: PlanStep[] = [];
  let wave = 0;
  while (remaining.size) {
    wave++;
    const ready = [...remaining]
      .filter((s) => {
        const p = parseStep(s);
        return have.has(p.a) && have.has(p.b);
      })
      .sort();
    if (!ready.length) throw new Error('dependency cycle in plan');
    for (const s of ready) {
      const { a, b, c } = parseStep(s);
      const ch = engine.childrenOf(a, b).find((x) => x.species === c)!;
      let reused = 0;
      for (const other of all) {
        const p = parseStep(other);
        if (p.a === c || p.b === c) reused++;
      }
      steps.push({
        wave,
        parents: [a, b],
        child: c,
        kind: ch.kind,
        tieBreak: ch.tieBreak,
        margin: ch.margin,
        genderNote: ch.genderNote,
        isTarget: wanted.has(c),
        neededBy: [...(neededBy.get(s) ?? [])].sort(),
        reusedAsParent: reused,
      });
      have.add(c);
      remaining.delete(s);
    }
  }
  return { steps, unreachable };
}
