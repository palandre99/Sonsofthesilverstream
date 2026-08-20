/** The box's share format — the writer and the reader in one file.
 *
 * "Share my list" writes gender-suffixed lines and Import reads them back,
 * so a collection moves between installs in two taps. That promise is about
 * somebody's real save, which is why the two halves live together now:
 * format drift between the writer and the reader is silent data loss, and
 * while they sat in different places the writer actually INVENTED a ♀ for
 * every "caught it, couldn't check the gender" pal (the suffix logic
 * predated the mark). An export inventing a gender is the one thing it must
 * never do — imported elsewhere, that pal becomes a parent the plan cannot
 * supply.
 *
 * The mark rides as its own token, and every old list still reads the same:
 *
 *   Lamball          → both genders          (unchanged)
 *   Lamball ♂        → male only             (unchanged)
 *   Lamball ♀        → female only           (unchanged)
 *   Lamball ?        → caught, gender not checked yet
 *   Lamball ♂ ?      → known male + an unchecked second catch
 *   Lamball ♂ ♀ ?    → both known + an unchecked catch
 *
 * Kept dependency-free (no store import) so tests can import it directly.
 * The website's import keeps its own pre-mark copy while the site is on
 * hold — porting this file is on the web backlog.
 */

/** Structurally identical to the store's OwnedGenders. */
export interface Owned { m: boolean; f: boolean; u?: boolean }

/** Exactly what "Share my list" writes for one pal. */
export function exportLine(name: string, g: Owned): string {
  if (g.m && g.f && !g.u) return name;
  const parts: string[] = [];
  if (g.m) parts.push('♂');
  if (g.f) parts.push('♀');
  if (g.u) parts.push('?');
  return parts.length ? `${name} ${parts.join(' ')}` : name;
}

/** One trailing token: a gender, the "?" mark, or a separator-glued form. */
const TOKEN = /\s*[·|,]?\s*(♂|♀|\?|\bm\b|\bf\b)$/i;

export function parseImport(
  text: string, names: Iterable<string>,
): { entries: [string, Owned][]; unknown: string[] } {
  const lower = new Map([...names].map((n) => [n.toLowerCase(), n]));
  const byName = new Map<string, Owned>();
  const unknown: string[] = [];
  const trimmed = text.trim();

  // A JSON backup pastes in whole — the phone's own {m,f,u} entries and the
  // website's {m,f} both read back exactly. Only `true` or an object with a
  // true flag counts as owned, so a species recorded as false/null is not
  // resurrected — and a pal owned only through the "?" mark is still owned.
  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      const source = (obj.box ?? obj) as Record<string, unknown>;
      for (const [k, v] of Object.entries(source)) {
        const name = lower.get(k.toLowerCase());
        if (!name) { unknown.push(k); continue; }
        let owned: Owned | null = null;
        if (v === true) owned = { m: true, f: true };
        else if (typeof v === 'object' && v !== null) {
          const g = v as { m?: unknown; f?: unknown; u?: unknown };
          owned = { m: g.m === true, f: g.f === true, ...(g.u === true ? { u: true } : {}) };
        }
        if (owned && (owned.m || owned.f || owned.u)) byName.set(name, owned);
      }
      return { entries: [...byName], unknown };
    } catch { /* not valid JSON after all — fall through to line parsing */ }
  }

  for (const raw of trimmed.split(/\r?\n/)) {
    const line = raw.trim().replace(/^[-*•]\s*/, '');
    if (!line || line.startsWith('#')) continue;

    // peel trailing tokens off the line; whatever remains is the name
    let rest = line;
    const tokens: string[] = [];
    for (;;) {
      const m = TOKEN.exec(rest);
      if (!m) break;
      tokens.push(m[1].toLowerCase());
      rest = rest.slice(0, m.index);
    }
    const name = lower.get(rest.trim().toLowerCase());
    if (!name) { unknown.push(line); continue; }

    const hasGender = tokens.some((t) => t === '♂' || t === 'm' || t === '♀' || t === 'f');
    const marked = tokens.includes('?');
    // a bare name still means "both genders" — every list written before
    // the mark existed keeps its meaning
    const add: Owned = {
      m: tokens.some((t) => t === '♂' || t === 'm') || (!hasGender && !marked),
      f: tokens.some((t) => t === '♀' || t === 'f') || (!hasGender && !marked),
      ...(marked ? { u: true } : {}),
    };
    const prev = byName.get(name);
    byName.set(name, prev
      ? { m: prev.m || add.m, f: prev.f || add.f, ...((prev.u || add.u) ? { u: true } : {}) }
      : add);
  }
  return { entries: [...byName], unknown };
}
