/**
 * The Bosses fane's wording rules. These lived inside the phone's screens
 * where nothing could test them; they are pure rules over datamined rows,
 * so they now live in src/logic (parity-gated) and are pinned here.
 */
import { describe, expect, it } from 'vitest';
import {
  effectWords, fmtHp, groupDrops, levelFit, listWords, matchupSummary, shortName,
} from '../src/logic/bossText';
import { RAID_BOSSES, TOWER_BOSSES } from '../src/data/towerRaid.g';

describe('the name a player says', () => {
  it('keeps the two paired names and drops the ceremonial title', () => {
    expect(shortName('Rayne Syndicate Boss Zoe & Grizzbolt')).toBe('Zoe & Grizzbolt');
    expect(shortName('High Keeper of the Azure Covenant Auri & Shaolong'))
      .toBe('Auri & Shaolong');
  });

  it('leaves an unpaired title alone rather than mangling it', () => {
    expect(shortName('Legendary Ocean King Panthalus'))
      .toBe('Legendary Ocean King Panthalus');
  });

  it('never returns something longer than the title it was given', () => {
    for (const b of [...TOWER_BOSSES, ...RAID_BOSSES]) {
      expect(shortName(b.title).length).toBeLessThanOrEqual(b.title.length);
    }
  });
});

describe('how ready you are, in a player’s words', () => {
  it('says plainly when you are past it, close to it, or far below', () => {
    expect(levelFit(50, 40).tone).toBe('ok');
    expect(levelFit(38, 40).tone).toBe('warn');
    expect(levelFit(12, 40).tone).toBe('bad');
  });

  it('asks for the level instead of guessing when the profile has none', () => {
    const f = levelFit(undefined, 40);
    expect(f.tone).toBe('plain');
    expect(f.text).toContain('save profile');
  });

  it('treats the exact level as ready, not as “close”', () => {
    expect(levelFit(40, 40).tone).toBe('ok');
  });
});

describe('attack effects', () => {
  it('keeps the effect word and drops the internal buildup number', () => {
    expect(effectWords('Electrify 100')).toBe('Electrify');
    expect(effectWords('Blind 65')).toBe('Blind');
  });

  it('says nothing when there is nothing to say', () => {
    expect(effectWords(null)).toBeNull();
    expect(effectWords('120')).toBeNull();
  });
});

describe('the drop table as a player reads it', () => {
  it('turns 100% into “always” and keeps real odds as numbers', () => {
    const lines = groupDrops([
      { item: 'Key Sphere of Envy', qty: '1', pct: 100 },
      { item: 'Speed Lotus (L)', qty: '1', pct: 20 },
    ]);
    expect(lines[0]).toEqual({ item: 'Key Sphere of Envy', amount: 'always', twice: false });
    expect(lines[1].amount).toBe('20% of the time');
  });

  it('sorts the likeliest first', () => {
    const lines = groupDrops([
      { item: 'Rare', qty: '1', pct: 10 },
      { item: 'Sure', qty: '1', pct: 100 },
    ]);
    expect(lines.map((l) => l.item)).toEqual(['Sure', 'Rare']);
  });

  it('keeps a quantity range in the game’s own words', () => {
    expect(groupDrops([{ item: 'Relic', qty: '1-10', pct: 100 }])[0].amount)
      .toBe('1-10 always');
  });

  it('collapses an identical repeated row but SAYS it was listed twice', () => {
    const lines = groupDrops([
      { item: 'Petal', qty: '1', pct: 100 },
      { item: 'Petal', qty: '1', pct: 100 },
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0].twice).toBe(true);
  });

  it('shows BOTH rows when the game lists the same item at different odds', () => {
    // Bellanoir's egg is listed at 10% and again at 90% — real, verified
    // on the source page, so neither row is thrown away
    const lines = groupDrops([
      { item: 'Huge Dark Egg', qty: '1', pct: 10 },
      { item: 'Huge Dark Egg', qty: '1', pct: 90 },
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0].amount).toBe('10% of the time, or 90% of the time');
    expect(lines[0].twice).toBe(false);
  });

  it('shows both amounts when the same item drops in different quantities', () => {
    // Dandilord's World Tree Holy Water: 20-30 and 60-80, both at 100%
    const lines = groupDrops([
      { item: 'World Tree Holy Water', qty: '20-30', pct: 100 },
      { item: 'World Tree Holy Water', qty: '60-80', pct: 100 },
    ]);
    expect(lines[0].amount).toBe('20-30 always, or 60-80 always');
  });

  it('every shipped drop row survives grouping — nothing is silently lost', () => {
    for (const b of [...TOWER_BOSSES, ...RAID_BOSSES]) {
      const items = new Set(b.drops.map((d) => d.item));
      expect(new Set(groupDrops(b.drops).map((l) => l.item))).toEqual(items);
    }
  });
});

describe('what a pal card says its element means', () => {
  it('names what it beats and what beats it', () => {
    expect(matchupSummary(['Fire'])).toEqual({
      strongAgainst: ['Grass', 'Ice'], weakTo: ['Water'],
    });
  });

  it('a dual pal keeps both halves of its offense', () => {
    expect(matchupSummary(['Fire', 'Water'])!.strongAgainst)
      .toEqual(['Fire', 'Grass', 'Ice']);
  });

  it('an element pairing that CANCELS a threat does not list it', () => {
    // Reptyro is Fire/Ground: Grass doubles the Ground half and is halved
    // by the Fire half, so it lands even — it is not a weakness
    expect(matchupSummary(['Fire', 'Ground'])!.weakTo).not.toContain('Grass');
    expect(matchupSummary(['Fire', 'Ground'])!.weakTo).toEqual(['Water']);
  });

  it('says nothing at all for a pal with no element', () => {
    expect(matchupSummary([])).toBeNull();
  });

  it('Neutral pals beat nothing and fear only Dark', () => {
    expect(matchupSummary(['Neutral'])).toEqual({
      strongAgainst: [], weakTo: ['Dark'],
    });
  });
});

describe('lists read like a person wrote them', () => {
  it('joins two with “and”, three or more with commas', () => {
    expect(listWords(['Fire'])).toBe('Fire');
    expect(listWords(['Fire', 'Water'])).toBe('Fire and Water');
    expect(listWords(['Electric', 'Grass', 'Ice']))
      .toBe('Electric, Grass and Ice');
  });

  it('says nothing for an empty list', () => {
    expect(listWords([])).toBe('');
  });
});
