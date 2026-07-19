const EARTH_RADIUS_METERS = 6_371_000;
const radians = (degrees) => degrees * Math.PI / 180;
const roundDistance = (value) => Math.round(value);
const roundCoordinate = (value) => Number(value.toFixed(6));
const roundRatio = (value) => Number(value.toFixed(4));

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
  const addressA = normalizeMatchText(a.address); const addressB = normalizeMatchText(b.address);
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
  const p = project(point); const a = project(start); const b = project(end);
  const dx = b.x - a.x; const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return { distanceMeters: haversineMeters(point, start), ratio: 0 };
  const ratio = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return { distanceMeters: Math.hypot(p.x - (a.x + ratio * dx), p.y - (a.y + ratio * dy)), ratio };
}

export function projectCandidateToRoute(candidate, route) {
  if (!route.coordinates.length) return { distanceToRouteMeters: Number.POSITIVE_INFINITY, geometryProgressMeters: 0, geometryLengthMeters: 0, routeProgressMeters: 0 };
  if (route.coordinates.length === 1) return { distanceToRouteMeters: haversineMeters([candidate.latitude, candidate.longitude], route.coordinates[0]), geometryProgressMeters: 0, geometryLengthMeters: 0, routeProgressMeters: 0 };
  let geometryProgress = 0; let geometryLength = 0; let best = null;
  const segments = route.coordinates.slice(1).map((end, index) => {
    const start = route.coordinates[index]; const length = haversineMeters(start, end);
    geometryLength += length;
    return { start, end, length };
  });
  for (const segment of segments) {
    const projection = projectPointToSegment([candidate.latitude, candidate.longitude], segment.start, segment.end);
    const current = { distanceToRouteMeters: projection.distanceMeters, geometryProgressMeters: geometryProgress + segment.length * projection.ratio };
    if (!best || current.distanceToRouteMeters < best.distanceToRouteMeters) best = current;
    geometryProgress += segment.length;
  }
  return {
    ...best,
    geometryLengthMeters: geometryLength,
    routeProgressMeters: geometryLength ? best.geometryProgressMeters / geometryLength * route.distanceMeters : 0,
  };
}

function coordinateAtProgress(route, routeProgressMeters) {
  const geometryLength = route.coordinates.slice(1).reduce((sum, end, index) => sum + haversineMeters(route.coordinates[index], end), 0);
  const target = route.distanceMeters ? routeProgressMeters / route.distanceMeters * geometryLength : 0;
  let progress = 0;
  for (let index = 0; index < route.coordinates.length - 1; index += 1) {
    const start = route.coordinates[index]; const end = route.coordinates[index + 1]; const length = haversineMeters(start, end);
    if (progress + length >= target) {
      const ratio = length ? (target - progress) / length : 0;
      return [roundCoordinate(start[0] + (end[0] - start[0]) * ratio), roundCoordinate(start[1] + (end[1] - start[1]) * ratio)];
    }
    progress += length;
  }
  const end = route.coordinates.at(-1) ?? [0, 0];
  return [roundCoordinate(end[0]), roundCoordinate(end[1])];
}

function deriveGaps(routeLengthMeters, positions) {
  const boundaries = [0, ...positions.filter((value) => value > 0 && value < routeLengthMeters), routeLengthMeters].sort((a, b) => a - b);
  return boundaries.slice(1).map((end, index) => ({ start: boundaries[index], end, gap: end - boundaries[index] }));
}

function largestGap(gaps) {
  return [...gaps].sort((a, b) => b.gap - a.gap || a.start - b.start)[0] ?? { start: 0, end: 0, gap: 0 };
}

function clusterEligibleCandidates(candidates) {
  const strict = candidates.filter((candidate) => candidate.confidence === "confirmed" || candidate.confidence === "supported");
  const eligible = candidates.filter((candidate) => candidate.confidence === "possible"
    && (candidate.category === "public_facility" || candidate.category === "barrier_free_facility")
    && candidate.address?.includes("新宿区")
    && !strict.some((strictCandidate) => sameFacilityWithin25Meters(candidate, strictCandidate)))
    .sort((a, b) => a.id.localeCompare(b.id));
  const parents = eligible.map((_, index) => index);
  const find = (index) => parents[index] === index ? index : (parents[index] = find(parents[index]));
  const union = (a, b) => { const left = find(a); const right = find(b); if (left !== right) parents[Math.max(left, right)] = Math.min(left, right); };
  for (let left = 0; left < eligible.length; left += 1) for (let right = left + 1; right < eligible.length; right += 1) {
    const a = eligible[left]; const b = eligible[right];
    if (sameFacilityWithin25Meters(a, b)) union(left, right);
  }
  const groups = new Map();
  eligible.forEach((candidate, index) => {
    const root = find(index); const group = groups.get(root) ?? []; group.push(candidate); groups.set(root, group);
  });
  return [...groups.values()].map((group) => group.sort((a, b) => a.id.localeCompare(b.id)));
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
    // Do not merge mutually distinct facilities. When at least three of them share
    // exactly one coordinate, exclude that source anomaly from field-work ranking.
    if (coordinateGroups.length >= 3 && names.size >= 3 && addresses.size >= 3) {
      coordinateConflictGroupCount += 1;
      for (const group of coordinateGroups) conflictedGroups.add(group);
    }
  }
  return {
    groups: groups.filter((group) => !conflictedGroups.has(group)),
    coordinateConflictGroupCount,
    excludedCoordinateConflictCandidateCount: [...conflictedGroups].reduce((sum, group) => sum + group.length, 0),
    excludedCoordinateConflictPlaceCount: conflictedGroups.size,
  };
}

function routeMetric(route, candidate, strictCandidates, maximumDistanceMeters) {
  const projection = projectCandidateToRoute(candidate, route);
  if (projection.distanceToRouteMeters > maximumDistanceMeters) return null;
  const strictPositions = strictCandidates.map((strictCandidate) => ({ strictCandidate, projection: projectCandidateToRoute(strictCandidate, route) }))
    .filter((item) => item.projection.distanceToRouteMeters <= maximumDistanceMeters)
    .map((item) => item.projection.routeProgressMeters);
  const currentGaps = deriveGaps(route.distanceMeters, strictPositions);
  const currentLargest = largestGap(currentGaps);
  const improvedLargest = largestGap(deriveGaps(route.distanceMeters, [...strictPositions, projection.routeProgressMeters]));
  const improvement = Math.max(0, currentLargest.gap - improvedLargest.gap);
  const suggestedProgress = (currentLargest.start + currentLargest.end) / 2;
  const suggestedCoordinate = coordinateAtProgress(route, suggestedProgress);
  return {
    routeId: route.id,
    distanceToRouteMeters: roundDistance(projection.distanceToRouteMeters),
    routeProgressMeters: roundDistance(projection.routeProgressMeters),
    currentLongestGapMeters: roundDistance(currentLargest.gap),
    expectedImprovedGapMeters: roundDistance(improvedLargest.gap),
    expectedImprovementMeters: roundDistance(improvement),
    expectedImprovementRatio: roundRatio(currentLargest.gap ? improvement / currentLargest.gap : 0),
    distanceToSuggestedInsertionMeters: roundDistance(haversineMeters([candidate.latitude, candidate.longitude], suggestedCoordinate)),
    insideLargestGap: projection.routeProgressMeters >= currentLargest.start && projection.routeProgressMeters <= currentLargest.end,
  };
}

const resultOrder = (a, b) => b.expectedImprovementMeters - a.expectedImprovementMeters
  || b.routeIds.length - a.routeIds.length
  || a.distanceToSuggestedInsertionMeters - b.distanceToSuggestedInsertionMeters
  || a.distanceToRouteMeters - b.distanceToRouteMeters
  || a.candidateId.localeCompare(b.candidateId);

export function extractFieldVerificationCandidates({ routes, candidates, limit = 12, maximumDistanceMeters = 350 }) {
  const strictCandidates = candidates.filter((candidate) => candidate.confidence === "confirmed" || candidate.confidence === "supported");
  const coordinateQuality = excludeCoordinateConflicts(clusterEligibleCandidates(candidates));
  const grouped = coordinateQuality.groups;
  const ranked = grouped.flatMap((group) => {
    const representative = group[0];
    const routeMetrics = routes.map((route) => routeMetric(route, representative, strictCandidates, maximumDistanceMeters)).filter(Boolean)
      .sort((a, b) => a.routeId.localeCompare(b.routeId));
    if (!routeMetrics.length) return [];
    const primary = [...routeMetrics].sort((a, b) => b.expectedImprovementMeters - a.expectedImprovementMeters
      || a.distanceToRouteMeters - b.distanceToRouteMeters || a.routeId.localeCompare(b.routeId))[0];
    const sourceIds = group.map((candidate) => `${candidate.source.sourceDatasetId}:${candidate.source.sourceRecordId}`).sort();
    const categories = [...new Set(group.map((candidate) => candidate.category))].sort();
    const reasons = [
      primary.insideLargestGap ? "現在の最長休憩空白区間内" : null,
      primary.distanceToSuggestedInsertionMeters <= 150 ? "理論上の休憩地点追加候補に近い" : null,
      primary.distanceToRouteMeters <= 100 ? "デモルートから推定直線100m以内" : null,
      categories.includes("public_facility") ? "公式の公共施設情報" : null,
      categories.includes("barrier_free_facility") ? "公式のバリアフリー施設情報" : null,
      "新宿区内として公式掲載",
      routeMetrics.length > 1 ? "複数のデモルートに近い" : null,
    ].filter(Boolean);
    return [{
      candidateId: representative.id,
      verificationId: `fv-${representative.id}`,
      name: representative.name,
      latitude: roundCoordinate(representative.latitude),
      longitude: roundCoordinate(representative.longitude),
      address: representative.address,
      categories,
      routeIds: routeMetrics.map((metric) => metric.routeId),
      primaryRouteId: primary.routeId,
      distanceToRouteMeters: primary.distanceToRouteMeters,
      routeProgressMeters: primary.routeProgressMeters,
      currentLongestGapMeters: primary.currentLongestGapMeters,
      expectedImprovedGapMeters: primary.expectedImprovedGapMeters,
      expectedImprovementMeters: primary.expectedImprovementMeters,
      expectedImprovementRatio: primary.expectedImprovementRatio,
      distanceToSuggestedInsertionMeters: primary.distanceToSuggestedInsertionMeters,
      selectionReasons: reasons,
      officialSourceIds: sourceIds,
      groupedCandidateIds: group.map((candidate) => candidate.id),
      routeMetrics,
    }];
  }).sort(resultOrder);
  return {
    eligibleGroupCount: ranked.length,
    coordinateConflictGroupCount: coordinateQuality.coordinateConflictGroupCount,
    excludedCoordinateConflictCandidateCount: coordinateQuality.excludedCoordinateConflictCandidateCount,
    excludedCoordinateConflictPlaceCount: coordinateQuality.excludedCoordinateConflictPlaceCount,
    candidates: ranked.slice(0, limit).map((candidate, index) => ({ fieldCheckPriority: index + 1, ...candidate })),
  };
}
