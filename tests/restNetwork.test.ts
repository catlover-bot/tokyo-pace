// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck -- fixture I/O and the JavaScript update script are exercised by Vitest.
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { REST_DATASETS, normalizeRestDataset } from "../scripts/update-open-data.mjs";
import { demoRoutes } from "../src/data/routes";
import { deriveCandidateGaps, deriveRestConfidence, evaluateRestNetwork, sortCandidatesByRouteProgress, suggestRestInsertion } from "../src/domain/restNetwork";
import type { RestCandidate } from "../src/types";

const source = { provider: "fixture", datasetName: "fixture", datasetUrl: null, resourceUrl: null, license: "CC BY", datasetUpdatedAt: null, retrievedAt: null, fieldVerifiedAt: null };
const candidate = (id: string, longitude: number, overrides: Partial<RestCandidate> = {}): RestCandidate => ({ id, name: id, latitude: 0, longitude, address: null, category: "verified_rest_spot", confidence: "confirmed", openingHours: null, indoor: null, seating: true, drinkingWaterAvailable: null, wheelchairAccessible: null, source, ...overrides });
const route = { ...demoRoutes[0], coordinates: [[0, 0], [0, 0.01]] as [number, number][], distanceMeters: 1000, durationMinutes: 20 };

describe("公式休憩候補データ", () => {
  it("3データセットのfixtureを解析し、空欄をnullにする", async () => {
    const files = ["drinking-stations.csv", "public-facilities.csv", "daredemo.csv"]; const datasets = [REST_DATASETS[0], REST_DATASETS[1], REST_DATASETS[2]];
    const results = await Promise.all(files.map(async (file, index) => normalizeRestDataset(await readFile(new URL(`./fixtures/${file}`, import.meta.url), "utf8"), datasets[index], "2026-01-01T00:00:00Z")));
    expect(results.map((x) => x.records.length)).toEqual([1, 1, 1]); expect(results[0].records[0].seating).toBeNull(); expect(results[1].records[0].drinkingWaterAvailable).toBeNull();
  });
  it("公式・推定・現地確認済みを根拠なく昇格させない", () => { expect(deriveRestConfidence(candidate("v", 0, { category: "verified_rest_spot", source: { ...source, fieldVerifiedAt: "2026-01-01" } }))).toBe("possible"); expect(deriveRestConfidence(candidate("e", 0, { category: "estimated_rest_spot" }))).toBe("estimated"); expect(deriveRestConfidence(candidate("p", 0, { category: "public_facility", seating: null }))).toBe("possible"); });
});

describe("休憩ネットワーク", () => {
  it("候補をルート進行順とIDで決定的に並べる", () => expect(sortCandidatesByRouteProgress([candidate("b", .008), candidate("a", .002)], route).map((x) => x.candidate.id)).toEqual(["a", "b"]));
  it("開始・終了を含め最長空白を算出する", () => expect(deriveCandidateGaps(route, [candidate("a", .002), candidate("b", .008)]).segments.map((x) => Math.round(x.gapMeters))).toEqual([200, 600, 200]));
  it("候補なしは全長を空白にする", () => expect(deriveCandidateGaps(route, []).longestGapMeters).toBe(1000));
  it("給水・屋内・休憩の空白を別々に算出する", () => { const x = evaluateRestNetwork(route, [candidate("rest", .005), candidate("water", .002, { category: "drinking_station", seating: null, drinkingWaterAvailable: true }), candidate("indoor", .008, { indoor: true })], 10, true); expect(x.longestRestGapMeters).not.toBe(x.longestDrinkingWaterGapMeters); expect(x.longestIndoorCandidateGapMeters).toBeGreaterThan(0); });
  it("信頼度別成立判定を最大連続歩行と分離する", () => { const x = evaluateRestNetwork(route, [candidate("middle", .005)], 10, false); expect(x.continuityFeasibleBySegment).toBe(false); expect(x.continuityFeasibleByRestNetwork).toBe(true); expect(x.restNetworkLevel).toBe("confirmed"); });
  it("possibleとestimatedを厳格な休憩ネットワークへ含めない", () => { const x = evaluateRestNetwork(route, [candidate("possible", .005, { confidence: "possible" }), candidate("estimated", .005, { confidence: "estimated", category: "estimated_rest_spot" })], 10, false); expect(x.strictRestCandidateCount).toBe(0); expect(x.longestRestGapMeters).toBe(1000); expect(x.continuityFeasibleByRestNetwork).toBe(false); expect(x.referencePossibleCandidateCount).toBe(1); expect(x.referenceEstimatedCandidateCount).toBe(1); });
  it("現地確認0件では前後差を捏造しない", () => { const x = evaluateRestNetwork(route, [], 10, false); expect(x.fieldVerificationComparison.hasFieldVerificationData).toBe(false); expect(x.fieldVerificationComparison.before).toEqual(x.fieldVerificationComparison.after); expect(x.fieldVerificationComparison.improvementMeters).toBe(0); expect(x.fieldVerificationComparison.improvementRatio).toBe(0); });
  it("現地確認済み地点による前後の空白と理論追加候補を分離する", () => { const verified = candidate("verified", .005, { fieldVerificationId: "fv-1", source: { ...source, fieldVerifiedAt: "2026-07-19T00:00:00.000Z" } }); const x = evaluateRestNetwork(route, [verified], 10, false); expect(x.fieldVerificationComparison.hasFieldVerificationData).toBe(true); expect(x.fieldVerificationComparison.before.longestRestGapMeters).toBe(1000); expect(Math.round(x.fieldVerificationComparison.after.longestRestGapMeters)).toBe(500); expect(Math.round(x.fieldVerificationComparison.improvementMeters)).toBe(500); expect(x.fieldVerificationComparison.before.restInsertionSuggestion.suggestedRestInsertionProgressMeters).toBe(500); expect(x.fieldVerificationComparison.after.restInsertionSuggestion.suggestedRestInsertionProgressMeters).not.toBe(x.fieldVerificationComparison.before.restInsertionSuggestion.suggestedRestInsertionProgressMeters); });
  it("追加地点で最大空白・改善量・改善率を短縮する", () => { const x = suggestRestInsertion(route, deriveCandidateGaps(route, [candidate("quarter", .0025)]).segments); expect(x.improvedLongestRestGapMeters).toBeLessThan(x.currentLongestRestGapMeters); expect(x.improvementMeters).toBeGreaterThan(0); expect(x.improvementRatio).toBeGreaterThan(0); });
  it("入力順に依存しない", () => { const items = [candidate("a", .002), candidate("b", .008)]; expect(deriveCandidateGaps(route, items)).toEqual(deriveCandidateGaps(route, [...items].reverse())); });
});
