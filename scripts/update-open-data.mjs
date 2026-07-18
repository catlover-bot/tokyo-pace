import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildOpenDataAudit, clusterOfficialToiletRecords, distanceRecordToRoutes } from "../src/domain/officialToiletQuality.mjs";

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

function baseSpot({ id, name, latitude, longitude, address, wheelchairAccessible, openingHours, officialToiletKind, dataset, datasetUpdatedAt, retrievedAt }) {
  return {
    id, name, latitude, longitude, address, category: "toilet", seating: null, indoor: null,
    toiletAvailable: true, wheelchairAccessible, openingHours, officialToiletKind,
    source: { provider: dataset.provider, datasetName: dataset.datasetName, datasetUrl: dataset.datasetUrl, resourceUrl: dataset.resourceUrl, license: "CC BY", datasetUpdatedAt, retrievedAt, fieldVerifiedAt: null },
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

const DEMO_ROUTES = [
  [[35.69092, 139.69917], [35.69062, 139.69675], [35.69010, 139.69435], [35.68945, 139.69215]],
  [[35.69092, 139.69917], [35.69105, 139.69550], [35.69018, 139.68858], [35.68955, 139.68845], [35.68908, 139.68925], [35.68945, 139.69215]],
];
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

async function atomicWrite(file, content) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}`;
  await writeFile(temporary, content);
  await rename(temporary, file);
}

export async function runUpdate({ fetchImpl = fetch, rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), retrievedAt = new Date().toISOString() } = {}) {
  const downloaded = [];
  for (const dataset of DATASETS) {
    const source = await fetchDataset(dataset, fetchImpl);
    const normalized = normalizeDataset(source.text, dataset, retrievedAt);
    downloaded.push({ dataset, ...source, ...normalized });
  }
  const records = downloaded.flatMap(({ records: items }) => items).sort((a, b) => a.id.localeCompare(b.id));
  const shinjukuRecords = records.filter((record) => record.address?.includes("新宿区"));
  const places = clusterOfficialToiletRecords(records);
  const demoRoutePlaces = places.filter((place) => distanceRecordToRoutes({ latitude: place.representativeLatitude, longitude: place.representativeLongitude }, DEMO_ROUTES) <= 350);
  const demoRouteRecords = demoRoutePlaces.flatMap((place) => place.records);
  const duplicateCandidates = findDuplicateCandidates(shinjukuRecords);
  const audit = buildOpenDataAudit(records, DEMO_ROUTES, retrievedAt);
  const metadata = {
    retrievedAt, license: "CC BY", recordCount: records.length, shinjukuRecordCount: shinjukuRecords.length,
    excludedCount: downloaded.reduce((sum, item) => sum + item.excludedCount, 0), duplicateCandidateCount: duplicateCandidates.length, demoRouteNearbyCount: demoRouteRecords.length,
    officialPlaceCount: places.length, demoRouteNearbyPlaceCount: demoRoutePlaces.length,
    sources: DATASETS.map(({ key, provider, datasetName, datasetUrl, resourceUrl }) => ({ key, provider, datasetName, datasetUrl, resourceUrl, license: "CC BY" })),
  };
  const generated = `${JSON.stringify({ metadata, records }, null, 2)}\n`;
  const generatedPlaces = `${JSON.stringify({ metadata, places }, null, 2)}\n`;
  const uiGenerated = `${JSON.stringify({ metadata: { ...metadata, recordCount: demoRouteRecords.length, officialPlaceCount: demoRoutePlaces.length, scope: "デモルートから推定直線距離350m以内" }, places: demoRoutePlaces }, null, 2)}\n`;
  await Promise.all(downloaded.map(({ dataset, bytes }) => atomicWrite(path.join(rootDir, "data/raw", `${dataset.key}.csv`), bytes)));
  await atomicWrite(path.join(rootDir, "data/generated/official-toilets.json"), generated);
  await atomicWrite(path.join(rootDir, "data/generated/official-toilet-places.json"), generatedPlaces);
  await atomicWrite(path.join(rootDir, "data/generated/open-data-audit.json"), `${JSON.stringify(audit, null, 2)}\n`);
  await atomicWrite(path.join(rootDir, "src/data/generated/official-toilets.json"), uiGenerated);
  for (const item of downloaded) console.log(`${item.dataset.datasetName}: ${item.records.length}件（除外${item.excludedCount}件）`, item.exclusionReasons);
  console.log(`原レコード: ${records.length}件 / 表示候補地点: ${places.length}地点 / 新宿区: ${shinjukuRecords.length}件 / デモルート350m以内: ${demoRouteRecords.length}件・${demoRoutePlaces.length}地点`);
  console.log(`監査: 同一座標群${audit.identicalCoordinateGroupCount} / 10m以内群${audit.proximityGroupsWithin10m.length} / 25m以内群${audit.proximityGroupsWithin25m.length} / 曖昧近接ペア${audit.ambiguousNearbyPairCount}`);
  return { metadata, records, duplicateCandidates, datasets: downloaded.map(({ dataset, inputCount, records: items, excludedCount, exclusionReasons }) => ({ key: dataset.key, inputCount, recordCount: items.length, excludedCount, exclusionReasons })) };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  runUpdate().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
