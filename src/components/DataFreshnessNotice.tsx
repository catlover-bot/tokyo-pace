import type { DataFreshnessSummary } from "../domain/dataFreshness";

const descriptions: Record<DataFreshnessSummary["state"], string> = {
  current: "公式データは、データセットごとの確認周期内です。",
  aging: "データセットごとの更新周期に基づき、次回の更新確認時期が近づいています。",
  stale: "直前に正常生成できたデータを表示しています。施設の最新状況は公式情報でも確認してください。",
  update_failed: "直前に正常生成できたデータを維持しています。施設の最新状況は公式情報でも確認してください。",
};

export function DataFreshnessNotice({ summary }: { summary: DataFreshnessSummary }) {
  return (
    <p
      className={`data-freshness data-freshness--${summary.state}`}
      role="status"
      aria-live="polite"
      data-freshness-state={summary.state}
    >
      <strong>{summary.label}</strong>
      <span>{descriptions[summary.state]}</span>
    </p>
  );
}
