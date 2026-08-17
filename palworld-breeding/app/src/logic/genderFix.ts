/** How to actually GET the ♂/♀ a plan step says you are missing.
 *
 * The step hint names the gap ("need a ♂ Relaxaurus — or a ♀ Sparkit") and
 * used to stop there — the CEO, 2026-08-17: "it should give more info to be
 * smarter, maybe a 'breed x and y to get a female', or 'catch one here'…
 * tells me how to fix this step". So this module answers, from what the
 * player actually owns, in order of cheapness:
 *
 *   1. an owned pal of that species marked "?" — checking its gender may
 *      close the gap with zero eggs;
 *   2. an owned pair that can breed TODAY and whose egg is that species —
 *      preferring the plan's own recipe, with the species' real datamined
 *      gender odds per egg (data/genderRatio.g, palcalc's
 *      BreedingGenderProbability table);
 *   3. catching one in the wild;
 *   4. failing all of those, the pal's card — which carries every obtain
 *      route the game data records.
 *
 * Pure and store-free: the caller supplies ownership and the engine as
 * closures, so both platforms share one tested copy (parity-gated).
 */

export interface NeedFix {
  species: string;
  gender: 'm' | 'f';
  /** the player owns one of this species with the gender never checked */
  unsure: boolean;
  /** an owned pair that can breed today and whose egg is this species */
  pair: [string, string] | null;
  /** true when `pair` is the plan's own recipe for the species */
  fromPlan: boolean;
  /** the species spawns in the wild */
  wild: boolean;
  /** datamined male probability for the species (0.5 when not skewed) */
  maleProb: number;
}

/** Find an owned pair whose egg is the needed species, breedable as owned
 * today. The plan's own recipe wins when it qualifies — the player is
 * already following it; otherwise the first match in name order, so the
 * answer is stable across renders. `makes(a, b)` must be true only when the
 * pair can breed right now AND its egg is the needed species. */
export function findPair(
  owned: readonly string[],
  planPair: readonly [string, string] | null,
  makes: (a: string, b: string) => boolean,
): { pair: [string, string] | null; fromPlan: boolean } {
  if (planPair && makes(planPair[0], planPair[1])) {
    return { pair: [planPair[0], planPair[1]], fromPlan: true };
  }
  const names = [...owned].sort();
  for (const a of names) {
    for (const b of names) {
      if (makes(a, b)) return { pair: [a, b], fromPlan: false };
    }
  }
  return { pair: null, fromPlan: false };
}

const WORD = { m: 'male', f: 'female' } as const;

/** The odds phrase for one egg of this species hatching the needed gender —
 * only ever from the datamined table, never a made-up figure. */
export function oddsPhrase(gender: 'm' | 'f', maleProb: number): string {
  const p = gender === 'm' ? maleProb : 1 - maleProb;
  if (p === 0.5) return `about half the eggs hatch ${WORD[gender]}`;
  return `about ${Math.round(p * 100)}% of eggs hatch ${WORD[gender]}`;
}

/** One row of advice, in a player's words. The row itself opens the pal's
 * card, so every branch ends somewhere the player can act. */
export function fixLine(f: NeedFix): string {
  if (f.unsure) {
    return `first check the one you marked "?" — it may already be the ${WORD[f.gender]} you need`;
  }
  if (f.pair) {
    const breed = `breed ${f.pair[0]} + ${f.pair[1]}${f.fromPlan ? ' again' : ''}`;
    const tail = f.wild ? ' · or catch one — tap for where' : ' · tap the card for other ways';
    return `${breed} — ${oddsPhrase(f.gender, f.maleProb)}${tail}`;
  }
  if (f.wild) {
    return 'no pair you own breeds one — catch it in the wild, tap for where';
  }
  return 'no pair you own breeds one — tap the card for how to get it';
}
