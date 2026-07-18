import generated from "./generated/official-toilets.json";
import type { OfficialToiletPlace } from "../types";

export const officialToiletPlaces = generated.places as OfficialToiletPlace[];
export const officialToiletMetadata = generated.metadata;
