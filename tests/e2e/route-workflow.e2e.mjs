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

test("現地調査実施版は優先5地点を現場向けに表示しCSVへ事実を記録できる", async ({ page, context }) => {
  await blockExternalMapTiles(page);
  await page.goto("/?mode=field-check");

  await expect(page.getByRole("heading", { name: "現地調査実施版" })).toBeVisible();
  await expect(page.getByText("読み取り専用です。この画面から確認結果は送信・保存されません。")).toBeVisible();
  await expect(page.getByRole("heading", { name: "優先的に確認する5地点" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "現地確認の優先順位" })).toBeVisible();
  await expect(page.getByText("表示順は最短巡回順ではありません。").first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText("推奨訪問順");
  await expect(page.locator("body")).not.toContainText("訪問推奨");

  const priorityCards = page.locator(".field-priority-candidate-list article.field-survey-card");
  const otherDetails = page.locator("details.field-other-candidates-details");
  const otherCards = otherDetails.locator("article.field-other-candidate-card");
  await expect(priorityCards).toHaveCount(5);
  await expect(otherCards).toHaveCount(3);
  await expect(otherDetails).not.toHaveAttribute("open", "");
  for (const [index, entry] of fieldVisitShortlistFixture.candidates.entries()) {
    const card = priorityCards.nth(index);
    await expect(card).toContainText(entry.name);
    await expect(card).toHaveAttribute("data-confirmation-priority", String(entry.visitPriority));
    await expect(card).toContainText(`確認優先度 ${entry.visitPriority}`);
    await expect(card).toContainText("移動改善効果");
    await expect(card).toContainText("現地確認価値");
    await expect(card).toContainText("確認優先順位に含めた理由");
    await expect(card).toContainText("検討した15設定");
    await expect(card.getByRole("checkbox")).toHaveCount(14);
  }

  const baselineDetails = page.locator("details.field-baseline-analysis-details");
  await expect(baselineDetails).not.toHaveAttribute("open", "");
  await baselineDetails.locator(":scope > summary").click();
  const baselineRankingItems = baselineDetails.locator(".field-baseline-ranking-list li");
  await expect(baselineRankingItems).toHaveCount(5);
  for (const [index, analysis] of fieldRankingSensitivityFixture.candidates.slice(0, 5).entries()) {
    await expect(baselineRankingItems.nth(index)).toContainText(analysis.name);
  }
  await baselineDetails.locator(":scope > summary").click();

  const dynamicRouteLayer = page.locator(".field-map-route--dynamic");
  const fixedDemoRouteLayer = page.locator(".field-map-route--fixed-demo");
  const dynamicRouteToggle = page.getByLabel("代表動的3経路", { exact: true });
  const fixedDemoRouteToggle = page.getByLabel("固定デモ経路（回帰比較）", { exact: true });
  const priorityCandidateToggle = page.getByRole("checkbox", { name: "優先的に確認する5地点", exact: true });
  const otherCandidateToggle = page.getByRole("checkbox", { name: "その他の分析候補3地点", exact: true });
  await expect(dynamicRouteToggle).toBeChecked();
  await expect(fixedDemoRouteToggle).not.toBeChecked();
  await expect(priorityCandidateToggle).toBeChecked();
  await expect(otherCandidateToggle).not.toBeChecked();
  await expect(dynamicRouteLayer).toHaveCount(3);
  await expect(fixedDemoRouteLayer).toHaveCount(0);
  await expect(page.locator(".field-map-candidate")).toHaveCount(5);
  await expect(page.locator(".field-map-nearest-point")).toHaveCount(1);
  await expect(page.locator(".field-map-detour-line")).toHaveCount(1);
  await expect(page.locator(".field-map-insertion")).toHaveCount(1);
  await otherCandidateToggle.check();
  await expect(page.locator(".field-map-candidate")).toHaveCount(fieldCandidateFixture.candidates.length);
  await otherCandidateToggle.uncheck();
  await expect(page.locator(".field-map-candidate")).toHaveCount(5);
  await fixedDemoRouteToggle.check();
  await expect(fixedDemoRouteLayer).toHaveCount(2);
  await dynamicRouteToggle.uncheck();
  await expect(dynamicRouteLayer).toHaveCount(0);
  await dynamicRouteToggle.check();
  await expect(dynamicRouteLayer).toHaveCount(3);

  const secondPriorityCard = priorityCards.nth(1);
  await secondPriorityCard.getByRole("button", { name: "地図で表示" }).click();
  await expect(secondPriorityCard).toHaveAttribute("aria-current", "location");
  await expect(page.locator(".field-map-selected-label", { hasText: "確認優先度2" })).toHaveCount(1);
  await expect(page.locator(".field-map-candidate--selected")).toHaveCount(1);

  expect(fieldVisitShortlistFixture.candidates.map((entry) => entry.candidateId))
    .not.toEqual(fieldRankingSensitivityFixture.candidates.slice(0, 5).map((entry) => entry.candidateId));
  const firstTechnicalDetails = priorityCards.first().locator("details.field-candidate-technical-details");
  await expect(firstTechnicalDetails).not.toHaveAttribute("open", "");
  await firstTechnicalDetails.locator(":scope > summary").click();
  await expect(firstTechnicalDetails).toHaveAttribute("open", "");
  await expect(firstTechnicalDetails).toContainText("現地確認順位スコア内訳");
  await expect(firstTechnicalDetails).toContainText("単一スコア順位");
  await expect(firstTechnicalDetails).toContainText("公式データ出典");
  await expect(page.locator(".leaflet-control-attribution")).toContainText("OpenStreetMap");
  await expect(page.getByText("読み取り専用", { exact: true })).toBeVisible();
  await expect(page.locator("form")).toHaveCount(0);

  const origin = new URL(page.url()).origin;
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
  const firstCard = priorityCards.first();
  const verificationId = await firstCard.getByLabel("verificationIdの完全な値").inputValue();
  await firstCard.getByRole("button", { name: "verificationIdをコピー" }).click();
  await expect(firstCard.locator(".field-copy-status")).toHaveText("verificationIdをコピーしました");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(verificationId);
  const candidateId = await firstCard.getByLabel("candidateIdの完全な値").inputValue();
  await firstCard.getByRole("button", { name: "candidateIdをコピー" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(candidateId);
  const address = await firstCard.getByLabel("住所の完全な値").inputValue();
  await firstCard.getByRole("button", { name: "住所をコピー" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(address);
  await expect(firstCard.locator(".field-copy-status")).toHaveAttribute("aria-live", "polite");
  await expect(firstCard).toContainText("選択可能な完全な値");

  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error("denied")) },
    });
  });
  await firstCard.getByRole("button", { name: "candidateIdをコピー" }).click();
  await expect(firstCard.locator(".field-copy-status")).toContainText("コピーできませんでした");
  await expect(firstCard.locator(".field-copy-status")).not.toContainText("denied");

  const temporaryCheck = firstCard.getByRole("checkbox", { name: "一般利用できるか" });
  await temporaryCheck.check();
  await expect(temporaryCheck).toBeChecked();

  const [visitPlanDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "現地調査用5地点CSVをダウンロード" }).click(),
  ]);
  expect(visitPlanDownload.suggestedFilename()).toBe("tokyo-pace-field-visit-plan.csv");
  const visitPlanBytes = await downloadedBytes(visitPlanDownload);
  expect(visitPlanBytes[0]).toBe(0xef);
  expect(visitPlanBytes[1]).toBe(0xbb);
  expect(visitPlanBytes[2]).toBe(0xbf);
  const visitPlan = visitPlanBytes.toString("utf8");
  expect(visitPlan).toContain("confirmationPriority,verificationId,candidateId,name,address");
  expect(visitPlan.trim().split(/\r?\n/)).toHaveLength(6);
  expect(visitPlan).toContain("publiclyAccessible,seatingAvailable,seatingUsableForRest");
  await expect(page.getByText("5地点の現地調査用CSVを生成しました。")).toBeVisible();

  const [templateDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "全候補を含む確認テンプレートをダウンロード" }).click(),
  ]);
  expect(templateDownload.suggestedFilename()).toBe("tokyo-pace-field-verification-template.csv");
  const template = (await downloadedBytes(templateDownload)).toString("utf8");
  expect(template).toContain("verificationId,candidateId,name,latitude,longitude,address,verifiedAt,verifier,verificationMethod");
  expect(template.trim().split("\n")).toHaveLength(fieldCandidateFixture.candidates.length + 1);
  await expect(page.getByText("8候補を含む確認テンプレートを生成しました。")).toBeVisible();

  await page.reload();
  await expect(page.locator(".field-priority-candidate-list article.field-survey-card").first()
    .getByRole("checkbox", { name: "一般利用できるか" })).not.toBeChecked();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "現地調査実施版" })).toBeVisible();
  const overflow = await page.evaluate(() => ({
    document: globalThis.document.documentElement.scrollWidth - globalThis.document.documentElement.clientWidth,
    body: globalThis.document.body.scrollWidth - globalThis.document.body.clientWidth,
  }));
  expect(overflow.document).toBeLessThanOrEqual(1);
  expect(overflow.body).toBeLessThanOrEqual(1);
  await expect(page.locator(".leaflet-control-attribution")).toContainText("OpenStreetMap");
});
