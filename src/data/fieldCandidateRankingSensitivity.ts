import generated from "./generated/field-candidate-ranking-sensitivity.json";
import type {
  FieldCandidateRankingSensitivity,
  FieldCandidateRankingSensitivityMetadata,
} from "../types";

export const fieldCandidateRankingSensitivityMetadata =
  generated.metadata as unknown as FieldCandidateRankingSensitivityMetadata;

export const fieldCandidateRankingSensitivity =
  generated.candidates as unknown as FieldCandidateRankingSensitivity[];
