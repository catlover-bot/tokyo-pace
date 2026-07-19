export const FIELD_VERIFICATION_DATASET_ID = "tokyo-pace-field-verification-rest-spots";

export const FIELD_VERIFICATION_HEADERS = [
  "verificationId",
  "candidateId",
  "name",
  "latitude",
  "longitude",
  "address",
  "verifiedAt",
  "verifier",
  "verificationMethod",
  "publiclyAccessible",
  "seatingAvailable",
  "indoorOrCovered",
  "drinkingWaterAvailable",
  "toiletAvailable",
  "wheelchairAccessible",
  "openingHoursObserved",
  "accessRestrictions",
  "evidenceReference",
  "notes",
];

export const FIELD_VERIFICATION_METHODS = [
  "on_site_observation",
  "combined_on_site_and_official",
  "official_source_review",
  "staff_confirmation",
];

const nullableText = (value) => {
  const normalized = value?.trim() ?? "";
  return normalized === "" || normalized === "null" ? null : normalized;
};

export function parseVerificationBoolean(value) {
  const normalized = value?.trim() ?? "";
  if (normalized === "true") return { value: true };
  if (normalized === "false") return { value: false };
  if (normalized === "null" || normalized === "") return { value: null };
  return { error: "invalid_tristate_boolean" };
}

export function normalizeVerifiedAt(value) {
  const normalized = nullableText(value);
  if (normalized === null) return { value: null };
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(normalized);
  if (!match) {
    return { error: "invalid_verified_at" };
  }
  const [, year, month, day, hour, minute, second, milliseconds = "0"] = match;
  const componentDate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second), Number(milliseconds.padEnd(3, "0"))));
  if (componentDate.getUTCFullYear() !== Number(year)
    || componentDate.getUTCMonth() !== Number(month) - 1
    || componentDate.getUTCDate() !== Number(day)
    || componentDate.getUTCHours() !== Number(hour)
    || componentDate.getUTCMinutes() !== Number(minute)
    || componentDate.getUTCSeconds() !== Number(second)) return { error: "invalid_verified_at" };
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp)
    ? { value: new Date(timestamp).toISOString() }
    : { error: "invalid_verified_at" };
}

export function isValidEvidenceReference(value) {
  const normalized = nullableText(value);
  if (normalized === null) return true;
  if (normalized.startsWith("urn:tokyo-pace:")) return true;
  try {
    return new globalThis.URL(normalized).protocol === "https:";
  } catch {
    return false;
  }
}

export function deriveFieldVerificationConfidence(record) {
  const hasVerificationIdentity = Boolean(record.verifiedAt && record.verifier && record.verificationMethod);
  const observedOnSite = record.verificationMethod === "on_site_observation"
    || record.verificationMethod === "combined_on_site_and_official";
  if (hasVerificationIdentity && observedOnSite
    && record.publiclyAccessible === true && record.seatingAvailable === true) {
    return "confirmed";
  }
  if (hasVerificationIdentity
    && record.verificationMethod === "combined_on_site_and_official"
    && record.evidenceReference
    && record.publiclyAccessible !== false
    && record.seatingAvailable !== false
    && (record.publiclyAccessible === true || record.seatingAvailable === true)) {
    return "supported";
  }
  return "possible";
}

const exclusionOrder = (a, b) => (a.verificationId ?? "").localeCompare(b.verificationId ?? "")
  || (a.candidateId ?? "").localeCompare(b.candidateId ?? "")
  || a.reasons.join(":").localeCompare(b.reasons.join(":"))
  || a.rowNumber - b.rowNumber;

export function normalizeFieldVerificationRows(rows, candidates) {
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const idCounts = new Map();
  for (const row of rows) {
    const verificationId = row.verificationId?.trim() ?? "";
    if (verificationId) idCounts.set(verificationId, (idCounts.get(verificationId) ?? 0) + 1);
  }

  const records = [];
  const exclusions = [];
  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const verificationId = row.verificationId?.trim() ?? "";
    const candidateId = row.candidateId?.trim() ?? "";
    const reasons = [];
    if (!verificationId) reasons.push("missing_verification_id");
    else if ((idCounts.get(verificationId) ?? 0) > 1) reasons.push("duplicate_verification_id");
    if (!candidateId) reasons.push("missing_candidate_id");
    else if (!candidateById.has(candidateId)) reasons.push("unknown_candidate_id");
    const name = row.name?.trim() ?? "";
    if (!name) reasons.push("missing_name");

    const latitude = Number(row.latitude);
    const longitude = Number(row.longitude);
    if (!row.latitude?.trim() || !Number.isFinite(latitude) || latitude < 20 || latitude > 50) reasons.push("invalid_latitude");
    if (!row.longitude?.trim() || !Number.isFinite(longitude) || longitude < 120 || longitude > 155) reasons.push("invalid_longitude");

    const verifiedAt = normalizeVerifiedAt(row.verifiedAt);
    if (verifiedAt.error) reasons.push(verifiedAt.error);
    const verificationMethod = nullableText(row.verificationMethod);
    if (verificationMethod !== null && !FIELD_VERIFICATION_METHODS.includes(verificationMethod)) reasons.push("invalid_verification_method");
    if (!isValidEvidenceReference(row.evidenceReference)) reasons.push("invalid_evidence_reference");

    const booleanFields = [
      "publiclyAccessible",
      "seatingAvailable",
      "indoorOrCovered",
      "drinkingWaterAvailable",
      "toiletAvailable",
      "wheelchairAccessible",
    ];
    const booleans = Object.fromEntries(booleanFields.map((field) => [field, parseVerificationBoolean(row[field])]));
    for (const field of booleanFields) if (booleans[field].error) reasons.push(`${field}:${booleans[field].error}`);

    if (reasons.length) {
      exclusions.push({ rowNumber, verificationId: verificationId || null, candidateId: candidateId || null, reasons: [...new Set(reasons)].sort() });
      return;
    }

    const normalized = {
      verificationId,
      candidateId,
      name,
      latitude,
      longitude,
      address: nullableText(row.address),
      verifiedAt: verifiedAt.value,
      verifier: nullableText(row.verifier),
      verificationMethod,
      publiclyAccessible: booleans.publiclyAccessible.value,
      seatingAvailable: booleans.seatingAvailable.value,
      indoorOrCovered: booleans.indoorOrCovered.value,
      drinkingWaterAvailable: booleans.drinkingWaterAvailable.value,
      toiletAvailable: booleans.toiletAvailable.value,
      wheelchairAccessible: booleans.wheelchairAccessible.value,
      openingHoursObserved: nullableText(row.openingHoursObserved),
      accessRestrictions: nullableText(row.accessRestrictions),
      evidenceReference: nullableText(row.evidenceReference),
      notes: nullableText(row.notes),
    };
    records.push({ ...normalized, confidence: deriveFieldVerificationConfidence(normalized) });
  });

  return {
    records: records.sort((a, b) => a.candidateId.localeCompare(b.candidateId)
      || (a.verifiedAt ?? "").localeCompare(b.verifiedAt ?? "")
      || a.verificationId.localeCompare(b.verificationId)),
    exclusions: exclusions.sort(exclusionOrder),
    inputCount: rows.length,
    normalizedCount: records.length,
    excludedCount: exclusions.length,
  };
}

export function selectEffectiveFieldVerifications(records) {
  const selected = new Map();
  for (const record of [...records].sort((a, b) => a.candidateId.localeCompare(b.candidateId)
    || (b.verifiedAt ?? "").localeCompare(a.verifiedAt ?? "")
    || a.verificationId.localeCompare(b.verificationId))) {
    if (!selected.has(record.candidateId)) selected.set(record.candidateId, record);
  }
  return [...selected.values()].sort((a, b) => a.candidateId.localeCompare(b.candidateId));
}

const observedOrBase = (observed, base) => observed === null ? base : observed;

export function buildVerifiedRestCandidates(records, candidates, candidateGroups = []) {
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const groupByCandidateId = new Map();
  for (const group of candidateGroups) {
    const groupedCandidateIds = [...new Set(group.groupedCandidateIds ?? [group.candidateId])].sort();
    const normalizedGroup = {
      candidateId: group.candidateId,
      groupedCandidateIds,
      officialSourceIds: [...new Set(group.officialSourceIds ?? [])].sort(),
    };
    for (const candidateId of groupedCandidateIds) groupByCandidateId.set(candidateId, normalizedGroup);
  }
  const selectedByGroup = new Map();
  for (const record of selectEffectiveFieldVerifications(records).sort((a, b) => {
    const groupA = groupByCandidateId.get(a.candidateId)?.candidateId ?? a.candidateId;
    const groupB = groupByCandidateId.get(b.candidateId)?.candidateId ?? b.candidateId;
    return groupA.localeCompare(groupB)
      || (b.verifiedAt ?? "").localeCompare(a.verifiedAt ?? "")
      || a.verificationId.localeCompare(b.verificationId);
  })) {
    const groupId = groupByCandidateId.get(record.candidateId)?.candidateId ?? record.candidateId;
    if (!selectedByGroup.has(groupId)) selectedByGroup.set(groupId, record);
  }
  return [...selectedByGroup.entries()].flatMap(([groupId, record]) => {
    const group = groupByCandidateId.get(record.candidateId);
    const base = candidateById.get(group?.candidateId ?? record.candidateId) ?? candidateById.get(record.candidateId);
    if (!base) return [];
    const relatedCandidateIds = group?.groupedCandidateIds ?? [record.candidateId];
    const officialSourceIds = group?.officialSourceIds?.length
      ? group.officialSourceIds
      : [`${base.source.sourceDatasetId}:${base.source.sourceRecordId}`];
    return [{
      id: `verified-${groupId}`,
      name: record.name,
      latitude: record.latitude,
      longitude: record.longitude,
      address: record.address ?? base.address,
      category: "verified_rest_spot",
      confidence: record.confidence,
      openingHours: record.openingHoursObserved ?? base.openingHours,
      indoor: observedOrBase(record.indoorOrCovered, base.indoor),
      seating: observedOrBase(record.seatingAvailable, base.seating),
      drinkingWaterAvailable: observedOrBase(record.drinkingWaterAvailable, base.drinkingWaterAvailable),
      wheelchairAccessible: observedOrBase(record.wheelchairAccessible, base.wheelchairAccessible),
      publiclyAccessible: record.publiclyAccessible,
      toiletAvailable: record.toiletAvailable,
      accessRestrictions: record.accessRestrictions,
      evidenceReference: record.evidenceReference,
      verificationMethod: record.verificationMethod,
      relatedCandidateIds,
      officialSourceIds,
      source: {
        sourceDatasetId: FIELD_VERIFICATION_DATASET_ID,
        sourceRecordId: record.verificationId,
        provider: "TOKYO PACE 現地確認",
        datasetName: "TOKYO PACE 休憩地点現地確認",
        datasetUrl: null,
        resourceUrl: null,
        license: null,
        datasetUpdatedAt: record.verifiedAt,
        fieldVerifiedAt: record.verifiedAt,
        sourceType: "tokyo_pace_field_verification",
        attribution: "TOKYO PACE 現地確認データ",
      },
    }];
  }).sort((a, b) => a.id.localeCompare(b.id));
}
