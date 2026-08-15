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

/** Drama tiers — the design law of v5 (CEO 2026-08-15: commons must be
 * QUIET; "a legendary card looks way cooler than an uncommon one"):
 *   none   (n ≤ 4)  — no ring, no glow, no tint. A starter is a plain card.
 *   soft   (5–7)    — ring + one soft aura + a few sparkles. No sweep.
 *   full   (8–10)   — two-tone aurora, sparkle field, light sweep, tints.
 *   legend (20)     — the show: layered two-tone aurora, dense sparkles,
 *                     double light sweep, gold ring.
 */
export type DramaTier = 'none' | 'soft' | 'full' | 'legend';

/** The full graded look for one pal, every shade derived from the ramp. */
export interface RarityGrade extends RarityStyle {
  /** 0..1 across the whole ladder (20 ⇒ 1) */
  t: number;
  /** the pal's game rarity integer, band-clamped for presentation */
  n: number;
  tier: DramaTier;
  /** complementary second hue — kills the flat one-colour look */
  line2: string;
  sparkle2: string;
  /** portrait ring colour (null = quiet commons) */
  ring: string | null;
  /** subtle wash for INNER cards on the detail sheet */
  cardTint: string;
  /** border for inner cards on the detail sheet */
  cardLine: string;
  /** the raw integer agrees with the bucket word (false only for Gumoss) */
  agrees: boolean;
}

/** bucket word → midpoint, for the one pal palcalc lacks */
const WORD_FALLBACK: Record<string, number> = {
  Common: 2, Rare: 6, Epic: 9, Legendary: 20,
};
/** bucket word → the integer band it corresponds to */
const WORD_BAND: Record<string, [number, number]> = {
  Common: [1, 4], Rare: [5, 7], Epic: [8, 10], Legendary: [20, 20],
};
/** two-tone partners per drama tier */
const SECOND_HUE: Record<DramaTier, string> = {
  none: '#27424A', soft: '#4FD8E8', full: '#E86BD8', legend: '#FF9D3D',
};

export function rarityGrade(name: string, rarity: string | null | undefined): RarityGrade {
  const raw = PALCALC_FACTS[name]?.rarity ?? WORD_FALLBACK[rarity ?? ''] ?? 2;
  // presentation trusts the SIGNAL BOTH SOURCES agree on: the integer is
  // clamped into its bucket word's band. This exists for exactly one pal —
  // Gumoss, Common in kb but 10 in the game table — which must not glow
  // like an Anubis (CEO caught it on sight).
  const band = WORD_BAND[rarity ?? ''];
  const n = band ? Math.min(Math.max(raw, band[0]), band[1]) : raw;
  const agrees = n === raw;
  const tier: DramaTier = n >= 20 ? 'legend' : n >= 8 ? 'full' : n >= 5 ? 'soft' : 'none';
  const t = n >= 20 ? 1 : (n - 1) / 10;
  const base = rarityColor(n);
  const second = mix(base, SECOND_HUE[tier], 0.55);
  const weight = tier === 'none' ? 0
    : tier === 'soft' ? 0.3 + 0.2 * ((n - 5) / 2)
      : tier === 'full' ? 0.6 + 0.2 * ((n - 8) / 2) : 1;
  const loudCards = tier === 'full' || tier === 'legend';
  return {
    card: withAlpha(base, 0.16),
    line: base,
    ink: lighten(base, 0.45),
    soft: withAlpha(base, 0.14),
    weight,
    sheet: tier === 'none' ? '#101D20'
      : tier === 'soft' ? mix(base, '#0E181B', 0.93)
        : mix(base, '#0D1418', tier === 'legend' ? 0.87 : 0.9),
    aura: withAlpha(base, tier === 'legend' ? 0.34 : 0.28),
    aura2: withAlpha(second, tier === 'legend' ? 0.20 : 0.14),
    shine: tier === 'legend' ? 'rgba(255,246,220,0.09)' : 'rgba(255,255,255,0.05)',
    sparkle: lighten(base, 0.55),
    t,
    n,
    tier,
    line2: second,
    sparkle2: lighten(second, 0.5),
    ring: tier === 'none' ? null : withAlpha(base, 0.6 + 0.4 * t),
    // SOLID colours, never transparent: these REPLACE the card surface, so a
    // transparent value deletes the bubble entirely (shipped once, CEO caught
    // it in minutes — every section floated naked on the sheet)
    cardTint: loudCards ? mix('#152528', base, 0.06 + 0.08 * t) : '#152528',
    cardLine: loudCards ? mix('#27424A', base, 0.35) : '#27424A',
    agrees,
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
