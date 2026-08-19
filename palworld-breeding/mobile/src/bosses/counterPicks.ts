/** One set of rules for "who do I bring" — shared by the Boss Card and
 * the Teams tab, so the two screens can never disagree about a pick
 * (the E131 lesson: the same rule written twice diverges).
 *
 * Pure functions over the shared counter brain; screens pass the box
 * and handle the ready-gating for anything that needs the reachability
 * pass.
 */
import { pals } from '../store';
import {
  compareCounters, rankCounters, type CounterCandidate, type CounterRow,
} from '../logic/counters';
import { effortSteps, type Attain, type AttainContext } from '../logic/recommend';

function candidateOf(name: string): CounterCandidate {
  return {
    name,
    elements: pals[name]?.elements ?? [],
    atk: pals[name]?.atk ?? null,
  };
}

/** The player's own pals, ranked for this fight. Instant — element math
 * only, no reachability pass. */
export function ownedCounterRows(
  boxNames: string[], bossElements: string[], bossMoveElements: string[],
): CounterRow[] {
  return rankCounters(
    boxNames.filter((n) => pals[n]).map(candidateOf),
    bossElements, bossMoveElements,
  );
}

export interface CounterSuggestion {
  row: CounterRow;
  attain: Attain;
}

/** Non-owned pals that hit this target for double, actionable only,
 * CLOSEST to the save first (a 1-step breed beats a 25-step wonder —
 * the kindling rule applied to fights), matchup order breaking ties.
 * Needs a warm AttainContext, so callers gate on derivationsReady. */
export function counterSuggestions(
  ctx: AttainContext,
  ownedAny: (n: string) => boolean,
  bossElements: string[],
  bossMoveElements: string[],
  limit = 5,
): CounterSuggestion[] {
  if (!bossElements.length) return [];
  const rows = rankCounters(
    Object.keys(pals).filter((n) => !ownedAny(n)).map(candidateOf),
    bossElements, bossMoveElements,
  ).filter((r) => r.offense === 2);
  const out: CounterSuggestion[] = [];
  for (const r of rows) {
    const a = ctx.attain(r.name);
    if (a.kind === 'later' && !a.unlock) continue;
    out.push({ row: r, attain: a });
  }
  out.sort((a, b) =>
    effortSteps(a.attain) - effortSteps(b.attain)
    || compareCounters(a.row, b.row));
  return out.slice(0, limit);
}
