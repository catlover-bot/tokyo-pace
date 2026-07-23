import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseRepresentativeDynamicRouteSnapshot,
  REPRESENTATIVE_DYNAMIC_ROUTE_PROFILES,
  validateRepresentativeDynamicRouteSnapshot,
} from "../src/domain/fieldCheckRouteSnapshot.mjs";

const snapshotUrl = new URL(
  "../data/routing-snapshots/shinjuku-west-to-tocho.v1.json",
  import.meta.url,
);
const snapshotText = await readFile(snapshotUrl, "utf8");
const snapshotValue = JSON.parse(snapshotText);
const cloneSnapshot = () => structuredClone(snapshotValue);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("現地確認用の代表動的3経路snapshot", () => {
  it("保存済みsnapshotのschemaと3 profileを検証する", () => {
    const snapshot = parseRepresentativeDynamicRouteSnapshot(snapshotText);

    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      routeSetKind: "representative_dynamic_snapshot",
      routingSchemaVersion: "1",
      coordinateOrder: "latitude_longitude",
      source: {
        sourceType: "openstreetmap_route",
        snapshotMethod: "one_time_public_worker_response",
        license: "ODbL",
      },
    });
    expect(snapshot.request.profiles).toEqual(REPRESENTATIVE_DYNAMIC_ROUTE_PROFILES);
    expect(snapshot.routes.map((route) => route.profile))
      .toEqual(REPRESENTATIVE_DYNAMIC_ROUTE_PROFILES);
    expect(snapshot.routes.every((route) => route.id === route.profile
      && route.provider === "openrouteservice"
      && route.isFallback === false)).toBe(true);
  });

  it("routeとrequest profileの入力順を固定順へ正規化する", () => {
    const reordered = cloneSnapshot();
    reordered.routes.reverse();
    reordered.request.profiles.reverse();

    const normalized = validateRepresentativeDynamicRouteSnapshot(reordered);

    expect(normalized.request.profiles).toEqual(REPRESENTATIVE_DYNAMIC_ROUTE_PROFILES);
    expect(normalized.routes.map((route) => route.profile))
      .toEqual(REPRESENTATIVE_DYNAMIC_ROUTE_PROFILES);
    expect(normalized).toEqual(validateRepresentativeDynamicRouteSnapshot(cloneSnapshot()));
  });

  it("内部座標をlatitude / longitude順として保持する", () => {
    const snapshot = validateRepresentativeDynamicRouteSnapshot(cloneSnapshot());

    for (const route of snapshot.routes) {
      expect(route.coordinates[0][0]).toBeGreaterThan(35);
      expect(route.coordinates[0][0]).toBeLessThan(36);
      expect(route.coordinates[0][1]).toBeGreaterThan(139);
      expect(route.coordinates[0][1]).toBeLessThan(140);
    }

    const wrongOrder = cloneSnapshot();
    wrongOrder.coordinateOrder = "longitude_latitude";
    expect(() => validateRepresentativeDynamicRouteSnapshot(wrongOrder))
      .toThrow("座標順はlatitude_longitude");

    const swappedCoordinate = cloneSnapshot();
    swappedCoordinate.routes[0].coordinates[0].reverse();
    expect(() => validateRepresentativeDynamicRouteSnapshot(swappedCoordinate))
      .toThrow("不正座標");
  });

  it("各経路の始点と終点が代表requestから離れたsnapshotを拒否する", () => {
    const wrongStart = cloneSnapshot();
    wrongStart.routes[0].coordinates[0] = [35.7, 139.71];
    expect(() => validateRepresentativeDynamicRouteSnapshot(wrongStart))
      .toThrow("始点が代表requestと一致しません");

    const wrongEnd = cloneSnapshot();
    wrongEnd.routes[1].coordinates.at(-1)[0] += 0.01;
    expect(() => validateRepresentativeDynamicRouteSnapshot(wrongEnd))
      .toThrow("終点が代表requestと一致しません");
  });

  it("profileの欠落・重複・未知値を拒否する", () => {
    const missingRoute = cloneSnapshot();
    missingRoute.routes.pop();
    expect(() => validateRepresentativeDynamicRouteSnapshot(missingRoute))
      .toThrow("3経路ちょうどではありません");

    const duplicateProfile = cloneSnapshot();
    duplicateProfile.routes[2].profile = "standard";
    duplicateProfile.routes[2].id = "standard-copy";
    expect(() => validateRepresentativeDynamicRouteSnapshot(duplicateProfile))
      .toThrow("standard / step_avoiding / wheelchair_profileが1件ずつ必要です");

    const unknownRequestProfile = cloneSnapshot();
    unknownRequestProfile.request.profiles[2] = "unknown";
    expect(() => validateRepresentativeDynamicRouteSnapshot(unknownRequestProfile))
      .toThrow("request profilesは代表3経路が1件ずつ必要です");
  });

  it("schema、経路属性、出典が不正なsnapshotを拒否する", () => {
    const wrongSchema = cloneSnapshot();
    wrongSchema.routingSchemaVersion = "2";
    expect(() => validateRepresentativeDynamicRouteSnapshot(wrongSchema))
      .toThrow("routingSchemaVersionは1");

    const invalidRoute = cloneSnapshot();
    invalidRoute.routes[0] = null;
    expect(() => validateRepresentativeDynamicRouteSnapshot(invalidRoute))
      .toThrow("routeがJSON objectではありません");

    const fallbackRoute = cloneSnapshot();
    fallbackRoute.routes[0].isFallback = true;
    expect(() => validateRepresentativeDynamicRouteSnapshot(fallbackRoute))
      .toThrow("fallback扱い");

    const invalidDistance = cloneSnapshot();
    invalidDistance.routes[0].distanceMeters = 0;
    expect(() => validateRepresentativeDynamicRouteSnapshot(invalidDistance))
      .toThrow("距離が不正");

    const missingAttribution = cloneSnapshot();
    missingAttribution.source.attribution = "";
    expect(() => validateRepresentativeDynamicRouteSnapshot(missingAttribution))
      .toThrow("OpenStreetMap attribution");
  });

  it("壊れたJSONを明示的な解析エラーとして拒否する", () => {
    expect(() => parseRepresentativeDynamicRouteSnapshot("{"))
      .toThrow("代表動的経路snapshotのJSONを解析できません");
  });

  it("保存済みbytesだけで検証し、外部fetchを呼ばない", () => {
    const fetchMock = vi.fn(() => {
      throw new Error("外部fetchは禁止");
    });
    vi.stubGlobal("fetch", fetchMock);

    expect(parseRepresentativeDynamicRouteSnapshot(snapshotText).routes).toHaveLength(3);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
