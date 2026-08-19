/** Shared wording for the Bosses fane — one place, so the list and the
 * card can never disagree about what a fight is called. */
import type { BossEncounter } from '../data/towerRaid.g';

/** The name a player uses: "Zoe & Grizzbolt", not the full ceremonial
 * title. Every paired boss in the data is "<one word> & <one word>" at
 * the title's tail — kept STRICT on purpose: a looser match swallowed
 * the title word before the name ("Boss Zoe & Grizzbolt", seen on the
 * first render), and an unmatched future name falls back to the full
 * title, which is never wrong, only long. */
export function shortName(title: string): string {
  const m = title.match(/([A-Z][\w'-]*) & ([A-Z][\w'-]*)$/);
  return m ? `${m[1]} & ${m[2]}` : title;
}

/** "12,900" — a fight HP bar is a big number; make it readable. */
export function fmtHp(n: number): string {
  return n.toLocaleString('en-US');
}

/** How ready the player is for this fight, in their own words. */
export function levelFit(playerLevel: number | undefined, enc: BossEncounter):
{ text: string; tone: 'ok' | 'warn' | 'bad' | 'plain' } {
  if (playerLevel == null) {
    return {
      text: `A level ${enc.lv} fight. Set your level on your save profile `
        + 'and this page will say when you are ready.',
      tone: 'plain',
    };
  }
  const gap = enc.lv - playerLevel;
  if (gap <= 0) {
    return { text: `You're level ${playerLevel} — ready for this Lv ${enc.lv} fight.`, tone: 'ok' };
  }
  if (gap <= 5) {
    return {
      text: `You're level ${playerLevel} to its ${enc.lv} — close, but expect a hard fight.`,
      tone: 'warn',
    };
  }
  return {
    text: `You're level ${playerLevel} — this Lv ${enc.lv} fight is well ahead of you.`,
    tone: 'bad',
  };
}

/** effects arrive as "Electrify 100" — the number is an internal buildup
 * figure with no player-facing meaning, so it does not ship. */
export function effectWords(effects: string | null): string | null {
  if (!effects) return null;
  const words = effects.replace(/\s*\d+(\s|$)/g, ' ').trim();
  return words || null;
}
