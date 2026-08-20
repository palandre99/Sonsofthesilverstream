/**
 * The partner-effect text is DATAMINED, and datamined text is not ours to
 * trust. Measured 2026-08-17: 17 effects arrived cut off near the source's
 * 200-char cap and 2 carried a raw game variable — all shown verbatim on
 * three screens until `cleanEffect` handled the symptom honestly.
 *
 * REPAIRED 2026-08-18 (E139): tools/fetch_partner_effects.py completed
 * every one from paldb's mirror of the live game table — 14 accepted only
 * because our truncated text was a character-prefix of the fetched text,
 * and 4 as hand-diffed 1.0.3 rewords (the ledger records each diff). The
 * shipped data now contains ZERO cut effects and ZERO placeholders, and
 * this file pins that so a stale re-extract cannot bring them back.
 *
 * `cleanEffect` REMAINS the last line of defence — the next data refresh
 * can break the same ways — so its rules are pinned on synthetic inputs
 * that no longer exist in the shipped data.
 */
import { describe, expect, it } from 'vitest';
import { cleanEffect, isCutOff } from '../../mobile/src/data/palText';
import palsJson from '../public/data/pals_1_0.json';

const pals = (palsJson as { pals: Record<string, { partner_effect?: string | null }> }).pals;
const effects = Object.entries(pals)
  .map(([n, p]) => [n, p.partner_effect ?? ''] as const)
  .filter(([, t]) => t !== '');

describe('the shipped data is whole — the E139 repair stays repaired', () => {
  it('zero effects are cut off', () => {
    const cut = effects.filter(([, t]) => isCutOff(t)).map(([n]) => n);
    expect(cut, 'a stale extract re-introduced truncated effects').toEqual([]);
  });

  it('zero effects carry a raw game variable', () => {
    const holes = effects.filter(([, t]) => /[{}]/.test(t)).map(([n]) => n);
    expect(holes, 'a stale extract re-introduced placeholders').toEqual([]);
  });

  it('the worst historical cases now end whole, with their real numbers', () => {
    // Majex was once cut before its first full stop; Beakon lost its tail;
    // Leezpunk said "{ActiveSkillOverWriteEffectTime} seconds"
    expect(pals.Majex.partner_effect).toMatch(/\(Does not stack\.?\)$/);
    expect(pals.Beakon.partner_effect).toMatch(/\(Excluding Beakon\)$/);
    expect(pals.Leezpunk.partner_effect).toMatch(/for \(\d+~\d+\) seconds/);
    expect(pals.Leezpunk.partner_effect).not.toContain('{');
  });

  it('every whole effect renders exactly as the game wrote it', () => {
    expect(effects.length).toBeGreaterThan(290);
    for (const [n, t] of effects) {
      expect(cleanEffect(t), `${n} was rewritten by the cleaner`).toBe(t);
    }
  });
});

describe('cleanEffect still guards the ways the data USED to break', () => {
  it('a cut sentence is marked, its words kept', () => {
    const cut = 'Increases Attack by 10%. While mounted, the player can';
    expect(isCutOff(cut)).toBe(true);
    expect(cleanEffect(cut)).toBe(`${cut} …`);
  });

  it('a half-written aside is dropped, the sentences before it kept', () => {
    const cut = 'Shocks nearby enemies. (Does not s';
    expect(cleanEffect(cut)).toBe('Shocks nearby enemies. …');
    expect(cleanEffect(cut)).not.toContain('(Does not s');
  });

  it('never prints an unclosed aside', () => {
    for (const [n, t] of effects) {
      const out = cleanEffect(t);
      const open = (out.match(/\(/g) ?? []).length;
      const close = (out.match(/\)/g) ?? []).length;
      expect(open, `${n} shows an unclosed aside: ${JSON.stringify(out.slice(-24))}`)
        .toBe(close);
    }
  });

  it('a raw game variable becomes written English, never braces', () => {
    const holed = 'undetectable to enemies for {ActiveSkillOverWriteEffectTime} seconds.';
    expect(cleanEffect(holed)).toBe('undetectable to enemies for a number of seconds.');
  });

  it('a complete "(Does not stack)" with no full stop is whole, not cut', () => {
    // 139 effects end exactly like this — the rule that nearly threw away
    // good text on all of them to fix 17 stays pinned
    const whole = 'Increases fire damage by 10%. (Does not stack)';
    expect(isCutOff(whole)).toBe(false);
    expect(cleanEffect(whole)).toBe(whole);
  });
});

describe('the screens that show effects all clean them', () => {
  // method #38: a shared helper only reaches the screens that actually use it
  const { readFileSync } = require('node:fs') as typeof import('node:fs');
  const { join } = require('node:path') as typeof import('node:path');
  const SCREENS = [
    'ui/PalDetail.tsx',
    'screens/OddsScreen.tsx',
    'ui/SuggestedGoals.tsx',
  ];

  for (const f of SCREENS) {
    it(`${f} renders effects through cleanEffect`, () => {
      const src = readFileSync(join(__dirname, '../../mobile/src', f), 'utf8');
      expect(src, `${f} shows partner_effect raw again`).toContain('cleanEffect(');
      // the only bare partner_effect left may be a filter, never a render
      const bare = src.split('\n').filter((l) =>
        l.includes('partner_effect') && !l.includes('cleanEffect'));
      for (const line of bare) {
        expect(line, `${f} still renders raw text: ${line.trim()}`)
          .toMatch(/re\.test|\/\*|\*|import|interface|\bstring\b/);
      }
    });
  }
});
