/** How the Bosses fane says things — the wording rules, shared verbatim
 * between the website and the phone.
 *
 * BYTE-IDENTICAL RULE: this file exists as an exact copy in
 * `app/src/logic/` and `mobile/src/logic/`, enforced by
 * `app/tests/logic-parity.test.ts`. Change one → change both.
 *
 * These were born inside the phone's screens, where nothing could test
 * them. They are pure string/number rules over datamined rows, so they
 * belong here: tested once, identical on both platforms, and ready for
 * the web port instead of waiting to be rewritten.
 */
import type { BossDrop } from '../data/towerRaid.g';
import { ELEMENT_CHART } from '../data/elementChart.g';

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
export function levelFit(playerLevel: number | undefined, lv: number):
{ text: string; tone: 'ok' | 'warn' | 'bad' | 'plain' } {
  if (playerLevel == null) {
    return {
      text: `A level ${lv} fight. Set your level on your save profile `
        + 'and this page will say when you are ready.',
      tone: 'plain',
    };
  }
  const gap = lv - playerLevel;
  if (gap <= 0) {
    return { text: `You're level ${playerLevel} — ready for this Lv ${lv} fight.`, tone: 'ok' };
  }
  if (gap <= 5) {
    return {
      text: `You're level ${playerLevel} to its ${lv} — close, but expect a hard fight.`,
      tone: 'warn',
    };
  }
  return {
    text: `You're level ${playerLevel} — this Lv ${lv} fight is well ahead of you.`,
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

export interface DropLine {
  item: string;
  /** what you get, in the game's own amounts */
  amount: string;
  /** true when the game's table lists this item in more than one group */
  twice: boolean;
}

/** The drop table as a player should read it.
 *
 * The game's own table really does list some items TWICE — verified on
 * the source page: Dandilord's card has 21 rows in ONE table where
 * World Tree Holy Water appears at 20-30 AND at 60-80, and the raid
 * eggs appear at 10% and again at 90%. That is the game's data, not a
 * parsing fault, so nothing is thrown away: identical rows collapse to
 * one line that SAYS it is listed twice, and rows that differ are both
 * shown. Sorted by how likely you are to see it.
 */
export function groupDrops(drops: BossDrop[]): DropLine[] {
  const byItem = new Map<string, BossDrop[]>();
  for (const d of drops) {
    const list = byItem.get(d.item);
    if (list) list.push(d);
    else byItem.set(d.item, [d]);
  }
  const out: DropLine[] = [];
  for (const [item, rows] of byItem) {
    const seen = new Map<string, BossDrop>();
    for (const r of rows) seen.set(`${r.qty}|${r.pct}`, r);
    const distinct = [...seen.values()];
    const amount = distinct
      .map((r) => `${r.qty === '1' ? '' : `${r.qty} `}${pctWords(r.pct)}`)
      .join(', or ');
    out.push({
      item,
      amount: amount.trim(),
      twice: distinct.length === 1 && rows.length > 1,
    });
  }
  out.sort((a, b) => bestPct(byItem.get(b.item)!) - bestPct(byItem.get(a.item)!)
    || (a.item < b.item ? -1 : a.item > b.item ? 1 : 0));
  return out;
}

function bestPct(rows: BossDrop[]): number {
  return Math.max(...rows.map((r) => r.pct));
}

/** 100% is "always" to a player; anything else keeps its number. */
function pctWords(pct: number): string {
  return pct >= 100 ? 'always' : `${pct}% of the time`;
}

/** What a pal's own elements mean in a fight, for its Paldex card:
 * what its attacks beat, and what beats it. Both halves come from the
 * same chart the Bosses fane ranks with, so a card and a boss page can
 * never disagree. Returns null when the pal has no element at all. */
export function matchupSummary(elements: string[]):
{ strongAgainst: string[]; weakTo: string[] } | null {
  if (!elements.length) return null;
  const strong = new Set<string>();
  for (const el of elements) {
    for (const t of ELEMENT_CHART[el]?.strong ?? []) strong.add(t);
  }
  // what hits THIS pal for double: an attacking element is only a real
  // threat if the pal's OTHER element does not cancel it (Reptyro takes
  // even damage from Grass), so the multiplier decides, not the chart row
  const weak = new Set<string>();
  for (const atk of Object.keys(ELEMENT_CHART)) {
    let m = 1;
    for (const el of elements) {
      const row = ELEMENT_CHART[atk];
      if (row?.strong.includes(el)) m *= 2;
      else if (row?.weak.includes(el)) m *= 0.5;
    }
    if (m > 1) weak.add(atk);
  }
  return {
    strongAgainst: [...strong].sort(),
    weakTo: [...weak].sort(),
  };
}

/** "Fire", "Fire and Water", "Electric, Grass and Ice" — three or more
 * joined with "and" between every pair reads like a child's list, and
 * the pal card printed exactly that on every dual-element pal. */
export function listWords(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
