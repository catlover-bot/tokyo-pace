import { describe, expect, it } from "vitest";
import { demoRoutes } from "../src/data/routes";
import { buildRouteComparisonViewModels, formatComparisonDelta, roundComparisonValue, selectComparisonBaseline, selectRouteId } from "../src/domain/routeComparison";
import { evaluateRoute, selectRecommendedRoute } from "../src/domain/routeScore";
import type { EvaluatedRoute, RoutePreferences } from "../src/types";

const preferences: RoutePreferences = { maxContinuousWalkingMinutes: 10, requireToilet: true, avoidSteepSlopes: true, preferIndoorRest: true, avoidSteps: true };
const evaluatedBase = evaluateRoute(demoRoutes[0], { ...preferences, requireToilet: false, avoidSteepSlopes: false, preferIndoorRest: false }, [], []);

function makeRoute(id: string, overrides: Partial<EvaluatedRoute> = {}): EvaluatedRoute {
  const profile = id === "step_avoiding" ? "step_avoiding" : id === "wheelchair_profile" ? "wheelchair_profile" : id === "standard" ? "standard" : undefined;
  const score = overrides.score ?? 10;
  return {
    ...evaluatedBase, id, name: `${id}候補`, profile, provider: "openrouteservice", isFallback: false, sourceAttribution: "© OpenStreetMap contributors / openrouteservice",
    distanceMeters: 1000, durationMinutes: 10, durationSeconds: 600, score, scoreBreakdown: { duration: 10, continuousWalkingExcess: 0, missingPublicToilet: 0, steepSlope: 0, missingIndoorRest: 0, total: score },
    preferenceViolationCount: 0, meetsPreferences: true, maxContinuousWalkingMinutes: 8, continuousWalkingLimitMinutes: 10, continuousWalkingExcessMinutes: 0, continuityFeasible: true,
    longestRestGapMeters: 500, longestPublicToiletGapMeters: 600, longestDrinkingWaterGapMeters: 700, longestIndoorCandidateGapMeters: 800,
    continuityFeasibleByRestNetwork: true, restNetworkLevel: "confirmed", confirmedRestSpotCount: 1, supportedRestSpotCount: 0, referencePossibleCandidateCount: 0,
    publicToiletPlaceCount: 1, hasPublicToiletCandidate: true, steepSlopeCount: 0, indoorRestCount: 1,
    ...overrides,
  };
}

const build = (routes: EvaluatedRoute[], prefs = preferences, maximumReasons = 4) => buildRouteComparisonViewModels(routes, prefs, maximumReasons);

describe("比較基準と差分", () => {
  it("standardを差分基準にする", () => expect(build([makeRoute("step_avoiding", { distanceMeters: 800 }), makeRoute("standard", { distanceMeters: 1200 })]).baselineRouteId).toBe("standard"));
  it("profileがstandardならIDが異なっても基準にする", () => expect(selectComparisonBaseline([makeRoute("b", { profile: "standard", distanceMeters: 1200 }), makeRoute("a", { distanceMeters: 800 })])?.id).toBe("b"));
  it("standardがない場合は最短候補を基準にする", () => expect(build([makeRoute("b", { distanceMeters: 900 }), makeRoute("a", { distanceMeters: 800 })]).baselineRouteId).toBe("a"));
  it("最短距離も同じならIDで決定する", () => expect(build([makeRoute("b"), makeRoute("a")]).baselineRouteId).toBe("a"));
  it("距離差を候補から基準を引いて計算する", () => expect(build([makeRoute("standard"), makeRoute("step_avoiding", { distanceMeters: 1328 })]).routes.find((x) => x.routeId === "step_avoiding")?.distanceDeltaMeters).toBe(328));
  it("時間差を丸め済み分ではなく秒から計算する", () => expect(build([makeRoute("standard"), makeRoute("step_avoiding", { durationMinutes: 10, durationSeconds: 625 })]).routes.find((x) => x.routeId === "step_avoiding")?.durationDeltaMinutes).toBe(0.4));
  it("休憩空白差を計算する", () => expect(build([makeRoute("standard"), makeRoute("step_avoiding", { longestRestGapMeters: 290 })]).routes.find((x) => x.routeId === "step_avoiding")?.longestRestGapDeltaMeters).toBe(-210));
  it("比較値をhalf-away-from-zeroで丸める", () => { expect(roundComparisonValue(1.25, 1)).toBe(1.3); expect(roundComparisonValue(-1.25, 1)).toBe(-1.3); });
  it("負のゼロを0へ正規化する", () => expect(Object.is(roundComparisonValue(-0.0001), -0)).toBe(false));
  it("同じ値を差なしと表示する", () => expect(formatComparisonDelta(0, "m", "距離")).toBe("標準と距離の差なし"));
  it("正負の差分表現を統一する", () => { expect(formatComparisonDelta(328, "m", "距離")).toBe("標準より距離が328m長い"); expect(formatComparisonDelta(-210, "m", "最長休憩空白")).toBe("標準より最長休憩空白が210m短い"); });
});

describe("決定的ランキング", () => {
  it("必須条件達成を同点処理の先頭にする", () => expect(build([makeRoute("a", { meetsPreferences: false, score: 10 }), makeRoute("b", { meetsPreferences: true, score: 10 })]).recommendedRouteId).toBe("b"));
  it("条件達成が同じならスコアが小さい候補を選ぶ", () => expect(build([makeRoute("a", { score: 20 }), makeRoute("b", { score: 10 })]).recommendedRouteId).toBe("b"));
  it("同点なら条件違反数が少ない候補を選ぶ", () => expect(build([makeRoute("a", { preferenceViolationCount: 2 }), makeRoute("b", { preferenceViolationCount: 1 })]).recommendedRouteId).toBe("b"));
  it("次に最大連続歩行時間が短い候補を選ぶ", () => expect(build([makeRoute("a", { maxContinuousWalkingMinutes: 9 }), makeRoute("b", { maxContinuousWalkingMinutes: 8 })]).recommendedRouteId).toBe("b"));
  it("次に最長休憩空白が短い候補を選ぶ", () => expect(build([makeRoute("a", { longestRestGapMeters: 600 }), makeRoute("b", { longestRestGapMeters: 500 })]).recommendedRouteId).toBe("b"));
  it("次に所要秒数が短い候補を選ぶ", () => expect(build([makeRoute("a", { durationSeconds: 620 }), makeRoute("b", { durationSeconds: 610 })]).recommendedRouteId).toBe("b"));
  it("次に距離が短い候補を選ぶ", () => expect(build([makeRoute("a", { distanceMeters: 1100 }), makeRoute("b", { distanceMeters: 1000 })]).recommendedRouteId).toBe("b"));
  it("最後にrouteIdの辞書順で選ぶ", () => expect(build([makeRoute("b"), makeRoute("a")]).recommendedRouteId).toBe("a"));
  it("入力配列順に依存しない", () => { const routes = [makeRoute("standard", { score: 12 }), makeRoute("step_avoiding", { score: 10 }), makeRoute("wheelchair_profile", { score: 11 })]; expect(build(routes).routes.map((x) => x.routeId)).toEqual(build([...routes].reverse()).routes.map((x) => x.routeId)); });
  it("既存ランキングとViewModelの順位を共通化する", () => { const source = demoRoutes; const ranked = selectRecommendedRoute(source, { ...preferences, requireToilet: false, preferIndoorRest: false }, [], []); expect(buildRouteComparisonViewModels(ranked, { ...preferences, requireToilet: false, preferIndoorRest: false }).routes.map((x) => x.routeId)).toEqual(ranked.map((x) => x.id)); });
});

describe("推奨理由", () => {
  it("必須条件達成を最優先理由にする", () => expect(build([makeRoute("standard")]).routes[0].recommendationReasons[0].code).toBe("MEETS_ALL_REQUIRED_PREFERENCES"));
  it("最大連続歩行が最短の理由を生成する", () => expect(build([makeRoute("standard", { maxContinuousWalkingMinutes: 9 }), makeRoute("step_avoiding", { maxContinuousWalkingMinutes: 7 })], preferences, 10).routes.find((x) => x.routeId === "step_avoiding")?.recommendationReasons.map((x) => x.code)).toContain("LOWEST_MAX_CONTINUOUS_WALK"));
  it("休憩空白が最短の理由を生成する", () => expect(build([makeRoute("standard", { longestRestGapMeters: 600 }), makeRoute("step_avoiding", { longestRestGapMeters: 400 })], preferences, 10).routes.find((x) => x.routeId === "step_avoiding")?.recommendationReasons.map((x) => x.code)).toContain("LOWEST_REST_GAP"));
  it("階段回避希望がある場合だけ階段回避理由を生成する", () => { const route = makeRoute("step_avoiding"); expect(build([route], preferences, 10).routes[0].recommendationReasons.map((x) => x.code)).toContain("STEP_AVOIDING_PROFILE"); expect(build([route], { ...preferences, avoidSteps: false }, 10).routes[0].recommendationReasons.map((x) => x.code)).not.toContain("STEP_AVOIDING_PROFILE"); });
  it("車いす候補に通行保証表現を生成しない", () => { const text = JSON.stringify(build([makeRoute("wheelchair_profile")]).routes[0]); expect(text).not.toContain("車いすで通れる"); expect(text).not.toContain("完全バリアフリー"); });
  it("possible施設だけでは厳格な休憩理由を生成しない", () => { const model = build([makeRoute("standard", { restNetworkLevel: "possible", continuityFeasibleByRestNetwork: true, confirmedRestSpotCount: 0, referencePossibleCandidateCount: 5 })], preferences, 10).routes[0]; expect(model.recommendationReasons.map((x) => x.code)).not.toContain("STRICT_REST_NETWORK_FEASIBLE"); expect(model.possibleRestCandidateCount).toBe(5); });
  it("confirmedまたはsupportedだけを厳格成立理由にする", () => expect(build([makeRoute("standard", { restNetworkLevel: "supported" })], preferences, 10).routes[0].recommendationReasons.map((x) => x.code)).toContain("STRICT_REST_NETWORK_FEASIBLE"));
  it("理由を指定最大件数に制限する", () => expect(build([makeRoute("standard")], preferences, 3).routes[0].recommendationReasons).toHaveLength(3));
  it("トイレ希望がなければトイレを推奨理由にしない", () => expect(build([makeRoute("standard")], { ...preferences, requireToilet: false }, 10).routes[0].recommendationReasons.map((x) => x.code)).not.toContain("PUBLIC_TOILET_CANDIDATES_NEAR_ROUTE"));
  it("根拠がない最短理由を生成しない", () => expect(build([makeRoute("standard", { distanceMeters: 1000 }), makeRoute("step_avoiding", { distanceMeters: 1200 })], preferences, 10).routes.find((x) => x.routeId === "step_avoiding")?.recommendationReasons.map((x) => x.code)).not.toContain("SHORTEST_DISTANCE"));
});

describe("条件違反と表示用属性", () => {
  it("最大連続歩行時間の超過分を説明する", () => { const model = build([makeRoute("standard", { continuityFeasible: false, maxContinuousWalkingMinutes: 13, continuousWalkingExcessMinutes: 3 })]).routes[0]; expect(model.constraintViolations[0]).toMatchObject({ code: "MAX_CONTINUOUS_WALK_EXCEEDED" }); expect(model.constraintViolations[0].text).toContain("3分超過"); });
  it("公衆トイレ条件未達を説明する", () => expect(build([makeRoute("standard", { hasPublicToiletCandidate: false })]).routes[0].constraintViolations.map((x) => x.code)).toContain("PUBLIC_TOILET_REQUIRED_MISSING"));
  it("急坂条件未達を説明する", () => expect(build([makeRoute("standard", { steepSlopeCount: 2 })]).routes[0].constraintViolations.map((x) => x.code)).toContain("STEEP_SLOPE_REQUIREMENT_NOT_MET"));
  it("屋内候補条件未達を説明する", () => expect(build([makeRoute("standard", { indoorRestCount: 0 })]).routes[0].constraintViolations.map((x) => x.code)).toContain("INDOOR_REST_REQUIREMENT_NOT_MET"));
  it("厳格な休憩場所のつながり未成立を分けて説明する", () => expect(build([makeRoute("standard", { continuityFeasibleByRestNetwork: false, restNetworkLevel: "none" })]).routes[0].constraintViolations.map((x) => x.code)).toContain("STRICT_REST_NETWORK_NOT_FEASIBLE"));
  it("違反がない場合は空配列にする", () => expect(build([makeRoute("standard")]).routes[0].constraintViolations).toEqual([]));
  it("複数違反を決定的な順序にする", () => { const codes = build([makeRoute("standard", { continuityFeasible: false, continuousWalkingExcessMinutes: 2, hasPublicToiletCandidate: false, steepSlopeCount: 1, indoorRestCount: 0, continuityFeasibleByRestNetwork: false, restNetworkLevel: "none" })]).routes[0].constraintViolations.map((x) => x.code); expect(codes).toEqual(["MAX_CONTINUOUS_WALK_EXCEEDED", "PUBLIC_TOILET_REQUIRED_MISSING", "STEEP_SLOPE_REQUIREMENT_NOT_MET", "INDOOR_REST_REQUIREMENT_NOT_MET", "STRICT_REST_NETWORK_NOT_FEASIBLE"]); });
  it("最短と最短時間を別々に判定する", () => { const result = build([makeRoute("standard", { distanceMeters: 900, durationSeconds: 700 }), makeRoute("step_avoiding", { distanceMeters: 1100, durationSeconds: 600 })]); expect(result.routes.find((x) => x.routeId === "standard")?.isShortest).toBe(true); expect(result.routes.find((x) => x.routeId === "step_avoiding")?.isFastest).toBe(true); });
  it("固定デモとAPI由来を区別する", () => { const models = build([makeRoute("standard", { provider: "demo", isFallback: true }), makeRoute("step_avoiding")]).routes; expect(models.find((x) => x.routeId === "standard")).toMatchObject({ providerLabel: "固定デモ", isFallback: true }); expect(models.find((x) => x.routeId === "step_avoiding")?.providerLabel).toBe("OpenRouteService"); });
  it("選択IDが消えた場合だけ推奨へ戻す", () => { expect(selectRouteId("b", ["a", "b"], "a")).toBe("b"); expect(selectRouteId("missing", ["a", "b"], "a")).toBe("a"); });
  it("既存スコア内訳の合計を変えない", () => { const route = evaluateRoute(demoRoutes[0], preferences, [], []); expect(route.scoreBreakdown.total).toBe(route.score); expect(Object.values(route.scoreBreakdown).slice(0, -1).reduce((sum, value) => sum + value, 0)).toBe(route.score); });
});

describe("条件負担スコアの方向監査", () => {
  it("条件負担スコアが低い候補を先に並べる", () => { const low = makeRoute("low", { score: 10, meetsPreferences: false, preferenceViolationCount: 3 }); const high = makeRoute("high", { score: 11, meetsPreferences: true, preferenceViolationCount: 0 }); expect(build([high, low]).routes.map((model) => model.routeId)).toEqual(["low", "high"]); });
  it("比較UIの推奨候補を既存ランキング1位と一致させる", () => { const ranked = selectRecommendedRoute(demoRoutes, preferences, [], []); const result = buildRouteComparisonViewModels(ranked, preferences); expect(result.recommendedRouteId).toBe(ranked[0].id); expect(result.routes[0].routeId).toBe(ranked[0].id); });
  it("同点時だけ既存の決定順を適用する", () => { const unmet = makeRoute("a", { score: 10, meetsPreferences: false, preferenceViolationCount: 1 }); const met = makeRoute("b", { score: 10, meetsPreferences: true, preferenceViolationCount: 0 }); expect(build([unmet, met]).routes.map((model) => model.routeId)).toEqual(["b", "a"]); });
});
