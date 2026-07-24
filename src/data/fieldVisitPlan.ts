import generated from "./generated/field-visit-plan.json";
import type { FacilityAccessCategory, RouteProfile } from "../types";

export type FieldVisitPlanEntry = {
  confirmationPriority: number;
  verificationId: string;
  candidateId: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  facilityCategory: FacilityAccessCategory;
  targetRouteIds: RouteProfile[];
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

export type FieldVisitPlanMetadata = {
  schemaVersion: 1;
  datasetId: "tokyo-pace-field-visit-plan";
  sourceType: "tokyo_pace_field_visit_plan";
  provider: "TOKYO PACE";
  datasetName: string;
  generatedBy: "TOKYO PACE";
  generatedAt: string;
  sourceShortlistDatasetId: "tokyo-pace-field-visit-shortlist";
  entryCount: number;
  confirmationResultFieldsPrefilled: false;
  configuration: {
    orderSource: string;
    expectedEntryCount: number;
    confirmationResultFieldsInitializedToNull: boolean;
  };
};

export const fieldVisitPlanMetadata =
  generated.metadata as unknown as FieldVisitPlanMetadata;

export const fieldVisitPlan =
  generated.entries as unknown as FieldVisitPlanEntry[];
