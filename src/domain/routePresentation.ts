import type { EvaluatedRoute } from "../types";

export function getRouteLineStyle(route: Pick<EvaluatedRoute, "profile" | "id">, selected: boolean) {
  const base = route.profile === "standard" ? { color: "#2457a6" } : route.profile === "step_avoiding" ? { color: "#087f5b", dashArray: "12 8" } : route.profile === "wheelchair_profile" ? { color: "#6b3fa0", dashArray: "3 8" } : route.id === "comfort" ? { color: "#087f5b" } : { color: "#46505a", dashArray: "9 8" };
  return { ...base, weight: selected ? 9 : 4, opacity: selected ? 1 : 0.28 };
}
