/**
 * The mount sections of the Suggested Goals sheet.
 *
 * CEO, 2026-08-17, level 80 with 37 pals, looking at Flying mounts: six cards
 * all reading "BREED · 1 STEP", the list led by Nitewing — *"Engine is not
 * actually thinking?"*
 *
 * He was right. Mounts were a MEMBERSHIP list, not a scored one: they sorted
 * by nearness alone, and at a full save nearly everything is one step away, so
 * the tie fell through to the order the array happened to be in. Measured on
 * his save, the old top six were 280-305 stat mid-tier flyers while 395-stat
 * Shaolong — catchable at his level — sat further down.
 *
 * Mounts now carry the game's own stat block as their quality gradient, which
 * `scoreOf` balances against distance. Measured after: Shaolong, Shadowbeak,
 * Eidrolon Ignis lead, and Nitewing (which he owns) drops from 1st to 29th
 * of 29.
 *
 * The screen is React Native and cannot be imported here, so this reads its
 * source. Comments are stripped.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const raw = readFileSync(
  join(__dirname, '../../mobile/src/ui/SuggestedGoals.tsx'), 'utf8');
const code = raw
  .replace(/\{\s*\/\*(?:(?!\*\/)[\s\S])*\*\/\s*\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('the player can choose the order (his idea)', () => {
  /* CEO, 2026-08-17: "Maybe add to the filter there «nearest one» «best one»
   * etc idk". It only became a real choice once mounts had a quality
   * gradient — before that every list was nearest-first and the two orders
   * would have produced the same list.
   *
   * NOT in the shared FilterSheet: that sheet is also the Paldex's and the
   * picker's, and "best" is a category-specific idea that means nothing on a
   * list of every pal. */
  it('offers both orders', () => {
    expect(code).toContain('Best first');
    expect(code).toContain('Closest first');
    expect(code).toContain("useState<GoalOrder>('best')");
  });

  it('only offers it where "best" means something', () => {
    // on a membership list (the four cake ranch pals) both orders are the
    // same list, and a control that does nothing is a lie
    expect(code).toMatch(/sec\.scored && \(/);
  });

  it('“closest” means closest in ACTIONS, not the capped sort key', () => {
    // caught on the render: attainScore caps breeding at 9, so it ranked a
    // 32-step breed above a pal you could just walk out and catch
    expect(code, 'the near order is back on attainScore, which caps at 9 and '
      + 'calls a 32-step breed closer than a one-action catch')
      .toContain('effortSteps(x)');
    expect(code).toContain("order === 'near'");
  });

  it('a pal you own is never "closest" either', () => {
    expect(code).toContain("x.kind === 'have' ? Number.MAX_SAFE_INTEGER");
  });

  it('re-sorts when the choice changes', () => {
    expect(code, 'order is missing from the memo deps — the toggle would do '
      + 'nothing until something else changed')
      .toContain('[sec.id, q, filters, sort, order, bctx.targets]');
  });
});

describe('mounts are ranked, not just listed', () => {
  it('mount items carry a quality value', () => {
    expect(code, 'mountItems has no value again — the sections fall back to '
      + 'nearness alone and every tie is broken by array order')
      .toMatch(/value: x\.q \/ top/);
    expect(code).toContain("(p?.hp ?? 0) + (p?.atk ?? 0) + (p?.def ?? 0)");
  });

  it('the flying and ground sections are scored', () => {
    expect(code).toMatch(/id: 'm-fly'[^}]*scored: true/);
    expect(code).toMatch(/id: 'm-ground'[^}]*scored: true/);
  });

  it('the blurbs state the formula rather than promising nearness', () => {
    // the old copy promised "closest-to-yours first", which is exactly what
    // made a level-80 list useless — and a promise is a claim
    expect(code, 'a mount blurb still promises closest-first ordering')
      .not.toContain('closest-to-yours first');
    expect(code).toContain('health + attack + defence');
  });
});
