/** Tidies the datamined partner-effect text before a player ever sees it.
 *
 * That text is not ours and is not always whole. Two flaws reach the screen
 * verbatim, measured across all 297 effects on 2026-08-17:
 *
 *   - **17 effects arrive cut off.** The knowledge-base source we extract from
 *     caps them near 200 characters, so sentences stop mid-word. Five ended
 *     with a half-written aside — the app printed "(Does not s" — and Majex
 *     was cut before its first full stop.
 *   - **2 carry a raw game variable** where a number should be: Leezpunk and
 *     Leezpunk Ignis both read "...undetectable to enemies for
 *     {ActiveSkillOverWriteEffectTime} seconds."
 *
 * We cannot fill either hole. The missing words and the missing number are not
 * in any file we have, and inventing them is forbidden. So this does the two
 * honest things instead: it never prints a developer's variable name, and it
 * never presents a cut sentence as if it were finished.
 *
 * Note what it does NOT do. 139 effects end with a complete "(Does not stack)"
 * and no full stop — an earlier draft treated "no terminal punctuation" as
 * truncation and would have thrown away good text on all of them to fix 17.
 * The test pins the rule to exactly the effects that are really cut.
 */

/** Whole text ends by finishing its sentence or closing its aside. */
const FINISHED = /[.!?)]\s*$/;

/** A game variable the source never filled in, e.g. {ActiveSkillOverWriteEffectTime}.
 * Every one in the data today sits in "for {X} seconds", so "a number of"
 * reads as written English and claims nothing about the value. The test pins
 * that shape — a differently-shaped token fails it rather than printing
 * nonsense. */
const PLACEHOLDER = /\{[^}]*\}/g;

export function cleanEffect(raw: string | null | undefined): string {
  if (!raw) return '';
  const text = raw.replace(PLACEHOLDER, 'a number of');
  if (FINISHED.test(text)) return text;

  // The tail is cut. Keep every word we actually got — it is real information
  // — unless the fragment is a half-written aside like "(Does not s", which
  // carries nothing and only looks broken.
  const i = Math.max(
    text.lastIndexOf('. '), text.lastIndexOf('! '), text.lastIndexOf('? '));
  const tail = i > 0 ? text.slice(i + 1).trim() : '';
  const uselessAside = i > 0 && tail.startsWith('(') && !tail.includes(')');
  const kept = uselessAside ? text.slice(0, i + 1) : text.trimEnd();
  return `${kept} …`;
}

/** True when the source text was cut off — the screens use this to decide
 * whether to explain the trailing "…" rather than leave it hanging. */
export function isCutOff(raw: string | null | undefined): boolean {
  if (!raw) return false;
  return !FINISHED.test(raw.replace(PLACEHOLDER, 'a number of'));
}
