import type { EvaluatedRoute } from "../types";

export function RouteCard({ route, recommended }: { route: EvaluatedRoute; recommended: boolean }) {
  return <article className={`route-card ${route.id}`} aria-label={`${route.name}${recommended ? "、現在のおすすめ" : ""}`}>
    <div className="card-top"><div><span className="route-kind">{route.id === "standard" ? "時間を優先" : "休憩を優先"}</span><h3>{route.name}</h3></div>{recommended && <strong className="recommended">現在のおすすめ</strong>}</div>
    <div className={`continuity-status ${route.continuityFeasible ? "feasible" : "exceeded"}`}>
      <strong>移動継続可能性：{route.continuityFeasible ? "条件を満たす" : "条件超過"}</strong>
      <span>{route.continuityFeasible ? "設定した時間内に休憩候補へ着ける計算です。" : "休まずに歩く時間が、設定した上限を超える区間があります。"}</span>
    </div>
    <dl className="metrics"><div><dt>所要時間</dt><dd>{route.durationMinutes}分</dd></div><div><dt>距離</dt><dd>{(route.distanceMeters / 1000).toFixed(2)} km</dd></div><div><dt>休憩候補</dt><dd>{route.restSpotIds.length}か所</dd></div><div><dt>最大連続歩行</dt><dd>{route.maxContinuousWalkingMinutes}分</dd></div><div><dt>利用者の設定上限</dt><dd>{route.continuousWalkingLimitMinutes}分</dd></div><div><dt>上限超過時間</dt><dd>{route.continuousWalkingExcessMinutes}分</dd></div><div><dt>最長休憩空白</dt><dd>{route.longestRestGapMeters} m</dd></div><div><dt>総合条件</dt><dd>{route.meetsPreferences ? "満たす" : "未達あり"}</dd></div></dl>
    <p className="metric-help">最長休憩空白は、次の休憩候補まで歩き続ける区間のうち最も長い距離です。</p>
    <p className="toilet"><strong>トイレ経由：</strong>{route.toiletAvailable ? "あり（候補）" : "なし"}</p>
    <details><summary>この評価の理由を見る</summary><ul>{route.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul><p>評価スコア：{route.score}（小さいほど条件に適合）</p></details>
  </article>;
}
