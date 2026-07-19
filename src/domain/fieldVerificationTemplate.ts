export const FIELD_VERIFICATION_COLUMNS = [
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
] as const;

export const FIELD_VERIFICATION_TEMPLATE_FILENAME = "tokyo-pace-field-verification-template.csv";

export type FieldVerificationTemplateCandidate = {
  candidateId: string;
  verificationId?: string;
  name: string;
  latitude: number;
  longitude: number;
  address: string | null;
};

export function createVerificationId(candidateId: string): string {
  return `fv-${candidateId}`;
}

function protectSpreadsheetCell(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function encodeCsvCell(value: string | number | null): string {
  const text = protectSpreadsheetCell(value === null ? "" : String(value));
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function buildFieldVerificationTemplate(candidates: readonly FieldVerificationTemplateCandidate[]): string {
  const sorted = [...candidates].sort((a, b) => a.candidateId.localeCompare(b.candidateId));
  const rows = sorted.map((candidate) => {
    const values: Record<(typeof FIELD_VERIFICATION_COLUMNS)[number], string | number | null> = {
      verificationId: candidate.verificationId ?? createVerificationId(candidate.candidateId),
      candidateId: candidate.candidateId,
      name: candidate.name,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      address: candidate.address,
      verifiedAt: null,
      verifier: null,
      verificationMethod: null,
      publiclyAccessible: null,
      seatingAvailable: null,
      indoorOrCovered: null,
      drinkingWaterAvailable: null,
      toiletAvailable: null,
      wheelchairAccessible: null,
      openingHoursObserved: null,
      accessRestrictions: null,
      evidenceReference: null,
      notes: null,
    };
    return FIELD_VERIFICATION_COLUMNS.map((column) => encodeCsvCell(values[column])).join(",");
  });
  return [FIELD_VERIFICATION_COLUMNS.join(","), ...rows].join("\r\n") + "\r\n";
}

export function downloadFieldVerificationTemplate(candidates: readonly FieldVerificationTemplateCandidate[]): void {
  if (typeof document === "undefined") return;
  const url = URL.createObjectURL(new Blob([buildFieldVerificationTemplate(candidates)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = FIELD_VERIFICATION_TEMPLATE_FILENAME;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
