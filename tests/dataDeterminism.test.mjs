import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { contentSha256, retainedRetrievedAt, resolveRetrievedAt, sortNormalizedRecords, stableJson } from "../scripts/update-open-data.mjs";

const source = (dataset, record) => ({ sourceDatasetId: dataset, sourceRecordId: record, provider: "fixture", datasetName: dataset, datasetUrl: null, resourceUrl: null, license: "CC BY", datasetUpdatedAt: null, fieldVerifiedAt: null });
const record = (id, dataset = "b") => ({ id, name: id, latitude: 35, longitude: 139, source: source(dataset, id) });

describe("生成物の再現性", () => {
  it("同一データからバイト単位で同じJSONを生成する", () => { const value = { records: sortNormalizedRecords([record("b"), record("a")]) }; expect(Buffer.from(stableJson(value))).toEqual(Buffer.from(stableJson(value))); });
  it("入力順が変わっても生成順とJSONが一致する", () => { const a = [record("b"), record("a", "a")]; expect(stableJson(sortNormalizedRecords(a))).toBe(stableJson(sortNormalizedRecords([...a].reverse()))); });
  it("同じcontent hashではretrievedAtを維持する", () => { const old = { contentSha256: contentSha256(Buffer.from("same")), retrievedAt: "old" }; expect(retainedRetrievedAt(old, old.contentSha256, "new")).toBe("old"); });
  it("content hashが変わればretrievedAtを更新する", () => { const old = { contentSha256: contentSha256(Buffer.from("old")), retrievedAt: "old" }; expect(retainedRetrievedAt(old, contentSha256(Buffer.from("new")), "new")).toBe("new"); });
  it("manifestから取得日時を解決する", () => { const manifest = { datasets: [{ datasetId: "a", retrievedAt: "time" }] }; expect(resolveRetrievedAt("a", manifest)).toBe("time"); });
  it("公式レコード本体にretrievedAtを重複保存しない", async () => { const generated = JSON.parse(await readFile(new URL("../data/generated/official-toilets.json", import.meta.url), "utf8")); expect(generated.records).toHaveLength(9247); expect(generated.records.every((item) => !("retrievedAt" in item.source))).toBe(true); });
  it("全件版とブラウザ縮小版を区別する", async () => { const full = JSON.parse(await readFile(new URL("../data/generated/rest-candidates.json", import.meta.url), "utf8")); const browser = JSON.parse(await readFile(new URL("../src/data/generated/rest-candidates.json", import.meta.url), "utf8")); expect(full.candidates).toHaveLength(1907); expect(browser.candidates.length).toBeLessThan(full.candidates.length); expect(browser.records).toBeUndefined(); });
});
