import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AnalysisDataPanel } from "../src/components/AnalysisDataPanel";
import { demoRoutes } from "../src/data/routes";
import { evaluateRoute } from "../src/domain/routeScore";
import type { OpenDataManifest, RoutePreferences } from "../src/types";

const generatedAt = "2026-07-19T03:04:05.000Z";
const preferences: RoutePreferences = { maxContinuousWalkingMinutes: 10, requireToilet: false, avoidSteepSlopes: false, preferIndoorRest: false };
const route = evaluateRoute({ ...demoRoutes[0], provider: "demo", sourceAttribution: "TOKYO PACE 固定デモデータ" }, preferences);
const manifest: OpenDataManifest = {
  schemaVersion: 1,
  datasets: [{ datasetId: "shinjuku-public", datasetUrl: "https://example.test/toilet", resourceUrl: "https://example.test/toilet.csv", retrievedAt: generatedAt, contentSha256: "fixture", byteSize: 1, normalizedRecordCount: 1, excludedRecordCount: 0, sourceUpdatedAt: null, encoding: "utf-16le", license: "CC BY" }],
};

const renderPanel = (verifiedMetadata: Parameters<typeof AnalysisDataPanel>[0]["verifiedMetadata"]) => renderToStaticMarkup(<AnalysisDataPanel
  route={route}
  restCandidates={[]}
  manifest={manifest}
  verifiedMetadata={verifiedMetadata}
  generatedAt={generatedAt}
/>);

describe("分析データパネル", () => {
  it("主画面を過密にしないnative detailsとして表示する", () => {
    const html = renderPanel({ verifiedRestSpotCount: 0, latestVerifiedAt: null });
    expect(html).toContain('<details class="analysis-data-panel">');
    expect(html).toContain("<summary>分析データ</summary>");
    expect(html).not.toContain('<details class="analysis-data-panel" open=""');
  });

  it("CSV・GeoJSON・内容確認の操作をbuttonとdetailsで提供する", () => {
    const html = renderPanel({ verifiedRestSpotCount: 0 });
    expect(html).toContain("CSVをダウンロード");
    expect(html).toContain("GeoJSONをダウンロード");
    expect(html).toContain("データ内容を見る");
    expect(html.match(/<button/g)).toHaveLength(2);
  });

  it("現地確認0件を正確に表示し改善を断定しない", () => {
    const html = renderPanel({ verifiedRestSpotCount: 0, latestVerifiedAt: null });
    expect(html).toContain("現地確認済み地点数");
    expect(html).toContain("0地点");
    expect(html).toContain("確認データなし");
    expect(html).toContain("現地確認0件の場合、確認による改善を示す値は作成しません。");
    expect(html).not.toContain("現地確認により改善しました");
  });

  it("確認地点数と最終確認日をmetadataから表示する", () => {
    const html = renderPanel({ confirmedCount: 2, supportedCount: 1, latestVerifiedAt: "2026-07-18T11:22:33.000Z" });
    expect(html).toContain("3地点");
    expect(html).toContain("2026-07-18");
  });

  it("確認履歴数ではなく重複を除いた有効地点数を表示する", () => {
    const html = renderPanel({ fullCandidateCount: 2, candidateCount: 1, normalizedRecordCount: 9 });
    expect(html).toContain("2地点");
    expect(html).not.toContain("9地点");
  });

  it("出典・ライセンスとmanifest参照を表示する", () => {
    const html = renderPanel({ verifiedRestSpotCount: 0 });
    expect(html).toContain("出典とライセンス");
    expect(html).toContain("新宿区");
    expect(html).toContain("CC BY");
    expect(html).toContain("data/generated/open-data-manifest.json");
  });

  it("理論上の候補と実在・利用可否を区別する", () => {
    const html = renderPanel({ verifiedRestSpotCount: 0 });
    expect(html).toContain("休憩地点追加は理論上の配置候補です。");
    expect(html).toContain("実在する設置可能場所、施設の利用可否、実際の徒歩経路や安全性を保証しません。");
  });
});
