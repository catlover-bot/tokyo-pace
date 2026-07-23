export const REPRESENTATIVE_DYNAMIC_ROUTE_PROFILES: readonly [
  "standard",
  "step_avoiding",
  "wheelchair_profile",
];

export type RepresentativeDynamicRoute = {
  id: "standard" | "step_avoiding" | "wheelchair_profile";
  provider: "openrouteservice";
  profile: "standard" | "step_avoiding" | "wheelchair_profile";
  name: string;
  coordinates: [number, number][];
  distanceMeters: number;
  durationSeconds: number;
  durationMinutes: number;
  restSpotIds: string[];
  walkingSegments: Array<{
    id: string;
    name: string;
    distanceMeters: number;
    walkingMinutes: number;
    endsAtRestSpot: boolean;
    restSpotId: string | null;
  }>;
  steepSlopeCount: number;
  indoorRestCount: number;
  sourceAttribution: string;
  generatedAt: string;
  warnings: string[];
  isFallback: false;
};

export type RepresentativeDynamicRouteSnapshot = {
  schemaVersion: 1;
  snapshotId: string;
  routeSetKind: "representative_dynamic_snapshot";
  routingSchemaVersion: string;
  coordinateOrder: "latitude_longitude";
  request: {
    origin: { latitude: number; longitude: number };
    destination: { latitude: number; longitude: number };
    profiles: Array<"standard" | "step_avoiding" | "wheelchair_profile">;
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
  routes: RepresentativeDynamicRoute[];
};

export function validateRepresentativeDynamicRouteSnapshot(value: unknown): RepresentativeDynamicRouteSnapshot;
export function parseRepresentativeDynamicRouteSnapshot(text: string): RepresentativeDynamicRouteSnapshot;
