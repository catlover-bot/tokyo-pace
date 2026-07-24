# アーキテクチャ

## 動的ルーティング

`ApiRouteProvider`はブラウザから同一オリジンのWorker APIだけを呼びます。Workerの固定openrouteservice adapterが`foot-walking`標準、`foot-walking`階段回避、`wheelchair`制約付きの3候補を取得し、Leaflet座標順の内部`DemoRoute`互換型へ正規化します。UI・評価層はopenrouteserviceの生GeoJSONを参照しません。

Workerは入力サイズ、JSON、有限座標、緯度経度範囲、新宿bbox、同一点、直線距離を検証します。外部通信は8秒で打ち切り、認証・レート制限・タイムアウト・上流障害を安全なエラーへ変換します。外部本文とSecretは返しません。キャッシュキーは座標を小数5桁へ丸め、固定profile／optionsとスキーマ版を含めてSHA-256化し、TTLは900秒です。

動的経路ではconfirmed／supportedの厳格な休憩候補だけでwalkingSegmentsを分割します。区間時間は経路全体の距離・所要時間に対する距離比で決定的に推定し、possibleは厳格成立へ使用しません。公式トイレ、休憩、給水、屋内候補は経路ごとに再射影します。

## 比較ViewModelと説明可能性

`routeScore.ts`の既存加重値を「条件負担スコア」と呼び、唯一の推奨基準とします。`selectRecommendedRoute`と比較層は同じ決定的comparatorを使用します。条件負担スコアは低いほど設定した歩行条件に近い値です。値が同じ場合だけ、必須条件達成、違反数、最大連続歩行、最長休憩空白、実所要秒数、距離、routeIdで順序を固定します。

`EvaluatedRoute`は条件負担スコアに加えて、所要時間、連続歩行超過、公衆トイレ条件、急坂、屋内条件の既存加算値を`scoreBreakdown`として返します。休憩空白、給水、屋内候補空白は現在の計算要素ではないため、内訳へ寄与したように扱いません。

`routeComparison.ts`は評価済み経路から比較ViewModelを生成する純粋関数です。基準経路、差分、順位、理由コード、利点、注意点、条件違反、線種、出典を一度だけ生成し、推奨サマリー、比較表、詳細カードへ供給します。理由は固定優先度で最大4件とし、生成AIや外部サービスで文章を作りません。`possible`施設は厳格な休憩成立理由に使いません。

Reactは`selectedRouteId`を比較UIと地図で共有します。ボタンまたは経路線の選択により、Leafletは選択線を太く、ほかを薄くし、選択座標のboundsへ合わせます。経路の線種はプロファイルごとに固定されます。比較UIは遅延読み込みし、生成済み施設データと地図の既存コード分割を維持します。

## 休憩ネットワーク

公式CSV → `scripts/update-open-data.mjs`（取得、UTF-8／Shift_JIS／UTF-16LE変換、ヘッダー検証、null正規化、原子的書込み）→ 生成JSON → ルート近傍抽出・射影・正規化空白分析 → React表示、の一方向構成です。外部CSVをクライアントから取得しません。

`restNetwork.ts`は開始・候補・終了を境界として休憩、給水、屋内候補の空白を独立に計算し、最大空白の中点から追加配置による理論的改善も純粋関数で計算します。

更新処理はraw bytesのSHA-256をmanifestと比較し、同一ならデータセットの`retrievedAt`を維持します。レコードには`sourceDatasetId`と`sourceRecordId`を格納し、取得時刻はmanifestだけに保持します。正規化レコードはデータセットID、原レコードID、正規化名称、座標、IDの順で固定し、UTF-8・2空白インデント・LFで出力します。

## 現地確認と厳格評価

現地確認はブラウザ書込みではなく、Git管理された`data/field-verification/rest-spots.csv`を更新スクリプトへ渡す一方向フローです。

```text
公式possible候補 ─┐
保存済み代表動的経路 ┼→ 現地確認優先候補JSON/CSV → 読み取り専用field-check画面
既存の厳格地点 ──┘

現地確認CSV → ヘッダー/行検証 → 履歴保存 → candidateごとの最新有効確認
             → confirmed/supported/possibleの純粋判定
             → 公式possibleを同じ地点の確認後candidateで置換
             → walkingSegments / strict rest network / 前後比較
```

同一`verificationId`の全重複行、不正座標・日時・三値・method・候補ID・根拠参照は理由付きで監査します。複数履歴は削除せず、評価時だけ最新日時、同時刻なら確認ID順で1件を選びます。公開用縮小JSONには確認者と自由記述を含めません。CSV全体の致命的エラーは成果物を書き始める前に停止し、行単位エラーは監査へ残して有効行だけを正規化します。

`confirmed`は現地確認日時・確認主体・現地method・一般利用可能・座席/明示的休憩空間の肯定が揃う場合だけです。`supported`は公式情報と現地根拠が複数あり、否定情報なしで一部の肯定属性がある場合です。`fieldVerifiedAt`、座席属性、公式掲載のいずれか単独では昇格しません。厳格評価はconfidenceがconfirmedまたはsupportedであることを唯一の入口とし、category名だけでは成立させません。

`evaluateRestNetwork`は反映前と反映後について、厳格候補数、最大連続歩行時間、最長休憩空白、ネットワーク成立、未被覆歩行時間、被覆率、失敗理由を別々に計算します。現地確認0件なら両者は同一です。スコア式、経路comparator、同点処理は変更せず、将来有効な確認地点が入った時だけ、確認後候補で分割した区間値が既存式へ流れます。固定デモのestimated区間は現地確認0件時に上書きしません。

現地確認候補抽出は、`data/routing-snapshots/shinjuku-west-to-tocho.v1.json`の代表動的3経路を順位用、固定デモ2経路を回帰比較用として明確に分離します。snapshotは公開TOKYO PACE Workerから一度だけ保存した正規化済みOpenStreetMap/openrouteservice由来経路です。schema、3 profile、座標順、端点、距離、帰属を実行時検証し、`data:update`、決定性検証、E2Eは保存ファイルだけを読みます。動的`standard`と固定デモ`standard`は`routeSet`と`routeKey`で名前空間を分け、得点を二重計上しません。

各経路では施設の射影位置を正規化経路進行距離へ変換し、候補追加前後の最大空白差をgross改善とします。施設から最近点までの一方向推定直線距離を迂回下限としてgrossから差し引きます。この値は実道路の迂回や往復を表しません。grossが正で、迂回調整後30mかつ2.5%以上の動的経路が1つ以上ある候補だけを順位対象にし、30〜49mは境界的改善として理由コードを付けます。

施設アクセス分類はsource dataset IDと代表施設名による純粋関数です。公園、一般利用目的が明確な公共施設、その他公式施設、商業、ホテル等民間、慎重施設の順を基本とします。学校・保育・福祉等は一般公開を推測せず順位除外、ホテルは休憩可能とみなさず220点減点と特別注意を付けます。access priorは利用可能性の確率ではなく順位用ordinalです。

現地確認優先スコアは、主動的経路の迂回調整後改善、改善率、ルート近接、アクセスprior、寄与動的経路数、公式source品質を加点し、カテゴリと重複施設を減点します。内訳を全件保持し、同点は調整後改善、改善率、寄与数、距離、candidate IDの順です。理由は理由コードから固定生成します。値の大きい順に訪問優先となる派生スコアです。既存の条件負担スコアとは独立し、その式・ランキング・同点処理へ影響しません。条件負担スコアは低いほど利用者条件に近い値です。

頑健性レイヤーは既存スコアを置き換えず、その入力仮定を監査します。主経路ごとに`optimistic = max(0, gross)`、`lower_bound = max(0, gross - distanceToRoute)`、`conservative_proxy = max(0, gross - 2 × distanceToRoute)`を計算します。3値は折れ線への投影と推定直線距離によるproxyで、実道路ネットワーク上の入口・横断・高低差を含む迂回距離ではありません。30mかつ2.5%を意味のある改善下限、50mまたは5%未満を境界帯として定数化し、`robust / sensitive / marginal / ineffective`を決定します。

重み感度は`lower_bound`を固定し、基準設定と7重み（改善量、改善率、ルート近接、access prior、category penalty、寄与経路数、source品質）を一要因ずつ±20%にした15設定です。各設定で既存と同じ降順・同点比較を使い、候補入力をIDで正規化してから順位付けします。基準順位、最良・最悪・平均順位、上位5出現率、順位安定性を候補別に集約します。上位5出現率はこの有限シナリオ内での安定性であり、施設利用の確率ではありません。

二軸評価では、移動改善軸の往復proxy改善・率・寄与経路数・ルート距離と、現地確認価値軸の一般利用目的の明確さ・公式source品質・現地確認で解消すべき不明度・アクセス制限への注意を別フィールドに保持します。Pareto判定はこれらの生指標に対する支配関係で、追加の手調整総合点ではありません。shortlistは、慎重施設と`ineffective`を除外し、Pareto・頑健候補、明確な公共目的の最低枠、ホテル上限を含む固定規則とcandidate ID同点処理で5地点を構成します。条件を満たせない場合は黙って緩和せず不足理由を出します。

生成パイプラインは全15設定の順位と候補集約を`data/generated/field-candidate-ranking-sensitivity.json/.csv`、優先的に確認する5地点を`field-visit-shortlist.json/.csv`へatomic writeします。さらに、5地点の`verificationId`と分析値だけを記入し、14の確認結果列を空欄にしたUTF-8 BOM付き`data/generated/field-visit-plan.csv`と、ブラウザ用`src/data/generated/field-visit-plan.json`を決定的に生成します。`src/data/generated/`にはUIに必要な候補集約・shortlist・5地点計画だけを縮小同梱し、シナリオ全行は重複保存しません。

field-check画面は単一スコア順位と現地確認の優先順位を別の配列として参照し、片方からもう片方を推測しません。地理的な訪問順は計算せず、優先5地点、地図、現場カード、5地点CSV、閉じたその他3地点、制約の順に構成します。カードの14項目チェックはReactの一時状態だけに保持し、書込みAPIや`localStorage`へ送信しません。Clipboard APIには完全なID・住所を渡し、失敗時も読み取り専用inputから選択できます。地図の`selectedCandidateId`はカードと単一状態で共有し、優先5地点以外と固定デモのレイヤーは初期非表示です。

同一施設は名称または住所の正規化一致と25m近接を根拠に1地点として数え、レコード数を得点へ加えません。異名称・異住所の3地点以上が完全同一座標へ集中する場合は上流の座標品質異常として統合せず、既存strict地点との重複、慎重施設、距離・改善基準未達とともに理由別監査へ記録します。`dynamicRouteMetrics`と`fixedDemoRouteMetrics`を別配列にし、代表指標の動的profileを`primaryRouteId`へ保持します。

抽出時に根拠付きでまとめた施設群は、現地確認取込時にも`groupedCandidateIds`と全`officialSourceIds`を引き継ぎます。同一施設群の複数確認は最新の有効確認1件を評価へ使い、厳格候補数や`walkingSegments`を二重計上しません。前後snapshotは理論上の追加休憩地点もそれぞれ再計算します。

## 分析データ出力

`routeAnalysisExport.ts`は選択中の`EvaluatedRoute`からsnapshotを作り、CSVとGeoJSONを生成する純粋関数です。生成時刻は呼出側から注入し、列・配列・Feature・source IDの順序、丸め、UTF-8改行を固定します。DOMのBlobダウンロードは`browserDownload.ts`へ分離し、生成ロジックから副作用を隔離します。

GeoJSON内部座標はアプリの`[latitude, longitude]`からGeoJSON標準の`[longitude, latitude]`へ変換します。経路、空白、公式/現地確認地点、理論追加地点の各Featureは`sourceType`、provider、datasetName、license、attribution、generatedBy、generatedAt、source dataset IDs、manifest参照を個別に持ちます。OSM由来経路を東京都・新宿区のCC BY地点と混同せず、混合派生Featureは元ライセンス一覧を保持します。

## 構成

React SPA を Vite で構築し、Cloudflare Vite plugin により Worker と静的アセットを一体で開発・配布します。`worker/index.ts` はヘルスチェックと`POST /api/routes`を提供し、Secretをブラウザへ渡さずopenrouteserviceへ接続します。

```text
UI (React / Leaflet)
  ↓ RouteProvider interface
ApiRouteProvider → Worker /api/routes → openrouteservice
  または明示操作時だけ DemoRouteProvider

walkingSegments → 純粋関数 deriveContinuityMetrics → 継続性指標
routeScore → EvaluatedRoute / scoreBreakdown
  ↓ routeComparison（理由コード・差分・条件違反）
比較表・カード ↔ selectedRouteId ↔ 地図

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

`npm run data:update` がmanifestに定義した公式CSV群をサーバーサイドで取得します。配布元ごとのUTF-16LE、Shift_JIS、UTF-8を明示的にデコードし、必須ヘッダーと座標を検証します。不正行は理由別に除外し、出典、ライセンス、データ更新月、取得日時をmanifestへ保持します。すべての取得・正規化が成功した後だけ、一時ファイルを生成先へrenameします。

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
