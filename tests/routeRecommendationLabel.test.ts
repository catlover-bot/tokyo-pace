import { describe, expect, it } from "vitest";
import {
  deriveRoutePreferenceSummary,
  getTopCandidateLabels,
} from "../src/domain/routeRecommendationLabel";

describe("希望条件の達成状況", () => {
  it("全候補が希望条件を満たさない場合を判定する", () => {
    expect(deriveRoutePreferenceSummary([
      { meetsPreferences: false },
      { meetsPreferences: false },
      { meetsPreferences: false },
    ])).toEqual({
      anyRouteMeetsPreferences: false,
      topRouteMeetsPreferences: false,
      allRoutesMissPreferences: true,
    });
  });

  it("1位候補が希望条件を満たす場合を判定する", () => {
    expect(deriveRoutePreferenceSummary([
      { meetsPreferences: true },
      { meetsPreferences: false },
      { meetsPreferences: true },
    ])).toEqual({
      anyRouteMeetsPreferences: true,
      topRouteMeetsPreferences: true,
      allRoutesMissPreferences: false,
    });
  });

  it("1位候補は未達でも下位候補が希望条件を満たす場合を区別する", () => {
    expect(deriveRoutePreferenceSummary([
      { meetsPreferences: false },
      { meetsPreferences: true },
      { meetsPreferences: false },
    ])).toEqual({
      anyRouteMeetsPreferences: true,
      topRouteMeetsPreferences: false,
      allRoutesMissPreferences: false,
    });
  });

  it("候補が空の場合を全候補未達として扱わない", () => {
    expect(deriveRoutePreferenceSummary([])).toEqual({
      anyRouteMeetsPreferences: false,
      topRouteMeetsPreferences: false,
      allRoutesMissPreferences: false,
    });
  });

  it("同じ入力から決定的な結果を返し、入力を変更しない", () => {
    const routes = [
      { id: "standard", meetsPreferences: false },
      { id: "step_avoiding", meetsPreferences: true },
      { id: "wheelchair_profile", meetsPreferences: false },
    ];
    const before = routes.map((route) => ({ ...route }));
    const first = deriveRoutePreferenceSummary(routes);

    expect(deriveRoutePreferenceSummary(routes)).toEqual(first);
    expect(routes).toEqual(before);
  });
});

describe("1位候補の呼称", () => {
  it("1位候補が希望条件を満たす場合だけ推奨表現を返す", () => {
    expect(getTopCandidateLabels(true)).toEqual({
      sectionLabel: "TOKYO PACE推奨候補",
      headingPrefix: "推奨：",
      badge: "TOKYO PACE推奨",
    });
  });

  it("1位候補が希望条件を満たさない場合は条件に最も近い表現を返す", () => {
    const labels = getTopCandidateLabels(false);

    expect(labels).toEqual({
      sectionLabel: "条件に最も近い候補",
      headingPrefix: "現在の条件に最も近い候補：",
      badge: "条件に最も近い",
    });
    expect(Object.values(labels).join(" ")).not.toContain("推奨");
  });
});
