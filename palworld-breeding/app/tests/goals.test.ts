/** Goal-list rules. These were duplicated prose across two platforms before
 * being extracted, which is how one platform ended up warning about a stale
 * plan while the other silently showed an out-of-date route. */
import { describe, expect, it } from 'vitest';
import { sameTargets, withoutTargets, withTargets } from '../src/logic/goals';

describe('adding goals', () => {
  it('appends in order', () => {
    expect(withTargets(['a'], ['b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('ignores ones already there', () => {
    expect(withTargets(['a', 'b'], ['b'])).toEqual(['a', 'b']);
  });

  it('returns the SAME array when nothing was added — both platforms rely on this to skip a render', () => {
    const cur = ['a', 'b'];
    expect(withTargets(cur, ['a'])).toBe(cur);
    expect(withTargets(cur, [])).toBe(cur);
  });

  it('adds only the new ones from a mixed batch', () => {
    expect(withTargets(['a'], ['a', 'b'])).toEqual(['a', 'b']);
  });
});

describe('removing goals', () => {
  it('drops the named ones and keeps the order', () => {
    expect(withoutTargets(['a', 'b', 'c'], ['b'])).toEqual(['a', 'c']);
  });

  it('returns the SAME array when nothing matched', () => {
    const cur = ['a', 'b'];
    expect(withoutTargets(cur, ['z'])).toBe(cur);
    expect(withoutTargets(cur, [])).toBe(cur);
  });

  it('can empty the list', () => {
    expect(withoutTargets(['a'], ['a'])).toEqual([]);
  });
});

describe('is the route still current', () => {
  it('same goals in a different order is still current', () => {
    // removing a goal and adding it straight back must NOT claim the plan
    // has gone stale — that would be a lie
    expect(sameTargets(['a', 'b'], ['b', 'a'])).toBe(true);
  });

  it('a removed goal makes it stale', () => {
    expect(sameTargets(['a', 'b'], ['a'])).toBe(false);
  });

  it('an added goal makes it stale', () => {
    expect(sameTargets(['a'], ['a', 'b'])).toBe(false);
  });

  it('a swapped goal makes it stale even though the count matches', () => {
    expect(sameTargets(['a', 'b'], ['a', 'c'])).toBe(false);
  });

  it('two empty lists are current', () => {
    expect(sameTargets([], [])).toBe(true);
  });
});
