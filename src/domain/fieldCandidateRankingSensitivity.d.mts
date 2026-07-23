export type FieldCandidateWeightScenario = {
  id: string;
  variedWeight: string | null;
  multiplier: number;
  weights: Record<string, number>;
};

export type FieldCandidateRankingAnalysis = {
  configuration: Record<string, unknown>;
  weightScenarios: FieldCandidateWeightScenario[];
  rankings: Array<Record<string, unknown>>;
  candidates: Array<Record<string, unknown>>;
  paretoCandidateIds: string[];
};

export const FIELD_CANDIDATE_TOP_RANK_LIMIT: number;
export const FIELD_CANDIDATE_WEIGHT_VARIATION_RATIO: number;
export const FIELD_CANDIDATE_MEANINGFUL_IMPROVEMENT_METERS: number;
export const FIELD_CANDIDATE_MEANINGFUL_IMPROVEMENT_RATIO: number;
export const FIELD_CANDIDATE_MARGINAL_UPPER_METERS: number;
export const FIELD_CANDIDATE_MARGINAL_UPPER_RATIO: number;
export const FIELD_VISIT_SHORTLIST_SIZE: number;
export const FIELD_VISIT_ROBUST_TARGET: number;
export const FIELD_VISIT_CLEAR_PUBLIC_MINIMUM: number;
export const FIELD_VISIT_PRIVATE_HOSPITALITY_MAXIMUM: number;
export const BASELINE_FIELD_CANDIDATE_RANKING_WEIGHTS: Readonly<Record<string, number>>;
export const FIELD_CANDIDATE_SENSITIVITY_WEIGHT_KEYS: readonly string[];
export const FIELD_CANDIDATE_DETOUR_SCENARIOS: readonly Record<string, unknown>[];

export function deriveFieldCandidateDetourScenarios(candidate: Record<string, unknown>): Record<string, unknown>;
export function generateFieldCandidateWeightScenarios(): FieldCandidateWeightScenario[];
export function findParetoNonDominatedCandidateIds(candidates: Array<Record<string, unknown>>): string[];
export function analyzeFieldCandidateRankingSensitivity(
  candidates: readonly Record<string, unknown>[],
): FieldCandidateRankingAnalysis;
export function deriveFieldVisitShortlist(
  analysis: FieldCandidateRankingAnalysis,
  limit?: number,
): { configuration: Record<string, unknown>; candidates: Array<Record<string, unknown>> };
export function fieldCandidateRankingSensitivityCsv(analysis: FieldCandidateRankingAnalysis): string;
export function fieldVisitShortlistCsv(
  shortlist: { configuration: Record<string, unknown>; candidates: Array<Record<string, unknown>> },
): string;
