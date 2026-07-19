import { demoRoutes } from "../data/routes";
import type { RouteProvider } from "./RouteProvider";
import type { RouteSearchRequest } from "../types";

export class DemoRouteProvider implements RouteProvider {
  async getRoutes(request?: RouteSearchRequest) {
    void request;
    await new Promise((resolve) => setTimeout(resolve, 250));
    return structuredClone(demoRoutes).map((route) => ({ ...route, provider: "demo" as const, isFallback: true, sourceAttribution: "TOKYO PACE 固定デモデータ" }));
  }
}
