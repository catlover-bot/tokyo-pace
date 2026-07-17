export type RestSpotCategory = "park" | "public_facility" | "toilet" | "library" | "other";
export type Confidence = "official" | "verified" | "estimated";

export type RestSpot = {
  id: string; name: string; latitude: number; longitude: number; category: RestSpotCategory;
  seating: boolean | null; indoor: boolean | null; toiletAvailable: boolean | null;
  wheelchairAccessible: boolean | null; openingHours: string | null; sourceName: string;
  sourceUrl: string | null; lastVerifiedAt: string | null; confidence: Confidence;
};

export type RoutePreferences = {
  maxContinuousWalkingMinutes: 5 | 10 | 15;
  requireToilet: boolean; avoidSteepSlopes: boolean; preferIndoorRest: boolean;
};

export type DemoRoute = {
  id: "standard" | "comfort"; name: string; coordinates: [number, number][];
  durationMinutes: number; distanceMeters: number; restSpotIds: string[];
  maxContinuousWalkingMinutes: number; toiletAvailable: boolean; steepSlopeCount: number;
  indoorRestCount: number;
};

export type EvaluatedRoute = DemoRoute & { score: number; reasons: string[]; meetsPreferences: boolean };
