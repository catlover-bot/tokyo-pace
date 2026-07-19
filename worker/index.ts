import { buildOrsRequest, buildRouteCacheKey, MAX_ROUTE_REQUEST_BYTES, normalizeOrsResponse, ORS_TIMEOUT_MILLISECONDS, routeProfiles, RouteValidationError, ROUTE_CACHE_TTL_SECONDS, validateRouteSearchRequest } from "../src/domain/routing";

type Env = { OPENROUTESERVICE_API_KEY?: string };
type CacheLike = { match(request: Request): Promise<Response | undefined>; put(request: Request, response: Response): Promise<void> };
type Dependencies = { fetchImpl?: typeof fetch; cache?: CacheLike | null; now?: () => string; timeoutMilliseconds?: number };
const json = (value: unknown, status = 200, headers: HeadersInit = {}) => Response.json(value, { status, headers: { "cache-control": "no-store", ...headers } });

async function cacheRequest(request: unknown) {
  const bytes = new TextEncoder().encode(buildRouteCacheKey(request as ReturnType<typeof validateRouteSearchRequest>));
  const digest = await crypto.subtle.digest("SHA-256", bytes); const hash = [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, "0")).join("");
  return new Request(`https://tokyo-pace.internal/api/routes-cache/${hash}`);
}

async function requestOrs(apiKey: string, routeRequest: ReturnType<typeof validateRouteSearchRequest>, profile: (typeof routeProfiles)[number], fetchImpl: typeof fetch, generatedAt: string, timeoutMilliseconds: number) {
  const request = buildOrsRequest(routeRequest, profile); const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMilliseconds);
  try {
    const response = await fetchImpl(`https://api.heigit.org/openrouteservice/v2/directions/${request.profile}/geojson`, { method: "POST", headers: { Authorization: apiKey, "content-type": "application/json" }, body: JSON.stringify(request.body), signal: controller.signal });
    if (!response.ok) { if (response.status === 401 || response.status === 403) throw new RouteValidationError("経路サービスの認証設定を確認できません。", 502); if (response.status === 429) throw new RouteValidationError("経路サービスが混雑しています。時間をおいて再試行してください。", 503); if (response.status >= 500) throw new RouteValidationError("経路サービスで障害が発生しています。", 502); throw new RouteValidationError("指定条件の経路候補が見つかりませんでした。", 422); }
    return normalizeOrsResponse(await response.json(), profile, generatedAt);
  } catch (error) {
    if (error instanceof RouteValidationError) throw error;
    if (controller.signal.aborted) throw new RouteValidationError("経路サービスの応答がタイムアウトしました。", 504);
    throw new RouteValidationError("経路サービスへ接続できませんでした。", 502);
  } finally { clearTimeout(timer); }
}

export async function handleRouteRequest(request: Request, env: Env, dependencies: Dependencies = {}): Promise<Response> {
  if (request.method !== "POST") return json({ error: "POSTメソッドを使用してください。" }, 405, { Allow: "POST" });
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return json({ error: "Content-Typeはapplication/jsonを指定してください。" }, 400);
  const declaredLength = Number(request.headers.get("content-length") ?? 0); if (declaredLength > MAX_ROUTE_REQUEST_BYTES) return json({ error: "リクエストサイズが上限を超えています。" }, 413);
  const text = await request.text(); if (new TextEncoder().encode(text).byteLength > MAX_ROUTE_REQUEST_BYTES) return json({ error: "リクエストサイズが上限を超えています。" }, 413);
  let input: unknown; try { input = JSON.parse(text); } catch { return json({ error: "JSON形式が不正です。" }, 400); }
  try {
    const routeRequest = validateRouteSearchRequest(input); const cache = dependencies.cache ?? null; const key = await cacheRequest(routeRequest);
    const cached = await cache?.match(key); if (cached) return new Response(cached.body, cached);
    if (!env.OPENROUTESERVICE_API_KEY) return json({ error: "経路サービスは現在利用できません。固定デモルートを選択できます。" }, 503);
    const generatedAt = dependencies.now?.() ?? new Date().toISOString(); const fetchImpl = dependencies.fetchImpl ?? fetch;
    const routes = await Promise.all(routeProfiles.map((profile) => requestOrs(env.OPENROUTESERVICE_API_KEY!, routeRequest, profile, fetchImpl, generatedAt, dependencies.timeoutMilliseconds ?? ORS_TIMEOUT_MILLISECONDS)));
    const response = json({ routes, source: "openrouteservice", generatedAt }, 200, { "cache-control": `public, max-age=${ROUTE_CACHE_TTL_SECONDS}` });
    if (cache) await cache.put(key, response.clone()); return response;
  } catch (error) { return error instanceof RouteValidationError ? json({ error: error.message }, error.status) : json({ error: "経路処理中に予期しないエラーが発生しました。" }, 500); }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") return json({ status: "ok", service: "TOKYO PACE" });
    if (url.pathname === "/api/routes") return handleRouteRequest(request, env, { cache: typeof caches === "undefined" ? null : (caches as unknown as { default: CacheLike }).default });
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
