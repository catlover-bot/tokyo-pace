import type { DemoRoute } from "../types";

export const demoRoutes: DemoRoute[] = [
  { id: "standard", name: "通常ルート", durationMinutes: 14, distanceMeters: 1050, restSpotIds: [], maxContinuousWalkingMinutes: 14, toiletAvailable: false, steepSlopeCount: 1, indoorRestCount: 0,
    coordinates: [[35.69092,139.69917],[35.69062,139.69675],[35.69010,139.69435],[35.68945,139.69215]] },
  { id: "comfort", name: "安心ルート", durationMinutes: 20, distanceMeters: 1350, restSpotIds: ["park-bench","park-toilet","eco-gallery"], maxContinuousWalkingMinutes: 7, toiletAvailable: true, steepSlopeCount: 0, indoorRestCount: 1,
    coordinates: [[35.69092,139.69917],[35.69105,139.69550],[35.69018,139.68858],[35.68955,139.68845],[35.68908,139.68925],[35.68945,139.69215]] }
];
