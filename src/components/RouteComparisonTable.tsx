import type { RouteComparisonViewModel } from "../domain/routeComparison";

type Row = { label: string; render(model: RouteComparisonViewModel): React.ReactNode };
const rows: Row[] = [
  { label: "推奨順位", render: (model) => `${model.rank}位${model.isRecommended ? "・TOKYO PACE推奨" : ""}` },
  { label: "距離", render: (model) => `${model.distanceMeters.toLocaleString("ja-JP")}m` },
  { label: "所要時間", render: (model) => `${model.durationMinutes}分` },
  { label: "比較基準との差", render: (model) => <><span>{model.distanceDeltaLabel}</span><br /><span>{model.durationDeltaLabel}</span></> },
  { label: "最大連続歩行", render: (model) => `${model.maxContinuousWalkingMinutes}分` },
  { label: "最長休憩空白", render: (model) => `ルート沿い推定${model.longestRestGapMeters.toLocaleString("ja-JP")}m` },
  { label: "最長公衆トイレ空白", render: (model) => `ルート沿い推定${model.longestPublicToiletGapMeters.toLocaleString("ja-JP")}m` },
  { label: "最長給水空白", render: (model) => `ルート沿い推定${model.longestDrinkingWaterGapMeters.toLocaleString("ja-JP")}m` },
  { label: "公衆トイレ候補", render: (model) => `${model.publicToiletPlaceCount}地点` },
  { label: "確認できた休憩場所のつながり", render: (model) => model.strictRestNetworkFeasible ? "設定時間内となる計算" : "設定時間を超える区間あり" },
  { label: "利用者条件", render: (model) => model.meetsPreferences ? "必須条件を満たす" : "満たさない条件あり" },
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
