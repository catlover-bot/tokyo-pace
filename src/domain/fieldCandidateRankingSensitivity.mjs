const roundDistance = (value) => Math.round(value);
const roundRatio = (value) => Number(value.toFixed(4));
const roundScore = (value) => Number(value.toFixed(2));
const roundMean = (value) => Number(value.toFixed(2));

export const FIELD_CANDIDATE_TOP_RANK_LIMIT = 5;
export const FIELD_CANDIDATE_WEIGHT_VARIATION_RATIO = 0.2;
export const FIELD_CANDIDATE_MEANINGFUL_IMPROVEMENT_METERS = 30;
export const FIELD_CANDIDATE_MEANINGFUL_IMPROVEMENT_RATIO = 0.025;
export const FIELD_CANDIDATE_MARGINAL_UPPER_METERS = 50;
export const FIELD_CANDIDATE_MARGINAL_UPPER_RATIO = 0.05;
export const FIELD_VISIT_SHORTLIST_SIZE = 5;
export const FIELD_VISIT_ROBUST_TARGET = 3;
export const FIELD_VISIT_CLEAR_PUBLIC_MINIMUM = 1;
export const FIELD_VISIT_PRIVATE_HOSPITALITY_MAXIMUM = 3;

export const BASELINE_FIELD_CANDIDATE_RANKING_WEIGHTS = Object.freeze({
  improvementMeters: 0.6,
  improvementRatio: 200,
  routeProximity: 0.2,
  accessPrior: 1,
  categoryPenalty: 1,
  coveredRoutes: 40,
  sourceQuality: 12,
});

export const FIELD_CANDIDATE_SENSITIVITY_WEIGHT_KEYS = Object.freeze([
  "improvementMeters",
  "improvementRatio",
  "routeProximity",
  "accessPrior",
  "categoryPenalty",
  "coveredRoutes",
  "sourceQuality",
]);

export const FIELD_CANDIDATE_DETOUR_SCENARIOS = Object.freeze([
  {
    id: "optimistic",
    distanceFactor: 0,
    description: "施設がルート投影位置上にあると仮定したgross改善",
  },
  {
    id: "lower_bound",
    distanceFactor: 1,
    description: "gross改善から一方向の施設―ルート推定直線距離を控除",
  },
  {
    id: "conservative_proxy",
    distanceFactor: 2,
    description: "gross改善から単純な往復分として推定直線距離の2倍を控除",
  },
]);

const isMeaningful = (meters, ratio) => meters >= FIELD_CANDIDATE_MEANINGFUL_IMPROVEMENT_METERS
  && ratio >= FIELD_CANDIDATE_MEANINGFUL_IMPROVEMENT_RATIO;

export function deriveFieldCandidateDetourScenarios(candidate) {
  const gross = Math.max(0, Number(candidate.grossImprovementMeters) || 0);
  const distance = Math.max(0, Number(candidate.distanceToRouteMeters) || 0);
  const currentGap = Math.max(0, Number(candidate.currentLongestGapMeters) || 0);
  const adjusted = (factor) => Math.max(0, gross - factor * distance);
  const optimisticRaw = adjusted(0);
  const lowerBoundRaw = adjusted(1);
  const conservativeRaw = adjusted(2);
  const ratio = (value) => currentGap > 0 ? value / currentGap : 0;
  const optimisticRatio = ratio(optimisticRaw);
  const lowerBoundRatio = ratio(lowerBoundRaw);
  const conservativeRatio = ratio(conservativeRaw);

  let detourSensitivityClass = "ineffective";
  if (isMeaningful(conservativeRaw, conservativeRatio)) {
    detourSensitivityClass = "robust";
  } else if (isMeaningful(lowerBoundRaw, lowerBoundRatio)
    && (lowerBoundRaw < FIELD_CANDIDATE_MARGINAL_UPPER_METERS
      || lowerBoundRatio < FIELD_CANDIDATE_MARGINAL_UPPER_RATIO)) {
    detourSensitivityClass = "marginal";
  } else if (isMeaningful(lowerBoundRaw, lowerBoundRatio)) {
    detourSensitivityClass = "sensitive";
  }

  return {
    optimisticImprovementMeters: roundDistance(optimisticRaw),
    lowerBoundAdjustedImprovementMeters: roundDistance(lowerBoundRaw),
    conservativeProxyImprovementMeters: roundDistance(conservativeRaw),
    optimisticImprovementRatio: roundRatio(optimisticRatio),
    lowerBoundAdjustedImprovementRatio: roundRatio(lowerBoundRatio),
    conservativeProxyImprovementRatio: roundRatio(conservativeRatio),
    detourSensitivityClass,
  };
}

export function generateFieldCandidateWeightScenarios() {
  const baseline = {
    id: "baseline",
    variedWeight: null,
    multiplier: 1,
    weights: { ...BASELINE_FIELD_CANDIDATE_RANKING_WEIGHTS },
  };
  const variations = FIELD_CANDIDATE_SENSITIVITY_WEIGHT_KEYS.flatMap((key) => [
    {
      id: `${key}_minus_20_percent`,
      variedWeight: key,
      multiplier: 1 - FIELD_CANDIDATE_WEIGHT_VARIATION_RATIO,
      weights: {
        ...BASELINE_FIELD_CANDIDATE_RANKING_WEIGHTS,
        [key]: BASELINE_FIELD_CANDIDATE_RANKING_WEIGHTS[key]
          * (1 - FIELD_CANDIDATE_WEIGHT_VARIATION_RATIO),
      },
    },
    {
      id: `${key}_plus_20_percent`,
      variedWeight: key,
      multiplier: 1 + FIELD_CANDIDATE_WEIGHT_VARIATION_RATIO,
      weights: {
        ...BASELINE_FIELD_CANDIDATE_RANKING_WEIGHTS,
        [key]: BASELINE_FIELD_CANDIDATE_RANKING_WEIGHTS[key]
          * (1 + FIELD_CANDIDATE_WEIGHT_VARIATION_RATIO),
      },
    },
  ]);
  return [baseline, ...variations];
}

function scoreFieldCandidate(candidate, detour, weights) {
  const maximumDistanceMeters = 350;
  const duplicatePenalty = Number(candidate.rankingScoreBreakdown?.duplicateFacilityPenalty) || 0;
  const parts = {
    improvementMetersPoints: roundScore(detour.lowerBoundAdjustedImprovementMeters * weights.improvementMeters),
    improvementRatioPoints: roundScore(detour.lowerBoundAdjustedImprovementRatio * weights.improvementRatio),
    routeProximityPoints: roundScore(
      Math.max(0, maximumDistanceMeters - candidate.distanceToRouteMeters) * weights.routeProximity,
    ),
    accessPriorPoints: roundScore(candidate.accessPrior * weights.accessPrior),
    coveredRoutesPoints: roundScore(Math.max(0, candidate.numberOfCoveredRoutes - 1) * weights.coveredRoutes),
    officialSourceQualityPoints: roundScore(candidate.officialSourceQualityScore * weights.sourceQuality),
    categoryPenalty: roundScore(candidate.categoryPenalty * weights.categoryPenalty),
    duplicateFacilityPenalty: duplicatePenalty,
  };
  return {
    ...parts,
    total: roundScore(
      parts.improvementMetersPoints
      + parts.improvementRatioPoints
      + parts.routeProximityPoints
      + parts.accessPriorPoints
      + parts.coveredRoutesPoints
      + parts.officialSourceQualityPoints
      - parts.categoryPenalty
      - parts.duplicateFacilityPenalty,
    ),
  };
}

function rankingOrder(a, b) {
  return b.score - a.score
    || b.lowerBoundAdjustedImprovementMeters - a.lowerBoundAdjustedImprovementMeters
    || b.lowerBoundAdjustedImprovementRatio - a.lowerBoundAdjustedImprovementRatio
    || b.numberOfCoveredRoutes - a.numberOfCoveredRoutes
    || a.distanceToRouteMeters - b.distanceToRouteMeters
    || a.candidateId.localeCompare(b.candidateId);
}

function rankForWeightScenario(candidates, scenario) {
  return candidates
    .map((candidate) => {
      const detour = deriveFieldCandidateDetourScenarios(candidate);
      const scoreBreakdown = scoreFieldCandidate(candidate, detour, scenario.weights);
      return {
        weightScenarioId: scenario.id,
        candidateId: candidate.candidateId,
        name: candidate.name,
        score: scoreBreakdown.total,
        scoreBreakdown,
        lowerBoundAdjustedImprovementMeters: detour.lowerBoundAdjustedImprovementMeters,
        lowerBoundAdjustedImprovementRatio: detour.lowerBoundAdjustedImprovementRatio,
        numberOfCoveredRoutes: candidate.numberOfCoveredRoutes,
        distanceToRouteMeters: candidate.distanceToRouteMeters,
      };
    })
    .sort(rankingOrder)
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

function rankStabilityClass(rate) {
  if (rate === 1) return "stable_top5";
  if (rate >= 0.75) return "resilient_top5";
  if (rate > 0) return "variable";
  return "consistently_outside_top5";
}

function verificationValue(candidate) {
  const publicCategory = candidate.facilityAccessCategory === "public_outdoor_space"
    || candidate.facilityAccessCategory === "public_service_facility";
  const commercialCategory = candidate.facilityAccessCategory === "commercial_facility"
    || candidate.facilityAccessCategory === "official_public_access";
  const privateHospitality = candidate.facilityAccessCategory === "private_hospitality";
  return {
    generalUsePurposeClarity: publicCategory
      ? "clear_public_purpose"
      : commercialCategory
        ? "official_or_commercial_purpose_rest_use_unknown"
        : privateHospitality
          ? "special_access_conditions_unknown"
          : "unclear",
    generalUsePurposeClarityScore: publicCategory ? 3 : commercialCategory ? 2 : privateHospitality ? 1 : 0,
    officialSourceQuality: candidate.officialSourceQuality,
    officialSourceQualityScore: candidate.officialSourceQualityScore,
    onSiteResolutionNeed: privateHospitality || commercialCategory ? "high" : publicCategory ? "medium" : "high",
    accessRestrictionConcern: privateHospitality
      ? "high"
      : commercialCategory
        ? "medium"
        : publicCategory
          ? "low"
          : "high",
  };
}

function twoAxisClassification(candidate, detour) {
  const publicCategory = candidate.facilityAccessCategory === "public_outdoor_space"
    || candidate.facilityAccessCategory === "public_service_facility";
  if (detour.detourSensitivityClass === "robust") {
    return publicCategory
      ? "high_improvement_verification_priority"
      : "high_improvement_access_uncertain";
  }
  if (publicCategory && detour.detourSensitivityClass !== "ineffective") {
    return "low_improvement_easy_to_verify";
  }
  return "low_priority";
}

function dominates(a, b) {
  const maximize = [
    [a.conservativeProxyImprovementMeters, b.conservativeProxyImprovementMeters],
    [a.conservativeProxyImprovementRatio, b.conservativeProxyImprovementRatio],
    [a.top5AppearanceRate, b.top5AppearanceRate],
    [a.verificationValue.generalUsePurposeClarityScore, b.verificationValue.generalUsePurposeClarityScore],
    [a.verificationValue.officialSourceQualityScore, b.verificationValue.officialSourceQualityScore],
  ];
  const minimize = [[a.distanceToRouteMeters, b.distanceToRouteMeters]];
  const noWorse = maximize.every(([left, right]) => left >= right)
    && minimize.every(([left, right]) => left <= right);
  const strictlyBetter = maximize.some(([left, right]) => left > right)
    || minimize.some(([left, right]) => left < right);
  return noWorse && strictlyBetter;
}

export function findParetoNonDominatedCandidateIds(candidates) {
  return [...candidates]
    .filter((candidate) => !candidates.some((other) => other.candidateId !== candidate.candidateId
      && dominates(other, candidate)))
    .map((candidate) => candidate.candidateId)
    .sort();
}

export function analyzeFieldCandidateRankingSensitivity(inputCandidates) {
  const sourceCandidates = [...inputCandidates]
    .sort((a, b) => a.candidateId.localeCompare(b.candidateId));
  const weightScenarios = generateFieldCandidateWeightScenarios();
  const rankings = weightScenarios.flatMap((scenario) => rankForWeightScenario(sourceCandidates, scenario));
  const provisionalCandidates = sourceCandidates.map((candidate) => {
    const detour = deriveFieldCandidateDetourScenarios(candidate);
    const scenarioRanks = weightScenarios.map((scenario) => {
      const item = rankings.find((ranking) => ranking.weightScenarioId === scenario.id
        && ranking.candidateId === candidate.candidateId);
      return {
        weightScenarioId: scenario.id,
        rank: item.rank,
        score: item.score,
      };
    });
    const ranks = scenarioRanks.map((item) => item.rank);
    const top5Count = ranks.filter((rank) => rank <= FIELD_CANDIDATE_TOP_RANK_LIMIT).length;
    const top5AppearanceRate = roundRatio(top5Count / weightScenarios.length);
    const value = verificationValue(candidate);
    return {
      candidateId: candidate.candidateId,
      name: candidate.name,
      address: candidate.address,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      facilityAccessCategory: candidate.facilityAccessCategory,
      facilityAccessCategoryLabel: candidate.facilityAccessCategoryLabel,
      primaryRouteId: candidate.primaryRouteId,
      dynamicRouteIds: [...candidate.dynamicRouteIds].sort(),
      numberOfCoveredRoutes: candidate.numberOfCoveredRoutes,
      distanceToRouteMeters: candidate.distanceToRouteMeters,
      ...detour,
      baselineRank: scenarioRanks.find((item) => item.weightScenarioId === "baseline").rank,
      bestRank: Math.min(...ranks),
      worstRank: Math.max(...ranks),
      meanRank: roundMean(ranks.reduce((sum, rank) => sum + rank, 0) / ranks.length),
      top5AppearanceRate,
      rankStabilityClass: rankStabilityClass(top5AppearanceRate),
      twoAxisClassification: twoAxisClassification(candidate, detour),
      mobilityImprovementEvaluation: {
        conservativeProxyImprovementMeters: detour.conservativeProxyImprovementMeters,
        conservativeProxyImprovementRatio: detour.conservativeProxyImprovementRatio,
        numberOfCoveredRoutes: candidate.numberOfCoveredRoutes,
        distanceToRouteMeters: candidate.distanceToRouteMeters,
      },
      verificationValue: value,
      isParetoNonDominated: false,
      scenarioRanks,
    };
  });
  const paretoCandidateIds = findParetoNonDominatedCandidateIds(provisionalCandidates);
  const paretoSet = new Set(paretoCandidateIds);
  const candidates = provisionalCandidates
    .map((candidate) => ({
      ...candidate,
      isParetoNonDominated: paretoSet.has(candidate.candidateId),
    }))
    .sort((a, b) => a.baselineRank - b.baselineRank || a.candidateId.localeCompare(b.candidateId));
  return {
    configuration: {
      baselineDetourScenarioId: "lower_bound",
      detourScenarioCount: FIELD_CANDIDATE_DETOUR_SCENARIOS.length,
      detourScenarios: FIELD_CANDIDATE_DETOUR_SCENARIOS,
      meaningfulImprovementMeters: FIELD_CANDIDATE_MEANINGFUL_IMPROVEMENT_METERS,
      meaningfulImprovementRatio: FIELD_CANDIDATE_MEANINGFUL_IMPROVEMENT_RATIO,
      marginalUpperMeters: FIELD_CANDIDATE_MARGINAL_UPPER_METERS,
      marginalUpperRatio: FIELD_CANDIDATE_MARGINAL_UPPER_RATIO,
      weightSensitivityMethod: "one_factor_at_a_time",
      baselineWeights: BASELINE_FIELD_CANDIDATE_RANKING_WEIGHTS,
      variedWeightKeys: FIELD_CANDIDATE_SENSITIVITY_WEIGHT_KEYS,
      caveat: "直線控除は実道路上の迂回距離ではない",
    },
    weightScenarios,
    rankings,
    candidates,
    paretoCandidateIds,
  };
}

const shortlistOrder = (a, b) => b.top5AppearanceRate - a.top5AppearanceRate
  || b.conservativeProxyImprovementMeters - a.conservativeProxyImprovementMeters
  || a.baselineRank - b.baselineRank
  || a.candidateId.localeCompare(b.candidateId);

const publicPurpose = (candidate) => candidate.facilityAccessCategory === "public_outdoor_space"
  || candidate.facilityAccessCategory === "public_service_facility";

const excludedFromShortlist = (candidate) => candidate.detourSensitivityClass === "ineffective"
  || candidate.facilityAccessCategory === "restricted_or_sensitive"
  || /学校|幼稚園|保育|こども園|児童|福祉/.test(candidate.name);

function shortlistDetails(candidate, role) {
  if (role === "clear_public_verification") {
    return {
      inclusionReasonCode: "CLEAR_PUBLIC_PURPOSE_VERIFICATION",
      inclusionReason: "一般利用目的が明確な公共施設を、改善仮定の感度と実際の休憩条件を照合する基準地点として確認する。",
    };
  }
  if (role === "robust_improvement") {
    return {
      inclusionReasonCode: "ROBUST_CONSERVATIVE_PROXY_IMPROVEMENT",
      inclusionReason: "往復直線proxyを控除しても意味のある改善が残り、移動改善効果を現地条件と照合する価値がある。",
    };
  }
  return {
    inclusionReasonCode: "MARGINAL_MODEL_BOUNDARY_CHECK",
    inclusionReason: "片道控除後の改善が既存閾値をわずかに上回る境界候補で、迂回仮定の妥当性を現地で検証する価値がある。",
  };
}

export function deriveFieldVisitShortlist(analysis, limit = FIELD_VISIT_SHORTLIST_SIZE) {
  const eligible = analysis.candidates
    .filter((candidate) => candidate.isParetoNonDominated && !excludedFromShortlist(candidate));
  const selected = [];
  const selectedIds = new Set();
  const add = (candidate, role) => {
    if (!candidate || selectedIds.has(candidate.candidateId) || selected.length >= limit) return false;
    if (candidate.facilityAccessCategory === "private_hospitality"
      && selected.filter((item) => item.candidate.facilityAccessCategory === "private_hospitality").length
        >= FIELD_VISIT_PRIVATE_HOSPITALITY_MAXIMUM) return false;
    selected.push({ candidate, role });
    selectedIds.add(candidate.candidateId);
    return true;
  };

  eligible.filter(publicPurpose).sort(shortlistOrder)
    .slice(0, FIELD_VISIT_CLEAR_PUBLIC_MINIMUM)
    .forEach((candidate) => add(candidate, "clear_public_verification"));
  eligible.filter((candidate) => candidate.detourSensitivityClass === "robust")
    .sort(shortlistOrder)
    .slice(0, FIELD_VISIT_ROBUST_TARGET)
    .forEach((candidate) => add(candidate, "robust_improvement"));
  eligible.filter((candidate) => !selectedIds.has(candidate.candidateId))
    .sort(shortlistOrder)
    .forEach((candidate) => add(
      candidate,
      candidate.detourSensitivityClass === "robust"
        ? "robust_improvement"
        : publicPurpose(candidate)
          ? "clear_public_verification"
          : "boundary_model_check",
    ));

  const candidates = selected.map(({ candidate, role }, index) => {
    const details = shortlistDetails(candidate, role);
    const privateFacility = candidate.facilityAccessCategory === "private_hospitality"
      || candidate.facilityAccessCategory === "commercial_facility";
    return {
      ...candidate,
      visitPriority: index + 1,
      shortlistRole: role,
      ...details,
      inclusionReasonCodes: [details.inclusionReasonCode],
      checkItems: [
        "一般利用目的がない場合の入館条件",
        "座席または明示された休憩空間",
        "入口から代表経路までの実際の歩行条件",
        "営業時間・利用制限・特別なアクセス条件",
      ],
      caution: privateFacility
        ? "民間施設の掲載や候補選定は、自由な入館、着席、営業中、休憩可能を意味しない。"
        : "候補選定は、現地で休憩できることや現在利用できることを保証しない。",
      cautions: [privateFacility
        ? "民間施設の掲載や候補選定は、自由な入館、着席、営業中、休憩可能を意味しない。"
        : "候補選定は、現地で休憩できることや現在利用できることを保証しない。"],
    };
  });
  return {
    configuration: {
      selectionMethod: "deterministic_composition_rules",
      requestedLimit: limit,
      robustTarget: FIELD_VISIT_ROBUST_TARGET,
      clearPublicMinimum: FIELD_VISIT_CLEAR_PUBLIC_MINIMUM,
      privateHospitalityMaximum: FIELD_VISIT_PRIVATE_HOSPITALITY_MAXIMUM,
      paretoRequired: true,
      excludedCategories: ["restricted_or_sensitive"],
      excludedDetourSensitivityClasses: ["ineffective"],
      shortfall: Math.max(0, limit - candidates.length),
    },
    candidates,
  };
}

const csvCell = (value) => {
  const text = value === null || value === undefined
    ? ""
    : Array.isArray(value)
      ? value.join("|")
      : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const csvRows = (headers, rows) => `${headers.join(",")}\n${rows
  .map((row) => headers.map((header) => csvCell(row[header])).join(","))
  .join("\n")}\n`;

export function fieldCandidateRankingSensitivityCsv(analysis) {
  const byId = new Map(analysis.candidates.map((candidate) => [candidate.candidateId, candidate]));
  const headers = [
    "weightScenarioId",
    "rank",
    "candidateId",
    "name",
    "score",
    "baselineRank",
    "bestRank",
    "worstRank",
    "meanRank",
    "top5AppearanceRate",
    "rankStabilityClass",
    "detourSensitivityClass",
    "optimisticImprovementMeters",
    "lowerBoundAdjustedImprovementMeters",
    "conservativeProxyImprovementMeters",
    "twoAxisClassification",
    "isParetoNonDominated",
  ];
  return csvRows(headers, analysis.rankings.map((ranking) => ({
    ...byId.get(ranking.candidateId),
    ...ranking,
  })));
}

export function fieldVisitShortlistCsv(shortlist) {
  const headers = [
    "visitPriority",
    "candidateId",
    "name",
    "facilityAccessCategory",
    "primaryRouteId",
    "dynamicRouteIds",
    "optimisticImprovementMeters",
    "lowerBoundAdjustedImprovementMeters",
    "conservativeProxyImprovementMeters",
    "top5AppearanceRate",
    "rankStabilityClass",
    "detourSensitivityClass",
    "twoAxisClassification",
    "isParetoNonDominated",
    "shortlistRole",
    "inclusionReasonCode",
    "inclusionReason",
    "checkItems",
    "caution",
  ];
  return csvRows(headers, shortlist.candidates);
}
