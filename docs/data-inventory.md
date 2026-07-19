# オープンデータ一覧

動的経路の道路形状・属性はopenrouteservice経由のOpenStreetMap由来情報です。新しいオープンデータsnapshotは追加していません。経路レスポンスは施設manifestとは別の一時的なAPI／Cacheデータで、距離・所要時間・属性は検索時点の推定値です。

| データセット | 提供者 | 形式・文字コード | ライセンス | 用途 |
|---|---|---|---|---|
| だれでも東京（7ジャンル） | 東京都デジタルサービス局 | CSV（宿泊UTF-8、ほかShift_JIS） | CC BY | バリアフリー掲載施設候補 |
| Tokyowater Drinking Station | 東京都水道局 | CSV・Shift_JIS | CC BY | 給水地点 |
| 新宿区公共施設情報 | 新宿区 | CSV・UTF-16LE | CC BY | 公共施設候補 |

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

## レコード分類と監査

新宿区公衆トイレを `public_toilet`、公共施設内の設備情報を `facility_toilet_information`、鉄道駅内の設備情報を `station_toilet_information` として保持します。後者2種から一般利用、改札外、営業時間内であることは推測しません。監査結果は `data/generated/open-data-audit.json`、全候補地点は `data/generated/official-toilet-places.json` に生成します。

ルート評価では `public_toilet` だけを既定のトイレ希望条件と最長トイレ空白に使用します。施設内・駅内設備情報は存在件数と最寄り公式設備情報距離を別に保持し、公衆トイレと同じ利用確実性があるとは扱いません。

## 現在の制約

ルートからトイレまでの距離は折れ線への最短直線距離です。道路上の迂回距離、通行可能性、安全性、営業時間内であること、故障していないこと、入場制限がないことは保証しません。車椅子使用者対応トイレがあっても、経路全体が車椅子で通行できるとは限りません。
