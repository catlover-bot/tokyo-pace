export function OfflineNotice({
  online,
  onFallback,
}: {
  online: boolean;
  onFallback(): void;
}) {
  if (online) return null;

  return (
    <aside className="offline-notice" role="status" aria-live="polite">
      <div>
        <strong>オフラインです</strong>
        <p>
          動的な経路検索は行いません。最終取得ルートは保存せず、古い検索結果を成功として表示しません。
        </p>
      </div>
      <button type="button" onClick={onFallback}>固定デモルートを表示</button>
    </aside>
  );
}
