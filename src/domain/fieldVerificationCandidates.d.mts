export type FieldCheckRoute = { id: string; distanceMeters: number; coordinates: [number, number][] };
export type FieldCheckCandidate = {
  id: string; name: string; latitude: number; longitude: number; address: string | null;
  category: string; confidence: string;
  source: { sourceDatasetId?: string; sourceRecordId?: string };
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
  routeIds: string[];
  primaryRouteId: string;
  distanceToRouteMeters: number;
  routeProgressMeters: number;
  currentLongestGapMeters: number;
  expectedImprovedGapMeters: number;
  expectedImprovementMeters: number;
  expectedImprovementRatio: number;
  distanceToSuggestedInsertionMeters: number;
  selectionReasons: string[];
  officialSourceIds: string[];
  groupedCandidateIds: string[];
  routeMetrics: Array<{
    routeId: string;
    distanceToRouteMeters: number;
    routeProgressMeters: number;
    currentLongestGapMeters: number;
    expectedImprovedGapMeters: number;
    expectedImprovementMeters: number;
    expectedImprovementRatio: number;
    distanceToSuggestedInsertionMeters: number;
    insideLargestGap: boolean;
  }>;
};
export function haversineMeters(a: [number, number], b: [number, number]): number;
export function projectCandidateToRoute(candidate: Pick<FieldCheckCandidate, "latitude" | "longitude">, route: FieldCheckRoute): {
  distanceToRouteMeters: number; geometryProgressMeters: number; geometryLengthMeters: number; routeProgressMeters: number;
};
export function extractFieldVerificationCandidates(options: {
  routes: FieldCheckRoute[]; candidates: FieldCheckCandidate[]; limit?: number; maximumDistanceMeters?: number;
}): {
  eligibleGroupCount: number;
  coordinateConflictGroupCount: number;
  excludedCoordinateConflictCandidateCount: number;
  excludedCoordinateConflictPlaceCount: number;
  candidates: FieldVerificationCandidate[];
};
