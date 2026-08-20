/** The fixed boss's differences, in a player's words.
 *
 * The CEO's question (2026-08-17 23:24): "should show alpha version? Does
 * it not have different stats?" — it does, and the pal card now says
 * exactly how, from the boss's own row in the game's parameter table
 * (data/alphaStats.g.ts, per-row validated against our CombiRank).
 *
 * The line prints ONLY what actually differs, plus the fight multipliers
 * when they aren't 1 — and when nothing differs it says so instead of
 * inventing a difference. Plain .ts so the rule is really tested.
 */
import type { AlphaStat } from './data/alphaStats.g';

export interface BaseStats { hp: number | null; atk: number | null; def: number | null; size: string | null }

const round1 = (v: number): string => {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
};

/** One sentence of measured differences for one boss entry. */
export function bossLine(a: AlphaStat, base: BaseStats): string {
  const bits: string[] = [];
  if (a.hp != null && base.hp != null && a.hp !== base.hp) {
    bits.push(`Health ${a.hp} (normal: ${base.hp})`);
  }
  if (a.atk != null && base.atk != null && a.atk !== base.atk) {
    bits.push(`Attack ${a.atk} (normal: ${base.atk})`);
  }
  if (a.def != null && base.def != null && a.def !== base.def) {
    bits.push(`Defense ${a.def} (normal: ${base.def})`);
  }
  if (a.size && base.size && a.size !== base.size) {
    bits.push(`size ${a.size} (normal: ${base.size})`);
  }
  const fight: string[] = [];
  if (a.hpRate != null && a.hpRate !== 1) fight.push(`×${round1(a.hpRate)} health`);
  if (a.recvRate != null && a.recvRate !== 1) {
    fight.push(`takes ${Math.round(a.recvRate * 100)}% of your damage`);
  }
  if (fight.length) bits.push(`in the fight: ${fight.join(', ')}`);
  if (a.capture != null && a.capture !== 1) {
    bits.push(`catch chance ×${a.capture}`);
  }
  if (!bits.length) return 'fights with the same stats as a normal one';
  return bits.join(' · ');
}
