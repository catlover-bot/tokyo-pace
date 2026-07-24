import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FieldCheckPage } from "../src/components/FieldCheckPage";
import type {
  FieldCandidateRankingSensitivity,
  FieldVerificationCandidate,
  FieldVerificationRouteMetric,
  FieldVisitShortlistEntry,
} from "../src/types";

const metric: FieldVerificationRouteMetric = {
  routeId: "standard",
  routeKey: "dynamic_snapshot:standard",
  routeSet: "dynamic_snapshot",
  profile: "standard",
  routeDistanceMeters: 1000,
  distanceToRouteMeters: 38.4,
  geometryProgressMeters: 400,
  routeProgressMeters: 410,
  nearestPointCoordinate: [35.6902, 139.6942],
  currentLongestGapMeters: 819,
  expectedImprovedGapMeters: 430,
  expectedImprovementMeters: 389,
  expectedImprovementRatio: 0.475,
  grossImprovementMeters: 389,
  grossImprovementRatio: 0.475,
  estimatedDetourLowerBoundMeters: 38.4,
  detourAdjustedImprovementMeters: 350.6,
  detourAdjustedImprovementRatio: 0.428,
  suggestedInsertionProgressMeters: 500,
  suggestedInsertionCoordinate: [35.6903, 139.6943],
  distanceToSuggestedInsertionMeters: 12,
  insideLargestGap: true,
  contributesToRanking: true,
};

function candidate(
  candidateId: string,
  name: string,
  rank: number,
  overrides: Partial<FieldVerificationCandidate> = {},
): FieldVerificationCandidate {
  return {
    candidateId,
    verificationId: `fv-${candidateId}`,
    name,
    latitude: 35.6901 + rank / 10000,
    longitude: 139.694,
    address: `東京都新宿区西新宿${rank}`,
    categories: ["public_facility"],
    facilityAccessCategory: "public_service_facility",
    facilityAccessCategoryLabel: "一般利用目的が明確な公共施設",
    accessPrior: 85,
    categoryPenalty: 5,
    categoryReasonCodes: ["PUBLIC_SERVICE_NAME"],
    categoryReasons: ["一般利用目的を確認できる"],
    requiresSpecialCaution: false,
    specialCautions: ["開館時間と休憩スペースの利用条件を確認する。"],
    officialSourceQuality: "high",
    officialSourceQualityScore: 36,
    dynamicRouteIds: ["standard"],
    fixedDemoRouteIds: ["comfort"],
    routeIds: ["standard"],
    primaryRouteId: "standard",
    primaryRouteKey: "dynamic_snapshot:standard",
    numberOfCoveredRoutes: 1,
    distanceToRouteMeters: 38.4,
    routeProgressMeters: 410,
    estimatedDetourLowerBoundMeters: 38.4,
    nearestPointCoordinate: [35.6902, 139.6942],
    theoreticalInsertionCoordinate: [35.6903, 139.6943],
    currentLongestGapMeters: 819,
    expectedImprovedGapMeters: 430,
    expectedImprovementMeters: 389,
    expectedImprovementRatio: 0.475,
    grossImprovementMeters: 389,
    grossImprovementRatio: 0.475,
    detourAdjustedImprovementMeters: 350.6,
    detourAdjustedImprovementRatio: 0.428,
    distanceToSuggestedInsertionMeters: 12,
    rankingScore: 170 - rank,
    rankingScoreBreakdown: {
      improvementMetersPoints: 40,
      improvementRatioPoints: 20,
      routeProximityPoints: 30,
      accessPriorPoints: 50,
      coveredRoutesPoints: 10,
      officialSourceQualityPoints: 20,
      categoryPenalty: 5,
      duplicateFacilityPenalty: 2,
      total: 163,
    },
    selectionReasonCodes: ["DETOUR_ADJUSTED_IMPROVEMENT"],
    selectionReasons: ["迂回調整後も改善が残る"],
    officialSourceIds: ["shinjuku-public-facilities:record-1"],
    groupedCandidateIds: [candidateId],
    duplicateFacilityHandling: {
      method: "name_or_address_within_25m",
      groupedRecordCount: 1,
      countedPlaceCount: 1,
    },
    existingStrictOverlap: false,
    fieldCheckPriority: rank,
    routeMetrics: [metric],
    dynamicRouteMetrics: [metric],
    fixedDemoRouteMetrics: [],
    ...overrides,
  };
}

const first = candidate("facility-a", "確認候補A", 1);
const second = candidate("facility-b", "確認候補B", 2, {
  verificationId: "manual-verification-b",
  address: null,
  facilityAccessCategory: "private_hospitality",
  facilityAccessCategoryLabel: "ホテル等の民間施設",
  requiresSpecialCaution: true,
  specialCautions: ["ホテル掲載を休憩可能の根拠にせず、一般利用条件を確認する。"],
});

function analysis(
  value: FieldVerificationCandidate,
  overrides: Partial<FieldCandidateRankingSensitivity> = {},
): FieldCandidateRankingSensitivity {
  return {
    candidateId: value.candidateId,
    name: value.name,
    address: value.address,
    latitude: value.latitude,
    longitude: value.longitude,
    facilityAccessCategory: value.facilityAccessCategory,
    facilityAccessCategoryLabel: value.facilityAccessCategoryLabel,
    primaryRouteId: value.primaryRouteId,
    dynamicRouteIds: value.dynamicRouteIds,
    numberOfCoveredRoutes: value.numberOfCoveredRoutes,
    distanceToRouteMeters: value.distanceToRouteMeters,
    optimisticImprovementMeters: 389,
    lowerBoundAdjustedImprovementMeters: 351,
    conservativeProxyImprovementMeters: 312,
    optimisticImprovementRatio: 0.475,
    lowerBoundAdjustedImprovementRatio: 0.428,
    conservativeProxyImprovementRatio: 0.381,
    detourSensitivityClass: "robust",
    baselineRank: value.fieldCheckPriority,
    bestRank: 1,
    worstRank: 2,
    meanRank: 1.4,
    top5AppearanceRate: 1,
    rankStabilityClass: "stable_top5",
    twoAxisClassification: "high_improvement_verification_priority",
    isParetoNonDominated: true,
    mobilityImprovementEvaluation: {
      conservativeProxyImprovementMeters: 312,
      conservativeProxyImprovementRatio: 0.381,
      numberOfCoveredRoutes: value.numberOfCoveredRoutes,
      distanceToRouteMeters: value.distanceToRouteMeters,
    },
    verificationValue: {
      generalUsePurposeClarity: value.facilityAccessCategory === "private_hospitality"
        ? "special_access_conditions_unknown"
        : "clear_public_purpose",
      generalUsePurposeClarityScore: value.facilityAccessCategory === "private_hospitality" ? 1 : 3,
      officialSourceQuality: value.officialSourceQuality,
      officialSourceQualityScore: value.officialSourceQualityScore,
      onSiteResolutionNeed: "high",
      accessRestrictionConcern: value.facilityAccessCategory === "private_hospitality" ? "high" : "low",
    },
    ...overrides,
  };
}

const firstAnalysis = analysis(first);
const secondAnalysis = analysis(second, {
  top5AppearanceRate: 0.8,
  rankStabilityClass: "resilient_top5",
  twoAxisClassification: "high_improvement_access_uncertain",
});

function shortlist(
  value: FieldCandidateRankingSensitivity,
  visitPriority: number,
  overrides: Partial<FieldVisitShortlistEntry> = {},
): FieldVisitShortlistEntry {
  return {
    ...value,
    visitPriority,
    shortlistRole: visitPriority === 1 ? "robust_improvement" : "clear_public_verification",
    inclusionReasonCode: "TEST_REASON",
    inclusionReason: "この地点の現地条件を確認する。",
    checkItems: ["一般利用条件"],
    caution: "利用可否は未確認",
    ...overrides,
  };
}

const firstShortlist = shortlist(firstAnalysis, 2, {
  shortlistRole: "clear_public_verification",
});
const secondShortlist = shortlist(secondAnalysis, 1);

function render(
  candidates: FieldVerificationCandidate[] = [second, first],
  analyses: FieldCandidateRankingSensitivity[] = [secondAnalysis, firstAnalysis],
  shortlistEntries: FieldVisitShortlistEntry[] = [firstShortlist, secondShortlist],
) {
  const ids = new Set(candidates.map((value) => value.candidateId));
  return renderToStaticMarkup(
    <FieldCheckPage
      candidates={candidates}
      metadata={{ preRankingGroupCount: 197, candidateCount: candidates.length }}
      rankingSensitivity={analyses.filter((value) => ids.has(value.candidateId))}
      rankingSensitivityMetadata={{ weightScenarioCount: 15 }}
      visitShortlist={shortlistEntries.filter((value) => ids.has(value.candidateId))}
      visitShortlistMetadata={{ entryCount: shortlistEntries.length }}
    />,
  );
}

describe("現地調査実施版のfield-check画面", () => {
  it("本文へのスキップリンクとランドマーク、方針導線を持つ", () => {
    const html = render();
    expect(html).toContain('<a class="skip-link" href="#main-content">本文へスキップ</a>');
    expect(html).toContain('<main id="main-content"');
    expect(html).toContain('aria-label="サービス方針"');
    expect(html).toContain('href="/accessibility"');
  });

  it("目的、概要、地図、優先5カード、CSV、その他候補、制約の順に並べる", () => {
    const html = render();
    const markers = [
      'id="field-check-title"',
      'id="field-overview-title"',
      'id="field-map-title"',
      'id="field-candidate-title"',
      'id="field-csv-title"',
      'id="field-other-title"',
      'id="field-method-title"',
    ];
    for (let index = 1; index < markers.length; index += 1) {
      expect(html.indexOf(markers[index - 1])).toBeLessThan(html.indexOf(markers[index]));
    }
  });

  it("利用者向け用語を現地確認の優先順位へ統一し最短巡回順ではないと示す", () => {
    const html = render();
    expect(html).toContain("現地確認の優先順位");
    expect(html).toContain("優先的に確認する5地点");
    expect(html).toContain("確認優先度 1");
    expect(html).toContain("地理的な訪問順");
    expect(html).toContain("表示順は最短巡回順ではありません");
    expect(html).not.toContain("推奨訪問順");
    expect(html).not.toContain("訪問推奨");
  });

  it("現地確認の優先順位と単一スコア順位を別の順で表示する", () => {
    const html = render();
    const priority = html.slice(
      html.indexOf('class="field-priority-overview-list"'),
      html.indexOf('class="field-baseline-analysis-details"'),
    );
    const baseline = html.slice(
      html.indexOf('class="field-baseline-analysis-details"'),
      html.indexOf('id="field-map-title"'),
    );
    expect(priority.indexOf("確認候補B")).toBeLessThan(priority.indexOf("確認候補A"));
    expect(baseline.indexOf("確認候補A")).toBeLessThan(baseline.indexOf("確認候補B"));
  });

  it("単一スコア順位を初期状態が閉じた技術分析へ移す", () => {
    const html = render();
    expect(html).toContain('<details class="field-baseline-analysis-details">');
    expect(html).not.toContain('<details class="field-baseline-analysis-details" open="">');
    expect(html).toContain("技術分析：基準重みの単一スコア順位を見る");
  });

  it("最終候補とその他候補を分け、その他候補を初期状態で閉じる", () => {
    const html = render([second, first], [secondAnalysis, firstAnalysis], [firstShortlist]);
    const priority = html.slice(
      html.indexOf("field-priority-candidate-list"),
      html.indexOf('id="field-csv-title"'),
    );
    const other = html.slice(html.indexOf('class="field-other-candidates-details"'));
    expect(priority).toContain("確認候補A");
    expect(priority).not.toContain("確認候補B");
    expect(other).toContain("確認候補B");
    expect(html).not.toContain('<details class="field-other-candidates-details" open="">');
    expect(html).toContain("分析対象から除外した地点ではありません");
  });

  it("現場用カードの常時情報を表示する", () => {
    const html = render([first], [firstAnalysis], [firstShortlist]);
    for (const text of [
      "確認優先度 2",
      "確認候補A",
      "東京都新宿区西新宿1",
      "施設カテゴリ",
      "対象動的経路",
      "ルートからの距離",
      "推定直線38m",
      "検討した迂回条件での改善概要",
      "確認優先順位に含めた理由",
      "現地確認上の注意",
      "verificationId",
      "candidateId",
      "地図でこの候補を選択中",
    ]) expect(html).toContain(text);
  });

  it("移動改善効果、確認価値、選定理由を分け、分析範囲を限定する", () => {
    const html = render([first], [firstAnalysis], [firstShortlist]);
    expect(html).toContain("移動改善効果");
    expect(html).toContain("検討した迂回条件でも改善が残る");
    expect(html).toContain("現地確認価値");
    expect(html).toContain("公共施設として確認価値が高い");
    expect(html).toContain("公共施設の基準確認候補");
    expect(html).toContain("検討した15設定すべてで上位5");
    expect(html).not.toContain("頑健：");
    expect(html).not.toContain("上位5に安定");
  });

  it("技術詳細に順位、三値、感度、Pareto、スコア、出典、固定デモ、式をまとめる", () => {
    const html = render([first], [firstAnalysis], [firstShortlist]);
    const details = html.slice(html.indexOf('class="field-candidate-technical-details"'));
    for (const text of [
      "単一スコア順位",
      "現地確認順位スコア",
      "optimistic改善",
      "lower-bound改善",
      "conservative proxy改善",
      "上位5出現率",
      "最良1位／最悪2位／平均1.40位",
      "Pareto非劣",
      "現地確認順位スコア内訳",
      "公式データ出典",
      "固定デモ回帰値",
      "gross − 2 × 片道直線距離",
    ]) expect(details).toContain(text);
    expect(html).not.toContain('<details class="field-candidate-technical-details" open="">');
  });

  it("14項目のチェックを一時状態として表示し永続保存を示さない", () => {
    const html = render([first], [firstAnalysis], [firstShortlist]);
    for (const text of [
      "一般利用できるか",
      "入館条件があるか",
      "購入、宿泊、飲食、受付等が必要か",
      "座席または明示的な休憩空間があるか",
      "座席を休憩目的で利用できるか",
      "屋内または雨を避けられるか",
      "給水設備があるか",
      "トイレがあるか",
      "車いす対応設備があるか",
      "営業時間・開館時間",
      "現地で確認した日時",
      "確認方法",
      "公開可能な根拠",
      "備考",
    ]) expect(html).toContain(text);
    expect(html.match(/type="checkbox"/g)).toHaveLength(14);
    expect(html).toContain("サーバーへ送信せず、再読み込みで消えます");
    expect(html).not.toContain("localStorage");
    expect(html).not.toContain("<form");
  });

  it("verificationId、candidateId、住所を完全値とコピー操作で表示する", () => {
    const html = render([first], [firstAnalysis], [firstShortlist]);
    expect(html).toContain('aria-label="verificationIdの完全な値"');
    expect(html).toContain('value="fv-facility-a"');
    expect(html).toContain("verificationIdをコピー");
    expect(html).toContain('aria-label="candidateIdの完全な値"');
    expect(html).toContain("candidateIdをコピー");
    expect(html).toContain('aria-label="住所の完全な値"');
    expect(html).toContain("住所をコピー");
    expect(html).toContain("選択可能な完全な値");
    expect(html).toContain('aria-live="polite"');
  });

  it("候補カードと地図で同じcandidateIdとaria-pressedを使う", () => {
    const html = render([first], [firstAnalysis], [firstShortlist]);
    expect(html).toContain('data-candidate-id="facility-a"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toMatch(
      /<button[^>]*class="field-map-select-button"[^>]*aria-pressed="true"[^>]*>地図でこの候補を選択中<\/button>/,
    );
  });

  it("5地点CSVと全候補テンプレートを別の操作として表示する", () => {
    const html = render();
    expect(html).toContain("現地調査用5地点CSVをダウンロード");
    expect(html).toContain("全候補を含む確認テンプレートをダウンロード");
    expect(html.indexOf("現地調査用5地点CSVをダウンロード"))
      .toBeLessThan(html.indexOf("全候補を含む確認テンプレートをダウンロード"));
    expect(html).toContain("UTF-8 BOM付き");
    expect(html).toContain("確認結果列は空欄");
  });

  it("書き込みAPIを設けず読み取り専用と個人情報の注意を表示する", () => {
    const html = render();
    expect(html).toContain("読み取り専用です。この画面から確認結果は送信・保存されません");
    expect(html).toContain("個人の連絡先や不要な個人情報は記入しないでください");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("確認済み");
  });

  it("上位5出現率を施設利用可能性の確率として表現しない", () => {
    const html = render();
    expect(html).toContain("一般利用できる確率ではありません");
    expect(html).not.toContain("休憩できる確率");
  });

  it("感度分析が欠けた場合に単一スコアから優先順位を捏造しない", () => {
    const html = render([first], [], [firstShortlist]);
    expect(html).toContain("現地確認の優先順位データがありません");
    expect(html).toContain("感度分析データは未生成です");
  });
});
