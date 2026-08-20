/**
 * The ABOUT card on the pal detail screen — the game's own Paldex blurb,
 * clamped to two lines with a "tap to read more" hint under it.
 *
 * What reading it aloud found on 2026-08-17:
 *
 *   1. **The hint was gated on a character count while the text is clamped by
 *      LINES.** Measured on the render: Vixy's 111-character blurb needs three
 *      lines (scrollHeight 59 against clientHeight 39) and lost one with
 *      nothing offering to show it, because 111 is under the hard-coded 120.
 *      Hoocrates' 91 fits and correctly showed no hint. Where the third line
 *      begins depends on which letters are in the sentence, so NO character
 *      count can answer this — 15 blurbs sit in the 90-120 gap.
 *   2. **Once expanded, nothing said it could be collapsed.** The CEO made
 *      exactly this point about finished plan phases: "tapping to open the
 *      phase again to look at it, then I can't collapse it back again."
 *
 * The fix measures the real line count with `onTextLayout` and OR's it with
 * the old length rule. That OR is deliberate and load-bearing: `onTextLayout`
 * is an iOS/Android prop react-native-web does not implement, so it cannot be
 * verified on the QA render. Dropping the length rule on the strength of an
 * API I cannot watch work would have taken the hint away from the 272 blurbs
 * it already serves to fix 15 — method #54. OR'd, the measurement can only
 * ADD the hint where it was missing.
 *
 * The screen is React Native and cannot be imported here, so its copy is read
 * from source. Comments are stripped: a rule that survives only in prose does
 * not count as shipped.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import aboutJson from '../../mobile/src/data/about_1_0.json';
import palsJson from '../public/data/pals_1_0.json';

const about = (aboutJson as { about: Record<string, string> }).about;
const pals = (palsJson as { pals: Record<string, unknown> }).pals;

const raw = readFileSync(
  join(__dirname, '../../mobile/src/ui/PalDetail.tsx'), 'utf8');
const code = raw
  .replace(/\{\s*\/\*(?:(?!\*\/)[\s\S])*\*\/\s*\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('every pal has a blurb, so the card never silently vanishes', () => {
  it('all 299 are present', () => {
    // re-derived rather than assumed (method #50). The card is gated on
    // ABOUT[name]; if this ever drops below the roster the gate starts hiding
    // the card the way three others did before E115.
    const missing = Object.keys(pals).filter((n) => !about[n]);
    expect(missing, `${missing.length} pals would show no ABOUT card`).toEqual([]);
    expect(Object.keys(pals).length).toBe(299);
  });
});

describe('the "read more" hint follows the layout, not a character count', () => {
  it('the case that motivated it is real and still in the gap', () => {
    // Vixy needs three lines but is under the old 120-character gate. If the
    // blurb is ever rewritten past 120 this test should be re-pointed at
    // another one rather than deleted — the gap is what matters.
    const vixy = about.Vixy;
    expect(vixy.length).toBeGreaterThan(91);   // Hoocrates fits at 91
    expect(vixy.length).toBeLessThan(120);     // ...and the old rule missed it
  });

  it('15 blurbs sit in the gap a character count cannot judge', () => {
    const gap = Object.values(about).filter((t) => t.length >= 90 && t.length < 120);
    expect(gap.length).toBeGreaterThan(10);
  });

  it('the screen measures the real line count', () => {
    expect(code, 'the layout measurement is gone — the hint is back on a guess')
      .toContain('onTextLayout');
    expect(code).toContain('e.nativeEvent.lines.length > 2');
    expect(code, 'the measuring copy must not take up space or catch taps')
      .toContain("position: 'absolute'");
  });

  it('keeps the length rule as a floor it can only improve on', () => {
    // react-native-web does not implement onTextLayout, so the measurement is
    // unverifiable on the render. Removing the floor would risk taking the
    // hint away from 272 blurbs to fix 15.
    expect(code, 'the length floor is gone — if onTextLayout does not fire on '
      + 'the phone, 272 blurbs silently lose their hint')
      .toContain("aboutClipped || ABOUT[name].length > 120");
  });
});

describe('a state you can enter says how to leave it', () => {
  it('offers to collapse once expanded', () => {
    expect(code, 'the expanded card gives no way back — the exact thing the '
      + 'CEO reported about finished plan phases')
      .toContain('tap to show less');
    expect(code).toContain('tap to read more');
  });

  it('shows exactly one of the two, chosen by the open state', () => {
    expect(code).toContain("aboutOpen ? 'tap to show less' : 'tap to read more'");
  });

  it('resets to collapsed when a different pal is opened', () => {
    // the card is reused across pals; a stale open state would show the wrong
    // blurb expanded, and a stale measurement would show the wrong hint
    expect(code).toContain('setAboutOpen(false)');
    expect(code).toContain('setAboutClipped(false)');
  });
});
