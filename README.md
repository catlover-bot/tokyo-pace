# TOKYO PACE

## 休憩・給水・屋内候補

`npm run data:update`は公式トイレに加え、東京都「だれでも東京」、東京都水道局 Tokyowater Drinking Station、新宿区公共施設情報を更新スクリプトで取得し、文字コード変換・列検証・正規化後のJSONを生成します。ブラウザは外部CSVへアクセスしません。

施設からルートまでは推定直線距離、ルート上の空白は折れ線への射影位置を`DemoRoute.distanceMeters`へ正規化した推定距離です。実際の道路ネットワーク上の徒歩距離ではなく、本番ルーティング導入後は道路区間距離へ置換予定です。

公共施設やバリアフリー情報への掲載は、自由な入館、着席休憩、営業中、座席の空き、安全性を保証しません。給水地点に座席があるとも限りません。休憩地点追加案は最大空白の中点を示す理論上の配置候補です。

## オープンデータ生成の再現性

`data/raw/`の公式CSVは合計約5.8MBで、すべて再配布可能なCC BYです。25MB基準を下回るため、ネットワーク非依存の再生成と監査を目的にraw snapshotをGit管理します。テストfixtureもGit管理します。

取得情報は`data/generated/open-data-manifest.json`へデータセット単位で集約します。各項目は配布URL、取得日時、raw SHA-256、バイト数、正規化・除外件数、上流更新日、文字コード、ライセンスを保持します。レコード本体は`sourceDatasetId`でmanifestを参照し、毎回変化する`retrievedAt`を重複保存しません。同じraw SHA-256では以前の取得日時を維持します。

`data/generated/`は監査・再利用向け全件版、`src/data/generated/`はデモルート近傍だけを含むブラウザ同梱版です。`npm run data:verify-determinism`は保存済みrawから2回生成し、全生成JSONのSHA-256一致を検証します。

「最短ではなく、最後まで歩ける道へ」。TOKYO PACE は、長時間続けて歩くことが難しい高齢者などが、休憩場所・トイレ・坂道を考慮した経路を比較するための Web サービスの MVP です。

> 経路と休憩地点はプロトタイプ用の推定データです。トイレ情報には公式オープンデータを使用しますが、取得後に状況が変わる可能性があり、経路の安全性や設備の利用可否を保証しません。

公開デモ: [https://tokyo-pace.tokyo-pace.workers.dev](https://tokyo-pace.tokyo-pace.workers.dev)

## 解決する課題と対象

一般的な地図の所要時間・距離中心の比較に、最大連続歩行時間、休憩候補、トイレ候補、急坂、屋内休憩候補という判断軸を加えます。主な対象は長時間の連続歩行に不安がある高齢者と、その外出を支援する人です。MVP 対象地域は「新宿駅西口 → 東京都庁」と新宿中央公園周辺に限定しています。

## 実装内容

- 日本語のレスポンシブ UI、キーボードフォーカス、大きな操作領域
- Leaflet + OpenStreetMap の地図（通常ルートは破線、安心ルートは実線）
- 地図外にも経路比較カードと地点一覧を表示
- 条件に応じて推奨結果が変わる、説明可能で決定的なスコア計算
- デモ経路の連続歩行区間から、移動継続可能性・最大連続歩行時間・最長休憩空白・上限超過時間を導出
- 公式CSVをビルド前に取得・検証・正規化し、ルート近傍の公式トイレ候補を決定的に評価
- 公式公衆トイレ、車椅子使用者対応情報、推定休憩候補の地図フィルター
- 9,247原レコードを保持した、根拠のある表示候補地点グループ
- 距離帯、近接群、同一座標、空欄率等の品質監査JSON
- 公衆トイレだけを既定条件に使う種別別評価と、デモ折れ線上の最長トイレ空白
- `RouteProvider` 抽象と `DemoRouteProvider` によるルーティング実装の分離
- loading / error / retry 状態
- Vitest の評価ロジック単体テスト
- Cloudflare Workers の API 境界と SPA 静的アセット配信設定

## 技術構成

TypeScript 6、React 19、Vite 8、Leaflet / React Leaflet、Vitest、ESLint、Cloudflare Vite plugin / Wrangler を使用します。Node.js 22 以上（LTS 推奨）と npm が必要です。Cloudflare 公式の [React + Vite ガイド](https://developers.cloudflare.com/workers/framework-guides/web-apps/react/) に沿い、Vite plugin と `wrangler.jsonc` の SPA fallback を採用しています。

## セットアップとローカル起動（WSL Ubuntu）

```bash
cd /home/catlover/tokyo-pace
node --version  # v22 以上を確認
npm install
npm run dev
```

表示されたローカル URL（通常 `http://localhost:5173`）をブラウザーで開きます。背景地図の表示には OpenStreetMap タイルへのネットワーク接続が必要ですが、比較情報はローカルデータだけで表示されます。

## 品質チェック

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run preview
```

## 公式オープンデータの更新

```bash
npm run data:update
```

更新処理はブラウザではなく開発時のNode.jsスクリプトで行います。公式CSVを `data/raw/` に保存し、HTTPステータス、文字コード、必須ヘッダー、緯度経度を検証してから、全件版を `data/generated/official-toilets.json`、デモルートから直線距離350m以内の表示用データを `src/data/generated/official-toilets.json` に一時ファイル経由で置換します。失敗時は既存の正常な生成JSONを上書きしません。CSVの列変更で必須ヘッダー検証に失敗した場合は、提供元の最新仕様を確認して正規化処理とfixtureを更新してください。

## Cloudflare Workers へデプロイ

Cloudflare アカウントへログイン済みの環境で、プロジェクト名と `wrangler.jsonc` を確認してから実行します（このリポジトリには認証情報を保存しません）。

```bash
npx wrangler login
npm run deploy
```

`npm run deploy` はビルド後、Worker と SPA の静的アセットを一体で配布します。実運用前に独自ドメイン、ログ保持、セキュリティヘッダー、監視、データ更新手順を設計してください。

## データ、帰属、ライセンス

- 背景地図: © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)、ODbL。地図内の帰属表示を隠さないでください。
- [新宿区公衆トイレ一覧](https://catalog.data.metro.tokyo.lg.jp/dataset/t131041d0000000123): 新宿区、CC BY
- [公共施設等の車椅子使用者対応トイレ](https://catalog.data.metro.tokyo.lg.jp/dataset/t000054d0000000342): 東京都福祉局、CC BY
- 鉄道駅の車椅子使用者対応トイレ: 東京都福祉局、CC BY（同じ東京都カタログ掲載CSV）
- 詳細と取得状況は [オープンデータ一覧](docs/data-inventory.md) を参照してください。
- `data/processed/rest_spots.geojson` と経路は TOKYO PACE の推定デモデータです。営業時間・アクセシビリティ等の未確認属性は `null` / 「不明」です。
- 最大連続歩行時間と最長休憩空白は、`walkingSegments` に記録したデモ区間の歩行時間・距離から決定的に導出します。区間値も公式データや実測値ではありません。
- 公式トイレと推定休憩候補は `confidence` と構造化された出典情報で区別します。空欄は `false` にせず `null` とし、現地確認日は別の `fieldVerifiedAt` に保持します。
- リポジトリ全体の配布ライセンスは未決定です。第三者データを導入する前に、各ライセンスとの両立と表示要件を確認してください。

## セキュリティ上の注意

API キーや個人情報をコード・デモデータに含めません。`.env` と `.dev.vars` は Git 対象外です。本番化では入力検証、CSP 等の HTTP セキュリティヘッダー、依存関係監査、レート制御、外部 API のタイムアウトと障害時縮退を追加してください。

## 原レコード、候補地点、品質監査

原レコードは削除・統合しません。地図と評価では、同一座標相当の1m以内、または10m以内かつ正規化名称・住所が一致する場合だけ「表示上の候補地点」としてまとめます。これは同一施設との断定ではありません。公衆トイレ、公共施設内の設備情報、鉄道駅内の設備情報はそれぞれ `public_toilet`、`facility_toilet_information`、`station_toilet_information` として区別します。

`data/generated/open-data-audit.json` に、データセット別件数、距離帯、座標範囲、同一座標、近接群、名称・住所一致、空欄率を出力します。`officialToiletRecordCount` は原レコード数、`officialToiletPlaceCount` は表示・評価用の候補地点数です。

## トイレ種別評価と最長トイレ空白

既定のトイレ希望条件を満たすのは、デモルート折れ線から推定直線距離250m以内に `public_toilet` の候補地点がある場合だけです。`facility_toilet_information` と `station_toilet_information` は追加の公式設備情報として件数を表示しますが、一般利用や入場条件を確認できないため、既定条件を成立させません。

最長トイレ空白は、ルート開始点、250m以内にある公衆トイレ候補の折れ線への射影位置、ルート終了点を進行順に並べ、隣接する境界間のデモ折れ線上距離の最大値です。実際の徒歩経路、トイレまでの迂回、利用可否を表す値ではありません。

距離には2つの尺度があります。施設からルートまでの250m判定と最寄り距離は折れ線までの推定直線距離です。一方、ルート進行距離と最長空白は、折れ線上の位置比率をカードの `DemoRoute.distanceMeters` へ換算したルート沿い推定距離です。どちらも実際の道路ネットワーク上の徒歩距離ではありません。本番ルーティング導入後は、正規化値を各道路区間の距離へ置き換える予定です。

## 合理的な仮定と今後の予定

地点座標、経路形状、区間距離、区間歩行時間は UI と導出ロジックを検証する概略値です。公式掲載トイレ候補までの距離はルート折れ線への推定最短直線距離で、道路上の迂回距離ではありません。工事、故障、時間帯、入場制限等で利用できない場合があります。車椅子対応トイレの存在は経路全体の車椅子通行可能性を示しません。次の優先事項は現地検証、データ更新監視、標高による坂道評価、本番ルーティングプロバイダー、ユーザビリティ検証です。詳細は [サービスコンセプト](docs/service-concept.md) と [アーキテクチャ](docs/architecture.md) を参照してください。
