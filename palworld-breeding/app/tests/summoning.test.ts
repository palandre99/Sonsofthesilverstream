/**
 * The raid cards' summoning chain. It reads the Items lane's datamined
 * facts (recipe + where the pieces turn up) read-only, so these pins are
 * as much a cross-lane contract as a unit test: if their file changes
 * shape or loses the raid slabs, this fails here rather than leaving the
 * raid cards quietly saying nothing.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RAID_BOSSES } from '../src/data/towerRaid.g';
import {
  summoningChain, summoningWords, type ItemFact,
} from '../../mobile/src/bosses/summoning';

const facts = (JSON.parse(readFileSync(
  join(__dirname, '../../data/item_facts_1_0.json'), 'utf8'),
) as { facts: Record<string, ItemFact> }).facts;
const items = (JSON.parse(readFileSync(
  join(__dirname, '../public/data/items_1_0.json'), 'utf8'),
) as { items: Record<string, { name: string }> }).items;
const nameOf = (id: string) => items[id]?.name ?? null;

describe('how you get the slab', () => {
  it('every raid slab is at least NAMED — all 11', () => {
    for (const r of RAID_BOSSES) {
      expect(summoningChain(r.slab!, facts, nameOf), r.title).not.toBeNull();
    }
  });

  it('10 of the 11 carry a build recipe, and the one that does not is named', () => {
    const without = RAID_BOSSES
      .filter((r) => !summoningChain(r.slab!, facts, nameOf)!.partCount)
      .map((r) => r.title);
    // the crossover's top difficulty has no recipe row upstream; its card
    // says only what is known rather than inventing a chain
    expect(without).toEqual(['[Master] Moon Lord']);
  });

  it('the canary: Bellanoir needs 4 fragments, and says where they turn up', () => {
    const chain = summoningChain('PalSummon_NightLady', facts, nameOf)!;
    expect(chain.slabName).toBe("Bellanoir's Slab");
    expect(chain.partCount).toBe(4);
    expect(chain.partName).toBe("Bellanoir's Slab Fragment");
    expect(chain.sources.length).toBe(11);
    expect(summoningWords(chain))
      .toBe("Its slab is built from 4 × Bellanoir's Slab Fragment. Those turn "
        + 'up in Expedition: Forest, Expedition: Grass (Hard), Arrogant Pal '
        + 'Critic Kitsun, and 8 more places.');
  });

  it('the crossover keeps its own odd chain instead of being forced into fragments', () => {
    // Moon Lord's Celestial Sigil is 100 ingots, not 4 fragments
    const chain = summoningChain('PalSummon_YakushimaBoss002', facts, nameOf)!;
    expect(chain.partCount).toBe(100);
    expect(chain.slabName).toBe('Celestial Sigil');
  });

  it('says the recipe alone when no source is recorded, never an empty phrase', () => {
    const chain = summoningChain('PalSummon_NightLady_Dark_2', facts, nameOf)!;
    expect(chain.sources).toEqual([]);
    expect(summoningWords(chain)).toMatch(/^Its slab is built from 4 × .*\.$/);
  });

  it('returns nothing at all for an item it cannot name', () => {
    expect(summoningChain('NoSuchItem', facts, nameOf)).toBeNull();
  });
});
