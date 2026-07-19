import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RouteCard } from "../src/components/RouteCard";
import { getExpandedRouteIdForComparison, RouteComparison, toggleExpandedRouteId } from "../src/components/RouteComparison";
import { demoRoutes } from "../src/data/routes";
import { buildRouteComparisonViewModels, type RouteComparisonViewModel } from "../src/domain/routeComparison";
import { selectRecommendedRoute } from "../src/domain/routeScore";
import type { RoutePreferences } from "../src/types";

const preferences: RoutePreferences = { maxContinuousWalkingMinutes: 10, requireToilet: false, avoidSteepSlopes: false, preferIndoorRest: false, avoidSteps: true };
const evaluated = selectRecommendedRoute(demoRoutes.map((route) => ({ ...route, provider: "demo" as const, isFallback: true })), preferences, [], []);
const comparison = buildRouteComparisonViewModels(evaluated, preferences);
const topModel = comparison.routes[0];

function renderComparison(selectedRouteId = comparison.recommendedRouteId) {
  return renderToStaticMarkup(<RouteComparison comparison={comparison} selectedRouteId={selectedRouteId} fallback={false} onSelect={() => undefined} />);
}

function renderCard({ model = topModel, expanded = false, selected = false, topRouteMeetsPreferences = true }: { model?: RouteComparisonViewModel; expanded?: boolean; selected?: boolean; topRouteMeetsPreferences?: boolean } = {}) {
  return renderToStaticMarkup(<RouteCard
    model={model}
    selected={selected}
    expanded={expanded}
    topRouteMeetsPreferences={topRouteMeetsPreferences}
    onSelect={() => undefined}
    onToggleDetails={() => undefined}
  />);
}

describe("経路カードの単一accordion", () => {
  it("初期状態ではすべての詳細を閉じる", () => {
    const html = renderComparison();
    expect(html.match(/aria-expanded="false"/g)).toHaveLength(comparison.routes.length);
    expect(html).not.toContain('aria-expanded="true"');
  });

  it("同じ候補を再操作すると閉じ、別候補を開くと一つだけを選ぶ", () => {
    const first = toggleExpandedRouteId(null, "standard");
    expect(first).toBe("standard");
    expect(toggleExpandedRouteId(first, "standard")).toBeNull();
    expect(toggleExpandedRouteId(first, "comfort")).toBe("comfort");
  });

  it("新しい比較結果では同じroute IDでも実効上すべて閉じる", () => {
    expect(getExpandedRouteIdForComparison(comparison, comparison, topModel.routeId)).toBe(topModel.routeId);
    expect(getExpandedRouteIdForComparison(comparison, { ...comparison }, topModel.routeId)).toBeNull();
  });

  it("aria-controlsが非表示の詳細regionを参照する", () => {
    const html = renderComparison();
    for (const model of comparison.routes) {
      const detailsId = `route-${model.routeId}-details`;
      expect(html).toContain(`aria-controls="${detailsId}"`);
      expect(html).toMatch(new RegExp(`id="${detailsId}"[^>]*role="region"[^>]*hidden=""`));
    }
  });

  it("詳細操作にキーボード操作可能なnative buttonを使う", () => {
    const html = renderCard();
    expect(html).toMatch(/<button id="route-[^"]+-details-toggle" class="details-toggle-button" type="button"/);
  });

  it("展開状態に応じてボタン文言とaria-expandedを切り替える", () => {
    expect(renderCard()).toContain('aria-expanded="false"');
    expect(renderCard()).toContain("詳細を見る");
    expect(renderCard({ expanded: true })).toContain('aria-expanded="true"');
    expect(renderCard({ expanded: true })).toContain("詳細を閉じる");
  });

  it("地図選択だけでは詳細を開かない", () => {
    const html = renderCard({ selected: true, expanded: false });
    expect(html).toContain('aria-current="true"');
    expect(html).toContain("この経路を地図で選択中");
    expect(html).toContain('aria-expanded="false"');
  });
});

describe("経路カードの情報量", () => {
  it("閉じた状態でも主要指標と希望条件の状態を表示する", () => {
    const html = renderCard();
    const detailsStart = html.indexOf(`id="route-${topModel.routeId}-details"`);
    for (const text of ["順位 1位", topModel.routeName, "距離", "所要時間", topModel.distanceDeltaLabel, topModel.durationDeltaLabel, "最大連続歩行", "希望条件をすべて満たす"]) {
      expect(html.indexOf(text)).toBeGreaterThanOrEqual(0);
      expect(html.indexOf(text)).toBeLessThan(detailsStart);
    }
  });

  it("詳細情報をhidden regionへまとめ、既存情報を失わない", () => {
    const html = renderCard();
    const detailsStart = html.indexOf(`id="route-${topModel.routeId}-details"`);
    for (const text of ["最長休憩空白", "最長公衆トイレ空白", "最長給水空白", "この候補の評価ポイント", "利点", "注意点・条件未達", "条件負担スコア", "原レコード"]) {
      expect(html.indexOf(text)).toBeGreaterThan(detailsStart);
    }
  });

  it("トップ候補の位置づけだけを条件達成状態に合わせて表示する", () => {
    const recommendedHtml = renderCard({ topRouteMeetsPreferences: true });
    expect(recommendedHtml).toContain("TOKYO PACE推奨");
    expect(recommendedHtml).not.toContain("条件に最も近い");

    const nearestHtml = renderCard({ topRouteMeetsPreferences: false });
    expect(nearestHtml).toContain("条件に最も近い");
    expect(nearestHtml).not.toContain("TOKYO PACE推奨");
  });

  it("利用者向け表示に必須条件未達を残さない", () => {
    expect(renderCard()).not.toContain("必須条件未達");
  });

  it("全候補が希望条件未達なら比較上部に指定の案内を表示する", () => {
    const allMissComparison = {
      ...comparison,
      anyRouteMeetsPreferences: false,
      topRouteMeetsPreferences: false,
      allRoutesMissPreferences: true,
      routes: comparison.routes.map((model) => ({ ...model, meetsPreferences: false })),
    };
    const html = renderToStaticMarkup(<RouteComparison comparison={allMissComparison} selectedRouteId={allMissComparison.recommendedRouteId} fallback={false} onSelect={() => undefined} />);
    expect(html).toContain("すべての希望条件を満たす候補は見つかりませんでした。");
    expect(html).toContain("以下は、設定した条件に近い順です。");
    expect(html).toContain("条件に最も近い");
    expect(html).toContain("希望条件の一部未達");
    expect(html).not.toContain("必須条件未達");
    expect(html).not.toContain("推奨");
  });

  it("途中休憩地点なしではrestContinuityの時間・空白距離・説明を使う", () => {
    const model: RouteComparisonViewModel = {
      ...topModel,
      restContinuity: {
        classification: "WHOLE_ROUTE_WITHIN_LIMIT_WITHOUT_STRICT_REST",
        strictIntermediateRestPointCount: 0,
        continuityWithinLimit: true,
        statusLabel: "経路全体が設定内",
        metricLabel: "連続して歩く時間",
        continuousWalkingMinutes: 9.8,
        description: "途中の休憩を前提とせず、設定時間内となる計算です。",
        displayLongestRestGapMeters: 819,
        longestRestGapExplanation: "途中で厳格に確認できた休憩地点がないため、経路全体を空白区間として計算しています。",
      },
    };
    const html = renderCard({ model, expanded: true });
    expect(html).toContain("推定9.8分");
    expect(html).toContain("推定819m");
    expect(html).toContain(model.restContinuity.description);
    expect(html).toContain(model.restContinuity.longestRestGapExplanation!);
  });

});
