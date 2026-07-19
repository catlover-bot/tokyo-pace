import { describe, expect, it } from "vitest";
import { applySelectedMapPoint, buildOrsRequest, buildRouteCacheKey, normalizeOrsResponse, RouteValidationError, toOrsCoordinate, validateRouteSearchRequest } from "../src/domain/routing";
import { deriveDynamicWalkingSegments, prepareDynamicRoute } from "../src/domain/dynamicRoute";
import { derivePublicToiletGapMetrics, evaluateRoute } from "../src/domain/routeScore";
import { clusterOfficialToiletRecords } from "../src/domain/officialToiletQuality.mjs";
import type { RestCandidate, RestSpot, RouteSearchRequest } from "../src/types";
import { DemoRouteProvider } from "../src/providers/DemoRouteProvider";

const request: RouteSearchRequest = { origin: { latitude: 35.6909, longitude: 139.6992 }, destination: { latitude: 35.6895, longitude: 139.6922 }, preferences: { maxContinuousWalkingMinutes: 10, requireToilet: true, avoidSteepSlopes: true, preferIndoorRest: false, avoidSteps: true } };
const ors = { bbox: [139.6922, 35.6895, 139.6992, 35.6909], features: [{ geometry: { coordinates: [[139.6992, 35.6909], [139.695, 35.69], [139.6922, 35.6895]] }, properties: { summary: { distance: 1000.4, duration: 720 }, segments: [{ steps: [{ instruction: "西へ進む", distance: 1000, duration: 720 }] }], extras: { steepness: { values: [[0, 2, 3]] }, waytypes: { values: [[0, 2, 6]] } } } }] };
const normalized = normalizeOrsResponse(ors, "standard", "2026-01-01T00:00:00Z");
const source = { provider: "fixture", datasetName: "fixture", datasetUrl: null, resourceUrl: null, license: "CC BY", datasetUpdatedAt: null, fieldVerifiedAt: null };
const strictCandidate: RestCandidate = { id: "rest", fieldVerificationId: "fv-rest", name: "確認済み休憩候補", latitude: 35.69, longitude: 139.695, address: null, category: "verified_rest_spot", confidence: "confirmed", openingHours: null, indoor: true, seating: true, drinkingWaterAvailable: null, wheelchairAccessible: null, source: { ...source, fieldVerifiedAt: "2026-01-01T00:00:00.000Z" } };

describe("動的経路リクエスト", () => {
  it("API入力を検証し未知フィールドを無視する", () => expect(validateRouteSearchRequest({ ...request, unknown: "ignored" })).toEqual(request));
  it("bbox外を422で拒否する", () => expect(() => validateRouteSearchRequest({ ...request, origin: { latitude: 35, longitude: 139 } })).toThrow(expect.objectContaining({ status: 422 })));
  it("同一点と不正座標を拒否する", () => { expect(() => validateRouteSearchRequest({ ...request, destination: request.origin })).toThrow(RouteValidationError); expect(() => validateRouteSearchRequest({ ...request, origin: { latitude: Number.NaN, longitude: 139 } })).toThrow(RouteValidationError); });
  it("Leaflet順をORSの経度・緯度順へ変換する", () => expect(toOrsCoordinate(request.origin)).toEqual([139.6992, 35.6909]));
  it("standardリクエストを生成する", () => expect(buildOrsRequest(request, "standard")).toMatchObject({ profile: "foot-walking", body: { coordinates: [[139.6992, 35.6909], [139.6922, 35.6895]] } }));
  it("階段回避リクエストを固定生成する", () => expect(buildOrsRequest(request, "step_avoiding").body).toMatchObject({ options: { avoid_features: ["steps"] } }));
  it("wheelchair制約を公式値で固定生成する", () => expect(buildOrsRequest(request, "wheelchair_profile")).toMatchObject({ profile: "wheelchair", body: { options: { avoid_features: ["steps"], profile_params: { restrictions: { maximum_incline: 6, maximum_sloped_kerb: 0.06, surface_type: "cobblestone:flattened", smoothness_type: "good" } } } } }));
  it("キャッシュキーが決定的でAPIキーを含まない", () => { expect(buildRouteCacheKey(request)).toBe(buildRouteCacheKey(structuredClone(request))); expect(buildRouteCacheKey(request)).not.toContain("api"); });
  it("地図クリックを選択中の地点だけへ適用する", () => { const point = { latitude: 35.68, longitude: 139.68 }; const result = applySelectedMapPoint("origin", { origin: request.origin, destination: request.destination }, point); expect(result.origin).toBe(point); expect(result.destination).toEqual(request.destination); });
  it("DemoRouteProviderを明示的fallbackとして維持する", async () => { const routes = await new DemoRouteProvider().getRoutes(request); expect(routes).toHaveLength(2); expect(routes.every((route) => route.isFallback)).toBe(true); });
});

describe("動的経路の正規化と評価", () => {
  it("ORS GeoJSONを内部型へ正規化する", () => { expect(normalized.coordinates[0]).toEqual([35.6909, 139.6992]); expect(normalized.distanceMeters).toBe(1000); expect(normalized.durationMinutes).toBe(12); expect(normalized.steps?.[0].instruction).toBe("西へ進む"); });
  it("空レスポンスを拒否する", () => expect(() => normalizeOrsResponse({ features: [] }, "standard", "now")).toThrow(expect.objectContaining({ status: 422 })));
  it("現地確認済み厳格候補の射影位置でwalkingSegmentsを分割する", () => { const segments = deriveDynamicWalkingSegments(normalized, [strictCandidate]); expect(segments).toHaveLength(2); expect(segments.reduce((sum, item) => sum + item.distanceMeters, 0)).toBeCloseTo(1000, 6); expect(segments[0].restSpotId).toBe("rest"); });
  it("possible候補は連続歩行を分割しない", () => expect(deriveDynamicWalkingSegments(normalized, [{ ...strictCandidate, confidence: "possible" }])).toHaveLength(1));
  it("動的経路の最長休憩空白と連続歩行を再計算する", () => { const route = prepareDynamicRoute(normalized, [strictCandidate]); const result = evaluateRoute(route, { ...request.preferences, requireToilet: false }, [], [strictCandidate]); expect(result.maxContinuousWalkingMinutes).toBeLessThan(12); expect(result.longestRestGapMeters).toBeLessThanOrEqual(1000); });
  it("動的経路の公衆トイレ空白を射影して再計算する", () => { const toilet: RestSpot = { id: "t", name: "公衆トイレ", latitude: 35.69, longitude: 139.695, address: null, category: "toilet", seating: null, indoor: null, toiletAvailable: true, wheelchairAccessible: null, openingHours: null, officialToiletKind: "public_toilet", confidence: "official", source }; const gaps = derivePublicToiletGapMetrics(normalized.coordinates, clusterOfficialToiletRecords([toilet]), normalized.distanceMeters); expect(gaps.publicToiletGapSegments).toHaveLength(2); expect(gaps.publicToiletGapSegments.reduce((sum, item) => sum + item.gapMeters, 0)).toBeCloseTo(1000, 6); });
  it("候補ランキングが入力順に依存しない", () => { const a = { ...normalized, id: "a", durationMinutes: 10 }; const b = { ...normalized, id: "b", durationMinutes: 14 }; const preferences = { ...request.preferences, requireToilet: false }; const rank = (routes: typeof normalized[]) => routes.map((route) => evaluateRoute(route, preferences, [], [])).sort((x, y) => x.score - y.score || x.id.localeCompare(y.id)).map((x) => x.id); expect(rank([a, b])).toEqual(rank([b, a])); });
});
