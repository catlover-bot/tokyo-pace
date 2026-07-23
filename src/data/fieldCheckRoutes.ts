import generated from "./generated/field-check-route-snapshot.json";
import type { DemoRoute, RouteProfile } from "../types";

export type FieldCheckRouteSnapshot = {
  schemaVersion: 1;
  snapshotId: string;
  routeSetKind: "representative_dynamic_snapshot";
  routingSchemaVersion: string;
  coordinateOrder: "latitude_longitude";
  request: {
    origin: { latitude: number; longitude: number };
    destination: { latitude: number; longitude: number };
    profiles: RouteProfile[];
  };
  source: {
    sourceType: "openstreetmap_route";
    provider: string;
    snapshotMethod: string;
    sourceUrl: string;
    capturedAt: string;
    license: string;
    attribution: string;
    usage: string;
  };
  routes: Array<DemoRoute & { profile: RouteProfile; provider: "openrouteservice"; isFallback: false }>;
};

export const fieldCheckRouteSnapshot = generated as unknown as FieldCheckRouteSnapshot;
export const representativeDynamicRoutes = fieldCheckRouteSnapshot.routes;
