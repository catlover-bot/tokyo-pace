import { lazy, Suspense, useMemo, useState } from "react";
import {
  fieldVerificationCandidateMetadata,
  fieldVerificationCandidates,
} from "../data/fieldVerificationCandidates";
import { openDataManifest } from "../data/openDataManifest";
import { createVerificationId, downloadFieldVerificationTemplate } from "../domain/fieldVerificationTemplate";
import type { FieldVerificationCandidate } from "../types";

const FieldCheckMap = lazy(() => import("./FieldCheckMap").then((module) => ({ default: module.FieldCheckMap })));

const reasonLabels: Record<string, string> = {
  near_longest_rest_gap: "現在の最長休憩空白区間に近い",
  near_suggested_rest_insertion: "理論上の休憩地点追加候補に近い",
  close_to_route: "デモルートからの推定直線距離が短い",
  official_facility: "公共施設またはバリアフリー施設として公式掲載されている",
  shared_by_multiple_routes: "複数のデモルートから近い",
  not_existing_confirmed: "既存のconfirmed地点と重複しない",
  deduplicated_place: "同一施設の近接候補をまとめた地点である",
};

const routeLabels: Record<string, string> = { standard: "通常ルート", comfort: "安心ルート" };
const checkItems = [
  "一般利用の可否と入館条件",
  "座席または明示的な休憩空間があるか",
  "屋内または雨を避けられる場所か",
  "給水設備・トイレ・車いす対応設備の有無",
  "確認時の営業時間と利用制限",
  "確認方法と公開可能な根拠資料",
];

type FieldVerificationCandidateMetadata = {
  generatedAt?: string;
  candidateCount?: number;
  eligibleGroupCount?: number;
  excludedCoordinateConflictPlaceCount?: number;
};

function sortFieldVerificationCandidates(candidates: readonly FieldVerificationCandidate[]): FieldVerificationCandidate[] {
  return [...candidates].sort((a, b) => a.fieldCheckPriority - b.fieldCheckPriority || a.candidateId.localeCompare(b.candidateId));
}

function formatFieldCheckReason(reason: string): string {
  return reasonLabels[reason] ?? reason;
}

function matchingManifestEntry(sourceId: string) {
  return [...openDataManifest.datasets]
    .sort((a, b) => b.datasetId.length - a.datasetId.length)
    .find((entry) => sourceId === entry.datasetId || sourceId.startsWith(`${entry.datasetId}:`) || sourceId.startsWith(`${entry.datasetId}-`));
}

function SourceList({ sourceIds }: { sourceIds: readonly string[] }) {
  if (sourceIds.length === 0) return <p>公式出典IDはありません。</p>;
  return <ul className="field-source-list">{[...sourceIds].sort().map((sourceId) => {
    const manifest = matchingManifestEntry(sourceId);
    return <li key={sourceId}><code>{sourceId}</code>{manifest && <> — <a href={manifest.datasetUrl} target="_blank" rel="noreferrer">公式データセット</a>（{manifest.license}）</>}</li>;
  })}</ul>;
}

export function FieldCheckPage({ candidates = fieldVerificationCandidates, metadata = fieldVerificationCandidateMetadata }: { candidates?: readonly FieldVerificationCandidate[]; metadata?: FieldVerificationCandidateMetadata }) {
  const orderedCandidates = useMemo(() => sortFieldVerificationCandidates(candidates), [candidates]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(orderedCandidates[0]?.candidateId ?? null);
  const [downloadStatus, setDownloadStatus] = useState("");
  const selectedCandidate = orderedCandidates.find((candidate) => candidate.candidateId === selectedCandidateId) ?? orderedCandidates[0];
  const selectCandidate = (candidateId: string) => setSelectedCandidateId(candidateId);
  const downloadTemplate = () => {
    downloadFieldVerificationTemplate(orderedCandidates);
    setDownloadStatus(`${orderedCandidates.length}候補を記入済みのCSVテンプレートを生成しました。`);
  };

  return <>
    <header className="site-header"><div className="header-inner"><div className="brand"><span className="brand-mark" aria-hidden="true">歩</span><div><p className="service-name">TOKYO PACE</p><p className="tagline">現地確認支援</p></div></div><span className="demo-badge">読み取り専用</span></div></header>
    <main className="field-check-page">
      <nav className="field-check-nav" aria-label="画面切替"><a href="/">経路比較画面へ戻る</a></nav>
      <section className="field-check-intro" aria-labelledby="field-check-title">
        <p className="eyebrow">Field verification</p>
        <h1 id="field-check-title">現地確認候補リスト</h1>
        <p>新宿駅西口から東京都庁・新宿中央公園周辺の固定デモルートについて、休憩空白を改善する可能性がある公式施設候補を確認するための画面です。候補掲載は、自由な入館・着席・営業中であることを示しません。</p>
        <aside className="field-readonly-notice"><strong>この画面から確認結果は送信されません。</strong><p>CSVをダウンロードして人間が現地で確認し、管理された更新手順で取り込みます。verifier欄には個人の連絡先や不要な個人情報を記入しないでください。</p></aside>
        <div className="field-check-summary"><p><strong>{orderedCandidates.length}地点</strong><span>優先確認候補</span></p><p><strong>{metadata.eligibleGroupCount ?? metadata.candidateCount ?? orderedCandidates.length}候補群</strong><span>重複候補をまとめた抽出対象</span></p><p><strong>{metadata.excludedCoordinateConflictPlaceCount ?? 0}地点</strong><span>同一座標の品質異常として順位から除外</span></p></div>
        <div className="field-download-actions"><button type="button" onClick={downloadTemplate} disabled={orderedCandidates.length === 0}>入力用CSVテンプレートをダウンロード</button><p>三値の未確認項目は空欄のままです。空欄をfalseとして扱いません。</p></div>
        <details className="field-method-guide"><summary>CSVのverificationMethod（確認方法コード）</summary><dl><div><dt><code>on_site_observation</code></dt><dd>現地で観察した確認</dd></div><div><dt><code>combined_on_site_and_official</code></dt><dd>現地観察と公式情報を組み合わせた確認</dd></div><div><dt><code>official_source_review</code></dt><dd>公式情報だけの確認。単独ではconfirmed / supportedへ昇格しません</dd></div><div><dt><code>staff_confirmation</code></dt><dd>施設担当者への確認。単独ではconfirmed / supportedへ昇格しません</dd></div></dl><p>再確認時もverificationIdは重複しない値にしてください。</p></details>
        <p className="field-download-status" aria-live="polite">{downloadStatus}</p>
      </section>

      <section className="field-check-map-section" aria-labelledby="field-map-title">
        <div className="section-heading"><div><p className="eyebrow">地図</p><h2 id="field-map-title">デモルートと候補地点</h2></div><p className="map-note">候補までの距離は実際の徒歩距離ではなく推定直線距離です</p></div>
        <Suspense fallback={<div className="loading" role="status">現地確認候補の地図を読み込んでいます…</div>}><FieldCheckMap candidates={orderedCandidates} selectedCandidateId={selectedCandidate?.candidateId ?? null} onSelectCandidate={selectCandidate} /></Suspense>
        <div className="field-map-legend" aria-label="現地確認地図の凡例"><span><i className="field-route-key standard" aria-hidden="true" />通常ルート</span><span><i className="field-route-key comfort" aria-hidden="true" />安心ルート</span><span><i className="field-candidate-key" aria-hidden="true" />現地確認候補</span></div>
      </section>

      <section className="field-candidate-section" aria-labelledby="field-candidate-title">
        <div className="section-heading"><div><p className="eyebrow">確認順</p><h2 id="field-candidate-title">優先度順の候補</h2></div><p>地図に表示した全候補の情報を一覧でも確認できます。</p></div>
        {orderedCandidates.length === 0 ? <p className="field-empty-notice">現地確認候補はまだ生成されていません。</p> : <ol className="field-candidate-list">{orderedCandidates.map((candidate, index) => {
          const selected = candidate.candidateId === selectedCandidate?.candidateId;
          const verificationId = candidate.verificationId ?? createVerificationId(candidate.candidateId);
          const improvementPercent = Math.round(candidate.expectedImprovementRatio * 1000) / 10;
          return <li key={candidate.candidateId}><article className={`field-candidate-card${selected ? " selected" : ""}`} aria-labelledby={`field-candidate-${candidate.candidateId}`} aria-current={selected ? "location" : undefined}>
            <div className="field-candidate-rank"><strong>候補順位 {index + 1}位</strong><span>確認優先度 {candidate.fieldCheckPriority}</span></div>
            <h3 id={`field-candidate-${candidate.candidateId}`}>{candidate.name}</h3>
            <p className="field-candidate-address">{candidate.address ?? "住所情報なし"}</p>
            <dl className="field-candidate-metrics">
              <div><dt>デモルートからの距離</dt><dd>推定直線{Math.round(candidate.distanceToRouteMeters)}m</dd></div>
              <div><dt>ルート上の位置</dt><dd>開始地点からルート沿い推定{Math.round(candidate.routeProgressMeters)}m</dd></div>
              <div><dt>現在の最長休憩空白</dt><dd>推定{Math.round(candidate.currentLongestGapMeters)}m</dd></div>
              <div><dt>追加後の理論値</dt><dd>推定{Math.round(candidate.expectedImprovedGapMeters)}m</dd></div>
              <div><dt>期待される改善</dt><dd>推定{Math.round(candidate.expectedImprovementMeters)}m（{improvementPercent}%）</dd></div>
              <div><dt>対象デモルート</dt><dd>{candidate.routeIds.map((routeId) => routeLabels[routeId] ?? routeId).join(" / ")}</dd></div>
              <div><dt>上記の単一指標の基準ルート</dt><dd>{routeLabels[candidate.primaryRouteId] ?? candidate.primaryRouteId}</dd></div>
            </dl>
            <p className="field-theory-note">改善量はルート上へ休憩地点を追加した場合の理論値で、この施設での実際の休憩可否や設置可能性を保証しません。</p>
            <section><h4>候補選定理由</h4><ul>{candidate.selectionReasons.map((reason, reasonIndex) => <li key={`${reason}-${reasonIndex}`}>{formatFieldCheckReason(reason)}</li>)}</ul></section>
            <section><h4>現地で確認する項目</h4><ul className="field-check-items">{checkItems.map((item) => <li key={item}>{item}</li>)}</ul></section>
            <section><h4>公式データ出典</h4><SourceList sourceIds={candidate.officialSourceIds} /></section>
            <p className="field-verification-id"><strong>CSV記入用 verificationId</strong><code>{verificationId}</code><span>candidateId: {candidate.candidateId}</span></p>
            <button type="button" className="field-map-select-button" aria-current={selected ? "true" : undefined} onClick={() => selectCandidate(candidate.candidateId)}>{selected ? "地図でこの候補を選択中" : "地図でこの候補を見る"}</button>
          </article></li>;
        })}</ol>}
      </section>
      <section className="data-sources field-data-note"><h2>距離と確認結果の扱い</h2><p>候補地点からデモルートまでは推定直線距離、ルート上の位置と空白改善量はデモルート総距離へ正規化した推定値です。実際の道路ネットワーク上の徒歩距離、安全性、入館条件、座席の空き、営業時間を保証しません。</p><p>現地確認の記録が必須条件を満たした場合だけ、別の決定的な更新処理でconfirmedまたはsupportedとして評価します。この公開画面には書き込み機能がありません。</p></section>
    </main>
    <footer><strong>TOKYO PACE</strong><p>現地確認の優先順位と理論上の改善案を示す試作画面です。</p></footer>
  </>;
}
