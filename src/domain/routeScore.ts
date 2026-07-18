import type { ContinuityMetrics, DemoRoute, EvaluatedRoute, RoutePreferences, WalkingSegment } from "../types";

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

export function evaluateRoute(route: DemoRoute, preferences: RoutePreferences): EvaluatedRoute {
  const continuity = deriveContinuityMetrics(route.walkingSegments, preferences.maxContinuousWalkingMinutes);
  const violations = {
    continuous: !continuity.continuityFeasible,
    toilet: preferences.requireToilet && !route.toiletAvailable,
    slope: preferences.avoidSteepSlopes && route.steepSlopeCount > 0,
    indoor: preferences.preferIndoorRest && route.indoorRestCount === 0,
  };
  const score = route.durationMinutes * SCORE_WEIGHTS.minute + continuity.continuousWalkingExcessMinutes * SCORE_WEIGHTS.continuousMinuteOver
    + (violations.toilet ? SCORE_WEIGHTS.missingToilet : 0) + (preferences.avoidSteepSlopes ? route.steepSlopeCount * SCORE_WEIGHTS.steepSlope : 0)
    + (violations.indoor ? SCORE_WEIGHTS.missingIndoorRest : 0);
  const reasons = [
    route.restSpotIds.length ? `休憩候補を${route.restSpotIds.length}か所経由` : "休憩候補の経由なし",
    route.toiletAvailable ? "途中にトイレ候補あり" : "途中のトイレ候補なし",
    route.steepSlopeCount === 0 ? "デモデータ上の急坂なし" : `デモデータ上の急坂候補${route.steepSlopeCount}か所`,
    route.indoorRestCount ? "屋内休憩候補あり" : "屋内休憩候補なし",
    violations.continuous ? `希望の連続歩行時間を${continuity.continuousWalkingExcessMinutes}分超過` : "希望の連続歩行時間内",
  ];
  return { ...route, ...continuity, continuousWalkingLimitMinutes: preferences.maxContinuousWalkingMinutes, score, reasons, meetsPreferences: !Object.values(violations).some(Boolean) };
}

export const selectRecommendedRoute = (routes: DemoRoute[], preferences: RoutePreferences) =>
  routes.map((route) => evaluateRoute(route, preferences)).sort((a, b) => a.score - b.score);
