import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FieldCheckPage } from "../src/components/FieldCheckPage";
import type {
  FieldCandidateRankingSensitivity,
  FieldVerificationCandidate,
  FieldVerificationRouteMetric,
  FieldVisitShortlistEntry,
  RouteProfile,
} from "../src/types";

function dynamicMetric(profile: RouteProfile, overrides: Partial<FieldVerificationRouteMetric> = {}): FieldVerificationRouteMetric {
  return {
    routeId: profile,
    routeKey: `dynamic_snapshot:${profile}`,
    routeSet: "dynamic_snapshot",
    profile,
    routeDistanceMeters: 1000,
    distanceToRouteMeters: 38.4,
    geometryProgressMeters: 400,
    routeProgressMeters: 410.2,
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
    ...overrides,
  };
}

const standardMetric = dynamicMetric("standard");
const stepMetric = dynamicMetric("step_avoiding", {
  routeDistanceMeters: 1100,
  distanceToRouteMeters: 54,
  estimatedDetourLowerBoundMeters: 54,
  detourAdjustedImprovementMeters: 335,
});
const fixedMetric: FieldVerificationRouteMetric = {
  ...standardMetric,
  routeId: "comfort",
  routeKey: "fixed_demo:comfort",
  routeSet: "fixed_demo",
  profile: null,
  contributesToRanking: false,
};

const base: FieldVerificationCandidate = {
  candidateId: "facility-a",
  verificationId: "fv-facility-a",
  name: "確認候補A",
  latitude: 35.6901,
  longitude: 139.694,
  address: "東京都新宿区西新宿A",
  categories: ["public_facility"],
  facilityAccessCategory: "public_service_facility",
  facilityAccessCategoryLabel: "一般利用目的が明確な公共施設",
  accessPrior: 85,
  categoryPenalty: 5,
  categoryReasonCodes: ["PUBLIC_SERVICE_NAME"],
  categoryReasons: ["名称から観光案内等の一般利用目的を確認できる"],
  requiresSpecialCaution: false,
  specialCautions: ["開館時間と休憩スペースの利用条件を確認する。"],
  officialSourceQuality: "high",
  officialSourceQualityScore: 36,
  dynamicRouteIds: ["standard", "step_avoiding"],
  fixedDemoRouteIds: ["comfort"],
  routeIds: ["standard", "step_avoiding"],
  primaryRouteId: "standard",
  primaryRouteKey: "dynamic_snapshot:standard",
  numberOfCoveredRoutes: 2,
  distanceToRouteMeters: 38.4,
  estimatedDetourLowerBoundMeters: 38.4,
  routeProgressMeters: 410.2,
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
  rankingScore: 163,
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
  selectionReasonCodes: ["DETOUR_ADJUSTED_IMPROVEMENT", "MULTIPLE_DYNAMIC_ROUTES"],
  selectionReasons: ["迂回調整後も改善が残る", "複数の代表動的経路に寄与する"],
  officialSourceIds: ["shinjuku-public-facilities:record-1"],
  groupedCandidateIds: ["facility-a", "facility-a-alias"],
  duplicateFacilityHandling: {
    method: "name_or_address_within_25m",
    groupedRecordCount: 2,
    countedPlaceCount: 1,
  },
  existingStrictOverlap: false,
  fieldCheckPriority: 1,
  routeMetrics: [standardMetric, stepMetric, fixedMetric],
  dynamicRouteMetrics: [standardMetric, stepMetric],
  fixedDemoRouteMetrics: [fixedMetric],
};

const second: FieldVerificationCandidate = {
  ...base,
  candidateId: "facility-b",
  verificationId: "manual-verification-b",
  name: "確認候補B",
  address: null,
  fieldCheckPriority: 2,
  rankingScore: 120,
  rankingScoreBreakdown: { ...base.rankingScoreBreakdown, total: 120 },
  facilityAccessCategory: "private_hospitality",
  facilityAccessCategoryLabel: "ホテル等の民間施設",
  categoryReasonCodes: ["PRIVATE_HOSPITALITY"],
  categoryReasons: ["宿泊施設として公式掲載されている民間施設"],
  requiresSpecialCaution: true,
  specialCautions: ["ホテル掲載を休憩可能の根拠にせず、一般利用条件を確認する。"],
  dynamicRouteIds: ["step_avoiding"],
  primaryRouteId: "step_avoiding",
  primaryRouteKey: "dynamic_snapshot:step_avoiding",
  numberOfCoveredRoutes: 1,
  fixedDemoRouteIds: [],
  fixedDemoRouteMetrics: [],
  routeMetrics: [stepMetric],
  dynamicRouteMetrics: [stepMetric],
};

function analysisFor(
  candidate: FieldVerificationCandidate,
  overrides: Partial<FieldCandidateRankingSensitivity> = {},
): FieldCandidateRankingSensitivity {
  return {
    candidateId: candidate.candidateId,
    name: candidate.name,
    address: candidate.address,
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    facilityAccessCategory: candidate.facilityAccessCategory,
    facilityAccessCategoryLabel: candidate.facilityAccessCategoryLabel,
    primaryRouteId: candidate.primaryRouteId,
    dynamicRouteIds: candidate.dynamicRouteIds,
    numberOfCoveredRoutes: candidate.numberOfCoveredRoutes,
    distanceToRouteMeters: candidate.distanceToRouteMeters,
    optimisticImprovementMeters: 389,
    lowerBoundAdjustedImprovementMeters: 351,
    conservativeProxyImprovementMeters: 312,
    optimisticImprovementRatio: 0.475,
    lowerBoundAdjustedImprovementRatio: 0.428,
    conservativeProxyImprovementRatio: 0.381,
    detourSensitivityClass: "robust",
    baselineRank: candidate.fieldCheckPriority,
    bestRank: 1,
    worstRank: 2,
    meanRank: 1.4,
    top5AppearanceRate: 0.875,
    rankStabilityClass: "resilient_top5",
    twoAxisClassification: candidate.facilityAccessCategory === "private_hospitality"
      ? "high_improvement_access_uncertain"
      : "high_improvement_verification_priority",
    isParetoNonDominated: true,
    mobilityImprovementEvaluation: {
      conservativeProxyImprovementMeters: 312,
      conservativeProxyImprovementRatio: 0.381,
      numberOfCoveredRoutes: candidate.numberOfCoveredRoutes,
      distanceToRouteMeters: candidate.distanceToRouteMeters,
    },
    verificationValue: {
      generalUsePurposeClarity: candidate.facilityAccessCategory === "private_hospitality"
        ? "special_access_conditions_unknown"
        : "clear_public_purpose",
      generalUsePurposeClarityScore: candidate.facilityAccessCategory === "private_hospitality" ? 1 : 3,
      officialSourceQuality: candidate.officialSourceQuality,
      officialSourceQualityScore: candidate.officialSourceQualityScore,
      onSiteResolutionNeed: "high",
      accessRestrictionConcern: candidate.facilityAccessCategory === "private_hospitality" ? "high" : "low",
    },
    ...overrides,
  };
}

const baseAnalysis = analysisFor(base, { baselineRank: 1, rankStabilityClass: "stable_top5", top5AppearanceRate: 1 });
const secondAnalysis = analysisFor(second, { baselineRank: 2 });
const baseShortlist: FieldVisitShortlistEntry = {
  ...baseAnalysis,
  visitPriority: 2,
  shortlistRole: "clear_public_verification",
  inclusionReasonCode: "CLEAR_PUBLIC_PURPOSE_VERIFICATION",
  inclusionReason: "一般利用目的が明確な公共候補を基準地点として確認する。",
  checkItems: ["入館条件"],
  caution: "利用可否は未確認",
};
const secondShortlist: FieldVisitShortlistEntry = {
  ...secondAnalysis,
  visitPriority: 1,
  shortlistRole: "robust_improvement",
  inclusionReasonCode: "ROBUST_CONSERVATIVE_PROXY_IMPROVEMENT",
  inclusionReason: "往復直線proxyでも改善が残るため現地条件を確認する。",
  checkItems: ["一般利用条件"],
  caution: "休憩可能を意味しない",
};

function render(
  candidates: FieldVerificationCandidate[] = [second, base],
  analyses: FieldCandidateRankingSensitivity[] = [secondAnalysis, baseAnalysis],
  shortlist: FieldVisitShortlistEntry[] = [baseShortlist, secondShortlist],
) {
  const ids = new Set(candidates.map((candidate) => candidate.candidateId));
  return renderToStaticMarkup(<FieldCheckPage
    candidates={candidates}
    metadata={{ eligibleGroupCount: 126, preRankingGroupCount: 197, candidateCount: candidates.length }}
    rankingSensitivity={analyses.filter((analysis) => ids.has(analysis.candidateId))}
    rankingSensitivityMetadata={{ weightScenarioCount: 15 }}
    visitShortlist={shortlist.filter((entry) => ids.has(entry.candidateId))}
    visitShortlistMetadata={{ entryCount: shortlist.filter((entry) => ids.has(entry.candidateId)).length }}
  />);
}

describe("読み取り専用の現地確認画面", () => {
  it("指定された表示順で順位概要、地図、カード、CSV、制約を並べる", () => {
    const html = render();
    const labels = [
      'id="field-overview-title"',
      'id="field-map-title"',
      'id="field-candidate-title"',
      'id="field-csv-title"',
      'id="field-method-title"',
    ];
    for (let index = 1; index < labels.length; index += 1) {
      expect(html.indexOf(labels[index - 1])).toBeLessThan(html.indexOf(labels[index]));
    }
  });

  it("単一スコア順位と頑健性を踏まえた訪問推奨を混同しない", () => {
    const html = render();
    const baseline = html.slice(
      html.indexOf('id="field-baseline-ranking-title"'),
      html.indexOf('id="field-robust-visit-title"'),
    );
    const visit = html.slice(
      html.indexOf('id="field-robust-visit-title"'),
      html.indexOf('id="field-map-title"'),
    );
    expect(baseline.indexOf("確認候補A")).toBeLessThan(baseline.indexOf("確認候補B"));
    expect(visit.indexOf("確認候補B")).toBeLessThan(visit.indexOf("確認候補A"));
    expect(html).toContain("順位は推定条件によって変わります");
    expect(html).toContain("基準重みの単一スコア順位");
    expect(html).toContain("頑健性を踏まえた現地確認の推奨訪問順");
    expect(html).toContain("単一スコア順位 1位");
    expect(html).not.toContain("順位スコア順に上位5地点を確認");
  });

  it("施設カテゴリ、迂回、動的経路、固定デモを意味ごとに分けて表示する", () => {
    const html = render([base]);
    for (const text of [
      "一般利用目的が明確な公共施設",
      "代表動的経路からの距離",
      "推定直線38m",
      "施設アクセスの迂回下限",
      "迂回を含まない理論改善",
      "推定389m（47.5%）",
      "迂回調整後の改善",
      "推定351m（42.8%）",
      "代表動的：標準歩行候補",
      "代表動的：階段回避要求候補",
      "寄与する経路：2 / 3経路",
      "固定デモは順位に不使用",
      "固定デモ：安心ルート",
    ]) expect(html).toContain(text);
  });

  it("順位スコア内訳、優先理由、カテゴリ根拠、注意を表示する", () => {
    const html = render([second]);
    for (const text of [
      "現地確認順位スコア 120点",
      "現地確認順位スコア内訳",
      "経路比較の「条件負担スコア」とは別の指標",
      "施設カテゴリ減点",
      "同一施設グループ化減点",
      "優先理由",
      "迂回調整後も改善が残る",
      "施設カテゴリの判断根拠",
      "宿泊施設として公式掲載されている民間施設",
      "現地確認上の注意",
      "ホテル掲載を休憩可能の根拠にせず",
      "特別な注意あり",
    ]) expect(html).toContain(text);
  });

  it("理論改善と迂回調整の限界を平易な文で明示する", () => {
    const html = render([base]);
    expect(html).toContain("迂回を含まない理論改善は、施設をルート上へ射影した計算値");
    expect(html).toContain("迂回調整値も推定直線距離を使った下限評価");
    expect(html).toContain("実際の道路上の徒歩距離ではありません");
    expect(html).toContain("自由な入館・着席・営業中であることを示しません");
  });

  it("3迂回シナリオ、順位安定性、二軸、Pareto、採用理由を表示する", () => {
    const html = render([base]);
    for (const text of [
      "optimistic改善",
      "推定389m",
      "一方向直線控除後",
      "推定351m",
      "往復直線proxy控除後",
      "推定312m",
      "頑健：往復直線proxyでも改善が残る",
      "上位5出現率 100%",
      "上位5に安定",
      "二軸分類：高改善・確認優先",
      "Pareto非劣",
      "この地点を訪問候補へ含めた理由",
      "一般利用目的が明確な公共候補を基準地点として確認する",
    ]) expect(html).toContain(text);
    expect(html).toContain('data-detour-sensitivity="robust"');
    expect(html).toContain('data-rank-stability="stable_top5"');
    expect(html).toContain('data-visit-priority="2"');
  });

  it("技術情報を初期状態が閉じたdetailsへまとめる", () => {
    const html = render([base]);
    expect(html).toContain('<details class="field-candidate-technical-details">');
    expect(html).not.toContain('<details class="field-candidate-technical-details" open="">');
    const details = html.slice(html.indexOf('<details class="field-candidate-technical-details">'));
    expect(details.indexOf("現地確認順位スコア内訳")).toBeGreaterThan(0);
    expect(details.indexOf("公式データ出典")).toBeGreaterThan(0);
  });

  it("分析データが欠けても単一順位から訪問推奨を捏造しない", () => {
    const html = render([base], [], []);
    expect(html).toContain("訪問推奨の分析データがありません");
    expect(html).toContain("この候補の頑健性分析データは未生成です");
    expect(html).not.toContain("この地点を訪問候補へ含めた理由");
  });

  it("上位5出現率を利用可能性の確率として表現しない", () => {
    const html = render();
    expect(html).toContain("施設を一般利用できる確率ではありません");
    expect(html).not.toContain("一般利用できる確率：");
    expect(html).not.toContain("休憩できる確率");
  });

  it("確認項目、出典、CSV記入用IDを明示する", () => {
    const html = render([second]);
    expect(html).toContain("現地で確認する項目");
    expect(html).toContain("一般利用の可否と入館条件");
    expect(html).toContain("公式データ出典");
    expect(html).toContain("combined_on_site_and_official");
    expect(html).toContain("CSV記入用 verificationId");
    expect(html).toContain("manual-verification-b");
    expect(html).toContain("住所情報なし");
  });

  it("サーバー書き込みUIを設けずCSVダウンロードだけを提供する", () => {
    const html = render();
    expect(html).toContain("入力用CSVテンプレートをダウンロード");
    expect(html).toContain("この画面から確認結果は送信されません。");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("<textarea");
  });

  it("個人情報、三値、決定的順位の注意を表示する", () => {
    const html = render();
    expect(html).toContain("個人の連絡先や不要な個人情報を記入しないでください");
    expect(html).toContain("空欄をfalseとして扱いません");
    expect(html).toContain("理由文は理由コードから生成し、生成AIは使用していません");
    expect(html).toContain("固定デモ経路は既存機能の比較・回帰用");
  });

  it("地図選択にnative buttonとaria-pressedを使う", () => {
    const html = render([base]);
    expect(html).toContain("地図でこの候補を選択中");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>地図でこの候補を選択中<\/button>/);
    expect(html).toContain('data-candidate-id="facility-a"');
    expect(html).toContain('data-rank="1"');
  });

  it("候補なしを明示しダウンロードを無効化する", () => {
    const html = render([]);
    expect(html).toContain("改善基準を満たす現地確認候補はありません。");
    expect(html).toContain("現地確認候補はまだ生成されていません。");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>入力用CSVテンプレートをダウンロード<\/button>/);
  });

  it("未知の選定理由を捏造せずそのまま表示する", () => {
    const html = render([{ ...base, selectionReasonCodes: ["UNKNOWN"], selectionReasons: ["独自の確認理由"] }]);
    expect(html).toContain("独自の確認理由");
  });
});
