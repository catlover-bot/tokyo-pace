import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buildOpenDataAudit, clusterOfficialToiletRecords } from "../src/domain/officialToiletQuality.mjs";

const source = (datasetName) => ({ provider: "fixture", datasetName, datasetUrl: null, resourceUrl: null, license: "CC BY", datasetUpdatedAt: null, retrievedAt: null, fieldVerifiedAt: null });
const record = (id, latitude, longitude, name, address, kind, dataset = kind) => ({ id, name, latitude, longitude, address, category: "toilet", seating: null, indoor: null, toiletAvailable: true, wheelchairAccessible: null, openingHours: null, officialToiletKind: kind, source: source(dataset), confidence: "official" });

describe("公式トイレ候補地点", () => {
  it("同一座標の複数原レコードを1候補地点にし、原レコードを保持する", () => {
    const records = [record("public", 35, 139, "公衆トイレ", "住所A", "public_toilet", "新宿区"), record("station", 35, 139, "駅内トイレ", "住所B", "station_toilet_information", "東京都")];
    const places = clusterOfficialToiletRecords(records);
    expect(places).toHaveLength(1);
    expect(places[0].sourceRecordCount).toBe(2);
    expect(places[0].records.map((item) => item.id)).toEqual(["public", "station"]);
    expect(places[0].kinds).toEqual(["public_toilet", "station_toilet_information"]);
  });

  it("近接していても名称と住所が異なるレコードは統合しない", () => {
    const records = [record("a", 35, 139, "施設A", "住所A", "public_toilet"), record("b", 35.00005, 139, "施設B", "住所B", "station_toilet_information")];
    expect(clusterOfficialToiletRecords(records)).toHaveLength(2);
  });

  it("入力順にかかわらず候補地点の生成順が決定的である", () => {
    const records = [record("b", 35.1, 139, "B", "B", "public_toilet"), record("a", 35, 139, "A", "A", "public_toilet")];
    expect(clusterOfficialToiletRecords(records)).toEqual(clusterOfficialToiletRecords([...records].reverse()));
  });

  it("距離帯別に原レコード数と候補地点数を分けて監査する", () => {
    const records = [record("same-1", 35, 139.0001, "A", "A", "public_toilet"), record("same-2", 35, 139.0001, "B", "B", "station_toilet_information"), record("far", 35.001, 139.0001, "C", "C", "public_toilet")];
    const audit = buildOpenDataAudit(records, [[[35, 139], [35, 139.01]]], "2026-07-19T00:00:00Z");
    expect(audit.routeDistanceBands["0-50m"]).toEqual({ recordCount: 2, placeCount: 1 });
    expect(audit.routeDistanceBands["100-150m"]).toEqual({ recordCount: 1, placeCount: 1 });
  });

  it("UI文言に経由・利用可能という保証表現を使わない", async () => {
    const files = await Promise.all(["../src/App.tsx", "../src/components/RouteCard.tsx", "../src/components/RouteMap.tsx"].map((file) => readFile(new URL(file, import.meta.url), "utf8")));
    const text = files.join("\n");
    expect(text).not.toContain("トイレを経由");
    expect(text).not.toContain("トイレが利用できる");
    expect(text).toContain("利用可能性");
  });
});
