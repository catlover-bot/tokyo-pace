import { describe, expect, it, vi } from "vitest";
import { downloadTextFile, safeDownloadFilename, type BrowserDownloadDependencies } from "../src/domain/browserDownload";

describe("分析データのブラウザダウンロード", () => {
  it("Blob URLを使ってクリックし、必ずURLを解放する", () => {
    const click = vi.fn(); const remove = vi.fn(); const revokeObjectURL = vi.fn();
    const anchor = { href: "", download: "", rel: "", click, remove };
    const createObjectURL = vi.fn((blob: Blob) => {
      void blob;
      return "blob:analysis";
    });
    const dependencies = {
      Blob,
      URL: { createObjectURL, revokeObjectURL },
      document: { createElement: vi.fn(() => anchor) },
    } as unknown as BrowserDownloadDependencies;
    downloadTextFile({ filename: "analysis.csv", mimeType: "text/csv", content: "routeId\nstandard\n" }, dependencies);
    expect(anchor).toMatchObject({ href: "blob:analysis", download: "analysis.csv", rel: "noopener" });
    expect(click).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:analysis");
    expect(createObjectURL.mock.calls[0][0]).toBeInstanceOf(Blob);
  });

  it("クリックが失敗してもURLを解放する", () => {
    const revokeObjectURL = vi.fn();
    const dependencies = {
      Blob,
      URL: { createObjectURL: () => "blob:analysis", revokeObjectURL },
      document: { createElement: () => ({ href: "", download: "", rel: "", click: () => { throw new Error("click failed"); }, remove: vi.fn() }) },
    } as unknown as BrowserDownloadDependencies;
    expect(() => downloadTextFile({ filename: "analysis.geojson", mimeType: "application/geo+json", content: "{}" }, dependencies)).toThrow("click failed");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:analysis");
  });

  it("route IDを安全で決定的なファイル名へ変換する", () => {
    expect(safeDownloadFilename("standard", "csv")).toBe("tokyo-pace-standard-analysis.csv");
    expect(safeDownloadFilename("車いす / profile", "geojson")).toBe("tokyo-pace-profile-analysis.geojson");
    expect(safeDownloadFilename("***", "csv")).toBe("tokyo-pace-route-analysis.csv");
  });
});
