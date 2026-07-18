import { describe, expect, it } from "vitest";
import { demoRoutes } from "../src/data/routes";
import { deriveContinuityMetrics, derivePublicToiletGapMetrics, evaluateRoute, selectRecommendedRoute } from "../src/domain/routeScore";
import type { RoutePreferences, WalkingSegment } from "../src/types";
import type { RestSpot } from "../src/types";
import { clusterOfficialToiletRecords } from "../src/domain/officialToiletQuality.mjs";
import { nearestOfficialToiletPlaceDistanceMeters } from "../src/domain/geo";

const standardRoute = demoRoutes.find((route) => route.id === "standard")!;
const comfortRoute = demoRoutes.find((route) => route.id === "comfort")!;
const basePreferences: RoutePreferences = {
  maxContinuousWalkingMinutes: 10,
  requireToilet: false,
  avoidSteepSlopes: false,
  preferIndoorRest: false,
};
const nearbyOfficialToilet: RestSpot = {
  id: "official-near-route", name: "公式トイレ", latitude: 35.6908, longitude: 139.6994, address: "東京都新宿区西新宿",
  category: "toilet", seating: null, indoor: null, toiletAvailable: true, wheelchairAccessible: true, openingHours: null, officialToiletKind: "public_toilet", confidence: "official",
  source: { provider: "新宿区", datasetName: "fixture", datasetUrl: null, resourceUrl: null, license: "CC BY", datasetUpdatedAt: null, retrievedAt: null, fieldVerifiedAt: null },
};
const nearbyOfficialPlace = clusterOfficialToiletRecords([nearbyOfficialToilet]);

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
    expect(evaluateRoute(standardRoute, preferences, nearbyOfficialPlace)).toEqual(evaluateRoute(standardRoute, preferences, nearbyOfficialPlace));
  });

  it("トイレ、坂、屋内休憩の評価を総合条件に維持する", () => {
    const strictPreferences: RoutePreferences = {
      maxContinuousWalkingMinutes: 10,
      requireToilet: true,
      avoidSteepSlopes: true,
      preferIndoorRest: true,
    };
    const standard = evaluateRoute(standardRoute, strictPreferences, []);
    const comfort = evaluateRoute(comfortRoute, strictPreferences, nearbyOfficialPlace);

    expect(standard.meetsPreferences).toBe(false);
    expect(standard.reasons).toEqual(expect.arrayContaining(["ルートから推定直線距離250m以内に公衆トイレ候補なし", "デモデータ上の急坂候補1か所", "屋内休憩候補なし"]));
    expect(comfort.meetsPreferences).toBe(true);
    expect(comfort.reasons).toEqual(expect.arrayContaining(["ルートから推定直線距離250m以内に公衆トイレ候補1地点", "デモデータ上の急坂なし", "屋内休憩候補あり"]));
    expect(selectRecommendedRoute(demoRoutes, strictPreferences, nearbyOfficialPlace)[0].id).toBe("comfort");
  });

  it("トイレ必須条件を公式データだけで判定する", () => {
    const required = { ...basePreferences, requireToilet: true };
    expect(evaluateRoute(comfortRoute, required, []).hasPublicToiletCandidate).toBe(false);
    const withOfficial = evaluateRoute(comfortRoute, required, nearbyOfficialPlace);
    expect(withOfficial.hasPublicToiletCandidate).toBe(true);
    expect(withOfficial.officialToiletPlaceCount).toBe(1);
    expect(withOfficial.officialToiletRecordCount).toBe(1);
    expect(withOfficial.meetsPreferences).toBe(true);
  });

  it("同一地点の複数原レコードで候補地点数を過大評価しない", () => {
    const duplicate = { ...nearbyOfficialToilet, id: "official-near-route-2", name: "同一建物内 別トイレ", officialToiletKind: "facility_toilet_information" as const };
    const places = clusterOfficialToiletRecords([nearbyOfficialToilet, duplicate]);
    const result = evaluateRoute(comfortRoute, { ...basePreferences, requireToilet: true }, places);
    expect(result.officialToiletRecordCount).toBe(2);
    expect(result.officialToiletPlaceCount).toBe(1);
  });

  it("公衆トイレだけが既定条件を満たし、施設・駅内情報だけでは満たさない", () => {
    const required = { ...basePreferences, requireToilet: true };
    const placeFor = (kind: "public_toilet" | "facility_toilet_information" | "station_toilet_information") => clusterOfficialToiletRecords([{ ...nearbyOfficialToilet, id: kind, officialToiletKind: kind }]);
    expect(evaluateRoute(comfortRoute, required, placeFor("public_toilet")).meetsPreferences).toBe(true);
    expect(evaluateRoute(comfortRoute, required, placeFor("facility_toilet_information")).meetsPreferences).toBe(false);
    expect(evaluateRoute(comfortRoute, required, placeFor("station_toilet_information")).meetsPreferences).toBe(false);
  });

  it("3種類の候補地点数を個別に数える", () => {
    const records = [
      { ...nearbyOfficialToilet, id: "public", longitude: 139.6994, officialToiletKind: "public_toilet" as const },
      { ...nearbyOfficialToilet, id: "facility", longitude: 139.698, officialToiletKind: "facility_toilet_information" as const },
      { ...nearbyOfficialToilet, id: "station", longitude: 139.696, officialToiletKind: "station_toilet_information" as const },
    ];
    const result = evaluateRoute(comfortRoute, basePreferences, records.flatMap((record) => clusterOfficialToiletRecords([record])));
    expect([result.publicToiletPlaceCount, result.facilityToiletInformationPlaceCount, result.stationToiletInformationPlaceCount]).toEqual([1, 1, 1]);
  });
});

describe("最長公衆トイレ空白", () => {
  const route: [number, number][] = [[0, 0], [0, 0.01]];
  const placeAt = (id: string, longitude: number) => clusterOfficialToiletRecords([{ ...nearbyOfficialToilet, id, latitude: 0, longitude }])[0];

  it("開始地点から最初と最後の候補から終了地点までの空白を数える", () => {
    const metrics = derivePublicToiletGapMetrics(route, [placeAt("first", 0.002), placeAt("last", 0.008)]);
    expect(metrics.publicToiletGapSegments[0].gapMeters).toBeCloseTo(222, 0);
    expect(metrics.publicToiletGapSegments.at(-1)!.gapMeters).toBeCloseTo(222, 0);
    expect(metrics.longestPublicToiletGapMeters).toBeCloseTo(667, 0);
  });

  it("候補がない場合はルート全長を最長空白にする", () => {
    const metrics = derivePublicToiletGapMetrics(route, []);
    expect(metrics.longestPublicToiletGapMeters).toBeCloseTo(metrics.routeLengthMeters, 8);
    expect(metrics.publicToiletGapSegments).toHaveLength(1);
  });

  it("同一地点の複数原レコードで空白を二重に分割しない", () => {
    const records = [{ ...nearbyOfficialToilet, id: "one", latitude: 0, longitude: 0.005 }, { ...nearbyOfficialToilet, id: "two", latitude: 0, longitude: 0.005 }];
    const metrics = derivePublicToiletGapMetrics(route, clusterOfficialToiletRecords(records));
    expect(metrics.publicToiletGapSegments).toHaveLength(2);
  });

  it("最長空白計算は候補地点の入力順に依存しない", () => {
    const places = [placeAt("first", 0.002), placeAt("last", 0.008)];
    expect(derivePublicToiletGapMetrics(route, places)).toEqual(derivePublicToiletGapMetrics(route, [...places].reverse()));
  });

  it("幾何進行距離の50%を設定ルート距離の50%へ変換する", () => {
    const metrics = derivePublicToiletGapMetrics(route, [placeAt("middle", 0.005)], 2000);
    expect(metrics.publicToiletGapSegments[0].endProgressMeters).toBeCloseTo(1000, 6);
    expect(metrics.publicToiletGapSegments[0].endGeometryProgressMeters).toBeCloseTo(metrics.geometryLengthMeters / 2, 6);
  });

  it("通常ルートの候補なし空白を1050m尺度にする", () => {
    const result = evaluateRoute(standardRoute, basePreferences, []);
    expect(result.routeLengthMeters).toBe(standardRoute.distanceMeters);
    expect(result.longestPublicToiletGapMeters).toBeCloseTo(1050, 8);
    expect(result.geometryLengthMeters).not.toBeCloseTo(result.routeLengthMeters, 0);
  });

  it("安心ルートの全空白を1350m尺度へ正規化する", () => {
    const result = evaluateRoute(comfortRoute, basePreferences, nearbyOfficialPlace);
    expect(result.routeLengthMeters).toBe(1350);
    expect(result.publicToiletGapSegments.reduce((sum, gap) => sum + gap.gapMeters, 0)).toBeCloseTo(1350, 8);
  });

  it("最寄り候補までの直線距離はルート距離尺度で正規化しない", () => {
    const result = evaluateRoute(standardRoute, basePreferences, nearbyOfficialPlace);
    const directDistance = nearestOfficialToiletPlaceDistanceMeters(nearbyOfficialPlace, standardRoute.coordinates);
    expect(result.nearestPublicToiletDistanceMeters).toBe(Math.round(directDistance!));
    expect(result.routeLengthMeters).toBe(1050);
  });
});
