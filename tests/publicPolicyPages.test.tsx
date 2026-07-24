import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PublicPolicyPage } from "../src/components/PublicPolicyPage";
import { PublicPolicyLinks } from "../src/components/PublicPolicyLinks";
import { SkipLink } from "../src/components/SkipLink";
import {
  parsePublicPagePathname,
  publicPagePaths,
  type PublicPagePath,
} from "../src/domain/publicPage";

const renderPage = (page: PublicPagePath) =>
  renderToStaticMarkup(<PublicPolicyPage page={page} />);

describe("公開方針ページのパス判定", () => {
  it("4つの公開パスと末尾スラッシュを受け付ける", () => {
    for (const path of publicPagePaths) {
      expect(parsePublicPagePathname(path)).toBe(path);
      expect(parsePublicPagePathname(`${path}/`)).toBe(path);
    }
  });

  it("部分一致や未知のパスを公開方針ページとして扱わない", () => {
    expect(parsePublicPagePathname("/")).toBeNull();
    expect(parsePublicPagePathname("/privacy-extra")).toBeNull();
    expect(parsePublicPagePathname("/Privacy")).toBeNull();
  });
});

describe("プライバシー・利用条件・データ方針", () => {
  it("プライバシーに取得・非取得・位置・ログ・外部送信・保存期間を明記する", () => {
    const html = renderPage("/privacy");
    for (const text of [
      "取得・処理する情報",
      "取得・保存しない情報",
      "利用者が明示的に「現在地を使う」操作",
      "クライアントの一時状態",
      "正確な緯度経度を含む経路履歴の永続データ",
      "サーバーログ",
      "APIキー、Authorization、Cookie",
      "アプリケーション自身はCookieを設定せず",
      "ブラウザのタブごとに匿名のランダムID",
      "sessionStorageだけに保持",
      "ID自体をサーバー保存、ログ記録、APIレスポンス返却しません",
      "IPアドレスを一時saltで一方向化",
      "匿名セッションID、Rate Limiting用のhash",
      "広告、個人追跡、SNSトラッキングを導入しません",
      "OpenRouteService（ORS）",
      "OpenStreetMap（OSM）",
      "保存期間",
      "現在の設定値：未確定",
      "［公開問い合わせ窓口を設定予定］",
      "改定日：2026年7月24日",
    ]) {
      expect(html).toContain(text);
    }
  });

  it("利用条件が経路・設備の保証をせず法務確認前と示す", () => {
    const html = renderPage("/terms");
    expect(html).toContain("公開前に法務確認が必要");
    expect(html).toContain("通行可否、段差、勾配、工事、混雑、天候、営業時間、入館条件");
    expect(html).toContain("経路全体を車いすで通行・到達できることを意味しません");
    expect(html).toContain("OpenRouteService");
    expect(html).toContain("OpenStreetMap");
  });

  it("データ方針が公式掲載・推定・現地確認を混同しない", () => {
    const html = renderPage("/data-policy");
    expect(html).toContain("公式オープンデータとTOKYO PACE独自の推定・評価を区別");
    expect(html).toContain("自由な入館、着席、営業中、休憩可能、現地確認済みとは判断しません");
    expect(html).toContain("推定直線距離");
    expect(html).toContain("正規化した推定ルート沿い距離");
    expect(html).toContain("更新に失敗した場合は直前の正常な生成物を維持");
    expect(html).toContain("サーバーへ送信・保存しません");
  });

  it("4ページとも法的な準拠・適合を断定しない", () => {
    const html = publicPagePaths.map(renderPage).join("\n");
    expect(html).toContain("法務確認");
    expect(html).not.toMatch(/(?:TOKYO PACE|当サービス)は.{0,30}(?:法令に準拠しています|適合しています)/);
  });
});

describe("アクセシビリティ方針と基盤", () => {
  it("AAを目標として掲げ、準拠宣言ではないと示す", () => {
    const html = renderPage("/accessibility");
    expect(html).toContain("JIS X 8341-3:2016の適合レベルAA");
    expect(html).toContain("WCAG 2.2のレベルAA");
    expect(html).toContain("目標とします");
    expect(html).toContain("準拠宣言・適合表明ではありません");
  });

  it("自動監査と手動監査の対象を列挙する", () => {
    const html = renderPage("/accessibility");
    for (const text of [
      "axe-core",
      "HTML validation",
      "キーボードナビゲーション",
      "フォーカス順",
      "スキップリンク",
      "ランドマーク",
      "フォームラベル",
      "エラー通知",
      "ステータス通知",
      "操作対象サイズ",
      "320px・360px・390px幅",
      "reduced motion",
      "コントラスト",
      "NVDA + Chrome",
      "VoiceOver + Safari",
      "200% zoom",
      "keyboard only",
      "色覚特性",
      "non-map equivalent",
    ]) {
      expect(html).toContain(text);
    }
  });

  it("スキップリンクとランドマーク、見出し、現在ページを機械可読にする", () => {
    const html = renderPage("/privacy");
    expect(html).toContain('<a class="skip-link" href="#main-content">');
    expect(html).toContain('<header class="site-header">');
    expect(html).toContain('<main id="main-content"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain("<footer>");
    expect(html).toContain('<nav class="policy-links" aria-label="サービス方針">');
    expect(html).toContain('href="/privacy" aria-current="page"');
    expect(html.match(/<h1>/g)).toHaveLength(1);
  });

  it("共通部品だけを描画してもスキップ先と方針リンクが明確である", () => {
    const skip = renderToStaticMarkup(<SkipLink />);
    const links = renderToStaticMarkup(<PublicPolicyLinks />);
    expect(skip).toContain('href="#main-content"');
    expect(links.match(/<a href="/g)).toHaveLength(4);
    expect(links).toContain("アクセシビリティ");
  });
});
