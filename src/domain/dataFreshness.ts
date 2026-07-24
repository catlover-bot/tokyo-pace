import type { OpenDataManifest, OpenDataManifestEntry } from "../types";

export type DataFreshnessState = "current" | "aging" | "stale" | "update_failed";

export type DataFreshnessThreshold = {
  currentMaxAgeDays: number;
  staleAfterDays: number;
  rationale: string;
};

export type DatasetFreshness = {
  datasetId: string;
  state: DataFreshnessState;
  ageDays: number | null;
  retrievedAt: string;
  threshold: DataFreshnessThreshold;
};

export type DataFreshnessSummary = {
  state: DataFreshnessState;
  label: "データ更新済み" | "更新確認中" | "一部データの更新が遅れています";
  datasets: DatasetFreshness[];
  counts: Record<DataFreshnessState, number>;
  warnings: string[];
};

const DAY_MILLISECONDS = 24 * 60 * 60 * 1_000;

const SHINJUKU_THRESHOLD: DataFreshnessThreshold = {
  currentMaxAgeDays: 45,
  staleAfterDays: 120,
  rationale: "新宿区データは月次確認を基本とし、公開日の揺れを考慮して45日をcurrentの上限とする",
};

const DRINKING_STATION_THRESHOLD: DataFreshnessThreshold = {
  currentMaxAgeDays: 120,
  staleAfterDays: 240,
  rationale: "給水地点は季節・年度単位の更新を想定し、四半期ごとの確認を基本とする",
};

const TOKYO_FACILITY_THRESHOLD: DataFreshnessThreshold = {
  currentMaxAgeDays: 180,
  staleAfterDays: 365,
  rationale: "東京都の施設・バリアフリー情報は不定期更新のため、半年ごとの確認を基本とする",
};

export const DATASET_FRESHNESS_THRESHOLDS: Readonly<Record<string, DataFreshnessThreshold>> = {
  "shinjuku-public": SHINJUKU_THRESHOLD,
  "shinjuku-public-facilities": SHINJUKU_THRESHOLD,
  "tokyo-drinking-stations": DRINKING_STATION_THRESHOLD,
  "tokyo-public-accessible": TOKYO_FACILITY_THRESHOLD,
  "tokyo-station-accessible": TOKYO_FACILITY_THRESHOLD,
  "daredemo-accommodation": TOKYO_FACILITY_THRESHOLD,
  "daredemo-dining": TOKYO_FACILITY_THRESHOLD,
  "daredemo-leisure": TOKYO_FACILITY_THRESHOLD,
  "daredemo-parks": TOKYO_FACILITY_THRESHOLD,
  "daredemo-public_facilities": TOKYO_FACILITY_THRESHOLD,
  "daredemo-shopping": TOKYO_FACILITY_THRESHOLD,
  "daredemo-transport": TOKYO_FACILITY_THRESHOLD,
};

export const DEFAULT_DATA_FRESHNESS_THRESHOLD = TOKYO_FACILITY_THRESHOLD;

function thresholdFor(datasetId: string): DataFreshnessThreshold {
  return DATASET_FRESHNESS_THRESHOLDS[datasetId] ?? DEFAULT_DATA_FRESHNESS_THRESHOLD;
}

function ageInDays(retrievedAt: string, now: Date): number | null {
  const retrieved = Date.parse(retrievedAt);
  if (!Number.isFinite(retrieved)) return null;
  return Math.max(0, Math.floor((now.getTime() - retrieved) / DAY_MILLISECONDS));
}

export function evaluateDatasetFreshness(
  entry: OpenDataManifestEntry,
  now: Date = new Date(),
): DatasetFreshness {
  const threshold = thresholdFor(entry.datasetId);
  const ageDays = ageInDays(entry.retrievedAt, now);
  let state: DataFreshnessState;

  if (entry.lastUpdateStatus === "failed" || ageDays === null) state = "update_failed";
  else if (ageDays <= threshold.currentMaxAgeDays) state = "current";
  else if (ageDays <= threshold.staleAfterDays) state = "aging";
  else state = "stale";

  return {
    datasetId: entry.datasetId,
    state,
    ageDays,
    retrievedAt: entry.retrievedAt,
    threshold,
  };
}

const emptyCounts = (): Record<DataFreshnessState, number> => ({
  current: 0,
  aging: 0,
  stale: 0,
  update_failed: 0,
});

export function summarizeDataFreshness(
  manifest: OpenDataManifest,
  now: Date = new Date(),
): DataFreshnessSummary {
  const datasets = [...manifest.datasets]
    .sort((left, right) => left.datasetId.localeCompare(right.datasetId))
    .map((entry) => evaluateDatasetFreshness(entry, now));
  const counts = emptyCounts();
  for (const dataset of datasets) counts[dataset.state] += 1;

  const state: DataFreshnessState =
    counts.update_failed > 0 ? "update_failed"
      : counts.stale > 0 ? "stale"
        : counts.aging > 0 ? "aging"
          : "current";
  const label = state === "current"
    ? "データ更新済み"
    : state === "aging"
      ? "更新確認中"
      : "一部データの更新が遅れています";
  const warnings = datasets
    .filter((dataset) => dataset.state !== "current")
    .map((dataset) => `${dataset.datasetId}: ${dataset.state}`);

  return { state, label, datasets, counts, warnings };
}
