import { RouteValidationError } from "../src/domain/routing";

export type PublicErrorCode =
  | "INVALID_REQUEST"
  | "OUTSIDE_SERVICE_AREA"
  | "ROUTE_TOO_LONG"
  | "UPSTREAM_TIMEOUT"
  | "UPSTREAM_UNAUTHORIZED"
  | "UPSTREAM_RATE_LIMITED"
  | "UPSTREAM_UNAVAILABLE"
  | "SERVICE_BUSY"
  | "DATA_STALE"
  | "INTERNAL_ERROR";

const PUBLIC_MESSAGES: Record<PublicErrorCode, string> = {
  INVALID_REQUEST: "入力内容を確認して、もう一度お試しください。",
  OUTSIDE_SERVICE_AREA: "現在の経路検索対象エリア内で地点を指定してください。",
  ROUTE_TOO_LONG: "現在検索できる距離の上限を超えています。出発地と目的地を近づけてください。",
  UPSTREAM_TIMEOUT: "経路サービスの応答に時間がかかっています。時間をおいて、もう一度お試しください。",
  UPSTREAM_UNAUTHORIZED: "経路検索の設定を確認中です。固定デモルートをご利用ください。",
  UPSTREAM_RATE_LIMITED: "経路サービスが混雑しています。時間をおいて、もう一度お試しください。",
  UPSTREAM_UNAVAILABLE: "経路候補を取得できませんでした。通信状態を確認して、もう一度お試しください。",
  SERVICE_BUSY: "現在アクセスが集中しています。時間をおいて、もう一度お試しください。",
  DATA_STALE: "一部データの更新が遅れています。表示内容の更新日時をご確認ください。",
  INTERNAL_ERROR: "処理を完了できませんでした。時間をおいて、もう一度お試しください。",
};

export class PublicApiError extends Error {
  constructor(
    readonly code: PublicErrorCode,
    readonly status: number,
    readonly retryable: boolean,
    readonly retryAfterSeconds?: number,
    readonly upstreamStatus?: number,
  ) {
    super(PUBLIC_MESSAGES[code]);
    this.name = "PublicApiError";
  }
}

export type PublicErrorBody = {
  code: PublicErrorCode;
  userMessage: string;
  retryable: boolean;
  requestId: string;
  /** Compatibility alias for the v0 client. New clients should use userMessage. */
  error: string;
};

export function publicErrorBody(error: PublicApiError, requestId: string): PublicErrorBody {
  const userMessage = PUBLIC_MESSAGES[error.code];
  return { code: error.code, userMessage, retryable: error.retryable, requestId, error: userMessage };
}

export function mapRouteValidationError(error: RouteValidationError): PublicApiError {
  if (error.message.includes("対象地域")) return new PublicApiError("OUTSIDE_SERVICE_AREA", 422, false);
  if (error.message.includes("対象距離")) return new PublicApiError("ROUTE_TOO_LONG", 422, false);
  return new PublicApiError("INVALID_REQUEST", error.status >= 400 && error.status < 500 ? error.status : 400, false);
}

export function asPublicApiError(error: unknown): PublicApiError {
  if (error instanceof PublicApiError) return error;
  if (error instanceof RouteValidationError) return mapRouteValidationError(error);
  return new PublicApiError("INTERNAL_ERROR", 500, true);
}

