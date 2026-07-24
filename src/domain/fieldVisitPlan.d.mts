export type FieldVisitPlanEntry = {
  confirmationPriority: number;
  verificationId: string;
  candidateId: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  facilityCategory: string;
  targetRouteIds: string[];
  distanceToRouteMeters: number;
  optimisticImprovementMeters: number;
  lowerBoundImprovementMeters: number;
  conservativeProxyImprovementMeters: number;
  top5AppearanceRate: number;
  stabilityDescription: string;
  selectionReason: string;
  caution: string;
  publiclyAccessible: null;
  seatingAvailable: null;
  seatingUsableForRest: null;
  indoorOrCovered: null;
  drinkingWaterAvailable: null;
  toiletAvailable: null;
  wheelchairAccessible: null;
  openingHoursObserved: null;
  accessRestrictions: null;
  verifiedAt: null;
  verifier: null;
  verificationMethod: null;
  evidenceReference: null;
  notes: null;
};

export type FieldVisitPlan = {
  configuration: {
    orderSource: string;
    expectedEntryCount: number;
    confirmationResultFieldsInitializedToNull: boolean;
  };
  entries: FieldVisitPlanEntry[];
};

export const FIELD_VISIT_PLAN_EXPECTED_ENTRY_COUNT: number;
export const FIELD_VISIT_PLAN_CONFIRMATION_COLUMNS: readonly string[];
export const FIELD_VISIT_PLAN_COLUMNS: readonly string[];
export const FIELD_VISIT_PLAN_FILENAME: string;

export function describeFieldVisitPlanStability(
  candidate: Record<string, unknown>,
): string;
export function deriveFieldVisitPlan(
  shortlist: { candidates: Array<Record<string, unknown>> } | Array<Record<string, unknown>>,
  sourceCandidates?: Array<Record<string, unknown>>,
): FieldVisitPlan;
export function fieldVisitPlanCsv(plan: FieldVisitPlan): string;
