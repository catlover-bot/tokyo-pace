import type { RouteComparisonViewModel } from "../domain/routeComparison";
import { getTopCandidateLabels } from "../domain/routeRecommendationLabel";

function TopRouteBadge({ model, topRouteMeetsPreferences }: { model: RouteComparisonViewModel; topRouteMeetsPreferences: boolean }) {
  if (!model.isRecommended) return null;
  return <div className="badges" aria-label="経路の位置づけ"><span>{getTopCandidateLabels(topRouteMeetsPreferences).badge}</span></div>;
}

function DetailBadges({ model }: { model: RouteComparisonViewModel }) {
  const badges = [
    model.isShortest && "最短",
    model.isFastest && "最短時間",
    model.route.profile === "step_avoiding" && "階段回避要求",
    model.route.profile === "wheelchair_profile" && "車いすプロファイル候補",
    model.isFallback ? "固定デモ" : "OpenRouteService",
    "公式データ使用",
  ].filter(Boolean) as string[];
  return <div className="badges detail-badges" aria-label="経路の詳しい特徴">{[...new Set(badges)].map((badge) => <span key={badge}>{badge}</span>)}</div>;
}

export function RouteCard({ model, selected, expanded, topRouteMeetsPreferences, onSelect, onToggleDetails }: { model: RouteComparisonViewModel; selected: boolean; expanded: boolean; topRouteMeetsPreferences: boolean; onSelect(routeId: string): void; onToggleDetails(routeId: string): void }) {
  const route = model.route;
  const titleId = `route-${model.routeId}-title`;
  const detailsId = `route-${model.routeId}-details`;
  const detailsButtonId = `route-${model.routeId}-details-toggle`;
  const continuousWalkingMinutes = Math.round(model.restContinuity.continuousWalkingMinutes * 10) / 10;

  return <article className={`route-card profile-${model.visualPattern}${selected ? " selected" : ""}${model.isRecommended ? " recommended-route" : ""}`} aria-labelledby={titleId} aria-current={selected ? "true" : undefined} data-profile={route.profile ?? "demo"}>
    <div className="card-rank"><strong>順位 {model.rank}位</strong></div>
    <div className="card-top"><div><h3 id={titleId}>{model.routeName}</h3><TopRouteBadge model={model} topRouteMeetsPreferences={topRouteMeetsPreferences} /></div></div>
    <div className="card-journey"><p><strong>{model.distanceMeters.toLocaleString("ja-JP")}m</strong><span>距離</span></p><p><strong>{model.durationMinutes}分</strong><span>所要時間</span></p></div>
    <ul className="delta-list"><li>{model.distanceDeltaLabel}</li><li>{model.durationDeltaLabel}</li></ul>
    <dl className="metrics primary-metrics"><div><dt>最大連続歩行</dt><dd>推定{continuousWalkingMinutes}分</dd></div><div><dt>希望条件</dt><dd>{model.meetsPreferences ? "希望条件をすべて満たす" : "希望条件の一部未達"}</dd></div></dl>
    <button className="map-route-button" type="button" aria-current={selected ? "true" : undefined} onClick={() => onSelect(model.routeId)}>{selected ? "この経路を地図で選択中" : "この経路を地図で見る"}</button>
    <button id={detailsButtonId} className="details-toggle-button" type="button" aria-expanded={expanded} aria-controls={detailsId} onClick={() => onToggleDetails(model.routeId)}>{expanded ? "詳細を閉じる" : "詳細を見る"}</button>
    <div id={detailsId} className="route-card-details" role="region" aria-labelledby={detailsButtonId} hidden={!expanded}>
      <p className="metric-help">経路の種類：{model.profileLabel}</p>
      <DetailBadges model={model} />
      <div className={`continuity-status ${model.restContinuity.continuityWithinLimit ? "feasible" : "exceeded"}`}><strong>歩き続ける時間：{model.restContinuity.statusLabel === "設定超過区間あり" ? "設定超過" : "設定内"}</strong><span>{model.restContinuity.description}</span></div>
      <dl className="metrics primary-metrics"><div><dt>最長休憩空白</dt><dd>推定{Math.round(model.restContinuity.displayLongestRestGapMeters).toLocaleString("ja-JP")}m</dd>{model.restContinuity.longestRestGapExplanation && <small>{model.restContinuity.longestRestGapExplanation}</small>}</div><div><dt>最長公衆トイレ空白</dt><dd>推定{model.longestPublicToiletGapMeters}m</dd></div><div><dt>最長給水空白</dt><dd>推定{model.longestDrinkingWaterGapMeters}m</dd></div><div><dt>{model.restContinuity.metricLabel}</dt><dd>{model.restContinuity.statusLabel}</dd><small>確認できた途中休憩地点：{model.restContinuity.strictIntermediateRestPointCount}地点</small></div></dl>
      <section className="explanation-block"><h4>この候補の評価ポイント</h4><ul>{model.recommendationReasons.map((reason) => <li key={reason.code}>{reason.text}</li>)}</ul></section>
      <div className="card-lists"><section><h4>利点</h4><ul>{model.advantages.length ? model.advantages.map((item) => <li key={item.code}>{item.text}</li>) : <li>ほかの候補と指標を比較してください</li>}</ul></section><section><h4>注意点・条件未達</h4>{model.constraintViolations.length === 0 && model.tradeoffs.length === 0 ? <p>設定した希望条件の未達はありません。</p> : <ul>{[...model.constraintViolations, ...model.tradeoffs].map((item, index) => <li key={`${item.code}-${index}`}>{item.text}</li>)}</ul>}</section></div>
      <dl className="metrics"><div><dt>利用者の設定上限</dt><dd>{route.continuousWalkingLimitMinutes}分</dd></div><div><dt>上限超過時間</dt><dd>{route.continuousWalkingExcessMinutes}分</dd></div><div><dt>公衆トイレ候補</dt><dd>{route.publicToiletPlaceCount}地点</dd></div><div><dt>公共施設内の設備情報</dt><dd>{route.facilityToiletInformationPlaceCount}地点</dd></div><div><dt>鉄道駅内の設備情報</dt><dd>{route.stationToiletInformationPlaceCount}地点</dd></div><div><dt>最寄り公衆トイレ候補</dt><dd>{route.nearestPublicToiletDistanceMeters === null ? "不明" : `ルートから推定直線${route.nearestPublicToiletDistanceMeters}m`}</dd></div><div><dt>確認できた途中休憩地点</dt><dd>{model.strictRestCandidateCount}地点</dd></div><div><dt>参考の公式施設候補</dt><dd>{model.possibleRestCandidateCount}地点</dd></div><div><dt>給水地点</dt><dd>{route.drinkingStationCount}地点</dd></div><div><dt>屋内候補</dt><dd>{route.indoorCandidateCount}地点</dd></div><div><dt>最長屋内候補空白</dt><dd>推定{model.longestIndoorCandidateGapMeters}m</dd></div><div><dt>休憩地点追加の理論案</dt><dd>空白を推定{Math.round(route.restInsertionSuggestion.improvementMeters)}m短縮</dd></div></dl>
      <section className="field-verification-impact">
        <h4>現地確認による休憩ネットワーク比較</h4>
        {route.fieldVerificationComparison.hasFieldVerificationData ? <>
          <dl className="metrics"><div><dt>現地確認反映前の最長空白</dt><dd>ルート沿い推定{Math.round(route.fieldVerificationComparison.before.longestRestGapMeters)}m</dd></div><div><dt>現地確認反映後の最長空白</dt><dd>ルート沿い推定{Math.round(route.fieldVerificationComparison.after.longestRestGapMeters)}m</dd></div><div><dt>確認後の厳格候補</dt><dd>{route.fieldVerificationComparison.after.strictRestCandidateCount}地点</dd></div><div><dt>空白の短縮</dt><dd>推定{Math.round(route.fieldVerificationComparison.improvementMeters)}m（{Math.round(route.fieldVerificationComparison.improvementRatio * 1000) / 10}%）</dd></div><div><dt>反映前の理論追加による短縮</dt><dd>推定{Math.round(route.fieldVerificationComparison.before.restInsertionSuggestion.improvementMeters)}m</dd></div><div><dt>反映後の理論追加による短縮</dt><dd>推定{Math.round(route.fieldVerificationComparison.after.restInsertionSuggestion.improvementMeters)}m</dd></div></dl>
          <p className="metric-help">confirmed / supportedだけを厳格評価に使います。現地確認結果は自由な入館、常時の着席、現在営業中であることを将来にわたって保証しません。</p>
        </> : <p>取り込まれた現地確認済み休憩地点はまだありません。反映前後の改善値は生成していません。</p>}
      </section>
      <div className="score-explanation"><h4>条件負担スコア：{model.score}</h4><p>低いほど、設定した歩行条件に近い候補です。現地の安全性や通行可能性を保証する値ではありません。</p><dl><div><dt>所要時間</dt><dd>+{model.scoreBreakdown.duration}</dd></div><div><dt>連続歩行の設定超過</dt><dd>+{model.scoreBreakdown.continuousWalkingExcess}</dd></div><div><dt>公衆トイレ条件の未達</dt><dd>+{model.scoreBreakdown.missingPublicToilet}</dd></div><div><dt>急坂候補</dt><dd>+{model.scoreBreakdown.steepSlope}</dd></div><div><dt>屋内候補条件の未達</dt><dd>+{model.scoreBreakdown.missingIndoorRest}</dd></div><div><dt>条件負担スコア合計</dt><dd>{model.scoreBreakdown.total}</dd></div></dl><p>休憩空白、給水候補、屋内候補の指標は比較材料ですが、現在の条件負担スコアへ直接加算していません。</p></div>
      <p className="metric-help">原レコード{route.officialToiletRecordCount}件／表示候補{route.officialToiletPlaceCount}地点。施設までの距離は推定直線距離、空白は正規化したルート沿い推定距離です。</p>
      {model.sourceAttribution && <p className="metric-help">経路出典：{model.sourceAttribution}</p>}
      {model.safetyWarnings.map((warning, index) => <p className="metric-help warning-text" key={`${warning.code}-${index}`}>{warning.text}</p>)}
    </div>
  </article>;
}
