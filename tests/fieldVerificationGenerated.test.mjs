import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  FIELD_VERIFICATION_CANDIDATE_CSV_HEADERS,
  fieldVerificationCandidatesCsv,
  runUpdate,
} from "../scripts/update-open-data.mjs";

const generatedUrl = (name) => new URL(`../data/generated/${name}`, import.meta.url);
const browserUrl = (name) => new URL(`../src/data/generated/${name}`, import.meta.url);

describe("現地確認生成物", () => {
  it("確認結果を捏造せず改善基準を満たす候補だけを自然件数で出力する", async () => {
    const verified = JSON.parse(await readFile(generatedUrl("verified-rest-spots.json"), "utf8"));
    const fieldCandidates = JSON.parse(await readFile(generatedUrl("field-verification-candidates.json"), "utf8"));
    expect(verified).toMatchObject({ metadata: { inputRowCount: 0, normalizedRecordCount: 0, excludedRecordCount: 0 }, records: [], candidates: [] });
    expect(fieldCandidates.candidates.length).toBeGreaterThanOrEqual(5);
    expect(fieldCandidates.metadata.candidateCount).toBe(fieldCandidates.candidates.length);
    expect(fieldCandidates.metadata.requestedLimit).toBeNull();
    expect(fieldCandidates.metadata.detourAccessLowerBoundFactor).toBe(1);
    expect(fieldCandidates.metadata.minimumDetourAdjustedImprovementMeters).toBe(30);
    expect(fieldCandidates.metadata.minimumDetourAdjustedImprovementRatio).toBe(0.025);
    expect(fieldCandidates.metadata.excludedCoordinateConflictPlaceCount).toBeGreaterThan(0);
    expect(fieldCandidates.candidates.map((candidate) => candidate.fieldCheckPriority)).toEqual(Array.from({ length: fieldCandidates.candidates.length }, (_, index) => index + 1));
    expect(fieldCandidates.candidates.some((candidate) => candidate.name === "JR 信濃町駅" || candidate.name === "JR 大久保駅")).toBe(false);
    expect(fieldCandidates.candidates.every((candidate) => candidate.grossImprovementMeters > 0
      && candidate.grossImprovementRatio > 0
      && candidate.detourAdjustedImprovementMeters >= 30
      && candidate.detourAdjustedImprovementRatio >= 0.025)).toBe(true);
    expect(fieldCandidates.candidates.some((candidate) => /学校|幼稚園|保育|養護/.test(candidate.name))).toBe(false);
    expect(fieldCandidates.metadata.exclusionReasonCounts).toMatchObject({
      COORDINATE_SOURCE_ANOMALY: expect.any(Number),
      DETOUR_ADJUSTED_IMPROVEMENT_BELOW_THRESHOLD: expect.any(Number),
      RESTRICTED_OR_SENSITIVE_FACILITY: expect.any(Number),
    });
  });

  it("CSVとJSON候補が新しい順位指標を含む同じ決定的内容を表す", async () => {
    const fieldCandidates = JSON.parse(await readFile(generatedUrl("field-verification-candidates.json"), "utf8"));
    const csv = await readFile(generatedUrl("field-verification-candidates.csv"), "utf8");
    expect(csv).toBe(fieldVerificationCandidatesCsv(fieldCandidates.candidates));
    expect(csv.split("\n")[0]).toBe(FIELD_VERIFICATION_CANDIDATE_CSV_HEADERS.join(","));
    expect(FIELD_VERIFICATION_CANDIDATE_CSV_HEADERS).toEqual(expect.arrayContaining([
      "facilityAccessCategory",
      "accessPrior",
      "categoryPenalty",
      "estimatedDetourLowerBoundMeters",
      "grossImprovementMeters",
      "grossImprovementRatio",
      "detourAdjustedImprovementMeters",
      "detourAdjustedImprovementRatio",
      "numberOfCoveredRoutes",
      "rankingScore",
      "selectionReasonCodes",
      "specialCautions",
    ]));
  });

  it("代表動的3経路と固定デモを分離して候補指標へ記録する", async () => {
    const fieldCandidates = JSON.parse(await readFile(generatedUrl("field-verification-candidates.json"), "utf8"));
    expect(fieldCandidates.metadata.dynamicRouteIds).toEqual([
      "standard",
      "step_avoiding",
      "wheelchair_profile",
    ]);
    expect(fieldCandidates.metadata.fixedDemoRouteIds).toEqual(["comfort", "standard"]);
    expect(fieldCandidates.metadata.dynamicRouteSnapshot).toMatchObject({
      snapshotId: "shinjuku-west-to-tocho-v1",
      sourcePath: "data/routing-snapshots/shinjuku-west-to-tocho.v1.json",
      sourceType: "openstreetmap_route",
      license: "ODbL",
    });
    for (const candidate of fieldCandidates.candidates) {
      expect(candidate.primaryRouteKey).toMatch(/^dynamic_snapshot:/);
      expect(candidate.numberOfCoveredRoutes).toBe(candidate.dynamicRouteIds.length);
      expect(candidate.dynamicRouteMetrics.every((metric) => metric.routeSet === "dynamic_snapshot")).toBe(true);
      expect(candidate.fixedDemoRouteMetrics.every((metric) => metric.routeSet === "fixed_demo"
        && metric.contributesToRanking === false)).toBe(true);
    }
  });

  it("監査へ除外候補、閾値、snapshot根拠を同じ内容で保持する", async () => {
    const fieldCandidates = JSON.parse(await readFile(generatedUrl("field-verification-candidates.json"), "utf8"));
    const audit = JSON.parse(await readFile(generatedUrl("open-data-audit.json"), "utf8"));
    const extraction = audit.fieldVerification.candidateExtraction;

    expect(extraction).toMatchObject({
      candidateCount: fieldCandidates.metadata.candidateCount,
      detourAccessLowerBoundFactor: 1,
      minimumDetourAdjustedImprovementMeters: 30,
      minimumDetourAdjustedImprovementRatio: 0.025,
      dynamicRouteSnapshot: fieldCandidates.metadata.dynamicRouteSnapshot,
      exclusionReasonCounts: fieldCandidates.metadata.exclusionReasonCounts,
      exclusions: fieldCandidates.metadata.exclusions,
    });
    expect(extraction.exclusions.some((candidate) => candidate.reasonCode === "RESTRICTED_OR_SENSITIVE_FACILITY"
      && /学校|幼稚園|保育|養護/.test(candidate.name))).toBe(true);
    expect(extraction.exclusions.some((candidate) => candidate.reasonCode === "DETOUR_ADJUSTED_IMPROVEMENT_BELOW_THRESHOLD")).toBe(true);
  });

  it("生成済み経路snapshotは3profileを一度ずつ保持する", async () => {
    const snapshot = JSON.parse(await readFile(generatedUrl("field-check-route-snapshot.json"), "utf8"));
    expect(snapshot.routes.map((route) => route.profile)).toEqual([
      "standard",
      "step_avoiding",
      "wheelchair_profile",
    ]);
    expect(snapshot.routes.every((route) => route.coordinates.length >= 2
      && route.distanceMeters > 0
      && route.sourceAttribution.includes("OpenStreetMap"))).toBe(true);
  });

  it("既存全件とブラウザ縮小データの件数を維持する", async () => {
    const full = JSON.parse(await readFile(generatedUrl("rest-candidates.json"), "utf8"));
    const browser = JSON.parse(await readFile(browserUrl("rest-candidates.json"), "utf8"));
    const verifiedBrowser = JSON.parse(await readFile(browserUrl("verified-rest-spots.json"), "utf8"));
    expect(full.candidates).toHaveLength(1907);
    expect(browser.candidates).toHaveLength(136);
    expect(verifiedBrowser.metadata).toMatchObject({ fullCandidateCount: 0, candidateCount: 0, scope: "デモルートから推定直線距離350m以内" });
  });

  it("公式manifestで出典と決定的生成日時をデータセット別に保持する", async () => {
    const manifest = JSON.parse(await readFile(generatedUrl("open-data-manifest.json"), "utf8"));
    expect(manifest).toMatchObject({ generatedBy: "TOKYO PACE" });
    expect(manifest.generatedAt).toBeTruthy();
    expect(manifest.datasets).toHaveLength(12);
    expect(manifest.datasets.every((dataset) => dataset.sourceType === "official_open_data"
      && dataset.provider && dataset.datasetName && dataset.attribution
      && dataset.generatedBy === "TOKYO PACE" && dataset.generatedAt === manifest.generatedAt)).toBe(true);
  });

  it("現地確認CSVの致命的なスキーマエラー時に既存生成物を変更しない", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "tokyo-pace-field-invalid-"));
    const existingPath = path.join(rootDir, "data/generated/verified-rest-spots.json");
    const invalidCsv = path.join(rootDir, "invalid.csv");
    await mkdir(path.dirname(existingPath), { recursive: true });
    await writeFile(existingPath, "existing-field-data\n");
    await writeFile(invalidCsv, "verificationId,candidateId\ninvalid,unknown\n");
    try {
      await expect(runUpdate({
        rootDir,
        rawSnapshotDir: new URL("../data/raw", import.meta.url).pathname,
        fieldVerificationPath: invalidCsv,
        retrievedAt: "2000-01-01T00:00:00.000Z",
      })).rejects.toThrow("必須CSVヘッダーがありません");
      expect(await readFile(existingPath, "utf8")).toBe("existing-field-data\n");
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  }, 15_000);
});
