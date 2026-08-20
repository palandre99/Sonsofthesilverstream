/** The recommendation brain — how the app decides what a pal is worth
 * suggesting, shared verbatim between the website and the phone.
 *
 * BYTE-IDENTICAL RULE: this file exists as an exact copy in
 * `app/src/logic/` and `mobile/src/logic/`, enforced by
 * `app/tests/logic-parity.test.ts` (same mechanism as the engine gate).
 * Change one → change both. It deliberately imports nothing
 * platform-specific: the pals record, the box and the player level are
 * passed in by the caller.
 *
 * The honesty contract: every INPUT here is datamined (work levels, wild
 * spawn levels, breeding steps from the oracle-tested planner, saddle
 * levels). The way they are COMBINED is ranking logic, stated in plain
 * words in the UI so the player can check us.
 */
import { derivations } from '../engine/planner';
import type { BreedingEngine } from '../engine/formula';
import type { BreedingData } from '../engine/types';
import { PALCALC_FACTS } from '../data/palcalcFacts.g';
import { SADDLE_LEVELS } from '../data/saddleLevels.g';

/** How the player would GET a pal, judged from their own save:
 *   have  — already in the box
 *   breed — reachable from the box by breeding alone (exact step count)
 *   catch — spawns wild within the player's reach
 *   later — needs a specific catch first (unlock), or is a long-term goal */
export type Attain =
  | { kind: 'have' }
  | { kind: 'breed'; steps: number; catchLv?: number }
  | { kind: 'catch'; lv: number; steps?: number }
  | { kind: 'later'; unlock?: string };

/** the minimal slice of pal data the brain needs — both platforms' pal
 * records satisfy it structurally */
export interface WildInfo { wild?: boolean | null }

/* ---------------- cached derivations ----------------
 * The reachability fixpoint is the one expensive computation (hundreds of
 * ms on a big box). One slot is enough: only one save is active at a time,
 * and every surface asks about the same box. */

let derivSlot: { key: string; map: Map<string, Set<string>> } | null = null;

export function boxKeyOf(roster: string[]): string {
  return [...roster].sort().join(',');
}

/** Minimal-breeding-steps map for this roster — cached until the roster
 * changes, shared by the suggestions sheet, the planner and the cards. */
export function cachedDerivations(
  engine: BreedingEngine, roster: string[],
): Map<string, Set<string>> {
  const key = boxKeyOf(roster);
  if (derivSlot?.key !== key) {
    derivSlot = {
      key,
      map: roster.length
        ? derivations(engine, new Set(roster))
        : new Map<string, Set<string>>(),
    };
  }
  return derivSlot.map;
}

/** true when the expensive part for this roster is already paid — lets a
 * UI show a one-beat "reading your save" state instead of freezing */
export function derivationsReady(roster: string[]): boolean {
  return derivSlot?.key === boxKeyOf(roster);
}

/* ---------------- attainability ---------------- */

export interface AttainContext {
  attain: (n: string) => Attain;
  /** the level the judgements are tuned to */
  stage: number;
  /** true when the player told us their level (strict cutoff, no slack) */
  explicit: boolean;
}

export function getAttainContext(
  engine: BreedingEngine,
  pals: Record<string, WildInfo>,
  breeding: BreedingData,
  boxNames: string[],
  playerLevel: number | undefined,
  ownedAny: (n: string) => boolean,
): AttainContext {
  const derivs = cachedDerivations(engine, boxNames);
  // the player's real level wins when they've set it; otherwise read the
  // box — the highest wild level their pals occupy, with slack because a
  // box always lags the player
  const explicit = playerLevel != null;
  const stage = playerLevel
    ?? Math.max(15, ...boxNames.map((n) => PALCALC_FACTS[n]?.maxWild ?? 0));
  const slack = explicit ? 0 : 10;
  const catchable = (n: string): boolean => {
    const f = PALCALC_FACTS[n];
    return !!pals[n]?.wild && f?.minWild != null && f.minWild <= stage + slack;
  };
  const memo = new Map<string, Attain>();
  const attain = (n: string): Attain => {
    const hit = memo.get(n);
    if (hit) return hit;
    let a: Attain;
    if (ownedAny(n)) a = { kind: 'have' };
    else {
      const d = derivs.get(n);
      const steps = d ? Math.max(1, d.size) : 0;
      // one catch is one action — when the breeding route is long and the
      // pal spawns within reach, catching IS the smart recommendation
      // (same ≥4-step threshold as the planner's catch-instead advice)
      // A pal can be reachable BOTH ways, and the row used to name only the
      // one it recommended — so "Catch one in the wild, spawns from Lv 76"
      // was the whole story even when the player could breed it instead
      // (CEO, 2026-08-17: "it doesn't say if I can breed it or not"). Pick the
      // recommendation exactly as before, but carry the other route with it.
      const canCatch = catchable(n);
      const catchLv = canCatch ? PALCALC_FACTS[n]!.minWild! : undefined;
      if (d && (steps < 4 || !canCatch)) a = { kind: 'breed', steps, catchLv };
      else if (canCatch) {
        a = { kind: 'catch', lv: PALCALC_FACTS[n]!.minWild!, steps: d ? steps : undefined };
      }
      else {
        // "catch X to unlock the breeding route": one producing pair where
        // one parent is already breedable and the other is a reachable
        // catch. First hit wins.
        a = { kind: 'later' };
        for (const c of breeding.unique_combos) {
          if (c.child !== n) continue;
          const [pa, pb] = c.parents;
          if ((derivs.has(pa) || ownedAny(pa)) && catchable(pb)) {
            a = { kind: 'later', unlock: pb };
            break;
          }
          if ((derivs.has(pb) || ownedAny(pb)) && catchable(pa)) {
            a = { kind: 'later', unlock: pa };
            break;
          }
        }
      }
    }
    memo.set(n, a);
    return a;
  };
  return { attain, stage, explicit };
}

/* ---------------- ordering + scoring ---------------- */

/** sort key: actionable first — cheap breeds, then catches, then unlocks,
 * then long-term goals, owned proof last */
export function attainScore(a: Attain): number {
  if (a.kind === 'breed') return Math.min(a.steps, 9);
  if (a.kind === 'catch') return 10;
  if (a.kind === 'later') return a.unlock ? 20 : 30;
  return 40;
}

/** How many player actions a pal costs from this save. */
export function effortSteps(a: Attain): number {
  switch (a.kind) {
    case 'have': return 0;
    case 'breed': return a.steps;
    case 'catch': return 1; // one catch = one action
    case 'later': return a.unlock ? 3 : 99; // catch the unlocker, then breed
  }
}

/** The recommendation score: how good (value 0..1 within its section)
 * balanced against how close (effort in actions). A level-6 worker one
 * breed away beats a level-7 worker 83 breeds away — the CEO's example,
 * locked in as a unit test. */
export function scoreOf(value: number, a: Attain): number {
  // Something already in the box is not a recommendation, it is a fact. It
  // used to keep its FULL value here (owning costs zero effort), so a
  // mediocre pal he already had outranked an excellent one a few steps away
  // — measured: owned at value 0.50 scored 0.500 against 0.375 for a perfect
  // pal five steps out. CEO, 2026-08-17: "Also it recommends pals I have
  // caught? ... Or maybe not recommend at all?" Owned pals still appear in
  // the list, at the end, where they read as proof rather than advice.
  if (a.kind === 'have') return -1;
  return value / (1 + effortSteps(a) / 3);
}

/** Which pals earn the RECOMMENDED tag in a section: nearly the best
 * (≥75% of the section's top value — one suitability level below the top
 * on the game's 1–4 job scale still counts as "nearly"), genuinely close
 * (≤3 actions), and not something the player already has. Deterministic
 * and explainable. */
export function recommendedSet(
  items: { name: string; value: number }[],
  attain: (n: string) => Attain,
): Set<string> {
  const best = Math.max(0, ...items.map((x) => x.value));
  const out = new Set<string>();
  if (best <= 0) return out;
  for (const x of items) {
    const a = attain(x.name);
    if (a.kind === 'have') continue;
    if (x.value >= 0.75 * best && effortSteps(a) <= 3) out.add(x.name);
  }
  return out;
}

/* ---------------- labels ----------------
 * ONE label function for every surface — the chips and the big rows must
 * never disagree about what a pal's status means (CEO: "ENDGAME GOAL"
 * told him nothing). Short fits a chip; long explains and says the next
 * action in a player's words. */

export function attainLabel(a: Attain): { short: string; long: string } {
  switch (a.kind) {
    case 'have':
      return { short: 'HAVE IT', long: 'Already in your Paldex.' };
    case 'breed': {
      const base = a.steps === 1
        ? 'Breed it — one step from pals you already have'
        : `Breed it — ${a.steps} steps from pals you already have`;
      return {
        short: a.steps === 1 ? 'BREED · 1 STEP' : `BREED · ${a.steps} STEPS`,
        long: a.catchLv != null
          ? `${base}, or catch one from Lv ${a.catchLv}.`
          : `${base}.`,
      };
    }
    case 'catch': {
      const base = `Catch one in the wild — spawns from Lv ${a.lv}`;
      return {
        short: `CATCH LV ${a.lv}`,
        long: a.steps == null
          ? `${base}. No breeding route from your pals yet.`
          : a.steps === 1
            ? `${base}, or breed it in one step.`
            : `${base}, or breed it in ${a.steps} steps.`,
      };
    }
    case 'later':
      return a.unlock
        ? {
          short: `CATCH ${a.unlock.toUpperCase()} FIRST`,
          long: `Catch ${a.unlock} first — that unlocks the breeding route to this one.`,
        }
        : {
          short: 'LONG-TERM GOAL',
          long: 'Out of reach for now — it needs pals you can\'t catch or breed yet.',
        };
  }
}

/** Mount extra: a mount you can't ride yet is honestly further away than
 * its breeding distance says. Returns the note to show, if any. */
export function saddleGap(name: string, stage: number): string | null {
  const lv = SADDLE_LEVELS[name];
  return lv != null && lv > stage ? `saddle unlocks at Lv ${lv}` : null;
}
