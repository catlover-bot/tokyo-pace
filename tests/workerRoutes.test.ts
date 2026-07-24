import { describe, expect, it, vi } from "vitest";
import { ANONYMOUS_SESSION_HEADER } from "../src/domain/anonymousSession";
import { buildRouteCacheKey } from "../src/domain/routing";
import type { RouteSearchRequest } from "../src/types";
import {
  createProfileCircuitBreakers,
  createRouteCacheRequest,
  handleRouteRequest,
  handleWorkerRequest,
  type CacheLike,
  type Env,
  type WorkerDependencies,
} from "../worker/index";
import { createStructuredLogger } from "../worker/logger";
import { CircuitBreaker, ConcurrencyGate, type RouteRateLimiter } from "../worker/resilience";

const body: RouteSearchRequest = {
  origin: { latitude: 35.6909, longitude: 139.6992 },
  destination: { latitude: 35.6895, longitude: 139.6922 },
  preferences: {
    maxContinuousWalkingMinutes: 10,
    requireToilet: true,
    avoidSteepSlopes: true,
    preferIndoorRest: false,
    avoidSteps: true,
  },
};
const ors = {
  features: [
    {
      geometry: { coordinates: [[139.6992, 35.6909], [139.6922, 35.6895]] },
      properties: { summary: { distance: 1_000, duration: 720 }, segments: [], extras: {} },
    },
  ],
};
const anonymousSessionId = "c36f4dc8-f716-4c8f-8ba1-0a4db893fc83";

const apiRequest = (
  value: unknown = body,
  headers: Record<string, string> = {},
  method = "POST",
) =>
  new Request("https://example.test/api/routes", {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: method === "GET" ? undefined : JSON.stringify(value),
  });

const environment = (overrides: Env = {}): Env => ({
  OPENROUTESERVICE_API_KEY: "test-placeholder-key",
  APP_ENV: "preview",
  APP_VERSION: "1.0.0",
  ORS_MAX_RETRIES: "0",
  ...overrides,
});

const quietLogger = () => createStructuredLogger(() => undefined, () => "2026-07-24T00:00:00.000Z");
const isolatedDependencies = (overrides: WorkerDependencies = {}): WorkerDependencies => ({
  logger: quietLogger(),
  circuitBreakers: createProfileCircuitBreakers(),
  inFlightRequests: new Map(),
  sleep: async () => undefined,
  requestIdFactory: () => "request-test-1",
  ...overrides,
});

const memoryCache = (): CacheLike & {
  match: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
} => {
  const entries = new Map<string, Response>();
  return {
    match: vi.fn(async (request: Request) => entries.get(request.url)?.clone()),
    put: vi.fn(async (request: Request, response: Response) => {
      entries.set(request.url, response.clone());
    }),
  };
};

const jsonBody = async <Value>(response: Response) => response.json() as Promise<Value>;

describe("Worker routes API request protection", () => {
  it("POSTとapplication/jsonだけを受け付け、固定エラー契約を返す", async () => {
    const get = await handleRouteRequest(
      new Request("https://example.test/api/routes"),
      {},
      isolatedDependencies(),
    );
    const wrongContentType = await handleRouteRequest(
      new Request("https://example.test/api/routes", { method: "POST", body: "{}" }),
      {},
      isolatedDependencies(),
    );
    expect(get.status).toBe(405);
    expect(get.headers.get("allow")).toBe("POST");
    expect(wrongContentType.status).toBe(400);
    expect(await jsonBody(get)).toMatchObject({
      code: "INVALID_REQUEST",
      userMessage: expect.any(String),
      retryable: false,
      requestId: "request-test-1",
    });
  });

  it("壊れたJSON、宣言値と実体の過大bodyを拒否する", async () => {
    const broken = new Request("https://example.test/api/routes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    const declared = apiRequest(body, { "content-length": "999999" });
    const actual = apiRequest({ payload: "x".repeat(2_000) });
    const smallLimitEnv = environment({ ROUTE_BODY_LIMIT_BYTES: "1024" });
    expect((await handleRouteRequest(broken, {}, isolatedDependencies())).status).toBe(400);
    expect((await handleRouteRequest(declared, {}, isolatedDependencies())).status).toBe(413);
    expect((await handleRouteRequest(actual, smallLimitEnv, isolatedDependencies())).status).toBe(413);
  });

  it("service area、距離、waypoint数を上限で拒否する", async () => {
    const outside = { ...body, origin: { latitude: 35, longitude: 139 } };
    const long = {
      ...body,
      origin: { latitude: 35.6701, longitude: 139.6701 },
      destination: { latitude: 35.7299, longitude: 139.7399 },
    };
    const waypoints = { ...body, waypoints: [{}, {}, {}] };
    expect(
      await jsonBody(await handleRouteRequest(apiRequest(outside), environment(), isolatedDependencies())),
    ).toMatchObject({ code: "OUTSIDE_SERVICE_AREA" });
    expect(
      await jsonBody(await handleRouteRequest(apiRequest(long), environment(), isolatedDependencies())),
    ).toMatchObject({ code: "ROUTE_TOO_LONG" });
    expect(
      await jsonBody(await handleRouteRequest(apiRequest(waypoints), environment(), isolatedDependencies())),
    ).toMatchObject({ code: "INVALID_REQUEST" });
  });

  it("rate limitはIPをログへ出さず429とRetry-Afterを返す", async () => {
    const rateLimiter: RouteRateLimiter = {
      check: vi.fn(async () => ({ allowed: false, retryAfterSeconds: 17 })),
    };
    const records: string[] = [];
    const response = await handleRouteRequest(
      apiRequest(body, { "cf-connecting-ip": "203.0.113.42" }),
      environment(),
      isolatedDependencies({
        rateLimiter,
        logger: createStructuredLogger((record) => records.push(record)),
      }),
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("17");
    expect(await jsonBody(response)).toMatchObject({ code: "SERVICE_BUSY", retryable: true });
    expect(records.join("")).not.toContain("203.0.113.42");
  });

  it("検証済みセッションIDをhash化してCloudflare bindingへ渡す", async () => {
    const limit = vi.fn(async (options: { key: string }) => {
      void options;
      return { success: true };
    });
    const fetchImpl = vi.fn(async () => Response.json(ors));
    const records: string[] = [];
    const response = await handleRouteRequest(
      apiRequest(body, { [ANONYMOUS_SESSION_HEADER]: anonymousSessionId }),
      environment({ ROUTE_RATE_LIMITER: { limit } }),
      isolatedDependencies({
        fetchImpl: fetchImpl as typeof fetch,
        logger: createStructuredLogger((record) => records.push(record)),
      }),
    );
    expect(response.status).toBe(200);
    expect(limit).toHaveBeenCalledOnce();
    const key = limit.mock.calls[0][0].key;
    expect(key).toMatch(/^[0-9a-f]{64}$/u);
    expect(key).not.toContain(anonymousSessionId);
    expect(await response.text()).not.toContain(anonymousSessionId);
    expect(records.join("")).not.toContain(anonymousSessionId);
  });

  it("不正なセッションIDを拒否してrate limit回避と上流呼び出しを防ぐ", async () => {
    const limit = vi.fn(async (options: { key: string }) => {
      void options;
      return { success: true };
    });
    const fetchImpl = vi.fn(async () => Response.json(ors));
    const response = await handleRouteRequest(
      apiRequest(body, { [ANONYMOUS_SESSION_HEADER]: "caller-controlled-key" }),
      environment({ ROUTE_RATE_LIMITER: { limit } }),
      isolatedDependencies({ fetchImpl: fetchImpl as typeof fetch }),
    );
    expect(response.status).toBe(400);
    expect(await jsonBody(response)).toMatchObject({ code: "INVALID_REQUEST" });
    expect(limit).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("ID欠落時だけ一時salt付きIP hashを使いraw IPを保持しない", async () => {
    const address = "203.0.113.77";
    const metrics = { ipFallbackUseCount: 0 };
    const check = vi.fn(async (key: string, nowMilliseconds: number) => {
      void key;
      void nowMilliseconds;
      return { allowed: true, retryAfterSeconds: 0 };
    });
    const records: string[] = [];
    const response = await handleRouteRequest(
      apiRequest(body, { "cf-connecting-ip": address }),
      environment(),
      isolatedDependencies({
        fetchImpl: vi.fn(async () => Response.json(ors)) as typeof fetch,
        rateLimiter: { check },
        rateLimitMetrics: metrics,
        ipFallbackSalt: "ephemeral-test-only-salt",
        logger: createStructuredLogger((record) => records.push(record)),
      }),
    );
    expect(response.status).toBe(200);
    expect(metrics.ipFallbackUseCount).toBe(1);
    const key = check.mock.calls[0][0];
    expect(key).toMatch(/^[0-9a-f]{64}$/u);
    expect(key).not.toContain(address);
    expect(await response.text()).not.toContain(address);
    expect(records.join("")).not.toContain(address);
  });

  it("同時実行上限では上流を呼ばず安全なSERVICE_BUSYを返す", async () => {
    const fetchImpl = vi.fn(async () => Response.json(ors));
    const response = await handleRouteRequest(
      apiRequest(),
      environment(),
      isolatedDependencies({
        fetchImpl: fetchImpl as typeof fetch,
        concurrencyGate: new ConcurrencyGate(0),
      }),
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("1");
    expect(await jsonBody(response)).toMatchObject({ code: "SERVICE_BUSY" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("Worker ORS resilience", () => {
  it("3候補を取得しSecretをレスポンスやログへ含めない", async () => {
    const records: string[] = [];
    const fetchImpl = vi.fn(async () => Response.json(ors));
    const response = await handleRouteRequest(
      apiRequest(),
      environment(),
      isolatedDependencies({
        fetchImpl: fetchImpl as typeof fetch,
        logger: createStructuredLogger((record) => records.push(record)),
        now: () => "2026-07-24T00:00:00.000Z",
      }),
    );
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(text).not.toContain("secret-value");
    expect(records.join("")).not.toContain("secret-value");
  });

  it.each([
    [401, 502, "UPSTREAM_UNAUTHORIZED"],
    [429, 503, "UPSTREAM_RATE_LIMITED"],
    [500, 502, "UPSTREAM_UNAVAILABLE"],
  ] as const)("外部API %iを安全な%i/%sへ変換する", async (upstream, expectedStatus, code) => {
    const response = await handleRouteRequest(
      apiRequest(),
      environment(),
      isolatedDependencies({
        fetchImpl: vi.fn(async () => new Response("raw secret upstream body", { status: upstream })) as typeof fetch,
      }),
    );
    const responseText = await response.text();
    expect(response.status).toBe(expectedStatus);
    expect(JSON.parse(responseText)).toMatchObject({ code });
    expect(responseText).not.toContain("raw secret upstream body");
  });

  it("AbortController timeoutを固定UPSTREAM_TIMEOUTへ変換する", async () => {
    const fetchImpl = vi.fn(
      () => new Promise<Response>(() => undefined),
    );
    const response = await handleRouteRequest(
      apiRequest(),
      environment(),
      isolatedDependencies({
        fetchImpl: fetchImpl as typeof fetch,
        timeoutMilliseconds: 1,
      }),
    );
    expect(response.status).toBe(504);
    expect(await jsonBody(response)).toMatchObject({ code: "UPSTREAM_TIMEOUT", retryable: true });
  });

  it("retry回数を決定的な上限に抑える", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 500 }));
    const delays: number[] = [];
    const sleep = vi.fn(async (milliseconds: number) => {
      delays.push(milliseconds);
    });
    const response = await handleRouteRequest(
      apiRequest(),
      environment({
        ORS_MAX_RETRIES: "2",
        ORS_RETRY_BASE_DELAY_MILLISECONDS: "10",
        ORS_RETRY_MAX_DELAY_MILLISECONDS: "100",
      }),
      isolatedDependencies({ fetchImpl: fetchImpl as typeof fetch, sleep }),
    );
    expect(response.status).toBe(502);
    expect(fetchImpl).toHaveBeenCalledTimes(9);
    expect(sleep).toHaveBeenCalledTimes(6);
    expect(delays).toEqual([10, 10, 10, 20, 20, 20]);
  });

  it("Retry-Afterを読み、設定した最大待ち時間で安全に上限化する", async () => {
    const delays: number[] = [];
    const sleep = vi.fn(async (milliseconds: number) => {
      delays.push(milliseconds);
    });
    const response = await handleRouteRequest(
      apiRequest(),
      environment({
        ORS_MAX_RETRIES: "1",
        ORS_RETRY_BASE_DELAY_MILLISECONDS: "10",
        ORS_RETRY_MAX_DELAY_MILLISECONDS: "2000",
      }),
      isolatedDependencies({
        fetchImpl: vi.fn(async () => new Response(null, { status: 429, headers: { "retry-after": "3" } })) as typeof fetch,
        sleep,
      }),
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("3");
    expect(delays).toEqual([2_000, 2_000, 2_000]);
  });

  it("一部profile失敗時は成功候補と欠落profileを返し、route警告にも反映する", async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const requestBody = JSON.parse(String(init?.body)) as { options?: { profile_params?: unknown; avoid_features?: string[] } };
      const stepAvoiding = requestBody.options?.avoid_features?.includes("steps") && !requestBody.options.profile_params;
      return stepAvoiding ? new Response(null, { status: 500 }) : Response.json(ors);
    });
    const response = await handleRouteRequest(
      apiRequest(),
      environment(),
      isolatedDependencies({ fetchImpl: fetchImpl as typeof fetch }),
    );
    const result = await jsonBody<{
      routes: Array<{ profile: string; warnings?: string[] }>;
      missingProfiles: Array<{ profile: string; code: string }>;
    }>(response);
    expect(response.status).toBe(200);
    expect(result.routes.map((route) => route.profile)).toEqual(["standard", "wheelchair_profile"]);
    expect(result.missingProfiles).toEqual([
      { profile: "step_avoiding", code: "UPSTREAM_UNAVAILABLE", retryable: true },
    ]);
    expect(result.routes.every((route) => route.warnings?.some((warning) => warning.includes("一部")))).toBe(true);
  });

  it("全profile失敗時だけ検索全体を失敗させる", async () => {
    const response = await handleRouteRequest(
      apiRequest(),
      environment(),
      isolatedDependencies({
        fetchImpl: vi.fn(async () => new Response(null, { status: 500 })) as typeof fetch,
      }),
    );
    expect(response.status).toBe(502);
    expect(await jsonBody(response)).toMatchObject({
      code: "UPSTREAM_UNAVAILABLE",
      requestId: "request-test-1",
    });
  });
});

describe("Worker cache and request coalescing", () => {
  it("同一要求ではキャッシュを利用しrequestIdをキャッシュしない", async () => {
    const cache = memoryCache();
    const fetchImpl = vi.fn(async () => Response.json(ors));
    const firstDependencies = isolatedDependencies({
      cache,
      fetchImpl: fetchImpl as typeof fetch,
      requestIdFactory: () => "request-first",
      now: () => "2026-07-24T00:00:00.000Z",
    });
    const secondDependencies = {
      ...firstDependencies,
      requestIdFactory: () => "request-second",
    };
    const first = await handleRouteRequest(apiRequest(), environment(), firstDependencies);
    const second = await handleRouteRequest(apiRequest(), environment(), secondDependencies);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(cache.match).toHaveBeenCalledTimes(2);
    expect(first.headers.get("cache-control")).toBe("private, no-store");
    expect(second.headers.get("cache-control")).toBe("private, no-store");
    expect(second.headers.get("x-tokyo-pace-cache")).toBe("hit");
    const internalCacheEntry = cache.put.mock.calls[0]?.[1] as Response | undefined;
    expect(internalCacheEntry?.headers.get("cache-control")).toBe("public, max-age=300");
    expect(await jsonBody(first)).toMatchObject({ requestId: "request-first" });
    expect(await jsonBody(second)).toMatchObject({ requestId: "request-second" });
  });

  it("cache keyは決定的で設定・profile・安全な座標差を区別する", async () => {
    const preferenceChange = {
      ...body,
      preferences: { ...body.preferences, requireToilet: false },
    };
    const coordinateChange = {
      ...body,
      origin: { ...body.origin, latitude: body.origin.latitude + 0.000002 },
    };
    expect(buildRouteCacheKey(body)).toBe(buildRouteCacheKey(structuredClone(body)));
    expect((await createRouteCacheRequest(body)).url).toBe(
      (await createRouteCacheRequest(structuredClone(body))).url,
    );
    expect(buildRouteCacheKey(body)).not.toBe(buildRouteCacheKey(preferenceChange));
    expect(buildRouteCacheKey(body)).not.toBe(buildRouteCacheKey(coordinateChange));
    expect(buildRouteCacheKey(body)).not.toContain("secret");
    expect(buildRouteCacheKey(body)).toContain("wheelchair_profile");
  });

  it("同時の同一検索を1回の3 profile取得へ集約する", async () => {
    const fetchResolvers: Array<(response: Response) => void> = [];
    const fetchImpl = vi.fn(
      () => new Promise<Response>((resolve) => {
        fetchResolvers.push(resolve);
      }),
    );
    const inFlightRequests = new Map();
    const inFlightGet = vi.spyOn(inFlightRequests, "get");
    const common = isolatedDependencies({
      fetchImpl: fetchImpl as typeof fetch,
      inFlightRequests,
      requestIdFactory: () => "request-a",
    });
    const firstPromise = handleRouteRequest(apiRequest(), environment(), common);
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(3));
    const secondPromise = handleRouteRequest(
      apiRequest(),
      environment(),
      { ...common, requestIdFactory: () => "request-b" },
    );
    await vi.waitFor(() => expect(inFlightGet).toHaveBeenCalledTimes(2));
    for (const resolver of fetchResolvers) resolver(Response.json(ors));
    const [first, second] = await Promise.all([firstPromise, secondPromise]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(first.headers.get("cache-control")).toBe("private, no-store");
    expect(second.headers.get("cache-control")).toBe("private, no-store");
    expect(second.headers.get("x-tokyo-pace-cache")).toBe("deduplicated");
  });
});

describe("Worker status, version and safe logging", () => {
  it("health/status/versionはORSを呼ばず安全な公開情報とrequestIdだけを返す", async () => {
    const fetchImpl = vi.fn(async () => {
        throw new Error("must not call");
      });
    const dependencies = isolatedDependencies({
      fetchImpl: fetchImpl as typeof fetch,
      nowDate: () => new Date("2026-07-24T00:00:00.000Z"),
    });
    const env = environment({
      BUILD_COMMIT: "abc123",
      BUILD_TIMESTAMP: "2026-07-24T00:00:00.000Z",
      CF_VERSION_METADATA: {
        id: "worker-v1",
        tag: "production-v1-rc",
        timestamp: "2026-07-24T01:02:03.000Z",
      },
      DATA_MANIFEST_VERSION: "1",
    });
    const health = await handleWorkerRequest(new Request("https://example.test/api/health"), env, dependencies);
    const status = await handleWorkerRequest(new Request("https://example.test/api/status"), env, dependencies);
    const version = await handleWorkerRequest(new Request("https://example.test/api/version"), env, dependencies);
    expect(await jsonBody(health)).toEqual({
      status: "ok",
      service: "TOKYO PACE",
      requestId: "request-test-1",
    });
    const statusText = await status.text();
    expect(JSON.parse(statusText)).toMatchObject({
      serviceStatus: expect.stringMatching(/no_known_degradation|degraded/),
      statusScope: "observed_worker_and_bound_resources",
      authoritative: false,
      environment: "preview",
      appVersion: "1.0.0",
      deploymentVersion: "worker-v1",
      versionMetadata: {
        id: "worker-v1",
        tag: "production-v1-rc",
        timestamp: "2026-07-24T01:02:03.000Z",
        source: "cloudflare_version_metadata",
      },
      dataManifestVersion: "1",
      dataFreshness: { state: expect.any(String), counts: expect.any(Object) },
      orsCircuitState: "closed",
      circuit: {
        state: "closed",
        scope: "local_edge_instance",
        authoritative: false,
      },
      cache: {
        scope: "local_edge_instance",
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
          configured: false,
          scope: "cloudflare_rate_limit_namespace",
          authoritative: false,
        },
        isolateFallback: {
          enabled: true,
          scope: "local_edge_instance",
          authoritative: false,
        },
        identity: {
          preferred: "browser_session_anonymous_id",
          fallback: "temporary_salted_ip_hash",
          metricsScope: "local_edge_instance",
          rawIpRetained: false,
        },
      },
    });
    expect(await jsonBody(version)).toMatchObject({
      appVersion: "1.0.0",
      gitCommit: "abc123",
      buildTimestamp: "2026-07-24T00:00:00.000Z",
      workerVersionId: "worker-v1",
      versionMetadata: {
        id: "worker-v1",
        tag: "production-v1-rc",
        timestamp: "2026-07-24T01:02:03.000Z",
        source: "cloudflare_version_metadata",
      },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(statusText).not.toContain("secret-value");
  });

  it("Version Metadata欠落時はlocal fallbackを明示し非localではunavailableを返す", async () => {
    const localResponse = await handleWorkerRequest(
      new Request("https://example.test/api/version"),
      {
        APP_ENV: "local",
        CF_VERSION_METADATA: {
          id: "local-runtime-placeholder",
          tag: "should-not-be-public",
          timestamp: "2026-07-24T01:02:03.000Z",
        },
      },
      isolatedDependencies(),
    );
    const previewResponse = await handleWorkerRequest(
      new Request("https://example.test/api/version"),
      { APP_ENV: "preview" },
      isolatedDependencies(),
    );
    expect(await jsonBody(localResponse)).toMatchObject({
      workerVersionId: "local",
      versionMetadata: {
        id: "local",
        tag: "local",
        timestamp: null,
        source: "local_fallback",
      },
    });
    expect(await jsonBody(previewResponse)).toMatchObject({
      workerVersionId: "unavailable",
      versionMetadata: {
        id: "unavailable",
        tag: null,
        timestamp: null,
        source: "metadata_unavailable",
      },
    });
  });

  it("statusはCloudflare bindingとisolate fallbackを別scopeとして示す", async () => {
    const metrics = { ipFallbackUseCount: 4 };
    const response = await handleWorkerRequest(
      new Request("https://example.test/api/status"),
      environment({
        ROUTE_RATE_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
      }),
      isolatedDependencies({
        rateLimitMetrics: metrics,
        nowDate: () => new Date("2026-07-24T00:00:00.000Z"),
      }),
    );
    expect(await jsonBody(response)).toMatchObject({
      statusScope: "observed_worker_and_bound_resources",
      authoritative: false,
      rateLimiter: {
        scope: "bound_namespace_with_local_edge_fallback",
        authoritative: false,
        cloudflareBinding: {
          configured: true,
          scope: "cloudflare_rate_limit_namespace",
          authoritative: true,
        },
        isolateFallback: {
          scope: "local_edge_instance",
          authoritative: false,
        },
        identity: {
          ipFallbackUseCount: 4,
          metricsScope: "local_edge_instance",
          rawIpRetained: false,
        },
      },
    });
  });

  it("statusでopen circuitを内部情報なしに示す", async () => {
    const circuitBreakers = createProfileCircuitBreakers(1, 30_000);
    circuitBreakers.standard.recordFailure(1_000);
    const response = await handleWorkerRequest(
      new Request("https://example.test/api/status"),
      environment(),
      isolatedDependencies({
        circuitBreakers,
        nowMilliseconds: () => 1_001,
        nowDate: () => new Date("2026-07-24T00:00:00.000Z"),
      }),
    );
    expect(await jsonBody(response)).toMatchObject({
      serviceStatus: "degraded",
      orsCircuitState: "open",
      warnings: expect.arrayContaining([expect.stringContaining("一時的に抑制")]),
    });
  });

  it("構造化ログにSecret、headers、本文、自由文、正確な座標を出さない", async () => {
    const records: string[] = [];
    const response = await handleRouteRequest(
      apiRequest(
        { ...body, freeText: "利用者の自由入力です" },
        {
          authorization: "Bearer browser-secret",
          cookie: "session=private",
        },
      ),
      environment({ OPENROUTESERVICE_API_KEY: "test-placeholder-key" }),
      isolatedDependencies({
        fetchImpl: vi.fn(async () => Response.json(ors)) as typeof fetch,
        logger: createStructuredLogger((record) => records.push(record)),
      }),
    );
    expect(response.status).toBe(200);
    const serialized = records.join("\n");
    expect(serialized).not.toContain("test-placeholder-key");
    expect(serialized).not.toContain("browser-secret");
    expect(serialized).not.toContain("session=private");
    expect(serialized).not.toContain("利用者の自由入力");
    expect(serialized).not.toContain(String(body.origin.latitude));
    expect(serialized).not.toContain(String(body.origin.longitude));
    expect(JSON.parse(records[0])).toMatchObject({
      event: "route.request.completed",
      requestId: "request-test-1",
      route: "/api/routes",
      method: "POST",
      status: 200,
      appVersion: "1.0.0",
    });
  });

  it("APIキーなしでもSecret名、stack、内部パスを公開しない", async () => {
    const response = await handleRouteRequest(
      apiRequest(),
      { APP_ENV: "production" },
      isolatedDependencies(),
    );
    const serialized = await response.text();
    expect(response.status).toBe(503);
    expect(serialized).not.toContain("OPENROUTESERVICE_API_KEY");
    expect(serialized).not.toContain("/home/");
    expect(serialized).not.toContain("stack");
  });

  it("metadata endpointはGET以外を拒否する", async () => {
    const response = await handleWorkerRequest(
      new Request("https://example.test/api/version", { method: "POST" }),
      environment(),
      isolatedDependencies(),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
  });
});

describe("Worker test helpers", () => {
  it("circuit test fixture can be injected without altering production singleton", () => {
    const circuits = createProfileCircuitBreakers(1, 10);
    expect(circuits.standard).toBeInstanceOf(CircuitBreaker);
    expect(circuits.step_avoiding).not.toBe(circuits.standard);
  });
});
