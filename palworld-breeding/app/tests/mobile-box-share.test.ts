/**
 * The PHONE's share/import round trip — writer and reader together in
 * mobile/src/boxShare.ts, imported and exercised for real.
 *
 * Why this exists: the share writer predated the "caught it, couldn't check
 * the gender" mark and wrote `Name ♀` for a "?"-only pal — an INVENTED
 * female. Imported on another install, that pal counts as a parent the
 * player cannot supply, and the plan built on it is a lie (the exact
 * dangerous mutation E122 named). The JSON import branch likewise dropped
 * the mark and silently discarded species owned only through it — neither
 * "recognised" nor "not recognised", just gone.
 *
 * So the round trip is pinned for EVERY species in EVERY ownership state a
 * box entry can hold, not a hand-picked few — and the old three states must
 * read back exactly as before, because every list shared before today is
 * one of them.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { exportLine, parseImport, type Owned } from '../../mobile/src/boxShare';

const pals = (JSON.parse(
  readFileSync(join(__dirname, '../public/data/pals_1_0.json'), 'utf8'),
) as { pals: Record<string, unknown> }).pals;

const NAMES = Object.keys(pals);

/** every ownership state a box entry can hold (an all-false entry cannot
 * exist — the store deletes it) */
const STATES: Owned[] = [
  { m: true, f: true },
  { m: true, f: false },
  { m: false, f: true },
  { m: true, f: true, u: true },
  { m: true, f: false, u: true },
  { m: false, f: true, u: true },
  { m: false, f: false, u: true },
];

const norm = (g: Owned) => ({ m: g.m, f: g.f, u: !!g.u });

describe('the share line for a "?" pal', () => {
  it('NEVER invents a gender', () => {
    // the bug this file exists for: "caught, gender unchecked" went out as ♀
    expect(exportLine('Beakon', { m: false, f: false, u: true })).toBe('Beakon ?');
  });

  it('writes the three legacy states exactly as it always did', () => {
    expect(exportLine('Lamball', { m: true, f: true })).toBe('Lamball');
    expect(exportLine('Lamball', { m: true, f: false })).toBe('Lamball ♂');
    expect(exportLine('Lamball', { m: false, f: true })).toBe('Lamball ♀');
  });

  it('carries the mark next to known genders', () => {
    expect(exportLine('Lamball', { m: true, f: false, u: true })).toBe('Lamball ♂ ?');
    expect(exportLine('Lamball', { m: true, f: true, u: true })).toBe('Lamball ♂ ♀ ?');
  });
});

describe('a shared collection survives being imported again', () => {
  it('round-trips every species in every ownership state', () => {
    const lost: string[] = [];
    for (const name of NAMES) {
      for (const state of STATES) {
        const line = exportLine(name, state);
        const { entries, unknown } = parseImport(line, NAMES);
        if (unknown.length || entries.length !== 1) {
          lost.push(`${line} → unread`);
          continue;
        }
        const [gotName, gotG] = entries[0];
        if (gotName !== name
          || JSON.stringify(norm(gotG)) !== JSON.stringify(norm(state))) {
          lost.push(`${line} → ${gotName} ${JSON.stringify(gotG)}`);
        }
      }
    }
    expect(lost.slice(0, 10)).toEqual([]);
    expect(lost.length).toBe(0);
  });

  it('old suffix spellings still read: m, f, separators', () => {
    const { entries } = parseImport('Lamball · ♂\nCattiva, f\nChikipi m', NAMES);
    expect(Object.fromEntries(entries)).toEqual({
      Lamball: { m: true, f: false },
      Cattiva: { m: false, f: true },
      Chikipi: { m: true, f: false },
    });
  });

  it('duplicate lines merge, and the mark survives the merge', () => {
    const { entries } = parseImport('Lamball ♂\nLamball ?', NAMES);
    expect(entries).toEqual([['Lamball', { m: true, f: false, u: true }]]);
  });
});

describe('a JSON backup', () => {
  it('keeps the mark — the phone writes {m,f,u} and must read it back', () => {
    const json = JSON.stringify({
      box: {
        Lamball: { m: true, f: false, u: true },
        Beakon: { m: false, f: false, u: true },
      },
    });
    const { entries, unknown } = parseImport(json, NAMES);
    expect(unknown).toEqual([]);
    expect(Object.fromEntries(entries)).toEqual({
      Lamball: { m: true, f: false, u: true },
      Beakon: { m: false, f: false, u: true },
    });
  });

  it('counts a "?"-only species as recognised, not silently gone', () => {
    const { entries } = parseImport(
      JSON.stringify({ Beakon: { m: false, f: false, u: true } }), NAMES);
    expect(entries.length).toBe(1);
  });

  it('does not resurrect a pal recorded as false or null', () => {
    const json = JSON.stringify({
      box: { Lamball: { m: true, f: false }, Cattiva: false, Chikipi: null },
    });
    const { entries } = parseImport(json, NAMES);
    expect(entries.map(([n]) => n)).toEqual(['Lamball']);
  });
});
