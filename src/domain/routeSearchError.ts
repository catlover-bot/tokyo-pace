export const ROUTE_SEARCH_ERROR_MESSAGE = "通信状態を確認して、もう一度お試しください。";

export function toRouteSearchErrorMessage(cause: unknown): string {
  void cause;
  return ROUTE_SEARCH_ERROR_MESSAGE;
}

export function reportRouteSearchError(cause: unknown): void {
  if (!import.meta.env.DEV) return;
  const error = cause instanceof Error ? cause : null;
  const rootCause = error?.cause instanceof Error ? error.cause : null;
  const detail = rootCause
    ? { name: rootCause.name, message: rootCause.message }
    : error && "status" in error
      ? { name: error.name, status: (error as Error & { status: unknown }).status }
      : { name: error?.name ?? "UnknownError", message: error?.message ?? "詳細なし" };
  console.error("[TOKYO PACE] 経路検索に失敗しました", detail);
}
