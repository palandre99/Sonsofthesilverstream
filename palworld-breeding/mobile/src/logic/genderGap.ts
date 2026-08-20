/** Why a pair you fully own still cannot breed.
 *
 * Both platforms showed the same dead-end sentence: "You own both species,
 * but not a working ♂/♀ combination." True, and useless — it never said
 * WHICH pal you are short of, so the player has to work it out from the box
 * screen. Every other number in this app carries its meaning with it; this
 * one did not.
 *
 * The rules differ by pair kind, which is exactly why this belongs in one
 * tested place rather than in prose in two screens:
 *
 *   generic pair   — any ♂ with any ♀ across the two species works, so it
 *                    fails only when everything you own is the same gender.
 *   gendered pair  — Katress + Wixen, the game's only one, needs a specific
 *                    mother species AND a specific father species, so it can
 *                    fail with one missing or both.
 *   same species   — you need one of each of that one species.
 */

export type Have = { m: boolean; f: boolean };

/** Who must be the mother and who the father, for the gender-locked pair. */
export type GenderNeed = { mother: string; father: string };

/**
 * Returns the sentence naming what you are missing, or null when the pair
 * can already breed. Callers only render it when both species are owned.
 */
export function genderGap(
  a: string,
  b: string,
  haveA: Have,
  haveB: Have,
  need: GenderNeed | null,
): string | null {
  if (need) {
    const motherOk = need.mother === a ? haveA.f : haveB.f;
    const fatherOk = need.father === a ? haveA.m : haveB.m;
    if (motherOk && fatherOk) return null;
    const missing: string[] = [];
    if (!motherOk) missing.push(`a female ${need.mother}`);
    if (!fatherOk) missing.push(`a male ${need.father}`);
    return `You still need ${missing.join(' and ')}.`;
  }

  if (a === b) {
    if (haveA.m && haveA.f) return null;
    // owning neither is not this function's case, but answer sanely anyway
    if (!haveA.m && !haveA.f) return `You still need a male and a female ${a}.`;
    return haveA.m
      ? `Yours are all male — you still need a female ${a}.`
      : `Yours are all female — you still need a male ${a}.`;
  }

  if ((haveA.m && haveB.f) || (haveA.f && haveB.m)) return null;

  // Everything owned across both species is the same gender, or one species
  // contributes nothing — either way, name the gender that is missing.
  const anyMale = haveA.m || haveB.m;
  return anyMale
    ? `Yours are all male — you still need a female ${a} or ${b}.`
    : `Yours are all female — you still need a male ${a} or ${b}.`;
}
