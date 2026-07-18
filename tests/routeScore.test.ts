import { describe, expect, it } from "vitest";
import { demoRoutes } from "../src/data/routes";
import { deriveContinuityMetrics, evaluateRoute, selectRecommendedRoute } from "../src/domain/routeScore";
import type { RoutePreferences, WalkingSegment } from "../src/types";

const standardRoute = demoRoutes.find((route) => route.id === "standard")!;
const comfortRoute = demoRoutes.find((route) => route.id === "comfort")!;
const basePreferences: RoutePreferences = {
  maxContinuousWalkingMinutes: 10,
  requireToilet: false,
  avoidSteepSlopes: false,
  preferIndoorRest: false,
};

const sampleSegments: WalkingSegment[] = [
  { id: "one", name: "区間1", distanceMeters: 320, walkingMinutes: 5, endsAtRestSpot: true, restSpotId: "spot-one" },
  { id: "two", name: "区間2", distanceMeters: 510, walkingMinutes: 8, endsAtRestSpot: false, restSpotId: null },
  { id: "three", name: "区間3", distanceMeters: 240, walkingMinutes: 4, endsAtRestSpot: true, restSpotId: "spot-three" },
];

describe("移動継続可能性の導出", () => {
  it("区間から最大連続歩行時間を正しく導出する", () => {
    expect(deriveContinuityMetrics(sampleSegments, 10).maxContinuousWalkingMinutes).toBe(8);
  });

  it("区間から最長休憩空白を正しく導出する", () => {
    expect(deriveContinuityMetrics(sampleSegments, 10).longestRestGapMeters).toBe(510);
  });

  it("最大連続歩行時間が上限と等しい場合は成立する", () => {
    const metrics = deriveContinuityMetrics(sampleSegments, 8);
    expect(metrics.continuityFeasible).toBe(true);
    expect(metrics.continuousWalkingExcessMinutes).toBe(0);
  });

  it("上限を超えた場合に超過時間を正しく計算する", () => {
    const metrics = deriveContinuityMetrics(sampleSegments, 5);
    expect(metrics.continuityFeasible).toBe(false);
    expect(metrics.continuousWalkingExcessMinutes).toBe(3);
  });

  it("通常ルートは上限10分で移動継続不可になる", () => {
    const result = evaluateRoute(standardRoute, basePreferences);
    expect(result.maxContinuousWalkingMinutes).toBe(14);
    expect(result.longestRestGapMeters).toBe(1050);
    expect(result.continuityFeasible).toBe(false);
    expect(result.continuousWalkingExcessMinutes).toBe(4);
  });

  it("安心ルートは上限10分で移動継続可能になる", () => {
    const result = evaluateRoute(comfortRoute, basePreferences);
    expect(result.maxContinuousWalkingMinutes).toBe(7);
    expect(result.longestRestGapMeters).toBe(480);
    expect(result.continuityFeasible).toBe(true);
    expect(result.continuousWalkingExcessMinutes).toBe(0);
  });
});

describe("route score", () => {
  it("条件がなければ短い通常ルートを選ぶ", () => {
    const result = selectRecommendedRoute(demoRoutes, { ...basePreferences, maxContinuousWalkingMinutes: 15 });
    expect(result[0].id).toBe("standard");
  });

  it("区間由来の連続歩行超過を決定的に加点し説明する", () => {
    const result = evaluateRoute(standardRoute, { ...basePreferences, maxContinuousWalkingMinutes: 5 });
    expect(result.score).toBe(122);
    expect(result.reasons).toContain("希望の連続歩行時間を9分超過");
  });

  it("同じ入力では同じ評価結果になる", () => {
    const preferences: RoutePreferences = { ...basePreferences, requireToilet: true, avoidSteepSlopes: true };
    expect(evaluateRoute(standardRoute, preferences)).toEqual(evaluateRoute(standardRoute, preferences));
  });

  it("トイレ、坂、屋内休憩の評価を総合条件に維持する", () => {
    const strictPreferences: RoutePreferences = {
      maxContinuousWalkingMinutes: 10,
      requireToilet: true,
      avoidSteepSlopes: true,
      preferIndoorRest: true,
    };
    const standard = evaluateRoute(standardRoute, strictPreferences);
    const comfort = evaluateRoute(comfortRoute, strictPreferences);

    expect(standard.meetsPreferences).toBe(false);
    expect(standard.reasons).toEqual(expect.arrayContaining(["途中のトイレ候補なし", "デモデータ上の急坂候補1か所", "屋内休憩候補なし"]));
    expect(comfort.meetsPreferences).toBe(true);
    expect(comfort.reasons).toEqual(expect.arrayContaining(["途中にトイレ候補あり", "デモデータ上の急坂なし", "屋内休憩候補あり"]));
    expect(selectRecommendedRoute(demoRoutes, strictPreferences)[0].id).toBe("comfort");
  });
});
