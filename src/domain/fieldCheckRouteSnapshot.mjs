import { haversineMeters } from "./fieldVerificationCandidates.mjs";

export const REPRESENTATIVE_DYNAMIC_ROUTE_PROFILES = Object.freeze([
  "standard",
  "step_avoiding",
  "wheelchair_profile",
]);

function isFiniteCoordinate(coordinate) {
  return Array.isArray(coordinate)
    && coordinate.length === 2
    && coordinate.every(Number.isFinite)
    && coordinate[0] >= -90
    && coordinate[0] <= 90
    && coordinate[1] >= -180
    && coordinate[1] <= 180;
}

function assert(condition, message) {
  if (!condition) throw new Error(`代表動的経路snapshotが不正です: ${message}`);
}

function isRfc3339Timestamp(value) {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function hasExactProfiles(profiles) {
  return Array.isArray(profiles)
    && profiles.length === REPRESENTATIVE_DYNAMIC_ROUTE_PROFILES.length
    && new Set(profiles).size === REPRESENTATIVE_DYNAMIC_ROUTE_PROFILES.length
    && REPRESENTATIVE_DYNAMIC_ROUTE_PROFILES.every((profile) => profiles.includes(profile));
}

export function validateRepresentativeDynamicRouteSnapshot(value) {
  assert(value && typeof value === "object", "JSON objectではありません");
  assert(value.schemaVersion === 1, "schemaVersionは1である必要があります");
  assert(typeof value.snapshotId === "string" && value.snapshotId.length > 0, "snapshotIdがありません");
  assert(value.routeSetKind === "representative_dynamic_snapshot", "routeSetKindが不正です");
  assert(value.routingSchemaVersion === "1", "routingSchemaVersionは1である必要があります");
  assert(value.coordinateOrder === "latitude_longitude", "座標順はlatitude_longitudeである必要があります");
  assert(value.request && isFiniteCoordinate([
    value.request.origin?.latitude,
    value.request.origin?.longitude,
  ]), "出発地が不正です");
  assert(value.request && isFiniteCoordinate([
    value.request.destination?.latitude,
    value.request.destination?.longitude,
  ]), "目的地が不正です");
  assert(hasExactProfiles(value.request.profiles), "request profilesは代表3経路が1件ずつ必要です");
  assert(Array.isArray(value.routes), "routesが配列ではありません");
  assert(value.routes.length === REPRESENTATIVE_DYNAMIC_ROUTE_PROFILES.length, "3経路ちょうどではありません");
  assert(value.routes.every((route) => route && typeof route === "object"),
    "routeがJSON objectではありません");
  assert(hasExactProfiles(value.routes.map((route) => route.profile)),
    "standard / step_avoiding / wheelchair_profileが1件ずつ必要です");
  assert(new Set(value.routes.map((route) => route.id)).size === value.routes.length, "route idが重複しています");
  assert(value.source?.sourceType === "openstreetmap_route", "sourceTypeが不正です");
  assert(typeof value.source?.provider === "string" && value.source.provider.length > 0,
    "source providerがありません");
  assert(value.source?.snapshotMethod === "one_time_public_worker_response",
    "snapshotMethodが不正です");
  assert(typeof value.source?.sourceUrl === "string"
    && value.source.sourceUrl.startsWith("https://"), "sourceUrlはHTTPSである必要があります");
  assert(value.source?.license === "ODbL", "経路sourceのlicenseが不正です");
  assert(typeof value.source?.attribution === "string"
    && value.source.attribution.includes("OpenStreetMap"), "OpenStreetMap attributionがありません");
  assert(isRfc3339Timestamp(value.source?.capturedAt), "capturedAtがRFC 3339日時ではありません");
  assert(typeof value.source?.usage === "string" && value.source.usage.length > 0,
    "snapshot用途と制約の説明がありません");

  for (const route of value.routes) {
    assert(route.id === route.profile, `${route.id ?? "unknown"}のidとprofileが一致しません`);
    assert(REPRESENTATIVE_DYNAMIC_ROUTE_PROFILES.includes(route.profile), `${route.profile}は未知のprofileです`);
    assert(route.provider === "openrouteservice", `${route.id}のproviderが不正です`);
    assert(route.isFallback === false, `${route.id}がfallback扱いです`);
    assert(Number.isFinite(route.distanceMeters) && route.distanceMeters > 0, `${route.id}の距離が不正です`);
    assert(Number.isFinite(route.durationSeconds) && route.durationSeconds > 0, `${route.id}の時間が不正です`);
    assert(Number.isFinite(route.durationMinutes) && route.durationMinutes > 0,
      `${route.id}の分単位時間が不正です`);
    assert(typeof route.name === "string" && route.name.length > 0, `${route.id}の表示名がありません`);
    assert(Array.isArray(route.coordinates) && route.coordinates.length >= 2, `${route.id}の座標が不足しています`);
    assert(route.coordinates.every(isFiniteCoordinate), `${route.id}に不正座標があります`);
    assert(haversineMeters(route.coordinates[0], [
      value.request.origin.latitude,
      value.request.origin.longitude,
    ]) <= 50, `${route.id}の始点が代表requestと一致しません`);
    assert(haversineMeters(route.coordinates.at(-1), [
      value.request.destination.latitude,
      value.request.destination.longitude,
    ]) <= 50, `${route.id}の終点が代表requestと一致しません`);
    assert(typeof route.sourceAttribution === "string"
      && route.sourceAttribution.includes("OpenStreetMap"), `${route.id}のattributionがありません`);
    assert(isRfc3339Timestamp(route.generatedAt), `${route.id}のgeneratedAtが不正です`);
    assert(route.generatedAt === value.source.capturedAt,
      `${route.id}のgeneratedAtとsnapshot取得日時が一致しません`);
    assert(Array.isArray(route.restSpotIds), `${route.id}のrestSpotIdsが配列ではありません`);
    assert(Array.isArray(route.walkingSegments) && route.walkingSegments.length > 0,
      `${route.id}のwalkingSegmentsがありません`);
    assert(Number.isInteger(route.steepSlopeCount) && route.steepSlopeCount >= 0,
      `${route.id}のsteepSlopeCountが不正です`);
    assert(Number.isInteger(route.indoorRestCount) && route.indoorRestCount >= 0,
      `${route.id}のindoorRestCountが不正です`);
    assert(Array.isArray(route.warnings) && route.warnings.every((warning) => typeof warning === "string"),
      `${route.id}のwarningsが不正です`);
  }
  return {
    ...value,
    request: {
      ...value.request,
      profiles: [...REPRESENTATIVE_DYNAMIC_ROUTE_PROFILES],
    },
    routes: REPRESENTATIVE_DYNAMIC_ROUTE_PROFILES
      .map((profile) => value.routes.find((route) => route.profile === profile)),
  };
}

export function parseRepresentativeDynamicRouteSnapshot(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error("代表動的経路snapshotのJSONを解析できません", { cause: error });
  }
  return validateRepresentativeDynamicRouteSnapshot(value);
}
