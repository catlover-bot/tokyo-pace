import { describe, expect, it } from "vitest";
import {
  DEFAULT_FIELD_CHECK_MAP_LAYERS,
  getCandidateMapGeometry,
  getDynamicFieldCheckRouteClassName,
  getDynamicFieldCheckRouteLabel,
  getFixedDemoFieldCheckRouteClassName,
  getFixedDemoFieldCheckRouteLabel,
} from "../src/domain/fieldCheckMapPresentation";
import type { FieldVerificationCandidate } from "../src/types";

describe("現地確認地図のレイヤー表現", () => {
  it("代表動的3経路を初期表示し固定デモを初期非表示にする", () => {
    expect(DEFAULT_FIELD_CHECK_MAP_LAYERS).toEqual({
      dynamicRoutes: true,
      fixedDemoRoutes: false,
      candidates: true,
      otherCandidates: false,
      selectedCandidateConnection: true,
      theoreticalInsertion: true,
    });
  });

  it("動的3プロファイルへ判別可能なラベルとclassNameを割り当てる", () => {
    expect([
      getDynamicFieldCheckRouteLabel("standard"),
      getDynamicFieldCheckRouteLabel("step_avoiding"),
      getDynamicFieldCheckRouteLabel("wheelchair_profile"),
    ]).toEqual([
      "代表動的：標準歩行候補",
      "代表動的：階段回避要求候補",
      "代表動的：車いすプロファイル候補",
    ]);
    expect(getDynamicFieldCheckRouteClassName("standard")).toContain("field-map-route--dynamic-standard");
    expect(getDynamicFieldCheckRouteClassName("step_avoiding")).toContain("field-map-route--dynamic-step-avoiding");
    expect(getDynamicFieldCheckRouteClassName("wheelchair_profile")).toContain("field-map-route--dynamic-wheelchair-profile");
  });

  it("固定デモへ動的経路と異なるラベルとclassNameを割り当てる", () => {
    expect(getFixedDemoFieldCheckRouteLabel("comfort", "安心ルート")).toBe("固定デモ：安心ルート");
    expect(getFixedDemoFieldCheckRouteClassName("comfort")).toContain("field-map-route--fixed-demo-comfort");
    expect(getFixedDemoFieldCheckRouteClassName("comfort")).not.toContain("field-map-route--dynamic");
  });

  it("候補、最近点、推定直線、理論挿入位置の座標を混同しない", () => {
    const candidate = {
      latitude: 35.69,
      longitude: 139.69,
      nearestPointCoordinate: [35.691, 139.691],
      theoreticalInsertionCoordinate: [35.692, 139.692],
    } as FieldVerificationCandidate;
    expect(getCandidateMapGeometry(candidate)).toEqual({
      candidateCoordinate: [35.69, 139.69],
      nearestPointCoordinate: [35.691, 139.691],
      connectionCoordinates: [[35.69, 139.69], [35.691, 139.691]],
      theoreticalInsertionCoordinate: [35.692, 139.692],
    });
  });
});
