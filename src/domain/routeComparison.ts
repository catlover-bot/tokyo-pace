import type { EvaluatedRoute, RoutePreferences, RouteScoreBreakdown } from "../types";
import { compareEvaluatedRoutes } from "./routeScore";

export type RecommendationReasonCode =
  | "MEETS_ALL_REQUIRED_PREFERENCES" | "FEWER_CONSTRAINT_VIOLATIONS" | "SHORTEST_DISTANCE" | "FASTEST_DURATION"
  | "LOWEST_MAX_CONTINUOUS_WALK" | "LOWEST_REST_GAP" | "LOWEST_PUBLIC_TOILET_GAP" | "STEP_AVOIDING_PROFILE"
  | "PUBLIC_TOILET_CANDIDATES_NEAR_ROUTE" | "STRICT_REST_NETWORK_FEASIBLE" | "BETTER_CONTINUITY_THAN_STANDARD";
export type ExplanationCode = RecommendationReasonCode | "WHEELCHAIR_PROFILE" | "MAX_CONTINUOUS_WALK_EXCEEDED" | "PUBLIC_TOILET_REQUIRED_MISSING" | "STEEP_SLOPE_REQUIREMENT_NOT_MET" | "INDOOR_REST_REQUIREMENT_NOT_MET" | "STRICT_REST_NETWORK_NOT_FEASIBLE" | "LONGER_DISTANCE" | "LONGER_DURATION" | "LONGER_REST_GAP" | "SOURCE_WARNING";
export type ExplanationItem = { code: ExplanationCode; text: string };
export type VisualPattern = "solid" | "dashed" | "dotted";

export type RouteComparisonViewModel = {
  route: EvaluatedRoute;
  routeId: string; rank: number; isRecommended: boolean; isShortest: boolean; isFastest: boolean;
  profileLabel: string; routeName: string; providerLabel: "OpenRouteService" | "固定デモ"; isFallback: boolean;
  distanceMeters: number; durationMinutes: number; distanceDeltaMeters: number; durationDeltaMinutes: number;
  longestRestGapDeltaMeters: number; baselineLabel: string; distanceDeltaLabel: string; durationDeltaLabel: string; restGapDeltaLabel: string;
  maxContinuousWalkingMinutes: number; longestRestGapMeters: number; longestPublicToiletGapMeters: number;
  longestDrinkingWaterGapMeters: number; longestIndoorCandidateGapMeters: number; publicToiletPlaceCount: number;
  strictRestCandidateCount: number; possibleRestCandidateCount: number; drinkingStationCount: number;
  continuityFeasible: boolean; strictRestNetworkFeasible: boolean; meetsPreferences: boolean;
  recommendationReasons: ExplanationItem[]; advantages: ExplanationItem[]; tradeoffs: ExplanationItem[];
  constraintViolations: ExplanationItem[]; safetyWarnings: ExplanationItem[];
  score: number; scoreBreakdown: RouteScoreBreakdown; visualPattern: VisualPattern; sourceAttribution: string | null;
};

export type RouteComparisonResult = { baselineRouteId: string | null; recommendedRouteId: string | null; routes: RouteComparisonViewModel[] };

const durationSeconds = (route: EvaluatedRoute) => route.durationSeconds ?? route.durationMinutes * 60;
const isStrictRestNetworkFeasible = (route: EvaluatedRoute) => route.continuityFeasibleByRestNetwork && (route.restNetworkLevel === "confirmed" || route.restNetworkLevel === "supported");
const minimum = (routes: EvaluatedRoute[], value: (route: EvaluatedRoute) => number) => Math.min(...routes.map(value));
const tiedMinimum = (routes: EvaluatedRoute[], route: EvaluatedRoute, value: (item: EvaluatedRoute) => number) => value(route) === minimum(routes, value);

export function roundComparisonValue(value: number, digits = 0): number {
  const factor = 10 ** digits;
  const rounded = Math.sign(value) * Math.round((Math.abs(value) + Number.EPSILON) * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function formatComparisonDelta(value: number, unit: "m" | "分", subject: string, baselineLabel = "標準"): string {
  const digits = unit === "分" ? 1 : 0; const rounded = roundComparisonValue(value, digits);
  if (rounded === 0) return `${baselineLabel}と${subject}の差なし`;
  return `${baselineLabel}より${subject}が${Math.abs(rounded)}${unit}${rounded > 0 ? "長い" : "短い"}`;
}

export function selectComparisonBaseline(routes: readonly EvaluatedRoute[]): EvaluatedRoute | null {
  if (routes.length === 0) return null;
  const standard = [...routes].filter((route) => route.profile === "standard" || route.id === "standard").sort((a, b) => a.id.localeCompare(b.id))[0];
  return standard ?? [...routes].sort((a, b) => a.distanceMeters - b.distanceMeters || a.id.localeCompare(b.id))[0];
}

function profileLabel(route: EvaluatedRoute) {
  if (route.profile === "step_avoiding") return "階段を避けるよう要求した候補";
  if (route.profile === "wheelchair_profile") return "車いすプロファイルによる候補";
  if (route.provider === "openrouteservice") return "標準歩行候補";
  return route.id === "standard" ? "距離と時間を優先する固定デモ" : "休憩候補を優先する固定デモ";
}

function visualPattern(route: EvaluatedRoute): VisualPattern { return route.profile === "step_avoiding" ? "dashed" : route.profile === "wheelchair_profile" ? "dotted" : "solid"; }

function violations(route: EvaluatedRoute, preferences: RoutePreferences): ExplanationItem[] {
  const result: ExplanationItem[] = [];
  if (!route.continuityFeasible) result.push({ code: "MAX_CONTINUOUS_WALK_EXCEEDED", text: `最大連続歩行は設定${route.continuousWalkingLimitMinutes}分に対して${roundComparisonValue(route.maxContinuousWalkingMinutes, 1)}分で、${roundComparisonValue(route.continuousWalkingExcessMinutes, 1)}分超過します` });
  if (preferences.requireToilet && !route.hasPublicToiletCandidate) result.push({ code: "PUBLIC_TOILET_REQUIRED_MISSING", text: "ルートから推定直線250m以内に公衆トイレ候補がありません" });
  if (preferences.avoidSteepSlopes && route.steepSlopeCount > 0) result.push({ code: "STEEP_SLOPE_REQUIREMENT_NOT_MET", text: `OpenStreetMap属性上の急坂候補が${route.steepSlopeCount}か所あります` });
  if (preferences.preferIndoorRest && route.indoorRestCount === 0) result.push({ code: "INDOOR_REST_REQUIREMENT_NOT_MET", text: "厳格に確認できる屋内休憩候補がありません" });
  if (!isStrictRestNetworkFeasible(route)) result.push({ code: "STRICT_REST_NETWORK_NOT_FEASIBLE", text: "確認できた休憩場所のつながりだけでは、設定時間内に歩き切れる計算になりません" });
  return result;
}

function recommendationReasons(route: EvaluatedRoute, routes: EvaluatedRoute[], baseline: EvaluatedRoute, preferences: RoutePreferences, maximum: number): ExplanationItem[] {
  const reasons: ExplanationItem[] = [];
  if (route.meetsPreferences) reasons.push({ code: "MEETS_ALL_REQUIRED_PREFERENCES", text: "入力した必須条件を満たしています" });
  if (preferences.avoidSteps && route.profile === "step_avoiding") reasons.push({ code: "STEP_AVOIDING_PROFILE", text: "階段を避けるよう要求した条件で生成されています" });
  if (tiedMinimum(routes, route, (item) => item.preferenceViolationCount)) reasons.push({ code: "FEWER_CONSTRAINT_VIOLATIONS", text: "入力条件を満たさなかった項目数が最少です" });
  if (tiedMinimum(routes, route, (item) => item.maxContinuousWalkingMinutes)) reasons.push({ code: "LOWEST_MAX_CONTINUOUS_WALK", text: `最大連続歩行時間が${routes.length}候補中で最短です` });
  if (route.id !== baseline.id && route.maxContinuousWalkingMinutes < baseline.maxContinuousWalkingMinutes) reasons.push({ code: "BETTER_CONTINUITY_THAN_STANDARD", text: `${baseline.profile === "standard" || baseline.id === "standard" ? "標準" : "比較基準"}より最大連続歩行が${roundComparisonValue(baseline.maxContinuousWalkingMinutes - route.maxContinuousWalkingMinutes, 1)}分短くなっています` });
  if (tiedMinimum(routes, route, (item) => item.longestRestGapMeters)) reasons.push({ code: "LOWEST_REST_GAP", text: `次の休憩候補までの最長区間が${routes.length}候補中で最短です` });
  if (tiedMinimum(routes, route, (item) => item.longestPublicToiletGapMeters)) reasons.push({ code: "LOWEST_PUBLIC_TOILET_GAP", text: `公衆トイレ候補の最長空白が${routes.length}候補中で最短です` });
  if (tiedMinimum(routes, route, (item) => item.distanceMeters)) reasons.push({ code: "SHORTEST_DISTANCE", text: "最短距離の候補です" });
  if (tiedMinimum(routes, route, durationSeconds)) reasons.push({ code: "FASTEST_DURATION", text: "最も短時間の候補です" });
  if (preferences.requireToilet && route.hasPublicToiletCandidate) reasons.push({ code: "PUBLIC_TOILET_CANDIDATES_NEAR_ROUTE", text: `ルートから推定直線250m以内に公衆トイレ候補が${route.publicToiletPlaceCount}地点あります` });
  if (isStrictRestNetworkFeasible(route)) reasons.push({ code: "STRICT_REST_NETWORK_FEASIBLE", text: "確認できた休憩場所のつながりで、設定時間内に歩ける計算です" });
  return reasons.slice(0, maximum);
}

function advantages(route: EvaluatedRoute, routes: EvaluatedRoute[], preferences: RoutePreferences): ExplanationItem[] {
  const items: ExplanationItem[] = [];
  if (tiedMinimum(routes, route, (item) => item.distanceMeters)) items.push({ code: "SHORTEST_DISTANCE", text: "最短距離の候補" });
  if (tiedMinimum(routes, route, durationSeconds)) items.push({ code: "FASTEST_DURATION", text: "最も短時間の候補" });
  if (route.profile === "step_avoiding") items.push({ code: "STEP_AVOIDING_PROFILE", text: "階段を避けるよう要求した候補" });
  if (route.profile === "wheelchair_profile") items.push({ code: "WHEELCHAIR_PROFILE", text: "車いすプロファイルの条件で生成した候補" });
  if (route.meetsPreferences) items.push({ code: "MEETS_ALL_REQUIRED_PREFERENCES", text: "入力した必須条件を満たす" });
  if (preferences.requireToilet && route.hasPublicToiletCandidate) items.push({ code: "PUBLIC_TOILET_CANDIDATES_NEAR_ROUTE", text: `推定直線250m以内に公衆トイレ候補${route.publicToiletPlaceCount}地点` });
  if (isStrictRestNetworkFeasible(route)) items.push({ code: "STRICT_REST_NETWORK_FEASIBLE", text: "確認できた休憩場所のつながりで設定時間内となる計算" });
  return items;
}

function safetyWarnings(route: EvaluatedRoute): ExplanationItem[] {
  const items: ExplanationItem[] = (route.warnings ?? []).map((text) => ({ code: "SOURCE_WARNING", text }));
  if (route.profile === "step_avoiding") items.push({ code: "SOURCE_WARNING", text: "OpenStreetMapの情報に階段回避を要求した候補です。現地の通行可否、工事、段差は要確認です" });
  if (route.profile === "wheelchair_profile") items.push({ code: "SOURCE_WARNING", text: "車いすプロファイルによる候補です。段差、工事、路面、エレベーター稼働状況などの現地確認が必要です" });
  return [...new Map(items.map((item) => [item.text, item])).values()];
}

export function buildRouteComparisonViewModels(evaluatedRoutes: readonly EvaluatedRoute[], preferences: RoutePreferences, maximumReasons = 4): RouteComparisonResult {
  if (evaluatedRoutes.length === 0) return { baselineRouteId: null, recommendedRouteId: null, routes: [] };
  const routes = [...evaluatedRoutes].sort(compareEvaluatedRoutes); const baseline = selectComparisonBaseline(routes)!;
  const baselineLabel = baseline.profile === "standard" || baseline.id === "standard" ? "標準" : "比較基準";
  const shortest = minimum(routes, (route) => route.distanceMeters); const fastest = minimum(routes, durationSeconds);
  const models = routes.map((route, index): RouteComparisonViewModel => {
    const distanceDeltaMeters = roundComparisonValue(route.distanceMeters - baseline.distanceMeters);
    const durationDeltaMinutes = roundComparisonValue((durationSeconds(route) - durationSeconds(baseline)) / 60, 1);
    const longestRestGapDeltaMeters = roundComparisonValue(route.longestRestGapMeters - baseline.longestRestGapMeters);
    const constraintViolations = violations(route, preferences);
    const tradeoffs: ExplanationItem[] = [];
    if (distanceDeltaMeters > 0) tradeoffs.push({ code: "LONGER_DISTANCE", text: formatComparisonDelta(distanceDeltaMeters, "m", "距離", baselineLabel) });
    if (durationDeltaMinutes > 0) tradeoffs.push({ code: "LONGER_DURATION", text: formatComparisonDelta(durationDeltaMinutes, "分", "所要時間", baselineLabel) });
    if (longestRestGapDeltaMeters > 0) tradeoffs.push({ code: "LONGER_REST_GAP", text: formatComparisonDelta(longestRestGapDeltaMeters, "m", "最長休憩空白", baselineLabel) });
    return {
      route, routeId: route.id, rank: index + 1, isRecommended: index === 0, isShortest: route.distanceMeters === shortest, isFastest: durationSeconds(route) === fastest,
      profileLabel: profileLabel(route), routeName: route.name, providerLabel: route.provider === "openrouteservice" ? "OpenRouteService" : "固定デモ", isFallback: route.isFallback === true,
      distanceMeters: route.distanceMeters, durationMinutes: roundComparisonValue(durationSeconds(route) / 60, 1), distanceDeltaMeters, durationDeltaMinutes, longestRestGapDeltaMeters, baselineLabel,
      distanceDeltaLabel: formatComparisonDelta(distanceDeltaMeters, "m", "距離", baselineLabel), durationDeltaLabel: formatComparisonDelta(durationDeltaMinutes, "分", "所要時間", baselineLabel), restGapDeltaLabel: formatComparisonDelta(longestRestGapDeltaMeters, "m", "最長休憩空白", baselineLabel),
      maxContinuousWalkingMinutes: roundComparisonValue(route.maxContinuousWalkingMinutes, 1), longestRestGapMeters: roundComparisonValue(route.longestRestGapMeters), longestPublicToiletGapMeters: roundComparisonValue(route.longestPublicToiletGapMeters),
      longestDrinkingWaterGapMeters: roundComparisonValue(route.longestDrinkingWaterGapMeters), longestIndoorCandidateGapMeters: roundComparisonValue(route.longestIndoorCandidateGapMeters), publicToiletPlaceCount: route.publicToiletPlaceCount,
      strictRestCandidateCount: route.confirmedRestSpotCount + route.supportedRestSpotCount, possibleRestCandidateCount: route.referencePossibleCandidateCount, drinkingStationCount: route.drinkingStationCount,
      continuityFeasible: route.continuityFeasible, strictRestNetworkFeasible: isStrictRestNetworkFeasible(route), meetsPreferences: route.meetsPreferences,
      recommendationReasons: recommendationReasons(route, routes, baseline, preferences, maximumReasons), advantages: advantages(route, routes, preferences), tradeoffs, constraintViolations, safetyWarnings: safetyWarnings(route),
      score: route.score, scoreBreakdown: route.scoreBreakdown, visualPattern: visualPattern(route), sourceAttribution: route.sourceAttribution ?? null,
    };
  });
  return { baselineRouteId: baseline.id, recommendedRouteId: routes[0].id, routes: models };
}

export function selectRouteId(current: string | null, availableRouteIds: readonly string[], recommendedRouteId: string | null) {
  return current && availableRouteIds.includes(current) ? current : recommendedRouteId;
}
