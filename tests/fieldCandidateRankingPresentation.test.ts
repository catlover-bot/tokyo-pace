import { describe, expect, it } from "vitest";
import {
  getDetourSensitivityLabel,
  getRankStabilityDescription,
  getShortlistRoleLabel,
  getVerificationValueLabel,
} from "../src/domain/fieldCandidateRankingPresentation";

describe("現地確認順位の利用者向け説明", () => {
  it("頑健性コードを分析した迂回条件の範囲へ限定して説明する", () => {
    expect(getDetourSensitivityLabel("robust")).toBe("検討した迂回条件でも改善が残る");
    expect(getDetourSensitivityLabel("sensitive")).toContain("往復直線proxyでは改善が消える");
    expect(getDetourSensitivityLabel("marginal")).toBe("片道直線控除後の改善が閾値付近");
    expect(getDetourSensitivityLabel("robust")).not.toContain("すべて");
  });

  it("15設定すべてと80%を件数付きで区別する", () => {
    expect(getRankStabilityDescription(1, 15)).toBe("検討した15設定すべてで上位5");
    expect(getRankStabilityDescription(0.8, 15)).toBe(
      "検討した15設定の80%（12/15）で上位5",
    );
  });

  it("移動改善効果とは別に現地確認価値と採用役割を説明する", () => {
    expect(getVerificationValueLabel("clear_public_purpose"))
      .toBe("公共施設として確認価値が高い");
    expect(getVerificationValueLabel("special_access_conditions_unknown"))
      .toBe("入館・利用条件の現地確認価値が高い");
    expect(getShortlistRoleLabel("clear_public_verification"))
      .toBe("公共施設の基準確認候補");
    expect(getShortlistRoleLabel("boundary_model_check"))
      .toContain("閾値付近");
  });
});
