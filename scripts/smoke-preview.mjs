import path from "node:path";
import { fileURLToPath } from "node:url";

const POLICY_PATHS = ["/privacy", "/terms", "/data-policy", "/accessibility"];
const ROUTE_PROFILES = ["standard", "step_avoiding", "wheelchair_profile"];
const LIVE_ROUTE_REQUEST = {
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

function invariant(condition, message) {
  if (!condition) throw new Error(`preview smoke failed: ${message}`);
}

export function normalizePreviewUrl(value) {
  const url = new URL(value);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  invariant(url.protocol === "https:" || (local && url.protocol === "http:"), "preview URLはHTTPSで指定してください");
  invariant(url.username === "" && url.password === "", "preview URLに認証情報を含めないでください");
  invariant(url.search === "" && url.hash === "", "preview URLにqueryまたはfragmentを含めないでください");
  return url.origin;
}

const json = async (response, label) => {
  const contentType = response.headers.get("content-type") ?? "";
  invariant(contentType.includes("application/json"), `${label}がJSONではありません`);
  try {
    return await response.json();
  } catch {
    throw new Error(`preview smoke failed: ${label}のJSONを解析できません`);
  }
};

function unsafeResponsePath(value, prefix = "$") {
  if (!value || typeof value !== "object") return null;
  for (const [key, nested] of Object.entries(value)) {
    if (/^(?:stack|latitude|longitude|coordinates|apiKey|secret)$/iu.test(key)) return `${prefix}.${key}`;
    const child = unsafeResponsePath(nested, `${prefix}.${key}`);
    if (child) return child;
  }
  return null;
}

function internalResponsePath(value, prefix = "$") {
  if (!value || typeof value !== "object") return null;
  for (const [key, nested] of Object.entries(value)) {
    if (/^(?:stack|apiKey|secret)$/iu.test(key)) return `${prefix}.${key}`;
    const child = internalResponsePath(nested, `${prefix}.${key}`);
    if (child) return child;
  }
  return null;
}

export function assertNoInternalSecrets(payload, label) {
  const serialized = JSON.stringify(payload);
  invariant(!serialized.includes("OPENROUTESERVICE_API_KEY"), `${label}にSecret名があります`);
  invariant(!/-----BEGIN [A-Z ]*PRIVATE KEY-----|Bearer\s+[A-Za-z0-9._~-]{16,}/u.test(serialized), `${label}にcredential形式があります`);
  invariant(!internalResponsePath(payload), `${label}に内部情報があります`);
}

export function assertSafePublicPayload(payload, label) {
  const serialized = JSON.stringify(payload);
  assertNoInternalSecrets(payload, label);
  invariant(!unsafeResponsePath(payload), `${label}に内部情報または座標keyがあります`);
  invariant(!serialized.includes("35.6909") && !serialized.includes("139.6992"), `${label}に入力座標が反射されています`);
}

function assertRequestIdHeaders(response, payload, label) {
  const headerRequestId = response.headers.get("x-request-id");
  invariant(typeof headerRequestId === "string" && headerRequestId.length > 0, `${label}にx-request-idがありません`);
  invariant(payload.requestId === headerRequestId, `${label}のrequestIdがheaderと一致しません`);
}

function assertMetadataApiHeaders(response, payload, label) {
  assertRequestIdHeaders(response, payload, label);
  invariant(response.headers.get("cache-control")?.includes("no-store"), `${label}のCache-Controlがno-storeではありません`);
}

function assertRouteApiHeaders(response, payload, label) {
  assertRequestIdHeaders(response, payload, label);
  invariant(
    /^private,\s*no-store$/u.test(response.headers.get("cache-control") ?? ""),
    `${label}の公開Cache-Controlがprivate,no-storeではありません`,
  );
}

function validateRouteEntries(routes) {
  invariant(Array.isArray(routes), "routesが配列ではありません");
  for (const route of routes) {
    invariant(typeof route?.id === "string" && route.id.length > 0, "route idがありません");
    invariant(typeof route?.name === "string" && route.name.length > 0, "route nameがありません");
    invariant(ROUTE_PROFILES.includes(route?.profile), "route profileが不正です");
    invariant(Number.isFinite(route?.distanceMeters) && route.distanceMeters > 0, "route距離が不正です");
    invariant(Number.isFinite(route?.durationMinutes) && route.durationMinutes > 0, "route時間が不正です");
    invariant(Array.isArray(route?.coordinates) && route.coordinates.length >= 2, "route座標列がありません");
    invariant(Array.isArray(route?.walkingSegments) && route.walkingSegments.length > 0, "walkingSegmentsがありません");
  }
}

function validateFullRouteContract(payload) {
  validateRouteEntries(payload?.routes);
  const profiles = payload.routes.map(({ profile }) => profile).sort();
  invariant(JSON.stringify(profiles) === JSON.stringify([...ROUTE_PROFILES].sort()), "mock正常routesが3 profileではありません");
  invariant(Array.isArray(payload.missingProfiles) && payload.missingProfiles.length === 0, "mock正常routesに欠落profileがあります");
}

function validatePartialRouteContract(payload) {
  validateRouteEntries(payload?.routes);
  invariant(payload.routes.length === 2, "mock partial routesが2件ではありません");
  invariant(Array.isArray(payload.missingProfiles) && payload.missingProfiles.length === 1, "mock partialの欠落profileが1件ではありません");
  invariant(ROUTE_PROFILES.includes(payload.missingProfiles[0]?.profile), "mock partialのprofileが不正です");
  invariant(Array.isArray(payload.warnings) && payload.warnings.length > 0, "mock partialにwarningがありません");
}

const mockRouteResponse = (payload, requestId) => Response.json(
  { ...payload, requestId },
  {
    headers: {
      "cache-control": "private, no-store",
      "x-request-id": requestId,
    },
  },
);

const mockRoute = (profile) => ({
  id: `mock-${profile}`,
  name: `mock ${profile}`,
  profile,
  coordinates: [[35.6909, 139.6992], [35.6895, 139.6922]],
  durationMinutes: 12,
  distanceMeters: 1_000,
  restSpotIds: [],
  walkingSegments: [{
    id: `mock-${profile}-segment`,
    name: "mock segment",
    distanceMeters: 1_000,
    walkingMinutes: 12,
    endsAtRestSpot: false,
    restSpotId: null,
  }],
  steepSlopeCount: 0,
  indoorRestCount: 0,
});

export const deterministicMockRouteFetch = async (request) => {
  invariant(request instanceof Request, "mock routesがRequestではありません");
  invariant(request.method === "POST", "mock routesがPOSTではありません");
  invariant(request.headers.get("content-type") === "application/json", "mock routesがJSONではありません");
  const scenario = request.headers.get("x-tokyo-pace-smoke-scenario");
  if (scenario === "partial") {
    return mockRouteResponse({
      routes: ROUTE_PROFILES.slice(0, 2).map(mockRoute),
      missingProfiles: [{
        profile: "wheelchair_profile",
        code: "UPSTREAM_UNAVAILABLE",
        retryable: true,
      }],
      warnings: ["一部の経路候補を取得できませんでした。"],
    }, "request-mock-partial");
  }
  return mockRouteResponse({
    routes: ROUTE_PROFILES.map(mockRoute),
    missingProfiles: [],
    warnings: [],
  }, "request-mock-full");
};

export async function verifyMockRouteContracts(fetchImpl = deterministicMockRouteFetch) {
  const request = (scenario) => new Request("https://mock.invalid/api/routes", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(scenario ? { "x-tokyo-pace-smoke-scenario": scenario } : {}),
    },
    body: JSON.stringify(LIVE_ROUTE_REQUEST),
  });
  const fullResponse = await fetchImpl(request());
  invariant(fullResponse.status === 200, "mock正常routesがHTTP 200ではありません");
  const fullPayload = await json(fullResponse, "mock-normal-routes");
  assertRouteApiHeaders(fullResponse, fullPayload, "mock-normal-routes");
  assertNoInternalSecrets(fullPayload, "mock-normal-routes");
  validateFullRouteContract(fullPayload);

  const partialResponse = await fetchImpl(request("partial"));
  invariant(partialResponse.status === 200, "mock partial routesがHTTP 200ではありません");
  const partialPayload = await json(partialResponse, "mock-partial-routes");
  assertRouteApiHeaders(partialResponse, partialPayload, "mock-partial-routes");
  assertNoInternalSecrets(partialPayload, "mock-partial-routes");
  validatePartialRouteContract(partialPayload);
}

async function fetchWithTimeout(fetchImpl, input, init, timeoutMilliseconds) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMilliseconds);
  try {
    return await fetchImpl(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyOsmAttribution(fetchRequest, baseUrl, indexHtml) {
  const pending = [];
  const visited = new Set();
  const scriptPattern = /<script[^>]+src=["']([^"']+\.js)["']/giu;
  for (const match of indexHtml.matchAll(scriptPattern)) {
    pending.push(new URL(match[1], `${baseUrl}/`).href);
  }
  let combined = indexHtml;
  while (pending.length > 0 && visited.size < 40) {
    const url = pending.shift();
    if (!url || visited.has(url) || new URL(url).origin !== baseUrl) continue;
    visited.add(url);
    const response = await fetchRequest(url);
    if (!response.ok) continue;
    const source = await response.text();
    combined += source;
    const importPattern = /["'`](?:\.\/|\/)?([A-Za-z0-9_./-]+\.js)["'`]/gu;
    for (const match of source.matchAll(importPattern)) {
      pending.push(new URL(match[1], url).href);
    }
  }
  invariant(
    /OpenStreetMap|openstreetmap\.org\/copyright/iu.test(combined),
    "OSM attributionを配信assetから確認できません",
  );
  for (const [page, marker] of [
    ["/privacy", "プライバシー"],
    ["/terms", "利用条件"],
    ["/data-policy", "データ方針"],
    ["/accessibility", "アクセシビリティ"],
  ]) {
    invariant(combined.includes(marker), `${page}の内容を配信assetから確認できません`);
  }
}

export async function runPreviewSmoke({
  previewUrl,
  fetchImpl = (...arguments_) => globalThis.fetch(...arguments_),
  mockRouteFetch = deterministicMockRouteFetch,
  liveOrs = false,
  timeoutMilliseconds = 10_000,
  output = console.log,
}) {
  const baseUrl = normalizePreviewUrl(previewUrl);
  const checks = [];
  const fetchRequest = (pathOrUrl, init) => fetchWithTimeout(
    fetchImpl,
    pathOrUrl.startsWith("http") ? pathOrUrl : `${baseUrl}${pathOrUrl}`,
    init,
    timeoutMilliseconds,
  );

  for (const endpoint of ["/api/health", "/api/status", "/api/version"]) {
    const response = await fetchRequest(endpoint);
    invariant(response.status === 200, `${endpoint}がHTTP 200ではありません`);
    const payload = await json(response, endpoint);
    assertMetadataApiHeaders(response, payload, endpoint);
    assertSafePublicPayload(payload, endpoint);
    checks.push(endpoint);
  }

  let indexHtml = "";
  for (const pagePath of ["/", ...POLICY_PATHS]) {
    const response = await fetchRequest(pagePath);
    invariant(response.status === 200, `${pagePath}がHTTP 200ではありません`);
    const contentType = response.headers.get("content-type") ?? "";
    invariant(contentType.includes("text/html"), `${pagePath}がHTMLではありません`);
    const source = await response.text();
    invariant(/<html|<!doctype html/iu.test(source), `${pagePath}にHTML shellがありません`);
    if (pagePath === "/") indexHtml = source;
    checks.push(pagePath);
  }
  await verifyOsmAttribution(fetchRequest, baseUrl, indexHtml);
  checks.push("osm-attribution");

  const notFoundResponse = await fetchRequest("/api/__preview_smoke_not_found__");
  invariant(notFoundResponse.status === 404, "未知のAPIが404ではありません");
  const notFound = await json(notFoundResponse, "404");
  assertMetadataApiHeaders(notFoundResponse, notFound, "404");
  assertSafePublicPayload(notFound, "404");
  checks.push("404");

  const methodResponse = await fetchRequest("/api/routes");
  invariant(methodResponse.status === 405, "GET /api/routesが405ではありません");
  const methodError = await json(methodResponse, "method");
  assertMetadataApiHeaders(methodResponse, methodError, "method");
  assertSafePublicPayload(methodError, "method");
  checks.push("method");

  const contentTypeResponse = await fetchRequest("/api/routes", {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: "{}",
  });
  invariant(contentTypeResponse.status === 400, "非JSON /api/routesが400ではありません");
  const contentTypeError = await json(contentTypeResponse, "content-type");
  assertMetadataApiHeaders(contentTypeResponse, contentTypeError, "content-type");
  assertSafePublicPayload(contentTypeError, "content-type");
  checks.push("content-type");

  await verifyMockRouteContracts(mockRouteFetch);
  checks.push("mock-three-profile-contract", "mock-partial-profile-contract");

  if (liveOrs) {
    const liveResponse = await fetchRequest("/api/routes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(LIVE_ROUTE_REQUEST),
    });
    invariant(liveResponse.status === 200, "live ORS経路検索がHTTP 200ではありません");
    const livePayload = await json(liveResponse, "live-routes");
    assertRouteApiHeaders(liveResponse, livePayload, "live-routes");
    assertNoInternalSecrets(livePayload, "live-routes");
    validateFullRouteContract(livePayload);
    checks.push("live-ors-one-request");
  } else {
    output("routes正常系・一部profile失敗は決定的mock契約で確認（実ORS未呼出し）");
  }

  for (const check of checks) output(`smoke ok: ${check}`);
  return checks;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const previewUrl = process.argv.slice(2).find((value) => !value.startsWith("--"));
  if (!previewUrl) {
    console.error("usage: npm run smoke:preview -- <PREVIEW_URL> [--live-ors]");
    process.exitCode = 2;
  } else {
    try {
      const checks = await runPreviewSmoke({
        previewUrl,
        liveOrs: process.argv.includes("--live-ors"),
      });
      console.log(`preview smoke成功: ${checks.length} checks`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  }
}
