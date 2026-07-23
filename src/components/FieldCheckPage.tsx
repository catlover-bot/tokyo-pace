import { lazy, Suspense, useMemo, useState } from "react";
import {
  fieldVerificationCandidateMetadata,
  fieldVerificationCandidates,
} from "../data/fieldVerificationCandidates";
import {
  fieldCandidateRankingSensitivity,
  fieldCandidateRankingSensitivityMetadata,
} from "../data/fieldCandidateRankingSensitivity";
import {
  fieldVisitShortlist,
  fieldVisitShortlistMetadata,
} from "../data/fieldVisitShortlist";
import { openDataManifest } from "../data/openDataManifest";
import { getDynamicFieldCheckRouteLabel } from "../domain/fieldCheckMapPresentation";
import {
  getDetourSensitivityLabel,
  getRankStabilityLabel,
  getTwoAxisClassificationLabel,
} from "../domain/fieldCandidateRankingPresentation";
import { createVerificationId, downloadFieldVerificationTemplate } from "../domain/fieldVerificationTemplate";
import type {
  FieldCandidateRankingSensitivity,
  FieldVerificationCandidate,
  FieldVerificationRankingScoreBreakdown,
  FieldVisitShortlistEntry,
  RouteProfile,
} from "../types";

const FieldCheckMap = lazy(() => import("./FieldCheckMap").then((module) => ({ default: module.FieldCheckMap })));

const fixedDemoRouteLabels: Record<string, string> = {
  standard: "固定デモ：通常ルート",
  comfort: "固定デモ：安心ルート",
};

const checkItems = [
  "一般利用の可否と入館条件",
  "座席または明示的な休憩空間があるか",
  "屋内または雨を避けられる場所か",
  "給水設備・トイレ・車いす対応設備の有無",
  "確認時の営業時間と利用制限",
  "確認方法と公開可能な根拠資料",
];

const scoreBreakdownLabels: Array<{
  key: keyof Omit<FieldVerificationRankingScoreBreakdown, "total">;
  label: string;
  penalty?: boolean;
}> = [
  { key: "improvementMetersPoints", label: "迂回調整後の改善量" },
  { key: "improvementRatioPoints", label: "迂回調整後の改善率" },
  { key: "routeProximityPoints", label: "代表動的経路への近さ" },
  { key: "accessPriorPoints", label: "施設カテゴリの事前期待" },
  { key: "coveredRoutesPoints", label: "寄与する動的経路数" },
  { key: "officialSourceQualityPoints", label: "公式出典の品質" },
  { key: "categoryPenalty", label: "施設カテゴリ減点", penalty: true },
  { key: "duplicateFacilityPenalty", label: "同一施設グループ化減点", penalty: true },
];

type FieldVerificationCandidateMetadata = {
  generatedAt?: string;
  candidateCount?: number;
  rankedCandidateCount?: number;
  eligibleGroupCount?: number;
  preRankingGroupCount?: number;
  excludedCoordinateConflictPlaceCount?: number;
};

function sortFieldVerificationCandidates(candidates: readonly FieldVerificationCandidate[]): FieldVerificationCandidate[] {
  return [...candidates].sort((a, b) => a.fieldCheckPriority - b.fieldCheckPriority || a.candidateId.localeCompare(b.candidateId));
}

function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 1000) / 10}%`;
}

function formatRank(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatScore(value: number): string {
  return String(Math.round(value * 100) / 100);
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

function DynamicRouteNames({ routeIds }: { routeIds: readonly RouteProfile[] }) {
  if (routeIds.length === 0) return <>対象なし</>;
  return <>{routeIds.map(getDynamicFieldCheckRouteLabel).join(" / ")}</>;
}

function ScoreBreakdown({ candidate }: { candidate: FieldVerificationCandidate }) {
  return <dl className="field-score-breakdown">
    {scoreBreakdownLabels.map(({ key, label, penalty }) => <div key={key}>
      <dt>{label}</dt>
      <dd>{penalty ? "−" : "+"}{formatScore(candidate.rankingScoreBreakdown[key])}点</dd>
    </div>)}
    <div className="field-score-total"><dt>合計</dt><dd>{formatScore(candidate.rankingScoreBreakdown.total)}点</dd></div>
  </dl>;
}

export function FieldCheckPage({
  candidates = fieldVerificationCandidates,
  metadata = fieldVerificationCandidateMetadata,
  rankingSensitivity = fieldCandidateRankingSensitivity,
  rankingSensitivityMetadata = fieldCandidateRankingSensitivityMetadata,
  visitShortlist = fieldVisitShortlist,
  visitShortlistMetadata = fieldVisitShortlistMetadata,
}: {
  candidates?: readonly FieldVerificationCandidate[];
  metadata?: FieldVerificationCandidateMetadata;
  rankingSensitivity?: readonly FieldCandidateRankingSensitivity[];
  rankingSensitivityMetadata?: { weightScenarioCount?: number };
  visitShortlist?: readonly FieldVisitShortlistEntry[];
  visitShortlistMetadata?: { entryCount?: number };
}) {
  const orderedCandidates = useMemo(() => sortFieldVerificationCandidates(candidates), [candidates]);
  const analysisByCandidateId = useMemo(
    () => new Map(rankingSensitivity.map((analysis) => [analysis.candidateId, analysis])),
    [rankingSensitivity],
  );
  const shortlistByCandidateId = useMemo(
    () => new Map(visitShortlist.map((entry) => [entry.candidateId, entry])),
    [visitShortlist],
  );
  const baselineCandidates = useMemo(() => [...orderedCandidates].sort((a, b) => {
    const rankA = analysisByCandidateId.get(a.candidateId)?.baselineRank ?? a.fieldCheckPriority;
    const rankB = analysisByCandidateId.get(b.candidateId)?.baselineRank ?? b.fieldCheckPriority;
    return rankA - rankB || a.candidateId.localeCompare(b.candidateId);
  }), [analysisByCandidateId, orderedCandidates]);
  const topCandidates = baselineCandidates.slice(0, 5);
  const recommendedVisits = useMemo(() => [...visitShortlist]
    .sort((a, b) => a.visitPriority - b.visitPriority || a.candidateId.localeCompare(b.candidateId))
    .flatMap((entry) => {
      const candidate = orderedCandidates.find((item) => item.candidateId === entry.candidateId);
      return candidate ? [{ candidate, entry }] : [];
    }), [orderedCandidates, visitShortlist]);
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
        <p>保存済みの代表動的3経路に対して、休憩空白の改善、ルートへの近さ、施設カテゴリ、公式出典の品質を決定的に評価した訪問候補です。候補掲載は、自由な入館・着席・営業中であることを示しません。</p>
        <aside className="field-readonly-notice"><strong>この画面から確認結果は送信されません。</strong><p>CSVをダウンロードして人間が現地で確認し、管理された更新手順で取り込みます。verifier欄には個人の連絡先や不要な個人情報を記入しないでください。</p></aside>
      </section>

      <section className="field-top-candidates" aria-labelledby="field-overview-title">
        <div className="section-heading"><div><p className="eyebrow">順位と頑健性</p><h2 id="field-overview-title">単一スコア順位と訪問推奨を分けて確認</h2></div><p>候補数を固定数へ合わせず、改善基準を満たした地点だけを分析しています。</p></div>
        <aside className="field-ranking-uncertainty">
          <strong>順位は推定条件によって変わります。</strong>
          基準重みの単一スコア順位と、{rankingSensitivityMetadata.weightScenarioCount ?? 15}通りの重み設定・3つの迂回仮定を監査した現地確認の推奨訪問順は別です。上位5出現率は順位の安定性であり、施設を一般利用できる確率ではありません。
        </aside>
        <div className="field-check-summary">
          <p><strong>{orderedCandidates.length}地点</strong><span>改善基準を満たした順位候補</span></p>
          <p><strong>{metadata.preRankingGroupCount ?? metadata.eligibleGroupCount ?? orderedCandidates.length}候補群</strong><span>順位付け前に検討した施設候補</span></p>
          <p><strong>{visitShortlistMetadata.entryCount ?? recommendedVisits.length}地点</strong><span>頑健性を踏まえた最終訪問候補</span></p>
        </div>
        {topCandidates.length === 0 ? <p className="field-empty-notice">改善基準を満たす現地確認候補はありません。</p> : <div className="field-ranking-view-grid">
          <section aria-labelledby="field-baseline-ranking-title">
            <h3 id="field-baseline-ranking-title">基準重みの単一スコア順位</h3>
            <p>既存の現地確認優先スコア（高いほど優先）による上位5です。</p>
            <ol className="field-baseline-ranking-list">{topCandidates.map((candidate) => {
              const analysis = analysisByCandidateId.get(candidate.candidateId);
              return <li key={candidate.candidateId}><button type="button" aria-pressed={candidate.candidateId === selectedCandidate?.candidateId} onClick={() => selectCandidate(candidate.candidateId)}>
                <strong>{candidate.name}</strong> — {analysis?.baselineRank ?? candidate.fieldCheckPriority}位／{formatScore(candidate.rankingScore)}点
                {analysis && <span className="field-visit-reason">{getDetourSensitivityLabel(analysis.detourSensitivityClass)}</span>}
              </button></li>;
            })}</ol>
          </section>
          <section aria-labelledby="field-robust-visit-title">
            <h3 id="field-robust-visit-title">頑健性を踏まえた現地確認の推奨訪問順</h3>
            <p>基準スコア順や最短移動順ではなく、改善の残り方、順位安定性、確認価値、構成規則による順です。</p>
            {recommendedVisits.length === 0 ? <p className="field-analysis-missing">訪問推奨の分析データがありません。単一スコア順位から推奨を推測しません。</p> : <ol className="field-baseline-ranking-list">{recommendedVisits.map(({ candidate, entry }) => <li key={candidate.candidateId}>
              <button type="button" aria-pressed={candidate.candidateId === selectedCandidate?.candidateId} onClick={() => selectCandidate(candidate.candidateId)}>
                <strong>{entry.visitPriority}. {candidate.name}</strong> — 単一スコア{entry.baselineRank}位
                <span className="field-visit-reason">上位5出現率 {formatPercent(entry.top5AppearanceRate)}／{getRankStabilityLabel(entry.rankStabilityClass)}</span>
                <span className="field-visit-reason">{entry.inclusionReason}</span>
              </button>
            </li>)}</ol>}
          </section>
        </div>}
      </section>

      <section className="field-check-map-section" aria-labelledby="field-map-title">
        <div className="section-heading"><div><p className="eyebrow">地図</p><h2 id="field-map-title">代表動的3経路と候補地点</h2></div><p className="map-note">候補までの距離は実際の徒歩距離ではなく推定直線距離です</p></div>
        <Suspense fallback={<div className="loading" role="status">現地確認候補の地図を読み込んでいます…</div>}><FieldCheckMap candidates={orderedCandidates} rankingSensitivity={rankingSensitivity} visitShortlist={visitShortlist} selectedCandidateId={selectedCandidate?.candidateId ?? null} onSelectCandidate={selectCandidate} /></Suspense>
      </section>

      <section className="field-candidate-section" aria-labelledby="field-candidate-title">
        <div className="section-heading"><div><p className="eyebrow">候補カード</p><h2 id="field-candidate-title">候補ごとの根拠と確認事項</h2></div><p>代表動的経路の評価と固定デモの回帰情報を分けて表示します。</p></div>
        {orderedCandidates.length === 0 ? <p className="field-empty-notice">現地確認候補はまだ生成されていません。</p> : <ol className="field-candidate-list">{orderedCandidates.map((candidate, index) => {
          const selected = candidate.candidateId === selectedCandidate?.candidateId;
          const verificationId = candidate.verificationId ?? createVerificationId(candidate.candidateId);
          const analysis = analysisByCandidateId.get(candidate.candidateId);
          const shortlistEntry = shortlistByCandidateId.get(candidate.candidateId);
          const baselineRank = analysis?.baselineRank ?? index + 1;
          return <li key={candidate.candidateId}><article
            className={`field-candidate-card${selected ? " selected" : ""}`}
            aria-labelledby={`field-candidate-${candidate.candidateId}`}
            aria-current={selected ? "location" : undefined}
            data-candidate-id={candidate.candidateId}
            data-rank={baselineRank}
            data-baseline-rank={baselineRank}
            data-visit-priority={shortlistEntry?.visitPriority}
            data-shortlisted={shortlistEntry ? "true" : "false"}
            data-detour-sensitivity={analysis?.detourSensitivityClass}
            data-rank-stability={analysis?.rankStabilityClass}
            data-two-axis-class={analysis?.twoAxisClassification}
          >
            <div className="field-candidate-rank"><strong>単一スコア順位 {baselineRank}位</strong><span>現地確認順位スコア {formatScore(candidate.rankingScore)}点</span></div>
            <h3 id={`field-candidate-${candidate.candidateId}`}>{candidate.name}</h3>
            <p className="field-candidate-address">{candidate.address ?? "住所情報なし"}</p>
            <p className={`field-access-category field-access-category--${candidate.facilityAccessCategory}`}>
              <strong>施設カテゴリ</strong><span>{candidate.facilityAccessCategoryLabel}</span>
              {candidate.requiresSpecialCaution && <em>特別な注意あり</em>}
            </p>

            {!analysis ? <p className="field-analysis-missing">この候補の頑健性分析データは未生成です。単一スコアから推測しません。</p> : <>
              <div className="field-analysis-badges">
                <span>{getDetourSensitivityLabel(analysis.detourSensitivityClass)}</span>
                <span>{getRankStabilityLabel(analysis.rankStabilityClass)}</span>
                <span>上位5出現率 {formatPercent(analysis.top5AppearanceRate)}</span>
                {analysis.isParetoNonDominated && <span className="field-pareto-badge">Pareto非劣</span>}
                {shortlistEntry ? <span>訪問推奨 {shortlistEntry.visitPriority}番目</span> : <span>最終5地点外</span>}
              </div>
              <dl className="field-scenario-metrics">
                <div><dt>optimistic改善<br />（ルート上と仮定）</dt><dd>推定{Math.round(analysis.optimisticImprovementMeters)}m</dd></div>
                <div><dt>一方向直線控除後<br />（現行lower-bound）</dt><dd>推定{Math.round(analysis.lowerBoundAdjustedImprovementMeters)}m</dd></div>
                <div><dt>往復直線proxy控除後<br />（保守的）</dt><dd>推定{Math.round(analysis.conservativeProxyImprovementMeters)}m</dd></div>
              </dl>
              <p className="field-scenario-explanation">3値はすべてmax(0, …)です。直線控除は実道路上の迂回距離ではなく、入口、横断、高低差、通行条件を含みません。</p>
              <p className="field-two-axis-class"><strong>二軸分類：{getTwoAxisClassificationLabel(analysis.twoAxisClassification)}</strong>移動改善効果と現地確認価値を分けて判定しています。</p>
              <p><strong>順位の安定性：</strong>基準{analysis.baselineRank}位／最良{analysis.bestRank}位／最悪{analysis.worstRank}位／平均{formatRank(analysis.meanRank)}位。上位5出現率は利用可否の確率ではありません。</p>
              {shortlistEntry && <p className="field-shortlist-reason"><strong>この地点を訪問候補へ含めた理由：</strong>{shortlistEntry.inclusionReason}</p>}
            </>}

            <dl className="field-candidate-metrics">
              <div><dt>代表動的経路からの距離</dt><dd>推定直線{Math.round(candidate.distanceToRouteMeters)}m</dd></div>
              <div><dt>施設アクセスの迂回下限</dt><dd>推定{Math.round(candidate.estimatedDetourLowerBoundMeters)}m</dd></div>
              <div><dt>迂回を含まない理論改善</dt><dd>推定{Math.round(candidate.grossImprovementMeters)}m（{formatPercent(candidate.grossImprovementRatio)}）</dd></div>
              <div><dt>迂回調整後の改善</dt><dd>推定{Math.round(candidate.detourAdjustedImprovementMeters)}m（{formatPercent(candidate.detourAdjustedImprovementRatio)}）</dd></div>
              <div><dt>現在の最長休憩空白</dt><dd>推定{Math.round(candidate.currentLongestGapMeters)}m</dd></div>
              <div><dt>候補追加後の理論値</dt><dd>推定{Math.round(candidate.expectedImprovedGapMeters)}m</dd></div>
            </dl>
            <p className="field-theory-note"><strong>距離の読み方：</strong>迂回を含まない理論改善は、施設をルート上へ射影した計算値です。迂回調整値も推定直線距離を使った下限評価で、実際の道路上の徒歩距離ではありません。</p>

            <details className="field-candidate-technical-details"><summary>技術情報・スコア内訳・出典を表示</summary>
            <section className="field-route-context"><h4>対象となる代表動的経路</h4>
              <p><DynamicRouteNames routeIds={candidate.dynamicRouteIds} /></p>
              <p>寄与する経路：{candidate.numberOfCoveredRoutes} / 3経路。単一指標の基準：{getDynamicFieldCheckRouteLabel(candidate.primaryRouteId)}。</p>
              <p className="field-demo-reference"><strong>固定デモは順位に不使用：</strong>{candidate.fixedDemoRouteIds.length > 0 ? candidate.fixedDemoRouteIds.map((routeId) => fixedDemoRouteLabels[routeId] ?? `固定デモ：${routeId}`).join(" / ") : "近接対象なし"}</p>
              <details className="field-route-metric-details"><summary>代表動的経路ごとの指標</summary>
                <div className="field-route-metric-table-wrap"><table className="field-route-metric-table"><thead><tr><th>経路</th><th>推定直線距離</th><th>理論改善</th><th>迂回調整後</th></tr></thead><tbody>
                  {candidate.dynamicRouteMetrics.map((metric) => <tr key={metric.routeKey}><th>{metric.profile ? getDynamicFieldCheckRouteLabel(metric.profile) : metric.routeId}</th><td>{Math.round(metric.distanceToRouteMeters)}m</td><td>{Math.round(metric.grossImprovementMeters)}m</td><td>{Math.round(metric.detourAdjustedImprovementMeters)}m</td></tr>)}
                </tbody></table></div>
              </details>
            </section>

            <section><h4>現地確認順位スコア内訳</h4><p className="field-score-note">高いほど調査優先度が高い候補です。経路比較の「条件負担スコア」とは別の指標です。</p><ScoreBreakdown candidate={candidate} /></section>
            <section><h4>優先理由</h4><ul>{candidate.selectionReasons.map((reason, reasonIndex) => <li key={`${candidate.selectionReasonCodes[reasonIndex] ?? reason}-${reasonIndex}`}>{reason}</li>)}</ul></section>
            <section><h4>施設カテゴリの判断根拠</h4><ul>{candidate.categoryReasons.map((reason, reasonIndex) => <li key={`${candidate.categoryReasonCodes[reasonIndex] ?? reason}-${reasonIndex}`}>{reason}</li>)}</ul></section>
            <section><h4>公式データ出典</h4><SourceList sourceIds={candidate.officialSourceIds} /></section>
            <p className="field-verification-id"><strong>CSV記入用 verificationId</strong><code>{verificationId}</code><span>candidateId: {candidate.candidateId}</span></p>
            </details>
            <section className={candidate.requiresSpecialCaution ? "field-special-caution is-strong" : "field-special-caution"}><h4>現地確認上の注意</h4>
              {candidate.specialCautions.length > 0 ? <ul>{candidate.specialCautions.map((caution) => <li key={caution}>{caution}</li>)}</ul> : <p>カテゴリ固有の追加警告はありませんが、一般利用・着席・営業中であることは未確認です。</p>}
            </section>
            <section><h4>現地で確認する項目</h4><ul className="field-check-items">{checkItems.map((item) => <li key={item}>{item}</li>)}</ul></section>
            <button type="button" className="field-map-select-button" aria-pressed={selected} onClick={() => selectCandidate(candidate.candidateId)}>{selected ? "地図でこの候補を選択中" : "地図でこの候補を見る"}</button>
          </article></li>;
        })}</ol>}
      </section>

      <section className="field-csv-section" aria-labelledby="field-csv-title">
        <div className="section-heading"><div><p className="eyebrow">CSVテンプレート</p><h2 id="field-csv-title">現地確認結果を記録する</h2></div><p>この画面には書き込みAPIがありません。</p></div>
        <div className="field-download-actions"><button type="button" onClick={downloadTemplate} disabled={orderedCandidates.length === 0}>入力用CSVテンプレートをダウンロード</button><p>三値の未確認項目は空欄のままです。空欄をfalseとして扱いません。管理された更新手順だけで取り込みます。</p></div>
        <p className="field-download-status" aria-live="polite">{downloadStatus}</p>
      </section>

      <section className="data-sources field-data-note" aria-labelledby="field-method-title">
        <h2 id="field-method-title">計算方法と制約</h2>
        <div className="field-calculation-notes">
          <section><h3>単一順位と感度</h3><p>既存の単一スコア式は変更せず、7重みを一要因ずつ±20%にした設定を含む15通りで順位を再計算します。同点は改善、改善率、寄与経路数、直線距離、candidate IDで決定します。</p></section>
          <section><h3>3つの迂回仮定</h3><p>楽観値、片道直線控除、往復直線proxyを分けます。いずれも実際の道路上の迂回や徒歩距離ではなく、現地確認で入口・横断・高低差を確かめる必要があります。</p></section>
          <section><h3>二軸とPareto</h3><p>移動改善効果と現地確認価値を別々に保持します。Pareto非劣は定義した軸で全面的に劣らないという意味で、利用可能性や休憩可能性を示しません。理由文は理由コードから生成し、生成AIは使用していません。</p></section>
          <section><h3>動的経路と固定デモ</h3><p>順位には保存済みの代表動的3経路だけを使います。固定デモ経路は既存機能の比較・回帰用で、値を混同しません。</p></section>
          <section><h3>利用可否</h3><p>公式施設の掲載は、休憩可能、自由な入館、着席、営業中、安全な到達を保証しません。理論上の休憩挿入位置も実在する設置可能場所を示しません。</p></section>
        </div>
        <details className="field-method-guide"><summary>CSVのverificationMethod（確認方法コード）</summary><dl><div><dt><code>on_site_observation</code></dt><dd>現地で観察した確認</dd></div><div><dt><code>combined_on_site_and_official</code></dt><dd>現地観察と公式情報を組み合わせた確認</dd></div><div><dt><code>official_source_review</code></dt><dd>公式情報だけの確認。単独ではconfirmed / supportedへ昇格しません</dd></div><div><dt><code>staff_confirmation</code></dt><dd>施設担当者への確認。単独ではconfirmed / supportedへ昇格しません</dd></div></dl><p>再確認時もverificationIdは重複しない値にしてください。</p></details>
      </section>
    </main>
    <footer><strong>TOKYO PACE</strong><p>現地確認の優先順位と理論上の改善案を示す試作画面です。</p></footer>
  </>;
}
