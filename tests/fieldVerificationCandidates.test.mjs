import { describe, expect, it } from "vitest";
import { fieldVerificationCandidatesCsv } from "../scripts/update-open-data.mjs";
import { extractFieldVerificationCandidates, projectCandidateToRoute } from "../src/domain/fieldVerificationCandidates.mjs";

const route = { id: "route-a", distanceMeters: 1000, coordinates: [[35, 139], [35, 139.01]] };
const candidate = (id, longitude, overrides = {}) => ({
  id, name: "同じ施設", latitude: 35, longitude, address: "東京都新宿区同じ住所", category: "public_facility", confidence: "possible",
  source: { sourceDatasetId: "fixture", sourceRecordId: id }, ...overrides,
});

describe("現地確認候補抽出", () => {
  it("幾何進行距離をデモルート距離尺度へ正規化する", () => {
    const projected = projectCandidateToRoute(candidate("middle", 139.005), route);
    expect(projected.routeProgressMeters).toBeCloseTo(500, 0);
    expect(projected.geometryLengthMeters).not.toBe(route.distanceMeters);
  });

  it("最大空白の中点候補で改善量を決定的に算出する", () => {
    const result = extractFieldVerificationCandidates({ routes: [route], candidates: [candidate("middle", 139.005)] });
    expect(result.candidates[0]).toMatchObject({ primaryRouteId: "route-a", currentLongestGapMeters: 1000, expectedImprovedGapMeters: 500, expectedImprovementMeters: 500, expectedImprovementRatio: 0.5 });
  });

  it("同一施設をグループ化して過大評価せず入力順にも依存しない", () => {
    const input = [candidate("a", 139.005), candidate("b", 139.00501)];
    const forward = extractFieldVerificationCandidates({ routes: [route], candidates: input });
    const reversed = extractFieldVerificationCandidates({ routes: [route], candidates: [...input].reverse() });
    expect(forward).toEqual(reversed);
    expect(forward.eligibleGroupCount).toBe(1);
    expect(forward.candidates[0].groupedCandidateIds).toEqual(["a", "b"]);
  });

  it("同一建物の階数表記を含む住所違いを1候補へまとめる", () => {
    const input = [
      candidate("building", 139.005, { name: "施設", address: "東京都新宿区西新宿6-8-2" }),
      candidate("floor", 139.005, { name: "別組織", address: "東京都新宿区西新宿6-8-2 BIZ新宿4階" }),
    ];
    expect(extractFieldVerificationCandidates({ routes: [route], candidates: input }).eligibleGroupCount).toBe(1);
  });

  it("近接しても名称と住所が異なる候補は統合しない", () => {
    const input = [candidate("a", 139.005), candidate("b", 139.00501, { name: "別施設", address: "東京都新宿区別住所" })];
    expect(extractFieldVerificationCandidates({ routes: [route], candidates: input }).eligibleGroupCount).toBe(2);
  });

  it("異名称・異住所が同一座標へ3件以上集中する品質異常を統合せず順位から除外する", () => {
    const input = [
      candidate("station-a", 139.005, { name: "A駅", address: "東京都新宿区A町" }),
      candidate("station-b", 139.005, { name: "B駅", address: "東京都新宿区B町" }),
      candidate("station-c", 139.005, { name: "C駅", address: "東京都新宿区C町" }),
    ];
    expect(extractFieldVerificationCandidates({ routes: [route], candidates: input })).toMatchObject({
      eligibleGroupCount: 0,
      coordinateConflictGroupCount: 1,
      excludedCoordinateConflictPlaceCount: 3,
      candidates: [],
    });
  });

  it("既存confirmed / supported地点と同一施設のpossible候補を抽出しない", () => {
    const input = [
      candidate("possible", 139.005),
      candidate("confirmed", 139.00501, { category: "verified_rest_spot", confidence: "confirmed" }),
    ];
    expect(extractFieldVerificationCandidates({ routes: [route], candidates: input })).toMatchObject({ eligibleGroupCount: 0, candidates: [] });
  });

  it("上位12件に制限しCSVも入力順に依存しない", () => {
    const input = Array.from({ length: 15 }, (_, index) => candidate(`c-${String(index).padStart(2, "0")}`, 139.001 + index * 0.0005, { name: `施設${index}`, address: `東京都新宿区住所${index}` }));
    const a = extractFieldVerificationCandidates({ routes: [route], candidates: input });
    const b = extractFieldVerificationCandidates({ routes: [route], candidates: [...input].reverse() });
    expect(a.candidates).toHaveLength(12);
    expect(fieldVerificationCandidatesCsv(a.candidates)).toBe(fieldVerificationCandidatesCsv(b.candidates));
  });
});
