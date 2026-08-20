/** The goal list rules — adding, removing, and deciding whether the route on
 * screen still matches what you are aiming for.
 *
 * These lived twice: once in the phone's store and once in the website's
 * state, with different plumbing around them (a module variable plus an
 * emit, versus a signal). The RULES were identical prose in two places,
 * which is how the "1 goals" plural and the silent-staleness gap both
 * managed to exist on one platform and not the other. The shapes differ;
 * the rules should not.
 *
 * Each function returns the ORIGINAL array when nothing changed. Both
 * platforms depend on that to skip a re-render, so it is part of the
 * contract, not an optimisation detail.
 */

/** Add goals, ignoring ones already in the list, preserving order. */
export function withTargets(current: string[], names: string[]): string[] {
  const next = [...current];
  for (const n of names) if (!next.includes(n)) next.push(n);
  return next.length === current.length ? current : next;
}

/** Drop goals, keeping the order of the rest. */
export function withoutTargets(current: string[], names: string[]): string[] {
  const drop = new Set(names);
  const next = current.filter((t) => !drop.has(t));
  return next.length === current.length ? current : next;
}

/**
 * Does the route on screen still cover the goals you are holding?
 *
 * Order must NOT matter — a player who removes a goal and adds it back has
 * the same plan, and telling them it is out of date would be a lie.
 */
export function sameTargets(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const x = [...a].sort();
  const y = [...b].sort();
  return x.every((v, i) => v === y[i]);
}
