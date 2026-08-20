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

  it('swim mounts are scored like their siblings, gliders are not', () => {
    // E120 scored Flying and Ground and left the combined glide/swim section
    // behind (method #18 — when you fix a pattern, grep for the pattern).
    // Gliders must NOT be scored: they carry no `value`, so a mixed scored
    // list would rank every glider above every swimmer on `value ?? 1`.
    expect(code).toMatch(/id: 'm-swim'[^}]*scored: true/);
    expect(code, 'gliders were folded back into a scored list — with no value '
      + 'of their own they would all outrank every swimmer')
      .not.toMatch(/id: 'm-glide'[^}]*scored: true/);
    expect(code, 'the combined section is back').not.toContain('Gliders & swimmers');
  });

  it('the blurbs state the formula rather than promising nearness', () => {
    // the old copy promised "closest-to-yours first", which is exactly what
    // made a level-80 list useless — and a promise is a claim
    // scored sections must not promise nearness — but the Gliders section is
    // NOT scored, genuinely orders nearest-first, and may say so honestly
    for (const id of ['m-fly', 'm-ground', 'm-swim']) {
      const start = code.indexOf("id: '" + id + "'");
      const blurb = code.slice(start, code.indexOf('},', start));
      expect(blurb, id + ' promises closest-first but ranks by quality')
        .not.toContain('closest-to-yours first');
    }
    expect(code).toContain('health + attack + defence');
  });
});

describe('the Fighting section points at the screen that knows the fight', () => {
  /* The Fighting list ranks by raw battle stats — the right answer to "who
   * is strong" and the wrong one to "who do I bring to THIS fight", because
   * elements decide that and this list knows nothing about them. It now
   * carries one line through to the Bosses fane's Teams tab, which scores
   * the same box against every element.
   *
   * Read from the source for the reason this whole file is: the screen is
   * React Native and cannot be rendered here. The QA browser could not
   * scroll the goals sheet as far as this section either, so these pins ARE
   * the verification — they hold the wiring, not the pixels. */
  it("offers the link, in a player's words", () => {
    expect(code).toContain('For a specific fight, see your squad by element');
  });

  it('sends it to the Teams tab of the Bosses fane, not somewhere vaguer', () => {
    expect(code).toContain("navigateTo({ domain: 'bosses', tab: 'teams' })");
  });

  it('shows it ONLY on Fighting — a stats list is the only place it corrects', () => {
    expect(code).toContain("sec.id === 'fight' && (");
    // one occurrence: not pasted onto the mount or work sections, where
    // element matchups have nothing to say
    const hits = code.split('For a specific fight, see your squad by element').length - 1;
    expect(hits).toBe(1);
  });

  it('is a real control, with the label a screen reader reads out', () => {
    expect(code).toContain('accessibilityRole="button"');
    expect(code).toContain('See your squad scored against every element');
  });
});
