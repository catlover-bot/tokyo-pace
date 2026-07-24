const detourSensitivityLabels: Record<string, string> = {
  robust: "検討した迂回条件でも改善が残る",
  sensitive: "片道直線控除後は改善が残るが、往復直線proxyでは改善が消える",
  marginal: "片道直線控除後の改善が閾値付近",
  ineffective: "検討した迂回条件では改善がほぼ残らない",
};

const rankStabilityLabels: Record<string, string> = {
  stable_top5: "検討した重み設定すべてで上位5",
  resilient_top5: "検討した重み設定の多くで上位5",
  mostly_top5: "検討した重み設定の多くで上位5",
  variable: "検討した重み設定によって順位が変動",
  consistently_outside_top5: "検討した重み設定では上位5外",
  outside_top5: "検討した重み設定では上位5外",
};

const twoAxisLabels: Record<string, string> = {
  high_improvement_verification_priority: "高改善・確認優先",
  high_improvement_confirmation_priority: "高改善・確認優先",
  high_improvement_access_uncertain: "高改善・利用条件不確実",
  low_improvement_easy_to_verify: "低改善・確認しやすい",
  low_priority: "低優先",
};

export function getDetourSensitivityLabel(value: string): string {
  return detourSensitivityLabels[value] ?? value;
}

export function getRankStabilityLabel(value: string): string {
  return rankStabilityLabels[value] ?? value;
}

export function getRankStabilityDescription(
  top5AppearanceRate: number,
  scenarioCount: number,
): string {
  const boundedScenarioCount = Math.max(0, Math.trunc(scenarioCount));
  const boundedRate = Math.min(1, Math.max(0, top5AppearanceRate));
  const appearanceCount = Math.round(boundedRate * boundedScenarioCount);
  if (boundedScenarioCount > 0 && appearanceCount === boundedScenarioCount) {
    return `検討した${boundedScenarioCount}設定すべてで上位5`;
  }
  const percentage = Math.round(boundedRate * 1000) / 10;
  if (boundedScenarioCount === 0) return `上位5出現率 ${percentage}%`;
  return `検討した${boundedScenarioCount}設定の${percentage}%（${appearanceCount}/${boundedScenarioCount}）で上位5`;
}

export function getTwoAxisClassificationLabel(value: string): string {
  return twoAxisLabels[value] ?? value;
}

export function getVerificationValueLabel(value: string): string {
  switch (value) {
    case "clear_public_purpose":
      return "公共施設として確認価値が高い";
    case "official_or_commercial_purpose_rest_use_unknown":
      return "商業施設の利用条件を現地で確認する価値がある";
    case "special_access_conditions_unknown":
      return "入館・利用条件の現地確認価値が高い";
    default:
      return "一般利用と休憩条件を現地で確認する価値がある";
  }
}

export function getShortlistRoleLabel(value: string): string {
  switch (value) {
    case "clear_public_verification":
      return "公共施設の基準確認候補";
    case "robust_improvement":
      return "検討した迂回条件でも改善が残る候補";
    case "boundary_model_check":
      return "片道直線控除後の改善が閾値付近の検証候補";
    default:
      return "現地条件を確認する候補";
  }
}
