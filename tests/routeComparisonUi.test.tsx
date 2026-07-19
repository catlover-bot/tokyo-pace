import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import readmeText from "../README.md?raw";
import architectureText from "../docs/architecture.md?raw";
import serviceConceptText from "../docs/service-concept.md?raw";
import { RouteComparison } from "../src/components/RouteComparison";
import { RouteSearchStatus } from "../src/components/RouteSearchStatus";
import { demoRoutes } from "../src/data/routes";
import { buildRouteComparisonViewModels } from "../src/domain/routeComparison";
import { getRouteLineStyle } from "../src/domain/routePresentation";
import { selectRecommendedRoute } from "../src/domain/routeScore";
import type { RoutePreferences } from "../src/types";

const preferences: RoutePreferences = { maxContinuousWalkingMinutes: 10, requireToilet: false, avoidSteepSlopes: false, preferIndoorRest: false, avoidSteps: true };
const evaluated = selectRecommendedRoute(demoRoutes.map((route) => ({ ...route, provider: "demo" as const, isFallback: true })), preferences, [], []);
const comparison = buildRouteComparisonViewModels(evaluated, preferences);
const renderComparison = (selectedRouteId = comparison.recommendedRouteId, fallback = false) => renderToStaticMarkup(<RouteComparison comparison={comparison} selectedRouteId={selectedRouteId} fallback={fallback} onSelect={() => undefined} />);

describe("経路比較UI", () => {
  it("推奨経路にTOKYO PACE推奨バッジを表示する", () => expect(renderComparison()).toContain("TOKYO PACE推奨"));
  it("最短候補に最短バッジを表示する", () => expect(renderComparison()).toContain(">最短<"));
  it("比較表にcaptionを付ける", () => expect(renderComparison()).toContain("<caption>経路候補の主要指標比較</caption>"));
  it("比較表の列見出しと行見出しにscopeを付ける", () => { const html = renderComparison(); expect(html).toContain('scope="col"'); expect(html).toContain('scope="row"'); });
  it("選択経路をaria-currentで伝える", () => expect(renderComparison("comfort")).toContain('aria-current="true"'));
  it("キーボード操作できるbuttonで地図選択を提供する", () => { const html = renderComparison(); expect(html).toContain("<button"); expect(html).toContain("この経路を地図で"); });
  it("固定デモ表示を動的ルートと区別する", () => { const html = renderComparison(comparison.recommendedRouteId, true); expect(html).toContain("固定デモルートを表示中"); expect(html).toContain("実APIから取得した経路ではありません"); });
  it("ローディング中は3候補を比較中と通知する", () => { const html = renderToStaticMarkup(<RouteSearchStatus loading error={null} onRetry={() => undefined} onFallback={() => undefined} />); expect(html).toContain('role="status"'); expect(html).toContain("3つの経路候補を比較しています"); });
  it("エラー時は再試行と固定デモ操作を表示する", () => { const html = renderToStaticMarkup(<RouteSearchStatus loading={false} error="一時的に取得できません。" onRetry={() => undefined} onFallback={() => undefined} />); expect(html).toContain('role="alert"'); expect(html).toContain("再試行"); expect(html).toContain("固定デモルートを表示"); });
  it("UI文字列に保証禁止表現を含めない", () => { const html = renderComparison(); for (const phrase of ["安全なルート", "安心して歩ける", "必ず通れる", "完全バリアフリー", "車いすで通れる", "トイレを利用できる", "必ず休憩できる", "最適なルート"]) expect(html).not.toContain(phrase); });
  it("推奨サマリー・比較表・カードで条件負担スコアと方向を明示する", () => { const html = renderComparison(); expect(html.match(/条件負担スコア/g)?.length).toBeGreaterThanOrEqual(3); expect(html).toContain("低いほど、設定した歩行条件に近い候補です。"); });
  it("UIと文書に高低を逆転する説明がない", () => { const text = [renderComparison(), readmeText, architectureText, serviceConceptText].join("\n"); expect(text).not.toMatch(/高いほど.{0,30}(条件に合う|条件に近い|適合)/); expect(text).not.toContain("スコアは高いほど"); });
});

describe("地図選択の表示規則", () => {
  it("選択経路を太く不透明にする", () => expect(getRouteLineStyle({ id: "standard", profile: "standard" }, true)).toMatchObject({ weight: 9, opacity: 1 }));
  it("非選択経路を細く薄くする", () => expect(getRouteLineStyle({ id: "standard", profile: "standard" }, false)).toMatchObject({ weight: 4, opacity: 0.28 }));
  it("標準は実線、階段回避は破線、車いす候補は点線を維持する", () => { expect(getRouteLineStyle({ id: "standard", profile: "standard" }, true)).not.toHaveProperty("dashArray"); expect(getRouteLineStyle({ id: "step_avoiding", profile: "step_avoiding" }, true).dashArray).toBe("12 8"); expect(getRouteLineStyle({ id: "wheelchair_profile", profile: "wheelchair_profile" }, true).dashArray).toBe("3 8"); });
});
