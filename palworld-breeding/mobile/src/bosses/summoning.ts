/** How you actually get a raid boss's slab.
 *
 * The raid cards named the slab and stopped, which answers "what do I
 * offer" but not "how do I get one" — the question a player actually
 * has. The Items lane already datamined both halves (recipe + where the
 * pieces turn up), so this READS their facts file and edits nothing of
 * theirs.
 *
 * Every number here is the game's own: the fragment count comes from the
 * slab's recipe row, and the sources come from the fragment's own drop
 * boxes with their own probabilities. Nothing is invented — a slab whose
 * chain is absent upstream returns null and the card says so.
 */

export interface ItemFact {
  recipe?: { id: string; n: number }[];
  boxes?: { src: string; n: string; p: string }[];
}

export interface SummonChain {
  /** what the altar consumes, e.g. "Bellanoir's Slab" */
  slabName: string;
  /** what the slab is built from, e.g. 4 × "Bellanoir's Slab Fragment" */
  partName: string | null;
  partCount: number | null;
  /** where those pieces turn up, the game's own source names */
  sources: string[];
}

/**
 * @param slabId    the raid row's `slab` code — an item id verbatim
 * @param facts     the Items lane's item_facts facts map (read-only)
 * @param nameOf    item id -> the game's own display name
 */
export function summoningChain(
  slabId: string,
  facts: Record<string, ItemFact>,
  nameOf: (id: string) => string | null,
): SummonChain | null {
  const slabName = nameOf(slabId);
  if (!slabName) return null;
  const slab = facts[slabId];
  const first = slab?.recipe?.[0];
  // the piece's OWN entry carries where it turns up; the slab's entry
  // carries only where a finished slab drops (a couple of dungeon books)
  const part = first ? facts[first.id] : undefined;
  const sources = (part?.boxes ?? []).map((b) => b.src);
  return {
    slabName,
    partName: first ? nameOf(first.id) : null,
    partCount: first?.n ?? null,
    sources,
  };
}

/** The chain in a player's words, or null when there is nothing honest
 * to say. Kept short: the card names the first few places and admits how
 * many more there are rather than printing eleven lines. */
export function summoningWords(chain: SummonChain, show = 3): string | null {
  if (!chain.partName || !chain.partCount) return null;
  const head = `Its slab is built from ${chain.partCount} × ${chain.partName}.`;
  if (!chain.sources.length) return head;
  const shown = chain.sources.slice(0, show);
  const rest = chain.sources.length - shown.length;
  const where = rest > 0
    ? `${shown.join(', ')}, and ${rest} more ${rest === 1 ? 'place' : 'places'}`
    : shown.join(', ');
  return `${head} Those turn up in ${where}.`;
}
