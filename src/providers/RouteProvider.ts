import type { DemoRoute } from "../types";

export interface RouteProvider { getRoutes(originId: string, destinationId: string): Promise<DemoRoute[]>; }
