import type { DemoRoute } from "../types";

export const demoRoutes: DemoRoute[] = [
  { id: "standard", name: "通常ルート", durationMinutes: 14, distanceMeters: 1050, restSpotIds: [], steepSlopeCount: 1, indoorRestCount: 0,
    walkingSegments: [
      { id: "standard-full", name: "新宿駅西口から東京都庁", distanceMeters: 1050, walkingMinutes: 14, endsAtRestSpot: false, restSpotId: null }
    ],
    coordinates: [[35.69092,139.69917],[35.69062,139.69675],[35.69010,139.69435],[35.68945,139.69215]] },
  { id: "comfort", name: "安心ルート", durationMinutes: 20, distanceMeters: 1350, restSpotIds: ["park-bench","park-toilet","eco-gallery"], steepSlopeCount: 0, indoorRestCount: 1,
    walkingSegments: [
      { id: "comfort-to-gallery", name: "新宿駅西口から公共施設休憩候補", distanceMeters: 420, walkingMinutes: 6, endsAtRestSpot: true, restSpotId: "eco-gallery" },
      { id: "comfort-to-toilet", name: "公共施設休憩候補からトイレ候補", distanceMeters: 450, walkingMinutes: 7, endsAtRestSpot: true, restSpotId: "park-toilet" },
      { id: "comfort-to-destination", name: "公園休憩候補を経て東京都庁", distanceMeters: 480, walkingMinutes: 7, endsAtRestSpot: true, restSpotId: "park-bench" }
    ],
    coordinates: [[35.69092,139.69917],[35.69105,139.69550],[35.69018,139.68858],[35.68955,139.68845],[35.68908,139.68925],[35.68945,139.69215]] }
];
