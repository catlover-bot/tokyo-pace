import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OfflineNotice } from "../src/components/OfflineNotice";
import { canSearchDynamicRoutes, OFFLINE_ROUTE_SEARCH_MESSAGE } from "../src/domain/networkStatus";

describe("オフライン時の安全な挙動", () => {
  it("オフラインでは動的検索を開始しない", () => {
    expect(canSearchDynamicRoutes(false)).toBe(false);
    expect(OFFLINE_ROUTE_SEARCH_MESSAGE).toContain("固定デモルート");
  });

  it("検索成功や保存済み経路と誤認させず固定デモへの操作を示す", () => {
    const html = renderToStaticMarkup(<OfflineNotice online={false} onFallback={() => undefined} />);
    expect(html).toContain("オフラインです");
    expect(html).toContain("最終取得ルートは保存せず");
    expect(html).toContain("固定デモルートを表示");
    expect(html).not.toContain("検索に成功");
  });

  it("オンライン時には案内を表示しない", () => {
    expect(renderToStaticMarkup(<OfflineNotice online onFallback={() => undefined} />)).toBe("");
  });
});
