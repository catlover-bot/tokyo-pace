import {
  buildOrsRequest,
  buildRouteCacheKey,
  normalizeOrsResponse,
  routeProfiles,
  RouteValidationError,
  validateRouteSearchRequest,
} from "../src/domain/routing";
import {
  ANONYMOUS_SESSION_HEADER,
  isValidAnonymousSessionId,
} from "../src/domain/anonymousSession";
import { summarizeDataFreshness } from "../src/domain/dataFreshness";
import openDataManifestJson from "../src/data/generated/open-data-manifest.json";
import type { DemoRoute, GeoPoint, OpenDataManifest, RouteProfile, RouteSearchRequest } from "../src/types";
import { asPublicApiError, PublicApiError, publicErrorBody, type PublicErrorCode } from "./errors";
import { createStructuredLogger, type CacheState, type StructuredLogger } from "./logger";
import {
  CircuitBreaker,
  ConcurrencyGate,
  deterministicRetryDelayMilliseconds,
  InMemoryFixedWindowRateLimiter,
  parseRetryAfterMilliseconds,
  type CircuitState,
  type RouteRateLimiter,
} from "./resilience";
import { resolveRuntimeConfig, type RuntimeConfig, type WorkerEnv } from "./runtimeConfig";

export type Env = WorkerEnv;
export type CacheLike = {
  match(request: Request): Promise<Response | undefined | null>;
  put(request: Request, response: Response): Promise<void>;
};
export type ProfileCircuitBreakers = Record<RouteProfile, CircuitBreaker>;
export type MissingProfile = { profile: RouteProfile; code: PublicErrorCode; retryable: boolean };
export type RouteSuccessPayload = {
  routes: DemoRoute[];
  source: "openrouteservice";
  generatedAt: string;
  missingProfiles: MissingProfile[];
  warnings: string[];
};
export type WorkerDependencies = {
  fetchImpl?: typeof fetch;
  cache?: CacheLike | null;
  cacheScope?: "cloudflare_edge_location" | "local_edge_instance";
  now?: () => string;
  nowMilliseconds?: () => number;
  requestIdFactory?: () => string;
  nowDate?: () => Date;
  timeoutMilliseconds?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  logger?: StructuredLogger;
  rateLimiter?: RouteRateLimiter | null;
  concurrencyGate?: ConcurrencyGate;
  circuitBreakers?: ProfileCircuitBreakers;
  inFlightRequests?: Map<string, Promise<RouteSuccessPayload>>;
  rateLimitMetrics?: RateLimitMetrics;
  ipFallbackSalt?: string;
};

export type RateLimitMetrics = {
  ipFallbackUseCount: number;
};

export type PublicVersionMetadata = {
  id: string;
  tag: string | null;
  timestamp: string | null;
  source: "cloudflare_version_metadata" | "local_fallback" | "metadata_unavailable";
};

const defaultFetch: typeof fetch = (...arguments_) => globalThis.fetch(...arguments_);
const defaultSleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
const defaultInFlightRequests = new Map<string, Promise<RouteSuccessPayload>>();
const defaultLogger = createStructuredLogger();
const defaultRateLimitMetrics: RateLimitMetrics = { ipFallbackUseCount: 0 };

let defaultRateLimiterKey = "";
let defaultRateLimiter: InMemoryFixedWindowRateLimiter | null = null;
let defaultConcurrencyKey = "";
let defaultConcurrencyGate: ConcurrencyGate | null = null;
let defaultCircuitKey = "";
let defaultCircuitBreakers: ProfileCircuitBreakers | null = null;
let defaultIpFallbackSalt: string | null = null;

const secureHeaders = {
  "content-type": "application/json; charset=utf-8",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
} as const;

function jsonResponse(
  value: unknown,
  requestId: string,
  status = 200,
  headers: HeadersInit = {},
): Response {
  return Response.json(value, {
    status,
    headers: { ...secureHeaders, "cache-control": "no-store", "x-request-id": requestId, ...headers },
  });
}

function errorResponse(error: PublicApiError, requestId: string): Response {
  const headers: Record<string, string> = {};
  if (error.retryAfterSeconds !== undefined) {
    headers["retry-after"] = String(Math.max(1, Math.ceil(error.retryAfterSeconds)));
  }
  return jsonResponse(publicErrorBody(error, requestId), requestId, error.status, headers);
}

function makeRequestId(dependencies: WorkerDependencies): string {
  if (dependencies.requestIdFactory) return dependencies.requestIdFactory();
  return crypto.randomUUID();
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, "0")).join("");
}

export async function createRouteCacheRequest(request: RouteSearchRequest): Promise<Request> {
  const hash = await sha256(buildRouteCacheKey(request));
  return new Request(`https://tokyo-pace.internal/api/routes-cache/${hash}`);
}

function getDefaultRateLimiter(config: RuntimeConfig): InMemoryFixedWindowRateLimiter {
  const key = `${config.rateLimitRequests}:${config.rateLimitWindowSeconds}`;
  if (!defaultRateLimiter || defaultRateLimiterKey !== key) {
    defaultRateLimiter = new InMemoryFixedWindowRateLimiter(config.rateLimitRequests, config.rateLimitWindowSeconds);
    defaultRateLimiterKey = key;
  }
  return defaultRateLimiter;
}

function getDefaultConcurrencyGate(config: RuntimeConfig): ConcurrencyGate {
  const key = String(config.maxConcurrency);
  if (!defaultConcurrencyGate || defaultConcurrencyKey !== key) {
    defaultConcurrencyGate = new ConcurrencyGate(config.maxConcurrency);
    defaultConcurrencyKey = key;
  }
  return defaultConcurrencyGate;
}

export function createProfileCircuitBreakers(
  failureThreshold = 3,
  resetAfterMilliseconds = 30_000,
): ProfileCircuitBreakers {
  return Object.fromEntries(
    routeProfiles.map((profile) => [
      profile,
      new CircuitBreaker(failureThreshold, resetAfterMilliseconds),
    ]),
  ) as ProfileCircuitBreakers;
}

function getDefaultCircuitBreakers(config: RuntimeConfig): ProfileCircuitBreakers {
  const key = `${config.circuitFailureThreshold}:${config.circuitResetMilliseconds}`;
  if (!defaultCircuitBreakers || defaultCircuitKey !== key) {
    defaultCircuitBreakers = createProfileCircuitBreakers(
      config.circuitFailureThreshold,
      config.circuitResetMilliseconds,
    );
    defaultCircuitKey = key;
  }
  return defaultCircuitBreakers;
}

function aggregateCircuitState(circuitBreakers: ProfileCircuitBreakers, nowMilliseconds: number): CircuitState {
  const states = routeProfiles.map((profile) => circuitBreakers[profile].snapshot(nowMilliseconds).state);
  if (states.includes("open")) return "open";
  if (states.includes("half_open")) return "half_open";
  return "closed";
}

function directDistanceMeters(a: GeoPoint, b: GeoPoint): number {
  const radians = (value: number) => (value * Math.PI) / 180;
  const radius = 6_371_000;
  const latitudeDelta = radians(b.latitude - a.latitude);
  const longitudeDelta = radians(b.longitude - a.longitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(a.latitude)) *
      Math.cos(radians(b.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(haversine));
}

function enforceRuntimeRouteLimits(
  rawInput: unknown,
  routeRequest: RouteSearchRequest,
  config: RuntimeConfig,
): void {
  const points = [routeRequest.origin, routeRequest.destination];
  if (
    points.some(
      (point) =>
        point.latitude < config.serviceArea.minLatitude ||
        point.latitude > config.serviceArea.maxLatitude ||
        point.longitude < config.serviceArea.minLongitude ||
        point.longitude > config.serviceArea.maxLongitude,
    )
  ) {
    throw new PublicApiError("OUTSIDE_SERVICE_AREA", 422, false);
  }
  if (directDistanceMeters(routeRequest.origin, routeRequest.destination) > config.maxDirectDistanceMeters) {
    throw new PublicApiError("ROUTE_TOO_LONG", 422, false);
  }
  if (rawInput && typeof rawInput === "object" && "waypoints" in rawInput) {
    const waypoints = (rawInput as { waypoints?: unknown }).waypoints;
    if (!Array.isArray(waypoints) || waypoints.length > config.maxWaypoints) {
      throw new PublicApiError("INVALID_REQUEST", 400, false);
    }
  }
}

function ephemeralIpFallbackSalt(): string {
  if (!defaultIpFallbackSalt) {
    defaultIpFallbackSalt = crypto.randomUUID();
  }
  return defaultIpFallbackSalt;
}

export async function createSessionRateLimitKey(identifier: string): Promise<string> {
  return sha256(`tokyo-pace-session-rate-limit:${identifier}`);
}

export async function createIpFallbackRateLimitKey(address: string, salt: string): Promise<string> {
  return sha256(`tokyo-pace-ip-fallback:${salt}:${address}`);
}

type RateLimitIdentity = {
  key: string;
  source: "browser_session" | "temporary_salted_ip_hash";
};

async function resolveRateLimitIdentity(
  request: Request,
  dependencies: WorkerDependencies,
): Promise<RateLimitIdentity | null> {
  const sessionIdentifier = request.headers.get(ANONYMOUS_SESSION_HEADER);
  if (sessionIdentifier !== null) {
    if (!isValidAnonymousSessionId(sessionIdentifier)) {
      throw new PublicApiError("INVALID_REQUEST", 400, false);
    }
    return {
      key: await createSessionRateLimitKey(sessionIdentifier),
      source: "browser_session",
    };
  }

  const address = request.headers.get("cf-connecting-ip");
  if (!address) return null;
  const metrics = dependencies.rateLimitMetrics ?? defaultRateLimitMetrics;
  metrics.ipFallbackUseCount += 1;
  return {
    key: await createIpFallbackRateLimitKey(
      address,
      dependencies.ipFallbackSalt ?? ephemeralIpFallbackSalt(),
    ),
    source: "temporary_salted_ip_hash",
  };
}

async function readRequestBodyWithinLimit(request: Request, maximumBytes: number): Promise<string> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel();
        throw new PublicApiError("INVALID_REQUEST", 413, false);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(combined);
}

async function enforceRateLimit(
  request: Request,
  env: Env,
  config: RuntimeConfig,
  dependencies: WorkerDependencies,
  nowMilliseconds: number,
): Promise<void> {
  const identity = await resolveRateLimitIdentity(request, dependencies);
  if (!identity) return;
  const key = identity.key;

  if (dependencies.rateLimiter) {
    const decision = await dependencies.rateLimiter.check(key, nowMilliseconds);
    if (!decision.allowed) throw new PublicApiError("SERVICE_BUSY", 429, true, decision.retryAfterSeconds);
    return;
  }

  if (env.ROUTE_RATE_LIMITER) {
    try {
      const decision = await env.ROUTE_RATE_LIMITER.limit({ key });
      if (!decision.success) {
        throw new PublicApiError("SERVICE_BUSY", 429, true, config.rateLimitWindowSeconds);
      }
      return;
    } catch (error) {
      if (error instanceof PublicApiError) throw error;
      // Fail open to the bounded per-isolate fallback if the optional binding is unavailable.
    }
  }

  const decision = getDefaultRateLimiter(config).check(key, nowMilliseconds);
  if (!decision.allowed) throw new PublicApiError("SERVICE_BUSY", 429, true, decision.retryAfterSeconds);
}

class UpstreamError extends PublicApiError {
  constructor(
    code: Extract<
      PublicErrorCode,
      "UPSTREAM_TIMEOUT" | "UPSTREAM_UNAUTHORIZED" | "UPSTREAM_RATE_LIMITED" | "UPSTREAM_UNAVAILABLE"
    >,
    status: number,
    retryable: boolean,
    retryAfterSeconds?: number,
    upstreamStatus?: number,
    readonly tripsCircuit = true,
  ) {
    super(code, status, retryable, retryAfterSeconds, upstreamStatus);
    this.name = "UpstreamError";
  }
}

function classifyUpstreamResponse(response: Response, nowMilliseconds: number): UpstreamError {
  if (response.status === 401 || response.status === 403) {
    return new UpstreamError("UPSTREAM_UNAUTHORIZED", 502, false, undefined, response.status);
  }
  if (response.status === 429) {
    const retryAfterMilliseconds = parseRetryAfterMilliseconds(
      response.headers.get("retry-after"),
      nowMilliseconds,
    );
    return new UpstreamError(
      "UPSTREAM_RATE_LIMITED",
      503,
      true,
      retryAfterMilliseconds === null ? undefined : Math.max(1, Math.ceil(retryAfterMilliseconds / 1_000)),
      response.status,
    );
  }
  if (response.status >= 500) {
    return new UpstreamError("UPSTREAM_UNAVAILABLE", 502, true, undefined, response.status);
  }
  return new UpstreamError("UPSTREAM_UNAVAILABLE", 422, false, undefined, response.status, false);
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMilliseconds: number,
): Promise<Response> {
  const controller = new AbortController();
  let timeoutIdentifier: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutIdentifier = setTimeout(() => {
      controller.abort();
      reject(new UpstreamError("UPSTREAM_TIMEOUT", 504, true));
    }, timeoutMilliseconds);
  });
  try {
    return await Promise.race([fetchImpl(url, { ...init, signal: controller.signal }), timeout]);
  } catch (error) {
    if (error instanceof UpstreamError) throw error;
    if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      throw new UpstreamError("UPSTREAM_TIMEOUT", 504, true);
    }
    throw new UpstreamError("UPSTREAM_UNAVAILABLE", 502, true);
  } finally {
    if (timeoutIdentifier !== undefined) clearTimeout(timeoutIdentifier);
  }
}

export async function requestOrsProfile(
  apiKey: string,
  routeRequest: RouteSearchRequest,
  profile: RouteProfile,
  generatedAt: string,
  config: RuntimeConfig,
  dependencies: WorkerDependencies,
): Promise<DemoRoute> {
  const fetchImpl = dependencies.fetchImpl ?? defaultFetch;
  const sleep = dependencies.sleep ?? defaultSleep;
  const nowMilliseconds = dependencies.nowMilliseconds ?? Date.now;
  const circuitBreakers = dependencies.circuitBreakers ?? getDefaultCircuitBreakers(config);
  const circuit = circuitBreakers[profile];
  if (!circuit.allowRequest(nowMilliseconds())) {
    throw new UpstreamError("UPSTREAM_UNAVAILABLE", 503, true);
  }

  const orsRequest = buildOrsRequest(routeRequest, profile);
  const endpoint = `https://api.heigit.org/openrouteservice/v2/directions/${orsRequest.profile}/geojson`;
  let finalError: UpstreamError | null = null;

  for (let attempt = 0; attempt <= config.orsMaxRetries; attempt += 1) {
    try {
      const response = await fetchWithTimeout(
        fetchImpl,
        endpoint,
        {
          method: "POST",
          headers: { Authorization: apiKey, "content-type": "application/json" },
          body: JSON.stringify(orsRequest.body),
        },
        dependencies.timeoutMilliseconds ?? config.orsTimeoutMilliseconds,
      );
      if (!response.ok) throw classifyUpstreamResponse(response, nowMilliseconds());
      let rawResponse: unknown;
      try {
        rawResponse = await response.json();
      } catch {
        throw new UpstreamError("UPSTREAM_UNAVAILABLE", 502, false);
      }
      try {
        const route = normalizeOrsResponse(
          rawResponse as Parameters<typeof normalizeOrsResponse>[0],
          profile,
          generatedAt,
        );
        circuit.recordSuccess();
        return route;
      } catch (error) {
        if (error instanceof RouteValidationError) {
          throw new UpstreamError("UPSTREAM_UNAVAILABLE", 502, false);
        }
        throw error;
      }
    } catch (error) {
      finalError =
        error instanceof UpstreamError ? error : new UpstreamError("UPSTREAM_UNAVAILABLE", 502, true);
      if (!finalError.retryable || attempt >= config.orsMaxRetries) break;
      const retryAfterMilliseconds =
        finalError.retryAfterSeconds === undefined ? null : finalError.retryAfterSeconds * 1_000;
      const delay = deterministicRetryDelayMilliseconds(
        attempt,
        config.orsRetryBaseDelayMilliseconds,
        config.orsRetryMaxDelayMilliseconds,
        retryAfterMilliseconds,
      );
      if (delay > 0) await sleep(delay);
    }
  }

  const error = finalError ?? new UpstreamError("UPSTREAM_UNAVAILABLE", 502, true);
  if (error.tripsCircuit) circuit.recordFailure(nowMilliseconds());
  else circuit.recordSuccess();
  throw error;
}

type ProfileOutcome =
  | { ok: true; profile: RouteProfile; route: DemoRoute }
  | { ok: false; profile: RouteProfile; error: PublicApiError };

function selectAllProfilesError(outcomes: ProfileOutcome[]): PublicApiError {
  const failures = outcomes.flatMap((outcome) => (outcome.ok ? [] : [outcome.error]));
  for (const code of [
    "UPSTREAM_UNAUTHORIZED",
    "UPSTREAM_RATE_LIMITED",
    "UPSTREAM_TIMEOUT",
    "UPSTREAM_UNAVAILABLE",
  ] satisfies PublicErrorCode[]) {
    const match = failures.find((failure) => failure.code === code);
    if (match) return match;
  }
  return new PublicApiError("UPSTREAM_UNAVAILABLE", 502, true);
}

async function fetchRoutePayload(
  routeRequest: RouteSearchRequest,
  env: Env,
  config: RuntimeConfig,
  dependencies: WorkerDependencies,
  generatedAt: string,
): Promise<RouteSuccessPayload> {
  if (!env.OPENROUTESERVICE_API_KEY) {
    throw new PublicApiError("UPSTREAM_UNAUTHORIZED", 503, true);
  }
  const outcomes = await Promise.all(
    routeProfiles.map(async (profile): Promise<ProfileOutcome> => {
      try {
        return {
          ok: true,
          profile,
          route: await requestOrsProfile(
            env.OPENROUTESERVICE_API_KEY as string,
            routeRequest,
            profile,
            generatedAt,
            config,
            dependencies,
          ),
        };
      } catch (error) {
        return { ok: false, profile, error: asPublicApiError(error) };
      }
    }),
  );
  const successfulRoutes = outcomes.flatMap((outcome) => (outcome.ok ? [outcome.route] : []));
  if (successfulRoutes.length === 0) throw selectAllProfilesError(outcomes);
  const missingProfiles = outcomes.flatMap((outcome): MissingProfile[] =>
    outcome.ok
      ? []
      : [{ profile: outcome.profile, code: outcome.error.code, retryable: outcome.error.retryable }],
  );
  const partialWarning =
    missingProfiles.length > 0
      ? "一部の経路候補を取得できませんでした。表示中の候補を比較するか、時間をおいて再検索してください。"
      : null;
  const routes = partialWarning
    ? successfulRoutes.map((route) => ({ ...route, warnings: [...(route.warnings ?? []), partialWarning] }))
    : successfulRoutes;
  return {
    routes,
    source: "openrouteservice",
    generatedAt,
    missingProfiles,
    warnings: partialWarning ? [partialWarning] : [],
  };
}

function isRouteSuccessPayload(value: unknown): value is RouteSuccessPayload {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RouteSuccessPayload>;
  return (
    Array.isArray(candidate.routes) &&
    candidate.routes.length > 0 &&
    candidate.source === "openrouteservice" &&
    typeof candidate.generatedAt === "string" &&
    Array.isArray(candidate.missingProfiles) &&
    Array.isArray(candidate.warnings)
  );
}

type RouteTelemetry = {
  cacheState: CacheState;
  upstreamStatus?: number;
  errorCode?: string;
  areaClassification: "inside" | "outside" | "unknown";
};

async function processRouteRequest(
  request: Request,
  env: Env,
  config: RuntimeConfig,
  dependencies: WorkerDependencies,
  requestId: string,
  telemetry: RouteTelemetry,
): Promise<Response> {
  if (request.method !== "POST") {
    throw new PublicApiError("INVALID_REQUEST", 405, false);
  }
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    throw new PublicApiError("INVALID_REQUEST", 400, false);
  }

  const nowMilliseconds = (dependencies.nowMilliseconds ?? Date.now)();
  await enforceRateLimit(request, env, config, dependencies, nowMilliseconds);

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > config.bodyLimitBytes) {
    throw new PublicApiError("INVALID_REQUEST", 413, false);
  }
  const text = await readRequestBodyWithinLimit(request, config.bodyLimitBytes);
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    throw new PublicApiError("INVALID_REQUEST", 400, false);
  }

  let routeRequest: RouteSearchRequest;
  try {
    routeRequest = validateRouteSearchRequest(input);
  } catch (error) {
    if (error instanceof RouteValidationError && error.message.includes("対象地域")) {
      telemetry.areaClassification = "outside";
    }
    throw error;
  }
  enforceRuntimeRouteLimits(input, routeRequest, config);
  telemetry.areaClassification = "inside";

  const cache = dependencies.cache ?? null;
  const cacheRequest = await createRouteCacheRequest(routeRequest);
  const cacheKey = cacheRequest.url;
  if (cache) {
    try {
      const cached = await cache.match(cacheRequest);
      if (cached) {
        const cachedValue = await cached.json();
        if (isRouteSuccessPayload(cachedValue)) {
          telemetry.cacheState = "hit";
          return jsonResponse(
            { ...cachedValue, requestId },
            requestId,
            200,
            {
              "cache-control": "private, no-store",
              "x-tokyo-pace-cache": "hit",
            },
          );
        }
      }
      telemetry.cacheState = "miss";
    } catch {
      telemetry.cacheState = "bypass";
    }
  } else {
    telemetry.cacheState = "bypass";
  }

  const inFlightRequests = dependencies.inFlightRequests ?? defaultInFlightRequests;
  const existingRequest = inFlightRequests.get(cacheKey);
  if (existingRequest) {
    telemetry.cacheState = "deduplicated";
    const payload = await existingRequest;
    telemetry.upstreamStatus = 200;
    return jsonResponse(
      { ...payload, requestId },
      requestId,
      200,
      {
        "cache-control": "private, no-store",
        "x-tokyo-pace-cache": "deduplicated",
      },
    );
  }

  const concurrencyGate = dependencies.concurrencyGate ?? getDefaultConcurrencyGate(config);
  const release = concurrencyGate.tryAcquire();
  if (!release) throw new PublicApiError("SERVICE_BUSY", 503, true, 1);

  const generatedAt = dependencies.now?.() ?? new Date().toISOString();
  const routePromise = fetchRoutePayload(routeRequest, env, config, dependencies, generatedAt);
  inFlightRequests.set(cacheKey, routePromise);
  try {
    const payload = await routePromise;
    telemetry.upstreamStatus = 200;
    if (cache) {
      try {
        const cacheEntry = Response.json(payload, {
          headers: {
            ...secureHeaders,
            "cache-control": `public, max-age=${config.cacheTtlSeconds}`,
          },
        });
        await cache.put(cacheRequest, cacheEntry);
      } catch {
        telemetry.cacheState = "bypass";
      }
    }
    return jsonResponse(
      { ...payload, requestId },
      requestId,
      200,
      {
        "cache-control": "private, no-store",
        "x-tokyo-pace-cache": telemetry.cacheState,
      },
    );
  } finally {
    if (inFlightRequests.get(cacheKey) === routePromise) inFlightRequests.delete(cacheKey);
    release();
  }
}

export async function handleRouteRequest(
  request: Request,
  env: Env,
  dependencies: WorkerDependencies = {},
): Promise<Response> {
  const config = resolveRuntimeConfig(env);
  const requestId = makeRequestId(dependencies);
  const logger = dependencies.logger ?? defaultLogger;
  const start = (dependencies.nowMilliseconds ?? Date.now)();
  const telemetry: RouteTelemetry = {
    cacheState: "not_applicable",
    areaClassification: "unknown",
  };
  let response: Response;
  try {
    response = await processRouteRequest(request, env, config, dependencies, requestId, telemetry);
  } catch (error) {
    const publicError = asPublicApiError(error);
    telemetry.errorCode = publicError.code;
    telemetry.upstreamStatus = publicError.upstreamStatus;
    response = errorResponse(publicError, requestId);
    if (response.status === 405) response.headers.set("allow", "POST");
  }
  logger.log({
    level: response.status >= 500 ? "error" : response.status >= 400 ? "warn" : "info",
    event: "route.request.completed",
    requestId,
    route: "/api/routes",
    method: request.method,
    status: response.status,
    durationMs: (dependencies.nowMilliseconds ?? Date.now)() - start,
    cacheState: telemetry.cacheState,
    upstreamProvider: telemetry.upstreamStatus === undefined ? undefined : "openrouteservice",
    upstreamStatus: telemetry.upstreamStatus,
    appVersion: config.appVersion,
    errorCode: telemetry.errorCode,
    areaClassification: telemetry.areaClassification,
  });
  return response;
}

function dataFreshnessWarning(state: RuntimeConfig["dataFreshnessState"]): string | null {
  if (state === "aging") return "データの更新確認中です。";
  if (state === "stale" || state === "update_failed") {
    return "一部データの更新が遅れています。";
  }
  return null;
}

function safeVersionToken(value: string | undefined): string | null {
  return value && value.length <= 128 && /^[A-Za-z0-9._+:/-]+$/.test(value)
    ? value
    : null;
}

export function resolvePublicVersionMetadata(
  env: Env,
  config = resolveRuntimeConfig(env),
): PublicVersionMetadata {
  if (config.appEnvironment === "local") {
    return {
      id: "local",
      tag: "local",
      timestamp: null,
      source: "local_fallback",
    };
  }
  const metadata = env.CF_VERSION_METADATA;
  const id = safeVersionToken(metadata?.id);
  if (metadata && id) {
    return {
      id,
      tag: safeVersionToken(metadata.tag),
      timestamp: Number.isFinite(Date.parse(metadata.timestamp))
        ? new Date(metadata.timestamp).toISOString()
        : null,
      source: "cloudflare_version_metadata",
    };
  }
  return {
    id: "unavailable",
    tag: null,
    timestamp: null,
    source: "metadata_unavailable",
  };
}

async function handleMetadataRequest(
  request: Request,
  env: Env,
  dependencies: WorkerDependencies,
): Promise<Response> {
  const config = resolveRuntimeConfig(env);
  const requestId = makeRequestId(dependencies);
  const logger = dependencies.logger ?? defaultLogger;
  const start = (dependencies.nowMilliseconds ?? Date.now)();
  const url = new URL(request.url);
  const versionMetadata = resolvePublicVersionMetadata(env, config);
  let response: Response;

  if (request.method !== "GET") {
    response = errorResponse(new PublicApiError("INVALID_REQUEST", 405, false), requestId);
    response.headers.set("allow", "GET");
  } else if (url.pathname === "/api/health") {
    response = jsonResponse(
      { status: "ok", service: "TOKYO PACE", requestId },
      requestId,
    );
  } else if (url.pathname === "/api/status") {
    const circuitBreakers = dependencies.circuitBreakers ?? getDefaultCircuitBreakers(config);
    const circuitState = aggregateCircuitState(
      circuitBreakers,
      (dependencies.nowMilliseconds ?? Date.now)(),
    );
    const manifest = openDataManifestJson as OpenDataManifest;
    const manifestFreshness = summarizeDataFreshness(
      manifest,
      dependencies.nowDate?.() ?? new Date((dependencies.nowMilliseconds ?? Date.now)()),
    );
    const effectiveFreshness =
      config.dataFreshnessState === "unknown" ? manifestFreshness.state : config.dataFreshnessState;
    const warnings = [
      dataFreshnessWarning(effectiveFreshness),
      circuitState === "open"
        ? "経路サービスへの接続を一時的に抑制しています。"
        : circuitState === "half_open"
          ? "経路サービスへの接続回復を確認中です。"
          : null,
    ].filter((warning): warning is string => warning !== null);
    response = jsonResponse(
      {
        serviceStatus: warnings.length > 0 ? "degraded" : "no_known_degradation",
        statusScope: "observed_worker_and_bound_resources",
        authoritative: false,
        environment: config.appEnvironment,
        appVersion: config.appVersion,
        deploymentVersion: versionMetadata.id,
        versionMetadata,
        dataManifestVersion: config.dataManifestVersion,
        generatedDataTimestamp: config.generatedDataTimestamp ?? manifest.generatedAt ?? null,
        dataFreshness: {
          state: effectiveFreshness,
          label:
            effectiveFreshness === manifestFreshness.state
              ? manifestFreshness.label
              : effectiveFreshness === "current"
                ? "データ更新済み"
                : effectiveFreshness === "aging"
                  ? "更新確認中"
                  : "一部データの更新が遅れています",
          counts: manifestFreshness.counts,
        },
        orsCircuitState: circuitState,
        circuit: {
          state: circuitState,
          scope: "local_edge_instance",
          authoritative: false,
        },
        cache: {
          enabled: Boolean(dependencies.cache),
          ttlSeconds: config.cacheTtlSeconds,
          scope: dependencies.cacheScope ?? "local_edge_instance",
          authoritative: false,
          requestDeduplication: {
            state: "enabled",
            scope: "local_edge_instance",
            authoritative: false,
          },
        },
        rateLimiter: {
          scope: "bound_namespace_with_local_edge_fallback",
          authoritative: false,
          cloudflareBinding: {
            configured: Boolean(env.ROUTE_RATE_LIMITER),
            scope: "cloudflare_rate_limit_namespace",
            authoritative: Boolean(env.ROUTE_RATE_LIMITER),
          },
          isolateFallback: {
            enabled: true,
            scope: "local_edge_instance",
            authoritative: false,
          },
          identity: {
            preferred: "browser_session_anonymous_id",
            fallback: "temporary_salted_ip_hash",
            ipFallbackUseCount:
              (dependencies.rateLimitMetrics ?? defaultRateLimitMetrics).ipFallbackUseCount,
            metricsScope: "local_edge_instance",
            rawIpRetained: false,
          },
        },
        warnings,
        requestId,
      },
      requestId,
    );
  } else if (url.pathname === "/api/version") {
    response = jsonResponse(
      {
        appVersion: config.appVersion,
        gitCommit: config.buildCommit,
        buildTimestamp: config.buildTimestamp,
        workerVersionId: versionMetadata.id,
        versionMetadata,
        requestId,
      },
      requestId,
    );
  } else {
    response = errorResponse(new PublicApiError("INVALID_REQUEST", 404, false), requestId);
  }

  logger.log({
    level: response.status >= 500 ? "error" : response.status >= 400 ? "warn" : "info",
    event: "api.request.completed",
    requestId,
    route: url.pathname,
    method: request.method,
    status: response.status,
    durationMs: (dependencies.nowMilliseconds ?? Date.now)() - start,
    cacheState: "not_applicable",
    appVersion: config.appVersion,
  });
  return response;
}

export async function handleWorkerRequest(
  request: Request,
  env: Env,
  dependencies: WorkerDependencies = {},
): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/api/routes") return handleRouteRequest(request, env, dependencies);
  if (
    url.pathname === "/api/health" ||
    url.pathname === "/api/status" ||
    url.pathname === "/api/version" ||
    url.pathname.startsWith("/api/")
  ) {
    return handleMetadataRequest(request, env, dependencies);
  }
  return new Response("Not found", {
    status: 404,
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cache =
      typeof caches === "undefined"
        ? null
        : (caches as unknown as { default: CacheLike }).default;
    return handleWorkerRequest(request, env, {
      cache,
      cacheScope: cache ? "cloudflare_edge_location" : "local_edge_instance",
    });
  },
} satisfies ExportedHandler<Env>;
