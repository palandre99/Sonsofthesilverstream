/**
 * AAA criterion #15 asks for a share sheet on every pal / plan / RESULT.
 * Before this, `Share.share` appeared exactly ONCE in the whole tree — the
 * Paldex's "Share my list…" — so the two things players actually pass around
 * (a pairing result, a whole route) could only leave the app as a screenshot.
 *
 * Two properties make the shared text worth sending, and neither is visible
 * from reading the buttons:
 *
 *   1. IT SAYS THE SAME THING THE SCREEN SAYS. The result explanation is now
 *      ONE function, `resultSentence`, rendered by the card AND sent by the
 *      share. If they were written twice they would drift, and a friend would
 *      be reading a sentence the app never showed anybody.
 *   2. THE PROVENANCE TRAVELS WITH IT. A number pasted into Discord with no
 *      source is exactly what this app exists to replace, so every payload
 *      ends with the build it came from.
 *
 * Verified on the render by intercepting `navigator.share` rather than opening
 * the OS sheet: the pairing payload read "Lamball + Cattiva = Daedream …
 * Palworld 1.0 · read from the game files · Palforge", and the route payload
 * came out 80 lines with 8 goals, 35 numbered steps and 20 phases.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const M = join(__dirname, '../../mobile/src');
const read = (p: string) => readFileSync(join(M, p), 'utf8')
  .replace(/\{\s*\/\*(?:(?!\*\/)[\s\S])*\*\/\s*\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const calc = read('screens/CalculatorScreen.tsx');
const plan = read('screens/PlannerScreen.tsx');
const paldex = read('screens/PaldexScreen.tsx');

describe('the three things worth sharing can be shared', () => {
  it('a pairing result', () => {
    expect(calc).toContain('label="Share this result"');
    expect(calc).toContain('shareTextForPair(a, b, ch, ra, rb, target)');
  });

  it('a whole route', () => {
    expect(plan).toContain('label="Share this route"');
    expect(plan).toContain('shareTextForPlan(plan.targets, plan.steps, breeding.game_version)');
  });

  it('and the collection, which already could', () => {
    expect(paldex).toContain('Share my list…');
  });
});

describe('the shared text cannot drift from the screen', () => {
  it('one sentence function feeds both the card and the share', () => {
    expect(calc).toContain('function resultSentence(');
    // rendered by the card…
    expect(calc.match(/\{resultSentence\(ch, ra, rb, target\)\}/g)?.length,
      'the card stopped using the shared sentence').toBe(2);
    // …and sent by the share
    expect(calc).toMatch(/resultSentence\(ch, ra, rb, target\),/);
  });

  it('every branch of a result has a sentence — no silent blank', () => {
    for (const kind of ['unique', 'self', 'gendered']) {
      expect(calc, `the ${kind} branch lost its sentence`)
        .toContain(`ch.kind === '${kind}'`);
    }
    expect(calc).toContain('The game files give this pair a fixed recipe');
    expect(calc).toContain('Two of the same species always make that species');
    expect(calc).toContain('Every pal has a hidden breeding number');
  });
});

describe('what leaves the app carries where it came from', () => {
  it('both payloads end with the build stamp', () => {
    // the product is Paldexia since 2026-08-18 (commit 966e063 renamed the
    // payloads; this pin lagged one commit behind)
    const stamp = 'read from the game files · Paldexia`';
    expect(calc, 'the pairing payload lost its provenance line').toContain(stamp);
    expect(plan, 'the route payload lost its provenance line').toContain(stamp);
    // read from the data, never typed
    expect(calc).toContain('breeding.game_version');
    expect(plan).toContain('breeding.game_version');
  });

  it('the route says how big it is, and counts properly at one', () => {
    expect(plan).toContain("targets.length === 1 ? '1 goal'");
    expect(plan).toContain("steps.length === 1");
  });
});
