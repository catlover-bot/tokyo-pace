import { distancePointToRouteMeters, haversineDistanceMeters, polylineLengthMeters, projectPointToRoute, sliceRouteByProgress } from "./geo";
import type { Coordinate } from "./geo";
import type { DemoRoute, GapSegment, RestCandidate, RestConfidence, RestInsertionSuggestion } from "../types";

export const REST_CANDIDATE_DISTANCE_METERS = 350;

export function deriveRestConfidence(candidate: Pick<RestCandidate, "category" | "seating" | "indoor" | "drinkingWaterAvailable" | "source">): RestConfidence {
  if (candidate.category === "estimated_rest_spot") return "estimated";
  // Official attributes or a date alone are not enough to prove that a person can
  // enter and sit down. Field verification promotion is handled by the stricter
  // pure rules in fieldVerification.mjs.
  return "possible";
}

export function sortCandidatesByRouteProgress(candidates: RestCandidate[], route: DemoRoute) {
  const geometryLength = polylineLengthMeters(route.coordinates);
  return candidates.map((candidate) => {
    const projection = projectPointToRoute([candidate.latitude, candidate.longitude], route.coordinates);
    return { candidate, projection, routeProgressMeters: geometryLength ? projection.routeProgressMeters / geometryLength * route.distanceMeters : 0 };
  }).sort((a, b) => a.routeProgressMeters - b.routeProgressMeters || a.candidate.id.localeCompare(b.candidate.id));
}

export function deriveCandidateGaps(route: DemoRoute, candidates: RestCandidate[]): { longestGapMeters: number; segments: GapSegment[] } {
  const geometryLength = polylineLengthMeters(route.coordinates);
  const sorted = sortCandidatesByRouteProgress(candidates, route);
  const boundaries = [0, ...sorted.map((item) => item.routeProgressMeters), route.distanceMeters];
  const geometryBoundaries = [0, ...sorted.map((item) => item.projection.routeProgressMeters), geometryLength];
  const segments = boundaries.slice(1).map((end, index) => ({
    startProgressMeters: boundaries[index], endProgressMeters: end, gapMeters: end - boundaries[index],
    coordinates: sliceRouteByProgress(route.coordinates, geometryBoundaries[index], geometryBoundaries[index + 1]),
  }));
  return { longestGapMeters: Math.max(0, ...segments.map((segment) => segment.gapMeters)), segments };
}

function coordinateAtRouteProgress(route: DemoRoute, routeProgress: number): Coordinate {
  const geometryTarget = route.distanceMeters ? routeProgress / route.distanceMeters * polylineLengthMeters(route.coordinates) : 0;
  let progress = 0;
  for (let index = 0; index < route.coordinates.length - 1; index += 1) {
    const start = route.coordinates[index]; const end = route.coordinates[index + 1]; const length = haversineDistanceMeters(start, end);
    if (progress + length >= geometryTarget) { const ratio = length ? (geometryTarget - progress) / length : 0; return [start[0] + (end[0] - start[0]) * ratio, start[1] + (end[1] - start[1]) * ratio]; }
    progress += length;
  }
  return route.coordinates.at(-1) ?? [0, 0];
}

export function suggestRestInsertion(route: DemoRoute, segments: GapSegment[]): RestInsertionSuggestion {
  const ordered = [...segments].sort((a, b) => b.gapMeters - a.gapMeters || a.startProgressMeters - b.startProgressMeters);
  const largest = ordered[0] ?? { startProgressMeters: 0, endProgressMeters: route.distanceMeters, gapMeters: route.distanceMeters };
  const insertion = (largest.startProgressMeters + largest.endProgressMeters) / 2;
  const improved = Math.max(largest.gapMeters / 2, ordered[1]?.gapMeters ?? 0);
  const improvement = largest.gapMeters - improved;
  return { suggestedRestInsertionProgressMeters: insertion, suggestedRestInsertionCoordinate: coordinateAtRouteProgress(route, insertion), currentLongestRestGapMeters: largest.gapMeters, improvedLongestRestGapMeters: improved, improvementMeters: improvement, improvementRatio: largest.gapMeters ? improvement / largest.gapMeters : 0 };
}

const isStrictRest = (candidate: RestCandidate) => candidate.category !== "drinking_station" && (candidate.confidence === "confirmed" || candidate.confidence === "supported");
const isPossibleRestReference = (candidate: RestCandidate) => candidate.category !== "drinking_station" && candidate.confidence === "possible";
const isFieldVerified = (candidate: RestCandidate) => Boolean(candidate.fieldVerificationId || candidate.source.fieldVerifiedAt);
const totalWalkingMinutes = (route: DemoRoute) => route.durationSeconds === undefined ? route.durationMinutes : route.durationSeconds / 60;

function buildNetworkSnapshot(route: DemoRoute, strictCandidates: RestCandidate[], walkingLimitMinutes: number) {
  const gaps = deriveCandidateGaps(route, strictCandidates);
  const longestUncoveredWalkingMinutes = route.distanceMeters ? gaps.longestGapMeters / route.distanceMeters * totalWalkingMinutes(route) : 0;
  const continuityFeasibleByRestNetwork = longestUncoveredWalkingMinutes <= walkingLimitMinutes;
  return {
    strictRestCandidateCount: strictCandidates.length,
    maxContinuousWalkingMinutes: longestUncoveredWalkingMinutes,
    longestRestGapMeters: gaps.longestGapMeters,
    continuityFeasibleByRestNetwork,
    longestUncoveredWalkingMinutes,
    restNetworkCoverageRatio: route.distanceMeters ? Math.max(0, 1 - gaps.longestGapMeters / route.distanceMeters) : 0,
    continuityFailureReason: continuityFeasibleByRestNetwork ? null : strictCandidates.length
      ? `現地確認の根拠がある休憩候補を含めても最長${Math.ceil(longestUncoveredWalkingMinutes)}分の空白があります`
      : `現地確認の根拠がある途中の休憩候補がなく、経路全体で最長${Math.ceil(longestUncoveredWalkingMinutes)}分歩く計算です`,
    restInsertionSuggestion: suggestRestInsertion(route, gaps.segments),
  };
}

export function evaluateRestNetwork(route: DemoRoute, candidates: RestCandidate[], walkingLimitMinutes: number, segmentFeasible: boolean) {
  const nearby = candidates.filter((candidate) => distancePointToRouteMeters([candidate.latitude, candidate.longitude], route.coordinates) <= REST_CANDIDATE_DISTANCE_METERS);
  const strictRest = nearby.filter(isStrictRest); const water = nearby.filter((candidate) => candidate.drinkingWaterAvailable === true);
  const indoor = nearby.filter((candidate) => candidate.indoor === true);
  const restGaps = deriveCandidateGaps(route, strictRest); const waterGaps = deriveCandidateGaps(route, water); const indoorGaps = deriveCandidateGaps(route, indoor);
  const confirmed = strictRest.filter((candidate) => candidate.confidence === "confirmed");
  const confirmedSnapshot = buildNetworkSnapshot(route, confirmed, walkingLimitMinutes);
  const afterSnapshot = buildNetworkSnapshot(route, strictRest, walkingLimitMinutes);
  const beforeStrict = strictRest.filter((candidate) => !isFieldVerified(candidate));
  const beforeSnapshot = buildNetworkSnapshot(route, beforeStrict, walkingLimitMinutes);
  const fieldImprovementMeters = Math.max(0, beforeSnapshot.longestRestGapMeters - afterSnapshot.longestRestGapMeters);
  const networkLevel = confirmed.length > 0 && confirmedSnapshot.continuityFeasibleByRestNetwork
    ? "confirmed" as const
    : strictRest.some((candidate) => candidate.confidence === "supported") && afterSnapshot.continuityFeasibleByRestNetwork
      ? "supported" as const
      : "none" as const;
  return {
    nearestRestCandidateDistanceMeters: strictRest.length ? Math.round(Math.min(...strictRest.map((candidate) => distancePointToRouteMeters([candidate.latitude, candidate.longitude], route.coordinates)))) : null,
    nearestDrinkingStationDistanceMeters: water.length ? Math.round(Math.min(...water.map((candidate) => distancePointToRouteMeters([candidate.latitude, candidate.longitude], route.coordinates)))) : null,
    longestRestGapMeters: restGaps.longestGapMeters, longestDrinkingWaterGapMeters: waterGaps.longestGapMeters, longestIndoorCandidateGapMeters: indoorGaps.longestGapMeters,
    restCandidateCount: strictRest.length, drinkingStationCount: water.length, indoorCandidateCount: indoor.length,
    confirmedRestSpotCount: confirmed.length, supportedRestSpotCount: strictRest.filter((x) => x.confidence === "supported").length, possibleRestSpotCount: nearby.filter(isPossibleRestReference).length,
    strictRestCandidateCount: strictRest.length,
    referencePossibleCandidateCount: nearby.filter(isPossibleRestReference).length,
    referenceEstimatedCandidateCount: nearby.filter((candidate) => candidate.confidence === "estimated").length,
    continuityFeasibleBySegment: segmentFeasible, continuityFeasibleByRestNetwork: afterSnapshot.continuityFeasibleByRestNetwork, longestUncoveredWalkingMinutes: afterSnapshot.longestUncoveredWalkingMinutes,
    restNetworkCoverageRatio: afterSnapshot.restNetworkCoverageRatio, restNetworkLevel: networkLevel,
    continuityFailureReason: afterSnapshot.continuityFailureReason,
    restGapSegments: restGaps.segments, drinkingWaterGapSegments: waterGaps.segments, indoorCandidateGapSegments: indoorGaps.segments,
    restInsertionSuggestion: suggestRestInsertion(route, restGaps.segments),
    fieldVerificationComparison: {
      hasFieldVerificationData: strictRest.some(isFieldVerified),
      before: beforeSnapshot,
      after: afterSnapshot,
      improvementMeters: fieldImprovementMeters,
      improvementRatio: beforeSnapshot.longestRestGapMeters ? fieldImprovementMeters / beforeSnapshot.longestRestGapMeters : 0,
    },
  };
}
