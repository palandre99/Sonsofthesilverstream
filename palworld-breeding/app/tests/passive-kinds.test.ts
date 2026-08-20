/**
 * The Odds Lab's "Add a passive" sheet is the one list a player has to read
 * 114 entries of. Until 2026-08-17 each row was badged `T5`, `T3` or `neg` —
 * developer shorthand for a datamined tier — and the `category` field, which
 * sorts all 114 into six kinds, was declared on PassiveInfo and read by
 * nothing. So there was no way to ask for "a work passive".
 *
 * The sheet now names the kind and spells the rank out. That introduces two
 * things a data refresh could silently break, so both are pinned here:
 *
 *   1. A category present in the data with no label falls through to
 *      `?? p.category` and renders the raw id — the player would see the word
 *      "detrimental" on a badge. Every category in the file must have a label.
 *   2. The rank wording follows the file's own `tier_scale`: negatives are
 *      detrimental, 1..4 are the positive ranks, and 5 is the 1.0 "World Tree"
 *      gold tier. "Rank N of 4" is only true while 4 IS the top positive tier.
 *
 * These are checks against the DATA, not against a snapshot of the copy — if
 * the game adds a seventh kind or a sixth rank, this fails and someone reads
 * it rather than shipping a raw field name to the phone.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SCREEN = join(__dirname, '../../mobile/src/screens/OddsScreen.tsx');
const src = readFileSync(SCREEN, 'utf8');

/** strip comments — this file's own prose names the shorthand it bans */
const code = src
  .replace(/\{\s*\/\*(?:(?!\*\/)[\s\S])*\*\/\s*\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const passives = (JSON.parse(
  readFileSync(join(__dirname, '../public/data/passives_1_0.json'), 'utf8'),
) as { passives: { name: string; tier: number; category: string }[] }).passives;

/** the ids listed in PASSIVE_KINDS, in source order */
const labelled = [...code.matchAll(/\{\s*id:\s*'([a-z]+)',\s*label:\s*'([^']+)'\s*\}/g)]
  .map((m) => ({ id: m[1], label: m[2] }));

describe('the passive picker names every kind the game uses', () => {
  it('found the kind table in the screen', () => {
    expect(labelled.length).toBeGreaterThanOrEqual(6);
    expect(passives.length).toBe(114);
  });

  it('labels every category present in the data', () => {
    const known = new Set(labelled.map((k) => k.id));
    const missing = [...new Set(passives.map((p) => p.category))]
      .filter((c) => !known.has(c));
    expect(missing, `these categories would render as a raw field name: ${missing.join(', ')}`)
      .toEqual([]);
  });

  it('does not label a kind the data has never heard of', () => {
    const real = new Set(passives.map((p) => p.category));
    const ghosts = labelled.filter((k) => !real.has(k.id)).map((k) => k.id);
    expect(ghosts, `these chips would always show zero: ${ghosts.join(', ')}`).toEqual([]);
  });

  it('shows a kind chip for every passive — the six kinds cover all 114', () => {
    const known = new Set(labelled.map((k) => k.id));
    const covered = passives.filter((p) => known.has(p.category)).length;
    expect(covered).toBe(passives.length);
  });

  it('says "Rank N of 4" only while 4 really is the top positive rank', () => {
    // tier 5 is the separate World Tree gold tier, per the file's tier_scale
    const positives = passives.map((p) => p.tier).filter((t) => t > 0 && t < 5);
    expect(Math.max(...positives)).toBe(4);
    expect(code).toContain('Rank ${tier} of 4');
    expect(code).toContain('World Tree tier');
  });

  it('keeps the negative tiers described as a downside, not as a rank', () => {
    const negatives = passives.filter((p) => p.tier < 0);
    expect(negatives.length).toBeGreaterThan(0);
    // every negative-tier passive is the category we relabel "Downside"
    expect(negatives.every((p) => p.category === 'detrimental')).toBe(true);
    // and every detrimental one has a negative tier — the two agree, so one
    // badge can honestly stand for both
    expect(passives.filter((p) => p.category === 'detrimental')
      .every((p) => p.tier < 0)).toBe(true);
  });

  it('has no developer shorthand left on the row', () => {
    expect(code, 'the T5/T3 badge is back').not.toMatch(/`T\$\{/);
    expect(code, "the 'neg' badge is back").not.toMatch(/'neg'/);
  });

  it('does not print a passive count the filter can contradict', () => {
    // the placeholder used to say a literal 114 while the sheet hides any
    // passive already sitting on a parent
    expect(code).not.toContain('Search 114 passives');
    expect(code).toContain('available.length} passives');
  });
});
