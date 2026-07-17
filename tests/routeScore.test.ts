import { describe, expect, it } from "vitest";
import { demoRoutes } from "../src/data/routes";
import { evaluateRoute, selectRecommendedRoute } from "../src/domain/routeScore";

describe("route score", () => {
  it("条件がなければ短い通常ルートを選ぶ", () => {
    const result = selectRecommendedRoute(demoRoutes, { maxContinuousWalkingMinutes: 15, requireToilet: false, avoidSteepSlopes: false, preferIndoorRest: false });
    expect(result[0].id).toBe("standard");
  });
  it("トイレと坂回避を求めると安心ルートを選ぶ", () => {
    const result = selectRecommendedRoute(demoRoutes, { maxContinuousWalkingMinutes: 10, requireToilet: true, avoidSteepSlopes: true, preferIndoorRest: true });
    expect(result[0].id).toBe("comfort"); expect(result[0].meetsPreferences).toBe(true);
  });
  it("最大連続歩行時間の超過を決定的に加点し説明する", () => {
    const result = evaluateRoute(demoRoutes[0], { maxContinuousWalkingMinutes: 5, requireToilet: false, avoidSteepSlopes: false, preferIndoorRest: false });
    expect(result.score).toBe(122); expect(result.reasons).toContain("希望の連続歩行時間を9分超過");
  });
  it("同じ入力では同じスコアになる", () => {
    const preferences = { maxContinuousWalkingMinutes: 10 as const, requireToilet: true, avoidSteepSlopes: true, preferIndoorRest: false };
    expect(evaluateRoute(demoRoutes[0], preferences).score).toBe(evaluateRoute(demoRoutes[0], preferences).score);
  });
});
