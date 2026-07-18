import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DATASETS, findDuplicateCandidates, normalizeDataset, parseCsv, runUpdate } from "../scripts/update-open-data.mjs";

const fixtureUrl = new URL("./fixtures/shinjuku-toilets.csv", import.meta.url);

describe("公式オープンデータ正規化", () => {
  it("引用符とカンマを含むCSVを正しく解析する", async () => {
    const csv = await readFile(fixtureUrl, "utf8");
    expect(parseCsv(csv).records[0]["名称"]).toBe("公園, 東側トイレ");
  });

  it("座標欠損と不正数値を理由別に除外する", async () => {
    const csv = await readFile(fixtureUrl, "utf8");
    const result = normalizeDataset(csv, DATASETS[0], "2026-07-18T00:00:00.000Z");
    expect(result.records).toHaveLength(2);
    expect(result.exclusionReasons).toEqual({ "緯度または経度が不正な数値": 1, "緯度または経度が空欄": 1 });
  });

  it("空欄をfalseではなくnullとして公式データにする", async () => {
    const csv = await readFile(fixtureUrl, "utf8");
    const result = normalizeDataset(csv, DATASETS[0], "2026-07-18T00:00:00.000Z");
    const unknown = result.records.find((record) => record.id === "shinjuku-004");
    expect(unknown.wheelchairAccessible).toBeNull();
    expect(unknown.confidence).toBe("official");
    expect(unknown.confidence).not.toBe("estimated");
  });

  it("重複候補処理が決定的で、根拠なく自動統合しない", () => {
    const base = { latitude: 35.69, longitude: 139.69, address: "東京都新宿区西新宿1", source: { datasetName: "A" } };
    const records = [
      { ...base, id: "a", name: "中央 トイレ" },
      { ...base, id: "b", name: "中央トイレ", longitude: 139.69001, source: { datasetName: "B" } },
      { ...base, id: "c", name: "別施設", longitude: 139.7, source: { datasetName: "C" } },
    ];
    expect(findDuplicateCandidates(records)).toEqual(findDuplicateCandidates(records));
    expect(findDuplicateCandidates(records)).toEqual([{ ids: ["a", "b"], reason: "名称と座標が近接" }]);
    expect(records).toHaveLength(3);
  });

  it("取得失敗時に既存の生成ファイルを破壊しない", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "tokyo-pace-"));
    const generatedPath = path.join(rootDir, "src/data/generated/official-toilets.json");
    await mkdir(path.dirname(generatedPath), { recursive: true });
    await writeFile(generatedPath, "existing-normal-data\n");
    const failedFetch = async () => new Response("failure", { status: 503 });
    await expect(runUpdate({ rootDir, fetchImpl: failedFetch, retrievedAt: "2026-07-18T00:00:00.000Z" })).rejects.toThrow("HTTP 503");
    expect(await readFile(generatedPath, "utf8")).toBe("existing-normal-data\n");
    await rm(rootDir, { recursive: true, force: true });
  });
});
