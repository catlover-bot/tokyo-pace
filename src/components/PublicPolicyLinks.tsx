import type { PublicPagePath } from "../domain/publicPage";

const policyLinks: ReadonlyArray<{ href: PublicPagePath; label: string }> = [
  { href: "/privacy", label: "プライバシー" },
  { href: "/terms", label: "利用条件" },
  { href: "/data-policy", label: "データ方針" },
  { href: "/accessibility", label: "アクセシビリティ" },
];

export function PublicPolicyLinks({
  currentPath = null,
}: {
  currentPath?: PublicPagePath | null;
}) {
  return (
    <nav className="policy-links" aria-label="サービス方針">
      <ul>
        {policyLinks.map(({ href, label }) => (
          <li key={href}>
            <a href={href} aria-current={currentPath === href ? "page" : undefined}>
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
