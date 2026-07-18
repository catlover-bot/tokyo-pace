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

公式CSV → scripts/update-open-data.mjs → data/generated + src/data/generated → UI / routeScore
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

## 公式トイレデータフロー

`npm run data:update` が3つの公式CSVをサーバーサイドで取得します。新宿区CSVはUTF-16LE、東京都CSVはShift_JISとしてデコードし、必須ヘッダーと座標を検証します。不正行は理由別に除外し、出典、ライセンス、データ更新月、取得日時を各レコードに保持します。すべての取得・正規化が成功した後だけ、一時ファイルを生成先へrenameします。

全件の正規化データは `data/generated/`、ブラウザ用のデモルートから直線距離350m以内のデータは `src/data/generated/` に保存します。ブラウザは外部CSVへアクセスしないため、CORSや提供元障害に依存しません。必須ヘッダーが変わった場合は更新を失敗させ、既存生成物を維持します。

`geo.ts` はHaversine距離と局所平面への射影を使い、地点からルート折れ線までの最短直線距離を導出します。250m以内をルート評価候補、350m以内・最大30件を地図表示候補とします。道路ネットワーク上の距離や通行可否は表しません。

重複は異なるデータセット間で名称または住所が正規化後に一致し、かつ25m以内の場合だけ候補として記録します。共通IDがないため自動統合しません。

## 品質監査と候補地点

`officialToiletQuality.mjs` は原レコードと表示候補地点を分離します。同一座標相当の1m以内、または10m以内で正規化名称・住所が一致するレコードだけを決定的にグループ化します。原レコードは `records` に全件残し、候補地点は代表座標、原レコード数、分類、車椅子対応情報の有無を持ちます。近いだけで意味の異なる施設は統合しません。

`data/generated/open-data-audit.json` にはデータセット別件数、新宿区件数、距離帯、座標範囲、同一座標、10m・25m近接群、名称・住所一致、候補地点、データセット間候補、空欄率を出力します。ルート評価は原レコード数ではなく候補地点数で判定します。

## 種別別評価とルート進行距離

`PUBLIC_TOILET_QUALIFYING_DISTANCE_METERS`（現在250m）以内の候補地点を種別別に数えます。トイレ希望条件とスコアの未達判定には `public_toilet` だけを使用し、施設内・駅内情報は補足情報として分離します。

`geo.ts` は折れ線長、地点の最近点射影、開始点から射影点までの累積距離、候補地点の進行順を純粋関数で導出します。最長トイレ空白は開始点・公衆トイレ候補の射影位置・終了点を境界とする最大区間です。同一候補地点は1境界として扱います。距離は道路ネットワークではなくデモ折れ線上または折れ線までの推定値です。

射影は座標折れ線の `geometryLengthMeters` と幾何進行距離を使います。利用者向けの進行距離は `geometryProgressMeters / geometryLengthMeters * DemoRoute.distanceMeters` で正規化し、`routeLengthMeters` を必ずデモ総距離と一致させます。施設から折れ線までの直線距離は正規化せず、250m近傍判定にだけ使います。本番ルーティング導入後は、進行距離を道路区間ごとの距離へ置き換えます。

## エラーと状態

プロバイダー呼び出しには loading / error / success の UI 状態があります。失敗時は再試行できます。地図タイルのネットワーク障害時も比較カードと地点一覧は利用できます。
