import type { EvaluatedRoute, WalkingSegment } from "../types";

export type RestContinuityClassification =
  | "WHOLE_ROUTE_WITHIN_LIMIT_WITHOUT_STRICT_REST"
  | "STRICT_REST_POINTS_MAKE_ROUTE_FEASIBLE"
  | "NO_STRICT_REST_AND_OVER_LIMIT"
  | "STRICT_REST_POINTS_PRESENT_BUT_STILL_OVER_LIMIT";

export type RestContinuityPresentation = {
  classification: RestContinuityClassification;
  strictIntermediateRestPointCount: number;
  continuityWithinLimit: boolean;
  statusLabel: "経路全体が設定内" | "すべて設定内" | "設定超過区間あり";
  metricLabel: "連続して歩く時間" | "確認できた休憩地点を含む歩行区間";
  continuousWalkingMinutes: number;
  description: string;
  displayLongestRestGapMeters: number;
  longestRestGapExplanation: string | null;
};

const roundMinutes = (value: number) => {
  const rounded = Math.round((value + Number.EPSILON) * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
};

function usedStrictIntermediateRestPointCount(
  walkingSegments: readonly WalkingSegment[],
  strictCandidateCount: number,
): number {
  const splitPoints = walkingSegments.slice(0, -1).filter((segment, index) => (
    segment.endsAtRestSpot
    && segment.restSpotId !== null
    && segment.distanceMeters > 0
    && walkingSegments[index + 1].distanceMeters > 0
  )).length;
  return Math.min(strictCandidateCount, splitPoints);
}

export function classifyRestContinuity(
  route: Pick<
    EvaluatedRoute,
    | "walkingSegments"
    | "confirmedRestSpotCount"
    | "supportedRestSpotCount"
    | "durationMinutes"
    | "durationSeconds"
    | "continuousWalkingLimitMinutes"
    | "maxContinuousWalkingMinutes"
    | "distanceMeters"
    | "longestRestGapMeters"
  >,
): RestContinuityPresentation {
  const strictIntermediateRestPointCount = usedStrictIntermediateRestPointCount(
    route.walkingSegments,
    route.confirmedRestSpotCount + route.supportedRestSpotCount,
  );
  const limit = route.continuousWalkingLimitMinutes;
  const wholeRouteMinutes = route.durationSeconds === undefined
    ? route.durationMinutes
    : route.durationSeconds / 60;
  const hasStrictSplit = strictIntermediateRestPointCount > 0;
  const continuousWalkingMinutes = hasStrictSplit
    ? route.maxContinuousWalkingMinutes
    : wholeRouteMinutes;
  const withinLimit = continuousWalkingMinutes <= limit;
  const minuteText = roundMinutes(continuousWalkingMinutes);
  const excessText = roundMinutes(Math.max(0, continuousWalkingMinutes - limit));

  if (!hasStrictSplit && withinLimit) {
    return {
      classification: "WHOLE_ROUTE_WITHIN_LIMIT_WITHOUT_STRICT_REST",
      strictIntermediateRestPointCount,
      continuityWithinLimit: true,
      statusLabel: "経路全体が設定内",
      metricLabel: "連続して歩く時間",
      continuousWalkingMinutes,
      description: `途中の休憩を前提とせず、経路全体の推定${minuteText}分が設定${limit}分以内となる計算です。`,
      displayLongestRestGapMeters: route.distanceMeters,
      longestRestGapExplanation: "途中で厳格に確認できた休憩地点がないため、経路全体を空白区間として計算しています。",
    };
  }

  if (hasStrictSplit && withinLimit) {
    return {
      classification: "STRICT_REST_POINTS_MAKE_ROUTE_FEASIBLE",
      strictIntermediateRestPointCount,
      continuityWithinLimit: true,
      statusLabel: "すべて設定内",
      metricLabel: "確認できた休憩地点を含む歩行区間",
      continuousWalkingMinutes,
      description: `厳格に確認できた休憩地点${strictIntermediateRestPointCount}地点で区切ると、最長の歩行区間は推定${minuteText}分で、すべて設定${limit}分以内となる計算です。`,
      displayLongestRestGapMeters: route.longestRestGapMeters,
      longestRestGapExplanation: null,
    };
  }

  if (!hasStrictSplit) {
    return {
      classification: "NO_STRICT_REST_AND_OVER_LIMIT",
      strictIntermediateRestPointCount,
      continuityWithinLimit: false,
      statusLabel: "設定超過区間あり",
      metricLabel: "連続して歩く時間",
      continuousWalkingMinutes,
      description: `途中で厳格に確認できた休憩地点がなく、経路全体の推定${minuteText}分は設定${limit}分を${excessText}分超えます。`,
      displayLongestRestGapMeters: route.distanceMeters,
      longestRestGapExplanation: "途中で厳格に確認できた休憩地点がないため、経路全体を空白区間として計算しています。",
    };
  }

  return {
    classification: "STRICT_REST_POINTS_PRESENT_BUT_STILL_OVER_LIMIT",
    strictIntermediateRestPointCount,
    continuityWithinLimit: false,
    statusLabel: "設定超過区間あり",
    metricLabel: "連続して歩く時間",
    continuousWalkingMinutes,
    description: `厳格に確認できた休憩地点を含めても、最長の歩行区間は推定${minuteText}分で、設定${limit}分を${excessText}分超えます。`,
    displayLongestRestGapMeters: route.longestRestGapMeters,
    longestRestGapExplanation: null,
  };
}
