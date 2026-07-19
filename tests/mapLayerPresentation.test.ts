import { describe, expect, it } from "vitest";
import {
  FACILITY_MARKER_STYLES,
  getFacilityLegendItems,
  getRouteLegendItems,
  getRouteMapMode,
  MAP_PANES,
  PUBLIC_TOILET_GAP_STYLE,
  SELECTED_ROUTE_HALO_STYLE,
} from "../src/domain/mapLayerPresentation";
import { getRouteBaseLineStyle, getRouteLineStyle } from "../src/domain/routePresentation";

describe("地図レイヤーの描画順", () => {
  it("空白区間から出発地・目的地までの相対順を固定する", () => {
    expect([
      MAP_PANES.toiletGap.zIndex,
      MAP_PANES.unselectedRoutes.zIndex,
      MAP_PANES.facilities.zIndex,
      MAP_PANES.selectedRouteHalo.zIndex,
      MAP_PANES.selectedRoute.zIndex,
      MAP_PANES.endpoints.zIndex,
    ]).toEqual([410, 420, 430, 440, 450, 620]);
  });

  it("一般施設マーカーを選択経路より下に置く", () => {
    expect(MAP_PANES.facilities.zIndex).toBeLessThan(MAP_PANES.selectedRouteHalo.zIndex);
    expect(MAP_PANES.selectedRouteHalo.zIndex).toBeLessThan(MAP_PANES.selectedRoute.zIndex);
  });

  it("出発地・目的地をアプリ内の地図レイヤーで最上位に置く", () => {
    expect(MAP_PANES.endpoints.zIndex).toBeGreaterThan(MAP_PANES.selectedRoute.zIndex);
  });
});

describe("経路と空白区間の表示", () => {
  it("選択経路に本体より太い淡色ハローを付ける", () => {
    const selected = getRouteLineStyle({ id: "standard", profile: "standard" }, true);
    expect(SELECTED_ROUTE_HALO_STYLE).toMatchObject({ color: "#fffdf7", weight: 10, opacity: 1 });
    expect(SELECTED_ROUTE_HALO_STYLE.weight).toBeGreaterThan(selected.weight);
  });

  it("選択経路を6px不透明、非選択経路を3px半透明にする", () => {
    expect(getRouteLineStyle({ id: "standard", profile: "standard" }, true)).toMatchObject({ weight: 6, opacity: 1 });
    expect(getRouteLineStyle({ id: "standard", profile: "standard" }, false)).toMatchObject({ weight: 3, opacity: 0.38 });
  });

  it("profileごとの色と線種を維持する", () => {
    expect(getRouteBaseLineStyle({ id: "standard", profile: "standard" })).toEqual({ color: "#2457a6" });
    expect(getRouteBaseLineStyle({ id: "step_avoiding", profile: "step_avoiding" })).toEqual({ color: "#087f5b", dashArray: "12 8" });
    expect(getRouteBaseLineStyle({ id: "wheelchair_profile", profile: "wheelchair_profile" })).toEqual({ color: "#6b3fa0", dashArray: "3 8" });
  });

  it("公衆トイレ空白区間を選択経路より薄くする", () => {
    expect(PUBLIC_TOILET_GAP_STYLE).toMatchObject({ color: "#b42318", weight: 10, dashArray: "3 9", opacity: 0.3 });
    expect(PUBLIC_TOILET_GAP_STYLE.opacity).toBeLessThan(getRouteLineStyle({ id: "standard", profile: "standard" }, true).opacity);
  });
});

describe("地図凡例", () => {
  it("動的モードでは動的3経路だけを表示する", () => {
    const labels = getRouteLegendItems("dynamic").map((item) => item.label);
    expect(labels).toEqual(["青実線：標準歩行候補", "緑破線：階段回避要求候補", "紫点線：車いすプロファイル候補"]);
    expect(labels.join(" ")).not.toContain("固定デモ");
  });

  it("固定デモモードでは固定デモ2経路だけを表示する", () => {
    const labels = getRouteLegendItems("demo").map((item) => item.label);
    expect(labels).toEqual(["固定デモ通常ルート", "固定デモ安心ルート"]);
    expect(labels.join(" ")).not.toContain("標準歩行候補");
  });

  it("経路がないときは経路凡例を表示しない", () => {
    expect(getRouteMapMode([])).toBe("none");
    expect(getRouteLegendItems("none")).toEqual([]);
  });

  it("実データのproviderから動的・固定デモを判定する", () => {
    expect(getRouteMapMode([{ provider: "openrouteservice", isFallback: false }])).toBe("dynamic");
    expect(getRouteMapMode([{ provider: "demo", isFallback: true }])).toBe("demo");
  });

  it("凡例の色と線種を実描画の共有設定から生成する", () => {
    const [standard, stepAvoiding, wheelchair] = getRouteLegendItems("dynamic");
    expect(standard.lineStyle).toEqual(getRouteBaseLineStyle({ id: "standard", profile: "standard" }));
    expect(stepAvoiding.lineStyle).toEqual(getRouteBaseLineStyle({ id: "step_avoiding", profile: "step_avoiding" }));
    expect(wheelchair.lineStyle).toEqual(getRouteBaseLineStyle({ id: "wheelchair_profile", profile: "wheelchair_profile" }));
  });

  it("表示中の施設分類だけを重複なく凡例へ渡す", () => {
    const items = getFacilityLegendItems(["officialPublicToilet", "estimatedRest", "officialPublicToilet"]);
    expect(items.map((item) => item.key)).toEqual(["estimatedRest", "officialPublicToilet"]);
    expect(items[0].markerStyle).toBe(FACILITY_MARKER_STYLES.estimatedRest);
  });
});
