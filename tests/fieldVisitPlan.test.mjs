import { describe, expect, it } from "vitest";
import {
  FIELD_VISIT_PLAN_COLUMNS,
  FIELD_VISIT_PLAN_CONFIRMATION_COLUMNS,
  deriveFieldVisitPlan,
  fieldVisitPlanCsv,
} from "../src/domain/fieldVisitPlan.mjs";

const shortlistCandidate = (visitPriority, overrides = {}) => ({
  visitPriority,
  candidateId: `candidate-${visitPriority}`,
  name: `新宿の候補${visitPriority}`,
  address: `東京都新宿区西新宿${visitPriority}`,
  latitude: 35.69 + visitPriority / 10_000,
  longitude: 139.69 + visitPriority / 10_000,
  facilityAccessCategory: "public_service_facility",
  dynamicRouteIds: ["step_avoiding"],
  distanceToRouteMeters: 20 * visitPriority,
  optimisticImprovementMeters: 300,
  lowerBoundAdjustedImprovementMeters: 200,
  conservativeProxyImprovementMeters: 100,
  top5AppearanceRate: 1,
  rankStabilityClass: "stable_top5",
  detourSensitivityClass: "robust",
  inclusionReason: "現地で確認する根拠",
  caution: "利用可否は未確認",
  ...overrides,
});

const shortlist = {
  candidates: Array.from({ length: 5 }, (_, index) => shortlistCandidate(index + 1)),
};

describe("現地調査実施計画", () => {
  it("最終shortlistの優先度と5地点をそのまま維持する", () => {
    const reversed = { candidates: [...shortlist.candidates].reverse() };
    const plan = deriveFieldVisitPlan(reversed);

    expect(plan.entries).toHaveLength(5);
    expect(plan.entries.map((entry) => entry.confirmationPriority))
      .toEqual([1, 2, 3, 4, 5]);
    expect(plan.entries.map((entry) => entry.candidateId))
      .toEqual(shortlist.candidates.map((candidate) => candidate.candidateId));
  });

  it("現地確認結果を事前入力せず、全結果列をnullにする", () => {
    const plan = deriveFieldVisitPlan(shortlist);

    for (const entry of plan.entries) {
      for (const column of FIELD_VISIT_PLAN_CONFIRMATION_COLUMNS) {
        expect(entry[column]).toBeNull();
      }
    }
    expect(plan.configuration.confirmationResultFieldsInitializedToNull).toBe(true);
  });

  it("元候補のverificationIdを保持し、なければcandidateIdから決定的に作る", () => {
    const plan = deriveFieldVisitPlan(shortlist, [
      { candidateId: "candidate-1", verificationId: "verification-official-1" },
    ]);

    expect(plan.entries[0].verificationId).toBe("verification-official-1");
    expect(plan.entries[1].verificationId).toBe("fv-candidate-2");
  });

  it("CSVをUTF-8 BOM・CRLF・日本語を保つ形式で生成し、結果列を空欄にする", () => {
    const csv = fieldVisitPlanCsv(deriveFieldVisitPlan(shortlist));
    const bytes = new TextEncoder().encode(csv);
    const [header, firstRow] = csv.slice(1).split("\r\n");
    const firstValues = firstRow.split(",");

    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder("utf-8").decode(bytes)).toContain("新宿の候補1");
    expect(header).toBe(FIELD_VISIT_PLAN_COLUMNS.join(","));
    for (const column of FIELD_VISIT_PLAN_CONFIRMATION_COLUMNS) {
      expect(firstValues[FIELD_VISIT_PLAN_COLUMNS.indexOf(column)]).toBe("");
    }
  });

  it("入力順を変えてもJSON行とCSVがバイト単位で一致する", () => {
    const first = deriveFieldVisitPlan(shortlist);
    const second = deriveFieldVisitPlan({
      candidates: [...shortlist.candidates].reverse(),
    });

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(new TextEncoder().encode(fieldVisitPlanCsv(first)))
      .toEqual(new TextEncoder().encode(fieldVisitPlanCsv(second)));
  });

  it("5地点でないshortlistや重複candidateIdを拒否する", () => {
    expect(() => deriveFieldVisitPlan({ candidates: shortlist.candidates.slice(0, 4) }))
      .toThrow("最終候補5地点");
    expect(() => deriveFieldVisitPlan({
      candidates: [
        ...shortlist.candidates.slice(0, 4),
        { ...shortlist.candidates[4], candidateId: "candidate-1" },
      ],
    })).toThrow("candidateIdが重複");
  });
});
