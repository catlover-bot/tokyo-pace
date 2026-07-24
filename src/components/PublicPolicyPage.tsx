import { useEffect, type ReactNode } from "react";
import type { PublicPagePath } from "../domain/publicPage";
import { PublicPolicyLinks } from "./PublicPolicyLinks";
import { SkipLink } from "./SkipLink";

const revisionDate = "2026年7月24日";

type PolicyPageDefinition = {
  eyebrow: string;
  title: string;
  summary: string;
  content: ReactNode;
};

const privacyContent = (
  <>
    <section aria-labelledby="privacy-status">
      <h2 id="privacy-status">この方針の位置づけ</h2>
      <p>
        このページはTOKYO PACE製品版v1.0のプライバシー方針案です。
        公開前に法務確認と問い合わせ窓口の確定が必要であり、法令への準拠済み・適合済みを表明するものではありません。
      </p>
    </section>

    <section aria-labelledby="privacy-collected">
      <h2 id="privacy-collected">取得・処理する情報</h2>
      <ul>
        <li>利用者が選んだ出発地・目的地、歩行条件（経路候補の取得に必要な範囲）</li>
        <li>利用者が明示的に「現在地を使う」操作をした場合の位置情報</li>
        <li>リクエスト日時、リクエストID、APIの経路、HTTPメソッド、応答状態、処理時間、キャッシュ状態、上流サービスの応答区分、アプリ版などの運用情報</li>
        <li>対象範囲内・範囲外など、正確な座標へ戻せない粗い運用区分</li>
      </ul>
      <p>
        出発地・目的地は経路検索のためにクライアントからTOKYO PACEのWorkerへ送信されます。
        現在地はブラウザの許可と利用者の明示操作がある場合だけ取得し、経路取得後もクライアントの一時状態として扱います。
      </p>
    </section>

    <section aria-labelledby="privacy-not-collected">
      <h2 id="privacy-not-collected">取得・保存しない情報</h2>
      <ul>
        <li>利用者アカウント、氏名、メールアドレス、電話番号、決済情報</li>
        <li>正確な緯度経度を含む経路履歴の永続データ</li>
        <li>正確な緯度経度を含むアプリケーションのアクセスログ、分析ログ、エラーログ</li>
        <li>広告ID、SNSトラッカー、行動追跡のための識別子</li>
        <li>利用者が入力した自由文やリクエスト本文全体を運用ログへ保存すること</li>
      </ul>
      <p>
        TOKYO PACEは、アカウント、広告、個人追跡、SNSトラッキングを導入しません。
        アプリケーション自身はCookieを設定せず、経路や現在地をlocalStorage等へ永続保存しません。
        ただし、配信基盤がセキュリティ目的で処理する標準的な通信情報については、公開前にCloudflare側の設定と方針を確認します。
      </p>
      <p>
        経路検索の過度な連続実行を抑えるため、ブラウザのタブごとに匿名のランダムIDを生成し、sessionStorageだけに保持します。
        このIDはCookieやlocalStorageへ保存せず、タブのセッション終了後は引き継ぎません。
        WorkerではIDを一方向化してRate Limiting判定にだけ使用し、ID自体をサーバー保存、ログ記録、APIレスポンス返却しません。
        sessionStorageを利用できない場合だけ、IPアドレスを一時saltで一方向化した値へ縮退し、元のIPアドレスと生成した値は保存・記録しません。
      </p>
    </section>

    <section aria-labelledby="privacy-location">
      <h2 id="privacy-location">位置情報の利用目的と保存</h2>
      <p>
        位置情報は、指定地点間の歩行経路候補、ルート周辺の施設候補、距離・空白指標を計算する目的だけに使用します。
        正確な位置情報と検索履歴をデータベースへ保存せず、ブラウザのページ再読み込み・終了で失われる一時状態として扱います。
        経路検索の応答後も、再表示に必要な間だけ現在のページ内メモリーに残ります。
      </p>
    </section>

    <section aria-labelledby="privacy-logs">
      <h2 id="privacy-logs">サーバーログ</h2>
      <p>
        運用ログには、時刻、レベル、イベント名、リクエストID、APIの経路、メソッド、応答状態、処理時間、キャッシュ状態、上流サービス名・応答区分、アプリ版を記録します。
        APIキー、Authorization、Cookie、匿名セッションID、Rate Limiting用のhash、リクエスト本文全体、正確な座標、自由文、個人識別情報は記録しません。
        IPアドレスはTOKYO PACEのアプリケーションログへ保存しません。
      </p>
    </section>

    <section aria-labelledby="privacy-external">
      <h2 id="privacy-external">外部サービスとの関係</h2>
      <dl className="policy-definition-list">
        <div>
          <dt>OpenRouteService（ORS）</dt>
          <dd>
            TOKYO PACEのWorkerから、経路計算に必要な出発地・目的地と経路条件を送信します。
            APIキーはWorkerのSecretとして管理し、ブラウザへ公開しません。
          </dd>
        </div>
        <div>
          <dt>OpenStreetMap（OSM）</dt>
          <dd>
            地図と経路の基礎データに使用します。地図タイル取得時には、表示範囲と標準的なHTTP通信情報がタイル提供者へ送られる場合があります。
            OSMへの帰属表示を維持します。
          </dd>
        </div>
        <div>
          <dt>Cloudflare</dt>
          <dd>
            WebアプリとWorkerの配信・防御基盤です。ネットワーク層で処理される情報と保存期間は、公開前に本番設定およびCloudflareの契約・方針を確認します。
          </dd>
        </div>
      </dl>
    </section>

    <section aria-labelledby="privacy-retention">
      <h2 id="privacy-retention">保存期間</h2>
      <p>
        正確な位置情報と経路履歴は永続保存しません。運用ログは障害調査と不正利用対策に必要な最小期間だけ保持する方針です。
        具体的な保存期間は、公開前の法務・運用確認後にここへ明記します（現在の設定値：未確定）。
      </p>
    </section>

    <section aria-labelledby="privacy-contact">
      <h2 id="privacy-contact">問い合わせと改定</h2>
      <p>問い合わせ先：［公開問い合わせ窓口を設定予定］</p>
      <p>改定日：{revisionDate}</p>
      <p>重要な変更を行う場合は、このページの内容と改定日を更新します。</p>
    </section>
  </>
);

const termsContent = (
  <>
    <section aria-labelledby="terms-status">
      <h2 id="terms-status">この利用条件の位置づけ</h2>
      <p>
        このページは製品版v1.0の利用条件案です。公開前に法務確認が必要であり、
        有効な契約条項として確定済み、または特定の法令に準拠済みであるとは表明しません。
      </p>
    </section>

    <section aria-labelledby="terms-purpose">
      <h2 id="terms-purpose">サービスの目的</h2>
      <p>
        TOKYO PACEは、歩き続ける時間、休憩・給水・トイレ等の公式掲載候補を比較し、
        利用者が歩行経路候補を検討するための情報を提供します。医療判断、緊急時の避難誘導、移動の安全保証を目的とするものではありません。
      </p>
    </section>

    <section aria-labelledby="terms-limitations">
      <h2 id="terms-limitations">情報と経路候補の限界</h2>
      <ul>
        <li>表示する経路、距離、時間、施設候補は推定を含み、実際の道路状況や徒歩距離と一致しない場合があります。</li>
        <li>通行可否、段差、勾配、工事、混雑、天候、営業時間、入館条件、設備の故障や利用可否を保証しません。</li>
        <li>車いす対応設備の掲載は、経路全体を車いすで通行・到達できることを意味しません。</li>
        <li>緊急時や体調に不安がある場合は、現地の案内・公的機関・医療専門職等の情報を優先してください。</li>
      </ul>
    </section>

    <section aria-labelledby="terms-user">
      <h2 id="terms-user">利用者にお願いすること</h2>
      <p>
        現地の標識、交通規則、施設の案内、体調と周囲の安全を確認し、利用者自身の判断で経路を選択してください。
        サービスへの不正アクセス、過度な自動リクエスト、運用妨害、第三者の権利を侵害する利用は行わないでください。
      </p>
    </section>

    <section aria-labelledby="terms-external">
      <h2 id="terms-external">外部サービス・オープンデータ</h2>
      <p>
        経路計算にはOpenRouteService、地図にはOpenStreetMap、施設情報には東京都・新宿区等の公式オープンデータを使用します。
        各提供者の利用条件・ライセンスと帰属表示が適用されます。提供元の変更や障害により、候補の欠落や一時停止が発生する場合があります。
      </p>
    </section>

    <section aria-labelledby="terms-change">
      <h2 id="terms-change">提供内容の変更・停止</h2>
      <p>
        安全性、保守、上流サービス障害、データ更新等のため、サービス内容を変更または一時停止する場合があります。
        重要な変更は可能な範囲で画面やステータス情報に表示します。
      </p>
      <p>問い合わせ先：［公開問い合わせ窓口を設定予定］</p>
      <p>改定日：{revisionDate}</p>
    </section>
  </>
);

const dataPolicyContent = (
  <>
    <section aria-labelledby="data-status">
      <h2 id="data-status">方針の対象</h2>
      <p>
        この方針は、TOKYO PACEが公式オープンデータを取得・正規化・評価・表示する方法と、
        独自に導出する距離・空白・順位の意味を説明します。データの完全性や現地での利用可否を保証するものではありません。
      </p>
    </section>

    <section aria-labelledby="data-sources">
      <h2 id="data-sources">公式データと出典</h2>
      <p>
        東京都、新宿区等の公式提供元から取得したデータは、提供者、データセット名、配布URL、ライセンス、更新日、取得時の内容ハッシュをデータセット単位のmanifestへ保持します。
        OpenStreetMap由来の地図・経路情報は、公式施設データと区別し、必要な帰属表示を維持します。
      </p>
      <p>
        公衆トイレ、施設内設備情報、駅内設備情報、給水地点、バリアフリー施設、公共施設は意味を分けて扱います。
        公式データへの掲載だけで、自由な入館、着席、営業中、休憩可能、現地確認済みとは判断しません。
      </p>
    </section>

    <section aria-labelledby="data-processing">
      <h2 id="data-processing">取得・正規化・更新</h2>
      <ol>
        <li>更新スクリプトが公式配布データを取得し、文字コード・列・座標・必須属性を検証します。</li>
        <li>不明な属性はfalseと推測せずnullとして保持し、除外理由と件数を監査します。</li>
        <li>内容ハッシュが同じ場合は取得日時を維持し、同じ入力から同じJSONを生成します。</li>
        <li>更新に失敗した場合は直前の正常な生成物を維持し、古さをサービス状態として通知します。</li>
      </ol>
    </section>

    <section aria-labelledby="data-derived">
      <h2 id="data-derived">TOKYO PACEが導出する情報</h2>
      <ul>
        <li>施設からルートまでの距離は、折れ線への推定直線距離です。</li>
        <li>ルート上の空白は、折れ線上の射影位置をデモまたは経路の総距離尺度へ正規化した推定ルート沿い距離です。</li>
        <li>条件負担スコアと順位は決定的なルールで計算し、低いほど設定条件からの負担・ずれが小さいことを表します。</li>
        <li>休憩候補の信頼度は根拠別に分け、possibleやestimatedを「休憩できる」と断定しません。</li>
        <li>理論上の休憩地点追加位置は都市設備の検討用であり、設置可能な実在地点を保証しません。</li>
      </ul>
      <p>これらは実道路ネットワーク上の徒歩距離、実測値、将来の状態を保証するものではありません。</p>
    </section>

    <section aria-labelledby="data-client">
      <h2 id="data-client">ブラウザ表示と現地確認データ</h2>
      <p>
        ブラウザへは表示に必要なルート近傍の縮小データだけを同梱します。
        現地確認画面のチェック状態は一時的で、サーバーへ送信・保存しません。
        CSVは利用者の端末へダウンロードするだけで、取込・昇格手順を経る前の内容を「確認済み」と表示しません。
      </p>
    </section>

    <section aria-labelledby="data-review">
      <h2 id="data-review">更新状況・問い合わせ</h2>
      <p>
        公式データの更新が遅れている場合でもサービス全体を直ちに停止せず、更新状況と注意を表示します。
        データの訂正方法、再配布条件、ライセンス表示は公開前に各提供元および法務担当者の確認が必要です。
      </p>
      <p>問い合わせ先：［公開問い合わせ窓口を設定予定］</p>
      <p>改定日：{revisionDate}</p>
    </section>
  </>
);

const accessibilityContent = (
  <>
    <section aria-labelledby="accessibility-status">
      <h2 id="accessibility-status">目標と現在の状態</h2>
      <p>
        TOKYO PACEは、JIS X 8341-3:2016の適合レベルAAおよびWCAG 2.2のレベルAAを目標とします。
        これは準拠宣言・適合表明ではありません。自動試験と支援技術を使った手動確認を継続し、
        公開前に未完了項目と確認結果を更新します。
      </p>
    </section>

    <section aria-labelledby="accessibility-foundation">
      <h2 id="accessibility-foundation">実装している基盤</h2>
      <ul>
        <li>本文へ移動するスキップリンクと、header・nav・main・footerのランドマーク</li>
        <li>ページごとに一つのh1を置き、内容をh2以下の見出しで構造化</li>
        <li>フォームラベル、キーボード操作、見えるフォーカス表示、44pxを基準とする主要操作領域</li>
        <li>検索中の状態をrole="status"、経路取得エラーをrole="alert"で通知</li>
        <li>色だけに依存しない経路線種・凡例・テキスト説明と、地図外の経路比較・候補一覧</li>
        <li>狭い画面でのリフローと、prefers-reduced-motionに応じたアニメーション抑制</li>
      </ul>
    </section>

    <section aria-labelledby="accessibility-automated">
      <h2 id="accessibility-automated">自動・機械的に確認する項目</h2>
      <p>次をリリース確認の対象とします。ツール名の記載は、すべての確認が完了したことを意味しません。</p>
      <ul>
        <li>axe-coreによる重大なアクセシビリティ違反の検出（導入・実行結果をリリース記録へ残す）</li>
        <li>可能な範囲のHTML validation、ランドマーク、見出し階層、フォームラベル</li>
        <li>キーボードナビゲーション、フォーカス順、スキップリンク</li>
        <li>エラー通知、ステータス通知、操作対象サイズ</li>
        <li>320px・360px・390px幅と200%ズーム時のリフロー</li>
        <li>reduced motion、文字とUI部品のコントラスト</li>
      </ul>
    </section>

    <section aria-labelledby="accessibility-manual">
      <h2 id="accessibility-manual">手動で確認する項目</h2>
      <ul>
        <li>NVDA + Chromeでの読み上げ順、操作名、状態変化</li>
        <li>VoiceOver + Safariでの読み上げ順、操作名、状態変化</li>
        <li>200% zoomでの情報欠落・重なり・横スクロール</li>
        <li>keyboard onlyでの全操作、フォーカス位置、フォーカストラップの有無</li>
        <li>色覚特性が異なる場合にも、色以外で経路・状態を区別できること</li>
        <li>地図の代替テキストと、経路カード・比較表・候補一覧によるnon-map equivalent</li>
      </ul>
      <p>自動試験だけでは支援技術との互換性や理解しやすさを保証できないため、上記の手動確認を公開判定に含めます。</p>
    </section>

    <section aria-labelledby="accessibility-limitations">
      <h2 id="accessibility-limitations">既知の制約と連絡先</h2>
      <p>
        Leaflet地図は視覚的な操作量が多いため、同じ主要情報を地図外のカード・表・テキストでも提供します。
        地図タイル内の個別道路・施設の完全な代替説明や、すべての支援技術での検証は未完了です。
        アクセシビリティ上の問題を見つけた場合の公開問い合わせ先は、公開前に設定します。
      </p>
      <p>問い合わせ先：［公開問い合わせ窓口を設定予定］</p>
      <p>改定日：{revisionDate}</p>
    </section>
  </>
);

const pageDefinitions: Record<PublicPagePath, PolicyPageDefinition> = {
  "/privacy": {
    eyebrow: "プライバシー方針案",
    title: "プライバシー",
    summary: "位置情報、経路検索、運用ログを必要最小限に扱う方針を説明します。",
    content: privacyContent,
  },
  "/terms": {
    eyebrow: "公開前の利用条件案",
    title: "利用条件",
    summary: "TOKYO PACEの目的、経路・施設情報の限界、利用時の注意を説明します。",
    content: termsContent,
  },
  "/data-policy": {
    eyebrow: "データの取得・導出・表示",
    title: "データ方針",
    summary: "公式オープンデータとTOKYO PACE独自の推定・評価を区別して説明します。",
    content: dataPolicyContent,
  },
  "/accessibility": {
    eyebrow: "アクセシビリティ方針",
    title: "アクセシビリティ",
    summary: "目標、現在の基盤、自動・手動で確認する項目を公開します。",
    content: accessibilityContent,
  },
};

export function PublicPolicyPage({ page }: { page: PublicPagePath }) {
  const definition = pageDefinitions[page];

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${definition.title} | TOKYO PACE`;
    return () => {
      document.title = previousTitle;
    };
  }, [definition.title]);

  return (
    <>
      <SkipLink />
      <header className="site-header">
        <div className="header-inner">
          <a className="brand policy-brand" href="/" aria-label="TOKYO PACE 経路比較画面へ">
            <span className="brand-mark" aria-hidden="true">歩</span>
            <span>
              <span className="service-name">TOKYO PACE</span>
              <span className="tagline">最短ではなく、最後まで歩ける道へ</span>
            </span>
          </a>
          <span className="demo-badge">方針案</span>
        </div>
      </header>
      <main id="main-content" className="policy-page" tabIndex={-1}>
        <nav className="policy-return-nav" aria-label="画面切替">
          <a href="/">経路比較画面へ戻る</a>
        </nav>
        <header className="policy-page-intro">
          <p className="eyebrow">{definition.eyebrow}</p>
          <h1>{definition.title}</h1>
          <p>{definition.summary}</p>
        </header>
        <aside className="policy-draft-notice" aria-label="公開前の確認事項">
          <strong>公開前の方針案です</strong>
          <p>法務確認、公開問い合わせ先、本番設定の確認が必要です。法的準拠や適合を表明するページではありません。</p>
        </aside>
        <div className="policy-content">{definition.content}</div>
      </main>
      <footer>
        <strong>TOKYO PACE</strong>
        <p>経路・施設情報の限界を明示し、位置情報を必要最小限に扱います。</p>
        <PublicPolicyLinks currentPath={page} />
      </footer>
    </>
  );
}
