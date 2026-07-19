import type { RouteComparisonViewModel } from "../domain/routeComparison";
import { getTopCandidateLabels } from "../domain/routeRecommendationLabel";

export function RecommendedRouteSummary({ model, topRouteMeetsPreferences, onSelect }: { model: RouteComparisonViewModel; topRouteMeetsPreferences: boolean; onSelect(routeId: string): void }) {
  const labels = getTopCandidateLabels(topRouteMeetsPreferences);
  return <section className="recommended-summary" aria-labelledby="recommended-title" aria-live="polite">
    <p className="summary-label">{labels.sectionLabel}</p>
    <h3 id="recommended-title">{labels.headingPrefix}{model.routeName}</h3>
    <p className="summary-burden-score"><strong>条件負担スコア：{model.score}</strong><span>低いほど、設定した歩行条件に近い候補です。</span></p>
    <div className="summary-reasons"><h4>この候補を選んだ主な理由</h4><ul>{model.recommendationReasons.slice(0, 3).map((reason) => <li key={reason.code}>{reason.text}</li>)}</ul></div>
    <p className="summary-baseline"><strong>{model.baselineLabel}候補との差：</strong>{model.distanceDeltaLabel}、{model.durationDeltaLabel}</p>
    {model.safetyWarnings[0] && <p className="summary-warning"><strong>確認事項：</strong>{model.safetyWarnings[0].text}</p>}
    <button className="map-route-button" type="button" onClick={() => onSelect(model.routeId)}>この候補を地図で見る</button>
  </section>;
}
