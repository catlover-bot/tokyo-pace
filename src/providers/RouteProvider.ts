import type { DemoRoute, RouteSearchRequest } from "../types";

export interface RouteProvider { getRoutes(request: RouteSearchRequest, signal?: AbortSignal): Promise<DemoRoute[]>; }
