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
  /** full card surface (row/badge use) */
  card: string;
  /** border / accent line */
  line: string;
  /** bright accent ink (name, tier label) */
  ink: string;
  /** soft wash for badges on neutral surfaces */
  soft: string;
  /** 0..1 — how loud the tier is */
  weight: number;
  /** info-sheet background: DARK with a whisper of the tier, never a flat
   * dye (CEO 2026-08-15: the flat purple sheet was "garbage") */
  sheet: string;
  /** aurora glow blobs for the sheet's hero zone */
  aura: string;
  aura2: string;
  /** diagonal shine streak (holo-card feel) */
  shine: string;
  /** sparkle glyph colour */
  sparkle: string;
}

export const RARITY_STYLES: Record<string, RarityStyle> = {
  Common: {
    card: '#152528', line: '#27424A', ink: '#A9BDC2',
    soft: 'rgba(122,150,158,0.10)', weight: 0,
    sheet: '#101D20', aura: 'transparent', aura2: 'transparent',
    shine: 'transparent', sparkle: 'transparent',
  },
  Rare: {
    card: '#122A40', line: '#3E86C7', ink: '#8FC8F2',
    soft: 'rgba(79,163,227,0.16)', weight: 0.45,
    sheet: '#0E1E2C', aura: 'rgba(62,134,199,0.28)', aura2: 'rgba(62,134,199,0.13)',
    shine: 'rgba(255,255,255,0.045)', sparkle: '#9ED2F5',
  },
  Epic: {
    card: '#261A42', line: '#8A5CD6', ink: '#C9A4F7',
    soft: 'rgba(169,108,240,0.18)', weight: 0.72,
    sheet: '#150F26', aura: 'rgba(138,92,214,0.30)', aura2: 'rgba(138,92,214,0.14)',
    shine: 'rgba(255,255,255,0.05)', sparkle: '#D3B4FA',
  },
  Legendary: {
    card: '#33270C', line: '#D9A93C', ink: '#F2D384',
    soft: 'rgba(227,179,65,0.20)', weight: 1,
    sheet: '#1C1405', aura: 'rgba(217,169,60,0.30)', aura2: 'rgba(217,169,60,0.15)',
    shine: 'rgba(255,255,255,0.06)', sparkle: '#F7DE9B',
  },
};

/** 0..1 — where this pal sits INSIDE its tier band (Common 1-4, Rare 5-7,
 * Epic 8-10, Legendary always 1). Presentation only: a rarity-7 pal gets a
 * denser sparkle field than a rarity-5, from the game's own integer. */
export function rarityIntensity(name: string): number {
  const r = PALCALC_FACTS[name]?.rarity;
  if (r == null) return 0.5;
  if (r >= 20) return 1;
  if (r >= 8) return (r - 8) / 2;
  if (r >= 5) return (r - 5) / 2;
  return (r - 1) / 3;
}

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
