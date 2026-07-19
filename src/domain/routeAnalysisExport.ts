import type { EvaluatedRoute, GapSegment, OpenDataManifest, PublicToiletGapSegment, RestCandidate } from "../types";
import { distancePointToRouteMeters } from "./geo";
import { REST_CANDIDATE_DISTANCE_METERS } from "./restNetwork";

export const ROUTE_ANALYSIS_SCHEMA_VERSION = "1";
export const ROUTE_ANALYSIS_MANIFEST_REFERENCE = "data/generated/open-data-manifest.json";
export const ROUTE_ANALYSIS_GENERATOR = "TOKYO PACE";
export const OPENSTREETMAP_ATTRIBUTION = "© OpenStreetMap contributors";

const PUBLIC_TOILET_DATASET_LABELS: Record<string, { provider: string; datasetName: string }> = {
  "shinjuku-public": { provider: "新宿区", datasetName: "新宿区公衆トイレ一覧" },
};

const PUBLIC_TOILET_DATASET_IDS = Object.keys(PUBLIC_TOILET_DATASET_LABELS).sort();

export type RouteAnalysisSource = {
  sourceType: "openstreetmap_route" | "tokyo_pace_demo_route" | "official_open_data" | "field_verification" | "tokyo_pace_derived";
  sourceDatasetId: string;
  provider: string;
  datasetName: string;
  license: string;
  attribution: string;
  datasetUrl: string | null;
  resourceUrl: string | null;
};

export type RouteAnalysisGap = {
  startProgressMeters: number;
  endProgressMeters: number;
  gapMeters: number;
  coordinates: [number, number][];
};

export type RouteAnalysisSnapshot = {
  schemaVersion: string;
  generatedBy: typeof ROUTE_ANALYSIS_GENERATOR;
  generatedAt: string;
  manifestReference: typeof ROUTE_ANALYSIS_MANIFEST_REFERENCE;
  manifestSchemaVersion: number;
  route: {
    routeId: string;
    profile: string;
    coordinates: [number, number][];
    routeDistanceMeters: number;
    durationMinutes: number;
    maxContinuousWalkingMinutes: number;
    longestRestGapMeters: number;
    longestPublicToiletGapMeters: number;
    longestDrinkingWaterGapMeters: number;
    continuityFeasible: boolean;
    continuityFeasibleByRestNetwork: boolean;
    strictRestCandidateCount: number;
    possibleRestCandidateCount: number;
  };
  gaps: {
    rest: RouteAnalysisGap;
    publicToilet: RouteAnalysisGap;
    drinkingWater: RouteAnalysisGap;
  };
  strictRestCandidates: Array<{
    candidateId: string;
    name: string;
    latitude: number;
    longitude: number;
    confidence: "confirmed" | "supported";
    sourceDatasetId: string | null;
    officialSourceIds: string[];
    fieldVerifiedAt: string | null;
  }>;
  theoreticalRestInsertion: {
    latitude: number;
    longitude: number;
    progressMeters: number;
    improvementMeters: number;
    improvementRatio: number;
  };
  sourceDatasetIds: string[];
  sources: RouteAnalysisSource[];
  attribution: string[];
  warnings: string[];
};

export type RouteAnalysisExportInput = {
  route: EvaluatedRoute;
  restCandidates: readonly RestCandidate[];
  manifest: OpenDataManifest;
  generatedAt: string;
};

export type AnalysisGeoJsonFeature = {
  type: "Feature";
  id: string;
  geometry: {
    type: "LineString" | "Point";
    coordinates: number[] | number[][];
  };
  properties: Record<string, unknown>;
};

export type AnalysisGeoJson = {
  type: "FeatureCollection";
  name: string;
  features: AnalysisGeoJsonFeature[];
  properties: {
    schemaVersion: string;
    generatedBy: string;
    generatedAt: string;
    manifestReference: string;
    sourceDatasetIds: string[];
    attribution: string[];
    warnings: string[];
  };
};

const round = (value: number, digits = 3) => {
  const factor = 10 ** digits;
  const result = Math.round((value + Number.EPSILON) * factor) / factor;
  return Object.is(result, -0) ? 0 : result;
};

const stableUnique = (values: readonly string[]) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));

function assertGeneratedAt(generatedAt: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(generatedAt) || Number.isNaN(Date.parse(generatedAt))) {
    throw new Error("generatedAtにはUTCのISO 8601日時が必要です");
  }
}

function largestGap<T extends Pick<GapSegment, "startProgressMeters" | "endProgressMeters" | "gapMeters" | "coordinates">>(
  segments: readonly T[],
  fallbackLengthMeters: number,
  fallbackCoordinates: [number, number][],
): RouteAnalysisGap {
  const segment = [...segments].sort((a, b) => b.gapMeters - a.gapMeters
    || a.startProgressMeters - b.startProgressMeters
    || a.endProgressMeters - b.endProgressMeters)[0];
  if (!segment) return { startProgressMeters: 0, endProgressMeters: round(fallbackLengthMeters), gapMeters: round(fallbackLengthMeters), coordinates: fallbackCoordinates };
  return {
    startProgressMeters: round(segment.startProgressMeters),
    endProgressMeters: round(segment.endProgressMeters),
    gapMeters: round(segment.gapMeters),
    coordinates: segment.coordinates.map(([latitude, longitude]) => [round(latitude, 7), round(longitude, 7)]),
  };
}

function candidateSource(candidate: RestCandidate, manifest: OpenDataManifest): RouteAnalysisSource | null {
  const datasetId = candidate.source.sourceDatasetId;
  if (!datasetId) return null;
  const entry = manifest.datasets.find((item) => item.datasetId === datasetId);
  const sourceType = candidate.source.fieldVerifiedAt ? "field_verification" : "official_open_data";
  const license = candidate.source.license ?? entry?.license ?? (sourceType === "field_verification"
    ? "TOKYO PACE現地確認データ（独自ライセンス未設定）"
    : "ライセンス情報なし");
  return {
    sourceType,
    sourceDatasetId: datasetId,
    provider: candidate.source.provider,
    datasetName: candidate.source.datasetName,
    license,
    attribution: `${candidate.source.provider}「${candidate.source.datasetName}」 (${license})`,
    datasetUrl: candidate.source.datasetUrl ?? entry?.datasetUrl ?? null,
    resourceUrl: candidate.source.resourceUrl ?? entry?.resourceUrl ?? null,
  };
}

function toiletSources(manifest: OpenDataManifest): RouteAnalysisSource[] {
  return PUBLIC_TOILET_DATASET_IDS.flatMap((datasetId) => {
    const entry = manifest.datasets.find((item) => item.datasetId === datasetId);
    if (!entry) return [];
    const label = PUBLIC_TOILET_DATASET_LABELS[datasetId];
    return [{
      sourceType: "official_open_data" as const,
      sourceDatasetId: datasetId,
      provider: entry.provider ?? label.provider,
      datasetName: entry.datasetName ?? label.datasetName,
      license: entry.license,
      attribution: entry.attribution ?? `${entry.provider ?? label.provider}「${entry.datasetName ?? label.datasetName}」 (${entry.license})`,
      datasetUrl: entry.datasetUrl,
      resourceUrl: entry.resourceUrl,
    }];
  });
}

function referencedManifestSources(datasetIds: readonly string[], manifest: OpenDataManifest): RouteAnalysisSource[] {
  return stableUnique(datasetIds).flatMap((datasetId) => {
    const entry = manifest.datasets.find((item) => item.datasetId === datasetId);
    if (!entry) return [];
    const known = PUBLIC_TOILET_DATASET_LABELS[datasetId];
    const provider = entry.provider ?? known?.provider ?? "公式データ提供者（manifest参照）";
    const datasetName = entry.datasetName ?? known?.datasetName ?? datasetId;
    return [{
      sourceType: "official_open_data" as const,
      sourceDatasetId: datasetId,
      provider,
      datasetName,
      license: entry.license,
      attribution: entry.attribution ?? `${provider}「${datasetName}」 (${entry.license})`,
      datasetUrl: entry.datasetUrl,
      resourceUrl: entry.resourceUrl,
    }];
  });
}

function routeSource(route: EvaluatedRoute): RouteAnalysisSource {
  if (route.provider === "openrouteservice") {
    return {
      sourceType: "openstreetmap_route",
      sourceDatasetId: "openstreetmap-openrouteservice-route",
      provider: "openrouteservice / OpenStreetMap contributors",
      datasetName: "OpenRouteService経路候補（OpenStreetMap由来）",
      license: "ODbL 1.0（OpenStreetMapデータ。openrouteserviceの利用条件も適用）",
      attribution: `${OPENSTREETMAP_ATTRIBUTION} / openrouteservice`,
      datasetUrl: "https://www.openstreetmap.org/copyright",
      resourceUrl: null,
    };
  }
  return {
    sourceType: "tokyo_pace_demo_route",
    sourceDatasetId: "tokyo-pace-fixed-demo-route",
    provider: "TOKYO PACE",
    datasetName: "固定デモ経路",
    license: "TOKYO PACE試作データ",
    attribution: route.sourceAttribution ?? "TOKYO PACE 固定デモデータ",
    datasetUrl: null,
    resourceUrl: null,
  };
}

function sourceKey(source: RouteAnalysisSource) {
  return `${source.sourceType}:${source.sourceDatasetId}:${source.provider}:${source.datasetName}`;
}

function routeDurationMinutes(route: EvaluatedRoute) {
  return route.durationSeconds === undefined ? route.durationMinutes : route.durationSeconds / 60;
}

export function buildRouteAnalysisSnapshot(input: RouteAnalysisExportInput): RouteAnalysisSnapshot {
  assertGeneratedAt(input.generatedAt);
  const { route, manifest } = input;
  const nearbyCandidates = [...input.restCandidates]
    .filter((candidate) => distancePointToRouteMeters([candidate.latitude, candidate.longitude], route.coordinates) <= REST_CANDIDATE_DISTANCE_METERS)
    .sort((a, b) => a.id.localeCompare(b.id));
  const strictCandidates = [...new Map(nearbyCandidates
    .filter((candidate) => candidate.confidence === "confirmed" || candidate.confidence === "supported")
    .map((candidate) => [candidate.id, candidate])).values()]
    .sort((a, b) => a.id.localeCompare(b.id));
  const candidateSources = nearbyCandidates.flatMap((candidate) => {
    const source = candidateSource(candidate, manifest);
    return source ? [source] : [];
  });
  const referencedOfficialDatasetIds = nearbyCandidates.flatMap((candidate) => (candidate.officialSourceIds ?? [])
    .map((sourceId) => sourceId.split(":")[0]));
  const allSources = [
    ...candidateSources,
    ...toiletSources(manifest),
    ...referencedManifestSources(referencedOfficialDatasetIds, manifest),
    routeSource(route),
  ]
    .sort((a, b) => sourceKey(a).localeCompare(sourceKey(b)));
  const sources = [...new Map(allSources.map((source) => [sourceKey(source), source])).values()];
  const sourceDatasetIds = stableUnique(sources.map((source) => source.sourceDatasetId));
  const attribution = stableUnique(sources.map((source) => source.attribution));
  const warnings = stableUnique([
    ...(route.warnings ?? []),
    "距離は推定直線距離またはデモルート総距離へ正規化したルート沿い推定距離です。",
    "実際の徒歩経路、施設の利用可否、入館条件、安全性を保証しません。",
    "理論上の休憩地点追加候補は、実在する設置可能場所を保証しません。",
  ]);
  const routeCoordinates = route.coordinates.map(([latitude, longitude]) => [round(latitude, 7), round(longitude, 7)] as [number, number]);
  const restGap = largestGap(route.restGapSegments, route.distanceMeters, routeCoordinates);
  const publicToiletGap = largestGap<PublicToiletGapSegment>(route.publicToiletGapSegments, route.distanceMeters, routeCoordinates);
  const drinkingWaterGap = largestGap(route.drinkingWaterGapSegments, route.distanceMeters, routeCoordinates);
  const [insertionLatitude, insertionLongitude] = route.restInsertionSuggestion.suggestedRestInsertionCoordinate;

  return {
    schemaVersion: ROUTE_ANALYSIS_SCHEMA_VERSION,
    generatedBy: ROUTE_ANALYSIS_GENERATOR,
    generatedAt: input.generatedAt,
    manifestReference: ROUTE_ANALYSIS_MANIFEST_REFERENCE,
    manifestSchemaVersion: manifest.schemaVersion,
    route: {
      routeId: route.id,
      profile: route.profile ?? route.provider ?? "demo",
      coordinates: routeCoordinates,
      routeDistanceMeters: round(route.distanceMeters),
      durationMinutes: round(routeDurationMinutes(route)),
      maxContinuousWalkingMinutes: round(route.maxContinuousWalkingMinutes),
      longestRestGapMeters: round(route.longestRestGapMeters),
      longestPublicToiletGapMeters: round(route.longestPublicToiletGapMeters),
      longestDrinkingWaterGapMeters: round(route.longestDrinkingWaterGapMeters),
      continuityFeasible: route.continuityFeasible,
      continuityFeasibleByRestNetwork: route.continuityFeasibleByRestNetwork,
      strictRestCandidateCount: route.confirmedRestSpotCount + route.supportedRestSpotCount,
      possibleRestCandidateCount: route.referencePossibleCandidateCount,
    },
    gaps: { rest: restGap, publicToilet: publicToiletGap, drinkingWater: drinkingWaterGap },
    strictRestCandidates: strictCandidates.map((candidate) => ({
      candidateId: candidate.id,
      name: candidate.name,
      latitude: round(candidate.latitude, 7),
      longitude: round(candidate.longitude, 7),
      confidence: candidate.confidence as "confirmed" | "supported",
      sourceDatasetId: candidate.source.sourceDatasetId ?? null,
      officialSourceIds: stableUnique(candidate.officialSourceIds ?? []),
      fieldVerifiedAt: candidate.source.fieldVerifiedAt,
    })),
    theoreticalRestInsertion: {
      latitude: round(insertionLatitude, 7),
      longitude: round(insertionLongitude, 7),
      progressMeters: round(route.restInsertionSuggestion.suggestedRestInsertionProgressMeters),
      improvementMeters: round(route.restInsertionSuggestion.improvementMeters),
      improvementRatio: round(route.restInsertionSuggestion.improvementRatio, 6),
    },
    sourceDatasetIds,
    sources,
    attribution,
    warnings,
  };
}

export const ANALYSIS_CSV_COLUMNS = [
  "routeId", "profile", "routeDistanceMeters", "durationMinutes", "maxContinuousWalkingMinutes",
  "longestRestGapMeters", "longestPublicToiletGapMeters", "longestDrinkingWaterGapMeters",
  "continuityFeasible", "continuityFeasibleByRestNetwork", "strictRestCandidateCount", "possibleRestCandidateCount",
  "restGapStartProgressMeters", "restGapEndProgressMeters", "publicToiletGapStartProgressMeters", "publicToiletGapEndProgressMeters",
  "drinkingWaterGapStartProgressMeters", "drinkingWaterGapEndProgressMeters", "theoreticalRestInsertionLatitude",
  "theoreticalRestInsertionLongitude", "theoreticalRestInsertionProgressMeters", "improvementMeters", "improvementRatio",
  "generatedAt", "sourceDatasetIds", "manifestReference", "attribution", "warnings",
] as const;

const escapeCsv = (value: string | number | boolean) => {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export function serializeRouteAnalysisCsv(snapshot: RouteAnalysisSnapshot): string {
  const values: Record<(typeof ANALYSIS_CSV_COLUMNS)[number], string | number | boolean> = {
    routeId: snapshot.route.routeId,
    profile: snapshot.route.profile,
    routeDistanceMeters: snapshot.route.routeDistanceMeters,
    durationMinutes: snapshot.route.durationMinutes,
    maxContinuousWalkingMinutes: snapshot.route.maxContinuousWalkingMinutes,
    longestRestGapMeters: snapshot.route.longestRestGapMeters,
    longestPublicToiletGapMeters: snapshot.route.longestPublicToiletGapMeters,
    longestDrinkingWaterGapMeters: snapshot.route.longestDrinkingWaterGapMeters,
    continuityFeasible: snapshot.route.continuityFeasible,
    continuityFeasibleByRestNetwork: snapshot.route.continuityFeasibleByRestNetwork,
    strictRestCandidateCount: snapshot.route.strictRestCandidateCount,
    possibleRestCandidateCount: snapshot.route.possibleRestCandidateCount,
    restGapStartProgressMeters: snapshot.gaps.rest.startProgressMeters,
    restGapEndProgressMeters: snapshot.gaps.rest.endProgressMeters,
    publicToiletGapStartProgressMeters: snapshot.gaps.publicToilet.startProgressMeters,
    publicToiletGapEndProgressMeters: snapshot.gaps.publicToilet.endProgressMeters,
    drinkingWaterGapStartProgressMeters: snapshot.gaps.drinkingWater.startProgressMeters,
    drinkingWaterGapEndProgressMeters: snapshot.gaps.drinkingWater.endProgressMeters,
    theoreticalRestInsertionLatitude: snapshot.theoreticalRestInsertion.latitude,
    theoreticalRestInsertionLongitude: snapshot.theoreticalRestInsertion.longitude,
    theoreticalRestInsertionProgressMeters: snapshot.theoreticalRestInsertion.progressMeters,
    improvementMeters: snapshot.theoreticalRestInsertion.improvementMeters,
    improvementRatio: snapshot.theoreticalRestInsertion.improvementRatio,
    generatedAt: snapshot.generatedAt,
    sourceDatasetIds: snapshot.sourceDatasetIds.join("|"),
    manifestReference: snapshot.manifestReference,
    attribution: snapshot.attribution.join(" | "),
    warnings: snapshot.warnings.join(" | "),
  };
  return `${ANALYSIS_CSV_COLUMNS.join(",")}\n${ANALYSIS_CSV_COLUMNS.map((column) => escapeCsv(values[column])).join(",")}\n`;
}

const toGeoJsonLine = (coordinates: readonly [number, number][]) => coordinates.map(([latitude, longitude]) => [longitude, latitude]);
const toGeoJsonPoint = (latitude: number, longitude: number) => [longitude, latitude];

function derivedProperties(
  snapshot: RouteAnalysisSnapshot,
  featureType: string,
  datasetName: string,
  sourceDatasetIds: string[],
) {
  const route = snapshot.sources.find((source) => source.sourceDatasetId === "openstreetmap-openrouteservice-route")
    ?? snapshot.sources.find((source) => source.sourceDatasetId === "tokyo-pace-fixed-demo-route");
  const officialSources = snapshot.sources.filter((source) => sourceDatasetIds.includes(source.sourceDatasetId));
  const sourceLicenses = stableUnique([route?.license ?? "TOKYO PACE試作データ", ...officialSources.map((source) => source.license)]);
  return {
    featureType,
    sourceType: "tokyo_pace_derived",
    provider: ROUTE_ANALYSIS_GENERATOR,
    datasetName,
    license: sourceLicenses.length === 1 ? sourceLicenses[0] : "複数ライセンス（sourceLicensesを参照）",
    sourceLicenses,
    attribution: stableUnique([route?.attribution ?? "TOKYO PACE", ...officialSources.map((source) => source.attribution)]).join(" / "),
    generatedBy: snapshot.generatedBy,
    generatedAt: snapshot.generatedAt,
    sourceDatasetIds: stableUnique([route?.sourceDatasetId ?? "", ...sourceDatasetIds]),
    manifestReference: snapshot.manifestReference,
  };
}

export function buildRouteAnalysisGeoJson(snapshot: RouteAnalysisSnapshot): AnalysisGeoJson {
  const routeSource = snapshot.sources.find((source) => source.sourceDatasetId === "openstreetmap-openrouteservice-route")
    ?? snapshot.sources.find((source) => source.sourceDatasetId === "tokyo-pace-fixed-demo-route")!;
  const toiletIds = snapshot.sources.filter((source) => PUBLIC_TOILET_DATASET_IDS.includes(source.sourceDatasetId)).map((source) => source.sourceDatasetId);
  const strictIds = stableUnique(snapshot.strictRestCandidates.flatMap((candidate) => [
    ...(candidate.sourceDatasetId ? [candidate.sourceDatasetId] : []),
    ...candidate.officialSourceIds.map((sourceId) => sourceId.split(":")[0]),
  ]));
  const waterIds = snapshot.sources.filter((source) => source.sourceDatasetId === "tokyo-drinking-stations").map((source) => source.sourceDatasetId);
  const features: AnalysisGeoJsonFeature[] = [{
    type: "Feature",
    id: `route-${snapshot.route.routeId}`,
    geometry: { type: "LineString", coordinates: toGeoJsonLine(snapshot.route.coordinates) },
    properties: {
      featureType: "selected_route",
      routeId: snapshot.route.routeId,
      profile: snapshot.route.profile,
      routeDistanceMeters: snapshot.route.routeDistanceMeters,
      durationMinutes: snapshot.route.durationMinutes,
      sourceType: routeSource.sourceType,
      provider: routeSource.provider,
      datasetName: routeSource.datasetName,
      license: routeSource.license,
      attribution: routeSource.attribution,
      generatedBy: snapshot.generatedBy,
      generatedAt: snapshot.generatedAt,
      sourceDatasetIds: [routeSource.sourceDatasetId],
      manifestReference: snapshot.manifestReference,
    },
  }];

  const gaps: Array<{ id: string; type: string; name: string; gap: RouteAnalysisGap; sourceIds: string[] }> = [
    { id: "rest-gap", type: "rest_gap", name: "最長休憩空白", gap: snapshot.gaps.rest, sourceIds: strictIds },
    { id: "public-toilet-gap", type: "public_toilet_gap", name: "最長公衆トイレ空白", gap: snapshot.gaps.publicToilet, sourceIds: toiletIds },
    { id: "drinking-water-gap", type: "drinking_water_gap", name: "最長給水空白", gap: snapshot.gaps.drinkingWater, sourceIds: waterIds },
  ];
  for (const item of gaps) features.push({
    type: "Feature",
    id: `${item.id}-${snapshot.route.routeId}`,
    geometry: { type: "LineString", coordinates: toGeoJsonLine(item.gap.coordinates) },
    properties: {
      ...derivedProperties(snapshot, item.type, item.name, item.sourceIds),
      routeId: snapshot.route.routeId,
      startProgressMeters: item.gap.startProgressMeters,
      endProgressMeters: item.gap.endProgressMeters,
      gapMeters: item.gap.gapMeters,
    },
  });

  for (const candidate of snapshot.strictRestCandidates) {
    const sourceDatasetIds = stableUnique([
      ...(candidate.sourceDatasetId ? [candidate.sourceDatasetId] : []),
      ...candidate.officialSourceIds.map((sourceId) => sourceId.split(":")[0]),
    ]);
    const candidateSources = snapshot.sources
      .filter((source) => sourceDatasetIds.includes(source.sourceDatasetId))
      .sort((a, b) => sourceKey(a).localeCompare(sourceKey(b)));
    const licenses = stableUnique(candidateSources.map((source) => source.license));
    const attributions = stableUnique(candidateSources.map((source) => source.attribution));
    const singleSource = candidateSources.length === 1 ? candidateSources[0] : null;
    features.push({
      type: "Feature",
      id: `rest-candidate-${candidate.candidateId}`,
      geometry: { type: "Point", coordinates: toGeoJsonPoint(candidate.latitude, candidate.longitude) },
      properties: {
        featureType: "strict_rest_candidate",
        candidateId: candidate.candidateId,
        name: candidate.name,
        confidence: candidate.confidence,
        fieldVerifiedAt: candidate.fieldVerifiedAt,
        officialSourceIds: candidate.officialSourceIds,
        sourceType: singleSource?.sourceType ?? "tokyo_pace_derived",
        provider: singleSource?.provider ?? ROUTE_ANALYSIS_GENERATOR,
        datasetName: singleSource?.datasetName ?? "現地確認済み休憩候補（元の公式掲載情報を保持）",
        license: singleSource?.license ?? (licenses.length ? "複数ライセンス（sourcesを参照）" : "ライセンス情報なし"),
        sourceLicenses: licenses,
        attribution: attributions.join(" / ") || ROUTE_ANALYSIS_GENERATOR,
        sourceAttributions: attributions,
        sources: candidateSources,
        generatedBy: snapshot.generatedBy,
        generatedAt: snapshot.generatedAt,
        sourceDatasetIds,
        manifestReference: snapshot.manifestReference,
      },
    });
  }

  features.push({
    type: "Feature",
    id: `theoretical-rest-insertion-${snapshot.route.routeId}`,
    geometry: { type: "Point", coordinates: toGeoJsonPoint(snapshot.theoreticalRestInsertion.latitude, snapshot.theoreticalRestInsertion.longitude) },
    properties: {
      ...derivedProperties(snapshot, "theoretical_rest_insertion", "理論上の休憩地点追加候補", []),
      routeId: snapshot.route.routeId,
      routeProgressMeters: snapshot.theoreticalRestInsertion.progressMeters,
      improvementMeters: snapshot.theoreticalRestInsertion.improvementMeters,
      improvementRatio: snapshot.theoreticalRestInsertion.improvementRatio,
      warning: "理論上の配置候補であり、実在する設置可能場所を保証しません。",
    },
  });

  return {
    type: "FeatureCollection",
    name: `tokyo-pace-route-analysis-${snapshot.route.routeId}`,
    features,
    properties: {
      schemaVersion: snapshot.schemaVersion,
      generatedBy: snapshot.generatedBy,
      generatedAt: snapshot.generatedAt,
      manifestReference: snapshot.manifestReference,
      sourceDatasetIds: snapshot.sourceDatasetIds,
      attribution: snapshot.attribution,
      warnings: snapshot.warnings,
    },
  };
}

export function serializeRouteAnalysisGeoJson(snapshot: RouteAnalysisSnapshot): string {
  return `${JSON.stringify(buildRouteAnalysisGeoJson(snapshot), null, 2)}\n`;
}

export function buildRouteAnalysisDownloads(input: RouteAnalysisExportInput) {
  const snapshot = buildRouteAnalysisSnapshot(input);
  return {
    snapshot,
    csv: serializeRouteAnalysisCsv(snapshot),
    geoJson: serializeRouteAnalysisGeoJson(snapshot),
  };
}
