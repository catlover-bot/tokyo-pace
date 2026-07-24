import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildOpenDataAudit, clusterOfficialToiletRecords, distanceRecordToRoutes } from "../src/domain/officialToiletQuality.mjs";
import {
  FIELD_VERIFICATION_DATASET_ID,
  FIELD_VERIFICATION_HEADERS,
  buildVerifiedRestCandidates,
  normalizeFieldVerificationRows,
} from "../src/domain/fieldVerification.mjs";
import {
  DETOUR_ACCESS_LOWER_BOUND_FACTOR,
  FIELD_CHECK_MAXIMUM_DISTANCE_METERS,
  MIN_DETOUR_ADJUSTED_IMPROVEMENT_METERS,
  MIN_DETOUR_ADJUSTED_IMPROVEMENT_RATIO,
  extractFieldVerificationCandidates,
} from "../src/domain/fieldVerificationCandidates.mjs";
import {
  FIELD_CANDIDATE_TOP_RANK_LIMIT,
  FIELD_CANDIDATE_WEIGHT_VARIATION_RATIO,
  analyzeFieldCandidateRankingSensitivity,
  deriveFieldVisitShortlist,
  fieldCandidateRankingSensitivityCsv,
  fieldVisitShortlistCsv,
} from "../src/domain/fieldCandidateRankingSensitivity.mjs";
import {
  deriveFieldVisitPlan,
  fieldVisitPlanCsv,
} from "../src/domain/fieldVisitPlan.mjs";
import { parseRepresentativeDynamicRouteSnapshot } from "../src/domain/fieldCheckRouteSnapshot.mjs";

export const DATASETS = [
  {
    key: "shinjuku-public",
    provider: "新宿区",
    datasetName: "新宿区公衆トイレ一覧",
    datasetUrl: "https://catalog.data.metro.tokyo.lg.jp/dataset/t131041d0000000123",
    resourceUrl: "https://www.city.shinjuku.lg.jp/content/000399974.csv",
    encoding: "utf-16le",
    requiredHeaders: ["ID", "名称", "所在地_連結表記", "緯度", "経度", "車椅子使用者用トイレ有無"],
    normalizer: "shinjuku",
  },
  {
    key: "tokyo-public-accessible",
    provider: "東京都福祉局",
    datasetName: "公共施設等の車椅子使用者対応トイレ",
    datasetUrl: "https://catalog.data.metro.tokyo.lg.jp/dataset/t000054d0000000342",
    resourceUrl: "https://www.opendata.metro.tokyo.lg.jp/fukushi/3_koukyoshisetsu_barieer_free_wc.csv",
    encoding: "shift_jis",
    requiredHeaders: ["管理者種別番号", "施設通し番号", "施設名", "市区町村・番地", "経度", "緯度", "車椅子が出入りできる（出入口の有効幅員80cm以上）"],
    normalizer: "tokyo-public",
  },
  {
    key: "tokyo-station-accessible",
    provider: "東京都福祉局",
    datasetName: "鉄道駅の車椅子使用者対応トイレ",
    datasetUrl: "https://catalog.data.metro.tokyo.lg.jp/dataset/t000054d0000000342",
    resourceUrl: "https://www.opendata.metro.tokyo.lg.jp/fukushi/R0606/02/4_tonaitetsudoueki_barrier-free-wc.csv",
    encoding: "shift_jis",
    requiredHeaders: ["管理者種別番号", "鉄道駅通し番号", "鉄道駅名", "市区町村・番地", "経度", "緯度", "車椅子が出入りできる（出入口の有効幅員80cm以上）"],
    normalizer: "tokyo-station",
  },
];

const DAREDEMO_BASE = { provider: "東京都デジタルサービス局", datasetName: "宿泊施設等の施設情報ポータルサイト「だれでも東京」", datasetUrl: "https://catalog.data.metro.tokyo.lg.jp/dataset/t000029d0000000003", encoding: "shift_jis", license: "CC BY", normalizer: "daredemo", requiredHeaders: ["施設名", "市区町村名", "町丁目名"] };
export const REST_DATASETS = [
  { key: "tokyo-drinking-stations", provider: "東京都水道局", datasetName: "Tokyowater Drinking Station 一覧", datasetUrl: "https://catalog.data.metro.tokyo.lg.jp/dataset/t000019d0000000003", resourceUrl: "https://www.opendata.metro.tokyo.lg.jp/suidou/R7/tokyowaterdrinkingstation_250917.csv", datasetUpdatedAt: "2025-09-16", encoding: "shift_jis", license: "CC BY", normalizer: "water", requiredHeaders: ["緯度", "経度", "施設名称", "所在地", "水飲み栓設置場所", "入場料等", "タイプ"] },
  { key: "shinjuku-public-facilities", provider: "新宿区", datasetName: "新宿区の公共施設情報", datasetUrl: "https://catalog.data.metro.tokyo.lg.jp/dataset/t131041d0000000113", resourceUrl: "https://www.city.shinjuku.lg.jp/content/000399965.csv", datasetUpdatedAt: "2025-12-12", encoding: "utf-16le", license: "CC BY", normalizer: "public-facility", requiredHeaders: ["ID", "名称", "所在地_連結表記", "緯度", "経度"] },
  ...[["accommodation", "宿泊施設"], ["shopping", "ショッピング"], ["leisure", "レジャー"], ["dining", "飲食"], ["transport", "交通"], ["parks", "公園"], ["public_facilities", "公共施設"]].map(([key, genre]) => ({ ...DAREDEMO_BASE, key: `daredemo-${key}`, datasetName: `${DAREDEMO_BASE.datasetName}（${genre}）`, resourceUrl: `https://www.opendata.metro.tokyo.lg.jp/digitalservice/130001_Daredemo_Tokyo_${key}.csv`, encoding: key === "accommodation" ? "utf-8" : "shift_jis" })),
];

export function parseCsv(text) {
  const rows = []; let row = []; let field = ""; let quoted = false;
  const clean = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < clean.length; index += 1) {
    const character = clean[index];
    if (quoted) {
      if (character === '"' && clean[index + 1] === '"') { field += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") { row.push(field); field = ""; }
    else if (character === "\n") { row.push(field.replace(/\r$/, "")); if (row.some((value) => value !== "")) rows.push(row); row = []; field = ""; }
    else field += character;
  }
  if (quoted) throw new Error("CSVの引用符が閉じられていません");
  if (field || row.length) { row.push(field.replace(/\r$/, "")); if (row.some((value) => value !== "")) rows.push(row); }
  if (rows.length === 0) throw new Error("CSVが空です");
  const headers = rows[0].map((header) => header.trim());
  return { headers, records: rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ""]))) };
}

export function validateHeaders(headers, requiredHeaders) {
  const missing = requiredHeaders.filter((header) => !headers.includes(header));
  if (missing.length) throw new Error(`必須CSVヘッダーがありません: ${missing.join(", ")}`);
}

const nullable = (value) => value?.trim() || null;
export const parseBoolean = (value) => value === "有" || value === "○" ? true : value === "無" || value === "×" ? false : null;
const compactId = (...parts) => parts.map((part) => part || "0").join("-").replace(/[^\p{L}\p{N}-]/gu, "");
const updatedMonth = (value) => /^\d{6}$/.test(value ?? "") ? `${value.slice(0, 4)}-${value.slice(4, 6)}` : null;
const joinOpeningHours = (record, headers) => {
  const values = [...new Set(headers.map((header) => record[header]).filter(Boolean))];
  return values.length ? values.join(" / ") : null;
};

function baseSpot({ id, name, latitude, longitude, address, wheelchairAccessible, openingHours, officialToiletKind, dataset, datasetUpdatedAt }) {
  return {
    id, name, latitude, longitude, address, category: "toilet", seating: null, indoor: null,
    toiletAvailable: true, wheelchairAccessible, openingHours, officialToiletKind,
    source: { sourceDatasetId: dataset.key, sourceRecordId: id, provider: dataset.provider, datasetName: dataset.datasetName, license: "CC BY", datasetUpdatedAt, fieldVerifiedAt: null },
    confidence: "official",
  };
}

export function normalizeRecord(record, dataset, retrievedAt) {
  const latitude = Number(record["緯度"]); const longitude = Number(record["経度"]);
  if (!record["緯度"] || !record["経度"]) return { error: "緯度または経度が空欄" };
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return { error: "緯度または経度が不正な数値" };
  if (latitude < 20 || latitude > 50 || longitude < 120 || longitude > 155) return { error: "緯度または経度が日本周辺の範囲外" };

  if (dataset.normalizer === "shinjuku") {
    if (!record["ID"] || !record["名称"]) return { error: "IDまたは名称が空欄" };
    const openingHours = record["利用開始時間"] || record["利用終了時間"]
      ? `${record["利用開始時間"] || "不明"}〜${record["利用終了時間"] || "不明"}${record["利用可能時間特記事項"] ? `（${record["利用可能時間特記事項"]}）` : ""}` : null;
    return { spot: baseSpot({ id: `shinjuku-${record["ID"]}`, name: record["名称"], latitude, longitude, address: nullable(record["所在地_連結表記"]), wheelchairAccessible: parseBoolean(record["車椅子使用者用トイレ有無"]), openingHours, officialToiletKind: "public_toilet", dataset, datasetUpdatedAt: null, retrievedAt }) };
  }

  const isStation = dataset.normalizer === "tokyo-station";
  const id = isStation
    ? compactId("tokyo-station", record["管理者種別番号"], record["鉄道駅通し番号"], record["鉄道駅内トイレ通し番号"])
    : compactId("tokyo-public", record["管理者種別番号"], record["部局番号"], record["施設種別番号"], record["施設通し番号"], record["施設内トイレ通し番号"]);
  const facilityName = isStation ? `${record["鉄道会社名"] || ""} ${record["鉄道駅名"] || "鉄道駅"}`.trim() : record["施設名"];
  if (!facilityName) return { error: "施設名または鉄道駅名が空欄" };
  const name = `${facilityName}${record["トイレ名"] ? ` ${record["トイレ名"]}` : ""}${record["設置フロア"] ? `（${record["設置フロア"]}）` : ""}`;
  const weekdayHeaders = ["月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日", "日曜日", "祝日", "その他"];
  return { spot: baseSpot({ id, name, latitude, longitude, address: nullable([record["都道府県"], record["市区町村・番地"], record["ビル建物名"]].filter(Boolean).join("")), wheelchairAccessible: parseBoolean(record["車椅子が出入りできる（出入口の有効幅員80cm以上）"]), openingHours: joinOpeningHours(record, weekdayHeaders), officialToiletKind: isStation ? "station_toilet_information" : "facility_toilet_information", dataset, datasetUpdatedAt: updatedMonth(record["データの変更年月"] || record[" データの変更年月"] || record["データの作成年月 "] || record["データの作成年月"]), retrievedAt }) };
}

export function normalizeDataset(text, dataset, retrievedAt) {
  const parsed = parseCsv(text); validateHeaders(parsed.headers, dataset.requiredHeaders);
  const records = []; const exclusions = new Map();
  for (const row of parsed.records) {
    const result = normalizeRecord(row, dataset, retrievedAt);
    if (result.spot) records.push(result.spot);
    else exclusions.set(result.error, (exclusions.get(result.error) ?? 0) + 1);
  }
  if (records.length === 0) throw new Error(`${dataset.datasetName}: 有効な行がありません`);
  return { records, inputCount: parsed.records.length, excludedCount: parsed.records.length - records.length, exclusionReasons: Object.fromEntries([...exclusions].sort()) };
}

const normalizeMatchText = (value) => (value ?? "").normalize("NFKC").toLowerCase().replace(/[\s\u3000・,，.。()（）-]/g, "");
const approximateDistance = (a, b) => {
  const latitudeMeters = (a.latitude - b.latitude) * 111_320;
  const longitudeMeters = (a.longitude - b.longitude) * 91_000;
  return Math.hypot(latitudeMeters, longitudeMeters);
};

export const DEMO_ROUTE_DEFINITIONS = [
  { id: "standard", distanceMeters: 1050, coordinates: [[35.69092, 139.69917], [35.69062, 139.69675], [35.69010, 139.69435], [35.68945, 139.69215]] },
  { id: "comfort", distanceMeters: 1350, coordinates: [[35.69092, 139.69917], [35.69105, 139.69550], [35.69018, 139.68858], [35.68955, 139.68845], [35.68908, 139.68925], [35.68945, 139.69215]] },
];
export const REPRESENTATIVE_DYNAMIC_ROUTE_SNAPSHOT_RELATIVE_PATH = "data/routing-snapshots/shinjuku-west-to-tocho.v1.json";
const DEMO_ROUTES = DEMO_ROUTE_DEFINITIONS.map((route) => route.coordinates);
export function findDuplicateCandidates(records) {
  const candidates = [];
  for (let left = 0; left < records.length; left += 1) for (let right = left + 1; right < records.length; right += 1) {
    const a = records[left]; const b = records[right];
    if (a.source.datasetName === b.source.datasetName || approximateDistance(a, b) > 25) continue;
    const sameName = normalizeMatchText(a.name) === normalizeMatchText(b.name);
    const sameAddress = normalizeMatchText(a.address) !== "" && normalizeMatchText(a.address) === normalizeMatchText(b.address);
    if (sameName || sameAddress) candidates.push({ ids: [a.id, b.id].sort(), reason: sameName ? "名称と座標が近接" : "住所と座標が近接" });
  }
  return candidates.sort((a, b) => a.ids.join(":").localeCompare(b.ids.join(":")));
}

async function fetchDataset(dataset, fetchImpl) {
  const response = await fetchImpl(dataset.resourceUrl);
  if (!response.ok) throw new Error(`${dataset.datasetName}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const text = new TextDecoder(dataset.encoding).decode(bytes).replace(/^\uFEFF/, "");
  return { bytes, text };
}

export function normalizeRestRecord(record, dataset) {
  const latitudeText = record["緯度"] || record["緯度_加工"]; const longitudeText = record["経度"] || record["経度_加工"];
  const latitude = Number(latitudeText); const longitude = Number(longitudeText);
  if (!latitudeText || !longitudeText) return { error: "緯度または経度が空欄" };
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return { error: "緯度または経度が不正な数値" };
  const recordId = dataset.normalizer === "water" ? compactId(dataset.key, record["施設名称"], record["所在地"], latitude, longitude)
    : dataset.normalizer === "public-facility" ? `shinjuku-facility-${record["ID"]}` : compactId(dataset.key, record["施設名"], record["全国地方公共団体コード"], latitude, longitude);
  const source = { sourceDatasetId: dataset.key, sourceRecordId: recordId, provider: dataset.provider, datasetName: dataset.datasetName, license: dataset.license, datasetUpdatedAt: dataset.datasetUpdatedAt ?? "2025-05-26", fieldVerifiedAt: null };
  if (dataset.normalizer === "water") return { candidate: { id: recordId, name: record["施設名称"] || "名称不明の給水地点", latitude, longitude, address: nullable(record["所在地"]), category: "drinking_station", confidence: "possible", openingHours: null, indoor: null, seating: null, drinkingWaterAvailable: true, wheelchairAccessible: null, source } };
  if (dataset.normalizer === "public-facility") {
    if (!record["ID"] || !record["名称"]) return { error: "IDまたは名称が空欄" };
    return { candidate: { id: recordId, name: record["名称"], latitude, longitude, address: nullable(record["所在地_連結表記"]), category: "public_facility", confidence: "possible", openingHours: null, indoor: null, seating: null, drinkingWaterAvailable: null, wheelchairAccessible: null, source } };
  }
  if (!record["施設名"]) return { error: "施設名が空欄" };
  const yes = (value) => value === "有" ? true : value === "無" ? false : null;
  return { candidate: { id: recordId, name: record["施設名"], latitude, longitude, address: nullable([record["都道府県名"], record["市区町村名"], record["町丁目名"]].filter(Boolean).join("")), category: "barrier_free_facility", confidence: "possible", openingHours: nullable(record["対応可能日時（曜日や時間帯等）"]), indoor: null, seating: null, drinkingWaterAvailable: null, wheelchairAccessible: yes(record["車いすの貸出の可否"]), source } };
}

export function normalizeRestDataset(text, dataset, retrievedAt) {
  const parsed = parseCsv(text); validateHeaders(parsed.headers, dataset.requiredHeaders);
  const records = []; const exclusions = new Map();
  for (const row of parsed.records) { const result = normalizeRestRecord(row, dataset, retrievedAt); if (result.candidate) records.push(result.candidate); else exclusions.set(result.error, (exclusions.get(result.error) ?? 0) + 1); }
  if (!records.length) throw new Error(`${dataset.datasetName}: 有効な行がありません`);
  return { records, inputCount: parsed.records.length, excludedCount: parsed.records.length - records.length, exclusionReasons: Object.fromEntries([...exclusions].sort()) };
}

export function deduplicateRestCandidates(records) {
  const ordered = [...records].sort((a, b) => a.id.localeCompare(b.id));
  const seen = new Set();
  return ordered.filter((record) => { const key = `${record.category}:${record.name.normalize("NFKC")}:${record.latitude.toFixed(6)}:${record.longitude.toFixed(6)}`; if (seen.has(key)) return false; seen.add(key); return true; });
}

async function atomicWrite(file, content) {
  await mkdir(path.dirname(file), { recursive: true });
  try { if (Buffer.compare(await readFile(file), Buffer.from(content)) === 0) return false; } catch { /* first generation */ }
  const temporary = `${file}.tmp-${process.pid}`;
  await writeFile(temporary, content);
  await rename(temporary, file);
  return true;
}

export const contentSha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const recordOrder = (a, b) => (a.source.sourceDatasetId ?? "").localeCompare(b.source.sourceDatasetId ?? "")
  || (a.source.sourceRecordId ?? "").localeCompare(b.source.sourceRecordId ?? "")
  || a.name.normalize("NFKC").localeCompare(b.name.normalize("NFKC")) || a.latitude - b.latitude || a.longitude - b.longitude || a.id.localeCompare(b.id);
export const sortNormalizedRecords = (records) => [...records].sort(recordOrder);
export const retainedRetrievedAt = (previousEntry, hash, now) => previousEntry?.contentSha256 === hash ? previousEntry.retrievedAt : now;
async function previousManifest(rootDir) {
  try { return JSON.parse(await readFile(path.join(rootDir, "data/generated/open-data-manifest.json"), "utf8")); } catch { return { schemaVersion: 1, datasets: [] }; }
}
async function obtainDataset(dataset, fetchImpl, rawSnapshotDir) {
  if (rawSnapshotDir) {
    const bytes = new Uint8Array(await readFile(path.join(rawSnapshotDir, `${dataset.key}.csv`)));
    return { bytes, text: new TextDecoder(dataset.encoding).decode(bytes).replace(/^\uFEFF/, "") };
  }
  return fetchDataset(dataset, fetchImpl);
}
export function resolveRetrievedAt(sourceDatasetId, manifest) { return manifest.datasets.find((item) => item.datasetId === sourceDatasetId)?.retrievedAt ?? null; }

export const FIELD_VERIFICATION_CANDIDATE_CSV_HEADERS = [
  "fieldCheckPriority", "candidateId", "verificationId", "name", "address", "latitude", "longitude",
  "facilityAccessCategory", "accessPrior", "categoryPenalty", "requiresSpecialCaution",
  "dynamicRouteIds", "fixedDemoRouteIds", "primaryRouteId", "numberOfCoveredRoutes",
  "distanceToRouteMeters", "estimatedDetourLowerBoundMeters", "routeProgressMeters",
  "currentLongestGapMeters", "expectedImprovedGapMeters", "grossImprovementMeters",
  "grossImprovementRatio", "detourAdjustedImprovementMeters", "detourAdjustedImprovementRatio",
  "rankingScore", "selectionReasonCodes", "selectionReasons", "categoryReasons",
  "specialCautions", "officialSourceIds",
];

const csvCell = (value) => {
  const text = Array.isArray(value) ? value.join("|") : value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export function fieldVerificationCandidatesCsv(candidates) {
  const rows = candidates.map((candidate) => FIELD_VERIFICATION_CANDIDATE_CSV_HEADERS.map((header) => csvCell(candidate[header])).join(","));
  return `${FIELD_VERIFICATION_CANDIDATE_CSV_HEADERS.join(",")}\n${rows.length ? `${rows.join("\n")}\n` : ""}`;
}

function compactRankingCandidate(candidate) {
  const compact = { ...candidate };
  delete compact.scenarioRanks;
  return compact;
}

async function loadFieldVerification(file, candidates, candidateGroups = []) {
  const bytes = new Uint8Array(await readFile(file));
  const parsed = parseCsv(new TextDecoder("utf-8").decode(bytes));
  validateHeaders(parsed.headers, FIELD_VERIFICATION_HEADERS);
  const normalized = normalizeFieldVerificationRows(parsed.records, candidates);
  const records = normalized.records;
  const verifiedCandidates = buildVerifiedRestCandidates(records, candidates, candidateGroups);
  const exclusionReasonCounts = {};
  for (const exclusion of normalized.exclusions) for (const reason of exclusion.reasons) {
    exclusionReasonCounts[reason] = (exclusionReasonCounts[reason] ?? 0) + 1;
  }
  return { bytes, records, verifiedCandidates, ...normalized, exclusionReasonCounts: Object.fromEntries(Object.entries(exclusionReasonCounts).sort()) };
}

export async function runUpdate({
  fetchImpl = fetch,
  rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  retrievedAt = new Date().toISOString(),
  rawSnapshotDir = null,
  fieldVerificationPath = path.join(rootDir, "data/field-verification/rest-spots.csv"),
  dynamicRouteSnapshotPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    REPRESENTATIVE_DYNAMIC_ROUTE_SNAPSHOT_RELATIVE_PATH,
  ),
} = {}) {
  const dynamicRouteSnapshotBytes = await readFile(dynamicRouteSnapshotPath);
  const dynamicRouteSnapshot = parseRepresentativeDynamicRouteSnapshot(
    new TextDecoder("utf-8").decode(dynamicRouteSnapshotBytes),
  );
  const dynamicRouteDefinitions = dynamicRouteSnapshot.routes.map((route) => ({
    id: route.id,
    profile: route.profile,
    distanceMeters: route.distanceMeters,
    coordinates: route.coordinates,
  }));
  const oldManifest = await previousManifest(rootDir);
  const downloaded = [];
  for (const dataset of DATASETS) {
    const source = await obtainDataset(dataset, fetchImpl, rawSnapshotDir);
    const normalized = normalizeDataset(source.text, dataset, retrievedAt);
    downloaded.push({ dataset, ...source, ...normalized });
  }
  const restDownloaded = [];
  for (const dataset of REST_DATASETS) { const source = await obtainDataset(dataset, fetchImpl, rawSnapshotDir); try { restDownloaded.push({ dataset, ...source, ...normalizeRestDataset(source.text, dataset, retrievedAt) }); } catch (error) { throw new Error(`${dataset.datasetName}: ${error instanceof Error ? error.message : error}`, { cause: error }); } }
  const allDownloads = [...downloaded, ...restDownloaded];
  const manifestDatasetInputs = allDownloads.map((item) => {
    const hash = contentSha256(item.bytes); const old = oldManifest.datasets.find((entry) => entry.datasetId === item.dataset.key);
    return { datasetId: item.dataset.key, datasetUrl: item.dataset.datasetUrl, resourceUrl: item.dataset.resourceUrl,
      retrievedAt: retainedRetrievedAt(old, hash, retrievedAt),
      contentSha256: hash, byteSize: item.bytes.byteLength, normalizedRecordCount: item.records.length,
      excludedRecordCount: item.excludedCount, sourceUpdatedAt: item.dataset.datasetUpdatedAt ?? null,
      encoding: item.dataset.encoding, license: item.dataset.license ?? "CC BY",
      provider: item.dataset.provider, datasetName: item.dataset.datasetName };
  }).sort((a, b) => a.datasetId.localeCompare(b.datasetId));
  const generationRetrievedAt = [...manifestDatasetInputs.map((item) => item.retrievedAt)].sort().at(-1) ?? retrievedAt;
  const manifestDatasets = manifestDatasetInputs.map((item) => ({
    ...item,
    sourceType: "official_open_data",
    attribution: `${item.provider}「${item.datasetName}」（${item.license}）`,
    generatedBy: "TOKYO PACE",
    generatedAt: generationRetrievedAt,
  }));
  const manifest = { schemaVersion: 1, generatedBy: "TOKYO PACE", generatedAt: generationRetrievedAt, datasets: manifestDatasets };
  const restRecords = restDownloaded.flatMap((item) => item.records).sort(recordOrder);
  const restCandidates = deduplicateRestCandidates(restRecords);
  const nearbyRestCandidates = restCandidates.filter((candidate) => distanceRecordToRoutes(candidate, DEMO_ROUTES) <= 350);
  const unverifiedFieldCandidateGroups = extractFieldVerificationCandidates({
    dynamicRoutes: dynamicRouteDefinitions,
    fixedDemoRoutes: DEMO_ROUTE_DEFINITIONS,
    candidates: restCandidates,
    limit: Number.MAX_SAFE_INTEGER,
  }).candidates;
  const fieldVerification = await loadFieldVerification(fieldVerificationPath, restCandidates, unverifiedFieldCandidateGroups);
  const nearbyVerifiedCandidates = fieldVerification.verifiedCandidates.filter((candidate) => distanceRecordToRoutes(candidate, DEMO_ROUTES) <= 350);
  const replacedCandidateIds = new Set(fieldVerification.verifiedCandidates.flatMap((candidate) => candidate.relatedCandidateIds));
  const restCandidatesWithVerification = [
    ...restCandidates.filter((candidate) => !replacedCandidateIds.has(candidate.id)),
    ...fieldVerification.verifiedCandidates,
  ].sort(recordOrder);
  const fieldCandidateExtraction = extractFieldVerificationCandidates({
    dynamicRoutes: dynamicRouteDefinitions,
    fixedDemoRoutes: DEMO_ROUTE_DEFINITIONS,
    candidates: restCandidatesWithVerification,
  });
  const fieldCandidateRankingSensitivity = analyzeFieldCandidateRankingSensitivity(
    fieldCandidateExtraction.candidates,
  );
  const fieldVisitShortlist = deriveFieldVisitShortlist(fieldCandidateRankingSensitivity);
  const fieldVisitPlan = deriveFieldVisitPlan(
    fieldVisitShortlist,
    fieldCandidateExtraction.candidates,
  );
  const records = downloaded.flatMap(({ records: items }) => items).sort(recordOrder);
  const shinjukuRecords = records.filter((record) => record.address?.includes("新宿区"));
  const places = clusterOfficialToiletRecords(records);
  const demoRoutePlaces = places.filter((place) => distanceRecordToRoutes({ latitude: place.representativeLatitude, longitude: place.representativeLongitude }, DEMO_ROUTES) <= 350);
  const demoRouteRecords = demoRoutePlaces.flatMap((place) => place.records);
  const duplicateCandidates = findDuplicateCandidates(shinjukuRecords);
  const audit = buildOpenDataAudit(records, DEMO_ROUTES, generationRetrievedAt);
  const metadata = {
    manifestDatasetIds: DATASETS.map((item) => item.key).sort(), license: "CC BY", recordCount: records.length, shinjukuRecordCount: shinjukuRecords.length,
    excludedCount: downloaded.reduce((sum, item) => sum + item.excludedCount, 0), duplicateCandidateCount: duplicateCandidates.length, demoRouteNearbyCount: demoRouteRecords.length,
    officialPlaceCount: places.length, demoRouteNearbyPlaceCount: demoRoutePlaces.length,
    sources: DATASETS.map(({ key, provider, datasetName, datasetUrl, resourceUrl }) => ({ key, provider, datasetName, datasetUrl, resourceUrl, license: "CC BY" })),
  };
  const generated = stableJson({ metadata, records });
  const generatedPlaces = stableJson({ metadata, places });
  const uiGenerated = stableJson({ metadata: { manifestDatasetIds: metadata.manifestDatasetIds, recordCount: demoRouteRecords.length, officialPlaceCount: demoRoutePlaces.length, scope: "デモルートから推定直線距離350m以内" }, places: demoRoutePlaces });
  const restMetadata = { manifestDatasetIds: REST_DATASETS.map((item) => item.key).sort(), recordCount: restRecords.length, candidateCount: restCandidates.length, demoRouteNearbyCount: nearbyRestCandidates.length, duplicateCandidateCount: restRecords.length - restCandidates.length,
    confidenceCounts: Object.fromEntries(["confirmed", "supported", "possible", "estimated"].map((confidence) => [confidence, restCandidates.filter((item) => item.confidence === confidence).length])),
    attributeNullRates: Object.fromEntries(["openingHours", "indoor", "seating", "drinkingWaterAvailable", "wheelchairAccessible"].map((field) => [field, restRecords.length ? restRecords.filter((item) => item[field] === null).length / restRecords.length : 0])),
    datasets: restDownloaded.map((item) => ({ key: item.dataset.key, inputCount: item.inputCount, normalizedCount: item.records.length, excludedCount: item.excludedCount, exclusionReasons: item.exclusionReasons, shinjukuCount: item.records.filter((record) => record.address?.includes("新宿区")).length, demoRouteNearbyCount: item.records.filter((record) => distanceRecordToRoutes(record, DEMO_ROUTES) <= 350).length, license: item.dataset.license })),
    sources: REST_DATASETS.map(({ key, provider, datasetName, datasetUrl, resourceUrl, license }) => ({ key, provider, datasetName, datasetUrl, resourceUrl, license })) };
  const latestFieldVerifiedAt = fieldVerification.records.map((record) => record.verifiedAt).filter(Boolean).sort().at(-1) ?? null;
  const fieldMetadata = {
    schemaVersion: 1,
    sourceDatasetId: FIELD_VERIFICATION_DATASET_ID,
    sourceType: "tokyo_pace_field_verification",
    provider: "TOKYO PACE 現地確認",
    datasetName: "TOKYO PACE 休憩地点現地確認",
    license: null,
    attribution: "TOKYO PACE 現地確認データ",
    generatedBy: "TOKYO PACE",
    generatedAt: generationRetrievedAt,
    sourcePath: "data/field-verification/rest-spots.csv",
    contentSha256: contentSha256(fieldVerification.bytes),
    byteSize: fieldVerification.bytes.byteLength,
    inputRowCount: fieldVerification.inputCount,
    normalizedRecordCount: fieldVerification.normalizedCount,
    excludedRecordCount: fieldVerification.excludedCount,
    effectiveCandidateCount: fieldVerification.verifiedCandidates.length,
    latestVerifiedAt: latestFieldVerifiedAt,
    confidenceCounts: Object.fromEntries(["confirmed", "supported", "possible"].map((confidence) => [confidence, fieldVerification.verifiedCandidates.filter((candidate) => candidate.confidence === confidence).length])),
    exclusionReasonCounts: fieldVerification.exclusionReasonCounts,
    exclusions: fieldVerification.exclusions,
  };
  const fieldCandidateMetadata = {
    schemaVersion: 1,
    generatedBy: "TOKYO PACE",
    generatedAt: generationRetrievedAt,
    routeIds: dynamicRouteDefinitions.map((route) => route.id).sort(),
    dynamicRouteIds: dynamicRouteDefinitions.map((route) => route.id).sort(),
    fixedDemoRouteIds: DEMO_ROUTE_DEFINITIONS.map((route) => route.id).sort(),
    dynamicRouteSnapshot: {
      snapshotId: dynamicRouteSnapshot.snapshotId,
      sourcePath: REPRESENTATIVE_DYNAMIC_ROUTE_SNAPSHOT_RELATIVE_PATH,
      contentSha256: contentSha256(dynamicRouteSnapshotBytes),
      byteSize: dynamicRouteSnapshotBytes.byteLength,
      capturedAt: dynamicRouteSnapshot.source.capturedAt,
      sourceType: dynamicRouteSnapshot.source.sourceType,
      provider: dynamicRouteSnapshot.source.provider,
      license: dynamicRouteSnapshot.source.license,
      attribution: dynamicRouteSnapshot.source.attribution,
    },
    maximumDistanceToRouteMeters: FIELD_CHECK_MAXIMUM_DISTANCE_METERS,
    requestedLimit: null,
    detourAccessLowerBoundFactor: DETOUR_ACCESS_LOWER_BOUND_FACTOR,
    minimumDetourAdjustedImprovementMeters: MIN_DETOUR_ADJUSTED_IMPROVEMENT_METERS,
    minimumDetourAdjustedImprovementRatio: MIN_DETOUR_ADJUSTED_IMPROVEMENT_RATIO,
    preRankingGroupCount: fieldCandidateExtraction.preRankingGroupCount,
    eligibleGroupCount: fieldCandidateExtraction.eligibleGroupCount,
    rankedCandidateCount: fieldCandidateExtraction.rankedCandidateCount,
    coordinateConflictGroupCount: fieldCandidateExtraction.coordinateConflictGroupCount,
    excludedCoordinateConflictCandidateCount: fieldCandidateExtraction.excludedCoordinateConflictCandidateCount,
    excludedCoordinateConflictPlaceCount: fieldCandidateExtraction.excludedCoordinateConflictPlaceCount,
    exclusionReasonCounts: fieldCandidateExtraction.exclusionReasonCounts,
    exclusions: fieldCandidateExtraction.exclusions,
    candidateCount: fieldCandidateExtraction.candidates.length,
    sourceDatasetIds: [...new Set(fieldCandidateExtraction.candidates.flatMap((candidate) => candidate.officialSourceIds.map((sourceId) => sourceId.split(":", 1)[0])))].sort(),
  };
  const fieldCandidateRankingSensitivityMetadata = {
    schemaVersion: 1,
    datasetId: "tokyo-pace-field-candidate-ranking-sensitivity",
    sourceType: "tokyo_pace_derived_analysis",
    provider: "TOKYO PACE",
    datasetName: "TOKYO PACE field candidate ranking sensitivity analysis",
    generatedBy: "TOKYO PACE",
    generatedAt: generationRetrievedAt,
    sourceCandidateDatasetId: "tokyo-pace-field-verification-candidates",
    sourceCandidateCount: fieldCandidateExtraction.candidates.length,
    candidateCount: fieldCandidateRankingSensitivity.candidates.length,
    weightScenarioCount: fieldCandidateRankingSensitivity.weightScenarios.length,
    rankingScenarioCount: fieldCandidateRankingSensitivity.weightScenarios.length,
    rankingRowCount: fieldCandidateRankingSensitivity.rankings.length,
    weightVariationRatio: FIELD_CANDIDATE_WEIGHT_VARIATION_RATIO,
    topRankLimit: FIELD_CANDIDATE_TOP_RANK_LIMIT,
    paretoCandidateCount: fieldCandidateRankingSensitivity.paretoCandidateIds.length,
    configuration: fieldCandidateRankingSensitivity.configuration,
  };
  const fieldVisitShortlistMetadata = {
    schemaVersion: 1,
    datasetId: "tokyo-pace-field-visit-shortlist",
    sourceType: "tokyo_pace_derived_analysis",
    provider: "TOKYO PACE",
    datasetName: "TOKYO PACE robust field visit shortlist",
    generatedBy: "TOKYO PACE",
    generatedAt: generationRetrievedAt,
    sourceSensitivityDatasetId: fieldCandidateRankingSensitivityMetadata.datasetId,
    sourceCandidateCount: fieldCandidateRankingSensitivity.candidates.length,
    entryCount: fieldVisitShortlist.candidates.length,
    requestedLimit: FIELD_CANDIDATE_TOP_RANK_LIMIT,
    configuration: fieldVisitShortlist.configuration,
  };
  const fieldVisitPlanMetadata = {
    schemaVersion: 1,
    datasetId: "tokyo-pace-field-visit-plan",
    sourceType: "tokyo_pace_field_visit_plan",
    provider: "TOKYO PACE",
    datasetName: "TOKYO PACE 現地調査実施計画",
    generatedBy: "TOKYO PACE",
    generatedAt: generationRetrievedAt,
    sourceShortlistDatasetId: fieldVisitShortlistMetadata.datasetId,
    entryCount: fieldVisitPlan.entries.length,
    confirmationResultFieldsPrefilled: false,
    configuration: fieldVisitPlan.configuration,
  };
  const fieldCandidateRankingSensitivityFull = {
    metadata: fieldCandidateRankingSensitivityMetadata,
    ...fieldCandidateRankingSensitivity,
  };
  const fieldVisitShortlistFull = {
    metadata: fieldVisitShortlistMetadata,
    ...fieldVisitShortlist,
  };
  const fieldCandidateRankingSensitivityBrowser = {
    metadata: fieldCandidateRankingSensitivityMetadata,
    candidates: fieldCandidateRankingSensitivity.candidates.map(compactRankingCandidate),
  };
  const fieldVisitShortlistBrowser = {
    metadata: fieldVisitShortlistMetadata,
    entries: fieldVisitShortlist.candidates.map(compactRankingCandidate),
  };
  const fieldVisitPlanBrowser = {
    metadata: fieldVisitPlanMetadata,
    entries: fieldVisitPlan.entries,
  };
  const auditWithFieldVerification = {
    ...audit,
    fieldVerification: {
      sourceDatasetId: FIELD_VERIFICATION_DATASET_ID,
      inputRowCount: fieldMetadata.inputRowCount,
      normalizedRecordCount: fieldMetadata.normalizedRecordCount,
      excludedRecordCount: fieldMetadata.excludedRecordCount,
      effectiveCandidateCount: fieldMetadata.effectiveCandidateCount,
      confidenceCounts: fieldMetadata.confidenceCounts,
      exclusionReasonCounts: fieldMetadata.exclusionReasonCounts,
      exclusions: fieldMetadata.exclusions,
      candidateExtraction: {
        preRankingGroupCount: fieldCandidateMetadata.preRankingGroupCount,
        eligibleGroupCount: fieldCandidateMetadata.eligibleGroupCount,
        candidateCount: fieldCandidateMetadata.candidateCount,
        dynamicRouteSnapshot: fieldCandidateMetadata.dynamicRouteSnapshot,
        detourAccessLowerBoundFactor: fieldCandidateMetadata.detourAccessLowerBoundFactor,
        minimumDetourAdjustedImprovementMeters: fieldCandidateMetadata.minimumDetourAdjustedImprovementMeters,
        minimumDetourAdjustedImprovementRatio: fieldCandidateMetadata.minimumDetourAdjustedImprovementRatio,
        exclusionReasonCounts: fieldCandidateMetadata.exclusionReasonCounts,
        exclusions: fieldCandidateMetadata.exclusions,
        coordinateConflictGroupCount: fieldCandidateMetadata.coordinateConflictGroupCount,
        excludedCoordinateConflictCandidateCount: fieldCandidateMetadata.excludedCoordinateConflictCandidateCount,
        excludedCoordinateConflictPlaceCount: fieldCandidateMetadata.excludedCoordinateConflictPlaceCount,
      },
    },
  };
  const fieldCandidateBrowserMetadata = { ...fieldCandidateMetadata };
  delete fieldCandidateBrowserMetadata.exclusions;
  const artifacts = [
    ...downloaded.map(({ dataset, bytes }) => ({ relative: `data/raw/${dataset.key}.csv`, content: bytes })),
    ...restDownloaded.map(({ dataset, bytes }) => ({ relative: `data/raw/${dataset.key}.csv`, content: bytes })),
    { relative: "data/generated/official-toilets.json", content: generated },
    { relative: "data/generated/official-toilet-places.json", content: generatedPlaces },
    { relative: "data/generated/open-data-audit.json", content: stableJson(auditWithFieldVerification) },
    { relative: "data/generated/open-data-manifest.json", content: stableJson(manifest) },
    { relative: "src/data/generated/open-data-manifest.json", content: stableJson(manifest) },
    { relative: "src/data/generated/official-toilets.json", content: uiGenerated },
    { relative: "data/generated/rest-candidates.json", content: stableJson({ metadata: restMetadata, records: restRecords, candidates: restCandidates }) },
    { relative: "src/data/generated/rest-candidates.json", content: stableJson({ metadata: { manifestDatasetIds: restMetadata.manifestDatasetIds, candidateCount: nearbyRestCandidates.length, scope: "デモルートから推定直線距離350m以内" }, candidates: nearbyRestCandidates }) },
    { relative: "data/generated/verified-rest-spots.json", content: stableJson({ metadata: fieldMetadata, records: fieldVerification.records, candidates: fieldVerification.verifiedCandidates }) },
    { relative: "src/data/generated/verified-rest-spots.json", content: stableJson({ metadata: { sourceDatasetId: fieldMetadata.sourceDatasetId, contentSha256: fieldMetadata.contentSha256, normalizedRecordCount: fieldMetadata.normalizedRecordCount, fullCandidateCount: fieldMetadata.effectiveCandidateCount, candidateCount: nearbyVerifiedCandidates.length, latestVerifiedAt: fieldMetadata.latestVerifiedAt, confidenceCounts: fieldMetadata.confidenceCounts, scope: "デモルートから推定直線距離350m以内" }, candidates: nearbyVerifiedCandidates }) },
    { relative: "data/generated/field-verification-candidates.json", content: stableJson({ metadata: fieldCandidateMetadata, candidates: fieldCandidateExtraction.candidates }) },
    { relative: "src/data/generated/field-verification-candidates.json", content: stableJson({ metadata: fieldCandidateBrowserMetadata, candidates: fieldCandidateExtraction.candidates }) },
    { relative: "data/generated/field-verification-candidates.csv", content: fieldVerificationCandidatesCsv(fieldCandidateExtraction.candidates) },
    { relative: "data/generated/field-candidate-ranking-sensitivity.json", content: stableJson(fieldCandidateRankingSensitivityFull) },
    { relative: "data/generated/field-candidate-ranking-sensitivity.csv", content: fieldCandidateRankingSensitivityCsv(fieldCandidateRankingSensitivity) },
    { relative: "src/data/generated/field-candidate-ranking-sensitivity.json", content: stableJson(fieldCandidateRankingSensitivityBrowser) },
    { relative: "data/generated/field-visit-shortlist.json", content: stableJson(fieldVisitShortlistFull) },
    { relative: "data/generated/field-visit-shortlist.csv", content: fieldVisitShortlistCsv(fieldVisitShortlist) },
    { relative: "src/data/generated/field-visit-shortlist.json", content: stableJson(fieldVisitShortlistBrowser) },
    { relative: "data/generated/field-visit-plan.csv", content: fieldVisitPlanCsv(fieldVisitPlan) },
    { relative: "src/data/generated/field-visit-plan.json", content: stableJson(fieldVisitPlanBrowser) },
    { relative: "data/generated/field-check-route-snapshot.json", content: stableJson(dynamicRouteSnapshot) },
    { relative: "src/data/generated/field-check-route-snapshot.json", content: stableJson(dynamicRouteSnapshot) },
  ];
  for (const artifact of artifacts.filter((item) => item.relative.endsWith(".json"))) JSON.parse(String(artifact.content));
  await Promise.all(artifacts.map((artifact) => atomicWrite(path.join(rootDir, artifact.relative), artifact.content)));
  for (const item of downloaded) console.log(`${item.dataset.datasetName}: ${item.records.length}件（除外${item.excludedCount}件）`, item.exclusionReasons);
  for (const item of restDownloaded) console.log(`${item.dataset.datasetName}: 取得${item.inputCount}件 / 正規化${item.records.length}件 / 除外${item.excludedCount}件 / ${item.dataset.license} / ${resolveRetrievedAt(item.dataset.key, manifest)}`, item.exclusionReasons);
  console.log(`休憩・給水・屋内候補: 原レコード${restRecords.length}件 / 候補${restCandidates.length}地点 / デモルート350m以内${nearbyRestCandidates.length}地点 / 重複候補${restRecords.length - restCandidates.length}件`);
  console.log(`原レコード: ${records.length}件 / 表示候補地点: ${places.length}地点 / 新宿区: ${shinjukuRecords.length}件 / デモルート350m以内: ${demoRouteRecords.length}件・${demoRoutePlaces.length}地点`);
  console.log(`監査: 同一座標群${audit.identicalCoordinateGroupCount} / 10m以内群${audit.proximityGroupsWithin10m.length} / 25m以内群${audit.proximityGroupsWithin25m.length} / 曖昧近接ペア${audit.ambiguousNearbyPairCount}`);
  console.log(`現地確認: 入力${fieldMetadata.inputRowCount}件 / 正規化${fieldMetadata.normalizedRecordCount}件 / 順位候補${fieldCandidateMetadata.candidateCount}地点 / 順位除外${fieldCandidateMetadata.exclusions.length}地点`, fieldCandidateMetadata.exclusionReasonCounts);
  console.log(`Field candidate sensitivity: ${fieldCandidateRankingSensitivityMetadata.candidateCount} candidates / ${fieldCandidateRankingSensitivityMetadata.weightScenarioCount} weight scenarios / ${fieldCandidateRankingSensitivityMetadata.paretoCandidateCount} Pareto candidates / ${fieldVisitShortlistMetadata.entryCount} visit shortlist entries`);
  console.log(`Field visit plan: ${fieldVisitPlanMetadata.entryCount} entries / confirmation results prefilled: ${fieldVisitPlanMetadata.confirmationResultFieldsPrefilled}`);
  return {
    metadata,
    manifest,
    records,
    duplicateCandidates,
    restMetadata,
    restCandidates,
    fieldMetadata,
    fieldVerificationCandidates: fieldCandidateExtraction.candidates,
    fieldCandidateRankingSensitivity,
    fieldVisitShortlist,
    fieldVisitPlan,
    datasets: downloaded.map(({ dataset, inputCount, records: items, excludedCount, exclusionReasons }) => ({ key: dataset.key, inputCount, recordCount: items.length, excludedCount, exclusionReasons })),
  };
}

async function generatedHashes(rootDir) {
  const files = [];
  for (const relative of ["data/generated", "src/data/generated"]) for (const name of await readdir(path.join(rootDir, relative))) if (name.endsWith(".json") || name.endsWith(".csv")) {
    const file = path.join(rootDir, relative, name); files.push([`${relative}/${name}`, contentSha256(await readFile(file))]);
  }
  return Object.fromEntries(files.sort(([a], [b]) => a.localeCompare(b)));
}
export async function verifyDeterminism({ sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..") } = {}) {
  const first = await mkdtemp(path.join(tmpdir(), "tokyo-pace-determinism-a-")); const second = await mkdtemp(path.join(tmpdir(), "tokyo-pace-determinism-b-"));
  try {
    const options = {
      retrievedAt: "2000-01-01T00:00:00.000Z",
      rawSnapshotDir: path.join(sourceRoot, "data/raw"),
      fieldVerificationPath: path.join(sourceRoot, "data/field-verification/rest-spots.csv"),
      dynamicRouteSnapshotPath: path.join(sourceRoot, REPRESENTATIVE_DYNAMIC_ROUTE_SNAPSHOT_RELATIVE_PATH),
    };
    await runUpdate({ ...options, rootDir: first }); await runUpdate({ ...options, rootDir: second });
    const a = await generatedHashes(first); const b = await generatedHashes(second); const changed = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((file) => a[file] !== b[file]);
    if (changed.length) throw new Error(`再現性検証に失敗: ${changed.join(", ")}`);
    console.log(`再現性検証成功: ${Object.keys(a).length}生成ファイルのSHA-256が一致`); return a;
  } finally { await Promise.all([rm(first, { recursive: true, force: true }), rm(second, { recursive: true, force: true })]); }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  runUpdate().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
