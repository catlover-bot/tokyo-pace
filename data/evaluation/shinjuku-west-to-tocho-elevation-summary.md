# 新宿駅西口 → 東京都庁：標高・坂道評価

取得日時: 2026-08-15T07:01:50.926Z

この文書の標高指標は国土地理院の標高タイルからTOKYO PACEが推定した値であり、現地測定値ではありません。

## 3経路の結果

| profile | 距離 | 時間 | 推定累積上昇 | 推定累積下降 | 推定最大勾配 | 推定5%以上上り | 推定8%以上上り | 推定最長連続上り | slopeBurden |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| standard | 819m | 589.9秒 | 2.9m | 7.8m | 7.3% | 25m | 0m | 25m | 7.3 |
| step_avoiding | 1147m | 825.6秒 | 3m | 7.9m | 2.4% | 0m | 0m | 75m | 7.6 |
| wheelchair_profile | 1171m | 789.5秒 | 3.4m | 8.3m | 3.2% | 0m | 0m | 100m | 9.2 |

- 最短: standard
- 最速: standard
- 推定累積上昇量が最少: standard
- 推定5%以上上り距離が最少: step_avoiding / wheelchair_profile
- 推定8%以上急上り距離が最少: standard / step_avoiding / wheelchair_profile
- 推定連続上りが最短: standard
- slopeBurdenが最低: standard

## standardとの直接差

| profile | 距離差 | 時間差 | 推定上昇差 | 推定5%以上差 | 推定8%以上差 | 推定連続上り差 | slopeBurden差 |
|---|---:|---:|---:|---:|---:|---:|---:|
| step_avoiding | +328m | +235.7秒 | +0.1m | -25m | 0m | +50m | +0.3 |
| wheelchair_profile | +352m | +199.6秒 | +0.6m | -25m | 0m | +75m | +1.9 |

## 推薦

| profile | 条件負担（設定なし） | comparisonScore（設定なし） | 条件負担（急坂回避） | slopeBurden | comparisonScore（急坂回避） |
|---|---:|---:|---:|---:|---:|
| standard | 10 | 10 | 45 | 7.3 | 52.3 |
| step_avoiding | 59.12 | 59.1 | 94.12 | 7.6 | 101.7 |
| wheelchair_profile | 50.9 | 50.9 | 50.9 | 9.2 | 60.1 |

- 「急坂を避けたい」なし: **standard**（comparisonScore 10）
- 「急坂を避けたい」あり: **standard**（comparisonScore 52.3）
- 推薦変更: **なし**。standardの「急坂を避けたい」ありcomparisonScore 52.3 は、次点wheelchair_profileの60.1より7.8低く、坂道差を加えても既存条件負担の差を逆転しません。

## slopeBurden感度分析

これは比較用ヒューリスティックの感度分析であり、医学的妥当性の検証ではありません。各係数を一つずつ0.8x、1.0x、1.2xへ変え、他の係数を固定しました。基準順序は standard → step_avoiding → wheelchair_profile です。全12条件での順序は**安定ではありません**。

| 変更係数 | 倍率 | slopeBurdenの昇順 | 基準順序との一致 |
|---|---:|---|---|
| ascent | 0.8x | standard → step_avoiding → wheelchair_profile | 安定 |
| ascent | 1.0x | standard → step_avoiding → wheelchair_profile | 安定 |
| ascent | 1.2x | standard → step_avoiding → wheelchair_profile | 安定 |
| uphill5 | 0.8x | standard → step_avoiding → wheelchair_profile | 安定 |
| uphill5 | 1.0x | standard → step_avoiding → wheelchair_profile | 安定 |
| uphill5 | 1.2x | step_avoiding → standard → wheelchair_profile | 変化 |
| uphill8 | 0.8x | standard → step_avoiding → wheelchair_profile | 安定 |
| uphill8 | 1.0x | standard → step_avoiding → wheelchair_profile | 安定 |
| uphill8 | 1.2x | standard → step_avoiding → wheelchair_profile | 安定 |
| longestUphill | 0.8x | step_avoiding → standard → wheelchair_profile | 変化 |
| longestUphill | 1.0x | standard → step_avoiding → wheelchair_profile | 安定 |
| longestUphill | 1.2x | standard → step_avoiding → wheelchair_profile | 安定 |

## 出典と限界

- 経路: © OpenStreetMap contributors / openrouteservice。TOKYO PACE公開Workerの正規化応答。
- 標高: 国土地理院の標高タイルを加工して作成。25m間隔再標本化、3点中央値平滑化。
- 経路・標高・勾配は取得日時時点の推定であり、現地の通行可能性や身体負担を保証しません。
- slopeBurdenはTOKYO PACEのヒューリスティックであり、医学的に検証されたモデルではありません。
- 欠損値はnull／不明のまま扱い、0へ置換しません。
