/** What the share sheet sends for one item — the card's facts as clean
 * text, never more than the screen shows, provenance travelling with it
 * (the calc's rule: a number pasted into Discord with no source is what
 * this app exists to replace).
 *
 * Pure and importable: the test asserts the REAL output, not source
 * strings. The game version is a parameter because the store pulls
 * react-native; the screen passes breeding.game_version.
 */
import {
  buildTime, buildTotals, implantPassive, ITEM_STATS, ITEMS, kindPhrase,
  palsDropping, recipeOf, spokenCraftTime, spokenTime, familyOf,
  palsHatchingFrom, rawMaterialsFor, statRank, tierWord,
} from './itemsData';
import { equipPassiveName, ITEM_FACTS } from './itemFacts';

export function techSentence(
  t: { level: number; cost?: number; ancient?: boolean },
): string {
  const pts = t.cost == null ? null
    : `${t.cost} ${t.ancient ? 'ancient ' : ''}technology point${t.cost === 1 ? '' : 's'}`;
  if (t.ancient && pts) return `Ancient Technology — unlocks at level ${t.level} for ${pts}`;
  if (pts) return `Unlocks at level ${t.level} for ${pts}`;
  return `Unlocks at technology level ${t.level}`;
}

/** The build list as something you can paste to the people you play
 * with (IL44) — the single most shareable thing this fane makes, since
 * "here is exactly what we need to farm" is a message a player actually
 * sends. Same shape as every other share here: what it is, the numbers,
 * then where the numbers came from.
 *
 * Totals are DERIVED at share time from the shipped recipes, so a
 * pasted list can never quote a figure the app no longer believes. */
export function shareTextForBuild(
  list: Record<string, number>, gameVersion: string,
): string {
  const ids = Object.keys(list).filter((i) => ITEMS[i] && list[i] > 0);
  if (!ids.length) return '';
  const totals = buildTotals(list);
  const things = ids.reduce((a, i) => a + list[i], 0);
  const lines: string[] = [
    `My Palworld build — ${things} thing${things === 1 ? '' : 's'}`,
    '',
    // ...and name the tier, the same way the panel does — the gather
    // list below belongs to one tier and nothing else said which
    ...ids.map((i) => `  ${list[i]}× ${ITEMS[i].name}`
      + (familyOf(i).length > 1
        ? ` (${ITEM_STATS[i]?.tier ?? tierWord(ITEMS[i].rarity)})` : '')),
    '',
    'Everything you need from scratch:',
    ...totals.gather.map((r) => `  ${r.n}× ${ITEMS[r.id].name}`),
  ];
  if (totals.steps.length) {
    lines.push('', 'Crafted along the way, in this order:',
      '  ' + totals.steps.map((r) => `${r.n}× ${ITEMS[r.id].name}`).join(' · '));
  }
  // IL30's standing lesson, applied the same tick the panel gained it:
  // "how long is this?" is exactly what you tell the people you play
  // with, and it travels with the same honesty the panel shows.
  // The out-of-reach LEVEL warning deliberately does NOT travel — it is
  // personal state ("you are level 40"), not a fact about the shopping
  // list, and it would be nonsense in someone else's hands.
  const time = buildTime(list);
  if (time.counted > 0 || time.unknown > 0) {
    lines.push('', (time.counted > 0
      ? `About ${spokenTime(time.seconds)} of crafting at Handiwork Lv. 1`
      : 'No craft time is recorded for any of these')
      + (time.unknown > 0
        ? `${time.counted > 0 ? ', plus ' : ' — '}${time.unknown} `
          + `${time.unknown === 1 ? 'thing' : 'things'} with no time recorded`
        : ''));
  }
  lines.push('', `Palworld ${gameVersion} · read from the game files · Paldexia`);
  return lines.join('\n');
}

export function shareTextForItem(id: string, gameVersion: string): string {
  const it = ITEMS[id];
  const st = ITEM_STATS[id];
  const facts = ITEM_FACTS[id];
  const word = st?.tier ?? tierWord(it.rarity);
  const lines: string[] = [`${it.name} — ${word} ${kindPhrase(id)}`];
  const statBits: string[] = [];
  if (st?.atk != null) {
    const r = statRank(id, 'atk');
    statBits.push(`Attack ${st.atk}${r ? ` (#${r.rank} of ${r.of})` : ''}`);
  }
  if (st?.def != null) {
    const r = statRank(id, 'def');
    statBits.push(`Defense ${st.def}${r ? ` (#${r.rank} of ${r.of})` : ''}`);
  }
  if (st?.durability != null) statBits.push(`Durability ${st.durability}`);
  if (st?.magazine != null) {
    statBits.push(`${st.magazine} round${st.magazine === 1 ? '' : 's'}`);
  }
  if (facts?.capture != null) statBits.push(`Capture Power ${facts.capture}`);
  for (const p of st?.passives ?? []) statBits.push(equipPassiveName(p));
  if (statBits.length) lines.push(statBits.join(' · '));
  const imp = implantPassive(id);
  if (imp) lines.push(`Gives the passive ${imp.name} — ${imp.effects}`);
  for (const g of facts?.grants ?? []) lines.push(g);
  for (const [k, v] of facts?.effects ?? []) lines.push(`${k} ${v}`);
  // an egg shared without its hatch list is useless (IL30 drift fix)
  const hatchers = palsHatchingFrom(id);
  if (hatchers.length) {
    lines.push(`Hatches: ${hatchers.slice(0, 6).join(', ')}`
      + (hatchers.length > 6 ? ` +${hatchers.length - 6} more` : ''));
  }
  if (facts?.tech) lines.push(techSentence(facts.tech));
  if (facts?.craftWork != null) {
    lines.push(`${facts.craftWork.toLocaleString()} work`
      + (facts.craftTime ? ` — about ${spokenCraftTime(facts.craftTime)} at Handiwork Lv. 1` : ''));
  }
  // IL78: this printed the FAMILY BASE's recipe while the shopping list
  // two lines down was this tier's — so a shared Legendary Advanced Bow
  // read "Craft: 40× Plasteel" above "From scratch: 400× Ore", two
  // numbers that cannot both be true. One resolver for both.
  const recipe = recipeOf(id);
  if (recipe) {
    lines.push('Craft: ' + recipe
      .map((r) => `${r.n}× ${ITEMS[r.id]?.name ?? r.id}`).join(' · '));
    // the recipe alone under-sells the cost when its ingredients are
    // themselves crafted — send the real shopping list too (IL32)
    const roll = rawMaterialsFor(id);
    if (roll.steps.length) {
      lines.push('From scratch: ' + roll.gather
        .map((r) => `${r.n}× ${ITEMS[r.id].name}`).join(' · '));
    }
  }
  const sources: string[] = [];
  const pals = palsDropping(id);
  if (pals.length) {
    sources.push(`drops from ${pals.slice(0, 3).join(', ')}`
      + (pals.length > 3 ? ` +${pals.length - 3} more` : ''));
  }
  if (facts?.boxes?.[0]) {
    sources.push(`${facts.boxes[0].src} (${facts.boxes[0].p})`);
  }
  if (sources.length) lines.push('Found: ' + sources.join('; '));
  lines.push('', `Palworld ${gameVersion} · read from the game files · Paldexia`);
  return lines.join('\n');
}
