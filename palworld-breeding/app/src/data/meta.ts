/** Community-consensus meta lists — the ONLY file in the app allowed to make
 * subjective "best" claims, and every claim carries its source.
 *
 * PROVENANCE (fetched 2026-08-15):
 *  - game8.co/games/Palworld/archives/440209 — editorial tier list
 *    (combat S/A, base SS/S, mount tiers)
 *  - pindrop.gg/palworld/tier-list — stat-composite rankings
 *    (overall S: Jetragon, Shaolong, Panthalus, Eidrolon Ignis, Eidrolon)
 *  - skycoach.gg tier list was reviewed and REJECTED as dated (recommends
 *    pre-1.0 meta like Lovander-as-best-fighter).
 *
 * Objective numbers (stats, work levels, partner effects, mounts) NEVER live
 * here — they come from the dump. This file is only the "what players rate
 * highest" layer, shown in the UI with a "community consensus" label.
 * Re-verify quarterly or on game patches. */

export interface MetaPick {
  name: string;
  /** one plain-language line, faithful to the sources */
  why: string;
}

/** Best in the game, all things considered — names appearing at the top of
 * BOTH sources where possible, game8-only picks marked by their why-line. */
export const BEST_OVERALL: MetaPick[] = [
  { name: 'Jetragon', why: 'The fastest thing in the sky — and still a monster in a fight.' },
  { name: 'Bellanoir Libero', why: 'Top-rated raid boss for endgame fights.' },
  { name: 'Knocklem Ignis', why: 'Rated the strongest all-round fighter of the 1.0 roster.' },
  { name: 'Eidrolon Ignis', why: 'Elite fighter with the best all-round stats in both rankings.' },
  { name: 'Blazamut Ryu', why: 'Devastating attacker among the raid legendaries.' },
  { name: 'Frostallion Noct', why: 'Legendary fighter with one of the best stat lines in the game.' },
  { name: 'Anubis', why: 'The classic: elite fighter AND an SS-tier worker.' },
  { name: 'Shaolong', why: 'Top-five overall in both rankings — speed, stats, utility.' },
  { name: 'Panthalus', why: 'Highest Attack + Defense total of any pal.' },
  { name: 'Xenolord', why: 'Long-distance flyer with endgame combat power.' },
  { name: 'Necromus', why: 'Elite ground mount that fights like a legendary — because it is one.' },
  { name: 'Orserk', why: 'Elite fighter and the game\'s best electricity worker.' },
];

/** Community favourite fighters (game8 combat S-tier, 2026-08). The app's
 * own "highest battle stats" list is computed from the dump — this is the
 * judgement layer on top. */
export const COMBAT_COMMUNITY: string[] = [
  'Knocklem Ignis', 'Eidrolon Ignis', 'Bellanoir Libero', 'Orserk',
  'Blazamut Ryu', 'Shaolong', 'Dandilord', 'Moldron', 'Bastigor',
  'Frostallion Noct', 'Anubis', 'Frostallion', 'Jormuntide Ignis',
  'Silvegis', 'Neptilius', 'Hartalis', 'Felbat',
];

/** Mount callouts BOTH the dump and the community agree on; speed claims are
 * community-measured (game8 + pindrop agree on Jetragon). */
export const MOUNT_CALLOUTS: Record<string, string> = {
  Jetragon: 'fastest in the sky',
  Xenolord: 'long-haul flyer — far more stamina',
  Necromus: 'top ground speed',
  Hartalis: 'elite ground mount',
  Paladius: 'elite ground mount',
  Neptilius: 'the best swimmer by far',
  Galeclaw: 'fastest glider',
};
