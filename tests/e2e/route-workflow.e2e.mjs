import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { parseRepresentativeDynamicRouteSnapshot } from "../../src/domain/fieldCheckRouteSnapshot.mjs";

const routeSnapshot = parseRepresentativeDynamicRouteSnapshot(await readFile(
  new URL("../../data/routing-snapshots/shinjuku-west-to-tocho.v1.json", import.meta.url),
  "utf8",
));
const routeFixture = {
  routes: routeSnapshot.routes,
  source: "openrouteservice",
  generatedAt: routeSnapshot.source.capturedAt,
};
const fieldCandidateFixture = JSON.parse(await readFile(
  new URL("../../data/generated/field-verification-candidates.json", import.meta.url),
  "utf8",
));
const fieldRankingSensitivityFixture = JSON.parse(await readFile(
  new URL("../../data/generated/field-candidate-ranking-sensitivity.json", import.meta.url),
  "utf8",
));
const fieldVisitShortlistFixture = JSON.parse(await readFile(
  new URL("../../data/generated/field-visit-shortlist.json", import.meta.url),
  "utf8",
));

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
  await expect(page.getByText("順位は推定条件によって変わります。")).toBeVisible();
  await expect(page.getByRole("heading", { name: "基準重みの単一スコア順位" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "頑健性を踏まえた現地確認の推奨訪問順" })).toBeVisible();
  const candidateCards = page.locator("article.field-candidate-card");
  const candidateCount = await candidateCards.count();
  expect(candidateCount).toBeGreaterThan(0);
  expect(candidateCount).toBe(fieldCandidateFixture.candidates.length);
  const dynamicRouteLayer = page.locator(".field-map-route--dynamic");
  const fixedDemoRouteLayer = page.locator(".field-map-route--fixed-demo");
  const dynamicRouteToggle = page.getByLabel("代表動的3経路", { exact: true });
  const fixedDemoRouteToggle = page.getByLabel("固定デモ経路（回帰比較）", { exact: true });
  await expect(dynamicRouteToggle).toBeChecked();
  await expect(fixedDemoRouteToggle).not.toBeChecked();
  await expect(dynamicRouteLayer).toHaveCount(3);
  await expect(fixedDemoRouteLayer).toHaveCount(0);
  await expect(page.locator(".field-map-candidate")).toHaveCount(candidateCount);
  await expect(page.locator(".field-map-nearest-point")).toHaveCount(1);
  await expect(page.locator(".field-map-detour-line")).toHaveCount(1);
  await expect(page.locator(".field-map-insertion")).toHaveCount(1);
  await fixedDemoRouteToggle.check();
  await expect(fixedDemoRouteLayer).toHaveCount(2);
  await dynamicRouteToggle.uncheck();
  await expect(dynamicRouteLayer).toHaveCount(0);
  await dynamicRouteToggle.check();
  await expect(dynamicRouteLayer).toHaveCount(3);
  const topCandidates = fieldCandidateFixture.candidates.slice(0, 5);
  for (const [index, candidate] of topCandidates.entries()) {
    expect(candidate.grossImprovementMeters).toBeGreaterThan(0);
    expect(candidate.facilityAccessCategory).not.toBe("restricted_or_sensitive");
    expect(candidate.name).not.toMatch(/学校|幼稚園|保育|こども園/);
    await expect(candidateCards.nth(index)).toContainText(candidate.name);
    await expect(candidateCards.nth(index)).toContainText(`推定${Math.round(candidate.grossImprovementMeters)}m`);
  }
  const baselineRankingItems = page.locator(".field-baseline-ranking-list").first().locator("li");
  await expect(baselineRankingItems).toHaveCount(5);
  for (const [index, analysis] of fieldRankingSensitivityFixture.candidates.slice(0, 5).entries()) {
    await expect(baselineRankingItems.nth(index)).toContainText(analysis.name);
  }
  const visitRankingItems = page.locator("#field-robust-visit-title").locator("xpath=..").locator("li");
  await expect(visitRankingItems).toHaveCount(5);
  for (const [index, entry] of fieldVisitShortlistFixture.candidates.entries()) {
    await expect(visitRankingItems.nth(index)).toContainText(entry.name);
    const card = candidateCards.filter({ hasText: entry.name });
    await expect(card).toHaveAttribute("data-shortlisted", "true");
    await expect(card).toHaveAttribute("data-visit-priority", String(entry.visitPriority));
    await expect(card).toContainText(`推定${Math.round(entry.optimisticImprovementMeters)}m`);
    await expect(card).toContainText(`推定${Math.round(entry.lowerBoundAdjustedImprovementMeters)}m`);
    await expect(card).toContainText(`推定${Math.round(entry.conservativeProxyImprovementMeters)}m`);
    await expect(card).toContainText("この地点を訪問候補へ含めた理由");
  }
  expect(fieldVisitShortlistFixture.candidates.map((entry) => entry.candidateId))
    .not.toEqual(fieldRankingSensitivityFixture.candidates.slice(0, 5).map((entry) => entry.candidateId));
  const firstTechnicalDetails = candidateCards.first().locator("details.field-candidate-technical-details");
  await expect(firstTechnicalDetails).not.toHaveAttribute("open", "");
  await firstTechnicalDetails.locator(":scope > summary").click();
  await expect(firstTechnicalDetails).toHaveAttribute("open", "");
  await expect(firstTechnicalDetails).toContainText("現地確認順位スコア内訳");
  await expect(page.locator(".leaflet-control-attribution")).toContainText("OpenStreetMap");
  await expect(page.getByText("読み取り専用", { exact: true })).toBeVisible();
  await expect(page.locator("form")).toHaveCount(0);

  const [templateDownload] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "入力用CSVテンプレートをダウンロード" }).click()]);
  expect(templateDownload.suggestedFilename()).toBe("tokyo-pace-field-verification-template.csv");
  const template = (await downloadedBytes(templateDownload)).toString("utf8");
  expect(template).toContain("verificationId,candidateId,name,latitude,longitude,address,verifiedAt,verifier,verificationMethod");
  expect(template.trim().split("\n")).toHaveLength(candidateCount + 1);
  await expect(page.getByText(`${candidateCount}候補を記入済みのCSVテンプレートを生成しました。`)).toBeVisible();
});
