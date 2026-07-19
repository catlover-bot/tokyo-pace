import type { RouteComparisonViewModel } from "../domain/routeComparison";

type Row = { label: string; render(model: RouteComparisonViewModel): React.ReactNode };
const rows: Row[] = [
  { label: "比較順位", render: (model) => `${model.rank}位${model.isRecommended ? model.meetsPreferences ? "・TOKYO PACE推奨" : "・条件に最も近い" : ""}` },
  { label: "距離", render: (model) => `${model.distanceMeters.toLocaleString("ja-JP")}m` },
  { label: "所要時間", render: (model) => `${model.durationMinutes}分` },
  { label: "比較基準との差", render: (model) => <><span>{model.distanceDeltaLabel}</span><br /><span>{model.durationDeltaLabel}</span></> },
  { label: "歩き続ける時間の評価", render: (model) => <><span>{model.restContinuity.metricLabel}</span><br /><strong>{model.restContinuity.statusLabel}</strong><small>推定{Math.round(model.restContinuity.continuousWalkingMinutes * 10) / 10}分</small></> },
  { label: "最長休憩空白", render: (model) => <><span>ルート沿い推定{Math.round(model.restContinuity.displayLongestRestGapMeters).toLocaleString("ja-JP")}m</span>{model.restContinuity.longestRestGapExplanation && <small>{model.restContinuity.longestRestGapExplanation}</small>}</> },
  { label: "最長公衆トイレ空白", render: (model) => `ルート沿い推定${model.longestPublicToiletGapMeters.toLocaleString("ja-JP")}m` },
  { label: "最長給水空白", render: (model) => `ルート沿い推定${model.longestDrinkingWaterGapMeters.toLocaleString("ja-JP")}m` },
  { label: "公衆トイレ候補", render: (model) => `${model.publicToiletPlaceCount}地点` },
  { label: "休憩を含む歩行の見通し", render: (model) => <><span>{model.restContinuity.description}</span>{model.strictRestCandidateCount > 0 && <small>厳格に確認できた途中の休憩地点：{model.strictRestCandidateCount}地点</small>}</> },
  { label: "希望条件", render: (model) => model.meetsPreferences ? "希望条件をすべて満たす" : "希望条件の一部未達" },
  { label: "条件負担スコア", render: (model) => <><strong>{model.score}</strong><small>低いほど、設定した歩行条件に近い候補です。</small></> },
];

export function RouteComparisonTable({ models, selectedRouteId, onSelect }: { models: RouteComparisonViewModel[]; selectedRouteId: string | null; onSelect(routeId: string): void }) {
  return <div className="comparison-table-wrap"><table className="comparison-table">
    <caption>経路候補の主要指標比較</caption>
    <thead><tr><th scope="col">比較項目</th>{models.map((model) => <th scope="col" key={model.routeId}>{model.routeName}<small>{model.profileLabel}</small></th>)}</tr></thead>
    <tbody>{rows.map((row) => <tr key={row.label}><th scope="row">{row.label}</th>{models.map((model) => <td key={model.routeId}>{row.render(model)}</td>)}</tr>)}
      <tr><th scope="row">地図表示</th>{models.map((model) => <td key={model.routeId}><button type="button" className="table-select-button" aria-current={selectedRouteId === model.routeId ? "true" : undefined} onClick={() => onSelect(model.routeId)}>{selectedRouteId === model.routeId ? "地図で選択中" : "地図で見る"}</button></td>)}</tr>
    </tbody>
  </table></div>;
}
