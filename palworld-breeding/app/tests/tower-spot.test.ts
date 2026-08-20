/**
 * The tower cards' map locations. The boss table and the map's own spots
 * are written by different hands ("Bjorn & Bastigor" vs the map's
 * "Bjorn & Bastagor Tower"), so the join is strict and its COVERAGE is
 * pinned here: if a data refresh breaks it, this fails loudly instead of
 * every tower quietly losing its location.
 *
 * Runs against the mobile module because the map data lives there; the
 * join itself is pure.
 */
import { describe, expect, it } from 'vitest';
import { TOWER_BOSSES } from '../src/data/towerRaid.g';
import { towerSpot } from '../../mobile/src/bosses/whereTower';

const uniqueFights = TOWER_BOSSES.filter((b) => !b.bp.endsWith('_2'));

describe('where a tower stands', () => {
  it('11 of the 13 tower-list fights resolve to exactly one map spot', () => {
    const found = uniqueFights.filter((b) => towerSpot(b.title, b.arena) !== null);
    expect(uniqueFights.length).toBe(13);
    expect(found.length).toBe(11);
  });

  it('the two that do not resolve are the ones the GAME refuses to place', () => {
    const missing = uniqueFights
      .filter((b) => towerSpot(b.title, b.arena) === null)
      .map((b) => b.title);
    expect(missing.sort()).toEqual([
      'Legendary Ocean King Panthalus',
      'Nullstar Calamity Zenara & Astralym',
    ]);
    // ...and both carry the game's own "hidden" arena marker
    for (const b of uniqueFights) {
      if (towerSpot(b.title, b.arena) === null) {
        expect(b.arena).toContain('？');
      }
    }
  });

  it('the canary: Zoe & Grizzbolt lands on its own named tower with a real readout', () => {
    const spot = towerSpot('Rayne Syndicate Boss Zoe & Grizzbolt', 'Rayne Syndicate Tower')!;
    expect(spot.name).toBe('Zoe & Grizzbolt Tower');
    expect(spot.region).toBe('palpagos');
    expect(Number.isFinite(spot.x) && Number.isFinite(spot.y)).toBe(true);
  });

  it('survives the map data’s own spelling of Bastigor', () => {
    const spot = towerSpot('Jarl of Feybreak Bjorn & Bastigor', 'Feybreak Tower')!;
    expect(spot.name).toBe('Bjorn & Bastagor Tower');
  });

  it('joins the three story fights by their arena, not their name', () => {
    expect(towerSpot('Bewitching Lurker Dandilord', 'Rotmist Root')!.name)
      .toBe('Rotmist Root Tower');
    expect(towerSpot('Immortal Shade Silvance', 'Shinespore Root')!.name)
      .toBe('Shinespore Root Tower');
    expect(towerSpot('Highly Modified Grizzbolt', 'Forbidden Laboratory')!.name)
      .toBe('Forbidden Laboratory Tower');
  });

  it('never places a summoned raid — they have no arena at all', () => {
    expect(towerSpot('Eclipsed Siren Bellanoir', null)).toBeNull();
    expect(towerSpot('Moon Lord', null)).toBeNull();
  });
});
