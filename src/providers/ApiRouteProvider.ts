import type { DemoRoute, RouteSearchRequest } from "../types";
import type { RouteProvider } from "./RouteProvider";

export class RouteApiError extends Error { constructor(message: string, readonly status: number) { super(message); } }

export type FetchLike = typeof fetch;
export const defaultRouteFetch: FetchLike = (...args) => globalThis.fetch(...args);

export class ApiRouteProvider implements RouteProvider {
  constructor(private readonly endpoint = "/api/routes", private readonly fetchImpl: FetchLike = defaultRouteFetch) {}
  async getRoutes(request: RouteSearchRequest, signal?: AbortSignal): Promise<DemoRoute[]> {
    const response = await this.fetchImpl(this.endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request), signal });
    const body = await response.json().catch(() => null) as { routes?: DemoRoute[]; error?: string } | null;
    if (!response.ok) throw new RouteApiError(body?.error ?? "経路候補を取得できませんでした。", response.status);
    if (!body?.routes?.length) throw new RouteApiError("経路候補が見つかりませんでした。", 404);
    return body.routes;
  }
}
