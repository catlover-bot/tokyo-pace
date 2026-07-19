import generated from "./generated/rest-candidates.json";
import type { RestCandidate } from "../types";
import { restSpots } from "./restSpots";
import { verifiedBaseCandidateIds, verifiedRestCandidates } from "./verifiedRestSpots";

export const officialRestCandidates = (generated.candidates as RestCandidate[]).filter((candidate) => !verifiedBaseCandidateIds.has(candidate.id));
export const officialRestMetadata = generated.metadata;
export const demoRestCandidates: RestCandidate[] = restSpots.filter((spot) => spot.category !== "toilet").map((spot) => ({
  id: spot.id, name: spot.name, latitude: spot.latitude, longitude: spot.longitude, address: spot.address,
  category: "estimated_rest_spot", confidence: "estimated", openingHours: spot.openingHours,
  indoor: spot.indoor, seating: spot.seating, drinkingWaterAvailable: null,
  wheelchairAccessible: spot.wheelchairAccessible, source: spot.source,
}));
export const allRestCandidates = [...officialRestCandidates, ...verifiedRestCandidates, ...demoRestCandidates];
