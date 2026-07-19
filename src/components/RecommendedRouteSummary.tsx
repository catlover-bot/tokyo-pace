import type { RouteComparisonViewModel } from "../domain/routeComparison";

export function RecommendedRouteSummary({ model, onSelect }: { model: RouteComparisonViewModel; onSelect(routeId: string): void }) {
  return <section className="recommended-summary" aria-labelledby="recommended-title" aria-live="polite">
    <p className="summary-label">TOKYO PACE推奨候補</p>
    <h3 id="recommended-title">推奨：{model.routeName}</h3>
    <p>{model.profileLabel}</p>
    <p className="summary-burden-score"><strong>条件負担スコア：{model.score}</strong><span>低いほど、設定した歩行条件に近い候補です。</span></p>
    <div className="summary-columns">
      <div><h4>この経路を推奨する理由</h4><ul>{model.recommendationReasons.map((reason) => <li key={reason.code}>{reason.text}</li>)}</ul></div>
      <div><h4>{model.baselineLabel}候補との違い</h4><ul><li>{model.distanceDeltaLabel}</li><li>{model.durationDeltaLabel}</li><li>{model.restGapDeltaLabel}</li></ul></div>
    </div>
    {model.safetyWarnings[0] && <p className="summary-warning"><strong>確認事項：</strong>{model.safetyWarnings[0].text}</p>}
    <button className="map-route-button" type="button" onClick={() => onSelect(model.routeId)}>推奨候補を地図で見る</button>
  </section>;
}
