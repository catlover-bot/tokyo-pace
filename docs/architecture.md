# アーキテクチャ

## 構成

React SPA を Vite で構築し、Cloudflare Vite plugin により Worker と静的アセットを一体で開発・配布します。`worker/index.ts` は将来の API 境界で、現在はヘルスチェックのみです。

```text
UI (React / Leaflet)
  ↓ RouteProvider interface
DemoRouteProvider
  ↓
ローカルのデモ経路データ

walkingSegments → 純粋関数 deriveContinuityMetrics → 継続性指標
UI → 純粋関数 routeScore → 評価済み経路・説明理由
```

`RouteProvider` は UI とルーティング実装を分離します。将来は OSRM、Valhalla、OpenRouteService 等のアダプターに置換できます。評価は AI を使わない決定的な加重ペナルティ方式で、重みを `SCORE_WEIGHTS` に集約しています。

## 移動継続可能性

`DemoRoute.walkingSegments` は、休憩機会で区切った連続歩行区間を表します。各区間には距離、歩行時間、区間終端で休憩できるか、関連する休憩地点 ID を保持します。経路データには最大値を重複保存しません。

- 最大連続歩行時間: 全区間の `walkingMinutes` の最大値
- 最長休憩空白: 全区間の `distanceMeters` の最大値
- 上限超過時間: 最大連続歩行時間から利用者設定上限を引き、0 未満なら0
- 移動継続可能性: 上限超過時間が0なら成立

`deriveContinuityMetrics` がこれらを純粋関数として導出し、`evaluateRoute` が超過時間を既存の加重ペナルティへ渡します。`meetsPreferences` はこの成立判定だけでなく、トイレ、急坂、屋内休憩の希望も含む総合判定です。同一入力からは常に同一結果を返します。

## データ境界

- `src/data`: MVP が直接読むデモデータ
- `data/processed`: 実データ取り込みパイプラインの交換点となる GeoJSON
- `src/types`: プロバイダーと UI に共通する型
- 不明属性は `null`。推定データは `confidence: estimated` と出典名で明示します。
- 現在の区間距離・歩行時間も推定デモデータです。公式オープンデータ、外部ルーティング API、実測値から生成したものではありません。

## エラーと状態

プロバイダー呼び出しには loading / error / success の UI 状態があります。失敗時は再試行できます。地図タイルのネットワーク障害時も比較カードと地点一覧は利用できます。
