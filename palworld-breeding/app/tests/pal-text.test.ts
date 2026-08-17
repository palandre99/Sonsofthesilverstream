/**
 * The partner-effect text is DATAMINED, and datamined text is not ours to
 * trust. Method #4 says scan it for field names; this scan found worse.
 *
 * Measured across all 297 effects on 2026-08-17:
 *
 *   - **17 arrive cut off.** The knowledge-base source caps them near 200
 *     characters, so sentences stop mid-word. Five ended with a half-written
 *     aside and the app printed "(Does not s". Majex was cut before its first
 *     full stop, so there was no whole sentence in it at all.
 *   - **2 carry a raw game variable** where a number belongs: Leezpunk and
 *     Leezpunk Ignis both read "for {ActiveSkillOverWriteEffectTime} seconds".
 *
 * All of it reached the player verbatim on THREE screens — the pal card, the
 * Odds Lab's partner list, and the Suggested Goals sections.
 *
 * The missing words and the missing number are not in any file we have, and
 * inventing them is forbidden, so `cleanEffect` does the two honest things: it
 * never prints a developer's variable, and it never presents a cut sentence as
 * finished.
 *
 * The rule matters as much as the fix. 139 effects end with a complete
 * "(Does not stack)" and no full stop; an earlier draft called that truncation
 * and would have thrown away good text on all 139 to fix 17. The first test
 * below pins the rule to exactly the effects that are really cut.
 */
import { describe, expect, it } from 'vitest';
import { cleanEffect, isCutOff } from '../../mobile/src/data/palText';
import palsJson from '../public/data/pals_1_0.json';

const pals = (palsJson as { pals: Record<string, { partner_effect?: string | null }> }).pals;
const effects = Object.entries(pals)
  .map(([n, p]) => [n, p.partner_effect ?? ''] as const)
  .filter(([, t]) => t !== '');

describe('the rule catches what is really cut, and nothing else', () => {
  it('the cut effects are the ones the source truncated near its cap', () => {
    const cut = effects.filter(([, t]) => isCutOff(t)).map(([n]) => n);
    // every one of them sits within a few characters of the 200-char cap —
    // that is what makes them truncation rather than style
    for (const n of cut) {
      const t = pals[n].partner_effect!;
      expect(t.length, `${n} is flagged cut but is only ${t.length} chars`)
        .toBeGreaterThan(190);
    }
    expect(cut.length).toBe(17);
  });

  it('leaves the 139 that merely end in “(Does not stack)” alone', () => {
    const asides = effects.filter(([, t]) => /\(Does not stack\.?\)\s*$/.test(t));
    expect(asides.length).toBeGreaterThan(100);
    for (const [n, t] of asides) {
      expect(isCutOff(t), `${n} is whole but was called cut off`).toBe(false);
      expect(cleanEffect(t), `${n} lost text it should have kept`).toBe(t);
    }
  });

  it('leaves every whole effect exactly as the game wrote it', () => {
    const whole = effects.filter(([, t]) => !isCutOff(t) && !/[{}]/.test(t));
    expect(whole.length).toBeGreaterThan(250);
    for (const [n, t] of whole) {
      expect(cleanEffect(t), `${n} was rewritten`).toBe(t);
    }
  });
});

describe('a cut sentence is never presented as finished', () => {
  it('never prints a half-written aside like “(Does not s”', () => {
    for (const [n, t] of effects) {
      const out = cleanEffect(t);
      const open = (out.match(/\(/g) ?? []).length;
      const close = (out.match(/\)/g) ?? []).length;
      expect(open, `${n} still shows an unclosed aside: ${JSON.stringify(out.slice(-24))}`)
        .toBe(close);
    }
  });

  it('marks the gap instead of pretending the sentence ended', () => {
    for (const [n, t] of effects.filter(([, x]) => isCutOff(x))) {
      expect(cleanEffect(t), `${n} does not show that it is cut short`)
        .toMatch(/…$/);
    }
  });

  it('keeps the words we did get — a cut clause is still information', () => {
    // Beakon loses "...for each other Electric Pal in". Dropping the whole
    // clause would lose a real fact to tidy the punctuation.
    const beakon = cleanEffect(pals.Beakon.partner_effect);
    expect(beakon).toContain('for each other Electric Pal in');
    expect(beakon).toMatch(/…$/);
  });

  it('still says something for the one effect cut before its first full stop', () => {
    // Majex has no complete sentence at all — trimming to the last one would
    // have left an empty card
    const majex = cleanEffect(pals.Majex.partner_effect);
    expect(majex.length).toBeGreaterThan(150);
    expect(majex).toMatch(/…$/);
  });

  it('drops the aside that carries nothing, keeps the sentences before it', () => {
    const slowatt = cleanEffect(pals.Slowatt.partner_effect);
    expect(slowatt).not.toContain('(Does not s');
    expect(slowatt).toContain('nearby enemies.');
  });
});

describe('a developer’s variable never reaches the player', () => {
  it('no rendered effect contains a placeholder', () => {
    for (const [n, t] of effects) {
      expect(cleanEffect(t), `${n} prints a raw game variable`).not.toMatch(/[{}]/);
    }
  });

  it('the placeholders in the data are all the shape the wording assumes', () => {
    // "a number of" only reads as English before a unit. If a differently
    // shaped token ever appears, fail here rather than print nonsense.
    const holes = effects.flatMap(([n, t]) =>
      [...t.matchAll(/\S+\s+\{[^}]*\}\s+\S+/g)].map((m) => [n, m[0]] as const));
    expect(holes.length).toBe(2);
    for (const [, phrase] of holes) {
      expect(phrase).toMatch(/^for \{[^}]*\} seconds\.?$/);
    }
  });

  it('reads as a sentence a person wrote', () => {
    const out = cleanEffect(pals.Leezpunk.partner_effect);
    expect(out).toContain('undetectable to enemies for a number of seconds.');
    expect(out).not.toContain('ActiveSkill');
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
