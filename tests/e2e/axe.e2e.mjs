import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const paths = [
  "/",
  "/?mode=field-check",
  "/privacy",
  "/terms",
  "/data-policy",
  "/accessibility",
];

test.setTimeout(90_000);

test("主要6画面にaxeのcritical/serious違反がない", async ({ page }) => {
  await page.route(/tile\.openstreetmap\.org/, (route) => route.fulfill({ status: 204 }));

  for (const path of paths) {
    await page.goto(path);
    await page.locator("main#main-content").waitFor();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    const blockingViolations = results.violations
      .filter((violation) => violation.impact === "critical" || violation.impact === "serious")
      .map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        nodes: violation.nodes.map((node) => node.target),
      }));
    expect(blockingViolations, `${path} のaxe結果`).toEqual([]);
  }
});
