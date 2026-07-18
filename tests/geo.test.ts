import { describe, expect, it } from "vitest";
import { distancePointToRouteMeters, findOfficialToiletsNearRoute, haversineDistanceMeters, nearestOfficialToiletDistanceMeters, polylineLengthMeters, projectPointToRoute, sortToiletPlacesByRouteProgress } from "../src/domain/geo";
import { clusterOfficialToiletRecords } from "../src/domain/officialToiletQuality.mjs";
import type { RestSpot } from "../src/types";

const officialSpot = (id: string, latitude: number, longitude: number): RestSpot => ({
  id, name: id, latitude, longitude, address: null, category: "toilet", seating: null, indoor: null,
  toiletAvailable: true, wheelchairAccessible: null, openingHours: null, officialToiletKind: "public_toilet", confidence: "official",
  source: { provider: "新宿区", datasetName: "fixture", datasetUrl: null, resourceUrl: null, license: "CC BY", datasetUpdatedAt: null, retrievedAt: null, fieldVerifiedAt: null },
});

describe("ルート近傍距離", () => {
  it("2地点間距離をHaversine式で計算する", () => {
    expect(haversineDistanceMeters([35, 139], [35.001, 139])).toBeCloseTo(111.2, 0);
  });

  it("地点とルート折れ線の最短直線距離を計算する", () => {
    expect(distancePointToRouteMeters([35.001, 139.005], [[35, 139], [35, 139.01]])).toBeCloseTo(111.2, 0);
  });

  it("近傍にある公式トイレだけを距離順に抽出する", () => {
    const near = officialSpot("near", 35.0005, 139.005); const far = officialSpot("far", 35.01, 139.005);
    const estimated = { ...officialSpot("estimated", 35, 139.005), confidence: "estimated" as const };
    expect(findOfficialToiletsNearRoute([far, estimated, near], [[35, 139], [35, 139.01]], 100).map((spot) => spot.id)).toEqual(["near"]);
  });

  it("最寄り公式トイレまでの直線距離を導出する", () => {
    const toilets = [officialSpot("near", 35.0005, 139.005), officialSpot("far", 35.01, 139.005)];
    expect(nearestOfficialToiletDistanceMeters(toilets, [[35, 139], [35, 139.01]])).toBeCloseTo(55.6, 0);
  });

  it("折れ線の総距離と射影点までの進行距離を求める", () => {
    const route: [number, number][] = [[0, 0], [0, 0.01]];
    expect(polylineLengthMeters(route)).toBeCloseTo(1112, 0);
    const projection = projectPointToRoute([0.001, 0.005], route);
    expect(projection.projectedPoint).toEqual([0, 0.005]);
    expect(projection.routeProgressMeters).toBeCloseTo(556, 0);
  });

  it("候補地点をルート進行順とclusterIdで決定的に並べる", () => {
    const route: [number, number][] = [[0, 0], [0, 0.01]];
    const places = clusterOfficialToiletRecords([officialSpot("later", 0, 0.008), officialSpot("same-b", 0, 0.004), officialSpot("same-a", 0, 0.004)]);
    expect(sortToiletPlacesByRouteProgress(places, route).map(({ place }) => place.clusterId)).toEqual(["place-same-a", "place-later"]);
  });
});
