export function RouteSearchStatus({ loading, error, onRetry, onFallback }: { loading: boolean; error: string | null; onRetry(): void; onFallback(): void }) {
  return <>
    {loading && <div className="loading comparison-loading" role="status" aria-live="polite"><strong>3つの経路候補を比較しています</strong><span className="loading-bar" aria-hidden="true" /><p>距離、時間、歩き続ける区間、施設候補を順に評価しています。</p></div>}
    {error && <div className="error" role="alert"><strong>経路候補を取得できませんでした。</strong><p>{error}</p><p>時間をおいて再試行するか、固定デモルートを表示してください。</p><div className="error-actions"><button type="button" onClick={onRetry}>再試行</button><button type="button" onClick={onFallback}>固定デモルートを表示</button></div></div>}
  </>;
}
