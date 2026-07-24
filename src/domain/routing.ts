import type { DemoRoute, GeoPoint, RouteProfile, RouteSearchRequest, RouteStep } from "../types";

export const ROUTING_SCHEMA_VERSION = "1";
export const SHINJUKU_ROUTING_BBOX = { minLatitude: 35.67, maxLatitude: 35.73, minLongitude: 139.67, maxLongitude: 139.74 } as const;
export const MAX_ROUTE_DIRECT_DISTANCE_METERS = 8_000;
export const MAX_ROUTE_REQUEST_BYTES = 32_768;
export const ROUTE_CACHE_TTL_SECONDS = 900;
export const ORS_TIMEOUT_MILLISECONDS = 8_000;

const profiles: RouteProfile[] = ["standard", "step_avoiding", "wheelchair_profile"];
const finitePoint = (value: unknown): value is GeoPoint => Boolean(value && typeof value === "object" && Number.isFinite((value as GeoPoint).latitude) && Number.isFinite((value as GeoPoint).longitude));
const inBounds = (point: GeoPoint) => point.latitude >= SHINJUKU_ROUTING_BBOX.minLatitude && point.latitude <= SHINJUKU_ROUTING_BBOX.maxLatitude && point.longitude >= SHINJUKU_ROUTING_BBOX.minLongitude && point.longitude <= SHINJUKU_ROUTING_BBOX.maxLongitude;
const directDistance = (a: GeoPoint, b: GeoPoint) => {
  const radians = (value: number) => value * Math.PI / 180; const radius = 6_371_000;
  const dLat = radians(b.latitude - a.latitude); const dLon = radians(b.longitude - a.longitude);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(x));
};

export class RouteValidationError extends Error { constructor(message: string, readonly status = 400) { super(message); } }
export function validateRouteSearchRequest(value: unknown): RouteSearchRequest {
  if (!value || typeof value !== "object") throw new RouteValidationError("JSONオブジェクトを送信してください。");
  const input = value as Partial<RouteSearchRequest>;
  if (!finitePoint(input.origin) || !finitePoint(input.destination)) throw new RouteValidationError("出発地と目的地の緯度・経度には有限数値が必要です。");
  for (const point of [input.origin, input.destination]) if (point.latitude < -90 || point.latitude > 90 || point.longitude < -180 || point.longitude > 180) throw new RouteValidationError("緯度・経度の範囲が不正です。");
  if (!inBounds(input.origin) || !inBounds(input.destination)) throw new RouteValidationError("対象地域は新宿駅・東京都庁・新宿中央公園周辺です。", 422);
  if (directDistance(input.origin, input.destination) < 1) throw new RouteValidationError("出発地と目的地を別の地点にしてください。");
  if (directDistance(input.origin, input.destination) > MAX_ROUTE_DIRECT_DISTANCE_METERS) throw new RouteValidationError("出発地と目的地が対象距離を超えています。", 422);
  const preferences = input.preferences;
  if (!preferences || ![5, 10, 15].includes(preferences.maxContinuousWalkingMinutes)) throw new RouteValidationError("連続歩行時間の設定が不正です。");
  for (const key of ["requireToilet", "avoidSteepSlopes", "preferIndoorRest"] as const) if (typeof preferences[key] !== "boolean") throw new RouteValidationError("経路条件の形式が不正です。");
  return { origin: { latitude: input.origin.latitude, longitude: input.origin.longitude }, destination: { latitude: input.destination.latitude, longitude: input.destination.longitude }, preferences: { maxContinuousWalkingMinutes: preferences.maxContinuousWalkingMinutes, requireToilet: preferences.requireToilet, avoidSteepSlopes: preferences.avoidSteepSlopes, preferIndoorRest: preferences.preferIndoorRest, avoidSteps: preferences.avoidSteps === true } };
}

export function toOrsCoordinate(point: GeoPoint): [number, number] { return [point.longitude, point.latitude]; }
export function applySelectedMapPoint(mode: "origin" | "destination", current: { origin: GeoPoint; destination: GeoPoint }, point: GeoPoint) { return mode === "origin" ? { ...current, origin: point } : { ...current, destination: point }; }
export function buildOrsRequest(request: RouteSearchRequest, profile: RouteProfile) {
  const body: Record<string, unknown> = { coordinates: [toOrsCoordinate(request.origin), toOrsCoordinate(request.destination)], instructions: true, extra_info: ["steepness", "waytype", "surface", "suitability"] };
  if (profile === "step_avoiding") body.options = { avoid_features: ["steps"] };
  if (profile === "wheelchair_profile") body.options = { avoid_features: ["steps"], profile_params: { restrictions: { surface_type: "cobblestone:flattened", track_type: "grade1", smoothness_type: "good", maximum_sloped_kerb: 0.06, maximum_incline: 6 } } };
  return { profile: profile === "wheelchair_profile" ? "wheelchair" : "foot-walking", body };
}
export function buildRouteCacheKey(request: RouteSearchRequest): string {
  // Six decimals keep the maximum rounding displacement well below one metre in
  // Tokyo while still coalescing insignificant floating-point representation noise.
  const round = (value: number) => value.toFixed(6);
  return JSON.stringify({
    v: ROUTING_SCHEMA_VERSION,
    origin: [round(request.origin.latitude), round(request.origin.longitude)],
    destination: [round(request.destination.latitude), round(request.destination.longitude)],
    preferences: {
      maxContinuousWalkingMinutes: request.preferences.maxContinuousWalkingMinutes,
      requireToilet: request.preferences.requireToilet,
      avoidSteepSlopes: request.preferences.avoidSteepSlopes,
      preferIndoorRest: request.preferences.preferIndoorRest,
      avoidSteps: request.preferences.avoidSteps === true,
    },
    profiles: profiles.map((profile) => [profile, buildOrsRequest(request, profile)]),
  });
}

type OrsGeoJson = { bbox?: number[]; features?: Array<{ geometry?: { coordinates?: number[][] }; properties?: { summary?: { distance?: number; duration?: number }; segments?: Array<{ steps?: Array<{ instruction?: string; distance?: number; duration?: number }> }>; extras?: Record<string, { values?: number[][] }> } }> };
const extraValues = (properties: NonNullable<NonNullable<OrsGeoJson["features"]>[number]["properties"]>, key: string) => (properties.extras?.[key]?.values ?? []).map((value) => ({ from: Number(value[0]), to: Number(value[1]), value: Number(value[2]) }));
export function normalizeOrsResponse(response: OrsGeoJson, profile: RouteProfile, generatedAt: string): DemoRoute {
  const feature = response.features?.[0]; const rawCoordinates = feature?.geometry?.coordinates; const properties = feature?.properties; const summary = properties?.summary;
  if (!rawCoordinates?.length || !summary || !Number.isFinite(summary.distance) || !Number.isFinite(summary.duration)) throw new RouteValidationError("外部ルーティングから有効な経路が返されませんでした。", 422);
  const coordinates = rawCoordinates.map((coordinate) => [Number(coordinate[1]), Number(coordinate[0])] as [number, number]);
  const steps: RouteStep[] = (properties.segments ?? []).flatMap((segment) => segment.steps ?? []).map((step) => ({ instruction: step.instruction ?? "経路を進む", distanceMeters: Number(step.distance ?? 0), durationSeconds: Number(step.duration ?? 0) }));
  const distanceMeters = Math.round(Number(summary.distance)); const durationSeconds = Number(summary.duration); const durationMinutes = Math.max(1, Math.round(durationSeconds / 60)); const steepnessSegments = extraValues(properties, "steepness");
  return { id: profile, provider: "openrouteservice", profile, name: profile === "standard" ? "標準歩行ルート候補" : profile === "step_avoiding" ? "階段回避を要求した候補" : "車いすプロファイルによる候補", coordinates, distanceMeters, durationSeconds, durationMinutes, restSpotIds: [], walkingSegments: [{ id: `${profile}-full`, name: "経路全体", distanceMeters, walkingMinutes: durationSeconds / 60, endsAtRestSpot: false, restSpotId: null }], steepSlopeCount: steepnessSegments.filter((item) => Math.abs(item.value) >= 4).length, indoorRestCount: 0, bbox: response.bbox?.length === 4 ? response.bbox as [number, number, number, number] : undefined, steps, wayTypes: extraValues(properties, "waytypes"), steepnessSegments, sourceAttribution: "© OpenStreetMap contributors / openrouteservice", generatedAt, warnings: ["OpenStreetMap属性に基づく候補です。実際の通行可否・工事・段差は要確認です。"], isFallback: false };
}
export const routeProfiles = profiles;
