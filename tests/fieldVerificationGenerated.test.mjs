import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fieldVerificationCandidatesCsv, runUpdate } from "../scripts/update-open-data.mjs";

const generatedUrl = (name) => new URL(`../data/generated/${name}`, import.meta.url);
const browserUrl = (name) => new URL(`../src/data/generated/${name}`, import.meta.url);

describe("現地確認生成物", () => {
  it("初期CSVは確認結果を捏造せず品質異常を除いた上位10〜15候補を出力する", async () => {
    const verified = JSON.parse(await readFile(generatedUrl("verified-rest-spots.json"), "utf8"));
    const fieldCandidates = JSON.parse(await readFile(generatedUrl("field-verification-candidates.json"), "utf8"));
    expect(verified).toMatchObject({ metadata: { inputRowCount: 0, normalizedRecordCount: 0, excludedRecordCount: 0 }, records: [], candidates: [] });
    expect(fieldCandidates.candidates.length).toBeGreaterThanOrEqual(10);
    expect(fieldCandidates.candidates.length).toBeLessThanOrEqual(15);
    expect(fieldCandidates.metadata.candidateCount).toBe(fieldCandidates.candidates.length);
    expect(fieldCandidates.metadata.excludedCoordinateConflictPlaceCount).toBeGreaterThan(0);
    expect(fieldCandidates.candidates.map((candidate) => candidate.fieldCheckPriority)).toEqual(Array.from({ length: fieldCandidates.candidates.length }, (_, index) => index + 1));
    expect(fieldCandidates.candidates.some((candidate) => candidate.name === "JR 信濃町駅" || candidate.name === "JR 大久保駅")).toBe(false);
  });

  it("CSVとJSON候補が同じ決定的内容を表す", async () => {
    const fieldCandidates = JSON.parse(await readFile(generatedUrl("field-verification-candidates.json"), "utf8"));
    expect(await readFile(generatedUrl("field-verification-candidates.csv"), "utf8")).toBe(fieldVerificationCandidatesCsv(fieldCandidates.candidates));
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
