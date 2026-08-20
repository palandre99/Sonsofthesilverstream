/** Where a tower fight actually stands, joined to the map's own spots.
 *
 * The CEO asked for map location on boss cards. Alphas already have it
 * (their card renders the real spawn map); the TOWERS did not — a card
 * named the arena and stopped, which is a place-name, not a place.
 *
 * The map lane owns the tower spots, so this READS their data and edits
 * nothing of theirs. The join is by name and is deliberately STRICT,
 * because the two datasets are written by different hands: the boss
 * table says "Bjorn & Bastigor" while the map's own spot is spelled
 * "Bjorn & Bastagor Tower", and Auri & Shaolong's spot is named after
 * its covenant, not the pair. So three keys are tried, and a spot is
 * used ONLY when exactly one candidate matches:
 *
 *   1. "<pair> Tower"                    — Zoe & Grizzbolt Tower
 *   2. "<first name> & …"                — survives the Bastagor spelling
 *   3. the arena the boss table gives    — Rotmist Root, Azure Covenant
 *
 * 11 of the 13 tower-list fights resolve. The two that do not are the
 * ones the GAME itself refuses to place: Panthalus and Zenara &
 * Astralym both carry "？？？" as their arena, and their cards say so
 * rather than inventing a location. A test pins those numbers, so a
 * data refresh that breaks the join fails loudly instead of quietly
 * dropping every tower's location.
 */
import { poiName, poiPoints, whereFromLine } from '../map/layers';
import { regionOf, uvToReadout, type RegionId } from '../map/projection';
import { shortName } from '../logic/bossText';

export interface TowerSpot {
  /** the map's own name for the spot */
  name: string;
  region: RegionId;
  /** where it sits on the map texture, for the cropped preview */
  u: number;
  v: number;
  /** the game's own coordinate readout, as the map prints it */
  x: number;
  y: number;
  /** "160 m west of the Great Eagle statue", or null when it is close
   * enough to a statue that the distance says nothing */
  from: string | null;
}

const REGIONS: RegionId[] = ['palpagos', 'tree'];

/** The one tower spot for this fight, or null when the join is not
 * unambiguous — never a guess. */
export function towerSpot(title: string, arena: string | null): TowerSpot | null {
  const pair = shortName(title);
  const first = pair.includes(' & ') ? pair.split(' & ')[0] : null;
  const cleanArena = arena && !arena.includes('？') ? arena : null;

  const hits: { name: string; region: RegionId; u: number; v: number }[] = [];
  for (const region of REGIONS) {
    const set = poiPoints('syndicate_tower', region);
    if (!set) continue;
    for (let i = 0; i < set.n; i++) {
      const name = poiName('syndicate_tower', region, i);
      const matches = name === `${pair} Tower`
        || (first != null && name.startsWith(`${first} & `))
        || (cleanArena != null
          && (name === cleanArena || name === `${cleanArena} Tower`));
      if (matches) {
        hits.push({ name, region, u: set.xy[i * 2], v: set.xy[i * 2 + 1] });
      }
    }
  }
  if (hits.length !== 1) return null;

  const hit = hits[0];
  const { x, y } = uvToReadout({ u: hit.u, v: hit.v }, regionOf(hit.region));
  return {
    name: hit.name,
    region: hit.region,
    u: hit.u,
    v: hit.v,
    x: Math.round(x),
    y: Math.round(y),
    from: whereFromLine(hit.u, hit.v, hit.region),
  };
}
