/** Rarity presentation — the CARD wears the tier, not a sliver of it.
 *
 * The GAME DATA is the integer in `palcalcFacts.g.ts` (1..10, 20 for the
 * legendaries, straight from DT_PalMonsterParameter). The dataset's four
 * bucket words map onto it exactly: Common 1-4 · Rare 5-7 · Epic 8-10 ·
 * Legendary 20.
 *
 * The COLOURS are the game's own rarity ladder (blue → purple → gold; the
 * game's pal table has no green "uncommon" tier, so neither do we — inventing
 * one would be inventing data). Tuned for the dark theme: the whole card
 * surface is dyed, the full border carries the colour, and the pal's name ink
 * warms with the tier — a Legendary row must be unmistakable from across the
 * room. CEO 2026-08-16: the first version (thin left edge + 7% wash) was
 * rejected as "terrible — not even the card that's coloured".
 */
import { PALCALC_FACTS } from './palcalcFacts.g';

export interface RarityStyle {
  /** full card surface */
  card: string;
  /** full card border */
  line: string;
  /** bright accent ink (name, tier label) */
  ink: string;
  /** soft wash for badges on neutral surfaces */
  soft: string;
  /** 0..1 — how loud the tier is (drives border width) */
  weight: number;
}

export const RARITY_STYLES: Record<string, RarityStyle> = {
  Common: {
    card: '#152528', line: '#27424A', ink: '#A9BDC2',
    soft: 'rgba(122,150,158,0.10)', weight: 0,
  },
  Rare: {
    card: '#122A40', line: '#3E86C7', ink: '#8FC8F2',
    soft: 'rgba(79,163,227,0.16)', weight: 0.45,
  },
  Epic: {
    card: '#261A42', line: '#8A5CD6', ink: '#C9A4F7',
    soft: 'rgba(169,108,240,0.18)', weight: 0.72,
  },
  Legendary: {
    card: '#33270C', line: '#D9A93C', ink: '#F2D384',
    soft: 'rgba(227,179,65,0.20)', weight: 1,
  },
};

/** legacy single-colour accessor — border tint, falling back to a neutral */
export const RARITY_COLORS: Record<string, string> = {
  Rare: RARITY_STYLES.Rare.line,
  Epic: RARITY_STYLES.Epic.line,
  Legendary: RARITY_STYLES.Legendary.line,
};

export function rarityTint(rarity: string | null | undefined, neutral: string): string {
  return (rarity && RARITY_COLORS[rarity]) || neutral;
}

export function rarityStyle(rarity: string | null | undefined): RarityStyle {
  return (rarity && RARITY_STYLES[rarity]) || RARITY_STYLES.Common;
}

/** the game's own rarity integer, or null for the one pal palcalc lacks */
export function rarityNumber(name: string): number | null {
  return PALCALC_FACTS[name]?.rarity ?? null;
}

/** "Lv 6 to 13" / "Lv 25" / null when it never spawns wild */
export function wildLevelRange(name: string): string | null {
  const f = PALCALC_FACTS[name];
  if (!f || f.minWild == null || f.maxWild == null) return null;
  return f.minWild === f.maxWild ? `Lv ${f.minWild}` : `Lv ${f.minWild} to ${f.maxWild}`;
}
