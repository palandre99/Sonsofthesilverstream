/** The sample collection offered on an empty Paldex.
 *
 * Twelve pals a player genuinely has in their first hour: every one is
 * wild-catchable and every one spawns at level 6 or below — read from
 * `palcalcFacts.g.ts` (`minWild`), not chosen by feel. Nothing here is a
 * gift the game would not have given them by then.
 *
 * It exists so the Planner is useful on the very first tap, before anyone
 * has ticked anything. Guarded by `app/tests/sample-box.test.ts`, which
 * re-checks the levels against the data and proves the set still breeds
 * into a large chunk of the dex. */
export const SAMPLE_BOX = [
  'Lamball', 'Cattiva', 'Chikipi', 'Lifmunk', 'Foxparks', 'Fuack',
  'Tanzee', 'Pengullet', 'Rooby', 'Vixy', 'Depresso', 'Gumoss',
] as const;
