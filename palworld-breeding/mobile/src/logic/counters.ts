/** The fight matchup brain — which pals are strong against a boss, and
 * what the boss's own attacks do to them, shared verbatim between the
 * website and the phone.
 *
 * BYTE-IDENTICAL RULE: this file exists as an exact copy in
 * `app/src/logic/` and `mobile/src/logic/`, enforced by
 * `app/tests/logic-parity.test.ts`. Change one → change both.
 *
 * The honesty contract, same as recommend.ts: every INPUT is either a
 * game-table fact (a pal's elements and base stats, a boss's elements and
 * its variant's own move list) or the wiki-measured element chart whose
 * provenance ships with the app. The way they are COMBINED is ranking
 * logic, and it is deliberately LEXICOGRAPHIC — element edge first, then
 * survivability against the boss's actual kit, then base attack — so
 * every rank is explainable in one sentence with no invented weights.
 *
 * What this deliberately does NOT do: simulate fights. No DPS, no
 * time-to-win. We rank by what the tables prove and say so in the UI.
 * Passives, condensation and IVs are not part of the ranking either —
 * they belong to the individual pal, not the species, and the box does
 * not know them.
 */
import { ELEMENT_CHART } from '../data/elementChart.g';

/** damage multiplier of one attack element into one defending element */
function cell(attack: string, defend: string): number {
  const row = ELEMENT_CHART[attack];
  if (!row) return 1;
  if (row.strong.includes(defend)) return 2;
  if (row.weak.includes(defend)) return 0.5;
  return 1;
}

/** One attack element against a full defender: per-element multipliers
 * multiply, so strong+weak on a dual-element pal cancels to even. A
 * defender with no element (Zenara & Astralym, Moon Lord) takes even
 * damage from everything. */
export function attackMultiplier(attack: string, defender: string[]): number {
  let m = 1;
  for (const el of defender) m *= cell(attack, el);
  return m;
}

/** The best a pal's OWN elements can do against this boss, and through
 * which element. Ranked on own elements because that is where a pal's
 * kit lives — the choice is stated in the UI, not hidden.
 *
 * The max is over what the pal actually has, so a mono-element pal whose
 * only element is resisted reports 0.5 — the "poor pick" signal — while
 * a dual pal keeps its better half. `via` names the element only when it
 * carries a real edge. */
export function bestOffense(
  palElements: string[], bossElements: string[],
): { mult: number; via: string | null } {
  let best: { mult: number; via: string | null } | null = null;
  for (const el of palElements) {
    const m = attackMultiplier(el, bossElements);
    if (best === null || m > best.mult) {
      best = { mult: m, via: m > 1 ? el : null };
    }
  }
  return best ?? { mult: 1, via: null };
}

/** What the boss's actual kit does to this pal: the hardest single hit's
 * multiplier, and how many of the moves the pal resists (take half or
 * less). An empty move list (no datamined kit) reports even and zero —
 * absent facts never rank anyone up or down. */
export function incomingFire(
  bossMoveElements: string[], palElements: string[],
): { worst: number; resisted: number; moves: number } {
  let worst = bossMoveElements.length ? 0 : 1;
  let resisted = 0;
  for (const el of bossMoveElements) {
    const m = attackMultiplier(el, palElements);
    if (m > worst) worst = m;
    if (m <= 0.5) resisted += 1;
  }
  return { worst, resisted, moves: bossMoveElements.length };
}

export interface CounterCandidate {
  name: string;
  elements: string[];
  /** base attack from the species table; null ranks last on the stat key */
  atk: number | null;
}

export interface CounterRow {
  name: string;
  /** best own-element multiplier into the boss (2, 1, or 0.5) */
  offense: number;
  /** the element that achieves it, when there is an edge */
  offenseVia: string | null;
  /** hardest hit the boss's kit lands on this pal (2 … 0.5; 1 if unknown) */
  incomingWorst: number;
  /** how many of the boss's moves this pal resists */
  resisted: number;
  /** size of the boss's datamined move list (0 = kit unknown) */
  bossMoves: number;
  atk: number | null;
}

export function counterRow(
  c: CounterCandidate, bossElements: string[], bossMoveElements: string[],
): CounterRow {
  const off = bestOffense(c.elements, bossElements);
  const inc = incomingFire(bossMoveElements, c.elements);
  return {
    name: c.name,
    offense: off.mult,
    offenseVia: off.via,
    incomingWorst: inc.worst,
    resisted: inc.resisted,
    bossMoves: inc.moves,
    atk: c.atk,
  };
}

/** Element edge first; among equals, the one the boss's kit hurts least;
 * then the one resisting more of that kit; then base attack; name last so
 * the order is total and stable. */
export function compareCounters(a: CounterRow, b: CounterRow): number {
  if (a.offense !== b.offense) return b.offense - a.offense;
  if (a.incomingWorst !== b.incomingWorst) {
    return a.incomingWorst - b.incomingWorst;
  }
  if (a.resisted !== b.resisted) return b.resisted - a.resisted;
  if ((a.atk ?? -1) !== (b.atk ?? -1)) return (b.atk ?? -1) - (a.atk ?? -1);
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

/** Rank candidates for one boss. The caller decides which candidates to
 * pass (the owned box, or the whole Paldex) and how to interleave
 * attainability — that judgement lives in recommend.ts. */
export function rankCounters(
  candidates: CounterCandidate[],
  bossElements: string[],
  bossMoveElements: string[],
): CounterRow[] {
  return candidates
    .map((c) => counterRow(c, bossElements, bossMoveElements))
    .sort(compareCounters);
}

/* ---------------- labels ----------------
 * One phrasing for every surface, in a player's words. */

/** The one-line WHY for a ranked row. */
export function matchupLabel(row: CounterRow, bossName: string): string {
  const poor = row.offense <= 0.5;
  const bits: string[] = [];
  if (row.offense >= 4) {
    bits.push(`${row.offenseVia} hits it for quadruple damage`);
  } else if (row.offense === 2) {
    bits.push(`${row.offenseVia} attacks hit it for double damage`);
  } else if (poor) {
    bits.push('its own attacks are resisted');
  }
  if (row.bossMoves > 0) {
    if (row.incomingWorst <= 0.5) {
      bits.push(`shrugs off everything ${bossName} throws`);
    } else if (row.resisted > 0) {
      bits.push(`resists ${row.resisted} of its ${row.bossMoves} attacks`);
    } else if (row.incomingWorst >= 2) {
      bits.push(poor ? 'it takes double from this fight'
        : 'careful — it takes double from this fight');
    }
  }
  if (!bits.length) return 'No element edge either way.';
  const s = bits.join(', and ');
  return s.charAt(0).toUpperCase() + s.slice(1)
    + (poor ? ' — a poor pick.' : '.');
}

/** The chart's own sentence for a boss header: what to bring. */
export function weaknessLabel(bossElements: string[]): string {
  const counters = new Set<string>();
  for (const [el, row] of Object.entries(ELEMENT_CHART)) {
    for (const target of bossElements) {
      if (row.strong.includes(target)
        && attackMultiplier(el, bossElements) === 2) {
        counters.add(el);
      }
    }
  }
  if (!bossElements.length) {
    return 'No element — nothing hits it for extra damage.';
  }
  if (!counters.size) {
    // a dual-element pal can cancel every would-be counter
    return 'Its element pairing cancels every counter — no element hits '
      + 'it for extra damage.';
  }
  return `Weak to ${[...counters].sort().join(' and ')} attacks.`;
}
