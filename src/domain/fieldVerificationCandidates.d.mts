export const FIELD_CHECK_MAXIMUM_DISTANCE_METERS: 350;
export const DETOUR_ACCESS_LOWER_BOUND_FACTOR: 1;
export const MIN_DETOUR_ADJUSTED_IMPROVEMENT_METERS: 30;
export const MIN_DETOUR_ADJUSTED_IMPROVEMENT_RATIO: 0.025;

export type FacilityAccessCategory =
  | "public_outdoor_space"
  | "public_service_facility"
  | "official_public_access"
  | "commercial_facility"
  | "private_hospitality"
  | "restricted_or_sensitive"
  | "uncertain_facility";
export type FieldCheckRouteSet = "dynamic_snapshot" | "fixed_demo";
export type FieldCheckRoute = {
  id: string;
  profile?: "standard" | "step_avoiding" | "wheelchair_profile";
  distanceMeters: number;
  coordinates: [number, number][];
};
export type FieldCheckCandidate = {
  id: string; name: string; latitude: number; longitude: number; address: string | null;
  category: string; confidence: string;
  source: { sourceDatasetId?: string; sourceRecordId?: string };
};
export type FieldVerificationRouteMetric = {
  routeId: string;
  routeKey: string;
  routeSet: FieldCheckRouteSet;
  profile: "standard" | "step_avoiding" | "wheelchair_profile" | null;
  routeDistanceMeters: number;
  distanceToRouteMeters: number;
  geometryProgressMeters: number;
  routeProgressMeters: number;
  nearestPointCoordinate: [number, number];
  currentLongestGapMeters: number;
  expectedImprovedGapMeters: number;
  expectedImprovementMeters: number;
  expectedImprovementRatio: number;
  grossImprovementMeters: number;
  grossImprovementRatio: number;
  estimatedDetourLowerBoundMeters: number;
  detourAdjustedImprovementMeters: number;
  detourAdjustedImprovementRatio: number;
  suggestedInsertionProgressMeters: number;
  suggestedInsertionCoordinate: [number, number];
  distanceToSuggestedInsertionMeters: number;
  insideLargestGap: boolean;
  contributesToRanking: boolean;
};
export type FieldVerificationCandidate = {
  fieldCheckPriority: number;
  candidateId: string;
  verificationId: string;
  name: string;
  latitude: number;
  longitude: number;
  address: string | null;
  categories: string[];
  facilityAccessCategory: FacilityAccessCategory;
  facilityAccessCategoryLabel: string;
  accessPrior: number;
  categoryPenalty: number;
  categoryReasonCodes: string[];
  categoryReasons: string[];
  requiresSpecialCaution: boolean;
  specialCautions: string[];
  officialSourceQuality: "high" | "medium" | "basic";
  officialSourceQualityScore: number;
  dynamicRouteIds: Array<"standard" | "step_avoiding" | "wheelchair_profile">;
  fixedDemoRouteIds: string[];
  routeIds: string[];
  primaryRouteId: "standard" | "step_avoiding" | "wheelchair_profile";
  primaryRouteKey: string;
  numberOfCoveredRoutes: number;
  distanceToRouteMeters: number;
  estimatedDetourLowerBoundMeters: number;
  routeProgressMeters: number;
  nearestPointCoordinate: [number, number];
  theoreticalInsertionCoordinate: [number, number];
  currentLongestGapMeters: number;
  expectedImprovedGapMeters: number;
  expectedImprovementMeters: number;
  expectedImprovementRatio: number;
  grossImprovementMeters: number;
  grossImprovementRatio: number;
  detourAdjustedImprovementMeters: number;
  detourAdjustedImprovementRatio: number;
  distanceToSuggestedInsertionMeters: number;
  rankingScore: number;
  rankingScoreBreakdown: {
    improvementMetersPoints: number;
    improvementRatioPoints: number;
    routeProximityPoints: number;
    accessPriorPoints: number;
    coveredRoutesPoints: number;
    officialSourceQualityPoints: number;
    categoryPenalty: number;
    duplicateFacilityPenalty: number;
    total: number;
  };
  selectionReasonCodes: string[];
  selectionReasons: string[];
  officialSourceIds: string[];
  groupedCandidateIds: string[];
  duplicateFacilityHandling: {
    method: "name_or_address_within_25m";
    groupedRecordCount: number;
    countedPlaceCount: 1;
  };
  existingStrictOverlap: false;
  routeMetrics: FieldVerificationRouteMetric[];
  dynamicRouteMetrics: FieldVerificationRouteMetric[];
  fixedDemoRouteMetrics: FieldVerificationRouteMetric[];
};

export const FACILITY_ACCESS_POLICIES: Readonly<Record<FacilityAccessCategory, {
  label: string;
  accessPrior: number;
  categoryPenalty: number;
  requiresSpecialCaution: boolean;
  rankingEligible: boolean;
}>>;
export function fieldCandidateReasonLabel(code: string): string;
export function fieldCandidateCategoryReasonLabel(code: string): string;
export function fieldCandidateExclusionReasonLabel(code: string): string;
export function haversineMeters(a: [number, number], b: [number, number]): number;
export function projectCandidateToRoute(candidate: Pick<FieldCheckCandidate, "latitude" | "longitude">, route: FieldCheckRoute): {
  distanceToRouteMeters: number;
  geometryProgressMeters: number;
  geometryLengthMeters: number;
  routeProgressMeters: number;
  nearestPointCoordinate: [number, number];
  segmentIndex?: number;
};
export function coordinateAtRouteProgress(route: FieldCheckRoute, routeProgressMeters: number): [number, number];
export function classifyFacilityAccess(candidateOrGroup: FieldCheckCandidate | FieldCheckCandidate[]): {
  facilityAccessCategory: FacilityAccessCategory;
  facilityAccessCategoryLabel: string;
  accessPrior: number;
  categoryPenalty: number;
  categoryReasonCodes: string[];
  categoryReasons: string[];
  requiresSpecialCaution: boolean;
  rankingEligible: boolean;
};
export function estimateDetourLowerBoundMeters(distanceToRouteMeters: number): number;
export function deriveDetourAdjustedImprovement(options: {
  currentLongestGapMeters: number;
  grossImprovementMeters: number;
  distanceToRouteMeters: number;
}): {
  estimatedDetourLowerBoundMeters: number;
  detourAdjustedImprovementMeters: number;
  detourAdjustedImprovementRatio: number;
};
export function extractFieldVerificationCandidates(options: {
  routes?: FieldCheckRoute[];
  dynamicRoutes?: FieldCheckRoute[];
  fixedDemoRoutes?: FieldCheckRoute[];
  candidates: FieldCheckCandidate[];
  limit?: number;
  maximumDistanceMeters?: number;
}): {
  eligibleGroupCount: number;
  rankedCandidateCount: number;
  preRankingGroupCount: number;
  coordinateConflictGroupCount: number;
  excludedCoordinateConflictCandidateCount: number;
  excludedCoordinateConflictPlaceCount: number;
  exclusionReasonCounts: Record<string, number>;
  exclusions: Array<{
    candidateId: string;
    name: string;
    groupedCandidateIds: string[];
    reasonCode: string;
    reason: string;
  }>;
  candidates: FieldVerificationCandidate[];
};
