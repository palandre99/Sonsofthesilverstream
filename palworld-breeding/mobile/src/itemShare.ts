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
  implantPassive, ITEM_STATS, ITEMS, kindWord, palsDropping, statRank,
  tierWord,
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

export function shareTextForItem(id: string, gameVersion: string): string {
  const it = ITEMS[id];
  const st = ITEM_STATS[id];
  const facts = ITEM_FACTS[id];
  const word = st?.tier ?? tierWord(it.rarity);
  const lines: string[] = [`${it.name} — ${word} ${kindWord(id).toLowerCase()}`];
  const statBits: string[] = [];
  if (st?.atk != null) {
    const r = statRank(id, 'atk');
    statBits.push(`Attack ${st.atk}${r ? ` (#${r.rank} of ${r.of})` : ''}`);
  }
  if (st?.def != null) {
    const r = statRank(id, 'def');
    statBits.push(`Defense ${st.def}${r ? ` (#${r.rank} of ${r.of})` : ''}`);
  }
  if (st?.durability != null) statBits.push(`durability ${st.durability}`);
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
  if (facts?.tech) lines.push(techSentence(facts.tech));
  if (facts?.recipe) {
    lines.push('Craft: ' + facts.recipe
      .map((r) => `${r.n}× ${ITEMS[r.id]?.name ?? r.id}`).join(' · '));
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
