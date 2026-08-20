/**
 * The Reference tab is the screen whose whole job is PROOF — so its badges
 * must never cast doubt on a claim that earned the opposite, and its words
 * must be the same player's words the rest of the app uses.
 *
 * Found 2026-08-18 (CEO: "the odds and reference tabs might also need some
 * work"): the verdict→badge map was missing 'verified' and the two
 * 'upstream defect' verdicts, so three claims — including the boss-stats
 * one — rendered with the amber fallback that reads as doubt. And the
 * species formula still showed ⌊(A + B + 1)/2⌋, the exact floor-bracket
 * notation E105 banned from the Calculator.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const raw = readFileSync(
  join(__dirname, '../../mobile/src/screens/ReferenceScreen.tsx'), 'utf8');
const code = raw
  .replace(/\{\s*\/\*(?:(?!\*\/)[\s\S])*\*\/\s*\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const claims = (JSON.parse(readFileSync(
  join(__dirname, '../../mobile/src/data/verification.json'), 'utf8'),
) as { claims: { verdict: string }[] }).claims;

describe('every claim verdict has a deliberate badge', () => {
  it('the VERDICT map covers every verdict the shipped claims file uses', () => {
    // DERIVED from the data, not hand-listed: a new verdict added to
    // verification.json without a mapping fails here, not on his screen
    const verdicts = [...new Set(claims.map((c) => c.verdict))];
    for (const v of verdicts) {
      // keys are bare identifiers where the language allows and quoted
      // otherwise — accept either spelling of the same mapping
      const esc = v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expect(code, `verdict "${v}" falls to the amber fallback badge`)
        .toMatch(new RegExp(`['"]?${esc}['"]?:\\s*\\[`));
    }
  });

  it('verified and confirmed both read as proof, not doubt', () => {
    expect(code).toContain("verified: ['verified', 'ok']");
    expect(code).toContain("confirmed: ['confirmed', 'ok']");
  });
});

describe('the handbook speaks the same words as the Calculator', () => {
  it('no floor-bracket notation anywhere on the screen', () => {
    expect(code, 'maths notation is back on a player-facing screen')
      .not.toMatch(/[⌊⌋]/);
  });

  it('the species formula is the Calculator\'s own sentence shape', () => {
    // one mechanic, one wording (E27b): the Calculator explains the same
    // step as "hidden breeding number … average them, rounding up"
    expect(code).toContain('hidden breeding numbers, rounding up');
    expect(code, 'the raw field name leaked back into player copy')
      .not.toMatch(/CombiRank[^s]/);
  });
});
