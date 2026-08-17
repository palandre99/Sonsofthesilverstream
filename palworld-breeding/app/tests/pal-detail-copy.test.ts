/**
 * The pal card is the densest data surface in the app — stats and their rank,
 * work levels, drops, spawn levels, passives, obtain notes, regions — and it
 * opens from every screen. Its copy had never been read aloud.
 *
 * What the read found on 2026-08-17: **three cards on the screen are gated on
 * the pal having the data, and on a handful of species the data is empty — so
 * the card silently vanished.**
 *
 *   Work suitability   — gone on 2 of 299 (Astralym, Panthalus)
 *   Drops              — gone on 1 of 299 (Petallia Ignis)
 *   Partner skill      — gone on 1 of 299 (Astralym)
 *
 * Every other pal shows all three, so the gap read as a broken screen rather
 * than as a fact. That is E114's lesson one screen along: an absence nobody
 * explains reads as a bug. Astralym loses two cards at once, which is why its
 * card looked the most broken of any pal in the game.
 *
 * The sentence is deliberately about OUR FILES, not about the game: we can
 * prove our extraction lists nothing, we cannot prove the pal has nothing.
 * Claiming the stronger thing would break the standing rule against inventing
 * game facts. All three cards say it in the same words.
 *
 * The screen is React Native and cannot be imported here, so its copy is read
 * from source the way `odds-copy.test.ts` reads OddsScreen. Comments are
 * stripped: a rule that survives only in prose does not count as shipped.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import palsJson from '../public/data/pals_1_0.json';

interface Row {
  work?: Record<string, number>;
  drops?: string[];
  ranch_produce?: string[] | null;
  partner_skill?: string | null;
}
const pals = (palsJson as { pals: Record<string, Row> }).pals;
const TOTAL = Object.keys(pals).length;

const raw = readFileSync(
  join(__dirname, '../../mobile/src/ui/PalDetail.tsx'), 'utf8');
const code = raw
  .replace(/\{\s*\/\*(?:(?!\*\/)[\s\S])*\*\/\s*\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const without = (has: (p: Row) => boolean) =>
  Object.entries(pals).filter(([, p]) => !has(p)).map(([n]) => n).sort();

const GATES = [
  {
    card: 'Work suitability',
    missing: without((p) => Object.keys(p.work ?? {}).length > 0),
    expect: ['Astralym', 'Panthalus'],
    what: 'work suitabilities',
  },
  {
    card: 'Drops',
    missing: without((p) => (p.drops?.length ?? 0) > 0 || (p.ranch_produce?.length ?? 0) > 0),
    expect: ['Petallia Ignis'],
    what: 'drops or ranch produce',
  },
  {
    card: 'Partner skill',
    missing: without((p) => !!p.partner_skill),
    expect: ['Astralym'],
    what: 'partner skill',
  },
];

describe('the stat ranks are honest at every extreme', () => {
  /* Read aloud 2026-08-17, every branch measured against the data:
   * no pal has a null hp/atk/def (the "—" branch is defence, not a path);
   * rank 1, the worst rank and the 1-pal tie all read correctly; the largest
   * tie is 121 pals at 100 attack and the badge says so. One real defect:
   * at stars > 0 the VALUE column shows the boosted preview while the rank
   * badge stays computed from base — two individually-correct numbers
   * contradicting on screen (method #43). The rank SHOULD stay at base
   * (species rank is a base-stat fact), so the fix is the sentence, not the
   * number: the stars footnote now says "ranks compare base stats". */
  const stats = ['hp', 'atk', 'def'] as const;

  it('every pal has every stat — the "—" branch is defence, not a path', () => {
    for (const k of stats) {
      const nulls = Object.entries(pals).filter(([, p]) =>
        (p as Record<string, unknown>)[k] == null);
      expect(nulls.map(([n]) => n)).toEqual([]);
    }
  });

  it('the rank is computed from the BASE stat, never the boosted preview', () => {
    // feeding boost() into statRank would make the badge lie about the
    // number printed beside it in the opposite direction
    expect(code).toContain("rank={statRank('hp', p.hp)}");
    expect(code).toContain("rank={statRank('atk', p.atk)}");
    expect(code).toContain("rank={statRank('def', p.def)}");
    expect(code, 'the rank badge is ranking the boosted preview')
      .not.toMatch(/statRank\('(?:hp|atk|def)', boost\(/);
  });

  it('and the stars footnote says so', () => {
    // the value column boosts, the badge does not — without this sentence the
    // two correct numbers contradict each other on screen
    expect(code).toContain('ranks');
    expect(code).toContain('compare base stats');
  });

  it('the bar cannot overflow its track, even boosted', () => {
    expect(code).toContain('Math.min(100,');
  });

  it('the singular tie really occurs, so the plural branch matters', () => {
    // Defense's best value is shared by exactly two species today
    const defs = Object.values(pals).map((p) => (p as { def?: number }).def ?? 0);
    const best = Math.max(...defs);
    expect(defs.filter((v) => v === best).length).toBe(2);
    expect(code).toContain("pal{rank.tied === 1 ? '' : 's'} tied");
  });
});

describe('a card with nothing to show says so instead of vanishing', () => {
  for (const g of GATES) {
    describe(g.card, () => {
      it('the empty case is real, and is the exception rather than the rule', () => {
        // at zero the branch is dead code; as it climbs, "one of only N"
        // stops being a useful thing to say
        expect(g.missing.length).toBeGreaterThan(0);
        expect(g.missing.length).toBeLessThan(TOTAL / 10);
        // the known data contradictions, deliberately NOT "corrected"
        expect(g.missing).toEqual(g.expect);
      });

      it('renders the explanation instead of nothing at all', () => {
        expect(code, `the ${g.card} card vanishes again on `
          + `${g.missing.join(', ')}, with nothing saying why`)
          .toContain(`what="${g.what}"`);
      });
    });
  }

  it('all three explain the silence in the same words', () => {
    // one shared component, so the app cannot end up explaining the same
    // thing three different ways
    expect(code).toContain('function NothingListed(');
    expect((code.match(/<NothingListed/g) ?? []).length).toBe(GATES.length);
    expect(code).toContain('The game files we read list no {what} for {name}');
  });

  it('says it about our data, not about the game', () => {
    // we can prove what our extraction contains; we cannot prove the pal has
    // nothing. The sentence must not claim the stronger thing.
    expect(code).toContain('The game files we read');
    for (const overclaim of [
      'has no work suitabilities',
      'has no drops',
      'has no partner skill',
      'does not drop anything',
    ]) {
      expect(code, `"${overclaim}" claims a game fact we have not verified`)
        .not.toContain(overclaim);
    }
    expect(code).toContain('Rather than guess');
  });

  it('counts the affected pals from the data instead of typing the number', () => {
    // E114's lesson: a true sentence that depends on data can go false with no
    // code change. "one of only 2" must be read from the files, not typed.
    expect(code, 'a count is hard-coded — a data update makes the sentence lie')
      .toContain('function countWithout(');
    expect(code).toContain('Object.values(pals).filter((q) => !has(q)).length');
    expect(code).toMatch(/one of only \$\{others\} pals/);
    // and it handles its own singular, since two of the three are at one today
    expect(code).toContain('the only pal in the Paldex like that');
  });

  it('does not name the affected pals in the source', () => {
    // naming them would be the same staleness trap one level down
    for (const n of new Set(GATES.flatMap((g) => g.missing))) {
      expect(code, `${n} is named in the card's source`).not.toContain(`'${n}'`);
    }
  });
});
