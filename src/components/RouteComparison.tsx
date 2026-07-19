import type { RouteComparisonResult } from "../domain/routeComparison";
import { RecommendedRouteSummary } from "./RecommendedRouteSummary";
import { RouteCard } from "./RouteCard";
import { RouteComparisonTable } from "./RouteComparisonTable";

export function RouteComparison({ comparison, selectedRouteId, fallback, onSelect }: { comparison: RouteComparisonResult; selectedRouteId: string | null; fallback: boolean; onSelect(routeId: string): void }) {
  const recommended = comparison.routes.find((model) => model.isRecommended);
  if (!recommended) return null;
  const selected = comparison.routes.find((model) => model.routeId === selectedRouteId) ?? recommended;
  return <section className="route-comparison" aria-labelledby="comparison-title" data-testid="route-comparison">
    <div className="comparison-heading"><div><p className="step">条件 2</p><h2 id="comparison-title">経路比較</h2></div><p>距離だけでなく、歩き続ける時間と休憩候補の間隔を比べます。</p></div>
    {fallback && <aside className="fallback-notice" role="status"><strong>固定デモルートを表示中</strong><p>実APIから取得した経路ではありません。新宿駅西口から東京都庁までの説明用データです。</p></aside>}
    <RecommendedRouteSummary model={recommended} onSelect={onSelect} />
    <p className="selection-announcement" aria-live="polite">地図で選択中：{selected.routeName}、{selected.profileLabel}</p>
    <RouteComparisonTable models={comparison.routes} selectedRouteId={selected.routeId} onSelect={onSelect} />
    <div className="cards" aria-label="経路候補の詳しい比較">{comparison.routes.map((model) => <RouteCard key={model.routeId} model={model} selected={model.routeId === selected.routeId} onSelect={onSelect} />)}</div>
  </section>;
}
