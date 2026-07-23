const detourSensitivityLabels: Record<string, string> = {
  robust: "頑健：往復直線proxyでも改善が残る",
  sensitive: "仮定に敏感：片道控除では残るが往復proxyで消える",
  marginal: "境界的：片道控除後の改善が閾値付近",
  ineffective: "改善がほぼ残らない",
};

const rankStabilityLabels: Record<string, string> = {
  stable_top5: "上位5に安定",
  resilient_top5: "おおむね上位5",
  mostly_top5: "おおむね上位5",
  variable: "重みによって順位が変動",
  consistently_outside_top5: "上位5外で安定",
  outside_top5: "上位5外で安定",
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

export function getTwoAxisClassificationLabel(value: string): string {
  return twoAxisLabels[value] ?? value;
}
