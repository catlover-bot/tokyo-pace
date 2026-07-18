import type { RestSpot } from "../types";

const demoSource = { provider: "TOKYO PACE", datasetName: "デモ用推定データ", datasetUrl: null, resourceUrl: null, license: null, datasetUpdatedAt: null, retrievedAt: null, fieldVerifiedAt: null };

export const restSpots: RestSpot[] = [
  { id: "park-bench", name: "新宿中央公園 休憩候補", latitude: 35.68908, longitude: 139.68925, category: "park", address: null, seating: true, indoor: false, toiletAvailable: null, wheelchairAccessible: null, openingHours: null, officialToiletKind: null, source: demoSource, confidence: "estimated" },
  { id: "park-toilet", name: "新宿中央公園 トイレ候補", latitude: 35.68955, longitude: 139.68845, category: "toilet", address: null, seating: null, indoor: null, toiletAvailable: true, wheelchairAccessible: null, openingHours: null, officialToiletKind: null, source: demoSource, confidence: "estimated" },
  { id: "eco-gallery", name: "環境学習情報センター周辺 休憩候補", latitude: 35.69018, longitude: 139.68858, category: "public_facility", address: null, seating: null, indoor: true, toiletAvailable: null, wheelchairAccessible: null, openingHours: null, officialToiletKind: null, source: demoSource, confidence: "estimated" },
  { id: "tocho-plaza", name: "東京都庁 都民広場周辺", latitude: 35.68948, longitude: 139.69169, category: "public_facility", address: null, seating: null, indoor: false, toiletAvailable: null, wheelchairAccessible: null, openingHours: null, officialToiletKind: null, source: demoSource, confidence: "estimated" },
];
