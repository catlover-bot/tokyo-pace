import generated from "./generated/verified-rest-spots.json";
import type { RestCandidate } from "../types";

type VerifiedCandidate = RestCandidate & { relatedCandidateIds: string[] };

export const verifiedRestCandidates = generated.candidates as unknown as VerifiedCandidate[];
export const verifiedRestMetadata = generated.metadata;
export const verifiedBaseCandidateIds = new Set(verifiedRestCandidates.flatMap((candidate) => candidate.relatedCandidateIds));

