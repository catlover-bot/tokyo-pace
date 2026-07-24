export const publicPagePaths = [
  "/privacy",
  "/terms",
  "/data-policy",
  "/accessibility",
] as const;

export type PublicPagePath = (typeof publicPagePaths)[number];

export function parsePublicPagePathname(pathname: string): PublicPagePath | null {
  const normalizedPathname =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.replace(/\/+$/, "")
      : pathname;

  return publicPagePaths.includes(normalizedPathname as PublicPagePath)
    ? (normalizedPathname as PublicPagePath)
    : null;
}
