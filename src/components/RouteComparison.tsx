import { useState } from "react";
import type { RouteComparisonResult } from "../domain/routeComparison";
import { RecommendedRouteSummary } from "./RecommendedRouteSummary";
import { RouteCard } from "./RouteCard";
import { RouteComparisonTable } from "./RouteComparisonTable";

type ExpansionState = {
  comparison: RouteComparisonResult;
  routeId: string | null;
};

// eslint-disable-next-line react-refresh/only-export-components -- Pure transition is exported for deterministic accordion tests.
export function toggleExpandedRouteId(currentRouteId: string | null, routeId: string): string | null {
  return currentRouteId === routeId ? null : routeId;
}

// eslint-disable-next-line react-refresh/only-export-components -- Result identity reset is exported for deterministic accordion tests.
export function getExpandedRouteIdForComparison(storedComparison: RouteComparisonResult, currentComparison: RouteComparisonResult, storedRouteId: string | null): string | null {
  return storedComparison === currentComparison ? storedRouteId : null;
}

export function RouteComparison({ comparison, selectedRouteId, fallback, onSelect }: { comparison: RouteComparisonResult; selectedRouteId: string | null; fallback: boolean; onSelect(routeId: string): void }) {
  const [expansion, setExpansion] = useState<ExpansionState>({ comparison, routeId: null });
  const expandedRouteId = getExpandedRouteIdForComparison(expansion.comparison, comparison, expansion.routeId);
  const recommended = comparison.routes.find((model) => model.isRecommended);
  if (!recommended) return null;
  const selected = comparison.routes.find((model) => model.routeId === selectedRouteId) ?? recommended;
  const toggleDetails = (routeId: string) => {
    setExpansion((current) => ({
      comparison,
      routeId: toggleExpandedRouteId(getExpandedRouteIdForComparison(current.comparison, comparison, current.routeId), routeId),
    }));
  };

  return <section className="route-comparison" aria-labelledby="comparison-title" data-testid="route-comparison">
    <div className="comparison-heading"><div><p className="step">条件 2</p><h2 id="comparison-title">経路比較</h2></div><p>距離だけでなく、歩き続ける時間と休憩候補の間隔を比べます。</p></div>
    {fallback && <aside className="fallback-notice" role="status"><strong>固定デモルートを表示中</strong><p>実APIから取得した経路ではありません。新宿駅西口から東京都庁までの説明用データです。</p></aside>}
    {comparison.allRoutesMissPreferences && <aside className="preference-miss-notice" role="status"><p>すべての希望条件を満たす候補は見つかりませんでした。</p><p>以下は、設定した条件に近い順です。</p></aside>}
    <RecommendedRouteSummary model={recommended} topRouteMeetsPreferences={comparison.topRouteMeetsPreferences} onSelect={onSelect} />
    <p className="selection-announcement" aria-live="polite">地図で選択中：{selected.routeName}、{selected.profileLabel}</p>
    <RouteComparisonTable models={comparison.routes} selectedRouteId={selected.routeId} onSelect={onSelect} />
    <div className="cards" aria-label="経路候補の詳しい比較">{comparison.routes.map((model) => <RouteCard
      key={model.routeId}
      model={model}
      selected={model.routeId === selected.routeId}
      expanded={model.routeId === expandedRouteId}
      topRouteMeetsPreferences={comparison.topRouteMeetsPreferences}
      onSelect={onSelect}
      onToggleDetails={toggleDetails}
    />)}</div>
  </section>;
}
