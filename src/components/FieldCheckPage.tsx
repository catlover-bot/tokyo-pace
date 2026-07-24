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
import { fieldVisitPlanMetadata } from "../data/fieldVisitPlan";
import { openDataManifest } from "../data/openDataManifest";
import { getDynamicFieldCheckRouteLabel } from "../domain/fieldCheckMapPresentation";
import {
  getDetourSensitivityLabel,
  getRankStabilityDescription,
  getShortlistRoleLabel,
  getTwoAxisClassificationLabel,
  getVerificationValueLabel,
} from "../domain/fieldCandidateRankingPresentation";
import {
  copyFieldSurveyValue,
  type FieldSurveyClipboard,
} from "../domain/fieldSurveyClipboard";
import {
  createVerificationId,
  downloadFieldVerificationTemplate,
} from "../domain/fieldVerificationTemplate";
import { downloadFieldVisitPlan } from "../domain/fieldVisitPlanDownload";
import type {
  FieldCandidateRankingSensitivity,
  FieldVerificationCandidate,
  FieldVerificationRankingScoreBreakdown,
  FieldVisitShortlistEntry,
  RouteProfile,
} from "../types";

const FieldCheckMap = lazy(() =>
  import("./FieldCheckMap").then((module) => ({ default: module.FieldCheckMap })),
);

const fixedDemoRouteLabels: Record<string, string> = {
  standard: "固定デモ：通常ルート",
  comfort: "固定デモ：安心ルート",
};

const fieldSurveyCheckItems = [
  { id: "publiclyAccessible", label: "一般利用できるか" },
  { id: "accessCondition", label: "入館条件があるか" },
  { id: "serviceRequirement", label: "購入、宿泊、飲食、受付等が必要か" },
  { id: "seatingAvailable", label: "座席または明示的な休憩空間があるか" },
  { id: "seatingUsableForRest", label: "座席を休憩目的で利用できるか" },
  { id: "indoorOrCovered", label: "屋内または雨を避けられるか" },
  { id: "drinkingWaterAvailable", label: "給水設備があるか" },
  { id: "toiletAvailable", label: "トイレがあるか" },
  { id: "wheelchairAccessible", label: "車いす対応設備があるか" },
  { id: "openingHoursObserved", label: "営業時間・開館時間" },
  { id: "verifiedAt", label: "現地で確認した日時" },
  { id: "verificationMethod", label: "確認方法" },
  { id: "evidenceReference", label: "公開可能な根拠" },
  { id: "notes", label: "備考" },
] as const;

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

type CopyStatus = {
  candidateId: string;
  message: string;
};

function sortFieldVerificationCandidates(
  candidates: readonly FieldVerificationCandidate[],
): FieldVerificationCandidate[] {
  return [...candidates].sort(
    (a, b) =>
      a.fieldCheckPriority - b.fieldCheckPriority ||
      a.candidateId.localeCompare(b.candidateId),
  );
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
    .find(
      (entry) =>
        sourceId === entry.datasetId ||
        sourceId.startsWith(`${entry.datasetId}:`) ||
        sourceId.startsWith(`${entry.datasetId}-`),
    );
}

function SourceList({ sourceIds }: { sourceIds: readonly string[] }) {
  if (sourceIds.length === 0) return <p>公式出典IDはありません。</p>;
  return (
    <ul className="field-source-list">
      {[...sourceIds].sort().map((sourceId) => {
        const manifest = matchingManifestEntry(sourceId);
        return (
          <li key={sourceId}>
            <code>{sourceId}</code>
            {manifest && (
              <>
                {" "}
                —{" "}
                <a href={manifest.datasetUrl} target="_blank" rel="noreferrer">
                  公式データセット
                </a>
                （{manifest.license}）
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function DynamicRouteNames({ routeIds }: { routeIds: readonly RouteProfile[] }) {
  if (routeIds.length === 0) return <>対象なし</>;
  return <>{routeIds.map(getDynamicFieldCheckRouteLabel).join(" / ")}</>;
}

function ScoreBreakdown({ candidate }: { candidate: FieldVerificationCandidate }) {
  return (
    <dl className="field-score-breakdown">
      {scoreBreakdownLabels.map(({ key, label, penalty }) => (
        <div key={key}>
          <dt>{label}</dt>
          <dd>
            {penalty ? "−" : "+"}
            {formatScore(candidate.rankingScoreBreakdown[key])}点
          </dd>
        </div>
      ))}
      <div className="field-score-total">
        <dt>合計</dt>
        <dd>{formatScore(candidate.rankingScoreBreakdown.total)}点</dd>
      </div>
    </dl>
  );
}

function CopyableField({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy(label: string, value: string): void;
}) {
  return (
    <div className="field-copy-row">
      <span className="field-copy-label">{label}</span>
      <input
        className="field-copy-value"
        type="text"
        readOnly
        value={value}
        title={value}
        aria-label={`${label}の完全な値`}
        onFocus={(event) => event.currentTarget.select()}
      />
      <button type="button" onClick={() => onCopy(label, value)}>
        {label}をコピー
      </button>
    </div>
  );
}

function CandidateTechnicalDetails({
  candidate,
  analysis,
  scenarioCount,
  baselineRank,
}: {
  candidate: FieldVerificationCandidate;
  analysis: FieldCandidateRankingSensitivity;
  scenarioCount: number;
  baselineRank: number;
}) {
  return (
    <details className="field-candidate-technical-details">
      <summary>技術詳細・単一スコア順位・出典を表示</summary>
      <dl className="field-technical-rank-summary">
        <div>
          <dt>単一スコア順位</dt>
          <dd>{baselineRank}位</dd>
        </div>
        <div>
          <dt>現地確認順位スコア</dt>
          <dd>{formatScore(candidate.rankingScore)}点</dd>
        </div>
        <div>
          <dt>上位5出現率</dt>
          <dd>{formatPercent(analysis.top5AppearanceRate)}</dd>
        </div>
        <div>
          <dt>順位範囲</dt>
          <dd>
            最良{analysis.bestRank}位／最悪{analysis.worstRank}位／平均
            {formatRank(analysis.meanRank)}位
          </dd>
        </div>
        <div>
          <dt>Pareto評価</dt>
          <dd>{analysis.isParetoNonDominated ? "定義した二軸でPareto非劣" : "Pareto非劣ではない"}</dd>
        </div>
      </dl>
      <p className="field-rank-scope">
        {getRankStabilityDescription(analysis.top5AppearanceRate, scenarioCount)}
        。これは検討した重み設定内の順位で、一般利用できる確率ではありません。
      </p>

      <section>
        <h4>3つの迂回仮定の正確な値</h4>
        <dl className="field-scenario-metrics">
          <div>
            <dt>optimistic改善</dt>
            <dd>推定{Math.round(analysis.optimisticImprovementMeters)}m</dd>
          </div>
          <div>
            <dt>lower-bound改善</dt>
            <dd>推定{Math.round(analysis.lowerBoundAdjustedImprovementMeters)}m</dd>
          </div>
          <div>
            <dt>conservative proxy改善</dt>
            <dd>推定{Math.round(analysis.conservativeProxyImprovementMeters)}m</dd>
          </div>
        </dl>
        <p className="field-scenario-explanation">
          optimistic = max(0, gross)、lower-bound = max(0, gross − 片道直線距離)、
          conservative proxy = max(0, gross − 2 × 片道直線距離)。実道路上の迂回距離ではありません。
        </p>
      </section>

      <section className="field-route-context">
        <h4>代表動的経路と固定デモ回帰値</h4>
        <p>
          対象：<DynamicRouteNames routeIds={candidate.dynamicRouteIds} />
        </p>
        <p>
          寄与する経路：{candidate.numberOfCoveredRoutes} / 3経路。単一指標の基準：
          {getDynamicFieldCheckRouteLabel(candidate.primaryRouteId)}。
        </p>
        <p className="field-demo-reference">
          <strong>固定デモは順位に不使用：</strong>
          {candidate.fixedDemoRouteIds.length > 0
            ? candidate.fixedDemoRouteIds
              .map((routeId) => fixedDemoRouteLabels[routeId] ?? `固定デモ：${routeId}`)
              .join(" / ")
            : "近接対象なし"}
        </p>
        <details className="field-route-metric-details">
          <summary>経路ごとの固定済み計算値</summary>
          <div className="field-route-metric-table-wrap">
            <table className="field-route-metric-table">
              <thead>
                <tr>
                  <th>経路</th>
                  <th>推定直線距離</th>
                  <th>理論改善</th>
                  <th>片道控除後</th>
                </tr>
              </thead>
              <tbody>
                {candidate.routeMetrics.map((metric) => (
                  <tr key={metric.routeKey}>
                    <th>
                      {metric.profile
                        ? getDynamicFieldCheckRouteLabel(metric.profile)
                        : fixedDemoRouteLabels[metric.routeId] ?? metric.routeId}
                    </th>
                    <td>{Math.round(metric.distanceToRouteMeters)}m</td>
                    <td>{Math.round(metric.grossImprovementMeters)}m</td>
                    <td>{Math.round(metric.detourAdjustedImprovementMeters)}m</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <section>
        <h4>現地確認順位スコア内訳</h4>
        <p className="field-score-note">
          高いほど調査優先度が高い候補です。経路比較の「条件負担スコア」とは別の指標です。
        </p>
        <ScoreBreakdown candidate={candidate} />
      </section>
      <section>
        <h4>公式データ出典</h4>
        <SourceList sourceIds={candidate.officialSourceIds} />
      </section>
      <section>
        <h4>計算上の制約</h4>
        <p>
          距離、改善、順位は保存済みの代表動的経路と決定的な式による分析値です。施設の入口、
          横断、高低差、営業、入館条件、着席可否は含みません。
        </p>
      </section>
    </details>
  );
}

function FieldSurveyCandidateCard({
  candidate,
  analysis,
  shortlistEntry,
  baselineRank,
  scenarioCount,
  selected,
  checkedItemIds,
  copyStatus,
  onSelect,
  onToggleCheck,
  onCopy,
}: {
  candidate: FieldVerificationCandidate;
  analysis: FieldCandidateRankingSensitivity;
  shortlistEntry: FieldVisitShortlistEntry;
  baselineRank: number;
  scenarioCount: number;
  selected: boolean;
  checkedItemIds: readonly string[];
  copyStatus: CopyStatus | null;
  onSelect(candidateId: string): void;
  onToggleCheck(candidateId: string, itemId: string, checked: boolean): void;
  onCopy(candidateId: string, label: string, value: string): void;
}) {
  const verificationId = candidate.verificationId ?? createVerificationId(candidate.candidateId);
  const cautionText = [
    shortlistEntry.caution,
    ...candidate.specialCautions,
  ].filter((value, index, values) => Boolean(value) && values.indexOf(value) === index);

  return (
    <article
      className={`field-candidate-card field-survey-card${selected ? " selected" : ""}`}
      aria-labelledby={`field-candidate-${candidate.candidateId}`}
      aria-current={selected ? "location" : undefined}
      data-candidate-id={candidate.candidateId}
      data-baseline-rank={baselineRank}
      data-confirmation-priority={shortlistEntry.visitPriority}
      data-shortlisted="true"
      data-detour-sensitivity={analysis.detourSensitivityClass}
      data-rank-stability={analysis.rankStabilityClass}
      data-two-axis-class={analysis.twoAxisClassification}
    >
      <div className="field-confirmation-priority">
        <strong>確認優先度 {shortlistEntry.visitPriority}</strong>
        <span>現地確認の優先順位</span>
      </div>
      <h3 id={`field-candidate-${candidate.candidateId}`}>{candidate.name}</h3>
      <p className="field-candidate-address">{candidate.address ?? "住所情報なし"}</p>
      <p className={`field-access-category field-access-category--${candidate.facilityAccessCategory}`}>
        <strong>施設カテゴリ</strong>
        <span>{candidate.facilityAccessCategoryLabel}</span>
        {candidate.requiresSpecialCaution && <em>利用条件の確認が必要</em>}
      </p>

      <dl className="field-onsite-primary-metrics">
        <div>
          <dt>対象動的経路</dt>
          <dd>
            <DynamicRouteNames routeIds={candidate.dynamicRouteIds} />
          </dd>
        </div>
        <div>
          <dt>ルートからの距離</dt>
          <dd>推定直線{Math.round(candidate.distanceToRouteMeters)}m</dd>
        </div>
      </dl>

      <section className="field-evaluation-axes" aria-label="移動改善効果と現地確認価値">
        <p>
          <strong>移動改善効果</strong>
          {getDetourSensitivityLabel(analysis.detourSensitivityClass)}
        </p>
        <p>
          <strong>現地確認価値</strong>
          {getVerificationValueLabel(analysis.verificationValue.generalUsePurposeClarity)}
        </p>
        <p>
          <strong>確認優先順位に含めた理由</strong>
          {getShortlistRoleLabel(shortlistEntry.shortlistRole)}。{shortlistEntry.inclusionReason}
        </p>
      </section>

      <p className="field-improvement-summary">
        <strong>検討した迂回条件での改善概要：</strong>
        楽観値は推定{Math.round(analysis.optimisticImprovementMeters)}m、片道直線控除後は推定
        {Math.round(analysis.lowerBoundAdjustedImprovementMeters)}m、往復直線proxy控除後は推定
        {Math.round(analysis.conservativeProxyImprovementMeters)}mです。
      </p>
      <p className="field-rank-scope">
        {getRankStabilityDescription(analysis.top5AppearanceRate, scenarioCount)}
        。分析範囲外の仮定に対する保証ではありません。
      </p>

      <section className={candidate.requiresSpecialCaution ? "field-special-caution is-strong" : "field-special-caution"}>
        <h4>現地確認上の注意</h4>
        <ul>
          {cautionText.map((caution) => <li key={caution}>{caution}</li>)}
        </ul>
      </section>

      <section className="field-copy-section" aria-labelledby={`field-copy-title-${candidate.candidateId}`}>
        <h4 id={`field-copy-title-${candidate.candidateId}`}>CSVへ記録するIDと住所</h4>
        <CopyableField
          label="verificationId"
          value={verificationId}
          onCopy={(label, value) => onCopy(candidate.candidateId, label, value)}
        />
        <CopyableField
          label="candidateId"
          value={candidate.candidateId}
          onCopy={(label, value) => onCopy(candidate.candidateId, label, value)}
        />
        <CopyableField
          label="住所"
          value={candidate.address ?? ""}
          onCopy={(label, value) => onCopy(candidate.candidateId, label, value)}
        />
        <p className="field-copy-fallback">
          コピーできない場合も、上の選択可能な完全な値を長押しまたは選択してコピーできます。
        </p>
        <p className="field-copy-status" aria-live="polite">
          {copyStatus?.candidateId === candidate.candidateId ? copyStatus.message : ""}
        </p>
      </section>

      <section className="field-survey-checklist">
        <div className="field-survey-checklist-heading">
          <h4>現地で確認する一時チェック</h4>
          <span>{checkedItemIds.length}/{fieldSurveyCheckItems.length}項目</span>
        </div>
        <p>
          この端末の画面内だけの一時メモです。サーバーへ送信せず、再読み込みで消えます。事実はCSVへ記録してください。
        </p>
        <div className="field-survey-check-grid">
          {fieldSurveyCheckItems.map((item) => (
            <label key={item.id}>
              <input
                type="checkbox"
                checked={checkedItemIds.includes(item.id)}
                onChange={(event) =>
                  onToggleCheck(candidate.candidateId, item.id, event.target.checked)}
              />
              <span>{item.label}</span>
            </label>
          ))}
        </div>
      </section>

      <button
        type="button"
        className="field-map-select-button"
        aria-pressed={selected}
        onClick={() => onSelect(candidate.candidateId)}
      >
        {selected ? "地図でこの候補を選択中" : "地図で表示"}
      </button>

      <CandidateTechnicalDetails
        candidate={candidate}
        analysis={analysis}
        scenarioCount={scenarioCount}
        baselineRank={baselineRank}
      />
    </article>
  );
}

function OtherCandidateCard({
  candidate,
  analysis,
  baselineRank,
  scenarioCount,
  selected,
  onSelect,
}: {
  candidate: FieldVerificationCandidate;
  analysis: FieldCandidateRankingSensitivity | undefined;
  baselineRank: number;
  scenarioCount: number;
  selected: boolean;
  onSelect(candidateId: string): void;
}) {
  return (
    <article
      className={`field-candidate-card field-other-candidate-card${selected ? " selected" : ""}`}
      data-candidate-id={candidate.candidateId}
      data-shortlisted="false"
      aria-current={selected ? "location" : undefined}
    >
      <p className="field-other-label">今回の優先確認5地点には含めなかった分析候補</p>
      <h3>{candidate.name}</h3>
      <p className="field-candidate-address">{candidate.address ?? "住所情報なし"}</p>
      <p className={`field-access-category field-access-category--${candidate.facilityAccessCategory}`}>
        <strong>施設カテゴリ</strong>
        <span>{candidate.facilityAccessCategoryLabel}</span>
      </p>
      {analysis ? (
        <>
          <p>
            <strong>移動改善効果：</strong>
            {getDetourSensitivityLabel(analysis.detourSensitivityClass)}
          </p>
          <p>
            <strong>順位感度：</strong>
            {getRankStabilityDescription(analysis.top5AppearanceRate, scenarioCount)}
          </p>
          <p>
            <strong>二軸分析：</strong>
            {getTwoAxisClassificationLabel(analysis.twoAxisClassification)}
          </p>
          <details className="field-candidate-technical-details">
            <summary>技術分析を表示</summary>
            <p>
              単一スコア順位 {baselineRank}位／現地確認順位スコア
              {formatScore(candidate.rankingScore)}点
            </p>
            <p>
              optimistic 推定{Math.round(analysis.optimisticImprovementMeters)}m／lower-bound 推定
              {Math.round(analysis.lowerBoundAdjustedImprovementMeters)}m／conservative proxy 推定
              {Math.round(analysis.conservativeProxyImprovementMeters)}m
            </p>
            <SourceList sourceIds={candidate.officialSourceIds} />
          </details>
        </>
      ) : (
        <p className="field-analysis-missing">
          この候補の感度分析データは未生成です。単一スコアから現地確認の優先順位を推測しません。
        </p>
      )}
      <button
        type="button"
        className="field-map-select-button"
        aria-pressed={selected}
        onClick={() => onSelect(candidate.candidateId)}
      >
        {selected ? "地図でこの候補を選択中" : "地図で表示"}
      </button>
    </article>
  );
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
  const orderedCandidates = useMemo(
    () => sortFieldVerificationCandidates(candidates),
    [candidates],
  );
  const analysisByCandidateId = useMemo(
    () => new Map(rankingSensitivity.map((analysis) => [analysis.candidateId, analysis])),
    [rankingSensitivity],
  );
  const baselineCandidates = useMemo(
    () =>
      [...orderedCandidates].sort((a, b) => {
        const rankA = analysisByCandidateId.get(a.candidateId)?.baselineRank ?? a.fieldCheckPriority;
        const rankB = analysisByCandidateId.get(b.candidateId)?.baselineRank ?? b.fieldCheckPriority;
        return rankA - rankB || a.candidateId.localeCompare(b.candidateId);
      }),
    [analysisByCandidateId, orderedCandidates],
  );
  const topCandidates = baselineCandidates.slice(0, 5);
  const priorityCandidates = useMemo(
    () =>
      [...visitShortlist]
        .sort(
          (a, b) =>
            a.visitPriority - b.visitPriority ||
            a.candidateId.localeCompare(b.candidateId),
        )
        .flatMap((entry) => {
          const candidate = orderedCandidates.find(
            (item) => item.candidateId === entry.candidateId,
          );
          const analysis = analysisByCandidateId.get(entry.candidateId);
          return candidate && analysis ? [{ candidate, analysis, entry }] : [];
        }),
    [analysisByCandidateId, orderedCandidates, visitShortlist],
  );
  const priorityCandidateIds = useMemo(
    () => new Set(priorityCandidates.map(({ candidate }) => candidate.candidateId)),
    [priorityCandidates],
  );
  const otherCandidates = orderedCandidates.filter(
    (candidate) => !priorityCandidateIds.has(candidate.candidateId),
  );
  const scenarioCount = rankingSensitivityMetadata.weightScenarioCount ?? 15;
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(
    priorityCandidates[0]?.candidate.candidateId ?? orderedCandidates[0]?.candidateId ?? null,
  );
  const [downloadStatus, setDownloadStatus] = useState("");
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);
  const [checkedByCandidate, setCheckedByCandidate] = useState<Record<string, string[]>>({});
  const selectedCandidate =
    orderedCandidates.find((candidate) => candidate.candidateId === selectedCandidateId) ??
    priorityCandidates[0]?.candidate ??
    orderedCandidates[0];

  const selectCandidate = (candidateId: string) => setSelectedCandidateId(candidateId);
  const toggleCheck = (candidateId: string, itemId: string, checked: boolean) => {
    setCheckedByCandidate((current) => {
      const currentValues = current[candidateId] ?? [];
      const nextValues = checked
        ? [...new Set([...currentValues, itemId])]
        : currentValues.filter((value) => value !== itemId);
      return { ...current, [candidateId]: nextValues };
    });
  };
  const copyValue = async (candidateId: string, label: string, value: string) => {
    const clipboard: FieldSurveyClipboard | undefined =
      typeof navigator === "undefined" ? undefined : navigator.clipboard;
    const result = await copyFieldSurveyValue(value, clipboard);
    setCopyStatus({
      candidateId,
      message: result.ok
        ? `${label}をコピーしました`
        : "コピーできませんでした。上の選択可能な完全な値を長押しまたは選択してコピーしてください。",
    });
  };
  const downloadPlan = () => {
    downloadFieldVisitPlan();
    setDownloadStatus(
      `${fieldVisitPlanMetadata.entryCount}地点の現地調査用CSVを生成しました。`,
    );
  };
  const downloadTemplate = () => {
    downloadFieldVerificationTemplate(orderedCandidates);
    setDownloadStatus(
      `${orderedCandidates.length}候補を含む確認テンプレートを生成しました。`,
    );
  };

  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">歩</span>
            <div>
              <p className="service-name">TOKYO PACE</p>
              <p className="tagline">現地確認支援</p>
            </div>
          </div>
          <span className="demo-badge">読み取り専用</span>
        </div>
      </header>
      <main className="field-check-page">
        <nav className="field-check-nav" aria-label="画面切替">
          <a href="/">経路比較画面へ戻る</a>
        </nav>

        <section className="field-check-intro" aria-labelledby="field-check-title">
          <p className="eyebrow">Field survey</p>
          <h1 id="field-check-title">現地調査実施版</h1>
          <p>
            優先的に確認する5地点について、確認理由、現場で見る項目、CSVへ記録するIDをスマートフォンで確認する画面です。施設の掲載は、自由な入館、着席、営業中、休憩可能を示しません。
          </p>
          <aside className="field-readonly-notice">
            <strong>読み取り専用です。この画面から確認結果は送信・保存されません。</strong>
            <p>
              チェック操作は一時的で再読み込みすると消えます。結果は現地調査用CSVへ記録し、管理された更新手順で取り込んでください。個人の連絡先や不要な個人情報は記入しないでください。
            </p>
          </aside>
        </section>

        <section className="field-top-candidates" aria-labelledby="field-overview-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Confirmation priority</p>
              <h2 id="field-overview-title">優先的に確認する5地点</h2>
            </div>
            <p>確認優先度1〜5を、現場で使う情報から確認できます。</p>
          </div>
          <aside className="field-ranking-uncertainty">
            <strong>単一スコア順位と現地確認の優先順位は別です。</strong>
            現地確認の優先順位は、3つの迂回仮定、{scenarioCount}通りの重み設定、
            移動改善効果、現地確認価値、構成規則を分けて監査した順です。地理的な訪問順は計算していません。表示順は最短巡回順ではありません。
          </aside>
          <div className="field-check-summary">
            <p>
              <strong>{visitShortlistMetadata.entryCount ?? priorityCandidates.length}地点</strong>
              <span>優先的に確認する地点</span>
            </p>
            <p>
              <strong>{otherCandidates.length}地点</strong>
              <span>その他の分析候補</span>
            </p>
            <p>
              <strong>{scenarioCount}設定</strong>
              <span>順位感度を確認した重み設定</span>
            </p>
          </div>
          <p className="field-analysis-source-count">
            順位付け前に検討した施設候補群：
            {metadata.preRankingGroupCount ?? metadata.eligibleGroupCount ?? orderedCandidates.length}群。
            改善基準を満たした{orderedCandidates.length}地点を分析しています。
          </p>

          {priorityCandidates.length === 0 ? (
            <p className="field-empty-notice">
              現地確認の優先順位データがありません。単一スコア順位から推測しません。
            </p>
          ) : (
            <ol className="field-priority-overview-list">
              {priorityCandidates.map(({ candidate, analysis, entry }) => (
                <li key={candidate.candidateId}>
                  <button
                    type="button"
                    aria-pressed={candidate.candidateId === selectedCandidate?.candidateId}
                    onClick={() => selectCandidate(candidate.candidateId)}
                  >
                    <span className="field-priority-number">確認優先度 {entry.visitPriority}</span>
                    <strong>{candidate.name}</strong>
                    <span>
                      対象：<DynamicRouteNames routeIds={candidate.dynamicRouteIds} />
                    </span>
                    <em>{getShortlistRoleLabel(entry.shortlistRole)}</em>
                    <small>{getRankStabilityDescription(analysis.top5AppearanceRate, scenarioCount)}</small>
                  </button>
                </li>
              ))}
            </ol>
          )}

          <details className="field-baseline-analysis-details">
            <summary>技術分析：基準重みの単一スコア順位を見る</summary>
            <p>
              単一スコア順位は既存の現地確認順位スコア（高いほど優先）だけの順位です。現地確認の優先順位や地理的な訪問順とは異なります。
            </p>
            <ol className="field-baseline-ranking-list">
              {topCandidates.map((candidate) => {
                const analysis = analysisByCandidateId.get(candidate.candidateId);
                return (
                  <li key={candidate.candidateId}>
                    <button
                      type="button"
                      aria-pressed={candidate.candidateId === selectedCandidate?.candidateId}
                      onClick={() => selectCandidate(candidate.candidateId)}
                    >
                      <strong>{candidate.name}</strong> — 単一スコア
                      {analysis?.baselineRank ?? candidate.fieldCheckPriority}位／
                      {formatScore(candidate.rankingScore)}点
                    </button>
                  </li>
                );
              })}
            </ol>
          </details>
        </section>

        <section className="field-check-map-section" aria-labelledby="field-map-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Map</p>
              <h2 id="field-map-title">代表動的3経路と優先確認5地点</h2>
            </div>
            <p className="map-note">
              候補までの距離は実際の徒歩距離ではなく推定直線距離です
            </p>
          </div>
          <Suspense
            fallback={
              <div className="loading" role="status">
                現地確認候補の地図を読み込んでいます…
              </div>
            }
          >
            <FieldCheckMap
              candidates={orderedCandidates}
              rankingSensitivity={rankingSensitivity}
              visitShortlist={visitShortlist}
              selectedCandidateId={selectedCandidate?.candidateId ?? null}
              onSelectCandidate={selectCandidate}
            />
          </Suspense>
        </section>

        <section className="field-candidate-section" aria-labelledby="field-candidate-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">On-site cards</p>
              <h2 id="field-candidate-title">現地確認の優先順位</h2>
            </div>
            <p>確認優先度1〜5。表示順は最短巡回順ではありません。</p>
          </div>
          {priorityCandidates.length === 0 ? (
            <p className="field-empty-notice">優先確認カードはまだ生成されていません。</p>
          ) : (
            <ol className="field-candidate-list field-priority-candidate-list">
              {priorityCandidates.map(({ candidate, analysis, entry }) => (
                <li key={candidate.candidateId}>
                  <FieldSurveyCandidateCard
                    candidate={candidate}
                    analysis={analysis}
                    shortlistEntry={entry}
                    baselineRank={analysis.baselineRank}
                    scenarioCount={scenarioCount}
                    selected={candidate.candidateId === selectedCandidate?.candidateId}
                    checkedItemIds={checkedByCandidate[candidate.candidateId] ?? []}
                    copyStatus={copyStatus}
                    onSelect={selectCandidate}
                    onToggleCheck={toggleCheck}
                    onCopy={(candidateId, label, value) => {
                      void copyValue(candidateId, label, value);
                    }}
                  />
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="field-csv-section" aria-labelledby="field-csv-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Survey CSV</p>
              <h2 id="field-csv-title">現地調査用CSVをダウンロード</h2>
            </div>
            <p>書き込みAPIはありません。事実はCSVで管理します。</p>
          </div>
          <div className="field-download-options">
            <article className="field-download-primary">
              <h3>現地調査用5地点CSV</h3>
              <p>
                最初に使うファイルです。確認優先度1〜5とID、分析値を記入済みにし、確認結果列は空欄にしています。
              </p>
              <button
                type="button"
                onClick={downloadPlan}
                disabled={fieldVisitPlanMetadata.entryCount === 0}
              >
                現地調査用5地点CSVをダウンロード
              </button>
            </article>
            <article>
              <h3>全候補の確認テンプレート</h3>
              <p>
                その他3地点を含む全分析候補用です。確認結果の空欄をfalseとして扱いません。
              </p>
              <button
                type="button"
                onClick={downloadTemplate}
                disabled={orderedCandidates.length === 0}
              >
                全候補を含む確認テンプレートをダウンロード
              </button>
            </article>
          </div>
          <p className="field-csv-encoding-note">
            CSVはExcel等で日本語を扱えるUTF-8 BOM付きです。施設利用可否や現地調査結果を事前入力していません。
          </p>
          <p className="field-download-status" aria-live="polite">{downloadStatus}</p>
        </section>

        <section className="field-other-candidates-section" aria-labelledby="field-other-title">
          <details className="field-other-candidates-details">
            <summary>
              <span id="field-other-title">その他の分析候補3地点</span>
              <small>今回の優先確認5地点には含めなかった候補</small>
            </summary>
            <p>
              分析対象から除外した地点ではありません。主画面を過密にしないため初期状態では閉じています。
            </p>
            {otherCandidates.length === 0 ? (
              <p>その他の分析候補はありません。</p>
            ) : (
              <ol className="field-candidate-list field-other-candidate-list">
                {otherCandidates.map((candidate) => {
                  const analysis = analysisByCandidateId.get(candidate.candidateId);
                  return (
                    <li key={candidate.candidateId}>
                      <OtherCandidateCard
                        candidate={candidate}
                        analysis={analysis}
                        baselineRank={analysis?.baselineRank ?? candidate.fieldCheckPriority}
                        scenarioCount={scenarioCount}
                        selected={candidate.candidateId === selectedCandidate?.candidateId}
                        onSelect={selectCandidate}
                      />
                    </li>
                  );
                })}
              </ol>
            )}
          </details>
        </section>

        <section className="data-sources field-data-note" aria-labelledby="field-method-title">
          <h2 id="field-method-title">計算方法と制約</h2>
          <div className="field-calculation-notes">
            <section>
              <h3>3種類の「順」</h3>
              <p>
                単一スコア順位、現地確認の優先順位、地理的な訪問順は別です。今回は最短巡回経路を計算していません。
              </p>
            </section>
            <section>
              <h3>順位感度の範囲</h3>
              <p>
                既存の単一スコア式は変更せず、7重みを一要因ずつ±20%にした設定を含む
                {scenarioCount}通りで再計算します。表示は検討した設定内の結果です。
              </p>
            </section>
            <section>
              <h3>3つの迂回仮定</h3>
              <p>
                楽観値、片道直線控除、往復直線proxyを分けます。実際の道路上の迂回や徒歩距離ではありません。
              </p>
            </section>
            <section>
              <h3>二軸とPareto</h3>
              <p>
                移動改善効果と現地確認価値を別々に保持します。Pareto非劣は定義した軸の分析で、利用可能性を示しません。
              </p>
            </section>
            <section>
              <h3>動的経路と固定デモ</h3>
              <p>
                順位には保存済みの代表動的3経路だけを使います。固定デモ経路は既存機能の比較・回帰用です。
              </p>
            </section>
            <section>
              <h3>利用可否</h3>
              <p>
                公式掲載は、休憩可能、自由な入館、着席、営業中、安全な到達を保証しません。理論上の挿入位置も実在する設置可能場所を示しません。
              </p>
            </section>
          </div>
          <details className="field-method-guide">
            <summary>CSVのverificationMethod（確認方法コード）</summary>
            <dl>
              <div>
                <dt><code>on_site_observation</code></dt>
                <dd>現地で観察した確認</dd>
              </div>
              <div>
                <dt><code>combined_on_site_and_official</code></dt>
                <dd>現地観察と公式情報を組み合わせた確認</dd>
              </div>
              <div>
                <dt><code>official_source_review</code></dt>
                <dd>公式情報だけの確認。単独ではconfirmed / supportedへ昇格しません</dd>
              </div>
              <div>
                <dt><code>staff_confirmation</code></dt>
                <dd>施設担当者への確認。単独ではconfirmed / supportedへ昇格しません</dd>
              </div>
            </dl>
            <p>再確認時もverificationIdは重複しない値にしてください。</p>
          </details>
        </section>
      </main>
      <footer>
        <strong>TOKYO PACE</strong>
        <p>現地確認の優先順位と、事実をCSVへ記録するための試作画面です。</p>
      </footer>
    </>
  );
}
