import type { EvaluatedRoute } from "../types";

export function RouteCard({ route, recommended }: { route: EvaluatedRoute; recommended: boolean }) {
  return <article className={`route-card ${route.id}`} aria-label={`${route.name}${recommended ? "、現在のおすすめ" : ""}`}>
    <div className="card-top"><div><span className="route-kind">{route.id === "standard" ? "時間を優先" : "休憩を優先"}</span><h3>{route.name}</h3></div>{recommended && <strong className="recommended">現在のおすすめ</strong>}</div>
    <dl className="metrics"><div><dt>所要時間</dt><dd>{route.durationMinutes}分</dd></div><div><dt>距離</dt><dd>{(route.distanceMeters / 1000).toFixed(2)} km</dd></div><div><dt>休憩候補</dt><dd>{route.restSpotIds.length}か所</dd></div><div><dt>最大連続歩行</dt><dd>{route.maxContinuousWalkingMinutes}分</dd></div></dl>
    <p className="toilet"><strong>トイレ経由：</strong>{route.toiletAvailable ? "あり（候補）" : "なし"}</p>
    <details><summary>この評価の理由を見る</summary><ul>{route.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul><p>評価スコア：{route.score}（小さいほど条件に適合）</p></details>
  </article>;
}
