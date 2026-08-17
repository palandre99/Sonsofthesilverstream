/** What a tick is RESPONSIBLE for putting in your collection.
 *
 * Ticking a breeding step registers the hatched pal in the Paldex for you.
 * Unticking has to put things back exactly as they were — which means each
 * tick must remember which genders IT added, as opposed to ones you already
 * owned and must keep.
 *
 * THE BUG THIS EXISTS TO PREVENT (found 2026-08-16, shipped in 4b2ea55):
 * a step finished in two halves calls the completion path TWICE. On the
 * second call the first half has already put one gender in the box, so a
 * naive `got.m && !alreadyOwned.m` concludes "I did not add the male" and
 * OVERWRITES the record that said it had. Unticking then removed only the
 * female and left a pal in the Paldex that the plan invented — and every
 * later plan treated it as owned.
 *
 * So: once a tick has claimed a gender, it KEEPS that claim for as long as
 * it still holds it. The claim is only dropped when the tick itself stops
 * recording that gender.
 *
 * Lives here rather than in either screen because both platforms need the
 * identical rule and the parity gate makes drift impossible — this decides
 * whether a player's collection is correct, which is not a place for two
 * slightly different implementations.
 */

/** What a step's tick currently records — which genders you said you got,
 * and which of those the tick itself put into the collection. */
export interface TickClaim {
  m: boolean;
  f: boolean;
  addedM: boolean;
  addedF: boolean;
}

/**
 * Work out the claim to store for a tick.
 *
 * @param got      what the player just said they hatched
 * @param owned    whether each gender was ALREADY in the collection
 * @param previous the claim this same step stored before, if any — a
 *                 half-done step being completed has one
 */
export function claimFor(
  got: { m: boolean; f: boolean },
  owned: { m: boolean; f: boolean },
  previous?: { addedM: boolean; addedF: boolean } | null,
): TickClaim {
  return {
    m: got.m,
    f: got.f,
    // added if this tick introduced it, OR if an earlier tick of the SAME
    // step already claimed it and we still hold it
    addedM: got.m && (!owned.m || !!previous?.addedM),
    addedF: got.f && (!owned.f || !!previous?.addedF),
  };
}

/**
 * What should remain of a pal after unticking a step, given what the tick
 * claimed. Returns null when nothing is left and the entry should go.
 *
 * The "?" mark — "caught one, couldn't check the gender" — belongs to a
 * different individual than anything this step hatched, so it is never a
 * tick's to take: it survives the untick, and an entry holding only that
 * mark survives with it. Without this, unticking a step could delete a
 * species the player still owns.
 */
export function afterUntick(
  current: { m: boolean; f: boolean; u?: boolean },
  claim: { addedM: boolean; addedF: boolean },
): { m: boolean; f: boolean; u?: boolean } | null {
  const left = {
    m: current.m && !claim.addedM,
    f: current.f && !claim.addedF,
    ...(current.u ? { u: true } : {}),
  };
  return left.m || left.f || current.u ? left : null;
}
