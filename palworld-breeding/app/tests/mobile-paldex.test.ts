/**
 * The phone's Paldex gained bulk own / un-own on 2026-08-17. The website has
 * had them since launch and the phone never did — which is backwards, because
 * the phone is where ticking a filtered list one pal at a time costs two taps
 * each.
 *
 * Two properties make them safe rather than dangerous, and neither is visible
 * from reading the buttons:
 *
 *   1. They only exist while a search or filter is NARROWING the list. Without
 *      that gate, "Own all shown" sits on an unfiltered Paldex and owns all
 *      299 species in one tap — the opposite of a feature.
 *   2. Un-own ARMS first and then names the exact number it will remove, so a
 *      stray tap cannot delete a slice of a real collection.
 *
 * Both were verified on the render (search "Jolthog" → "Own all 2 shown" /
 * "Un-own 1 shown"; own-all took the box 26 → 27; the first un-own tap changed
 * nothing and the confirm took it to 25). This guards them in source, because
 * a refactor that drops either one leaves a green suite and a footgun.
 *
 * There is no React Native test environment here, so this reads the screen the
 * way `privacy-promise.test.ts` reads mobile/src — comments stripped, so a
 * rule that survives only in prose does not count as shipped.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SCREEN = join(__dirname, '../../mobile/src/screens/PaldexScreen.tsx');
const raw = readFileSync(SCREEN, 'utf8');
const code = raw
  .replace(/\{\s*\/\*(?:(?!\*\/)[\s\S])*\*\/\s*\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('the phone Paldex’s bulk actions cannot become a footgun', () => {
  it('reads the screen at all', () => {
    expect(raw.length).toBeGreaterThan(4000);
    expect(code).toContain('PaldexScreen');
  });

  it('offers bulk own and bulk un-own', () => {
    expect(code, 'bulk own is gone').toMatch(/Own all \$\{names\.length\} shown/);
    expect(code, 'bulk un-own is gone').toMatch(/Un-own \$\{shownOwned\} shown/);
  });

  it('hides them unless a search or filter is narrowing the list', () => {
    // the gate: some filter chip is active, or the search box has text
    expect(code, 'the bulk actions are no longer gated behind a filter — '
      + '"Own all shown" on an unfiltered Paldex owns all 299 species')
      .toMatch(/\(activeBits\.length > 0 \|\| !!q\) && names\.length > 0/);
  });

  it('makes un-own arm before it fires, and say how many', () => {
    expect(code, 'the arming step is gone').toContain('Really un-own ${shownOwned}?');
    expect(code, 'un-own no longer requires a second press')
      .toMatch(/if \(!armUnown\) \{ setArmUnown\(true\); return; \}/);
  });

  it('counts what is SHOWN, not what is owned overall', () => {
    // shownOwned must be derived from the filtered `names`, or the button
    // promises to un-own pals that are not on screen
    expect(code).toMatch(/const ownedShown = names\.filter\(\(n\) => ownedAny\(n\)\)/);
    expect(code).toContain('const shownOwned = ownedShown.length;');
  });

  /* Found by setting the state up for real on 2026-08-17: searching a single
   * pal by name — the commonest way anybody reaches these buttons — produced
   *
   *     "Own all 1 shown"      "Un-own 1 shown"      "Really un-own 1?"
   *
   * "All" of one thing, and a DESTRUCTIVE confirm that counts to one instead
   * of naming what disappears. At one result the buttons now say which pal. */
  it('names the pal instead of counting to one', () => {
    expect(code, '"Own all 1 shown" is back')
      .toContain('names.length === 1');
    expect(code).toContain('`Own ${names[0]}`');
    expect(code, 'the un-own no longer names the single pal')
      .toContain('`Un-own ${ownedShown[0]}`');
    expect(code, 'the DESTRUCTIVE confirm counts to one instead of naming it')
      .toContain('`Really un-own ${ownedShown[0]}?`');
  });

  it('still counts when there is more than one', () => {
    expect(code).toContain('`Own all ${names.length} shown`');
    expect(code).toContain('`Un-own ${shownOwned} shown`');
    expect(code).toContain('`Really un-own ${shownOwned}?`');
  });

  it('still keeps the whole-collection clear behind its own confirm', () => {
    expect(code).toContain('Clear collection…');
    expect(code).toContain('Clear the whole collection?');
  });
});
