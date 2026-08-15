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

/** hex + alpha → rgba() — for tier tints layered over dark surfaces */
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** linear hex blend, t=0 → a, t=1 → b */
function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (sh: number) => Math.round(
    ((pa >> sh) & 255) + (((pb >> sh) & 255) - ((pa >> sh) & 255)) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}
const lighten = (hex: string, t: number) => mix(hex, '#FFFFFF', t);

/** THE RARITY RAMP — proper math over the game's own integer (CEO
 * 2026-08-15: a rarity-7 pal painted "starter blue" is wrong; the colour
 * must track quality continuously, not in four coarse buckets).
 *
 * Anchors follow the loot ladder every gamer reads instinctively:
 *   1 grey → 3 green → 5 blue → 7 indigo → 8 purple → 10 magenta.
 * Values between anchors interpolate linearly. 20 (the legendaries) is its
 * own colour — gold — never interpolated across the 10..20 gap.
 * The integer itself is game data; this ramp is only its presentation. */
const RAMP: [number, string][] = [
  [1, '#6F7E85'], [3, '#58B368'], [5, '#3E86C7'],
  [7, '#6E6BE8'], [8, '#8A5CD6'], [10, '#C24FE0'],
];
export function rarityColor(n: number): string {
  if (n >= 12) return '#E3B341';
  if (n <= RAMP[0][0]) return RAMP[0][1];
  for (let i = 1; i < RAMP.length; i++) {
    const [x0, c0] = RAMP[i - 1];
    const [x1, c1] = RAMP[i];
    if (n <= x1) return mix(c0, c1, (n - x0) / (x1 - x0));
  }
  return RAMP[RAMP.length - 1][1];
}

/** The full graded look for one pal, every shade derived from the ramp. */
export interface RarityGrade extends RarityStyle {
  /** 0..1 across the whole ladder (20 ⇒ 1) */
  t: number;
  /** the pal's game rarity integer (bucket-midpoint fallback if unknown) */
  n: number;
  /** portrait ring colour (null = quiet commons) */
  ring: string | null;
  /** subtle wash for INNER cards on the detail sheet */
  cardTint: string;
  /** border for inner cards on the detail sheet */
  cardLine: string;
}

/** bucket word → midpoint, for the one pal palcalc lacks */
const WORD_FALLBACK: Record<string, number> = {
  Common: 2, Rare: 6, Epic: 9, Legendary: 20,
};

export function rarityGrade(name: string, rarity: string | null | undefined): RarityGrade {
  const n = PALCALC_FACTS[name]?.rarity
    ?? WORD_FALLBACK[rarity ?? ''] ?? 2;
  const t = n >= 20 ? 1 : (n - 1) / 10;
  const base = rarityColor(n);
  // quiet below 3 — a level-1 starter should not glow
  const weight = n >= 20 ? 1 : n >= 3 ? 0.25 + 0.75 * ((Math.min(n, 10) - 3) / 7) : 0;
  const loud = weight > 0;
  return {
    card: withAlpha(base, 0.16),
    line: base,
    ink: lighten(base, 0.45),
    soft: withAlpha(base, 0.14),
    weight,
    sheet: loud ? mix(base, '#0D1418', 0.9) : '#101D20',
    aura: withAlpha(base, 0.30),
    aura2: withAlpha(base, 0.14),
    shine: n >= 20 ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.05)',
    sparkle: lighten(base, 0.55),
    t,
    n,
    ring: loud ? withAlpha(base, 0.6 + 0.4 * t) : null,
    cardTint: loud ? withAlpha(base, 0.05 + 0.06 * t) : 'transparent',
    cardLine: loud ? withAlpha(base, 0.25 + 0.25 * t) : 'transparent',
  };
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
