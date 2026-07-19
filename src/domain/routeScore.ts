import type { ContinuityMetrics, DemoRoute, EvaluatedRoute, RestCandidate, RoutePreferences, WalkingSegment } from "../types";
import type { OfficialToiletPlace } from "../types";
import { findOfficialToiletPlacesNearRoute, nearestOfficialToiletPlaceDistanceMeters, polylineLengthMeters, sliceRouteByProgress, sortToiletPlacesByRouteProgress } from "./geo";
import type { Coordinate } from "./geo";
import type { PublicToiletGapSegment } from "../types";
import { evaluateRestNetwork } from "./restNetwork";

export const SCORE_WEIGHTS = { minute: 1, continuousMinuteOver: 12, missingToilet: 120, steepSlope: 35, missingIndoorRest: 45 } as const;

export function deriveContinuityMetrics(
  walkingSegments: WalkingSegment[],
  maxContinuousWalkingMinutes: number,
): ContinuityMetrics {
  const routeMaxContinuousWalkingMinutes = Math.max(0, ...walkingSegments.map((segment) => segment.walkingMinutes));
  const longestRestGapMeters = Math.max(0, ...walkingSegments.map((segment) => segment.distanceMeters));
  const continuousWalkingExcessMinutes = Math.max(0, routeMaxContinuousWalkingMinutes - maxContinuousWalkingMinutes);

  return {
    continuityFeasible: continuousWalkingExcessMinutes === 0,
    maxContinuousWalkingMinutes: routeMaxContinuousWalkingMinutes,
    longestRestGapMeters,
    continuousWalkingExcessMinutes,
  };
}

export const PUBLIC_TOILET_QUALIFYING_DISTANCE_METERS = 250;

export function derivePublicToiletGapMetrics(route: Coordinate[], publicToiletPlaces: OfficialToiletPlace[], configuredRouteLengthMeters = polylineLengthMeters(route)) {
  const geometryLengthMeters = polylineLengthMeters(route);
  const routeLengthMeters = configuredRouteLengthMeters;
  const toRouteProgress = (geometryProgress: number) => geometryLengthMeters === 0 ? 0 : geometryProgress / geometryLengthMeters * routeLengthMeters;
  const geometryProgressPoints = sortToiletPlacesByRouteProgress(publicToiletPlaces, route).map(({ projection }) => projection.routeProgressMeters);
  const geometryBoundaries = [0, ...geometryProgressPoints, geometryLengthMeters].sort((a, b) => a - b);
  const publicToiletGapSegments: PublicToiletGapSegment[] = geometryBoundaries.slice(1).map((endGeometry, index) => {
    const startGeometry = geometryBoundaries[index];
    const startProgress = toRouteProgress(startGeometry); const endProgress = toRouteProgress(endGeometry);
    return { startProgressMeters: startProgress, endProgressMeters: endProgress, gapMeters: endProgress - startProgress, startGeometryProgressMeters: startGeometry, endGeometryProgressMeters: endGeometry, geometryGapMeters: endGeometry - startGeometry, coordinates: sliceRouteByProgress(route, startGeometry, endGeometry) };
  });
  const emptyGap: PublicToiletGapSegment = { startProgressMeters: 0, endProgressMeters: 0, gapMeters: 0, startGeometryProgressMeters: 0, endGeometryProgressMeters: 0, geometryGapMeters: 0, coordinates: [] };
  const largestGap = publicToiletGapSegments.reduce((largest, gap) => gap.gapMeters > largest.gapMeters ? gap : largest, publicToiletGapSegments[0] ?? emptyGap);
  return { geometryLengthMeters, routeLengthMeters, longestPublicToiletGapMeters: largestGap.gapMeters, publicToiletGapSegments, largestGapStartProgressMeters: largestGap.startProgressMeters, largestGapEndProgressMeters: largestGap.endProgressMeters, largestGapStartGeometryProgressMeters: largestGap.startGeometryProgressMeters, largestGapEndGeometryProgressMeters: largestGap.endGeometryProgressMeters, longestPublicToiletGeometryGapMeters: largestGap.geometryGapMeters };
}

export function evaluateRoute(route: DemoRoute, preferences: RoutePreferences, officialToiletPlaces: OfficialToiletPlace[] = [], restCandidates: RestCandidate[] = []): EvaluatedRoute {
  const continuity = deriveContinuityMetrics(route.walkingSegments, preferences.maxContinuousWalkingMinutes);
  const nearbyOfficialToiletPlaces = findOfficialToiletPlacesNearRoute(officialToiletPlaces, route.coordinates, PUBLIC_TOILET_QUALIFYING_DISTANCE_METERS, Number.POSITIVE_INFINITY);
  const publicToiletPlaces = nearbyOfficialToiletPlaces.filter((place) => place.kinds.includes("public_toilet"));
  const facilityToiletPlaces = nearbyOfficialToiletPlaces.filter((place) => place.kinds.includes("facility_toilet_information"));
  const stationToiletPlaces = nearbyOfficialToiletPlaces.filter((place) => place.kinds.includes("station_toilet_information"));
  const nearestPublicToiletDistance = nearestOfficialToiletPlaceDistanceMeters(officialToiletPlaces.filter((place) => place.kinds.includes("public_toilet")), route.coordinates);
  const nearestAnyOfficialDistance = nearestOfficialToiletPlaceDistanceMeters(officialToiletPlaces, route.coordinates);
  const hasPublicToiletCandidate = publicToiletPlaces.length > 0;
  const gapMetrics = derivePublicToiletGapMetrics(route.coordinates, publicToiletPlaces, route.distanceMeters);
  const restNetwork = evaluateRestNetwork(route, restCandidates, preferences.maxContinuousWalkingMinutes, continuity.continuityFeasible);
  const violations = {
    continuous: !continuity.continuityFeasible,
    toilet: preferences.requireToilet && !hasPublicToiletCandidate,
    slope: preferences.avoidSteepSlopes && route.steepSlopeCount > 0,
    indoor: preferences.preferIndoorRest && route.indoorRestCount === 0,
  };
  const scoreBreakdown = {
    duration: route.durationMinutes * SCORE_WEIGHTS.minute,
    continuousWalkingExcess: continuity.continuousWalkingExcessMinutes * SCORE_WEIGHTS.continuousMinuteOver,
    missingPublicToilet: violations.toilet ? SCORE_WEIGHTS.missingToilet : 0,
    steepSlope: preferences.avoidSteepSlopes ? route.steepSlopeCount * SCORE_WEIGHTS.steepSlope : 0,
    missingIndoorRest: violations.indoor ? SCORE_WEIGHTS.missingIndoorRest : 0,
    total: 0,
  };
  const score = scoreBreakdown.duration + scoreBreakdown.continuousWalkingExcess + scoreBreakdown.missingPublicToilet + scoreBreakdown.steepSlope + scoreBreakdown.missingIndoorRest;
  scoreBreakdown.total = score;
  const reasons = [
    route.restSpotIds.length ? `休憩候補を${route.restSpotIds.length}か所経由` : "休憩候補の経由なし",
    hasPublicToiletCandidate ? `ルートから推定直線距離${PUBLIC_TOILET_QUALIFYING_DISTANCE_METERS}m以内に公衆トイレ候補${publicToiletPlaces.length}地点` : `ルートから推定直線距離${PUBLIC_TOILET_QUALIFYING_DISTANCE_METERS}m以内に公衆トイレ候補なし`,
    route.steepSlopeCount === 0 ? "デモデータ上の急坂なし" : `デモデータ上の急坂候補${route.steepSlopeCount}か所`,
    route.indoorRestCount ? "屋内休憩候補あり" : "屋内休憩候補なし",
    violations.continuous ? `希望の連続歩行時間を${continuity.continuousWalkingExcessMinutes}分超過` : "希望の連続歩行時間内",
  ];
  return {
    ...route, ...continuity, ...restNetwork, ...(restNetwork.strictRestCandidateCount === 0 ? { longestRestGapMeters: continuity.longestRestGapMeters } : {}), continuousWalkingLimitMinutes: preferences.maxContinuousWalkingMinutes, score, scoreBreakdown, preferenceViolationCount: Object.values(violations).filter(Boolean).length, reasons,
    meetsPreferences: !Object.values(violations).some(Boolean),
    officialToiletRecordCount: nearbyOfficialToiletPlaces.reduce((sum, place) => sum + place.sourceRecordCount, 0),
    officialToiletPlaceCount: nearbyOfficialToiletPlaces.length,
    publicToiletPlaceCount: publicToiletPlaces.length,
    facilityToiletInformationPlaceCount: facilityToiletPlaces.length,
    stationToiletInformationPlaceCount: stationToiletPlaces.length,
    nearestPublicToiletDistanceMeters: nearestPublicToiletDistance === null ? null : Math.round(nearestPublicToiletDistance),
    nearestAnyOfficialToiletInformationDistanceMeters: nearestAnyOfficialDistance === null ? null : Math.round(nearestAnyOfficialDistance),
    hasPublicToiletCandidate,
    hasAnyOfficialToiletInformation: nearbyOfficialToiletPlaces.length > 0,
    ...gapMetrics,
    toiletDataSource: nearbyOfficialToiletPlaces.length ? [...new Set(nearbyOfficialToiletPlaces.flatMap((place) => place.records.map((record) => record.source.provider)))].join("・") : "新宿区・東京都福祉局公式オープンデータ",
  };
}

const durationSeconds = (route: EvaluatedRoute) => route.durationSeconds ?? route.durationMinutes * 60;

export function compareEvaluatedRoutes(a: EvaluatedRoute, b: EvaluatedRoute) {
  return a.score - b.score
    || Number(b.meetsPreferences) - Number(a.meetsPreferences)
    || a.preferenceViolationCount - b.preferenceViolationCount
    || a.maxContinuousWalkingMinutes - b.maxContinuousWalkingMinutes
    || a.longestRestGapMeters - b.longestRestGapMeters
    || durationSeconds(a) - durationSeconds(b)
    || a.distanceMeters - b.distanceMeters
    || a.id.localeCompare(b.id);
}

export const selectRecommendedRoute = (routes: DemoRoute[], preferences: RoutePreferences, officialToiletPlaces: OfficialToiletPlace[] = [], restCandidates: RestCandidate[] = []) =>
  routes.map((route) => evaluateRoute(route, preferences, officialToiletPlaces, restCandidates)).sort(compareEvaluatedRoutes);
