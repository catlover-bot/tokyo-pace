export type RestSpotCategory = "park" | "public_facility" | "toilet" | "library" | "other";
export type Confidence = "official" | "verified" | "estimated";
export type PlaceCategory = "drinking_station" | "barrier_free_facility" | "public_facility" | "verified_rest_spot" | "estimated_rest_spot";
export type RestConfidence = "confirmed" | "supported" | "possible" | "estimated";
export type OfficialToiletKind = "public_toilet" | "facility_toilet_information" | "station_toilet_information";

export type DataSource = {
  sourceDatasetId?: string;
  sourceRecordId?: string;
  provider: string;
  datasetName: string;
  datasetUrl: string | null;
  resourceUrl: string | null;
  license: string | null;
  datasetUpdatedAt: string | null;
  retrievedAt?: string | null;
  fieldVerifiedAt: string | null;
};

export type OpenDataManifestEntry = { datasetId: string; datasetUrl: string; resourceUrl: string; retrievedAt: string; contentSha256: string; byteSize: number; normalizedRecordCount: number; excludedRecordCount: number; sourceUpdatedAt: string | null; encoding: string; license: string };
export type OpenDataManifest = { schemaVersion: number; datasets: OpenDataManifestEntry[] };

export type RestSpot = {
  id: string; name: string; latitude: number; longitude: number; category: RestSpotCategory;
  address: string | null;
  seating: boolean | null; indoor: boolean | null; toiletAvailable: boolean | null;
  wheelchairAccessible: boolean | null; openingHours: string | null;
  officialToiletKind: OfficialToiletKind | null;
  source: DataSource;
  confidence: Confidence;
};

export type RestCandidate = {
  id: string; name: string; latitude: number; longitude: number; address: string | null;
  category: PlaceCategory; confidence: RestConfidence;
  openingHours: string | null; indoor: boolean | null; seating: boolean | null;
  drinkingWaterAvailable: boolean | null; wheelchairAccessible: boolean | null;
  source: DataSource;
};

export type GapSegment = { startProgressMeters: number; endProgressMeters: number; gapMeters: number; coordinates: [number, number][] };
export type RestInsertionSuggestion = {
  suggestedRestInsertionProgressMeters: number;
  suggestedRestInsertionCoordinate: [number, number];
  currentLongestRestGapMeters: number; improvedLongestRestGapMeters: number;
  improvementMeters: number; improvementRatio: number;
};
export type RestNetworkMetrics = {
  nearestRestCandidateDistanceMeters: number | null; nearestDrinkingStationDistanceMeters: number | null;
  longestRestGapMeters: number; longestDrinkingWaterGapMeters: number; longestIndoorCandidateGapMeters: number;
  restCandidateCount: number; drinkingStationCount: number; indoorCandidateCount: number;
  confirmedRestSpotCount: number; supportedRestSpotCount: number; possibleRestSpotCount: number;
  referencePossibleCandidateCount: number;
  continuityFeasibleBySegment: boolean; continuityFeasibleByRestNetwork: boolean;
  longestUncoveredWalkingMinutes: number; restNetworkCoverageRatio: number;
  continuityFailureReason: string | null; restNetworkLevel: RestConfidence | "none";
  restGapSegments: GapSegment[]; drinkingWaterGapSegments: GapSegment[]; indoorCandidateGapSegments: GapSegment[];
  restInsertionSuggestion: RestInsertionSuggestion;
};

export type OfficialToiletPlace = {
  clusterId: string;
  sourceRecordCount: number;
  representativeLatitude: number;
  representativeLongitude: number;
  records: RestSpot[];
  kinds: OfficialToiletKind[];
  hasPublicToiletRecord: boolean;
  hasWheelchairAccessibleRecord: boolean;
};

export type RoutePreferences = {
  maxContinuousWalkingMinutes: 5 | 10 | 15;
  requireToilet: boolean; avoidSteepSlopes: boolean; preferIndoorRest: boolean; avoidSteps?: boolean;
};

export type GeoPoint = { latitude: number; longitude: number };
export type RouteSearchRequest = { origin: GeoPoint; destination: GeoPoint; preferences: RoutePreferences };
export type RouteProfile = "standard" | "step_avoiding" | "wheelchair_profile";
export type RouteStep = { instruction: string; distanceMeters: number; durationSeconds: number };
export type RouteExtraSegment = { from: number; to: number; value: number };

export type WalkingSegment = {
  id: string;
  name: string;
  distanceMeters: number;
  walkingMinutes: number;
  endsAtRestSpot: boolean;
  restSpotId: string | null;
};

export type DemoRoute = {
  id: string; name: string; coordinates: [number, number][];
  durationMinutes: number; durationSeconds?: number; distanceMeters: number; restSpotIds: string[];
  walkingSegments: WalkingSegment[]; steepSlopeCount: number;
  indoorRestCount: number;
  provider?: "demo" | "openrouteservice";
  profile?: RouteProfile;
  bbox?: [number, number, number, number];
  steps?: RouteStep[];
  wayTypes?: RouteExtraSegment[];
  steepnessSegments?: RouteExtraSegment[];
  sourceAttribution?: string;
  generatedAt?: string;
  warnings?: string[];
  isFallback?: boolean;
};

export type ContinuityMetrics = {
  continuityFeasible: boolean;
  maxContinuousWalkingMinutes: number;
  longestRestGapMeters: number;
  continuousWalkingExcessMinutes: number;
};

export type PublicToiletGapSegment = {
  startProgressMeters: number;
  endProgressMeters: number;
  gapMeters: number;
  startGeometryProgressMeters: number;
  endGeometryProgressMeters: number;
  geometryGapMeters: number;
  coordinates: [number, number][];
};

export type EvaluatedRoute = DemoRoute & ContinuityMetrics & RestNetworkMetrics & {
  continuousWalkingLimitMinutes: number;
  score: number;
  reasons: string[];
  meetsPreferences: boolean;
  officialToiletRecordCount: number;
  officialToiletPlaceCount: number;
  publicToiletPlaceCount: number;
  facilityToiletInformationPlaceCount: number;
  stationToiletInformationPlaceCount: number;
  nearestPublicToiletDistanceMeters: number | null;
  nearestAnyOfficialToiletInformationDistanceMeters: number | null;
  hasPublicToiletCandidate: boolean;
  hasAnyOfficialToiletInformation: boolean;
  geometryLengthMeters: number;
  routeLengthMeters: number;
  longestPublicToiletGapMeters: number;
  publicToiletGapSegments: PublicToiletGapSegment[];
  largestGapStartProgressMeters: number;
  largestGapEndProgressMeters: number;
  largestGapStartGeometryProgressMeters: number;
  largestGapEndGeometryProgressMeters: number;
  longestPublicToiletGeometryGapMeters: number;
  toiletDataSource: string;
};
