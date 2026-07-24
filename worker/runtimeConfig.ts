import {
  MAX_ROUTE_DIRECT_DISTANCE_METERS,
  MAX_ROUTE_REQUEST_BYTES,
  ORS_TIMEOUT_MILLISECONDS,
  ROUTE_CACHE_TTL_SECONDS,
  SHINJUKU_ROUTING_BBOX,
} from "../src/domain/routing";

export type AppEnvironment = "local" | "preview" | "production";
export type DataFreshnessState = "current" | "aging" | "stale" | "update_failed" | "unknown";

export type RateLimitBinding = {
  limit(options: { key: string }): Promise<{ success: boolean }>;
};

export type CloudflareVersionMetadataBinding = {
  id: string;
  tag: string;
  timestamp: string;
};

export type RuntimeLogLevel = "debug" | "info" | "warn" | "error";

export type WorkerEnv = {
  APP_ENV?: string;
  APP_VERSION?: string;
  BUILD_COMMIT?: string;
  BUILD_TIMESTAMP?: string;
  LOG_LEVEL?: string;
  DATA_MANIFEST_VERSION?: string;
  GENERATED_DATA_TIMESTAMP?: string;
  DATA_FRESHNESS_STATE?: string;
  SERVICE_AREA_MIN_LATITUDE?: string;
  SERVICE_AREA_MAX_LATITUDE?: string;
  SERVICE_AREA_MIN_LONGITUDE?: string;
  SERVICE_AREA_MAX_LONGITUDE?: string;
  ROUTE_MAX_DIRECT_DISTANCE_METERS?: string;
  ROUTE_MAX_WAYPOINTS?: string;
  ROUTE_MAX_CONCURRENCY?: string;
  ROUTE_BODY_LIMIT_BYTES?: string;
  ROUTE_CACHE_TTL_SECONDS?: string;
  ROUTE_RATE_LIMIT_REQUESTS?: string;
  ROUTE_RATE_LIMIT_WINDOW_SECONDS?: string;
  ORS_TIMEOUT_MILLISECONDS?: string;
  ORS_MAX_RETRIES?: string;
  ORS_RETRY_BASE_DELAY_MILLISECONDS?: string;
  ORS_RETRY_MAX_DELAY_MILLISECONDS?: string;
  ORS_CIRCUIT_FAILURE_THRESHOLD?: string;
  ORS_CIRCUIT_RESET_MILLISECONDS?: string;
  OPENROUTESERVICE_API_KEY?: string;
  ROUTE_RATE_LIMITER?: RateLimitBinding;
  CF_VERSION_METADATA?: CloudflareVersionMetadataBinding;
};

export type RuntimeConfig = {
  appEnvironment: AppEnvironment;
  appVersion: string;
  buildCommit: string;
  buildTimestamp: string | null;
  logLevel: RuntimeLogLevel;
  dataManifestVersion: string;
  generatedDataTimestamp: string | null;
  dataFreshnessState: DataFreshnessState;
  serviceArea: {
    minLatitude: number;
    maxLatitude: number;
    minLongitude: number;
    maxLongitude: number;
  };
  maxDirectDistanceMeters: number;
  maxWaypoints: number;
  maxConcurrency: number;
  bodyLimitBytes: number;
  cacheTtlSeconds: number;
  rateLimitRequests: number;
  rateLimitWindowSeconds: number;
  orsTimeoutMilliseconds: number;
  orsMaxRetries: number;
  orsRetryBaseDelayMilliseconds: number;
  orsRetryMaxDelayMilliseconds: number;
  circuitFailureThreshold: number;
  circuitResetMilliseconds: number;
};

const numberValue = (value: string | undefined, fallback: number, minimum: number, maximum: number) => {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
};

const integerValue = (value: string | undefined, fallback: number, minimum: number, maximum: number) =>
  Math.trunc(numberValue(value, fallback, minimum, maximum));

const environmentValue = (value: string | undefined): AppEnvironment =>
  value === "preview" || value === "production" ? value : "local";

const freshnessValue = (value: string | undefined): DataFreshnessState =>
  value === "current" || value === "aging" || value === "stale" || value === "update_failed"
    ? value
    : "unknown";

const safeBuildValue = (value: string | undefined, fallback: string) =>
  value && /^[A-Za-z0-9._+-]{1,128}$/.test(value) ? value : fallback;

const isoTimestampOrNull = (value: string | undefined) =>
  value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;

const logLevelValue = (value: string | undefined, environment: AppEnvironment): RuntimeLogLevel => {
  const selected =
    value === "debug" || value === "info" || value === "warn" || value === "error"
      ? value
      : environment === "local"
        ? "debug"
        : "info";
  return environment === "production" && selected === "debug" ? "info" : selected;
};

export function resolveRuntimeConfig(env: WorkerEnv): RuntimeConfig {
  const appEnvironment = environmentValue(env.APP_ENV);
  const minLatitude = numberValue(env.SERVICE_AREA_MIN_LATITUDE, SHINJUKU_ROUTING_BBOX.minLatitude, -90, 90);
  const maxLatitude = numberValue(env.SERVICE_AREA_MAX_LATITUDE, SHINJUKU_ROUTING_BBOX.maxLatitude, -90, 90);
  const minLongitude = numberValue(env.SERVICE_AREA_MIN_LONGITUDE, SHINJUKU_ROUTING_BBOX.minLongitude, -180, 180);
  const maxLongitude = numberValue(env.SERVICE_AREA_MAX_LONGITUDE, SHINJUKU_ROUTING_BBOX.maxLongitude, -180, 180);

  return {
    appEnvironment,
    appVersion: safeBuildValue(env.APP_VERSION, "1.0.0"),
    buildCommit: safeBuildValue(env.BUILD_COMMIT, "unknown"),
    buildTimestamp: isoTimestampOrNull(env.BUILD_TIMESTAMP),
    logLevel: logLevelValue(env.LOG_LEVEL, appEnvironment),
    dataManifestVersion: safeBuildValue(env.DATA_MANIFEST_VERSION, "unknown"),
    generatedDataTimestamp: isoTimestampOrNull(env.GENERATED_DATA_TIMESTAMP),
    dataFreshnessState: freshnessValue(env.DATA_FRESHNESS_STATE),
    serviceArea: {
      minLatitude: Math.min(minLatitude, maxLatitude),
      maxLatitude: Math.max(minLatitude, maxLatitude),
      minLongitude: Math.min(minLongitude, maxLongitude),
      maxLongitude: Math.max(minLongitude, maxLongitude),
    },
    maxDirectDistanceMeters: numberValue(
      env.ROUTE_MAX_DIRECT_DISTANCE_METERS,
      MAX_ROUTE_DIRECT_DISTANCE_METERS,
      100,
      50_000,
    ),
    maxWaypoints: integerValue(env.ROUTE_MAX_WAYPOINTS, 2, 2, 10),
    maxConcurrency: integerValue(env.ROUTE_MAX_CONCURRENCY, 4, 1, 100),
    bodyLimitBytes: integerValue(env.ROUTE_BODY_LIMIT_BYTES, MAX_ROUTE_REQUEST_BYTES, 1_024, 1_048_576),
    cacheTtlSeconds: integerValue(env.ROUTE_CACHE_TTL_SECONDS, ROUTE_CACHE_TTL_SECONDS, 0, 86_400),
    rateLimitRequests: integerValue(env.ROUTE_RATE_LIMIT_REQUESTS, 30, 1, 10_000),
    rateLimitWindowSeconds: integerValue(env.ROUTE_RATE_LIMIT_WINDOW_SECONDS, 60, 1, 3_600),
    orsTimeoutMilliseconds: integerValue(env.ORS_TIMEOUT_MILLISECONDS, ORS_TIMEOUT_MILLISECONDS, 100, 60_000),
    orsMaxRetries: integerValue(env.ORS_MAX_RETRIES, 1, 0, 3),
    orsRetryBaseDelayMilliseconds: integerValue(env.ORS_RETRY_BASE_DELAY_MILLISECONDS, 250, 0, 10_000),
    orsRetryMaxDelayMilliseconds: integerValue(env.ORS_RETRY_MAX_DELAY_MILLISECONDS, 2_000, 0, 30_000),
    circuitFailureThreshold: integerValue(env.ORS_CIRCUIT_FAILURE_THRESHOLD, 3, 1, 100),
    circuitResetMilliseconds: integerValue(env.ORS_CIRCUIT_RESET_MILLISECONDS, 30_000, 1_000, 3_600_000),
  };
}
