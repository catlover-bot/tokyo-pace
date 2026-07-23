# オープンデータ一覧

動的経路の道路形状・属性はopenrouteservice経由のOpenStreetMap由来情報です。利用者の通常検索レスポンスは施設manifestとは別の一時的なAPI／Cacheデータで、距離・所要時間・属性は検索時点の推定値です。現地確認候補順位だけは、再現性のため公開TOKYO PACE Workerから2026-07-23に一度取得した代表3経路を`data/routing-snapshots/shinjuku-west-to-tocho.v1.json`へ保存します。これは新しい公式オープンデータではなく、ODbL帰属を持つ開発用snapshotです。

| データセット | 提供者 | 形式・文字コード | ライセンス | 用途 |
|---|---|---|---|---|
| だれでも東京（7ジャンル） | 東京都デジタルサービス局 | CSV（宿泊UTF-8、ほかShift_JIS） | CC BY | バリアフリー掲載施設候補 |
| Tokyowater Drinking Station | 東京都水道局 | CSV・Shift_JIS | CC BY | 給水地点 |
| 新宿区公共施設情報 | 新宿区 | CSV・UTF-16LE | CC BY | 公共施設候補 |

## 現地確認入力と派生データ

| データ | 区分 | 保存先 | ライセンス・出典 | 公開範囲 |
|---|---|---|---|---|
| 休憩地点の現地確認履歴 | TOKYO PACEによる人手確認入力 | `data/field-verification/rest-spots.csv` | TOKYO PACE現地確認。元候補の公式source IDを保持 | 全履歴は開発・監査用。不要な個人情報を記録しない |
| 正規化済み確認地点 | TOKYO PACE生成データ | `data/generated/verified-rest-spots.json` | 元公式データと現地確認根拠を分離 | ブラウザ版はデモルート近傍の評価属性だけ。verifier/notesなし |
| 現地確認優先候補 | TOKYO PACE理論分析 | `data/generated/field-verification-candidates.json/.csv` | 元公式source ID、`generatedBy`を保持 | 改善・迂回・カテゴリ基準を満たす自然件数。0m・慎重施設・座標品質異常は理由付き除外。休憩可否の保証ではない |
| 候補順位の感度分析 | TOKYO PACE派生分析 | `data/generated/field-candidate-ranking-sensitivity.json/.csv` | 現地確認優先候補と同じ公式source IDを参照 | 3迂回proxy、15重み設定、順位範囲、上位5出現率、二軸・Pareto。利用可能性の確率ではない |
| 最終訪問候補 | TOKYO PACE派生分析 | `data/generated/field-visit-shortlist.json/.csv` | 感度分析のcandidate IDを参照 | 固定構成規則による5地点。現地確認結果や休憩可否を示さない |
| 代表動的3経路snapshot | OpenStreetMap / openrouteservice由来のTOKYO PACE Worker正規化結果 | `data/routing-snapshots/shinjuku-west-to-tocho.v1.json` | ODbL、© OpenStreetMap contributors / openrouteservice | 現地確認順位とE2Eの再現用。最新経路・実測経路ではない |
| 選択経路分析CSV/GeoJSON | 利用時に生成するTOKYO PACE分析 | ブラウザダウンロード | FeatureごとにOSM/ODbL、公式CC BY、TOKYO PACE派生を区別 | 選択中経路だけ |

現地確認CSVの初期状態はヘッダーのみで、2026-07-19時点の実確認結果は0件です。`true` / `false` / `null`を区別し、空欄は不明として扱います。確認日時だけ、公式掲載だけ、座席属性だけではconfirmedへ昇格しません。confirmed/supportedだけが厳格な休憩ネットワークへ入り、possible/estimatedは参考です。

現地確認候補は公式の公共施設・バリアフリー掲載施設を対象に、代表動的3経路での休憩空白改善と迂回下限を計算した派生値です。固定デモ値は回帰比較用に別配列へ保持します。施設からルートまでは推定直線距離、進行位置・空白・gross改善は各経路総距離へ正規化したルート沿い推定距離です。迂回調整はgrossから一方向の推定直線距離を引いた下限分析で、実道路の徒歩距離や往復距離ではありません。

感度分析では、一方向控除に加えて控除なしの`optimistic`と推定直線距離を2倍控除する`conservative_proxy`を保持します。往復proxyも実道路上の往復経路ではありません。順位集約は一方向控除を固定し、現行7重みを一要因ずつ0.8倍／1.2倍にした14設定と基準1設定の計15設定を使います。入力配列順はcandidate IDで正規化し、同点規則、JSONキー、CSV行順を固定します。33〜34mの片道控除後改善は30m基準をわずかに超えるため`marginal`であり、高改善とは扱いません。

Pareto非劣は、往復proxy改善・改善率・上位5出現率・ルート近接・一般利用目的の明確さ・公式source品質の定義済み軸で他候補に全面的に支配されないという意味です。shortlistはその結果を見て名称で手選択せず、学校・保育・福祉等、`ineffective`、既存抽出閾値未満を除き、頑健候補・公共目的枠・ホテル上限を順に適用します。ホテルや商業施設はshortlistに入っても、自由入館・着席・営業中を意味しません。

gross改善0m、迂回調整後30mまたは2.5%未満、代表動的経路から350m超、既存strict地点との重複、学校・保育・福祉等の慎重施設、座標品質異常は理由別に順位から除外します。候補件数を固定数へ合わせません。公園・一般公共目的を優先し、商業施設とホテルには利用条件確認の注意を付けます。ホテルは休憩可能とみなさず大幅減点します。

不明属性は`false`ではなく`null`とし、座席・屋内・自由利用をデータなしに推測しません。生成JSONには構造化された提供者、データセットURL、配布URL、ライセンス、更新・取得・現地確認日時を保持します。

取得日時、配布URL、SHA-256、バイト数、文字コードは`open-data-manifest.json`へ集約します。全件版は`data/generated/`、ブラウザ向け縮小版は`src/data/generated/`に分離し、後者には全件レコードを重複保存しません。

2026-07-18 時点の実装状況です。データセットの掲載と、設備が現在利用可能であることは同義ではありません。

| データ名 | 提供者 | 公式URL | データ形式・文字コード | 緯度経度 | データ更新日 | ライセンス | MVPでの用途 | 確認状況 | 注意事項 |
|---|---|---|---|---|---|---|---|---|---|
| 新宿区公衆トイレ一覧 | 新宿区 | [データセット](https://catalog.data.metro.tokyo.lg.jp/dataset/t131041d0000000123) / [CSV](https://www.city.shinjuku.lg.jp/content/000399974.csv) | CSV / UTF-16LE | あり | CSVに更新日列なし | CC BY | 公衆トイレ候補 | 取得・正規化済み | 車椅子情報の空欄は不明。現況未確認 |
| 公共施設等の車椅子使用者対応トイレ | 東京都福祉局 | [データセット](https://catalog.data.metro.tokyo.lg.jp/dataset/t000054d0000000342) / [CSV](https://www.opendata.metro.tokyo.lg.jp/fukushi/3_koukyoshisetsu_barieer_free_wc.csv) | CSV / Shift_JIS | あり（一部欠損） | レコード別に作成・変更年月 | CC BY | 車椅子使用者対応トイレ候補 | 取得・正規化済み | 公共施設を休憩可能施設とはみなさない。現況未確認 |
| 鉄道駅の車椅子使用者対応トイレ | 東京都福祉局 | [CSV](https://www.opendata.metro.tokyo.lg.jp/fukushi/R0606/02/4_tonaitetsudoueki_barrier-free-wc.csv) | CSV / Shift_JIS | あり（一部欠損） | レコード別に作成・変更年月 | CC BY | 駅構内の対応トイレ候補 | 取得・正規化済み | 改札・入場条件、現況、到達可能性は未確認 |
| OpenStreetMap | OpenStreetMap contributors | [Copyright and License](https://www.openstreetmap.org/copyright) | OSM XML / PBF 等 | あり | 継続更新 | ODbL | 背景地図 | 公式ライセンス確認 | タイル利用ポリシーと帰属表示が必要 |
| 国土地理院標高データ | 国土地理院 | [基盤地図情報](https://www.gsi.go.jp/kiban/) | GML 等 | あり | 未確認 | 国土地理院コンテンツ利用規約（適用範囲要確認） | 将来の坂道評価 | 未導入 | 精度・測地系・出典表記を要確認 |

## 取得と生成

`npm run data:update` が公式CSVを取得し、文字コード、必須ヘッダー、座標を検証します。元CSVは `data/raw/`、全件の正規化JSONは `data/generated/`、デモルートから直線距離350m以内に限定したアプリ同梱JSONは `src/data/generated/` に生成します。生成物には取得日時と出典を記録します。

空欄は `null`、明示的な「有・○」は `true`、「無・×」は `false` とします。座標欠損、不正数値、範囲外座標は理由をログに残して除外します。スキーマ変更で必須ヘッダーがなくなった場合は処理を停止し、既存の生成ファイルを維持します。

同じ更新処理で現地確認CSVも検証しますが、これは外部取得データではないため、公式CSVの`retrievedAt` manifestへ混在させません。入力SHA-256、バイト数、有効・除外件数、最新確認日時、confidence件数、除外理由はverified生成物の独立metadataへ記録します。決定性検証は生成JSONに加えて派生CSVも比較します。

## レコード分類と監査

新宿区公衆トイレを `public_toilet`、公共施設内の設備情報を `facility_toilet_information`、鉄道駅内の設備情報を `station_toilet_information` として保持します。後者2種から一般利用、改札外、営業時間内であることは推測しません。監査結果は `data/generated/open-data-audit.json`、全候補地点は `data/generated/official-toilet-places.json` に生成します。

ルート評価では `public_toilet` だけを既定のトイレ希望条件と最長トイレ空白に使用します。施設内・駅内設備情報は存在件数と最寄り公式設備情報距離を別に保持し、公衆トイレと同じ利用確実性があるとは扱いません。

## 現在の制約

ルートからトイレまでの距離は折れ線への最短直線距離です。道路上の迂回距離、通行可能性、安全性、営業時間内であること、故障していないこと、入場制限がないことは保証しません。車椅子使用者対応トイレがあっても、経路全体が車椅子で通行できるとは限りません。
