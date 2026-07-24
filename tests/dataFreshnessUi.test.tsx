import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DataFreshnessNotice } from "../src/components/DataFreshnessNotice";
import { summarizeDataFreshness } from "../src/domain/dataFreshness";
import type { OpenDataManifest } from "../src/types";

const manifest = (retrievedAt: string): OpenDataManifest => ({
  schemaVersion: 1,
  datasets: [{
    datasetId: "shinjuku-public",
    datasetUrl: "https://example.test/dataset",
    resourceUrl: "https://example.test/resource.csv",
    retrievedAt,
    contentSha256: "a".repeat(64),
    byteSize: 10,
    normalizedRecordCount: 1,
    excludedRecordCount: 0,
    sourceUpdatedAt: null,
    encoding: "utf-8",
    license: "CC BY",
  }],
});

describe("データ鮮度表示", () => {
  it("currentを簡潔な日本語とlive regionで表示する", () => {
    const summary = summarizeDataFreshness(
      manifest("2026-07-20T00:00:00.000Z"),
      new Date("2026-07-24T00:00:00.000Z"),
    );
    const html = renderToStaticMarkup(<DataFreshnessNotice summary={summary} />);
    expect(html).toContain("データ更新済み");
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
  });

  it("staleでもサービス停止や利用可否を断定せず直前データを案内する", () => {
    const summary = summarizeDataFreshness(
      manifest("2025-01-01T00:00:00.000Z"),
      new Date("2026-07-24T00:00:00.000Z"),
    );
    const html = renderToStaticMarkup(<DataFreshnessNotice summary={summary} />);
    expect(html).toContain("一部データの更新が遅れています");
    expect(html).toContain("直前に正常生成できたデータ");
    expect(html).not.toContain("サービスを停止");
    expect(html).not.toContain("利用できる");
  });
});
