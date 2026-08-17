/**
 * The Settings screen is where a world's name and level live, and it was the
 * last surface nobody had walked. Two counted labels, both wrong at ONE, and
 * one of them on a DESTRUCTIVE confirm — the same shape as the Paldex bug at
 * E106:
 *
 *     row:     "1 pals"
 *     confirm: Really delete "My world" — its 1 pals and its plan?
 *
 * And a third problem the count hid: the confirm promised "and its plan"
 * whether or not the world had one, so deleting a brand-new empty world read
 *
 *     Really delete "New world" — its 0 pals and its plan?
 *
 * — a confirm listing two things that do not exist. Its one job is to say what
 * disappears.
 *
 * `worldHolds` is now the single phrase used by BOTH the row and the confirm,
 * so the two can never drift apart.
 *
 * NOTE ON MY OWN RECORD: E108 declared the counted-label sweep "finished
 * app-wide". It was not — this file WAS in the scanner's input list, but its
 * output was cut off by a `head -50` and nobody ever read these two lines.
 * A truncated scan is not a clean scan.
 *
 * (The helper lives in a .tsx screen, which this suite cannot import — so the
 * branches are pinned in source, the same way `planner-copy` and `odds-copy`
 * pin theirs.)
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const raw = readFileSync(
  join(__dirname, '../../mobile/src/screens/SettingsScreens.tsx'), 'utf8');
const code = raw
  .replace(/\{\s*\/\*(?:(?!\*\/)[\s\S])*\*\/\s*\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('a world says what it actually holds', () => {
  it('has one phrase, shared by the row and the confirm', () => {
    expect(code).toContain('export function worldHolds(owned: number, planTotal: number)');
  });

  it('never says "1 pals"', () => {
    expect(code).toContain("if (owned === 1) bits.push('1 pal');");
    expect(code).toContain("else if (owned > 1) bits.push(`${owned} pals`);");
    expect(code, 'the row still counts to one').toContain("stats[p.id].owned === 1 ? '1 pal'");
  });

  it('mentions a plan only when there is one', () => {
    expect(code).toContain("if (planTotal > 0) bits.push('its plan');");
    expect(code, 'the old always-on plan clause is back')
      .not.toContain('pals and its plan`');
  });

  it('drops the clause entirely when a world holds nothing', () => {
    expect(code).toContain("if (!bits.length) return '';");
    // and the call site asks the bare question rather than "and ."
    expect(code).toContain('`Really delete "${managing.name}"?`');
    // a dash, not a second "and" — "delete X and 1 pal and its plan?" reads
    // like a list that lost its comma
    expect(code).toContain('`Really delete "${managing.name}" — ${holds}?`');
  });

  it('still says "empty" under a world with nothing in it', () => {
    expect(code).toContain("'empty'");
  });
});
