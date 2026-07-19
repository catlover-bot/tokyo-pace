export type BrowserDownloadDependencies = {
  Blob: typeof Blob;
  URL: Pick<typeof URL, "createObjectURL" | "revokeObjectURL">;
  document: Pick<Document, "createElement">;
};

export type TextDownload = {
  filename: string;
  mimeType: string;
  content: string;
};

const defaultDependencies = (): BrowserDownloadDependencies => ({
  Blob: globalThis.Blob,
  URL: globalThis.URL,
  document: globalThis.document,
});

export function downloadTextFile(download: TextDownload, dependencies: BrowserDownloadDependencies = defaultDependencies()): void {
  const blob = new dependencies.Blob([download.content], { type: `${download.mimeType};charset=utf-8` });
  const objectUrl = dependencies.URL.createObjectURL(blob);
  const anchor = dependencies.document.createElement("a");
  try {
    anchor.href = objectUrl;
    anchor.download = download.filename;
    anchor.rel = "noopener";
    anchor.click();
  } finally {
    anchor.remove();
    dependencies.URL.revokeObjectURL(objectUrl);
  }
}

export function safeDownloadFilename(routeId: string, extension: "csv" | "geojson"): string {
  const safeRouteId = routeId.normalize("NFKC").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "route";
  return `tokyo-pace-${safeRouteId}-analysis.${extension}`;
}
