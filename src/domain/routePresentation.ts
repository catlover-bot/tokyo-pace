import type { EvaluatedRoute } from "../types";

export type RouteBaseLineStyle = {
  color: string;
  dashArray?: string;
};

export function getRouteBaseLineStyle(route: Pick<EvaluatedRoute, "profile" | "id">): RouteBaseLineStyle {
  return route.profile === "standard" ? { color: "#2457a6" }
    : route.profile === "step_avoiding" ? { color: "#087f5b", dashArray: "12 8" }
      : route.profile === "wheelchair_profile" ? { color: "#6b3fa0", dashArray: "3 8" }
        : route.id === "comfort" ? { color: "#087f5b" }
          : { color: "#46505a", dashArray: "9 8" };
}

export function getRouteLineStyle(route: Pick<EvaluatedRoute, "profile" | "id">, selected: boolean) {
  return {
    ...getRouteBaseLineStyle(route),
    weight: selected ? 6 : 3,
    opacity: selected ? 1 : 0.38,
    lineCap: "round" as const,
    lineJoin: "round" as const,
  };
}
