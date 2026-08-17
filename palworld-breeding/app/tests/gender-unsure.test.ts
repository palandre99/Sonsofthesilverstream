/**
 * "Caught it, but I couldn't tell the gender."
 *
 * CEO, 2026-08-17: *"Sometimes when I'm out catching one pal I can't see if
 * it's male or female, cool if paldex adds a tick option for not sure of
 * gender? And it's easily filterable so I can identify later when back at
 * base?"*
 *
 * Stored as a third flag on the box entry (`{m, f, u}`) rather than a separate
 * list, so it persists, exports and follows profile switching with everything
 * else, and every save written before today keeps working — `u` is optional
 * and `undefined` is falsy.
 *
 * THE RULE THAT MATTERS, and the reason this file exists: a "?" pal counts as
 * CAUGHT but never as a KNOWN GENDER. Breeding needs a specific male and a
 * specific female; if `hasGender` ever answered true for an unresolved pal,
 * the planner would build a route around a parent he cannot supply, and the
 * plan would be a lie. `ownedAny` says yes, `hasGender` says no.
 *
 * CORRECTED THE SAME DAY, from his phone: the first version treated "?" and a
 * known gender as mutually exclusive and WIPED his male tick when he marked a
 * new catch — "that does not mean u should untick my already selected tick".
 * Owning a known male AND an unidentified second catch is the normal case.
 * The mark now coexists with known genders; ticking a gender ON still clears
 * it (the question is answered), un-ticking never does.
 *
 * `mobile/src/store.ts` reaches AsyncStorage and cannot be imported here, so
 * these are precise source assertions. Comments are stripped.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (f: string) => readFileSync(join(__dirname, '../../mobile/src', f), 'utf8')
  .replace(/\{\s*\/\*(?:(?!\*\/)[\s\S])*\*\/\s*\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const store = read('store.ts');
const kit = read('ui/kit.tsx');
const filters = read('ui/palFilters.tsx');
const sheet = read('ui/FilterSheet.tsx');
const paldex = read('screens/PaldexScreen.tsx');

describe('a pal you caught but could not identify', () => {
  it('is recorded on the box entry, not somewhere separate', () => {
    expect(store).toContain('export interface OwnedGenders { m: boolean; f: boolean; u?: boolean }');
    expect(store, 'u must stay OPTIONAL or every save written before today breaks')
      .toContain('u?: boolean');
  });

  it('counts as caught', () => {
    expect(store).toContain('state.box[n]?.m || state.box[n]?.f || state.box[n]?.u');
  });

  it('NEVER counts as a known male or female', () => {
    // the load-bearing rule: hasGender reads the specific flag and nothing
    // else, so an unresolved pal can never be planned as a parent
    expect(store).toContain("export const hasGender = (n: string, g: 'm' | 'f') => !!state.box[n]?.[g];");
    expect(store, 'hasGender must not consult the unsure flag')
      .not.toMatch(/hasGender[\s\S]{0,120}\?\.u/);
  });

  it('is not counted as a breeding-ready pair', () => {
    expect(store).toContain('(o) => o.m && o.f');
  });
});

describe('answering the question clears it', () => {
  it('TICKING a gender on resolves the mark; un-ticking never does', () => {
    // un-ticking a gender says nothing about the unidentified catch — the
    // first version cleared the mark on any tap
    expect(store)
      .toContain('const entry = val ? { ...cur, [g]: true, u: false } : { ...cur, [g]: false };');
  });

  it('marking unsure KEEPS the genders already recorded', () => {
    // his exact bug report: ticking "?" wiped the male he already had
    expect(store, '"?" wipes known genders again — the CEO\'s 18:13 bug')
      .toContain('const entry = { ...cur, u: val };');
    expect(store).not.toContain('val ? { m: false, f: false, u: true }');
  });

  it('an entry with nothing left is removed from the box', () => {
    expect(store).toContain('if (!entry.m && !entry.f && !entry.u) delete next[name];');
  });

  it('the mark survives an import merge', () => {
    // a merge cannot answer whether the unidentified pal was checked
    expect(store).toContain('u: !!(cur.u || g.u)');
    expect(store, 'import force-clears the mark again')
      .not.toContain('merged.u = false');
  });
});

describe('you can find them again at base', () => {
  it('the filter exists and uses the real predicate', () => {
    expect(filters).toContain("| 'unsure'");
    expect(filters).toContain("case 'unsure': return out.filter(genderUnsure);");
    expect(store).toContain('export const genderUnsure =');
    // the flag alone decides — a species with a known male can STILL have an
    // unidentified second catch waiting
    expect(store).toContain('export const genderUnsure = (n: string) => !!state.box[n]?.u;');
  });

  it('the filter is offered in the sheet, and labelled', () => {
    expect(sheet).toContain('label="Gender to check"');
    expect(paldex).toContain("unsure: 'Gender to check'");
  });

  it('the Paldex says how many are waiting, and one tap shows them', () => {
    // a mark nobody can find again is just a mark
    expect(paldex).toContain('unsureCount()');
    expect(paldex).toContain("own: 'unsure'");
    expect(paldex, 'the count would read "1 pals"')
      .toContain("'1 pal to check the gender of — show it'");
  });
});

describe('the header survives a real phone', () => {
  it('the nudge is NOT inside the title row', () => {
    // on his phone the nudge's long label out-muscled the flex-1 stats text
    // in the shared row — "131 owned" wrapped one character per line and the
    // header ate half the screen (screenshot, 2026-08-17 18:13)
    const row = paldex.slice(
      paldex.indexOf("alignItems: 'baseline'"),
      paldex.indexOf('</View>', paldex.indexOf("alignItems: 'baseline'")));
    expect(row, 'the gender nudge is back inside the title row')
      .not.toContain('toCheck');
    // and its label is clamped so it can never wrap into a column
    expect(paldex, 'the nudge label can wrap again').toContain('numberOfLines={1}');
  });
});

describe('the control itself', () => {
  it('sits with the gender boxes and says what it means', () => {
    expect(kit).toContain('setGenderUnsure(name, !unsure)');
    expect(kit).toContain('caught, gender not checked yet');
    expect(kit, 'the toggle must report its state to a screen reader')
      .toMatch(/accessibilityState=\{\{ checked: unsure \}\}/);
  });
});
