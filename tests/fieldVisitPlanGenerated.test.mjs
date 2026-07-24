import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  FIELD_VISIT_PLAN_CONFIRMATION_COLUMNS,
  fieldVisitPlanCsv,
} from "../src/domain/fieldVisitPlan.mjs";

const generatedUrl = (name) =>
  new URL(`../src/data/generated/${name}`, import.meta.url);
const fullGeneratedUrl = (name) =>
  new URL(`../data/generated/${name}`, import.meta.url);

describe("現地調査実施計画の生成物", () => {
  it("最終5地点とshortlist順を固定し、確認結果を空のまま保持する", async () => {
    const plan = JSON.parse(
      await readFile(generatedUrl("field-visit-plan.json"), "utf8"),
    );

    expect(plan.metadata).toMatchObject({
      schemaVersion: 1,
      datasetId: "tokyo-pace-field-visit-plan",
      sourceShortlistDatasetId: "tokyo-pace-field-visit-shortlist",
      entryCount: 5,
      confirmationResultFieldsPrefilled: false,
    });
    expect(plan.entries.map((entry) => entry.name)).toEqual([
      "新宿観光振興協会",
      "西鉄イン新宿",
      "ヒルトン東京",
      "京王プラザホテル",
      "ヨドバシカメラ新宿西口本店",
    ]);
    expect(plan.entries.map((entry) => entry.confirmationPriority))
      .toEqual([1, 2, 3, 4, 5]);
    expect(plan.entries.every((entry) =>
      FIELD_VISIT_PLAN_CONFIRMATION_COLUMNS.every((column) => entry[column] === null)))
      .toBe(true);
  });

  it("CSVとJSONを一致させ、UTF-8 BOMを付ける", async () => {
    const plan = JSON.parse(
      await readFile(generatedUrl("field-visit-plan.json"), "utf8"),
    );
    const csvBytes = await readFile(fullGeneratedUrl("field-visit-plan.csv"));

    expect([...csvBytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(csvBytes.toString("utf8")).toBe(fieldVisitPlanCsv(plan));
    expect(csvBytes.toString("utf8")).toContain("新宿観光振興協会");
  });
});
