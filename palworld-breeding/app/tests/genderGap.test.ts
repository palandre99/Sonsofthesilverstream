/** The pair you own but still cannot breed — the message has to name the pal
 * you are short of, because "not a working ♂/♀ combination" left the player
 * to work it out themselves. */
import { describe, expect, it } from 'vitest';
import { genderGap } from '../src/logic/genderGap';

const M = { m: true, f: false };
const F = { m: false, f: true };
const BOTH = { m: true, f: true };

describe('ordinary pairs — any male with any female', () => {
  it('says nothing when a working pair exists', () => {
    expect(genderGap('Lamball', 'Cattiva', M, F, null)).toBeNull();
    expect(genderGap('Lamball', 'Cattiva', F, M, null)).toBeNull();
    expect(genderGap('Lamball', 'Cattiva', BOTH, BOTH, null)).toBeNull();
  });

  it('one species holding both genders is enough on its own', () => {
    expect(genderGap('Lamball', 'Cattiva', BOTH, M, null)).toBeNull();
    expect(genderGap('Lamball', 'Cattiva', F, BOTH, null)).toBeNull();
  });

  it('names the missing gender when everything owned is male', () => {
    expect(genderGap('Lamball', 'Cattiva', M, M, null))
      .toBe('Yours are all male — you still need a female Lamball or Cattiva.');
  });

  it('names the missing gender when everything owned is female', () => {
    expect(genderGap('Lamball', 'Cattiva', F, F, null))
      .toBe('Yours are all female — you still need a male Lamball or Cattiva.');
  });
});

describe('the gender-locked pair — Katress + Wixen, the only one in the game', () => {
  const ignis = { mother: 'Katress', father: 'Wixen' };
  const noct = { mother: 'Wixen', father: 'Katress' };

  it('says nothing when the exact roles are covered', () => {
    // Katress Ignis needs a female Katress and a male Wixen
    expect(genderGap('Katress', 'Wixen', F, M, ignis)).toBeNull();
    // Wixen Noct needs it the other way round
    expect(genderGap('Katress', 'Wixen', M, F, noct)).toBeNull();
  });

  it('a pair that works one way does NOT work the other', () => {
    expect(genderGap('Katress', 'Wixen', F, M, noct))
      .toBe('You still need a female Wixen and a male Katress.');
  });

  it('names one missing parent when only one role is short', () => {
    expect(genderGap('Katress', 'Wixen', F, F, ignis))
      .toBe('You still need a male Wixen.');
    expect(genderGap('Katress', 'Wixen', M, M, ignis))
      .toBe('You still need a female Katress.');
  });

  it('the two-females case seen on device: Noct is short only of the male', () => {
    // owning a female of each covers Noct's mother (Wixen) already, so the
    // message must name the male Katress ALONE — not both parents
    expect(genderGap('Katress', 'Wixen', F, F, noct))
      .toBe('You still need a male Katress.');
  });

  it('names both when neither role is covered', () => {
    // female Katress + male Wixen breeds Ignis, but for Noct BOTH roles are
    // wrong — the one pair that can make one child and not the other
    expect(genderGap('Katress', 'Wixen', F, M, noct))
      .toBe('You still need a female Wixen and a male Katress.');
    expect(genderGap('Katress', 'Wixen', F, M, ignis)).toBeNull();
  });

  it('does not care which side the mother species was picked on', () => {
    // same situation, parents entered in the other order
    expect(genderGap('Wixen', 'Katress', M, F, ignis)).toBeNull();
  });
});

describe('breeding a species with itself', () => {
  it('says nothing when you hold both genders', () => {
    expect(genderGap('Lamball', 'Lamball', BOTH, BOTH, null)).toBeNull();
  });

  it('names the one gender you lack', () => {
    expect(genderGap('Lamball', 'Lamball', M, M, null))
      .toBe('Yours are all male — you still need a female Lamball.');
    expect(genderGap('Lamball', 'Lamball', F, F, null))
      .toBe('Yours are all female — you still need a male Lamball.');
  });
});
