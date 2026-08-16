/**
 * The pal card exists twice — `mobile/src/ui/PalDetail.tsx` and
 * `app/src/modules/paldex.tsx` — and both tell the player what condensing
 * does. They are separate code, so they can drift, and on 2026-08-17 they had:
 * the phone raised every work level at 4 stars and explained the 1-3 star case,
 * while the website printed "all work +1" and then showed unchanged numbers.
 *
 * A player who checks the site on a laptop and the app on their phone must not
 * get two different answers about the same pal. So the RULES themselves are
 * pinned here, on both files at once:
 *
 *   - stats go up 5% per star            (community-measured, and labelled so)
 *   - partner skill level = stars + 1
 *   - at 4 stars EVERY work suitability goes up by one
 *   - at 1-3 stars ONE job goes up and the game does not say which, so
 *     neither platform is allowed to print a number for it
 *
 * This is a text check, deliberately. The numbers live in JSX on two different
 * frameworks, so there is no shared function to test — but the moment either
 * file stops saying one of these things, whoever changed it has to come and
 * change the other one too, which is the whole point.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PHONE = join(__dirname, '../../mobile/src/ui/PalDetail.tsx');
const WEB = join(__dirname, '../src/modules/paldex.tsx');

const files: [string, string][] = [
  ['phone', readFileSync(PHONE, 'utf8')],
  ['website', readFileSync(WEB, 'utf8')],
];

/** drop comments so a rule that only survives in prose never counts as shipped */
function code(text: string): string {
  return text
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('both platforms describe condensing the same way', () => {
  it('reads a real pal card from each tree', () => {
    for (const [who, src] of files) {
      expect(src.length, `${who}'s pal card looks empty`).toBeGreaterThan(2000);
      expect(code(src)).toContain('stars');
    }
  });

  it('raises stats 5% per star', () => {
    for (const [who, src] of files) {
      // the phone multiplies, the website passes a boost fraction to StatBars —
      // both land on 0.05 per star, and both print stars * 5 as a percentage
      expect(code(src), `${who} lost the 5% per star figure`).toMatch(/0\.05\s*\*\s*stars|stars\s*\*\s*0\.05/);
      expect(code(src), `${who} stopped printing the percentage`).toContain('stars * 5');
    }
  });

  it('puts partner skill at stars + 1 of 5', () => {
    for (const [who, src] of files) {
      expect(code(src), `${who} lost the partner skill level`)
        .toContain('partner skill level {stars + 1} of 5');
    }
  });

  it('raises EVERY work suitability at 4 stars, and only at 4 stars', () => {
    for (const [who, src] of files) {
      expect(code(src), `${who} no longer boosts work levels at 4 stars`)
        .toContain('stars === 4 ? lvl + 1 : lvl');
      expect(code(src), `${who} lost the 4-star header tag`)
        .toMatch(/every (job|work suitability)( below)? \+1/);
    }
  });

  it('refuses to guess which job goes up at 1-3 stars', () => {
    for (const [who, src] of files) {
      const c = code(src);
      expect(c, `${who} dropped the 1-3 star explanation`)
        .toContain('never says which one');
      // the note must be conditional on 1-3 stars, not printed always
      expect(c, `${who} shows the 1-3 star note outside 1-3 stars`)
        .toMatch(/stars\s*>\s*0\s*&&\s*stars\s*<\s*4/);
    }
  });

  it('keeps saying the condensing figures are not from the game files', () => {
    for (const [who, src] of files) {
      expect(code(src), `${who} stopped labelling condensing as community-measured`)
        .toContain('community-measured');
    }
  });
});
