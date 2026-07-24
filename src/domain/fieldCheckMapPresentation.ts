import type { FieldVerificationCandidate, RouteProfile } from "../types";

export type FieldCheckMapLayerVisibility = {
  dynamicRoutes: boolean;
  fixedDemoRoutes: boolean;
  candidates: boolean;
  otherCandidates: boolean;
  selectedCandidateConnection: boolean;
  theoreticalInsertion: boolean;
};

export const DEFAULT_FIELD_CHECK_MAP_LAYERS: FieldCheckMapLayerVisibility = {
  dynamicRoutes: true,
  fixedDemoRoutes: false,
  candidates: true,
  otherCandidates: false,
  selectedCandidateConnection: true,
  theoreticalInsertion: true,
};

const dynamicRouteLabels: Record<RouteProfile, string> = {
  standard: "代表動的：標準歩行候補",
  step_avoiding: "代表動的：階段回避要求候補",
  wheelchair_profile: "代表動的：車いすプロファイル候補",
};

export function getDynamicFieldCheckRouteLabel(profile: RouteProfile): string {
  return dynamicRouteLabels[profile];
}

export function getDynamicFieldCheckRouteClassName(profile: RouteProfile): string {
  return `field-map-route field-map-route--dynamic field-map-route--dynamic-${profile.replaceAll("_", "-")}`;
}

export function getFixedDemoFieldCheckRouteLabel(routeId: string, routeName: string): string {
  return `固定デモ：${routeName || routeId}`;
}

export function getFixedDemoFieldCheckRouteClassName(routeId: string): string {
  return `field-map-route field-map-route--fixed-demo field-map-route--fixed-demo-${routeId}`;
}

export function getCandidateMapGeometry(candidate: FieldVerificationCandidate) {
  return {
    candidateCoordinate: [candidate.latitude, candidate.longitude] as [number, number],
    nearestPointCoordinate: candidate.nearestPointCoordinate,
    connectionCoordinates: [
      [candidate.latitude, candidate.longitude],
      candidate.nearestPointCoordinate,
    ] as [[number, number], [number, number]],
    theoreticalInsertionCoordinate: candidate.theoreticalInsertionCoordinate,
  };
}
