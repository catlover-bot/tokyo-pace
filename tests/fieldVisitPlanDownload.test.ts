import { describe, expect, it } from "vitest";
import { fieldVisitPlan } from "../src/data/fieldVisitPlan";
import { buildGeneratedFieldVisitPlanCsv } from "../src/domain/fieldVisitPlanDownload";

describe("生成済み現地調査用5地点CSVのブラウザ用アダプター", () => {
  it("UTF-8 BOM付きで最終5地点だけを決定的に出力する", () => {
    const first = buildGeneratedFieldVisitPlanCsv();
    const second = buildGeneratedFieldVisitPlanCsv();
    expect(first.charCodeAt(0)).toBe(0xfeff);
    expect(first).toBe(second);
    expect(first.trim().split(/\r?\n/)).toHaveLength(fieldVisitPlan.length + 1);
    expect(fieldVisitPlan).toHaveLength(5);
  });
});
