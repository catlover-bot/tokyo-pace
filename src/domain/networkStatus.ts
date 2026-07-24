export const OFFLINE_ROUTE_SEARCH_MESSAGE =
  "オフラインのため動的な経路候補を取得できません。固定デモルートへ切り替えてください。";

export function canSearchDynamicRoutes(online: boolean): boolean {
  return online;
}
