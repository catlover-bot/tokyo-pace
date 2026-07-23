export type RestSpotCategory = "park" | "public_facility" | "toilet" | "library" | "other";
export type Confidence = "official" | "verified" | "estimated";
export type PlaceCategory = "drinking_station" | "barrier_free_facility" | "public_facility" | "verified_rest_spot" | "estimated_rest_spot";
export type RestConfidence = "confirmed" | "supported" | "possible" | "estimated";
export type OfficialToiletKind = "public_toilet" | "facility_toilet_information" | "station_toilet_information";
export type FieldVerificationMethod = "on_site_observation" | "combined_on_site_and_official" | "official_source_review" | "staff_confirmation";
export type FacilityAccessCategory =
  | "public_outdoor_space"
  | "public_service_facility"
  | "official_public_access"
  | "commercial_facility"
  | "private_hospitality"
  | "restricted_or_sensitive"
  | "uncertain_facility";
export type FieldCheckRouteSet = "dynamic_snapshot" | "fixed_demo";
export type OfficialSourceQualityLevel = "high" | "medium" | "basic";
export type AnalysisSourceType = "official_open_data" | "openstreetmap_route" | "tokyo_pace_field_verification" | "tokyo_pace_derived_analysis" | "tokyo_pace_estimated_demo";

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
  sourceType?: AnalysisSourceType;
  attribution?: string | null;
};

export type OpenDataManifestEntry = { datasetId: string; datasetUrl: string; resourceUrl: string; retrievedAt: string; contentSha256: string; byteSize: number; normalizedRecordCount: number; excludedRecordCount: number; sourceUpdatedAt: string | null; encoding: string; license: string; sourceType?: AnalysisSourceType; provider?: string; datasetName?: string; attribution?: string; generatedBy?: string; generatedAt?: string };
export type OpenDataManifest = { schemaVersion: number; datasets: OpenDataManifestEntry[]; generatedBy?: string; generatedAt?: string };

export type FieldVerificationRecord = {
  verificationId: string; candidateId: string; name: string; latitude: number; longitude: number;
  address: string | null; verifiedAt: string | null; verifier: string | null;
  verificationMethod: FieldVerificationMethod | null;
  publiclyAccessible: boolean | null; seatingAvailable: boolean | null; indoorOrCovered: boolean | null;
  drinkingWaterAvailable: boolean | null; toiletAvailable: boolean | null; wheelchairAccessible: boolean | null;
  openingHoursObserved: string | null; accessRestrictions: string | null; evidenceReference: string | null; notes: string | null;
  confidence: Exclude<RestConfidence, "estimated">;
};

export type FieldVerificationRouteMetric = {
  routeId: string; routeKey: string; routeSet: FieldCheckRouteSet; profile: RouteProfile | null;
  routeDistanceMeters: number; distanceToRouteMeters: number;
  geometryProgressMeters: number; routeProgressMeters: number;
  nearestPointCoordinate: [number, number];
  currentLongestGapMeters: number; expectedImprovedGapMeters: number;
  expectedImprovementMeters: number; expectedImprovementRatio: number;
  grossImprovementMeters: number; grossImprovementRatio: number;
  estimatedDetourLowerBoundMeters: number;
  detourAdjustedImprovementMeters: number; detourAdjustedImprovementRatio: number;
  suggestedInsertionProgressMeters: number; suggestedInsertionCoordinate: [number, number];
  distanceToSuggestedInsertionMeters: number; insideLargestGap: boolean;
  contributesToRanking: boolean;
};

export type FieldVerificationRankingScoreBreakdown = {
  improvementMetersPoints: number;
  improvementRatioPoints: number;
  routeProximityPoints: number;
  accessPriorPoints: number;
  coveredRoutesPoints: number;
  officialSourceQualityPoints: number;
  categoryPenalty: number;
  duplicateFacilityPenalty: number;
  total: number;
};

export type FieldVerificationCandidate = {
  candidateId: string; verificationId: string; name: string; address: string | null;
  latitude: number; longitude: number; categories: PlaceCategory[];
  facilityAccessCategory: FacilityAccessCategory; facilityAccessCategoryLabel: string;
  accessPrior: number; categoryPenalty: number;
  categoryReasonCodes: string[]; categoryReasons: string[];
  requiresSpecialCaution: boolean; specialCautions: string[];
  officialSourceQuality: OfficialSourceQualityLevel; officialSourceQualityScore: number;
  dynamicRouteIds: RouteProfile[]; fixedDemoRouteIds: string[];
  routeIds: string[]; primaryRouteId: RouteProfile; primaryRouteKey: string;
  numberOfCoveredRoutes: number;
  distanceToRouteMeters: number; routeProgressMeters: number;
  estimatedDetourLowerBoundMeters: number;
  nearestPointCoordinate: [number, number]; theoreticalInsertionCoordinate: [number, number];
  currentLongestGapMeters: number; expectedImprovedGapMeters: number;
  expectedImprovementMeters: number; expectedImprovementRatio: number;
  grossImprovementMeters: number; grossImprovementRatio: number;
  detourAdjustedImprovementMeters: number; detourAdjustedImprovementRatio: number;
  distanceToSuggestedInsertionMeters: number;
  rankingScore: number; rankingScoreBreakdown: FieldVerificationRankingScoreBreakdown;
  selectionReasonCodes: string[]; selectionReasons: string[];
  officialSourceIds: string[]; groupedCandidateIds: string[];
  duplicateFacilityHandling: {
    method: "name_or_address_within_25m";
    groupedRecordCount: number;
    countedPlaceCount: 1;
  };
  existingStrictOverlap: false;
  fieldCheckPriority: number;
  routeMetrics: FieldVerificationRouteMetric[];
  dynamicRouteMetrics: FieldVerificationRouteMetric[];
  fixedDemoRouteMetrics: FieldVerificationRouteMetric[];
};

export type FieldCandidateDetourSensitivityClass =
  | "robust"
  | "sensitive"
  | "marginal"
  | "ineffective";

export type FieldCandidateRankStabilityClass =
  | "stable_top5"
  | "resilient_top5"
  | "mostly_top5"
  | "variable"
  | "consistently_outside_top5"
  | "outside_top5";

export type FieldCandidateTwoAxisClassification =
  | "high_improvement_verification_priority"
  | "high_improvement_confirmation_priority"
  | "high_improvement_access_uncertain"
  | "low_improvement_easy_to_verify"
  | "low_priority";

export type FieldCandidateMobilityImprovementEvaluation = {
  conservativeProxyImprovementMeters: number;
  conservativeProxyImprovementRatio: number;
  numberOfCoveredRoutes: number;
  distanceToRouteMeters: number;
};

export type FieldCandidateVerificationValue = {
  generalUsePurposeClarity:
    | "clear_public_purpose"
    | "official_or_commercial_purpose_rest_use_unknown"
    | "special_access_conditions_unknown"
    | "unclear";
  generalUsePurposeClarityScore: number;
  officialSourceQuality: OfficialSourceQualityLevel;
  officialSourceQualityScore: number;
  onSiteResolutionNeed: "high" | "medium" | "low";
  accessRestrictionConcern: "high" | "medium" | "low";
};

export type FieldCandidateScenarioRank = {
  weightScenarioId: string;
  rank: number;
  score: number;
};

export type FieldCandidateRankingSensitivity = {
  candidateId: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  facilityAccessCategory: FacilityAccessCategory;
  facilityAccessCategoryLabel: string;
  primaryRouteId: RouteProfile;
  dynamicRouteIds: RouteProfile[];
  numberOfCoveredRoutes: number;
  distanceToRouteMeters: number;
  optimisticImprovementMeters: number;
  lowerBoundAdjustedImprovementMeters: number;
  conservativeProxyImprovementMeters: number;
  optimisticImprovementRatio: number;
  lowerBoundAdjustedImprovementRatio: number;
  conservativeProxyImprovementRatio: number;
  detourSensitivityClass: FieldCandidateDetourSensitivityClass;
  baselineRank: number;
  bestRank: number;
  worstRank: number;
  meanRank: number;
  top5AppearanceRate: number;
  rankStabilityClass: FieldCandidateRankStabilityClass;
  twoAxisClassification: FieldCandidateTwoAxisClassification;
  isParetoNonDominated: boolean;
  mobilityImprovementEvaluation: FieldCandidateMobilityImprovementEvaluation;
  verificationValue: FieldCandidateVerificationValue;
  scenarioRanks?: FieldCandidateScenarioRank[];
};

export type FieldCandidateRankingSensitivityMetadata = {
  schemaVersion: 1;
  datasetId: "tokyo-pace-field-candidate-ranking-sensitivity";
  sourceType: "tokyo_pace_derived_analysis";
  provider: "TOKYO PACE";
  datasetName: string;
  generatedBy: "TOKYO PACE";
  generatedAt: string;
  sourceCandidateDatasetId: string;
  sourceCandidateCount: number;
  candidateCount: number;
  weightScenarioCount: number;
  rankingScenarioCount: number;
  rankingRowCount: number;
  weightVariationRatio: number;
  topRankLimit: number;
  paretoCandidateCount: number;
  configuration: Record<string, unknown>;
};

export type FieldVisitShortlistEntry = FieldCandidateRankingSensitivity & {
  visitPriority: number;
  shortlistRole: string;
  inclusionReasonCode: string;
  inclusionReasonCodes?: string[];
  inclusionReason: string;
  checkItems: string[];
  caution: string;
  cautions?: string[];
};

export type FieldVisitShortlistMetadata = {
  schemaVersion: 1;
  datasetId: "tokyo-pace-field-visit-shortlist";
  sourceType: "tokyo_pace_derived_analysis";
  provider: "TOKYO PACE";
  datasetName: string;
  generatedBy: "TOKYO PACE";
  generatedAt: string;
  sourceSensitivityDatasetId: string;
  sourceCandidateCount: number;
  entryCount: number;
  requestedLimit: number;
  configuration: Record<string, unknown>;
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

export type RestCandidate = {
  id: string; name: string; latitude: number; longitude: number; address: string | null;
  category: PlaceCategory; confidence: RestConfidence;
  openingHours: string | null; indoor: boolean | null; seating: boolean | null;
  drinkingWaterAvailable: boolean | null; wheelchairAccessible: boolean | null;
  source: DataSource;
  fieldVerificationId?: string | null;
  officialSourceIds?: string[];
};

export type GapSegment = { startProgressMeters: number; endProgressMeters: number; gapMeters: number; coordinates: [number, number][] };
export type RestInsertionSuggestion = {
  suggestedRestInsertionProgressMeters: number;
  suggestedRestInsertionCoordinate: [number, number];
  currentLongestRestGapMeters: number; improvedLongestRestGapMeters: number;
  improvementMeters: number; improvementRatio: number;
};
export type RestNetworkSnapshot = {
  strictRestCandidateCount: number; maxContinuousWalkingMinutes: number; longestRestGapMeters: number;
  continuityFeasibleByRestNetwork: boolean; longestUncoveredWalkingMinutes: number;
  restNetworkCoverageRatio: number; continuityFailureReason: string | null;
  restInsertionSuggestion: RestInsertionSuggestion;
};
export type FieldVerificationImpactComparison = {
  hasFieldVerificationData: boolean; before: RestNetworkSnapshot; after: RestNetworkSnapshot;
  improvementMeters: number; improvementRatio: number;
};
export type RestNetworkMetrics = {
  nearestRestCandidateDistanceMeters: number | null; nearestDrinkingStationDistanceMeters: number | null;
  longestRestGapMeters: number; longestDrinkingWaterGapMeters: number; longestIndoorCandidateGapMeters: number;
  restCandidateCount: number; drinkingStationCount: number; indoorCandidateCount: number;
  confirmedRestSpotCount: number; supportedRestSpotCount: number; possibleRestSpotCount: number;
  strictRestCandidateCount: number; referencePossibleCandidateCount: number; referenceEstimatedCandidateCount: number;
  continuityFeasibleBySegment: boolean; continuityFeasibleByRestNetwork: boolean;
  longestUncoveredWalkingMinutes: number; restNetworkCoverageRatio: number;
  continuityFailureReason: string | null; restNetworkLevel: RestConfidence | "none";
  restGapSegments: GapSegment[]; drinkingWaterGapSegments: GapSegment[]; indoorCandidateGapSegments: GapSegment[];
  restInsertionSuggestion: RestInsertionSuggestion;
  fieldVerificationComparison: FieldVerificationImpactComparison;
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

export type RouteScoreBreakdown = {
  duration: number;
  continuousWalkingExcess: number;
  missingPublicToilet: number;
  steepSlope: number;
  missingIndoorRest: number;
  total: number;
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
  scoreBreakdown: RouteScoreBreakdown;
  preferenceViolationCount: number;
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
