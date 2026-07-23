import generated from "./generated/field-visit-shortlist.json";
import type {
  FieldVisitShortlistEntry,
  FieldVisitShortlistMetadata,
} from "../types";

export const fieldVisitShortlistMetadata =
  generated.metadata as unknown as FieldVisitShortlistMetadata;

export const fieldVisitShortlist =
  generated.entries as unknown as FieldVisitShortlistEntry[];
