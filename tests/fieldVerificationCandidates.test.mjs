import { describe, expect, it } from "vitest";
import {
  FIELD_VERIFICATION_CANDIDATE_CSV_HEADERS,
  fieldVerificationCandidatesCsv,
} from "../scripts/update-open-data.mjs";
import {
  DETOUR_ACCESS_LOWER_BOUND_FACTOR,
  MIN_DETOUR_ADJUSTED_IMPROVEMENT_METERS,
  MIN_DETOUR_ADJUSTED_IMPROVEMENT_RATIO,
  classifyFacilityAccess,
  deriveDetourAdjustedImprovement,
  estimateDetourLowerBoundMeters,
  extractFieldVerificationCandidates,
  projectCandidateToRoute,
} from "../src/domain/fieldVerificationCandidates.mjs";

const route = {
  id: "standard",
  profile: "standard",
  distanceMeters: 1_000,
  coordinates: [[35, 139], [35, 139.01]],
};
const fixedDemoRoute = {
  id: "standard",
  distanceMeters: 1_200,
  coordinates: [[35, 139], [35, 139.01]],
};
const candidate = (id, longitude, overrides = {}) => ({
  id,
  name: `候補${id}`,
  latitude: 35,
  longitude,
  address: `東京都新宿区住所${id}`,
  category: "public_facility",
  confidence: "possible",
  source: {
    sourceDatasetId: "shinjuku-public-facilities",
    sourceRecordId: id,
  },
  ...overrides,
});
const extract = (candidates, options = {}) => extractFieldVerificationCandidates({
  dynamicRoutes: [route],
  fixedDemoRoutes: [],
  candidates,
  ...options,
});

describe("現地確認候補抽出", () => {
  it("幾何進行距離をルート距離尺度へ正規化し最近点も保持する", () => {
    const projected = projectCandidateToRoute(candidate("middle", 139.005), route);
    expect(projected.routeProgressMeters).toBeCloseTo(500, 0);
    expect(projected.geometryLengthMeters).not.toBe(route.distanceMeters);
    expect(projected.nearestPointCoordinate).toEqual([35, 139.005]);
  });

  it("迂回下限をルートまでの推定直線距離1倍で決定的に算出する", () => {
    expect(DETOUR_ACCESS_LOWER_BOUND_FACTOR).toBe(1);
    expect(estimateDetourLowerBoundMeters(30.4)).toBe(30);
    expect(estimateDetourLowerBoundMeters(Number.POSITIVE_INFINITY)).toBe(0);
    expect(deriveDetourAdjustedImprovement({
      currentLongestGapMeters: 1_000,
      grossImprovementMeters: 500,
      distanceToRouteMeters: 30.4,
    })).toEqual({
      estimatedDetourLowerBoundMeters: 30,
      detourAdjustedImprovementMeters: 470,
      detourAdjustedImprovementRatio: 0.47,
    });
  });

  it("迂回負担が理論改善を上回る場合は調整後改善を0へ丸める", () => {
    expect(deriveDetourAdjustedImprovement({
      currentLongestGapMeters: 1_000,
      grossImprovementMeters: 20,
      distanceToRouteMeters: 50,
    })).toEqual({
      estimatedDetourLowerBoundMeters: 50,
      detourAdjustedImprovementMeters: 0,
      detourAdjustedImprovementRatio: 0,
    });
  });

  it("最大空白の中点候補で理論改善と迂回調整後改善を算出する", () => {
    const result = extract([candidate("middle", 139.005)]);
    expect(result.candidates[0]).toMatchObject({
      primaryRouteId: "standard",
      primaryRouteKey: "dynamic_snapshot:standard",
      currentLongestGapMeters: 1_000,
      expectedImprovedGapMeters: 500,
      grossImprovementMeters: 500,
      grossImprovementRatio: 0.5,
      estimatedDetourLowerBoundMeters: 0,
      detourAdjustedImprovementMeters: 500,
      detourAdjustedImprovementRatio: 0.5,
    });
  });

  it("理論改善0mの候補を順位から除外して理由を監査する", () => {
    const result = extract([candidate("start", 139)]);
    expect(result.candidates).toEqual([]);
    expect(result.exclusions).toEqual([
      expect.objectContaining({
        candidateId: "start",
        reasonCode: "NO_GROSS_GAP_IMPROVEMENT",
      }),
    ]);
  });

  it("30mかつ2.5%以上を寄与条件とし、どちらか未達なら除外する", () => {
    expect(MIN_DETOUR_ADJUSTED_IMPROVEMENT_METERS).toBe(30);
    expect(MIN_DETOUR_ADJUSTED_IMPROVEMENT_RATIO).toBe(0.025);

    const metersBelow = extract([
      candidate("meters-below", 139 + 0.01 * 0.029),
    ]);
    expect(metersBelow.candidates).toEqual([]);
    expect(metersBelow.exclusionReasonCounts).toMatchObject({
      DETOUR_ADJUSTED_IMPROVEMENT_BELOW_THRESHOLD: 1,
    });

    const longRoute = {
      ...route,
      id: "long",
      distanceMeters: 2_000,
    };
    const ratioBelow = extractFieldVerificationCandidates({
      dynamicRoutes: [longRoute],
      candidates: [candidate("ratio-below", 139 + 0.01 * 0.02)],
    });
    expect(ratioBelow.candidates).toEqual([]);
    expect(ratioBelow.exclusionReasonCounts).toMatchObject({
      DETOUR_ADJUSTED_IMPROVEMENT_BELOW_THRESHOLD: 1,
    });

    const aboveBoth = extract([
      candidate("above-both", 139 + 0.01 * 0.04),
    ]);
    expect(aboveBoth.candidates).toHaveLength(1);
    expect(aboveBoth.candidates[0].detourAdjustedImprovementMeters).toBe(40);
    expect(aboveBoth.candidates[0].detourAdjustedImprovementRatio).toBe(0.04);
  });

  it("同じ投影位置ならルートから遠い候補ほど迂回調整値と順位点が低い", () => {
    const near = extract([candidate("near", 139.005)]).candidates[0];
    const far = extract([
      candidate("far", 139.005, {
        latitude: 35.0009,
      }),
    ]).candidates[0];

    expect(far.distanceToRouteMeters).toBeGreaterThan(near.distanceToRouteMeters);
    expect(far.detourAdjustedImprovementMeters).toBeLessThan(near.detourAdjustedImprovementMeters);
    expect(far.rankingScore).toBeLessThan(near.rankingScore);
  });

  it("同じ幾何条件では公園、一般公共施設をホテルより優先する", () => {
    const atMiddle = (id, name, sourceDatasetId) => extract([
      candidate(id, 139.005, {
        name,
        source: { sourceDatasetId, sourceRecordId: id },
      }),
    ]).candidates[0];
    const park = atMiddle("park", "新宿中央公園", "daredemo-parks");
    const publicService = atMiddle("office", "新宿観光案内所", "shinjuku-public-facilities");
    const hotel = atMiddle("hotel", "新宿ホテル", "daredemo-accommodation");

    expect(park.facilityAccessCategory).toBe("public_outdoor_space");
    expect(publicService.facilityAccessCategory).toBe("public_service_facility");
    expect(hotel.facilityAccessCategory).toBe("private_hospitality");
    expect(park.rankingScore).toBeGreaterThan(publicService.rankingScore);
    expect(publicService.rankingScore).toBeGreaterThan(hotel.rankingScore);
  });

  it("学校・福祉等の慎重な施設を順位から除外して警告理由を保持する", () => {
    const school = candidate("school", 139.005, { name: "新宿養護学校" });
    expect(classifyFacilityAccess(school)).toMatchObject({
      facilityAccessCategory: "restricted_or_sensitive",
      requiresSpecialCaution: true,
      rankingEligible: false,
    });

    const result = extract([school]);
    expect(result.candidates).toEqual([]);
    expect(result.exclusions[0]).toMatchObject({
      candidateId: "school",
      reasonCode: "RESTRICTED_OR_SENSITIVE_FACILITY",
      facilityAccessCategory: "restricted_or_sensitive",
    });
  });

  it("ホテルを休憩可能と断定せず一般利用条件の確認理由と注意を付ける", () => {
    const result = extract([
      candidate("hotel", 139.005, {
        name: "新宿ホテル",
        source: {
          sourceDatasetId: "daredemo-accommodation",
          sourceRecordId: "hotel",
        },
      }),
    ]);
    const hotel = result.candidates[0];

    expect(hotel).toMatchObject({
      facilityAccessCategory: "private_hospitality",
      requiresSpecialCaution: true,
    });
    expect(hotel.selectionReasonCodes).toContain("PRIVATE_ACCESS_CONFIRMATION_NEEDED");
    expect(hotel.specialCautions.join(" ")).toContain("ホテル掲載を休憩可能の根拠にしない");
    expect(hotel.selectionReasons.join(" ")).not.toMatch(/休憩できる|自由に利用できる/);
  });

  it("複数の代表動的経路へ実際に寄与した経路数を数える", () => {
    const dynamicRoutes = [
      route,
      { ...route, id: "step_avoiding", profile: "step_avoiding", distanceMeters: 1_100 },
      { ...route, id: "wheelchair_profile", profile: "wheelchair_profile", distanceMeters: 1_200 },
    ];
    const result = extractFieldVerificationCandidates({
      dynamicRoutes,
      candidates: [candidate("middle", 139.005)],
    });

    expect(result.candidates[0]).toMatchObject({
      numberOfCoveredRoutes: 3,
      dynamicRouteIds: ["standard", "step_avoiding", "wheelchair_profile"],
    });
    expect(result.candidates[0].dynamicRouteMetrics).toHaveLength(3);
    expect(result.candidates[0].selectionReasonCodes).toContain("MULTIPLE_DYNAMIC_ROUTES");
  });

  it("固定デモと動的経路を別スコープで保持し固定値を順位寄与へ数えない", () => {
    const result = extractFieldVerificationCandidates({
      dynamicRoutes: [route],
      fixedDemoRoutes: [fixedDemoRoute],
      candidates: [candidate("middle", 139.005)],
    });
    const selected = result.candidates[0];

    expect(selected.numberOfCoveredRoutes).toBe(1);
    expect(selected.primaryRouteKey).toBe("dynamic_snapshot:standard");
    expect(selected.dynamicRouteMetrics).toEqual([
      expect.objectContaining({
        routeKey: "dynamic_snapshot:standard",
        routeSet: "dynamic_snapshot",
        contributesToRanking: true,
      }),
    ]);
    expect(selected.fixedDemoRouteMetrics).toEqual([
      expect.objectContaining({
        routeKey: "fixed_demo:standard",
        routeSet: "fixed_demo",
        contributesToRanking: false,
      }),
    ]);
  });

  it("同一施設を1地点へまとめ、複数レコードで順位を過大評価しない", () => {
    const input = [
      candidate("a", 139.005, {
        name: "同じ施設",
        address: "東京都新宿区同じ住所",
      }),
      candidate("b", 139.00501, {
        name: "同じ施設",
        address: "東京都新宿区同じ住所",
      }),
    ];
    const result = extract(input);

    expect(result.eligibleGroupCount).toBe(1);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      groupedCandidateIds: ["a", "b"],
      duplicateFacilityHandling: {
        method: "name_or_address_within_25m",
        groupedRecordCount: 2,
        countedPlaceCount: 1,
      },
    });
    expect(result.candidates[0].selectionReasonCodes).toContain("DEDUPLICATED_FACILITY");
  });

  it("同一建物の階数表記を含む住所違いを1候補へまとめる", () => {
    const input = [
      candidate("building", 139.005, {
        name: "施設",
        address: "東京都新宿区西新宿6-8-2",
      }),
      candidate("floor", 139.005, {
        name: "別組織",
        address: "東京都新宿区西新宿6-8-2 BIZ新宿4階",
      }),
    ];
    expect(extract(input).eligibleGroupCount).toBe(1);
  });

  it("近接しても名称と住所が異なる候補は統合しない", () => {
    const input = [
      candidate("a", 139.0049),
      candidate("b", 139.0051),
    ];
    expect(extract(input).eligibleGroupCount).toBe(2);
  });

  it("異名称・異住所が同一座標へ3件以上集中する品質異常を順位から除外する", () => {
    const input = [
      candidate("station-a", 139.005, { name: "A駅", address: "東京都新宿区A町" }),
      candidate("station-b", 139.005, { name: "B駅", address: "東京都新宿区B町" }),
      candidate("station-c", 139.005, { name: "C駅", address: "東京都新宿区C町" }),
    ];
    expect(extract(input)).toMatchObject({
      eligibleGroupCount: 0,
      coordinateConflictGroupCount: 1,
      excludedCoordinateConflictPlaceCount: 3,
      exclusionReasonCounts: { COORDINATE_SOURCE_ANOMALY: 3 },
      candidates: [],
    });
  });

  it("既存confirmed / supported地点と同一施設のpossible候補を抽出しない", () => {
    const input = [
      candidate("possible", 139.005, {
        name: "同じ施設",
        address: "東京都新宿区同じ住所",
      }),
      candidate("confirmed", 139.00501, {
        name: "同じ施設",
        address: "東京都新宿区同じ住所",
        category: "verified_rest_spot",
        confidence: "confirmed",
      }),
    ];
    expect(extract(input)).toMatchObject({
      eligibleGroupCount: 0,
      exclusionReasonCounts: { EXISTING_STRICT_REST_DUPLICATE: 1 },
      candidates: [],
    });
  });

  it("順位と出力が候補・経路の入力順に依存しない", () => {
    const dynamicRoutes = [
      route,
      { ...route, id: "step_avoiding", profile: "step_avoiding", distanceMeters: 1_100 },
      { ...route, id: "wheelchair_profile", profile: "wheelchair_profile", distanceMeters: 1_200 },
    ];
    const fixedDemoRoutes = [
      fixedDemoRoute,
      { ...fixedDemoRoute, id: "comfort", distanceMeters: 1_300 },
    ];
    const input = [
      candidate("park", 139.004, {
        name: "公園",
        source: { sourceDatasetId: "daredemo-parks", sourceRecordId: "park" },
      }),
      candidate("office", 139.005, { name: "観光案内所" }),
      candidate("shop", 139.006, {
        name: "商業施設",
        source: { sourceDatasetId: "daredemo-shopping", sourceRecordId: "shop" },
      }),
    ];
    const forward = extractFieldVerificationCandidates({
      dynamicRoutes,
      fixedDemoRoutes,
      candidates: input,
    });
    const reversed = extractFieldVerificationCandidates({
      dynamicRoutes: [...dynamicRoutes].reverse(),
      fixedDemoRoutes: [...fixedDemoRoutes].reverse(),
      candidates: [...input].reverse(),
    });

    expect(reversed).toEqual(forward);
    expect(forward.candidates.map((item) => item.fieldCheckPriority))
      .toEqual([1, 2, 3]);
  });

  it("上位候補に改善0m地点や学校を残さない", () => {
    const result = extract([
      candidate("valid", 139.005, { name: "新宿観光案内所" }),
      candidate("zero", 139, { name: "始点施設" }),
      candidate("school", 139.005, { name: "新宿養護学校" }),
    ]);

    expect(result.candidates.map((item) => item.candidateId)).toEqual(["valid"]);
    expect(result.candidates.every((item) => item.grossImprovementMeters > 0
      && item.grossImprovementRatio > 0)).toBe(true);
    expect(result.candidates.some((item) => /学校|養護/.test(item.name))).toBe(false);
    expect(result.exclusionReasonCounts).toMatchObject({
      NO_GROSS_GAP_IMPROVEMENT: 1,
      RESTRICTED_OR_SENSITIVE_FACILITY: 1,
    });
  });

  it("件数を水増しせず指定上限だけを適用しCSVも決定的にする", () => {
    const input = Array.from({ length: 15 }, (_, index) => candidate(
      `c-${String(index).padStart(2, "0")}`,
      139.001 + index * 0.0005,
    ));
    const a = extract(input, { limit: 12 });
    const b = extract([...input].reverse(), { limit: 12 });

    expect(a.rankedCandidateCount).toBe(15);
    expect(a.candidates).toHaveLength(12);
    expect(fieldVerificationCandidatesCsv(a.candidates))
      .toBe(fieldVerificationCandidatesCsv(b.candidates));
    expect(FIELD_VERIFICATION_CANDIDATE_CSV_HEADERS).toEqual(expect.arrayContaining([
      "facilityAccessCategory",
      "estimatedDetourLowerBoundMeters",
      "grossImprovementMeters",
      "detourAdjustedImprovementMeters",
      "detourAdjustedImprovementRatio",
      "numberOfCoveredRoutes",
      "rankingScore",
    ]));
  });
});
