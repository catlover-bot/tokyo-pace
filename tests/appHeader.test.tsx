import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RoutePlanningApp } from "../src/App";

describe("利用者向けヘッダー", () => {
  it("サービス名を表示し、バージョン表記や空要素を残さない", () => {
    const html = renderToStaticMarkup(<RoutePlanningApp />);
    const header = html.match(/<header class="site-header">([\s\S]*?)<\/header>/)?.[1];

    expect(header).toContain("TOKYO PACE");
    expect(header).not.toContain("v1.0");
    expect(header).not.toMatch(/<(?:div|span|p)(?:\s[^>]*)?><\/(?:div|span|p)>/);
  });
});
