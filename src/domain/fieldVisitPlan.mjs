export const FIELD_VISIT_PLAN_EXPECTED_ENTRY_COUNT = 5;

export const FIELD_VISIT_PLAN_CONFIRMATION_COLUMNS = Object.freeze([
  "publiclyAccessible",
  "seatingAvailable",
  "seatingUsableForRest",
  "indoorOrCovered",
  "drinkingWaterAvailable",
  "toiletAvailable",
  "wheelchairAccessible",
  "openingHoursObserved",
  "accessRestrictions",
  "verifiedAt",
  "verifier",
  "verificationMethod",
  "evidenceReference",
  "notes",
]);

export const FIELD_VISIT_PLAN_COLUMNS = Object.freeze([
  "confirmationPriority",
  "verificationId",
  "candidateId",
  "name",
  "address",
  "latitude",
  "longitude",
  "facilityCategory",
  "targetRouteIds",
  "distanceToRouteMeters",
  "optimisticImprovementMeters",
  "lowerBoundImprovementMeters",
  "conservativeProxyImprovementMeters",
  "top5AppearanceRate",
  "stabilityDescription",
  "selectionReason",
  "caution",
  ...FIELD_VISIT_PLAN_CONFIRMATION_COLUMNS,
]);

export const FIELD_VISIT_PLAN_FILENAME = "tokyo-pace-field-visit-plan.csv";

const ratePercent = (rate) => {
  const percent = Math.round(Number(rate) * 10_000) / 100;
  return Number.isInteger(percent) ? String(percent) : String(percent).replace(/0+$/, "");
};

function rankStabilityDescription(candidate) {
  if (candidate.rankStabilityClass === "stable_top5") {
    return "検討した15設定すべてで上位5";
  }
  if (candidate.rankStabilityClass === "resilient_top5") {
    return `検討した15設定の${ratePercent(candidate.top5AppearanceRate)}%で上位5`;
  }
  if (candidate.rankStabilityClass === "variable") {
    return `検討した15設定の${ratePercent(candidate.top5AppearanceRate)}%で上位5（設定により順位が変動）`;
  }
  return "検討した15設定では上位5に残らない";
}

function detourStabilityDescription(candidate) {
  if (candidate.detourSensitivityClass === "robust") {
    return "検討した迂回条件でも改善が残る（往復直線proxy控除後も正）";
  }
  if (candidate.detourSensitivityClass === "marginal") {
    return "片道直線控除後の改善が閾値付近で、往復直線proxyでは改善が消える";
  }
  if (candidate.detourSensitivityClass === "sensitive") {
    return "片道直線控除後は改善するが、往復直線proxyでは改善が消える";
  }
  return "検討した迂回仮定では改善がほぼ残らない";
}

export function describeFieldVisitPlanStability(candidate) {
  return `${detourStabilityDescription(candidate)}。${rankStabilityDescription(candidate)}。`;
}

const visitOrder = (left, right) =>
  left.visitPriority - right.visitPriority
  || left.candidateId.localeCompare(right.candidateId);

function validateShortlist(candidates) {
  if (candidates.length !== FIELD_VISIT_PLAN_EXPECTED_ENTRY_COUNT) {
    throw new Error(
      `現地調査計画は最終候補${FIELD_VISIT_PLAN_EXPECTED_ENTRY_COUNT}地点を必要とします（受領${candidates.length}地点）`,
    );
  }
  const candidateIds = candidates.map((candidate) => candidate.candidateId);
  if (new Set(candidateIds).size !== candidateIds.length) {
    throw new Error("現地調査計画のcandidateIdが重複しています");
  }
  const priorities = candidates.map((candidate) => candidate.visitPriority);
  const expectedPriorities = Array.from(
    { length: FIELD_VISIT_PLAN_EXPECTED_ENTRY_COUNT },
    (_, index) => index + 1,
  );
  if (priorities.some((priority, index) => priority !== expectedPriorities[index])) {
    throw new Error("現地調査計画のvisitPriorityは1から5の連番である必要があります");
  }
}

function createVerificationId(candidateId) {
  return `fv-${candidateId}`;
}

export function deriveFieldVisitPlan(shortlist, sourceCandidates = []) {
  const shortlistCandidates = Array.isArray(shortlist)
    ? shortlist
    : shortlist.candidates;
  const orderedCandidates = [...shortlistCandidates].sort(visitOrder);
  validateShortlist(orderedCandidates);
  const sourceByCandidateId = new Map(
    sourceCandidates.map((candidate) => [candidate.candidateId, candidate]),
  );

  const entries = orderedCandidates.map((candidate) => {
    const sourceCandidate = sourceByCandidateId.get(candidate.candidateId);
    const confirmationResults = Object.fromEntries(
      FIELD_VISIT_PLAN_CONFIRMATION_COLUMNS.map((column) => [column, null]),
    );
    return {
      confirmationPriority: candidate.visitPriority,
      verificationId:
        sourceCandidate?.verificationId
        ?? candidate.verificationId
        ?? createVerificationId(candidate.candidateId),
      candidateId: candidate.candidateId,
      name: candidate.name,
      address: candidate.address,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      facilityCategory: candidate.facilityAccessCategory,
      targetRouteIds: [...candidate.dynamicRouteIds].sort(),
      distanceToRouteMeters: candidate.distanceToRouteMeters,
      optimisticImprovementMeters: candidate.optimisticImprovementMeters,
      lowerBoundImprovementMeters: candidate.lowerBoundAdjustedImprovementMeters,
      conservativeProxyImprovementMeters: candidate.conservativeProxyImprovementMeters,
      top5AppearanceRate: candidate.top5AppearanceRate,
      stabilityDescription: describeFieldVisitPlanStability(candidate),
      selectionReason: candidate.inclusionReason,
      caution: candidate.caution,
      ...confirmationResults,
    };
  });

  return {
    configuration: {
      orderSource: "field_visit_shortlist_visit_priority",
      expectedEntryCount: FIELD_VISIT_PLAN_EXPECTED_ENTRY_COUNT,
      confirmationResultFieldsInitializedToNull: true,
    },
    entries,
  };
}

function protectSpreadsheetCell(value) {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function encodeCsvCell(value) {
  const raw = value === null || value === undefined
    ? ""
    : Array.isArray(value)
      ? value.join("|")
      : String(value);
  const text = protectSpreadsheetCell(raw);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function fieldVisitPlanCsv(plan) {
  const rows = plan.entries.map((entry) =>
    FIELD_VISIT_PLAN_COLUMNS.map((column) => encodeCsvCell(entry[column])).join(","));
  return `\uFEFF${FIELD_VISIT_PLAN_COLUMNS.join(",")}\r\n${rows.join("\r\n")}\r\n`;
}
