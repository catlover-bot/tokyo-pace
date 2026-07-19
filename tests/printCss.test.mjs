import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

describe("印刷用の情報量", () => {
  it("折りたたみ詳細を強制展開せず、比較表と選択カードを残す", () => {
    const printCss = styles.slice(styles.indexOf("@media print"));
    expect(printCss).toContain(".route-card-details { display: none !important; }");
    expect(printCss).not.toMatch(/\.route-card-details\s*\{[^}]*display:\s*(block|grid|flex)/);
    expect(printCss).toContain(".comparison-table-wrap { display: block !important;");
    expect(printCss).toContain(".route-card.selected { display: block;");
  });
});
