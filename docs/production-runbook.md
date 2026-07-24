# TOKYO PACE v1.0 本番運用Runbook

この文書は運用担当者が本番公開、障害対応、データ更新を安全に行うための手順です。Secretの実値、利用者の正確な位置、リクエスト本文、個人情報はRunbook、Issue、チャット、ログへ転記しません。公開問い合わせ先、法務判断、Cloudflareアカウント固有値は公開前に人間が確定してください。

## 1. 環境の分離

| 項目 | local | preview | production |
|---|---|---|---|
| `APP_ENV` | `local` | `preview` | `production` |
| API | 同一originの`/api` | Preview Workerの`/api` | 本番Workerの`/api` |
| 許可範囲 | 新宿デモ対象bbox | 本番と同じ | 新宿デモ対象bbox |
| 経路cache TTL | 60秒 | 300秒 | 900秒 |
| ORS timeout初期値 | 8秒 | 8秒 | 8秒 |
| データ | Git管理snapshot | リリース候補manifest | 承認済みmanifest |
| Secret | ローカルのGit非管理Secret | Preview専用Secret | Production専用Secret |
| Rate Limiting namespace | `2026072400` | `2026072401` | `2026072402` |
| Rate Limiting初期値 | 30検索／60秒 | 30検索／60秒 | 10検索／60秒 |
| Version Metadata | 明示的なlocal fallback | `CF_VERSION_METADATA` | `CF_VERSION_METADATA` |

環境別の設定の正本は[`wrangler.jsonc`](../wrangler.jsonc)、安全な初期値の説明は[`config/runtime-environments.example.json`](../config/runtime-environments.example.json)です。`APP_VERSION`、`BUILD_COMMIT`、`DATA_MANIFEST_VERSION`をリリースごとに固定します。Worker Version ID、tag、timestampは`CF_VERSION_METADATA`から取得し、人間が変数へ転記しません。ローカルだけは`local_fallback`を明示します。

`OPENROUTESERVICE_API_KEY`は`wrangler.jsonc`の各環境でrequired Secretとして名前だけを宣言します。PreviewとProductionで同じSecretを使い回さず、Secret値を設定ファイル、CI出力、ログ、レスポンスへ書きません。Secretを設定する担当者は、値を表示する確認ではなく、環境別の設定操作が成功したことと少数の経路検索だけを確認します。

```bash
npx wrangler secret put OPENROUTESERVICE_API_KEY --env preview
npx wrangler secret put OPENROUTESERVICE_API_KEY --env production
```

2コマンドにはそれぞれの環境専用値を入力します。shell historyへ値を引数として書かず、設定後に値を読み戻しません。

ブラウザのAPI endpointは全環境でsame-originの`/api/routes`です。環境固有のORS URLやAPIキーをVite変数としてブラウザへ渡しません。これによりCORS許可範囲を不必要に広げず、Secretと上流構成をWorker境界の内側に保ちます。PreviewはPreview Worker自身、ProductionはProduction Worker自身の`/api`へ接続します。

Cloudflare Dashboardで、人間が次を環境ごとに設定します。

- Worker名、RouteまたはCustom Domain、互いに独立したPreview/Production環境
- 非Secret bindingの`APP_ENV`、`APP_VERSION`、`BUILD_COMMIT`、`DATA_MANIFEST_VERSION`
- `ROUTE_CACHE_TTL_SECONDS`、`ORS_TIMEOUT_MILLISECONDS`と許可対象範囲
- 環境ごとの`OPENROUTESERVICE_API_KEY` Secret
- `wrangler.jsonc`どおりの`ROUTE_RATE_LIMITER`と環境別namespace
- `CF_VERSION_METADATA` Version Metadata binding
- Observabilityの有効化、ログ保持期間、アラート通知先

設定後はSecret値を表示する確認をせず、`/api/version`と`/api/status`の公開情報だけで環境を照合します。

### API保護の初期値

`/api/routes`の初期値は、body 32,768 bytes、始終点を含むwaypoint 2点、直線距離8,000m、同時検索4件です。1検索は最大3 profileを上流へ要求するため、同時検索4件は通常の手動比較を妨げず、単一isolateからの上流同時要求を最大12本に抑える値です。ORSはprofileごとに8秒でtimeoutし、429・5xx・通信失敗だけを最大1回retryします。待機は250msからの決定的な指数backoffと`Retry-After`の大きい方を使い、Worker占有を避けるため2秒を上限とします。同一profileの連続3回失敗でcircuitを30秒openにし、その後は単一のhalf-open probeで回復を確認します。

rate limitはlocal / previewが60秒あたり30検索、productionが1利用主体あたり60秒あたり10検索です。1検索は最大3 profileに加えて限定retryを発生させ得るため、本番初期値は上流への集中を抑える10検索とします。公開後は429率、cache hit率、上流制限、通常利用の検索回数を座標・IPなしの集計で確認します。値を変える場合は、`wrangler.jsonc`のbindingとruntime fallbackを同じ変更で揃え、Preview負荷確認と承認を行います。

`ROUTE_RATE_LIMITER`のnamespace IDはlocal=`2026072400`、preview=`2026072401`、production=`2026072402`です。いずれも正の整数文字列で、環境をまたいだ利用数の混在を避けます。namespace IDの差し替えが必要になった場合は、正本である`wrangler.jsonc`、契約テスト、Runbookを同じ変更としてレビューします。

ブラウザは初回検索時に小文字UUID v4を生成し、`sessionStorage`の`tokyo-pace.anonymous-route-session.v1`へそのページセッション中だけ保持します。`x-tokyo-pace-session-id`でWorkerへ送り、Cookie、`localStorage`、サーバー保存、ログ、レスポンスには使用しません。Workerは36文字、小文字、version 4、variant 8/9/a/bを検証してからSHA-256化します。不正な匿名IDは拒否し、任意文字列による制限回避を許しません。

匿名IDが欠落した場合だけ、Worker isolateごとの一時saltと接続元IPから不可逆なfallback keyを作ります。raw IP、一時salt、fallback keyを永続化、ログ出力、レスポンス返却せず、fallback使用件数だけを`local_edge_instance` scopeのメトリクスとして数えます。fallbackは共有回線の複数利用者を同じ主体とみなして誤制限する可能性があります。この場合も制限値を回避するためにraw IPを保存せず、通常ブラウザの匿名セッションIDを優先します。

Cloudflare Rate Limiting bindingによる判定は`cloudflare_rate_limit_namespace` scopeで`authoritative: true`です。bindingが利用できない場合の固定windowは`local_edge_instance` scopeで`authoritative: false`であり、全edgeをまたぐ利用数ではありません。両者を運用画面や障害報告で混同しません。

## 2. リリース前チェック

Node.js 22以上とlockfileどおりの依存を用意し、外部ORSへ接続しないゲートを実行します。

```bash
npm ci
npx playwright install chromium
npm run verify:production
```

ゲートは保存済みraw snapshotの決定性、型、lint、単体、API契約、build、bundle budget、危険コード、Secretらしい値、アクセシビリティ静的検査、Playwright + axeのcritical/serious違反検査、mock E2E、`git diff --check`を順に実行し、最初の失敗で停止します。`data:update`、実ORS、Secret、deployは呼びません。CIも`.github/workflows/production-verification.yml`から同じゲートをSecretなしで実行します。

次は本番release blockerです。Release Candidateのコード検証が成功しても、一つでも該当すれば本番trafficへ反映しません。

- `/privacy`、`/terms`、`/data-policy`、`/accessibility`または連絡先に問い合わせ先placeholderが残る
- Productionのrequired Secret `OPENROUTESERVICE_API_KEY`が未設定
- Productionの`ROUTE_RATE_LIMITER`またはnamespace `2026072402`が未定義・不一致
- `CF_VERSION_METADATA` bindingが未定義、または`/api/version`で取得不能
- 方針ページの改定日が未設定
- `APP_ENV=production`でdebug logが有効
- `/api/status`がedge instanceのcache、circuit、fallback limiterをサービス全体の状態として表示する

Secretの実値は自動検査やチェックリストへ出力しません。bindingとSecretはCloudflareの設定有無、公開APIの安全なmetadata、少数のsmoke testで確認します。法務レビューの完了はコードや自動テストだけでは証明できないため、人間の承認記録を別に必要とし、法令準拠済み・法務承認済みとはこのRunbookで断定しません。

問い合わせ先placeholderが残る間、`release:preview`はCloudflareへのupload前に意図どおり停止します。公開窓口を人間が確定し、方針ページと承認記録を更新するまでは、このblockerを無効化・迂回しません。

リリース判定には次も必要です。

- 変更内容と禁止対象（スコア、順位、昇格規則、公式原レコード）のレビュー
- `/privacy`、`/terms`、`/data-policy`、`/accessibility`の法務・運用レビュー
- Previewでデスクトップ、390px、keyboard-only、200% zoomを確認
- NVDA + Chrome、VoiceOver + Safari、色覚、地図外の同等情報を人手確認
- manifestのバージョンと鮮度警告を確認
- bundle budget超過がないこと。閾値変更は理由、前後サイズ、承認者を記録

## 3. Version Previewと本番反映

Release Candidateは本番へ即時deployせず、次の順序でCloudflare Version Previewを作成します。

```bash
npm run release:preview
```

このスクリプトは`verify:production`、`CLOUDFLARE_ENV=production`でのbuild、release blocker検査、Production required Secret名の確認、`wrangler versions upload`の順に実行します。build後は、正本の`wrangler.jsonc`からViteが生成した`dist/*/wrangler.json`のうち、production環境、Worker名、assets、10検索／60秒のRate Limiting、Version Metadata bindingが一致する唯一の設定だけをuploadに使います。source設定を直接uploadしたり、別環境の古い生成設定を推測で使ったりしません。`versions upload`とpreview aliasを使うため本番trafficは変更しません。preview alias／tagは`production-v1-rc`です。成功時はCloudflare Version IDと`Version Preview Alias URL`を表示します。表示したVersion IDは`/api/version`の`CF_VERSION_METADATA`と照合し、人が入力したWorker Version IDを信頼しません。

従来の`npm run deploy`は、release blocker・Version Preview・承認を迂回するため明示的に失敗します。本番trafficの変更は、このRunbookの確認と承認後に対象Version IDを指定して人間が実行します。このリポジトリの通常スクリプトから暗黙にdeployしません。

取得したURLに対し、通常のsmoke testを実行します。

```bash
npm run smoke:preview -- <PREVIEW_URL>
```

通常モードでは次を確認し、外部ORSへ接続しません。

- `GET /api/health`、`GET /api/status`、`GET /api/version`
- `/privacy`、`/terms`、`/data-policy`、`/accessibility`
- 保存済みmock fetchへ実際の`POST` Requestを渡す`/api/routes`正常系と一部profile失敗契約
- Secret、stack、正確な座標がレスポンスへ露出しないこと
- requestId、Cache-Control、OSM attribution
- 404、method制限、content-type制限

実ORS確認は次のように`--live-ors`を明示した場合にだけ1回実行します。

```bash
npm run smoke:preview -- <PREVIEW_URL> --live-ors
```

公開URL、座標、レスポンス本文、Secretを台帳へ転記せず、成功・失敗、時刻、Version IDだけを記録します。通常CIは常にmockを使用します。

Preview確認後の流れは次のとおりです。

1. 本番対象commit、app version、manifest hash、Cloudflare Version ID、承認記録をリリース台帳へ記録する。
2. Previewのstatus scope、Version Metadata、方針4ページ、デスクトップ／390px、keyboard、固定デモ切替、OSM帰属を確認する。
3. 前節のrelease blockerがすべて解消したことを、運用・セキュリティ・法務の各担当が役割ごとに確認する。
4. 承認者が対象Version IDを明示して本番trafficへの反映を実行する。Preview uploadをそのまま自動昇格しない。
5. 本番のhealth / status / version、静的ページ、少数の経路検索、固定デモ切替、OSM帰属を確認する。

このGoalではVersion Previewのuploadも本番trafficへの反映も実行しません。

## 4. Rollback

1. 新規検索を止める必要があるかを判断し、必要ならCloudflare側で一時的に`/api/routes`を制限する。health/status/versionと静的注意画面は残す。
2. Cloudflare Deploymentsで直前の正常Worker versionとassetsを選び、Rollbackする。CLIを使う場合はインストール済みWranglerの`--help`で当該versionのrollback構文を確認してから実行する。
3. `/api/version`のdeployment version、`/api/status`のmanifest、固定デモ切替を確認する。
4. 原因、開始・検知・復旧時刻、影響、requestId例（座標なし）、rollback先versionを台帳へ残す。
5. 修正は別PRと通常ゲートを通し、失敗リリースへ直接上書きしない。

オープンデータだけを戻す場合は、直前の承認済みcommitの`data/raw`、`data/generated`、`src/data/generated`を一組として復元します。manifestだけ、またはブラウザ縮小版だけを個別に戻しません。

## 5. Secret rotation

1. ORS管理画面で新しいキーを作成する。旧キーを先に無効化しない。
2. Previewの`OPENROUTESERVICE_API_KEY` Secretを更新し、経路3profileとエラー非露出を確認する。
3. Production Secretを更新し、deploymentを再読込する。
4. health/status/versionと少数の手動検索を確認する。Secret値やAuthorization headerはログへ出さない。
5. 旧キーを無効化し、ローテーション時刻と担当役割だけを台帳へ記録する。

漏えいの疑いがある場合は先にキーを無効化し、経路検索を一時停止して固定デモへの明示切替を案内します。Secret値を調査チケットへ貼り付けません。

## 6. ORS障害、timeout、429、5xx

### ORS timeout・通信障害

- `/api/status`でcircuit stateとwarningを確認する。healthはORSを呼ばないため、healthだけをORS正常の根拠にしない。
- 取得できたprofileがある場合は部分候補を表示し、欠落profileを明示する。
- 全profile失敗時は固定デモへの明示切替を案内する。成功したように見せない。
- timeoutを安易に増やさない。増加は待ち時間、Worker concurrency、ORS制限を評価して設定変更レビューを通す。

### 429増加

- `UPSTREAM_RATE_LIMITED`とアプリ側429をrequestId、時刻、件数で分ける。IPと座標は保存しない。
- `Retry-After`が返ることを確認し、利用者へ連続再試行を促さない。
- cache hit率、同一検索の重複抑制、circuit stateを確認する。
- Cloudflare rate limit値の変更は通常利用への影響をレビューし、人間がDashboardで行う。

### 5xx増加

- Worker 5xxかORS 5xxかを`event`、`upstreamStatus`、requestIdで区別する。
- stack、上流本文、自由文、正確な座標は台帳へ転記しない。
- 最新deployment直後ならrollbackを優先する。ORS側ならcircuit breakerと固定デモ案内を維持する。
- 影響が継続する場合は公開status文を更新する。問い合わせ先は公開前に決める。

## 7. Cache

cache keyは始終点を小数6桁（東京付近で丸め変位をおおむね0.1m未満に抑える粒度）へ丸め、全profile、経路・評価へ影響するpreferences、API schema versionを決定的に含めます。APIキー、requestId、自由文は含めません。local / preview / productionのWorker内部cache TTLは60 / 300 / 900秒です。hit / miss / bypass / deduplicatedを構造化ログへ残しますが、生のcache keyや座標はログへ出しません。内部cache本文にrequestIdを保存せず、応答時に新しいrequestIdを付与します。座標を含む利用者向けレスポンスは常に`Cache-Control: private, no-store`とし、ブラウザや共有中間cacheへ保存させません。

cache purgeは次の場合だけ行います。

- API schema、profile semantics、座標丸め、評価に使う経路属性が変わった
- 誤ったレスポンスがcacheされた
- ORS障害復旧後もstale responseが残る

Cloudflare Dashboardで対象cache namespaceを確認し、全消去が必要かをレビューします。purge時刻、範囲、理由を台帳へ記録します。アプリreleaseとmanifest更新だけでは、cache key versionが正しく変わる限り無条件の全消去は不要です。

## 8. データ鮮度と更新失敗

鮮度はmanifestのデータセット別`retrievedAt`を基準にします。未来日時、不正日時、更新失敗フラグは`update_failed`です。

| データ群 | `current` | `aging` | `stale` |
|---|---:|---:|---:|
| 新宿区系 | 45日以内 | 46〜120日 | 120日超 |
| Tokyowater Drinking Station | 120日以内 | 121〜240日 | 240日超 |
| だれでも東京・東京都車いす対応情報 | 180日以内 | 181〜365日 | 365日超 |

閾値は、区データは比較的細かな更新確認を要するため短く、給水は季節単位、東京都横断施設情報は半期単位の確認余裕を持たせています。上流の公表更新頻度が明確になった場合は`config/production-limits.json`とテストを同じPRで変更します。古さだけでサービスを停止せず、「データ更新済み」「更新確認中」「一部データの更新が遅れています」を表示します。

`data:update`失敗時は既存生成物を上書きしません。次を実施します。

1. 失敗dataset、HTTP／schema／encoding／座標等の理由コードを確認する。上流本文全体は保存しない。
2. 直前の正常なraw、全件生成、ブラウザ縮小版、manifestを維持する。
3. `update_failed` warningをstatusと運用台帳へ反映する。
4. 上流公式ページで変更を確認し、fixtureとnormalizerの修正PRを作る。
5. dry-run、決定性、全ゲートを通して人間が差分を承認する。

## 9. 定期更新設計

`.github/workflows/open-data-update-review.yml`は毎週火曜12:17 JSTに動きます。手動実行では既定`dry_run=true`で保存済みsnapshotだけを検証できます。定期実行は公式配布URLを取得しますが、ORS、Cloudflare Secret、APIキーは使いません。

更新の流れは次のとおりです。

1. `data:update`が公式bytesを取得し、encoding、必須schema、座標、件数を検証する。
2. raw SHA-256を旧manifestと比較し、同一内容では`retrievedAt`を維持する。
3. 一時ファイルへ全生成物を書き、全処理成功後だけ置換する。
4. 保存済みrawから2回生成し、全生成ファイルのSHA-256一致を確認する。
5. data testsと`git diff --check`を実行する。
6. patch、生成hash、manifest、audit JSONを14日間のActions artifactとして保存する。
7. 人間が件数、除外理由、schema、license、差分、鮮度を確認し、別ブランチ／PRへ反映する。
8. production gateと承認後にだけ通常releaseで公開する。

Workflowの`contents: read`を維持し、自動でmainへcommit／push／merge／deployしません。失敗はGitHub Actionsのfailed runとRepository notificationで通知します。外部通知先は公開前に人間が設定し、Secretなしで動く検証を壊さないよう任意連携にします。

手動再実行はActionsの「Open data update review」→ Run workflowで、最初にdry-run、次に必要な場合だけ`dry_run=false`を選びます。Rollbackは直前の承認済み生成物一式へ戻します。監査JSONにはrun ID、mode、status、manifest SHA-256、変更ファイル、作成時刻を含め、Secretやデータ本文を含めません。

## 10. オフライン時の安全な挙動

- API検索を成功表示せず、通信状態を確認する固定文面と再試行を表示する。
- 利用者が明示的に固定デモへ切り替えられる状態を維持する。
- 最終取得ルート、位置情報、検索履歴をService Worker、IndexedDB、localStorageへ保存しない。
- オープンデータ全件を無制限にcacheしない。ブラウザ同梱縮小データだけをrelease単位で配布する。
- staleな静的情報を表示する場合は更新遅延を明示し、最新情報のように見せない。

## 11. Incident logging

台帳の必須項目は、incident ID、開始／検知／復旧時刻、環境、app/deployment/manifest version、分類、影響、requestId例、対応、rollback／purge、再発防止、担当役割です。正確な座標、IP、Cookie、Authorization、リクエスト本文、自由文、Secret、stack、個人名を記録しません。

優先度の例:

- P1: 全検索停止、Secret漏えい疑い、誤った安全保証表示
- P2: 一部profile継続失敗、広範な429／5xx、著しいstale
- P3: 単一dataset更新失敗、軽微なUI／監視不備

公開statusは確認できた事実、影響範囲、次回更新時刻だけを書き、原因を推測しません。

## 12. Status確認

1. `/api/health`: Worker自身が軽量応答すること。ORS正常性は示さない。
2. `/api/status`: environment、version metadata、manifest、generated timestamp、freshness、circuit、cache、request deduplication、rate limiter、warning。
3. `/api/version`: app version、git commit、Cloudflare Version MetadataのID／tag／timestamp／source。

`/api/status`の状態は次のscopeとauthoritative属性を確認します。

| 項目 | scope | authoritative | 意味 |
|---|---|---:|---|
| `circuit` | `local_edge_instance` | `false` | 応答したWorker instance内のprofile circuit |
| `cache` | `cloudflare_edge_location`または`local_edge_instance` | `false` | 応答したedgeで観測できるcache |
| `cache.requestDeduplication` | `local_edge_instance` | `false` | 同じinstance内の同時要求集約 |
| `rateLimiter.cloudflareBinding` | `cloudflare_rate_limit_namespace` | `true` | 環境別namespaceに対するCloudflareの判定 |
| `rateLimiter.isolateFallback` | `local_edge_instance` | `false` | binding利用不能時だけの一時的な固定window |

`serviceStatus`は`no_known_degradation`または`degraded`で、`statusScope: "observed_worker_and_bound_resources"`、`authoritative: false`です。「サービス全体が正常」「ORS全体が正常」と読み替えません。`/api/health`もWorkerが応答できることだけを示します。

Version MetadataはCloudflareで利用可能な場合に`source`がbinding由来となり、ID、tag、timestampを返します。ローカルはID／tag=`local`、timestamp=`null`、`source: "local_fallback"`です。Preview / Productionでbindingが取得できない場合はID=`unavailable`、tag／timestamp=`null`、`source: "metadata_unavailable"`を返すため、release blockerとして扱います。

レスポンスにSecret、正確な位置、内部パス、stack、上流本文がないことを契約テストと手動確認で検証します。

## 13. Release checklist

- [ ] 対象commit、version、manifestを固定した
- [ ] `npm run verify:production`が成功した
- [ ] `npm run release:preview`が`production-v1-rc`だけを作成し、本番trafficを変更していない
- [ ] `npm run smoke:preview -- <PREVIEW_URL>`が成功した
- [ ] PreviewとProductionのrequired Secretを分離し、設定済みであることを値を表示せず確認した
- [ ] `ROUTE_RATE_LIMITER`がpreview=`2026072401`、production=`2026072402`で分離されている
- [ ] `CF_VERSION_METADATA`のID／tag／timestampをPreviewで照合した
- [ ] statusのlocal scope状態が`authoritative: false`で、全体状態として表示されていない
- [ ] Productionのlog levelが`info`で、debug logが無効である
- [ ] bundle budgetと生成差分をレビューした
- [ ] privacy／terms／data policy／accessibilityの改定日を設定し、問い合わせ先placeholderを置換した
- [ ] 方針ページを法務・運用レビューした（法令準拠済みとの自動判定ではない）
- [ ] desktop、390px、keyboard、200% zoom、screen readerを確認した
- [ ] health／status／versionの公開情報だけで環境を照合した
- [ ] ORS部分障害、全障害、429、offline、固定デモ切替を確認した
- [ ] rollback対象versionと担当者を確認した
- [ ] release／incident連絡先とstatus更新担当を確認した
- [ ] OSM attributionと第三者ライセンス表示を確認した

## 14. 人間が確定する値とContact escalation

次はリポジトリへSecretや個人情報として書かず、権限を持つ担当者が環境別に設定・承認します。

- PreviewとProductionそれぞれの`OPENROUTESERVICE_API_KEY` Secret値
- Cloudflare account、Route／Custom Domain、Preview URL、本番trafficへ反映するVersion ID
- `BUILD_COMMIT`へ渡す対象Git commit（Worker Version ID／tag／timestampは入力しない）
- Observabilityのログ保持期間、429／5xx／更新失敗の通知先と閾値
- 公開問い合わせ窓口、プライバシー方針上の保存期間、各方針の改定日
- ORS契約・料金上限、実ORS smoke testを行う担当者と実施時刻
- 法務・プライバシー・第三者ライセンスのレビュー結果
- 本番反映とrollbackの承認者、公開status更新担当

`ROUTE_RATE_LIMITER`のnamespace IDと初期limit、`CF_VERSION_METADATA`のbinding名、required Secret名は`wrangler.jsonc`で確定済みのため、人がDashboard上で別値へ置き換えません。差異があれば公開を止め、コードレビューを通して正本を変更します。

- サービス運用責任者: **公開前に設定**
- セキュリティ連絡先: **公開前に設定**
- オープンデータ更新担当: **公開前に設定**
- 法務／プライバシー確認: **公開前に設定**
- Cloudflareアカウント管理者: **公開前に設定**
- ORS契約／料金プラン管理者: **公開前に設定**
- 公開status更新担当: **公開前に設定**

法的準拠をこのRunbookだけで断定しません。公開文面、保存期間、問い合わせ先、利用規約、第三者サービスへの外部送信説明は法務確認が必要です。
