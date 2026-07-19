import { describe, expect, it } from "vitest";
import { demoRoutes } from "../src/data/routes";
import {
  buildRouteAnalysisDownloads,
  buildRouteAnalysisGeoJson,
  buildRouteAnalysisSnapshot,
  OPENSTREETMAP_ATTRIBUTION,
  serializeRouteAnalysisCsv,
  serializeRouteAnalysisGeoJson,
} from "../src/domain/routeAnalysisExport";
import { evaluateRoute } from "../src/domain/routeScore";
import type { OpenDataManifest, RestCandidate, RoutePreferences } from "../src/types";

const generatedAt = "2026-07-19T03:04:05.000Z";
const preferences: RoutePreferences = { maxContinuousWalkingMinutes: 10, requireToilet: false, avoidSteepSlopes: false, preferIndoorRest: false };
const manifest: OpenDataManifest = {
  schemaVersion: 1,
  datasets: [
    { datasetId: "tokyo-drinking-stations", datasetUrl: "https://example.test/water", resourceUrl: "https://example.test/water.csv", retrievedAt: generatedAt, contentSha256: "water", byteSize: 10, normalizedRecordCount: 1, excludedRecordCount: 0, sourceUpdatedAt: null, encoding: "shift_jis", license: "CC BY" },
    { datasetId: "shinjuku-public", datasetUrl: "https://example.test/toilet", resourceUrl: "https://example.test/toilet.csv", retrievedAt: generatedAt, contentSha256: "toilet", byteSize: 10, normalizedRecordCount: 1, excludedRecordCount: 0, sourceUpdatedAt: null, encoding: "utf-16le", license: "CC BY" },
    { datasetId: "tokyo-public-accessible", datasetUrl: "https://example.test/facility-toilet", resourceUrl: "https://example.test/facility-toilet.csv", retrievedAt: generatedAt, contentSha256: "facility-toilet", byteSize: 10, normalizedRecordCount: 1, excludedRecordCount: 0, sourceUpdatedAt: null, encoding: "shift_jis", license: "CC BY" },
    { datasetId: "tokyo-station-accessible", datasetUrl: "https://example.test/station-toilet", resourceUrl: "https://example.test/station-toilet.csv", retrievedAt: generatedAt, contentSha256: "station-toilet", byteSize: 10, normalizedRecordCount: 1, excludedRecordCount: 0, sourceUpdatedAt: null, encoding: "shift_jis", license: "CC BY" },
    { datasetId: "shinjuku-public-facilities", datasetUrl: "https://example.test/facility", resourceUrl: "https://example.test/facility.csv", retrievedAt: generatedAt, contentSha256: "facility", byteSize: 10, normalizedRecordCount: 1, excludedRecordCount: 0, sourceUpdatedAt: null, encoding: "utf-16le", license: "CC BY", provider: "新宿区", datasetName: "新宿区の公共施設情報", attribution: "新宿区『新宿区の公共施設情報』 (CC BY)" },
  ],
};
const source = {
  sourceDatasetId: "shinjuku-public-facilities",
  sourceRecordId: "facility-1",
  provider: "新宿区",
  datasetName: "新宿区の公共施設情報",
  datasetUrl: "https://example.test/facility",
  resourceUrl: "https://example.test/facility.csv",
  license: "CC BY",
  datasetUpdatedAt: null,
  fieldVerifiedAt: "2026-07-18T01:02:03.000Z",
};
const strictCandidate: RestCandidate = {
  id: "verified-facility-1",
  name: "現地確認fixture",
  latitude: 35.69062,
  longitude: 139.69675,
  address: "東京都新宿区西新宿",
  category: "verified_rest_spot",
  confidence: "confirmed",
  openingHours: null,
  indoor: true,
  seating: true,
  drinkingWaterAvailable: null,
  wheelchairAccessible: null,
  source,
};
const fieldVerifiedCandidate: RestCandidate = {
  ...strictCandidate,
  id: "verified-field-facility-1",
  fieldVerificationId: "fv-facility-1",
  officialSourceIds: ["shinjuku-public-facilities:facility-1"],
  source: {
    sourceDatasetId: "tokyo-pace-field-verification-rest-spots",
    sourceRecordId: "fv-facility-1",
    provider: "TOKYO PACE 現地確認",
    datasetName: "TOKYO PACE 休憩地点現地確認",
    datasetUrl: null,
    resourceUrl: null,
    license: null,
    datasetUpdatedAt: generatedAt,
    fieldVerifiedAt: generatedAt,
  },
};

function evaluated(candidates: RestCandidate[] = [strictCandidate]) {
  const route = {
    ...structuredClone(demoRoutes[0]),
    provider: "openrouteservice" as const,
    profile: "standard" as const,
    sourceAttribution: "© OpenStreetMap contributors / openrouteservice",
  };
  return evaluateRoute(route, preferences, [], candidates);
}

describe("TOKYO PACE経路分析データ", () => {
  it("必要な指標と空白区間の進行距離をCSVへ固定順で出力する", () => {
    const snapshot = buildRouteAnalysisSnapshot({ route: evaluated(), restCandidates: [strictCandidate], manifest, generatedAt });
    const csv = serializeRouteAnalysisCsv(snapshot);
    expect(csv.split("\n")[0]).toContain("routeId,profile,routeDistanceMeters,durationMinutes,maxContinuousWalkingMinutes");
    expect(csv).toContain("restGapStartProgressMeters");
    expect(csv).toContain("theoreticalRestInsertionLongitude");
    expect(csv).toContain("data/generated/open-data-manifest.json");
    expect(csv.endsWith("\n")).toBe(true);
  });

  it("同一入力からCSVとGeoJSONをバイト単位で同一に生成する", () => {
    const input = { route: evaluated(), restCandidates: [strictCandidate], manifest, generatedAt };
    expect(buildRouteAnalysisDownloads(input)).toEqual(buildRouteAnalysisDownloads(input));
    expect(buildRouteAnalysisDownloads(input).csv).toBe(buildRouteAnalysisDownloads(input).csv);
    expect(buildRouteAnalysisDownloads(input).geoJson).toBe(buildRouteAnalysisDownloads(input).geoJson);
  });

  it("候補とmanifestの入力順が変わっても出力順を維持する", () => {
    const second = { ...strictCandidate, id: "verified-facility-2", name: "別の確認地点", latitude: 35.6901, longitude: 139.69435 };
    const route = evaluated([strictCandidate, second]);
    const forward = buildRouteAnalysisDownloads({ route, restCandidates: [strictCandidate, second], manifest, generatedAt });
    const reversedManifest = { ...manifest, datasets: [...manifest.datasets].reverse() };
    const reverse = buildRouteAnalysisDownloads({ route, restCandidates: [second, strictCandidate], manifest: reversedManifest, generatedAt });
    expect(reverse.csv).toBe(forward.csv);
    expect(reverse.geoJson).toBe(forward.geoJson);
  });

  it("GeoJSONの座標をlongitude, latitude順で出力する", () => {
    const snapshot = buildRouteAnalysisSnapshot({ route: evaluated(), restCandidates: [strictCandidate], manifest, generatedAt });
    const geoJson = buildRouteAnalysisGeoJson(snapshot);
    const route = geoJson.features.find((feature) => feature.properties.featureType === "selected_route")!;
    expect(route.geometry.coordinates[0]).toEqual([demoRoutes[0].coordinates[0][1], demoRoutes[0].coordinates[0][0]]);
    const point = geoJson.features.find((feature) => feature.properties.featureType === "strict_rest_candidate")!;
    expect(point.geometry.coordinates).toEqual([strictCandidate.longitude, strictCandidate.latitude]);
  });

  it("選択経路・3種の空白・厳格休憩地点・理論候補をFeatureとして保持する", () => {
    const geoJson = buildRouteAnalysisGeoJson(buildRouteAnalysisSnapshot({ route: evaluated(), restCandidates: [strictCandidate], manifest, generatedAt }));
    expect(geoJson.features.map((feature) => feature.properties.featureType)).toEqual([
      "selected_route", "rest_gap", "public_toilet_gap", "drinking_water_gap", "strict_rest_candidate", "theoretical_rest_insertion",
    ]);
  });

  it("OSM経路とCC BY施設を別Featureの出典・ライセンスとして保持する", () => {
    const geoJson = buildRouteAnalysisGeoJson(buildRouteAnalysisSnapshot({ route: evaluated(), restCandidates: [strictCandidate], manifest, generatedAt }));
    const route = geoJson.features.find((feature) => feature.properties.featureType === "selected_route")!;
    const rest = geoJson.features.find((feature) => feature.properties.featureType === "strict_rest_candidate")!;
    expect(route.properties.license).toContain("ODbL");
    expect(route.properties.attribution).toContain(OPENSTREETMAP_ATTRIBUTION);
    expect(rest.properties.license).toBe("CC BY");
    expect(rest.properties.provider).toBe("新宿区");
    expect(route.properties.license).not.toBe(rest.properties.license);
  });

  it("公衆トイレ空白の根拠へ施設内・駅内設備情報を混在させない", () => {
    const geoJson = buildRouteAnalysisGeoJson(buildRouteAnalysisSnapshot({ route: evaluated(), restCandidates: [strictCandidate], manifest, generatedAt }));
    const gap = geoJson.features.find((feature) => feature.properties.featureType === "public_toilet_gap")!;
    expect(gap.properties.sourceDatasetIds).toContain("shinjuku-public");
    expect(gap.properties.sourceDatasetIds).not.toContain("tokyo-public-accessible");
    expect(gap.properties.sourceDatasetIds).not.toContain("tokyo-station-accessible");
  });

  it("現地確認地点Featureに現地確認と元公式CC BYの両出典を保持する", () => {
    const route = evaluated([fieldVerifiedCandidate]);
    const geoJson = buildRouteAnalysisGeoJson(buildRouteAnalysisSnapshot({ route, restCandidates: [fieldVerifiedCandidate], manifest, generatedAt }));
    const rest = geoJson.features.find((feature) => feature.properties.featureType === "strict_rest_candidate")!;
    expect(rest.properties.sourceDatasetIds).toEqual(expect.arrayContaining([
      "tokyo-pace-field-verification-rest-spots",
      "shinjuku-public-facilities",
    ]));
    expect(rest.properties.sourceLicenses).toEqual(expect.arrayContaining([
      "CC BY",
      expect.stringContaining("未設定"),
    ]));
    expect(rest.properties.attribution).toContain("TOKYO PACE 現地確認");
    expect(rest.properties.attribution).toContain("新宿区");
    expect(rest.properties.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceDatasetId: "tokyo-pace-field-verification-rest-spots" }),
      expect.objectContaining({ sourceDatasetId: "shinjuku-public-facilities", license: "CC BY" }),
    ]));
  });

  it("すべてのFeatureに構造化された出典情報を付ける", () => {
    const geoJson = buildRouteAnalysisGeoJson(buildRouteAnalysisSnapshot({ route: evaluated(), restCandidates: [strictCandidate], manifest, generatedAt }));
    for (const feature of geoJson.features) expect(feature.properties).toEqual(expect.objectContaining({
      sourceType: expect.any(String), provider: expect.any(String), datasetName: expect.any(String), license: expect.any(String),
      attribution: expect.any(String), generatedBy: "TOKYO PACE", generatedAt, manifestReference: "data/generated/open-data-manifest.json",
    }));
  });

  it("確認地点0件では厳格地点Featureを作らず確認改善を捏造しない", () => {
    const route = evaluated([]);
    const snapshot = buildRouteAnalysisSnapshot({ route, restCandidates: [], manifest, generatedAt });
    const geoJson = buildRouteAnalysisGeoJson(snapshot);
    expect(snapshot.route.strictRestCandidateCount).toBe(0);
    expect(snapshot.strictRestCandidates).toEqual([]);
    expect(geoJson.features).not.toEqual(expect.arrayContaining([expect.objectContaining({ properties: expect.objectContaining({ featureType: "strict_rest_candidate" }) })]));
    expect(snapshot.warnings).toContain("理論上の休憩地点追加候補は、実在する設置可能場所を保証しません。");
  });

  it("生成時刻は外から固定注入し不正な日時を拒否する", () => {
    const input = { route: evaluated(), restCandidates: [strictCandidate], manifest, generatedAt };
    expect(JSON.parse(serializeRouteAnalysisGeoJson(buildRouteAnalysisSnapshot(input))).properties.generatedAt).toBe(generatedAt);
    expect(() => buildRouteAnalysisSnapshot({ ...input, generatedAt: "2026/07/19" })).toThrow("UTCのISO 8601日時");
  });
});
