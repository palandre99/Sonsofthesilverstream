/** Meta-list integrity gate — every community-consensus name must be a real
 * pal in the dataset. A typo here would ship a dead suggestion chip. */
import { describe, expect, it } from 'vitest';
import palsJson from '../../data/pals_1_0.json';
import { BEST_OVERALL, COMBAT_COMMUNITY, MOUNT_CALLOUTS } from '../src/data/meta';

const pals = (palsJson as { pals: Record<string, unknown> }).pals;

describe('meta lists', () => {
  it('BEST_OVERALL names all exist in the dataset', () => {
    for (const m of BEST_OVERALL) expect(pals[m.name], m.name).toBeDefined();
  });
  it('COMBAT_COMMUNITY names all exist in the dataset', () => {
    for (const n of COMBAT_COMMUNITY) expect(pals[n], n).toBeDefined();
  });
  it('MOUNT_CALLOUTS names all exist in the dataset', () => {
    for (const n of Object.keys(MOUNT_CALLOUTS)) expect(pals[n], n).toBeDefined();
  });
  it('every why-line is a real sentence, not a stub', () => {
    for (const m of BEST_OVERALL) expect(m.why.length).toBeGreaterThan(20);
  });
});
