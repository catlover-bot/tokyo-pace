import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FieldCheckPage } from "../src/components/FieldCheckPage";
import type { FieldVerificationCandidate } from "../src/types";

const base: FieldVerificationCandidate = {
  candidateId: "facility-a",
  verificationId: "fv-facility-a",
  name: "確認候補A",
  latitude: 35.6901,
  longitude: 139.694,
  address: "東京都新宿区西新宿A",
  routeIds: ["standard", "comfort"],
  primaryRouteId: "standard",
  distanceToRouteMeters: 38.4,
  routeProgressMeters: 410.2,
  currentLongestGapMeters: 819,
  expectedImprovedGapMeters: 430,
  expectedImprovementMeters: 389,
  expectedImprovementRatio: 0.475,
  selectionReasons: ["near_longest_rest_gap", "shared_by_multiple_routes"],
  officialSourceIds: ["shinjuku-public-facilities:record-1"],
  fieldCheckPriority: 1,
  routeMetrics: [{ routeId: "standard", distanceToRouteMeters: 38.4, routeProgressMeters: 410.2, currentLongestGapMeters: 819, expectedImprovedGapMeters: 430, expectedImprovementMeters: 389, expectedImprovementRatio: 0.475, distanceToSuggestedInsertionMeters: 12, insideLargestGap: true }],
};

const second: FieldVerificationCandidate = {
  ...base,
  candidateId: "facility-b",
  verificationId: "manual-verification-b",
  name: "確認候補B",
  address: null,
  routeIds: ["comfort"],
  distanceToRouteMeters: 72,
  fieldCheckPriority: 2,
};

function render(candidates: FieldVerificationCandidate[] = [second, base]) {
  return renderToStaticMarkup(<FieldCheckPage candidates={candidates} metadata={{ eligibleGroupCount: 126, candidateCount: candidates.length }} />);
}

describe("読み取り専用の現地確認画面", () => {
  it("候補を優先度順に表示する", () => {
    const html = render();
    expect(html.indexOf("確認候補A")).toBeLessThan(html.indexOf("確認候補B"));
    expect(html).toContain("候補順位 1位");
    expect(html).toContain("確認優先度 1");
  });

  it("地図上の情報を候補一覧にも完全に表示する", () => {
    const html = render([base]);
    for (const text of [
      "東京都新宿区西新宿A",
      "推定直線38m",
      "開始地点からルート沿い推定410m",
      "推定819m",
      "推定430m",
      "推定389m（47.5%）",
      "通常ルート / 安心ルート",
      "上記の単一指標の基準ルート",
      "現在の最長休憩空白区間に近い",
      "複数のデモルートから近い",
      "shinjuku-public-facilities:record-1",
      "fv-facility-a",
    ]) expect(html).toContain(text);
  });

  it("確認項目、出典、CSV記入用IDを明示する", () => {
    const html = render([second]);
    expect(html).toContain("現地で確認する項目");
    expect(html).toContain("一般利用の可否と入館条件");
    expect(html).toContain("公式データ出典");
    expect(html).toContain("combined_on_site_and_official");
    expect(html).toContain("CSV記入用 verificationId");
    expect(html).toContain("manual-verification-b");
    expect(html).toContain("住所情報なし");
  });

  it("サーバー書き込みUIを設けずCSVダウンロードだけを提供する", () => {
    const html = render();
    expect(html).toContain("入力用CSVテンプレートをダウンロード");
    expect(html).toContain("この画面から確認結果は送信されません。");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("<textarea");
  });

  it("個人情報、三値、距離、理論値の注意を表示する", () => {
    const html = render();
    expect(html).toContain("個人の連絡先や不要な個人情報を記入しないでください");
    expect(html).toContain("空欄をfalseとして扱いません");
    expect(html).toContain("実際の徒歩距離ではなく推定直線距離");
    expect(html).toContain("理論値");
    expect(html).toContain("実際の休憩可否や設置可能性を保証しません");
  });

  it("地図選択にnative buttonとaria-currentを使う", () => {
    const html = render([base]);
    expect(html).toContain("地図でこの候補を選択中");
    expect(html).toContain('aria-current="true"');
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>地図でこの候補を選択中<\/button>/);
  });

  it("候補なしを明示しダウンロードを無効化する", () => {
    const html = render([]);
    expect(html).toContain("現地確認候補はまだ生成されていません。");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>入力用CSVテンプレートをダウンロード<\/button>/);
  });

  it("未知の選定理由を捏造せずそのまま表示する", () => {
    const html = render([{ ...base, selectionReasons: ["独自の確認理由"] }]);
    expect(html).toContain("独自の確認理由");
  });
});
