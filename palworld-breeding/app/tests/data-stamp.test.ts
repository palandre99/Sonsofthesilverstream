/**
 * Criterion #1 of the CEO's own 15-point bar: the build stamp AND the proof,
 * one tap from any data screen — "Nobody combines stamp + proof; that
 * combination is ours."
 *
 * E100 built the stamp and put it on four screens. E111 found the fifth: the
 * PAL CARD, which is the densest datamined surface in the whole app — stats,
 * rank, work levels, drops, spawn levels, passives — had no provenance at all,
 * and because it is a modal there was no way to reach the proof from it
 * without closing it first. I had recorded #1 as CLOSED. It was not.
 *
 * The stamp also shipped with NO test, which is how a claim that specific
 * survives a refactor as a lie. This guards all five surfaces, the fact that
 * the date is read from the data rather than typed, and the modal's close.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import breedingJson from '../../data/breeding_1_0.json';

const M = join(__dirname, '../../mobile/src');
const read = (p: string) => readFileSync(join(M, p), 'utf8')
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const kit = read('ui/kit.tsx');
const card = read('ui/PalDetail.tsx');

describe('every screen that prints datamined numbers says where they came from', () => {
  it('the stamp reads the build and date FROM THE DATA, never typed in', () => {
    expect(kit).toContain('breeding.game_version');
    expect(kit).toContain('stampDate(breeding.extracted)');
    // and the data really carries them, so the stamp cannot render blank
    const b = breedingJson as unknown as { game_version?: string; extracted?: string };
    expect(b.game_version, 'breeding data has no game_version').toBeTruthy();
    expect(b.extracted, 'breeding data has no extracted date').toBeTruthy();
    expect(new Date(b.extracted!).getTime()).not.toBeNaN();
  });

  it('all five data surfaces carry it', () => {
    // three go through PageHead's `stamp` prop…
    for (const screen of ['CalculatorScreen', 'OddsScreen', 'PlannerScreen']) {
      expect(read(`screens/${screen}.tsx`), `${screen} lost its data stamp`)
        .toMatch(/\n\s*stamp \/>/);
    }
    // …and two render it by hand, having their own headers
    expect(read('screens/PaldexScreen.tsx'), 'the Paldex lost its data stamp')
      .toContain('<DataStamp />');
    expect(card, 'the PAL CARD lost its data stamp — the densest data surface '
      + 'in the app').toContain('<DataStamp beforeNavigate={onClose} />');
  });

  it('tapping it reaches the proof, and closes the card on the way', () => {
    expect(kit).toContain("navigateTo({ domain: 'breeding', tab: 'ref' })");
    // the card is a Modal: navigating underneath it would leave the card
    // sitting on top of the answer
    expect(kit).toContain('beforeNavigate?.();');
    expect(card).toContain('beforeNavigate={onClose}');
  });

  it('says both halves — the build AND where to check it', () => {
    expect(kit).toContain('read from the game files');
    expect(kit).toContain('where these come from');
  });
});
