/** The game's own Paldex descriptions (via wiki.gg Palpedia mirror —
 * see tools/fetch_paldex_text.py for provenance). */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const raw = require('./about_1_0.json') as { about: Record<string, string> };
export const ABOUT: Record<string, string> = raw.about;
