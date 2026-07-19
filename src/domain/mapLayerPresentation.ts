import type { EvaluatedRoute } from "../types";
import { getRouteBaseLineStyle, type RouteBaseLineStyle } from "./routePresentation";

export const MAP_PANES = {
  toiletGap: { name: "route-toilet-gap-pane", zIndex: 410 },
  unselectedRoutes: { name: "route-background-pane", zIndex: 420 },
  facilities: { name: "route-facility-pane", zIndex: 430 },
  selectedRouteHalo: { name: "route-selected-halo-pane", zIndex: 440 },
  selectedRoute: { name: "route-selected-pane", zIndex: 450 },
  endpoints: { name: "route-endpoint-pane", zIndex: 620 },
} as const;

export const SELECTED_ROUTE_HALO_STYLE = {
  color: "#fffdf7",
  weight: 10,
  opacity: 1,
  lineCap: "round",
  lineJoin: "round",
} as const;

export const PUBLIC_TOILET_GAP_STYLE = {
  color: "#b42318",
  weight: 10,
  dashArray: "3 9",
  opacity: 0.3,
  lineCap: "round",
  lineJoin: "round",
} as const;

export const FACILITY_MARKER_STYLES = {
  estimatedRest: { color: "#713b00", fillColor: "#f3a712", opacity: 0.9, fillOpacity: 0.82, weight: 2 },
  drinkingStation: { color: "#005a9c", fillColor: "#63b3ed", opacity: 0.9, fillOpacity: 0.82, weight: 2 },
  barrierFreeFacility: { color: "#5b2c83", fillColor: "#d6bcfa", opacity: 0.9, fillOpacity: 0.82, weight: 2 },
  publicFacility: { color: "#276749", fillColor: "#68d391", opacity: 0.9, fillOpacity: 0.82, weight: 2 },
  restSuggestion: { color: "#9c2c00", fillColor: "#fff", opacity: 0.9, fillOpacity: 0.88, weight: 3 },
  officialPublicToilet: { color: "#063b73", fillColor: "#1479c9", opacity: 0.9, fillOpacity: 0.82, weight: 3 },
  officialFacilityToilet: { color: "#5b2c83", fillColor: "#c9a7e8", opacity: 0.9, fillOpacity: 0.82, weight: 3 },
  officialStationToilet: { color: "#713b00", fillColor: "#f3a712", opacity: 0.9, fillOpacity: 0.82, weight: 3 },
} as const;

export const FACILITY_MARKER_RADII = {
  estimatedRest: 8,
  restCandidate: 7,
  restSuggestion: 10,
  officialToilet: 9,
} as const;

export type RouteMapMode = "none" | "dynamic" | "demo";

export function getRouteMapMode(routes: readonly Pick<EvaluatedRoute, "provider" | "isFallback">[]): RouteMapMode {
  if (routes.length === 0) return "none";
  return routes.every((route) => route.provider === "demo" || route.isFallback === true) ? "demo" : "dynamic";
}

export type RouteLegendItem = {
  key: string;
  label: string;
  lineStyle: RouteBaseLineStyle;
};

export function getRouteLegendItems(mode: RouteMapMode): RouteLegendItem[] {
  if (mode === "dynamic") {
    return [
      { key: "standard", label: "青実線：標準歩行候補", lineStyle: getRouteBaseLineStyle({ id: "standard", profile: "standard" }) },
      { key: "step-avoiding", label: "緑破線：階段回避要求候補", lineStyle: getRouteBaseLineStyle({ id: "step_avoiding", profile: "step_avoiding" }) },
      { key: "wheelchair", label: "紫点線：車いすプロファイル候補", lineStyle: getRouteBaseLineStyle({ id: "wheelchair_profile", profile: "wheelchair_profile" }) },
    ];
  }
  if (mode === "demo") {
    return [
      { key: "demo-normal", label: "固定デモ通常ルート", lineStyle: getRouteBaseLineStyle({ id: "standard", profile: undefined }) },
      { key: "demo-comfort", label: "固定デモ安心ルート", lineStyle: getRouteBaseLineStyle({ id: "comfort", profile: undefined }) },
    ];
  }
  return [];
}

export type FacilityLegendKind = keyof typeof FACILITY_MARKER_STYLES;

const facilityLegendLabels: Record<FacilityLegendKind, string> = {
  estimatedRest: "推定休憩候補",
  drinkingStation: "公式の給水候補",
  barrierFreeFacility: "バリアフリー掲載施設",
  publicFacility: "公式の公共施設候補",
  restSuggestion: "理論上の休憩地点追加候補",
  officialPublicToilet: "公衆トイレ候補",
  officialFacilityToilet: "公共施設内の設備情報",
  officialStationToilet: "鉄道駅内の設備情報",
};

export function getFacilityLegendItems(kinds: readonly FacilityLegendKind[]) {
  const visible = new Set(kinds);
  return (Object.keys(FACILITY_MARKER_STYLES) as FacilityLegendKind[])
    .filter((kind) => visible.has(kind))
    .map((kind) => ({ key: kind, label: facilityLegendLabels[kind], markerStyle: FACILITY_MARKER_STYLES[kind] }));
}
