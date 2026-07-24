import { describe, expect, it } from "vitest";
import {
  DATASET_FRESHNESS_THRESHOLDS,
  evaluateDatasetFreshness,
  summarizeDataFreshness,
} from "../src/domain/dataFreshness";
import type { OpenDataManifest, OpenDataManifestEntry } from "../src/types";

const entry = (
  datasetId: string,
  retrievedAt: string,
  lastUpdateStatus?: "success" | "failed",
): OpenDataManifestEntry => ({
  datasetId,
  datasetUrl: "https://example.test/dataset",
  resourceUrl: "https://example.test/resource.csv",
  retrievedAt,
  contentSha256: "a".repeat(64),
  byteSize: 10,
  normalizedRecordCount: 1,
  excludedRecordCount: 0,
  sourceUpdatedAt: null,
  encoding: "utf-8",
  license: "CC BY",
  lastUpdateStatus,
});

const manifest = (datasets: OpenDataManifestEntry[]): OpenDataManifest => ({
  schemaVersion: 1,
  datasets,
});

describe("オープンデータ鮮度", () => {
  const now = new Date("2026-07-24T00:00:00.000Z");

  it("データセットごとの更新頻度を用い、単一閾値を適用しない", () => {
    expect(DATASET_FRESHNESS_THRESHOLDS["shinjuku-public"].currentMaxAgeDays).toBe(45);
    expect(DATASET_FRESHNESS_THRESHOLDS["tokyo-drinking-stations"].currentMaxAgeDays).toBe(120);
    expect(DATASET_FRESHNESS_THRESHOLDS["tokyo-public-accessible"].currentMaxAgeDays).toBe(180);
  });

  it.each([
    ["2026-07-01T00:00:00.000Z", "current"],
    ["2026-05-24T00:00:00.000Z", "aging"],
    ["2026-01-01T00:00:00.000Z", "stale"],
  ] as const)("新宿区データを %s なら %s と判定する", (retrievedAt, expected) => {
    expect(evaluateDatasetFreshness(entry("shinjuku-public", retrievedAt), now).state).toBe(expected);
  });

  it("明示的な更新失敗をupdate_failedとして保持する", () => {
    expect(evaluateDatasetFreshness(entry("tokyo-drinking-stations", "2026-07-23T00:00:00.000Z", "failed"), now).state).toBe("update_failed");
  });

  it("不正な取得日時をupdate_failedとして安全側に判定する", () => {
    expect(evaluateDatasetFreshness(entry("tokyo-public-accessible", "invalid"), now).state).toBe("update_failed");
  });

  it("全件currentならデータ更新済みと表示する", () => {
    const result = summarizeDataFreshness(manifest([
      entry("shinjuku-public", "2026-07-20T00:00:00.000Z"),
      entry("tokyo-public-accessible", "2026-07-20T00:00:00.000Z"),
    ]), now);
    expect(result.state).toBe("current");
    expect(result.label).toBe("データ更新済み");
    expect(result.warnings).toEqual([]);
  });

  it("agingとstaleを集約し、対象データセットを決定的に示す", () => {
    const result = summarizeDataFreshness(manifest([
      entry("tokyo-public-accessible", "2025-12-01T00:00:00.000Z"),
      entry("shinjuku-public", "2026-01-01T00:00:00.000Z"),
    ]), now);
    expect(result.state).toBe("stale");
    expect(result.label).toBe("一部データの更新が遅れています");
    expect(result.warnings).toEqual([
      "shinjuku-public: stale",
      "tokyo-public-accessible: aging",
    ]);
  });
});
