export type RestSpotCategory = "park" | "public_facility" | "toilet" | "library" | "other";
export type Confidence = "official" | "verified" | "estimated";
export type OfficialToiletKind = "public_toilet" | "facility_toilet_information" | "station_toilet_information";

export type DataSource = {
  provider: string;
  datasetName: string;
  datasetUrl: string | null;
  resourceUrl: string | null;
  license: string | null;
  datasetUpdatedAt: string | null;
  retrievedAt: string | null;
  fieldVerifiedAt: string | null;
};

export type RestSpot = {
  id: string; name: string; latitude: number; longitude: number; category: RestSpotCategory;
  address: string | null;
  seating: boolean | null; indoor: boolean | null; toiletAvailable: boolean | null;
  wheelchairAccessible: boolean | null; openingHours: string | null;
  officialToiletKind: OfficialToiletKind | null;
  source: DataSource;
  confidence: Confidence;
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
  requireToilet: boolean; avoidSteepSlopes: boolean; preferIndoorRest: boolean;
};

export type WalkingSegment = {
  id: string;
  name: string;
  distanceMeters: number;
  walkingMinutes: number;
  endsAtRestSpot: boolean;
  restSpotId: string | null;
};

export type DemoRoute = {
  id: "standard" | "comfort"; name: string; coordinates: [number, number][];
  durationMinutes: number; distanceMeters: number; restSpotIds: string[];
  walkingSegments: WalkingSegment[]; steepSlopeCount: number;
  indoorRestCount: number;
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

export type EvaluatedRoute = DemoRoute & ContinuityMetrics & {
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
