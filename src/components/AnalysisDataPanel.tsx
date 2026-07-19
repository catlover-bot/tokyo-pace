import { useMemo } from "react";
import type { EvaluatedRoute, OpenDataManifest, RestCandidate } from "../types";
import { downloadTextFile, safeDownloadFilename, type TextDownload } from "../domain/browserDownload";
import { buildRouteAnalysisDownloads } from "../domain/routeAnalysisExport";

export type VerifiedRestMetadata = {
  verifiedRestSpotCount?: number;
  effectiveCandidateCount?: number;
  fullCandidateCount?: number;
  candidateCount?: number;
  normalizedRecordCount?: number;
  confirmedCount?: number;
  supportedCount?: number;
  latestVerifiedAt?: string | null;
  lastVerifiedAt?: string | null;
  confidenceCounts?: Partial<Record<"confirmed" | "supported" | "possible", number>>;
};

type AnalysisDataPanelProps = {
  route: EvaluatedRoute;
  restCandidates: readonly RestCandidate[];
  manifest: OpenDataManifest;
  verifiedMetadata: VerifiedRestMetadata;
  generatedAt: string;
  downloadFile?: (download: TextDownload) => void;
};

function verifiedCount(metadata: VerifiedRestMetadata) {
  return metadata.verifiedRestSpotCount
    ?? metadata.effectiveCandidateCount
    ?? metadata.fullCandidateCount
    ?? metadata.candidateCount
    ?? (metadata.confirmedCount ?? metadata.confidenceCounts?.confirmed ?? 0)
      + (metadata.supportedCount ?? metadata.confidenceCounts?.supported ?? 0);
}

function latestVerification(metadata: VerifiedRestMetadata) {
  return metadata.latestVerifiedAt ?? metadata.lastVerifiedAt ?? null;
}

export function AnalysisDataPanel({
  route,
  restCandidates,
  manifest,
  verifiedMetadata,
  generatedAt,
  downloadFile = downloadTextFile,
}: AnalysisDataPanelProps) {
  const downloads = useMemo(() => buildRouteAnalysisDownloads({ route, restCandidates, manifest, generatedAt }), [route, restCandidates, manifest, generatedAt]);
  const count = verifiedCount(verifiedMetadata);
  const lastVerifiedAt = latestVerification(verifiedMetadata);

  return <details className="analysis-data-panel">
    <summary>分析データ</summary>
    <div className="analysis-data-content">
      <p><strong>選択中の経路：</strong>{route.name}</p>
      <dl className="analysis-data-status">
        <div><dt>現地確認済み地点数</dt><dd>{count}地点</dd></div>
        <div><dt>最終確認日</dt><dd>{lastVerifiedAt ? lastVerifiedAt.slice(0, 10) : "確認データなし"}</dd></div>
      </dl>
      <div className="analysis-download-actions" aria-label="選択中の経路分析をダウンロード">
        <button type="button" onClick={() => downloadFile({
          filename: safeDownloadFilename(route.id, "csv"),
          mimeType: "text/csv",
          content: downloads.csv,
        })}>CSVをダウンロード</button>
        <button type="button" onClick={() => downloadFile({
          filename: safeDownloadFilename(route.id, "geojson"),
          mimeType: "application/geo+json",
          content: downloads.geoJson,
        })}>GeoJSONをダウンロード</button>
      </div>
      <details className="analysis-data-preview">
        <summary>データ内容を見る</summary>
        <pre>{JSON.stringify(downloads.snapshot, null, 2)}</pre>
      </details>
      <section className="analysis-provenance" aria-labelledby={`analysis-provenance-${route.id}`}>
        <h3 id={`analysis-provenance-${route.id}`}>出典とライセンス</h3>
        <ul>{downloads.snapshot.sources.map((source) => <li key={`${source.sourceType}-${source.sourceDatasetId}`}>
          <strong>{source.provider}</strong>：{source.datasetName}／{source.license}<br />
          <small>{source.attribution}</small>
        </li>)}</ul>
        <p>manifest：{downloads.snapshot.manifestReference}</p>
      </section>
      <p className="metric-help">CSVとGeoJSONはTOKYO PACEの決定的な分析結果です。現地確認0件の場合、確認による改善を示す値は作成しません。</p>
      <p className="metric-help">休憩地点追加は理論上の配置候補です。実在する設置可能場所、施設の利用可否、実際の徒歩経路や安全性を保証しません。</p>
    </div>
  </details>;
}
