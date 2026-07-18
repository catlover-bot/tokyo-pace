# TOKYO PACE

「最短ではなく、最後まで歩ける道へ」。TOKYO PACE は、長時間続けて歩くことが難しい高齢者などが、休憩場所・トイレ・坂道を考慮した経路を比較するための Web サービスの MVP です。

> 現在の経路・地点・設備情報はプロトタイプ用の推定データです。実測済み・公式データではなく、経路の安全性や設備の利用可否を保証しません。

公開デモ: [https://tokyo-pace.tokyo-pace.workers.dev](https://tokyo-pace.tokyo-pace.workers.dev)

## 解決する課題と対象

一般的な地図の所要時間・距離中心の比較に、最大連続歩行時間、休憩候補、トイレ候補、急坂、屋内休憩候補という判断軸を加えます。主な対象は長時間の連続歩行に不安がある高齢者と、その外出を支援する人です。MVP 対象地域は「新宿駅西口 → 東京都庁」と新宿中央公園周辺に限定しています。

## 実装内容

- 日本語のレスポンシブ UI、キーボードフォーカス、大きな操作領域
- Leaflet + OpenStreetMap の地図（通常ルートは破線、安心ルートは実線）
- 地図外にも経路比較カードと地点一覧を表示
- 条件に応じて推奨結果が変わる、説明可能で決定的なスコア計算
- デモ経路の連続歩行区間から、移動継続可能性・最大連続歩行時間・最長休憩空白・上限超過時間を導出
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

## Cloudflare Workers へデプロイ

Cloudflare アカウントへログイン済みの環境で、プロジェクト名と `wrangler.jsonc` を確認してから実行します（このリポジトリには認証情報を保存しません）。

```bash
npx wrangler login
npm run deploy
```

`npm run deploy` はビルド後、Worker と SPA の静的アセットを一体で配布します。実運用前に独自ドメイン、ログ保持、セキュリティヘッダー、監視、データ更新手順を設計してください。

## データ、帰属、ライセンス

- 背景地図: © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)、ODbL。地図内の帰属表示を隠さないでください。
- 候補データ: [オープンデータ候補一覧](docs/data-inventory.md) を参照してください。現在は候補を列挙した段階で、MVP の地点データには取り込んでいません。
- `data/processed/rest_spots.geojson` と経路は TOKYO PACE の推定デモデータです。営業時間・アクセシビリティ等の未確認属性は `null` / 「不明」です。
- 最大連続歩行時間と最長休憩空白は、`walkingSegments` に記録したデモ区間の歩行時間・距離から決定的に導出します。区間値も公式データや実測値ではありません。
- リポジトリ全体の配布ライセンスは未決定です。第三者データを導入する前に、各ライセンスとの両立と表示要件を確認してください。

## セキュリティ上の注意

API キーや個人情報をコード・デモデータに含めません。`.env` と `.dev.vars` は Git 対象外です。本番化では入力検証、CSP 等の HTTP セキュリティヘッダー、依存関係監査、レート制御、外部 API のタイムアウトと障害時縮退を追加してください。

## 合理的な仮定と今後の予定

地点座標、経路形状、区間距離、区間歩行時間は UI と導出ロジックを検証する概略値とし、現地の通行可否やバリアフリー状況を示さないものとしました。次の優先事項は、公式オープンデータの仕様・ライセンス確認、再現可能な取り込みスクリプト、現地検証、標高による坂道評価、本番ルーティングプロバイダー、ユーザビリティ検証です。詳細は [サービスコンセプト](docs/service-concept.md) と [アーキテクチャ](docs/architecture.md) を参照してください。
