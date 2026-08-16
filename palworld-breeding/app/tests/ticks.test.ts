/** The claim rules decide whether a player's collection stays correct when
 * they untick a step. The bug these guard against shipped once (4b2ea55) and
 * left invented pals in the Paldex, so both directions are pinned here:
 * a tick must fully undo what it added, and must never take away a pal the
 * player already had. */
import { describe, expect, it } from 'vitest';
import { afterUntick, claimFor } from '../src/logic/ticks';

const NONE = { m: false, f: false };

describe('what a tick is responsible for', () => {
  it('claims a gender it introduced', () => {
    const c = claimFor({ m: true, f: true }, NONE);
    expect(c).toEqual({ m: true, f: true, addedM: true, addedF: true });
  });

  it('claims nothing when you already owned both', () => {
    const c = claimFor({ m: true, f: true }, { m: true, f: true });
    expect(c.addedM).toBe(false);
    expect(c.addedF).toBe(false);
  });

  it('THE REGRESSION: finishing a half-done step keeps the first half\'s claim', () => {
    // first tick: got the male only, nothing owned before
    const first = claimFor({ m: true, f: false }, NONE);
    expect(first).toEqual({ m: true, f: false, addedM: true, addedF: false });

    // completing it: the male is NOW owned — because THIS step added it.
    // Recomputing from ownership alone would record addedM:false and strand
    // that male in the Paldex forever.
    const second = claimFor({ m: true, f: true }, { m: true, f: false }, first);
    expect(second.addedM).toBe(true);
    expect(second.addedF).toBe(true);
  });

  it('a claim is dropped when the tick stops recording that gender', () => {
    const first = claimFor({ m: true, f: false }, NONE);
    // player corrects themselves: actually it was the female
    const second = claimFor({ m: false, f: true }, { m: true, f: false }, first);
    expect(second.addedM).toBe(false);
  });

  it('never claims a gender you owned before, even across two ticks', () => {
    const owned = { m: true, f: false };            // male was already yours
    const first = claimFor({ m: true, f: false }, owned);
    expect(first.addedM).toBe(false);
    const second = claimFor({ m: true, f: true }, { m: true, f: false }, first);
    expect(second.addedM).toBe(false);              // still yours, still not ours
    expect(second.addedF).toBe(true);
  });
});

describe('what survives an untick', () => {
  it('removes the pal entirely when the tick added both', () => {
    const claim = claimFor({ m: true, f: true }, NONE);
    expect(afterUntick({ m: true, f: true }, claim)).toBeNull();
  });

  it('leaves a pal you already owned completely alone', () => {
    const claim = claimFor({ m: true, f: true }, { m: true, f: true });
    expect(afterUntick({ m: true, f: true }, claim)).toEqual({ m: true, f: true });
  });

  it('removes only the gender the tick added', () => {
    const claim = claimFor({ m: true, f: true }, { m: true, f: false });
    expect(afterUntick({ m: true, f: true }, claim)).toEqual({ m: true, f: false });
  });

  it('the two-halves case unwinds completely', () => {
    const first = claimFor({ m: true, f: false }, NONE);
    const second = claimFor({ m: true, f: true }, { m: true, f: false }, first);
    // this is the case that used to leave a male behind
    expect(afterUntick({ m: true, f: true }, second)).toBeNull();
  });
});
