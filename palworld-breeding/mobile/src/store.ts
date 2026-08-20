/** App state: the oracle-tested engine, data, ownership box, plan, persistence.
 *
 * A tiny external store (useSyncExternalStore) — no state library needed.
 * Everything persists to AsyncStorage best-effort; the app works fully
 * in-memory if storage is unavailable.
 */
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterUntick, claimFor } from './logic/ticks';
import { withoutTargets, withTargets } from './logic/goals';
import { BreedingEngine } from './engine/formula';
import { derivations, planFor, stepId } from './engine/planner';
import { ADVICE_VERSION, helperAdvice, type HelperAdvice } from './engine/helpers';
import type { BreedingData, PlanStep } from './engine/types';
import breedingJson from './data/breeding_1_0.json';
import palsJson from './data/pals_1_0.json';
import passivesJson from './data/passives_1_0.json';
import verificationJson from './data/verification.json';

/* ---------------- data ---------------- */

export interface PalInfo {
  number: string;
  elements: string[];
  work: Record<string, number>;
  rarity: string | null;
  hp: number | null;
  atk: number | null;
  def: number | null;
  combi_rank: number | null;
  partner_skill: string | null;
  partner_effect: string | null;
  nocturnal: boolean | null;
  food: number | null;
  size: string | null;
  drops: string[];
  ranch_produce: string[] | null;
  craft_speed: number | null;
  /** The structured read of a pal's base-side partner effect, mined for the
   * 24 species that have one. Two of them are about eggs, which is the whole
   * point of this app, and nothing surfaced them before. */
  base_support: { type: string; task?: string; bonus?: number; effect?: string } | null;
  /** How the game actually hands you this pal — dungeons, loot eggs, caged
   * pals in enemy camps, the Pal Recruiter, raids, fishing. Mined for 251 of
   * the 299 species and, until now, shown by nothing. */
  obtain_notes: string[] | null;
  /** The named boss version — title, level and place, e.g. "Dark Knight of
   * Legend Necromus (Lv. 60) - Palpagos Islands (440,679)". 267 lines across
   * 207 species; only 91 of them carry coordinates the map can pin, so the
   * other 116 were invisible. */
  alpha_locations: string[] | null;
  max_wild_level: number | null;
  wild: boolean;
  regions: string[];
  egg_types: string[];
}

export interface PassiveInfo {
  name: string;
  tier: number | null;
  category: string;
  effects: string;
  /** ALWAYS true in the data — 114 of 114. The real signal is
   * `breedable_known` below; keep this only because the file carries it. */
  breedable: boolean;
  /** whether the source confirmed the breedable flag at all. False for
   * exactly the 7 World Tree passives, and nothing used to say so. */
  breedable_known: boolean;
  mutation_exclusive: boolean;
  world_tree: boolean;
  exclusive_to: string[];
  /** Pals (and, for Mercy Hit, items) that already carry this passive.
   * Mined for 8 passives, none of which is in `exclusive_to`, so the
   * "native to" warning never covered them and nothing showed it. */
  native_pals: string[] | null;
}

export const breeding = breedingJson as unknown as BreedingData;
export const pals = (palsJson as unknown as { pals: Record<string, PalInfo> }).pals;
export const passives = (passivesJson as unknown as { passives: PassiveInfo[] }).passives;
export const claims = (verificationJson as unknown as {
  claims: { claim: string; verdict: string; evidence: string; sources?: string[] }[];
}).claims;

/** The day the claims table was last checked. It was in the file all along and
 * shown nowhere — a "verified claims" list with no date is a weaker promise
 * than one that says when it was last looked at. */
export const claimsCheckedOn = (verificationJson as unknown as {
  checked?: string;
}).checked ?? null;

export const engine = new BreedingEngine(breeding);
export const selfOnly = new Set(breeding.self_breed_only);
export const PAL_NAMES = Object.keys(pals);

export function palNumberSort(a: string, b: string): number {
  const ma = /^(\d+)([A-Z]?)$/.exec(pals[a]?.number ?? '');
  const mb = /^(\d+)([A-Z]?)$/.exec(pals[b]?.number ?? '');
  if (ma && mb) {
    const d = Number(ma[1]) - Number(mb[1]);
    if (d) return d;
    return ma[2].localeCompare(mb[2]);
  }
  if (ma) return -1;
  if (mb) return 1;
  return a.localeCompare(b);
}

export function workLabel(job: string): string {
  const j = job.replace(/_/g, ' ');
  return j === 'Generating Electricity' ? 'Electricity' : j;
}

export function topWork(p: PalInfo, n = 3): [string, number][] {
  return Object.entries(p.work ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, n) as [string, number][];
}

/* ---------------- persisted state ---------------- */

/** What the player has of a species.
 *
 * `u` = caught it, but could not tell the gender — the CEO, 2026-08-17:
 * "Sometimes when I'm out catching one pal I can't see if it's male or
 * female". It counts as CAUGHT everywhere, because he has it, but it never
 * counts as a known male or female: breeding needs a specific parent of a
 * specific gender, and claiming one he does not have would put a route in the
 * plan that cannot be run. Optional, so every save written before today keeps
 * working untouched. */
export interface OwnedGenders { m: boolean; f: boolean; u?: boolean }

export interface SavedPlan {
  targets: string[];
  steps: PlanStep[];
  unreachable: string[];
  planned: string;
  /** the box at plan time — reshapes re-plan against THIS so finished
   * steps (and their ticks) survive; absent on old saves */
  roster?: string[];
  /** helper recommendations, computed in the same pass as the plan so the
   * card renders together with the steps — never pops in later */
  advice?: HelperAdvice[];
  /** contract version of `advice` — a mismatch triggers a recompute so old
   * plans pick up smarter advice (e.g. the catch-only Chikipi fix) */
  adviceVersion?: number;
}

interface State {
  box: Record<string, OwnedGenders>;
  /** legacy `true` (pre-gender ticks) or a StepCheck record */
  checks: Record<string, true | StepCheckShape>;
  plan: SavedPlan | null;
  /** the things a player means to make, item id -> how many (IL43).
   * Per profile, like everything else here: two worlds, two build
   * lists. Empty for everyone until they add something. */
  build: Record<string, number>;
}

interface StepCheckShape { m: boolean; f: boolean; addedM: boolean; addedF: boolean }

const state: State = { box: {}, checks: {}, plan: null, build: {} };
let version = 0;
const listeners = new Set<() => void>();

function emit(): void {
  version++;
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Re-render when anything changes; read state via the exported getters. */
export function useAppVersion(): number {
  return useSyncExternalStore(subscribe, () => version);
}

/* ---------------- save profiles ----------------
 * People run multiple worlds/saves (Dododex solves the same problem with
 * per-server profiles). Each profile namespaces its own box/checks/plan.
 * The 'default' profile uses the ORIGINAL storage keys so nobody's data is
 * lost by this feature appearing. */

export interface Profile {
  id: string;
  name: string;
  /** the player's level in this world — set by hand on the Profiles screen;
   * suggestions use it to judge what's actually catchable. Absent = the app
   * falls back to reading the box (highest wild level among owned pals). */
  playerLevel?: number;
}

const PROFILES_KEY = 'palforge-profiles-v1';
let profiles: Profile[] = [{ id: 'default', name: 'My world' }];
let activeProfile = 'default';

export const getProfiles = (): Profile[] => profiles;
export const getActiveProfile = (): Profile =>
  profiles.find((p) => p.id === activeProfile) ?? profiles[0];

function keysFor(profileId: string):
{ box: string; checks: string; plan: string; build: string } {
  if (profileId === 'default') {
    return {
      box: 'hatchlab-box-v2',
      checks: 'hatchlab-checks-v1',
      plan: 'hatchlab-plan-v1',
      // no legacy key to preserve — the build list is new at IL43
      build: 'palforge-default-build',
    };
  }
  return {
    box: `palforge-${profileId}-box`,
    checks: `palforge-${profileId}-checks`,
    plan: `palforge-${profileId}-plan`,
    build: `palforge-${profileId}-build`,
  };
}

async function persistProfiles(): Promise<void> {
  try {
    await AsyncStorage.setItem(PROFILES_KEY, JSON.stringify({ profiles, active: activeProfile }));
  } catch { /* in-memory only */ }
}

export async function createProfile(name: string): Promise<void> {
  const id = `p${Date.now().toString(36)}`;
  profiles = [...profiles, { id, name: name.trim() || `World ${profiles.length + 1}` }];
  await persistProfiles();
  await switchProfile(id);
}

export async function renameProfile(id: string, name: string): Promise<void> {
  profiles = profiles.map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p));
  await persistProfiles();
  emit();
}

/** The active profile's player level, if the player has told us. */
export const getPlayerLevel = (): number | undefined => getActiveProfile().playerLevel;

export async function setProfileLevel(id: string, level: number | undefined): Promise<void> {
  const lv = level == null || Number.isNaN(level)
    ? undefined
    : Math.max(1, Math.min(100, Math.round(level)));
  profiles = profiles.map((p) => (p.id === id ? { ...p, playerLevel: lv } : p));
  await persistProfiles();
  emit();
}

export async function deleteProfile(id: string): Promise<void> {
  if (profiles.length <= 1) return; // never delete the last profile
  // switchProfile was hardened against a write landing mid-flight and saving
  // one world's data under another world's keys — but THIS path had the same
  // hole and no guard. Deleting the ACTIVE world moves the pointer to the
  // survivor while `state` still holds the deleted world's box, and then
  // loadProfileData blanks `state` and awaits a read. A write in either
  // window saves the deleted world's collection — or an empty one — over the
  // survivor's. Same guard, same reason (self-found on a code read).
  switching = true;
  try {
    const k = keysFor(id);
    try {
      await AsyncStorage.multiRemove([k.box, k.checks, k.plan]);
    } catch { /* best-effort */ }
    profiles = profiles.filter((p) => p.id !== id);
    if (activeProfile === id) activeProfile = profiles[0].id;
    await persistProfiles();
    await loadProfileData();
  } finally {
    switching = false;
  }
}

/** Lightweight per-profile stats for the Profiles screen — active profile
 * reads live state; others read storage. */
export interface ProfileStats { owned: number; planDone: number; planTotal: number }

function doneCount(
  steps: PlanStep[], checks: Record<string, true | StepCheckShape>,
): number {
  return steps.filter((st) => {
    const c = checks[stepId(st.parents[0], st.parents[1], st.child)];
    return c === true || (typeof c === 'object' && c !== null && c.m && c.f);
  }).length;
}

export async function profileStats(id: string): Promise<ProfileStats> {
  if (id === activeProfile) {
    return {
      owned: Object.keys(state.box).length,
      planDone: state.plan ? doneCount(state.plan.steps, state.checks) : 0,
      planTotal: state.plan?.steps.length ?? 0,
    };
  }
  try {
    const k = keysFor(id);
    const [b, c, pl] = await AsyncStorage.multiGet([k.box, k.checks, k.plan]);
    const owned = b[1] ? Object.keys(JSON.parse(b[1]) as object).length : 0;
    const checks = c[1]
      ? (JSON.parse(c[1]) as Record<string, true | StepCheckShape>) : {};
    const plan = pl[1] ? (JSON.parse(pl[1]) as SavedPlan) : null;
    const steps = plan && Array.isArray(plan.steps) ? plan.steps : [];
    return { owned, planDone: doneCount(steps, checks), planTotal: steps.length };
  } catch {
    return { owned: 0, planDone: 0, planTotal: 0 };
  }
}

/** Switch worlds without a write race: the new profile's data is loaded
 * FIRST, then pointer + state flip atomically (no await between them), so
 * a write landing mid-switch can never save one world's data under the
 * other world's keys (reviewer catch 2026-08-15). */
export async function switchProfile(id: string): Promise<void> {
  if (!profiles.some((p) => p.id === id) || id === activeProfile) return;
  switching = true;
  try {
    const k = keysFor(id);
    let nextBox: Record<string, OwnedGenders> = {};
    let nextChecks: Record<string, true | StepCheckShape> = {};
    let nextPlan: SavedPlan | null = null;
    try {
      const [b, c, pl] = await AsyncStorage.multiGet([k.box, k.checks, k.plan]);
      if (b[1]) {
        const saved = JSON.parse(b[1]) as Record<string, OwnedGenders>;
        nextBox = Object.fromEntries(
          Object.entries(saved).filter(([n]) => Object.hasOwn(pals, n)),
        );
      }
      if (c[1]) nextChecks = JSON.parse(c[1]) as Record<string, true | StepCheckShape>;
      if (pl[1]) {
        const plan = JSON.parse(pl[1]) as SavedPlan;
        if (Array.isArray(plan.targets) && Array.isArray(plan.steps)) nextPlan = plan;
      }
    } catch { /* unreadable profile data — start it empty */ }
    // atomic flip — no awaits between these lines
    activeProfile = id;
    state.box = nextBox;
    state.checks = nextChecks;
    state.plan = nextPlan;
    draftTargets = nextPlan?.targets ?? [];
    emit();
  } finally {
    switching = false;
  }
  await persistProfiles();
}

/** true while switchProfile is mid-flight — writes are dropped rather than
 * risk landing under the wrong profile's keys */
let switching = false;

async function persist(key: 'box' | 'checks' | 'plan' | 'build'): Promise<void> {
  if (switching) return;
  try {
    await AsyncStorage.setItem(keysFor(activeProfile)[key], JSON.stringify(state[key]));
  } catch { /* persistence unavailable — keep running in-memory */ }
}

async function loadProfileData(): Promise<void> {
  state.box = {};
  state.checks = {};
  state.plan = null;
  state.build = {};
  try {
    const k = keysFor(activeProfile);
    const [b, c, p, bl] = await AsyncStorage.multiGet(
      [k.box, k.checks, k.plan, k.build]);
    if (bl[1]) {
      // Only the SHAPE is checked here. Whether an id still exists in
      // the catalogue is checked where the list is read (buildTotals,
      // buildTime, the panel, the share) — because importing the item
      // catalogue into this file dragged 2.4 MB of item facts into app
      // STARTUP, measured at IL48: App -> store -> itemsData. The box
      // can validate against `pals` because the breeding engine needs
      // that table anyway; the item tables are not needed to launch.
      const saved = JSON.parse(bl[1]) as Record<string, number>;
      state.build = Object.fromEntries(
        Object.entries(saved).filter(([, n]) => Number.isFinite(n) && n > 0));
    }
    if (b[1]) {
      const saved = JSON.parse(b[1]) as Record<string, OwnedGenders>;
      state.box = Object.fromEntries(
        Object.entries(saved).filter(([n]) => Object.hasOwn(pals, n)),
      );
    }
    if (c[1]) state.checks = JSON.parse(c[1]) as Record<string, true | StepCheckShape>;
    if (p[1]) {
      const plan = JSON.parse(p[1]) as SavedPlan;
      if (Array.isArray(plan.targets) && Array.isArray(plan.steps)) state.plan = plan;
    }
  } catch { /* fresh start */ }
  draftTargets = state.plan?.targets ?? [];
  emit();
}

export async function loadPersisted(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(PROFILES_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as { profiles: Profile[]; active: string };
      if (Array.isArray(saved.profiles) && saved.profiles.length) {
        profiles = saved.profiles;
        activeProfile = saved.active;
      }
    }
  } catch { /* default registry */ }
  await loadProfileData();
}

/* ---------------- the build list (IL43) ----------------
 * "I want a Legendary set AND these two weapons — what do I need in
 * total?" is the question a player asks before a grind session, and the
 * per-item bills (IL32/IL33) could not answer it. This holds only what
 * the player asked for; every material total is DERIVED from the
 * shipped recipes at read time, so nothing here can drift out of date
 * when the data refreshes. */

export const getBuildList = (): Record<string, number> => state.build;
export const buildQty = (id: string): number => state.build[id] ?? 0;
export const buildCount = (): number => Object.keys(state.build).length;

/** Set how many of `id` the player wants; 0 or less removes it. */
export async function setBuildQty(id: string, n: number): Promise<void> {
  const qty = Math.floor(n);
  const next = { ...state.build };
  if (!Number.isFinite(qty) || qty <= 0) delete next[id];
  // a slip on the stepper should not ask for 4 billion Paldium
  else next[id] = Math.min(qty, 999);
  state.build = next;
  emit();
  await persist('build');
}

export const addToBuild = (id: string, n = 1): Promise<void> =>
  setBuildQty(id, buildQty(id) + n);

export async function clearBuild(): Promise<void> {
  state.build = {};
  emit();
  await persist('build');
}

/* ---------------- box ---------------- */

export const getBox = () => state.box;
export const ownedAny = (n: string) =>
  !!(state.box[n]?.m || state.box[n]?.f || state.box[n]?.u);
/** Has one whose gender is still to be checked — regardless of what else
 * is known about the species. */
export const genderUnsure = (n: string) => !!state.box[n]?.u;
export const unsureCount = () =>
  Object.keys(state.box).filter(genderUnsure).length;
export const hasGender = (n: string, g: 'm' | 'f') => !!state.box[n]?.[g];
export const ownedCount = () => Object.keys(state.box).length;
export const pairReadyCount = () =>
  Object.values(state.box).filter((o) => o.m && o.f).length;

export function setOwnedGender(name: string, g: 'm' | 'f', val: boolean): void {
  const cur = state.box[name] ?? { m: false, f: false };
  // TICKING a gender on answers the question, so the "?" clears itself —
  // but only on ON. Un-ticking a gender says nothing about the unidentified
  // one, and the first version cleared the mark on any tap.
  const entry = val ? { ...cur, [g]: true, u: false } : { ...cur, [g]: false };
  const next = { ...state.box };
  if (!entry.m && !entry.f && !entry.u) delete next[name];
  else next[name] = entry;
  state.box = next;
  void persist('box');
  emit();
}

/** Mark (or unmark) "caught one whose gender I haven't checked".
 *
 * It COEXISTS with known genders — the first version wiped them, and the CEO
 * caught it within hours: "if I tick male only and I capture one in wild I
 * will add a gender check tick to it but that does not mean u should untick
 * my already selected tick". Owning a known male AND an unidentified second
 * catch is the normal case, not a contradiction. */
export function setGenderUnsure(name: string, val: boolean): void {
  const cur = state.box[name] ?? { m: false, f: false };
  const entry = { ...cur, u: val };
  const next = { ...state.box };
  if (!entry.m && !entry.f && !entry.u) delete next[name];
  else next[name] = entry;
  state.box = next;
  void persist('box');
  emit();
}

export function toggleOwned(name: string): void {
  const next = { ...state.box };
  if (next[name]) delete next[name];
  else next[name] = { m: true, f: true };
  state.box = next;
  void persist('box');
  emit();
}

export function importNames(entries: [string, OwnedGenders][], replace: boolean): number {
  const next = replace ? {} : { ...state.box };
  let added = 0;
  for (const [name, g] of entries) {
    if (!Object.hasOwn(pals, name)) continue;
    const cur = next[name];
    // the "?" travels with the entry and survives a merge — it marks a pal
    // still to be checked, which a merge cannot answer
    next[name] = cur
      ? { m: cur.m || g.m, f: cur.f || g.f, u: !!(cur.u || g.u) }
      : { ...g };
    added++;
  }
  state.box = next;
  void persist('box');
  emit();
  return added;
}

export function clearBox(): void {
  state.box = {};  // fresh reference by construction
  void persist('box');
  emit();
}

export function canPairNow(a: string, b: string, genderNote?: string | null): boolean {
  const oa = state.box[a];
  const ob = state.box[b];
  if (!oa || !ob) return false;
  if (a === b) return oa.m && oa.f;
  if (genderNote) {
    const m = /^female (.+) \+ male (.+)$/.exec(genderNote);
    if (m) return m[1] === a ? oa.f && ob.m : oa.m && ob.f;
  }
  return (oa.m && ob.f) || (oa.f && ob.m);
}

/* ---------------- draft goal list ----------------
 * The goal chips the player is composing on the Planner live HERE, not in
 * screen state: tab switches remount every screen (App.tsx Boundary key),
 * and the suggestions sheet, the picker, the chips row and the advice card
 * all edit the same list — screen-local copies is how the "can't un-add"
 * bug happened (CEO 2026-08-15). Deliberately not persisted on its own: a
 * fresh launch starts from the saved plan's goals. */

let draftTargets: string[] = [];

export const getDraftTargets = (): string[] => draftTargets;

export function addDraftTargets(names: string[]): void {
  const next = withTargets(draftTargets, names);
  if (next === draftTargets) return;
  draftTargets = next;
  emit();
}

export function removeDraftTargets(names: string[]): void {
  const next = withoutTargets(draftTargets, names);
  if (next === draftTargets) return;
  draftTargets = next;
  emit();
}

export function clearDraftTargets(): void {
  if (!draftTargets.length) return;
  draftTargets = [];
  emit();
}

/* ---------------- plan + checks ---------------- */

export const getPlan = () => state.plan;
export const getChecks = () => state.checks;

export function savePlan(plan: SavedPlan): void {
  state.plan = plan;
  draftTargets = plan.targets;
  void persist('plan');
  emit();
}

/* A completed step records WHICH genders hatched and writes them straight
 * into the collection — one tick, no double registration. It also remembers
 * what it ADDED, so unticking removes only that (never pre-owned pals). */
export interface StepCheck {
  m: boolean;
  f: boolean;
  addedM: boolean;
  addedF: boolean;
}

export const isChecked = (sid: string): boolean => !!state.checks[sid];

export function completeStep(sid: string, child: string, got: { m: boolean; f: boolean }): void {
  // the rule lives in logic/ticks.ts — it decides whether a collection stays
  // correct, so both platforms share one parity-gated, tested copy
  const prev = (state.checks as Record<string, unknown>)[sid];
  const prevSc = prev && typeof prev === 'object' ? prev as StepCheck : null;
  const entry: StepCheck = claimFor(
    got,
    { m: hasGender(child, 'm'), f: hasGender(child, 'f') },
    prevSc,
  );
  state.checks = { ...state.checks, [sid]: entry };
  const cur = state.box[child] ?? { m: false, f: false };
  // the hatched egg answers nothing about an earlier catch still waiting for
  // its gender check — the "?" survives the tick (unlike a Paldex gender tap,
  // which IS the player answering that question)
  const merged = { m: cur.m || got.m, f: cur.f || got.f, ...(cur.u ? { u: true } : {}) };
  if (merged.m || merged.f || cur.u) state.box = { ...state.box, [child]: merged };
  void persist('checks');
  void persist('box');
  emit();
}

/** "Start over": untick every step properly — reversing exactly what each
 * tick registered into the collection (never pre-owned pals). */
export function resetPlanProgress(): void {
  const nextBox = { ...state.box };
  for (const sid of Object.keys(state.checks)) {
    const c = (state.checks as Record<string, unknown>)[sid];
    if (c && typeof c === 'object') {
      const sc = c as StepCheckShape;
      const child = sid.slice(sid.lastIndexOf('>') + 1);
      const cur = nextBox[child];
      if (cur) {
        // same shared rule as a single untick — it knows the "?" mark is
        // not a tick's to take
        const entry = afterUntick(cur, sc);
        if (!entry) delete nextBox[child];
        else nextBox[child] = entry;
      }
    }
  }
  state.box = nextBox;
  state.checks = {};
  void persist('checks');
  void persist('box');
  emit();
}

/** "Clear plan": forget the plan and its ticks. The collection stays —
 * pals you hatched are still real. */
export function clearPlan(): void {
  state.plan = null;
  state.checks = {};
  draftTargets = [];
  void persist('plan');
  void persist('checks');
  emit();
}

/** Add a goal to the saved plan and reshape it. Checks are keyed by step
 * id, so every step that survives the reshape keeps its tick. */
export function addPlanTarget(name: string): void {
  if (state.plan?.targets.includes(name)) return;
  // no plan yet? "Plan how to get it" on a pal card must still work — it
  // starts a fresh one-goal plan instead of silently doing nothing
  const targets = [...(state.plan?.targets ?? []), name];
  const roster = state.plan?.roster ?? Object.keys(state.box);
  try {
    const derivs = derivations(engine, new Set(roster));
    const { steps, unreachable } = planFor(engine, roster, targets, derivs);
    const advice = helperAdvice(
      engine, Object.keys(state.box), ownedAny, { targets, steps, roster }, derivs);
    state.plan = {
      ...(state.plan ?? {}), targets, steps, unreachable, advice,
      adviceVersion: ADVICE_VERSION,
      planned: new Date().toISOString(), roster,
    };
  } catch (e) {
    console.error('addPlanTarget failed:', e);
    return;
  }
  // the new goal joins the draft; goals the player staged but has not
  // planned yet are kept, never silently dropped
  if (!draftTargets.includes(name)) draftTargets = [...draftTargets, name];
  void persist('plan');
  emit();
}

/** Change of mind: drop a goal and reshape the plan (a plan keeps at least
 * one goal). Ticked steps that remain keep their ticks. */
export function removePlanTarget(name: string): void {
  if (!state.plan || !state.plan.targets.includes(name)) return;
  const targets = state.plan.targets.filter((t) => t !== name);
  if (!targets.length) return;
  const roster = state.plan.roster ?? Object.keys(state.box);
  try {
    const derivs = derivations(engine, new Set(roster));
    const { steps, unreachable } = planFor(engine, roster, targets, derivs);
    const advice = helperAdvice(
      engine, Object.keys(state.box), ownedAny, { targets, steps, roster }, derivs);
    state.plan = {
      ...state.plan, targets, steps, unreachable, advice,
      adviceVersion: ADVICE_VERSION,
      planned: new Date().toISOString(), roster,
    };
  } catch (e) {
    console.error('removePlanTarget failed:', e);
    return;
  }
  draftTargets = draftTargets.filter((t) => t !== name);
  void persist('plan');
  emit();
}

export function uncheckStep(sid: string, child: string): void {
  const c = (state.checks as Record<string, unknown>)[sid];
  const nextChecks = { ...state.checks };
  delete (nextChecks as Record<string, unknown>)[sid];
  state.checks = nextChecks;
  if (c && typeof c === 'object') {
    // remove only what the tick contributed
    const sc = c as StepCheck;
    const cur = state.box[child];
    if (cur) {
      const left = afterUntick(cur, sc);
      const nextBox = { ...state.box };
      if (!left) delete nextBox[child];
      else nextBox[child] = left;
      state.box = nextBox;
    }
  }
  void persist('checks');
  void persist('box');
  emit();
}
