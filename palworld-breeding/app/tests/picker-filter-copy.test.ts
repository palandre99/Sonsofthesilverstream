/**
 * The pal picker and the filter sheet are the two surfaces a player passes
 * through constantly — every parent choice, every Paldex filter — and neither
 * had ever had its copy read aloud. Two findings.
 *
 * 1. THE APP SPELLED ONE STAT TWO WAYS. The Odds Lab said "Defence"; the
 *    Paldex sort and the filter chip said "Defense". The GAME's own datamined
 *    text says "Defense" (and the stat icon asset is literally Defense.png),
 *    so the Odds Lab was the outlier. One spelling now, matching the game.
 *
 * 2. THE PICKER REPEATED A BUG THE PALDEX HAD ALREADY FIXED. With a search
 *    AND a filter both narrowing, it said "No pal matches X" — blaming the
 *    search alone and sending the player to re-type a word that was never the
 *    problem. The Paldex hit this, fixed it with three branches, and the fix
 *    was never carried across. METHOD #18: structural fixes port too.
 *
 * Verified on the render, all three branches:
 *   search only        No pal matches “zzzz”. Check the spelling.
 *   search + filter    Nothing matches “zzzz” with those filters.
 *                      Clear a filter, or check the spelling.
 *   filter only        Nothing matches those filters.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const M = join(__dirname, '../../mobile/src');
const read = (p: string) => readFileSync(join(M, p), 'utf8')
  .replace(/\{\s*\/\*(?:(?!\*\/)[\s\S])*\*\/\s*\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const picker = read('ui/PalPicker.tsx');
const sheet = read('ui/FilterSheet.tsx');
const odds = read('screens/OddsScreen.tsx');
const paldex = read('screens/PaldexScreen.tsx');
const card = read('ui/PalDetail.tsx');

describe('one stat, one spelling', () => {
  it('nothing the player reads says "Defence"', () => {
    for (const [name, src] of [['Odds Lab', odds], ['Paldex', paldex],
      ['filter sheet', sheet], ['pal card', card], ['picker', picker]] as const) {
      expect(src, `${name} is back to the British spelling`).not.toContain('Defence');
    }
  });

  it('and they all say "Defense", the way the game does', () => {
    expect(odds).toContain("HP, Attack and Defense");
    expect(odds).toContain("['def', 'Defense']");
    expect(paldex).toContain("def: 'by Defense'");
    expect(sheet).toContain('label="Defense"');
  });
});

describe('the picker names the real reason a list is empty', () => {
  it('has all three branches, not two', () => {
    expect(picker, 'the combined search-and-filter case is missing again')
      .toContain('q && filtering ? `Nothing matches');
    expect(picker).toContain('with those filters.');
    expect(picker).toContain(': q ? `No pal matches');
    expect(picker).toContain("'Nothing matches those filters.'");
  });

  it('knows when a FILTER is narrowing, not just the search box', () => {
    expect(picker).toContain("filters.own !== NO_FILTERS.own");
    expect(picker).toContain('filters.elements.length > 0');
    expect(picker).toContain('filters.work != null');
  });

  it('says the same thing the Paldex says', () => {
    // two paths, one question — METHOD #20
    for (const phrase of ['with those filters.', 'No pal matches', 'Nothing matches those filters.']) {
      expect(picker, `picker lost "${phrase}"`).toContain(phrase);
      expect(paldex, `Paldex lost "${phrase}"`).toContain(phrase);
    }
  });

  it('the advice under it matches the cause named above it', () => {
    expect(picker).toContain("'Clear a filter, or check the spelling.'");
    expect(picker).toContain("'Check the spelling.'");
    expect(picker).toContain("'Tap a filter again to clear it.'");
  });
});

describe('the filter sheet already got its counted label right', () => {
  it('says "1 pal", never "1 pals"', () => {
    expect(sheet).toContain("`Show ${n} ${n === 1 ? 'pal' : 'pals'}`");
  });
});
