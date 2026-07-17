# アーキテクチャ

## 構成

React SPA を Vite で構築し、Cloudflare Vite plugin により Worker と静的アセットを一体で開発・配布します。`worker/index.ts` は将来の API 境界で、現在はヘルスチェックのみです。

```text
UI (React / Leaflet)
  ↓ RouteProvider interface
DemoRouteProvider
  ↓
ローカルのデモ経路データ

UI → 純粋関数 routeScore → 評価済み経路・説明理由
```

`RouteProvider` は UI とルーティング実装を分離します。将来は OSRM、Valhalla、OpenRouteService 等のアダプターに置換できます。評価は AI を使わない決定的な加重ペナルティ方式で、重みを `SCORE_WEIGHTS` に集約しています。

## データ境界

- `src/data`: MVP が直接読むデモデータ
- `data/processed`: 実データ取り込みパイプラインの交換点となる GeoJSON
- `src/types`: プロバイダーと UI に共通する型
- 不明属性は `null`。推定データは `confidence: estimated` と出典名で明示します。

## エラーと状態

プロバイダー呼び出しには loading / error / success の UI 状態があります。失敗時は再試行できます。地図タイルのネットワーク障害時も比較カードと地点一覧は利用できます。
