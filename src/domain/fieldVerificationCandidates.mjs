const EARTH_RADIUS_METERS = 6_371_000;
const radians = (degrees) => degrees * Math.PI / 180;
const roundDistance = (value) => Math.round(value);
const roundCoordinate = (value) => Number(value.toFixed(6));
const roundRatio = (value) => Number(value.toFixed(4));
const roundScore = (value) => Number(value.toFixed(2));

export const FIELD_CHECK_MAXIMUM_DISTANCE_METERS = 350;
export const DETOUR_ACCESS_LOWER_BOUND_FACTOR = 1;
export const MIN_DETOUR_ADJUSTED_IMPROVEMENT_METERS = 30;
export const MIN_DETOUR_ADJUSTED_IMPROVEMENT_RATIO = 0.025;

export const FACILITY_ACCESS_POLICIES = Object.freeze({
  public_outdoor_space: {
    label: "公園・屋外公共空間",
    accessPrior: 100,
    categoryPenalty: 0,
    requiresSpecialCaution: false,
    rankingEligible: true,
  },
  public_service_facility: {
    label: "一般利用目的が明確な公共施設",
    accessPrior: 85,
    categoryPenalty: 5,
    requiresSpecialCaution: false,
    rankingEligible: true,
  },
  official_public_access: {
    label: "公式掲載施設（公開条件は要確認）",
    accessPrior: 65,
    categoryPenalty: 15,
    requiresSpecialCaution: true,
    rankingEligible: true,
  },
  commercial_facility: {
    label: "商業施設",
    accessPrior: 45,
    categoryPenalty: 35,
    requiresSpecialCaution: true,
    rankingEligible: true,
  },
  private_hospitality: {
    label: "ホテル等の民間施設",
    accessPrior: 10,
    categoryPenalty: 220,
    requiresSpecialCaution: true,
    rankingEligible: true,
  },
  restricted_or_sensitive: {
    label: "学校・福祉等の慎重な取扱いが必要な施設",
    accessPrior: 0,
    categoryPenalty: 250,
    requiresSpecialCaution: true,
    rankingEligible: false,
  },
  uncertain_facility: {
    label: "利用目的が不明な公式掲載施設",
    accessPrior: 20,
    categoryPenalty: 80,
    requiresSpecialCaution: true,
    rankingEligible: true,
  },
});

const CATEGORY_REASON_LABELS = Object.freeze({
  OFFICIAL_PARK_DATASET: "公式データで公園・屋外公共空間として掲載",
  PUBLIC_SERVICE_NAME: "名称から区役所・出張所・観光案内等の一般利用目的を確認できる",
  OFFICIAL_PUBLIC_FACILITY_DATASET: "公共施設として公式掲載されているが、自由利用条件は未確認",
  OFFICIAL_BARRIER_FREE_LISTING: "バリアフリー施設情報への掲載であり、休憩利用の可否は未確認",
  COMMERCIAL_DATASET: "商業・飲食・レジャー施設として公式掲載",
  PRIVATE_HOSPITALITY_DATASET: "宿泊施設として公式掲載されている民間施設",
  RESTRICTED_OR_SENSITIVE_NAME: "学校・保育・福祉等を示す名称のため、一般向け現地調査先から除外",
  UNKNOWN_ACCESS_PURPOSE: "公式掲載はあるが、一般利用目的をデータから確認できない",
});

const RANKING_REASON_LABELS = Object.freeze({
  POSITIVE_DETOUR_ADJUSTED_IMPROVEMENT: "施設からルートまでの推定直線下限を差し引いても休憩空白の改善が残る",
  MARGINAL_DETOUR_ADJUSTED_IMPROVEMENT: "迂回調整後の改善は30〜49mで、効果が限定的か現地で確認する必要がある",
  CLOSE_TO_DYNAMIC_ROUTE_50M: "代表動的経路から推定直線50m以内",
  CLOSE_TO_DYNAMIC_ROUTE_100M: "代表動的経路から推定直線100m以内",
  MULTIPLE_DYNAMIC_ROUTES: "複数の代表動的経路で迂回調整後の改善に寄与",
  PUBLIC_OUTDOOR_PRIORITY: "公園・屋外公共空間を優先",
  PUBLIC_SERVICE_PRIORITY: "一般利用目的が明確な公共施設を優先",
  HIGH_OFFICIAL_SOURCE_QUALITY: "自治体等の構造化された公式情報を根拠にする",
  DEDUPLICATED_FACILITY: "同一施設と考えられる複数レコードを1地点として評価",
  NO_EXISTING_STRICT_DUPLICATE: "既存のconfirmed / supported地点とは重複しない",
  PRIVATE_ACCESS_CONFIRMATION_NEEDED: "民間施設のため一般利用条件の確認が必要",
  COMMERCIAL_ACCESS_CONFIRMATION_NEEDED: "商業施設の営業時間・利用条件の確認が必要",
});

const EXCLUSION_REASON_LABELS = Object.freeze({
  COORDINATE_SOURCE_ANOMALY: "異なる施設が同一座標へ集中する上流品質異常",
  EXISTING_STRICT_REST_DUPLICATE: "既存のconfirmed / supported地点と同一施設候補",
  RESTRICTED_OR_SENSITIVE_FACILITY: "学校・福祉等の慎重な取扱いが必要な施設",
  NO_DYNAMIC_ROUTE_WITHIN_DISTANCE: "代表動的3経路から推定直線350m以内にない",
  NO_GROSS_GAP_IMPROVEMENT: "代表動的経路で迂回を含まない理論改善が0m",
  DETOUR_ADJUSTED_IMPROVEMENT_BELOW_THRESHOLD: "迂回調整後の改善が30mまたは2.5%の基準に届かない",
});

export function fieldCandidateReasonLabel(code) {
  return RANKING_REASON_LABELS[code] ?? code;
}

export function fieldCandidateCategoryReasonLabel(code) {
  return CATEGORY_REASON_LABELS[code] ?? code;
}

export function fieldCandidateExclusionReasonLabel(code) {
  return EXCLUSION_REASON_LABELS[code] ?? code;
}

export function haversineMeters(a, b) {
  const latitudeDelta = radians(b[0] - a[0]);
  const longitudeDelta = radians(b[1] - a[1]);
  const latitude1 = radians(a[0]);
  const latitude2 = radians(b[0]);
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(value));
}

const normalizeMatchText = (value) => (value ?? "").normalize("NFKC").toLowerCase()
  .replace(/[\s\u3000・,，、()（）]/g, "");

const sameFacilityWithin25Meters = (a, b) => {
  if (haversineMeters([a.latitude, a.longitude], [b.latitude, b.longitude]) > 25) return false;
  const sameName = normalizeMatchText(a.name) !== "" && normalizeMatchText(a.name) === normalizeMatchText(b.name);
  const addressA = normalizeMatchText(a.address);
  const addressB = normalizeMatchText(b.address);
  const sameAddress = addressA !== "" && addressB !== "" && (addressA === addressB
    || (Math.min(addressA.length, addressB.length) >= 8 && (addressA.startsWith(addressB) || addressB.startsWith(addressA))));
  return sameName || sameAddress;
};

function projectPointToSegment(point, start, end) {
  const referenceLatitude = radians((point[0] + start[0] + end[0]) / 3);
  const project = ([latitude, longitude]) => ({
    x: radians(longitude) * EARTH_RADIUS_METERS * Math.cos(referenceLatitude),
    y: radians(latitude) * EARTH_RADIUS_METERS,
  });
  const p = project(point);
  const a = project(start);
  const b = project(end);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) {
    return { distanceMeters: haversineMeters(point, start), ratio: 0, projectedCoordinate: start };
  }
  const ratio = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return {
    distanceMeters: Math.hypot(p.x - (a.x + ratio * dx), p.y - (a.y + ratio * dy)),
    ratio,
    projectedCoordinate: [
      start[0] + (end[0] - start[0]) * ratio,
      start[1] + (end[1] - start[1]) * ratio,
    ],
  };
}

export function projectCandidateToRoute(candidate, route) {
  if (!route.coordinates.length) {
    return {
      distanceToRouteMeters: Number.POSITIVE_INFINITY,
      geometryProgressMeters: 0,
      geometryLengthMeters: 0,
      routeProgressMeters: 0,
      nearestPointCoordinate: [0, 0],
    };
  }
  if (route.coordinates.length === 1) {
    return {
      distanceToRouteMeters: haversineMeters([candidate.latitude, candidate.longitude], route.coordinates[0]),
      geometryProgressMeters: 0,
      geometryLengthMeters: 0,
      routeProgressMeters: 0,
      nearestPointCoordinate: route.coordinates[0].map(roundCoordinate),
    };
  }
  let geometryProgress = 0;
  let geometryLength = 0;
  let best = null;
  const segments = route.coordinates.slice(1).map((end, index) => {
    const start = route.coordinates[index];
    const length = haversineMeters(start, end);
    geometryLength += length;
    return { start, end, length, index };
  });
  for (const segment of segments) {
    const projection = projectPointToSegment([candidate.latitude, candidate.longitude], segment.start, segment.end);
    const current = {
      distanceToRouteMeters: projection.distanceMeters,
      geometryProgressMeters: geometryProgress + segment.length * projection.ratio,
      nearestPointCoordinate: projection.projectedCoordinate.map(roundCoordinate),
      segmentIndex: segment.index,
    };
    if (!best
      || current.distanceToRouteMeters < best.distanceToRouteMeters
      || (current.distanceToRouteMeters === best.distanceToRouteMeters
        && current.geometryProgressMeters < best.geometryProgressMeters)) best = current;
    geometryProgress += segment.length;
  }
  return {
    ...best,
    geometryLengthMeters: geometryLength,
    routeProgressMeters: geometryLength ? best.geometryProgressMeters / geometryLength * route.distanceMeters : 0,
  };
}

export function coordinateAtRouteProgress(route, routeProgressMeters) {
  const geometryLength = route.coordinates.slice(1)
    .reduce((sum, end, index) => sum + haversineMeters(route.coordinates[index], end), 0);
  const target = route.distanceMeters ? routeProgressMeters / route.distanceMeters * geometryLength : 0;
  let progress = 0;
  for (let index = 0; index < route.coordinates.length - 1; index += 1) {
    const start = route.coordinates[index];
    const end = route.coordinates[index + 1];
    const length = haversineMeters(start, end);
    if (progress + length >= target) {
      const ratio = length ? (target - progress) / length : 0;
      return [
        roundCoordinate(start[0] + (end[0] - start[0]) * ratio),
        roundCoordinate(start[1] + (end[1] - start[1]) * ratio),
      ];
    }
    progress += length;
  }
  const end = route.coordinates.at(-1) ?? [0, 0];
  return [roundCoordinate(end[0]), roundCoordinate(end[1])];
}

function deriveGaps(routeLengthMeters, positions) {
  const boundaries = [0, ...positions.filter((value) => value > 0 && value < routeLengthMeters), routeLengthMeters]
    .sort((a, b) => a - b);
  return boundaries.slice(1)
    .map((end, index) => ({ start: boundaries[index], end, gap: end - boundaries[index] }));
}

function largestGap(gaps) {
  return [...gaps].sort((a, b) => b.gap - a.gap || a.start - b.start)[0]
    ?? { start: 0, end: 0, gap: 0 };
}

function candidateSourceDatasetIds(group) {
  return [...new Set(group.map((candidate) => candidate.source?.sourceDatasetId).filter(Boolean))].sort();
}

function includesAny(value, expressions) {
  return expressions.some((expression) => expression.test(value));
}

export function classifyFacilityAccess(candidateOrGroup) {
  const group = Array.isArray(candidateOrGroup) ? candidateOrGroup : [candidateOrGroup];
  const representative = [...group].sort((a, b) => a.id.localeCompare(b.id))[0];
  const sourceDatasetIds = candidateSourceDatasetIds(group);
  // A building can contain unrelated public-service and welfare tenants. Use the
  // representative facility name for access classification instead of allowing
  // one tenant keyword to classify the entire de-duplicated place.
  const text = `${representative.name ?? ""} ${representative.address ?? ""}`;
  let facilityAccessCategory;
  let categoryReasonCodes;

  if (includesAny(text, [/学校/u, /幼稚園/u, /保育/u, /こども園/u, /児童/u, /養護/u, /福祉/u, /障害/u])) {
    facilityAccessCategory = "restricted_or_sensitive";
    categoryReasonCodes = ["RESTRICTED_OR_SENSITIVE_NAME"];
  } else if (sourceDatasetIds.includes("daredemo-parks") || includesAny(text, [/公園/u, /公開広場/u])) {
    facilityAccessCategory = "public_outdoor_space";
    categoryReasonCodes = ["OFFICIAL_PARK_DATASET"];
  } else if (includesAny(text, [/区役所/u, /出張所/u, /観光/u, /図書館/u, /区民/u, /地域センター/u, /環境学習/u, /公民館/u, /文化センター/u])) {
    facilityAccessCategory = "public_service_facility";
    categoryReasonCodes = ["PUBLIC_SERVICE_NAME"];
  } else if (sourceDatasetIds.includes("shinjuku-public-facilities")
    || sourceDatasetIds.includes("daredemo-public_facilities")
    || sourceDatasetIds.includes("daredemo-transport")) {
    facilityAccessCategory = "official_public_access";
    categoryReasonCodes = ["OFFICIAL_PUBLIC_FACILITY_DATASET"];
  } else if (sourceDatasetIds.includes("daredemo-accommodation") || includesAny(text, [/ホテル/u, /旅館/u, /宿泊/u])) {
    facilityAccessCategory = "private_hospitality";
    categoryReasonCodes = ["PRIVATE_HOSPITALITY_DATASET"];
  } else if (sourceDatasetIds.some((id) => ["daredemo-shopping", "daredemo-dining", "daredemo-leisure"].includes(id))) {
    facilityAccessCategory = "commercial_facility";
    categoryReasonCodes = ["COMMERCIAL_DATASET"];
  } else if (group.some((candidate) => candidate.category === "barrier_free_facility")) {
    facilityAccessCategory = "official_public_access";
    categoryReasonCodes = ["OFFICIAL_BARRIER_FREE_LISTING"];
  } else {
    facilityAccessCategory = "uncertain_facility";
    categoryReasonCodes = ["UNKNOWN_ACCESS_PURPOSE"];
  }

  const policy = FACILITY_ACCESS_POLICIES[facilityAccessCategory];
  return {
    facilityAccessCategory,
    facilityAccessCategoryLabel: policy.label,
    accessPrior: policy.accessPrior,
    categoryPenalty: policy.categoryPenalty,
    categoryReasonCodes,
    categoryReasons: categoryReasonCodes.map(fieldCandidateCategoryReasonLabel),
    requiresSpecialCaution: policy.requiresSpecialCaution,
    rankingEligible: policy.rankingEligible,
  };
}

function specialCautionsForCategory(category) {
  if (category === "private_hospitality") {
    return ["宿泊・飲食利用なしでの入館、着席、営業時間内の一般利用条件を確認する。ホテル掲載を休憩可能の根拠にしない。"];
  }
  if (category === "commercial_facility") {
    return ["営業時間、購入を伴わない滞在の可否、座席の利用条件を確認する。"];
  }
  if (category === "official_public_access" || category === "uncertain_facility") {
    return ["公式掲載は自由な入館・着席を意味しないため、利用目的、開館時間、入館条件を確認する。"];
  }
  if (category === "public_service_facility") {
    return ["窓口・開館時間、来訪目的がない場合の入館、休憩スペースの利用条件を確認する。"];
  }
  if (category === "public_outdoor_space") {
    return ["利用時間、工事・閉鎖、座席、日陰や雨よけの有無を確認する。"];
  }
  return ["一般利用の可否と現地の利用条件を確認する。"];
}

function officialSourceQuality(group) {
  const ids = candidateSourceDatasetIds(group);
  if (ids.some((id) => ["shinjuku-public-facilities", "daredemo-parks"].includes(id))) {
    return { level: "high", score: 3 };
  }
  if (ids.some((id) => id.startsWith("daredemo-"))) return { level: "medium", score: 2 };
  return { level: "basic", score: 1 };
}

function clusterEligibleCandidates(candidates) {
  const strict = candidates
    .filter((candidate) => candidate.confidence === "confirmed" || candidate.confidence === "supported");
  const possible = candidates.filter((candidate) => candidate.confidence === "possible"
    && (candidate.category === "public_facility" || candidate.category === "barrier_free_facility")
    && candidate.address?.includes("新宿区"))
    .sort((a, b) => a.id.localeCompare(b.id));
  const strictDuplicateCandidates = possible.filter((candidate) => strict
    .some((strictCandidate) => sameFacilityWithin25Meters(candidate, strictCandidate)));
  const strictDuplicateIds = new Set(strictDuplicateCandidates.map((candidate) => candidate.id));
  const eligible = possible.filter((candidate) => !strictDuplicateIds.has(candidate.id));
  const parents = eligible.map((_, index) => index);
  const find = (index) => parents[index] === index ? index : (parents[index] = find(parents[index]));
  const union = (a, b) => {
    const left = find(a);
    const right = find(b);
    if (left !== right) parents[Math.max(left, right)] = Math.min(left, right);
  };
  for (let left = 0; left < eligible.length; left += 1) {
    for (let right = left + 1; right < eligible.length; right += 1) {
      if (sameFacilityWithin25Meters(eligible[left], eligible[right])) union(left, right);
    }
  }
  const groups = new Map();
  eligible.forEach((candidate, index) => {
    const root = find(index);
    const group = groups.get(root) ?? [];
    group.push(candidate);
    groups.set(root, group);
  });
  return {
    groups: [...groups.values()].map((group) => group.sort((a, b) => a.id.localeCompare(b.id))),
    strictDuplicateCandidates,
  };
}

function excludeCoordinateConflicts(groups) {
  const groupsByCoordinate = new Map();
  for (const group of groups) {
    const representative = group[0];
    const key = `${roundCoordinate(representative.latitude)}:${roundCoordinate(representative.longitude)}`;
    const coordinateGroups = groupsByCoordinate.get(key) ?? [];
    coordinateGroups.push(group);
    groupsByCoordinate.set(key, coordinateGroups);
  }
  const conflictedGroups = new Set();
  let coordinateConflictGroupCount = 0;
  for (const coordinateGroups of groupsByCoordinate.values()) {
    const names = new Set(coordinateGroups.map((group) => normalizeMatchText(group[0].name)).filter(Boolean));
    const addresses = new Set(coordinateGroups.map((group) => normalizeMatchText(group[0].address)).filter(Boolean));
    if (coordinateGroups.length >= 3 && names.size >= 3 && addresses.size >= 3) {
      coordinateConflictGroupCount += 1;
      for (const group of coordinateGroups) conflictedGroups.add(group);
    }
  }
  return {
    groups: groups.filter((group) => !conflictedGroups.has(group)),
    excludedGroups: groups.filter((group) => conflictedGroups.has(group)),
    coordinateConflictGroupCount,
    excludedCoordinateConflictCandidateCount: [...conflictedGroups]
      .reduce((sum, group) => sum + group.length, 0),
    excludedCoordinateConflictPlaceCount: conflictedGroups.size,
  };
}

export function estimateDetourLowerBoundMeters(distanceToRouteMeters) {
  if (!Number.isFinite(distanceToRouteMeters) || distanceToRouteMeters <= 0) return 0;
  return roundDistance(distanceToRouteMeters * DETOUR_ACCESS_LOWER_BOUND_FACTOR);
}

export function deriveDetourAdjustedImprovement({
  currentLongestGapMeters,
  grossImprovementMeters,
  distanceToRouteMeters,
}) {
  const estimatedDetourLowerBoundMeters = estimateDetourLowerBoundMeters(distanceToRouteMeters);
  const detourAdjustedImprovementMeters = Math.max(0, grossImprovementMeters - estimatedDetourLowerBoundMeters);
  return {
    estimatedDetourLowerBoundMeters,
    detourAdjustedImprovementMeters: roundDistance(detourAdjustedImprovementMeters),
    detourAdjustedImprovementRatio: roundRatio(currentLongestGapMeters
      ? detourAdjustedImprovementMeters / currentLongestGapMeters
      : 0),
  };
}

function routeMetric(route, candidate, strictCandidates, maximumDistanceMeters, routeSet) {
  const projection = projectCandidateToRoute(candidate, route);
  if (projection.distanceToRouteMeters > maximumDistanceMeters) return null;
  const strictPositions = strictCandidates
    .map((strictCandidate) => projectCandidateToRoute(strictCandidate, route))
    .filter((strictProjection) => strictProjection.distanceToRouteMeters <= maximumDistanceMeters)
    .map((strictProjection) => strictProjection.routeProgressMeters);
  const currentGaps = deriveGaps(route.distanceMeters, strictPositions);
  const currentLargest = largestGap(currentGaps);
  const improvedLargest = largestGap(deriveGaps(route.distanceMeters, [
    ...strictPositions,
    projection.routeProgressMeters,
  ]));
  const grossImprovement = Math.max(0, currentLargest.gap - improvedLargest.gap);
  const grossImprovementRatio = currentLargest.gap ? grossImprovement / currentLargest.gap : 0;
  const detour = deriveDetourAdjustedImprovement({
    currentLongestGapMeters: currentLargest.gap,
    grossImprovementMeters: grossImprovement,
    distanceToRouteMeters: projection.distanceToRouteMeters,
  });
  const suggestedProgress = (currentLargest.start + currentLargest.end) / 2;
  const suggestedInsertionCoordinate = coordinateAtRouteProgress(route, suggestedProgress);
  const contributesToRanking = routeSet === "dynamic_snapshot"
    && grossImprovement > 0
    && grossImprovementRatio > 0
    && detour.detourAdjustedImprovementMeters >= MIN_DETOUR_ADJUSTED_IMPROVEMENT_METERS
    && detour.detourAdjustedImprovementRatio >= MIN_DETOUR_ADJUSTED_IMPROVEMENT_RATIO;
  return {
    routeId: route.id,
    routeKey: `${routeSet}:${route.id}`,
    routeSet,
    profile: route.profile ?? null,
    routeDistanceMeters: roundDistance(route.distanceMeters),
    distanceToRouteMeters: roundDistance(projection.distanceToRouteMeters),
    geometryProgressMeters: roundDistance(projection.geometryProgressMeters),
    routeProgressMeters: roundDistance(projection.routeProgressMeters),
    nearestPointCoordinate: projection.nearestPointCoordinate,
    currentLongestGapMeters: roundDistance(currentLargest.gap),
    expectedImprovedGapMeters: roundDistance(improvedLargest.gap),
    expectedImprovementMeters: roundDistance(grossImprovement),
    expectedImprovementRatio: roundRatio(grossImprovementRatio),
    grossImprovementMeters: roundDistance(grossImprovement),
    grossImprovementRatio: roundRatio(grossImprovementRatio),
    ...detour,
    suggestedInsertionProgressMeters: roundDistance(suggestedProgress),
    suggestedInsertionCoordinate,
    distanceToSuggestedInsertionMeters: roundDistance(haversineMeters(
      [candidate.latitude, candidate.longitude],
      suggestedInsertionCoordinate,
    )),
    insideLargestGap: projection.routeProgressMeters >= currentLargest.start
      && projection.routeProgressMeters <= currentLargest.end,
    contributesToRanking,
  };
}

function scoreCandidate({ primary, numberOfCoveredRoutes, access, sourceQuality, groupedRecordCount, maximumDistanceMeters }) {
  const improvementMetersPoints = roundScore(primary.detourAdjustedImprovementMeters * 0.6);
  const improvementRatioPoints = roundScore(primary.detourAdjustedImprovementRatio * 200);
  const routeProximityPoints = roundScore(Math.max(0, maximumDistanceMeters - primary.distanceToRouteMeters) * 0.2);
  const accessPriorPoints = access.accessPrior;
  const coveredRoutesPoints = Math.max(0, numberOfCoveredRoutes - 1) * 40;
  const officialSourceQualityPoints = sourceQuality.score * 12;
  const categoryPenalty = access.categoryPenalty;
  const duplicateFacilityPenalty = Math.min(10, Math.max(0, groupedRecordCount - 1) * 2);
  const total = roundScore(
    improvementMetersPoints
    + improvementRatioPoints
    + routeProximityPoints
    + accessPriorPoints
    + coveredRoutesPoints
    + officialSourceQualityPoints
    - categoryPenalty
    - duplicateFacilityPenalty,
  );
  return {
    improvementMetersPoints,
    improvementRatioPoints,
    routeProximityPoints,
    accessPriorPoints,
    coveredRoutesPoints,
    officialSourceQualityPoints,
    categoryPenalty,
    duplicateFacilityPenalty,
    total,
  };
}

function rankingReasonCodes(primary, numberOfCoveredRoutes, access, sourceQuality, groupedRecordCount) {
  return [
    "POSITIVE_DETOUR_ADJUSTED_IMPROVEMENT",
    primary.detourAdjustedImprovementMeters < 50
      ? "MARGINAL_DETOUR_ADJUSTED_IMPROVEMENT"
      : null,
    primary.distanceToRouteMeters <= 50
      ? "CLOSE_TO_DYNAMIC_ROUTE_50M"
      : primary.distanceToRouteMeters <= 100
        ? "CLOSE_TO_DYNAMIC_ROUTE_100M"
        : null,
    numberOfCoveredRoutes > 1 ? "MULTIPLE_DYNAMIC_ROUTES" : null,
    access.facilityAccessCategory === "public_outdoor_space" ? "PUBLIC_OUTDOOR_PRIORITY" : null,
    access.facilityAccessCategory === "public_service_facility" ? "PUBLIC_SERVICE_PRIORITY" : null,
    sourceQuality.level === "high" ? "HIGH_OFFICIAL_SOURCE_QUALITY" : null,
    groupedRecordCount > 1 ? "DEDUPLICATED_FACILITY" : null,
    "NO_EXISTING_STRICT_DUPLICATE",
    access.facilityAccessCategory === "private_hospitality"
      ? "PRIVATE_ACCESS_CONFIRMATION_NEEDED"
      : null,
    access.facilityAccessCategory === "commercial_facility"
      ? "COMMERCIAL_ACCESS_CONFIRMATION_NEEDED"
      : null,
  ].filter(Boolean);
}

const metricOrder = (a, b) => b.detourAdjustedImprovementMeters - a.detourAdjustedImprovementMeters
  || b.detourAdjustedImprovementRatio - a.detourAdjustedImprovementRatio
  || b.grossImprovementMeters - a.grossImprovementMeters
  || a.distanceToRouteMeters - b.distanceToRouteMeters
  || a.routeKey.localeCompare(b.routeKey);

const resultOrder = (a, b) => b.rankingScore - a.rankingScore
  || b.detourAdjustedImprovementMeters - a.detourAdjustedImprovementMeters
  || b.detourAdjustedImprovementRatio - a.detourAdjustedImprovementRatio
  || b.numberOfCoveredRoutes - a.numberOfCoveredRoutes
  || a.distanceToRouteMeters - b.distanceToRouteMeters
  || a.candidateId.localeCompare(b.candidateId);

function exclusion(group, reasonCode, details = {}) {
  const representative = group[0];
  return {
    candidateId: representative.id,
    name: representative.name,
    groupedCandidateIds: group.map((candidate) => candidate.id).sort(),
    reasonCode,
    reason: fieldCandidateExclusionReasonLabel(reasonCode),
    ...details,
  };
}

export function extractFieldVerificationCandidates({
  routes,
  dynamicRoutes,
  fixedDemoRoutes = [],
  candidates,
  limit = Number.MAX_SAFE_INTEGER,
  maximumDistanceMeters = FIELD_CHECK_MAXIMUM_DISTANCE_METERS,
}) {
  const rankingRoutes = [...(dynamicRoutes ?? routes ?? [])].sort((a, b) => a.id.localeCompare(b.id));
  const regressionRoutes = [...fixedDemoRoutes].sort((a, b) => a.id.localeCompare(b.id));
  const strictCandidates = candidates
    .filter((candidate) => candidate.confidence === "confirmed" || candidate.confidence === "supported");
  const clustered = clusterEligibleCandidates(candidates);
  const coordinateQuality = excludeCoordinateConflicts(clustered.groups);
  const exclusions = [
    ...clustered.strictDuplicateCandidates.map((candidate) => exclusion([candidate], "EXISTING_STRICT_REST_DUPLICATE")),
    ...coordinateQuality.excludedGroups.map((group) => exclusion(group, "COORDINATE_SOURCE_ANOMALY")),
  ];

  const ranked = coordinateQuality.groups.flatMap((group) => {
    const representative = group[0];
    const access = classifyFacilityAccess(group);
    if (!access.rankingEligible) {
      exclusions.push(exclusion(group, "RESTRICTED_OR_SENSITIVE_FACILITY", {
        facilityAccessCategory: access.facilityAccessCategory,
        categoryReasons: access.categoryReasons,
      }));
      return [];
    }
    const dynamicRouteMetrics = rankingRoutes
      .map((route) => routeMetric(
        route,
        representative,
        strictCandidates,
        maximumDistanceMeters,
        "dynamic_snapshot",
      ))
      .filter(Boolean)
      .sort((a, b) => a.routeKey.localeCompare(b.routeKey));
    const fixedDemoRouteMetrics = regressionRoutes
      .map((route) => routeMetric(
        route,
        representative,
        strictCandidates,
        maximumDistanceMeters,
        "fixed_demo",
      ))
      .filter(Boolean)
      .sort((a, b) => a.routeKey.localeCompare(b.routeKey));
    if (!dynamicRouteMetrics.length) {
      exclusions.push(exclusion(group, "NO_DYNAMIC_ROUTE_WITHIN_DISTANCE", {
        facilityAccessCategory: access.facilityAccessCategory,
      }));
      return [];
    }
    if (!dynamicRouteMetrics.some((metric) => metric.grossImprovementMeters > 0
      && metric.grossImprovementRatio > 0)) {
      exclusions.push(exclusion(group, "NO_GROSS_GAP_IMPROVEMENT", {
        facilityAccessCategory: access.facilityAccessCategory,
        routeMetrics: dynamicRouteMetrics,
      }));
      return [];
    }
    const contributingMetrics = dynamicRouteMetrics.filter((metric) => metric.contributesToRanking);
    if (!contributingMetrics.length) {
      const bestMetric = [...dynamicRouteMetrics].sort(metricOrder)[0];
      exclusions.push(exclusion(group, "DETOUR_ADJUSTED_IMPROVEMENT_BELOW_THRESHOLD", {
        facilityAccessCategory: access.facilityAccessCategory,
        bestRouteMetric: bestMetric,
      }));
      return [];
    }
    const primary = [...contributingMetrics].sort(metricOrder)[0];
    const sourceIds = group
      .map((candidate) => `${candidate.source.sourceDatasetId}:${candidate.source.sourceRecordId}`)
      .sort();
    const categories = [...new Set(group.map((candidate) => candidate.category))].sort();
    const sourceQuality = officialSourceQuality(group);
    const numberOfCoveredRoutes = contributingMetrics.length;
    const scoreBreakdown = scoreCandidate({
      primary,
      numberOfCoveredRoutes,
      access,
      sourceQuality,
      groupedRecordCount: group.length,
      maximumDistanceMeters,
    });
    const reasonCodes = rankingReasonCodes(
      primary,
      numberOfCoveredRoutes,
      access,
      sourceQuality,
      group.length,
    );
    return [{
      candidateId: representative.id,
      verificationId: `fv-${representative.id}`,
      name: representative.name,
      latitude: roundCoordinate(representative.latitude),
      longitude: roundCoordinate(representative.longitude),
      address: representative.address,
      categories,
      facilityAccessCategory: access.facilityAccessCategory,
      facilityAccessCategoryLabel: access.facilityAccessCategoryLabel,
      accessPrior: access.accessPrior,
      categoryPenalty: access.categoryPenalty,
      categoryReasonCodes: access.categoryReasonCodes,
      categoryReasons: access.categoryReasons,
      requiresSpecialCaution: access.requiresSpecialCaution,
      specialCautions: specialCautionsForCategory(access.facilityAccessCategory),
      officialSourceQuality: sourceQuality.level,
      officialSourceQualityScore: sourceQuality.score,
      dynamicRouteIds: contributingMetrics.map((metric) => metric.routeId).sort(),
      fixedDemoRouteIds: fixedDemoRouteMetrics
        .filter((metric) => metric.grossImprovementMeters > 0)
        .map((metric) => metric.routeId)
        .sort(),
      routeIds: contributingMetrics.map((metric) => metric.routeId).sort(),
      primaryRouteId: primary.routeId,
      primaryRouteKey: primary.routeKey,
      numberOfCoveredRoutes,
      distanceToRouteMeters: primary.distanceToRouteMeters,
      estimatedDetourLowerBoundMeters: primary.estimatedDetourLowerBoundMeters,
      routeProgressMeters: primary.routeProgressMeters,
      nearestPointCoordinate: primary.nearestPointCoordinate,
      theoreticalInsertionCoordinate: primary.suggestedInsertionCoordinate,
      currentLongestGapMeters: primary.currentLongestGapMeters,
      expectedImprovedGapMeters: primary.expectedImprovedGapMeters,
      expectedImprovementMeters: primary.grossImprovementMeters,
      expectedImprovementRatio: primary.grossImprovementRatio,
      grossImprovementMeters: primary.grossImprovementMeters,
      grossImprovementRatio: primary.grossImprovementRatio,
      detourAdjustedImprovementMeters: primary.detourAdjustedImprovementMeters,
      detourAdjustedImprovementRatio: primary.detourAdjustedImprovementRatio,
      distanceToSuggestedInsertionMeters: primary.distanceToSuggestedInsertionMeters,
      rankingScore: scoreBreakdown.total,
      rankingScoreBreakdown: scoreBreakdown,
      selectionReasonCodes: reasonCodes,
      selectionReasons: reasonCodes.map(fieldCandidateReasonLabel),
      officialSourceIds: sourceIds,
      groupedCandidateIds: group.map((candidate) => candidate.id).sort(),
      duplicateFacilityHandling: {
        method: "name_or_address_within_25m",
        groupedRecordCount: group.length,
        countedPlaceCount: 1,
      },
      existingStrictOverlap: false,
      routeMetrics: dynamicRouteMetrics,
      dynamicRouteMetrics,
      fixedDemoRouteMetrics,
    }];
  }).sort(resultOrder);

  const orderedExclusions = exclusions.sort((a, b) => a.reasonCode.localeCompare(b.reasonCode)
    || a.candidateId.localeCompare(b.candidateId));
  const exclusionReasonCounts = Object.fromEntries([...new Set(orderedExclusions.map((item) => item.reasonCode))]
    .sort()
    .map((reasonCode) => [
      reasonCode,
      orderedExclusions.filter((item) => item.reasonCode === reasonCode).length,
    ]));
  return {
    eligibleGroupCount: ranked.length,
    rankedCandidateCount: ranked.length,
    preRankingGroupCount: clustered.groups.length,
    coordinateConflictGroupCount: coordinateQuality.coordinateConflictGroupCount,
    excludedCoordinateConflictCandidateCount: coordinateQuality.excludedCoordinateConflictCandidateCount,
    excludedCoordinateConflictPlaceCount: coordinateQuality.excludedCoordinateConflictPlaceCount,
    exclusionReasonCounts,
    exclusions: orderedExclusions,
    candidates: ranked.slice(0, limit)
      .map((candidate, index) => ({ fieldCheckPriority: index + 1, ...candidate })),
  };
}
