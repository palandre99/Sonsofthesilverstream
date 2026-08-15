/** Rarity presentation tokens (UI design, not game data — the dataset's
 * four rarity buckets mapped to the palette gamers expect). Used as card
 * tints so rarity reads at a glance. */
export const RARITY_COLORS: Record<string, string> = {
  Rare: '#4FA3E3',
  Epic: '#A96CF0',
  Legendary: '#E3B341',
};

/** border tint for a pal card; falls back to the given neutral */
export function rarityTint(rarity: string | null | undefined, neutral: string): string {
  return (rarity && RARITY_COLORS[rarity]) || neutral;
}
