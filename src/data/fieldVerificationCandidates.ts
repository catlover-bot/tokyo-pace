import generated from "./generated/field-verification-candidates.json";
import type { FieldVerificationCandidate } from "../types";

export const fieldVerificationCandidates = generated.candidates as unknown as FieldVerificationCandidate[];
export const fieldVerificationCandidateMetadata = generated.metadata;
