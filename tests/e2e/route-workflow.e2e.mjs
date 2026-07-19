import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

const routeFixture = JSON.parse(await readFile(new URL("../fixtures/api-routes.json", import.meta.url), "utf8"));

async function downloadedBytes(download) {
  const path = await download.path();
  if (!path) throw new Error(`ダウンロード内容を取得できませんでした: ${download.suggestedFilename()}`);
  return readFile(path);
}

async function blockExternalMapTiles(page) {
  await page.route(/tile\.openstreetmap\.org/, (route) => route.fulfill({ status: 204 }));
}

test("動的3経路を比較し、分析データを決定的に出力して固定デモへ復帰できる", async ({ page }) => {
  let returnInternalError = false;
  await blockExternalMapTiles(page);
  await page.route("**/api/routes", async (route) => {
    if (returnInternalError) {
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Illegal invocation: INTERNAL_ONLY_SECRET" }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(routeFixture) });
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "出発地・目的地と歩行条件" })).toBeVisible();
  await page.getByLabel("出発地プリセット").selectOption("shinjuku-west");
  await page.getByLabel("目的地プリセット").selectOption("tocho");
  await page.locator(".segments label", { hasText: /^5分$/ }).click();
  await page.getByRole("button", { name: "経路候補を検索" }).click();

  const cards = page.locator("article.route-card[data-profile]");
  await expect(cards).toHaveCount(3);
  await expect(page.getByRole("heading", { name: /条件に最も近い候補/ })).toBeVisible();
  await expect(page.getByRole("table", { name: "経路候補の主要指標比較" })).toBeVisible();

  const secondRouteName = (await cards.nth(1).getByRole("heading", { level: 3 }).textContent())?.trim();
  expect(secondRouteName).toBeTruthy();
  await page.locator(".comparison-table .table-select-button").nth(1).click();
  await expect(page.locator(".selection-announcement")).toContainText(secondRouteName);
  await expect(cards.nth(1)).toHaveAttribute("aria-current", "true");

  await cards.nth(1).getByRole("button", { name: "詳細を見る" }).click();
  await expect(cards.nth(1).locator(".route-card-details")).toBeVisible();
  await expect(cards.nth(1).getByRole("button", { name: "詳細を閉じる" })).toHaveAttribute("aria-expanded", "true");
  await cards.nth(1).getByRole("button", { name: "詳細を閉じる" }).click();
  await expect(cards.nth(1).locator(".route-card-details")).toBeHidden();

  await page.locator("details.analysis-data-panel > summary").click();
  const csvButton = page.getByRole("button", { name: "CSVをダウンロード" });
  const [firstCsvDownload] = await Promise.all([page.waitForEvent("download"), csvButton.click()]);
  const firstCsv = await downloadedBytes(firstCsvDownload);
  const [secondCsvDownload] = await Promise.all([page.waitForEvent("download"), csvButton.click()]);
  const secondCsv = await downloadedBytes(secondCsvDownload);
  expect(firstCsvDownload.suggestedFilename()).toMatch(/^tokyo-pace-.*-analysis\.csv$/);
  expect(secondCsvDownload.suggestedFilename()).toBe(firstCsvDownload.suggestedFilename());
  expect(secondCsv.equals(firstCsv)).toBe(true);
  expect(firstCsv.toString("utf8")).toContain("routeId,profile,routeDistanceMeters");
  expect(firstCsv.toString("utf8")).toContain("sourceDatasetIds,manifestReference,attribution,warnings");

  const [geoJsonDownload] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "GeoJSONをダウンロード" }).click()]);
  expect(geoJsonDownload.suggestedFilename()).toMatch(/^tokyo-pace-.*-analysis\.geojson$/);
  const geoJson = JSON.parse((await downloadedBytes(geoJsonDownload)).toString("utf8"));
  expect(geoJson.type).toBe("FeatureCollection");
  expect(geoJson.features.map((feature) => feature.properties.featureType)).toEqual(expect.arrayContaining([
    "selected_route", "rest_gap", "public_toilet_gap", "theoretical_rest_insertion",
  ]));
  expect(geoJson.properties.attribution.join(" ")).toContain("OpenStreetMap contributors");

  returnInternalError = true;
  await page.getByRole("button", { name: "経路候補を検索" }).click();
  await expect(page.getByRole("alert")).toContainText("経路候補を取得できませんでした。");
  await expect(page.getByRole("alert")).toContainText("通信状態を確認して、もう一度お試しください。");
  await expect(page.locator("body")).not.toContainText("Illegal invocation");
  await expect(page.locator("body")).not.toContainText("INTERNAL_ONLY_SECRET");

  await page.getByRole("button", { name: "固定デモルートを表示" }).click();
  await expect(page.locator("article.route-card[data-profile]"), "固定デモの2経路を表示する").toHaveCount(2);
  await expect(page.locator(".fallback-notice")).toContainText("固定デモルートを表示中");
});

test("現地確認画面は読み取り専用で、品質確認済み候補入りCSVテンプレートを生成する", async ({ page }) => {
  await blockExternalMapTiles(page);
  await page.goto("/?mode=field-check");

  await expect(page.getByRole("heading", { name: "現地確認候補リスト" })).toBeVisible();
  await expect(page.getByText("この画面から確認結果は送信されません。")).toBeVisible();
  const candidateCards = page.locator("article.field-candidate-card");
  const candidateCount = await candidateCards.count();
  expect(candidateCount).toBeGreaterThanOrEqual(10);
  expect(candidateCount).toBeLessThanOrEqual(15);
  await expect(page.getByText("読み取り専用", { exact: true })).toBeVisible();
  await expect(page.locator("form")).toHaveCount(0);

  const [templateDownload] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "入力用CSVテンプレートをダウンロード" }).click()]);
  expect(templateDownload.suggestedFilename()).toBe("tokyo-pace-field-verification-template.csv");
  const template = (await downloadedBytes(templateDownload)).toString("utf8");
  expect(template).toContain("verificationId,candidateId,name,latitude,longitude,address,verifiedAt,verifier,verificationMethod");
  expect(template.trim().split("\n")).toHaveLength(candidateCount + 1);
  await expect(page.getByText(`${candidateCount}候補を記入済みのCSVテンプレートを生成しました。`)).toBeVisible();
});
