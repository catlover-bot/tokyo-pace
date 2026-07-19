import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RouteSearchStatus } from "../src/components/RouteSearchStatus";
import { demoRoutes } from "../src/data/routes";
import { buildRouteComparisonViewModels } from "../src/domain/routeComparison";
import { selectRecommendedRoute } from "../src/domain/routeScore";
import { ROUTE_SEARCH_ERROR_MESSAGE, toRouteSearchErrorMessage } from "../src/domain/routeSearchError";
import { ApiRouteProvider } from "../src/providers/ApiRouteProvider";
import { DemoRouteProvider } from "../src/providers/DemoRouteProvider";
import type { DemoRoute, RouteProfile, RouteSearchRequest } from "../src/types";

const request: RouteSearchRequest = {
  origin: { latitude: 35.6909, longitude: 139.6992 },
  destination: { latitude: 35.6895, longitude: 139.6922 },
  preferences: { maxContinuousWalkingMinutes: 10, requireToilet: false, avoidSteepSlopes: false, preferIndoorRest: false, avoidSteps: true },
};
const profiles: RouteProfile[] = ["standard", "step_avoiding", "wheelchair_profile"];
const apiRoutes = (): DemoRoute[] => profiles.map((profile, index) => ({
  ...structuredClone(demoRoutes[index === 0 ? 0 : 1]),
  id: profile,
  name: `${profile}候補`,
  profile,
  provider: "openrouteservice",
  isFallback: false,
}));
const successfulResponse = () => Response.json({ routes: apiRoutes() });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ApiRouteProviderのブラウザfetch", () => {
  it("既定fetchで経路を取得できる", async () => {
    const fetchMock = vi.fn(async () => successfulResponse());
    vi.stubGlobal("fetch", fetchMock);
    const routes = await new ApiRouteProvider().getRoutes(request);
    expect(routes).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("生成後にglobalThis.fetchが変わっても正しい関数を呼ぶ", async () => {
    const provider = new ApiRouteProvider();
    const fetchMock = vi.fn(async () => successfulResponse());
    vi.stubGlobal("fetch", fetchMock);
    await expect(provider.getRoutes(request)).resolves.toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("mock fetchを注入できる", async () => {
    const fetchMock = vi.fn(async () => successfulResponse());
    const signal = new AbortController().signal;
    const routes = await new ApiRouteProvider("/mock/routes", fetchMock as typeof fetch).getRoutes(request, signal);
    expect(routes).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledWith("/mock/routes", expect.objectContaining({ method: "POST", signal }));
  });

  it("this bindingを必要とする疑似fetchも既定ラッパーから呼べる", async () => {
    let called = false;
    const contextualFetch = function (this: unknown) {
      if (this !== globalThis) throw new TypeError("Illegal invocation");
      called = true;
      return Promise.resolve(successfulResponse());
    } as typeof fetch;
    vi.stubGlobal("fetch", contextualFetch);
    await expect(new ApiRouteProvider().getRoutes(request)).resolves.toHaveLength(3);
    expect(called).toBe(true);
  });

  it("Illegal invocationを利用者向けUIへ表示しない", () => {
    const technicalError = new TypeError("Illegal invocation");
    expect(toRouteSearchErrorMessage(technicalError)).toBe(ROUTE_SEARCH_ERROR_MESSAGE);
    const html = renderToStaticMarkup(<RouteSearchStatus loading={false} error={technicalError.message} onRetry={() => undefined} onFallback={() => undefined} />);
    expect(html).toContain("経路候補を取得できませんでした。");
    expect(html).toContain(ROUTE_SEARCH_ERROR_MESSAGE);
    expect(html).not.toContain("Illegal invocation");
  });

  it("HTTP 200の3経路を既存の比較モデルへ渡す", async () => {
    const provider = new ApiRouteProvider("/mock/routes", vi.fn(async () => successfulResponse()) as typeof fetch);
    const routes = await provider.getRoutes(request);
    const ranked = selectRecommendedRoute(routes, request.preferences, [], []);
    const comparison = buildRouteComparisonViewModels(ranked, request.preferences);
    expect(comparison.routes).toHaveLength(3);
    expect(new Set(comparison.routes.map((model) => model.route.profile))).toEqual(new Set(profiles));
    expect(comparison.recommendedRouteId).toBe(ranked[0].id);
  });

  it("失敗後に同じproviderで再試行できる", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("Illegal invocation"))
      .mockResolvedValueOnce(successfulResponse());
    const provider = new ApiRouteProvider("/mock/routes", fetchMock as typeof fetch);
    await expect(provider.getRoutes(request)).rejects.toThrow("Illegal invocation");
    await expect(provider.getRoutes(request)).resolves.toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("API失敗後も固定デモへ切り替えられる", async () => {
    const apiProvider = new ApiRouteProvider("/mock/routes", vi.fn(async () => { throw new TypeError("Illegal invocation"); }) as typeof fetch);
    await expect(apiProvider.getRoutes(request)).rejects.toThrow();
    const fallbackRoutes = await new DemoRouteProvider().getRoutes(request);
    expect(fallbackRoutes).toHaveLength(2);
    expect(fallbackRoutes.every((route) => route.isFallback)).toBe(true);
    const html = renderToStaticMarkup(<RouteSearchStatus loading={false} error={ROUTE_SEARCH_ERROR_MESSAGE} onRetry={() => undefined} onFallback={() => undefined} />);
    expect(html).toContain("再試行");
    expect(html).toContain("固定デモルートを表示");
  });
});
