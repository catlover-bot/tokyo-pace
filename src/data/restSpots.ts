import type { RestSpot } from "../types";

export const restSpots: RestSpot[] = [
  { id: "park-bench", name: "新宿中央公園 休憩候補", latitude: 35.68908, longitude: 139.68925, category: "park", seating: true, indoor: false, toiletAvailable: null, wheelchairAccessible: null, openingHours: null, sourceName: "TOKYO PACEデモ用推定データ", sourceUrl: null, lastVerifiedAt: null, confidence: "estimated" },
  { id: "park-toilet", name: "新宿中央公園 トイレ候補", latitude: 35.68955, longitude: 139.68845, category: "toilet", seating: null, indoor: null, toiletAvailable: true, wheelchairAccessible: null, openingHours: null, sourceName: "TOKYO PACEデモ用推定データ", sourceUrl: null, lastVerifiedAt: null, confidence: "estimated" },
  { id: "eco-gallery", name: "環境学習情報センター周辺 休憩候補", latitude: 35.69018, longitude: 139.68858, category: "public_facility", seating: null, indoor: true, toiletAvailable: null, wheelchairAccessible: null, openingHours: null, sourceName: "TOKYO PACEデモ用推定データ", sourceUrl: null, lastVerifiedAt: null, confidence: "estimated" },
  { id: "tocho-plaza", name: "東京都庁 都民広場周辺", latitude: 35.68948, longitude: 139.69169, category: "public_facility", seating: null, indoor: false, toiletAvailable: null, wheelchairAccessible: null, openingHours: null, sourceName: "TOKYO PACEデモ用推定データ", sourceUrl: null, lastVerifiedAt: null, confidence: "estimated" }
];
