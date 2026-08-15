/** Cross-screen "take me there" intents.
 *
 * The nav architecture is CEO-final (side panel = domains, bottom bar = the
 * domain's tabs) and nothing here changes it — this is only a one-slot mailbox
 * so a card can say "open this in the Calculator" and actually land there with
 * the pal already chosen, instead of telling the player to go do it themselves.
 *
 * Deliberately tiny and module-level, the same shape as kit's recent picks:
 * no context provider, no re-render storm, no dependency on the tab tree.
 */

export interface NavIntent {
  /** domain id from nav/domains.ts */
  domain: string;
  /** tab id inside that domain */
  tab: string;
  /** what the destination screen should preselect; `fromCard` names the pal
   * whose info card sent the player here, so the destination can offer a
   * one-tap way BACK to that card (CEO 2026-08-15: without it you had to
   * re-scroll the whole Paldex to reopen the pal you came from) */
  payload?: { pal?: string; mode?: 'pair' | 'reverse'; fromCard?: string };
}

let pending: NavIntent | null = null;
const listeners = new Set<(i: NavIntent) => void>();

/** Ask the shell to switch screens. Safe to call from any screen. */
export function navigateTo(intent: NavIntent): void {
  pending = intent;
  for (const l of listeners) l(intent);
}

/** The shell subscribes once; returns an unsubscribe. */
export function onNavIntent(fn: (i: NavIntent) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** A destination screen takes its payload exactly once, then it's gone —
 * so re-entering the tab later doesn't silently re-apply an old selection. */
export function takeIntentPayload(tab: string): NavIntent['payload'] | null {
  if (!pending || pending.tab !== tab) return null;
  const p = pending.payload ?? null;
  pending = null;
  return p;
}
