export type RoutePreferenceSummary = {
  anyRouteMeetsPreferences: boolean;
  topRouteMeetsPreferences: boolean;
  allRoutesMissPreferences: boolean;
};

export type TopCandidateLabels = {
  sectionLabel: "TOKYO PACE推奨候補" | "条件に最も近い候補";
  headingPrefix: "推奨：" | "現在の条件に最も近い候補：";
  badge: "TOKYO PACE推奨" | "条件に最も近い";
};

export function deriveRoutePreferenceSummary(
  routes: readonly { meetsPreferences: boolean }[],
): RoutePreferenceSummary {
  const anyRouteMeetsPreferences = routes.some((route) => route.meetsPreferences);
  return {
    anyRouteMeetsPreferences,
    topRouteMeetsPreferences: routes[0]?.meetsPreferences === true,
    allRoutesMissPreferences: routes.length > 0 && !anyRouteMeetsPreferences,
  };
}

export function getTopCandidateLabels(topRouteMeetsPreferences: boolean): TopCandidateLabels {
  return topRouteMeetsPreferences
    ? {
        sectionLabel: "TOKYO PACE推奨候補",
        headingPrefix: "推奨：",
        badge: "TOKYO PACE推奨",
      }
    : {
        sectionLabel: "条件に最も近い候補",
        headingPrefix: "現在の条件に最も近い候補：",
        badge: "条件に最も近い",
      };
}
