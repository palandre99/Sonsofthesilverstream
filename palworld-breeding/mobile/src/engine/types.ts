/** Core data shapes for the HatchLab breeding engine. */

export interface BreedingData {
  game_version: string;
  extracted: string;
  combi_ranks: Record<string, number>;
  unique_combos: { parents: [string, string]; child: string }[];
  gendered_combos: { mother: string; father: string; child: string }[];
  self_breed_only: string[];
  excluded_from_generic_pool: string[];
}

export type ChildKind = 'self' | 'unique' | 'gendered' | 'generic';

export interface ChildResult {
  species: string;
  kind: ChildKind;
  /** true when the generic result sits on an exact rank tie */
  tieBreak: boolean;
  /** rank distance to the runner-up candidate (generic only) */
  margin: number | null;
  /** e.g. "female Katress + male Wixen" for the gendered pair */
  genderNote: string | null;
}

export interface PlanStep {
  wave: number;
  parents: [string, string];
  child: string;
  kind: ChildKind;
  tieBreak: boolean;
  margin: number | null;
  genderNote: string | null;
  isTarget: boolean;
  neededBy: string[];
  reusedAsParent: number;
}
