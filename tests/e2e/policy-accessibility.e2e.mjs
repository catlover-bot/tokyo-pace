import { expect, test } from "@playwright/test";

const pages = [
  ["/privacy", "プライバシー"],
  ["/terms", "利用条件"],
  ["/data-policy", "データ方針"],
  ["/accessibility", "アクセシビリティ"],
];

test("公開方針4ページを直接開き、共通導線で移動できる", async ({ page }) => {
  for (const [path, heading] of pages) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await expect(page).toHaveTitle(`${heading} | TOKYO PACE`);
    await expect(page.getByRole("navigation", { name: "サービス方針" })).toBeVisible();
    await expect(page.locator(`a[href="${path}"]`).last()).toHaveAttribute("aria-current", "page");
  }
});

test("キーボードの最初の操作で本文へ移動できる", async ({ page }) => {
  await page.goto("/privacy");
  const skipLink = page.getByRole("link", { name: "本文へスキップ" });
  const main = page.locator("#main-content");

  await expect(skipLink).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(skipLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(main).toBeFocused();
  await expect(page).toHaveURL(/\/privacy#main-content$/);

  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "経路比較画面へ戻る" })).toBeFocused();
});

test("経路比較画面にもスキップ先と方針ページへの導線がある", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "本文へスキップ" })).toBeVisible();
  await expect(page.locator("main#main-content")).toHaveCount(1);
  const policyNavigation = page.getByRole("navigation", { name: "サービス方針" });
  await expect(policyNavigation).toBeVisible();
  await expect(policyNavigation.getByRole("link")).toHaveCount(4);
});

test("390px幅で方針本文と導線が横にはみ出さない", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/accessibility");
  const overflow = await page.evaluate(() => ({
    body: globalThis.document.body.scrollWidth - globalThis.document.body.clientWidth,
    document:
      globalThis.document.documentElement.scrollWidth -
      globalThis.document.documentElement.clientWidth,
  }));
  expect(overflow.body).toBe(0);
  expect(overflow.document).toBe(0);
  await expect(page.getByText("NVDA + Chrome", { exact: false })).toBeVisible();
});
