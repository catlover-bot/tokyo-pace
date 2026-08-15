import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROUTE_ENDPOINT = "https://tokyo-pace.tokyo-pace.workers.dev/api/routes";
export const SNAPSHOT_FILE = "shinjuku-west-to-tocho-elevation.v1.json";
export const CSV_FILE = "shinjuku-west-to-tocho-elevation.v1.csv";
export const REPORT_FILE = "shinjuku-west-to-tocho-elevation-summary.md";
export const PROFILES = ["standard", "step_avoiding", "wheelchair_profile"];
export const PROCESSING = { sampleSpacingMeters: 25, smoothingWindowPoints: 3, uphillThresholdPercent: 5, steepUphillThresholdPercent: 8 };
export const SLOPE_COEFFICIENTS = { ascent: 1.5, uphill5: 0.08, uphill8: 0.16, longestUphill: 0.04 };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(root, "data", "evaluation");
const snapshotPath = path.join(outputDirectory, SNAPSHOT_FILE);

const request = {
  origin: { latitude: 35.69092, longitude: 139.69917 },
  destination: { latitude: 35.68945, longitude: 139.69215 },
  preferences: { maxContinuousWalkingMinutes: 10, requireToilet: false, avoidSteepSlopes: false, preferIndoorRest: false, avoidSteps: false },
};

const round = (value, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;
const radians = (value) => value * Math.PI / 180;
const haversine = (a, b) => {
  const latitudeDelta = radians(b[0] - a[0]);
  const longitudeDelta = radians(b[1] - a[1]);
  const h = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(radians(a[0])) * Math.cos(radians(b[0])) * Math.sin(longitudeDelta / 2) ** 2;
  return 12_742_000 * Math.asin(Math.sqrt(h));
};

function resample(coordinates) {
  const points = coordinates.filter((point, index) => index === 0 || haversine(coordinates[index - 1], point) >= 0.01);
  const cumulative = [0];
  for (let index = 1; index < points.length; index += 1) cumulative.push(cumulative[index - 1] + haversine(points[index - 1], points[index]));
  const total = cumulative.at(-1) ?? 0;
  const targets = Array.from({ length: Math.floor(total / PROCESSING.sampleSpacingMeters) + 1 }, (_, index) => index * PROCESSING.sampleSpacingMeters);
  if (targets.at(-1) !== total) targets.push(total);
  let segment = 1;
  return targets.map((distanceMeters) => {
    while (segment < cumulative.length - 1 && cumulative[segment] < distanceMeters) segment += 1;
    const start = cumulative[segment - 1];
    const length = cumulative[segment] - start;
    const ratio = length ? (distanceMeters - start) / length : 0;
    return { coordinate: [points[segment - 1][0] + (points[segment][0] - points[segment - 1][0]) * ratio, points[segment - 1][1] + (points[segment][1] - points[segment - 1][1]) * ratio], distanceMeters, elevationMeters: null };
  });
}

const tilePoint = ([latitude, longitude]) => {
  const scale = 2 ** 15;
  const worldX = (longitude + 180) / 360 * scale;
  const worldY = (1 - Math.asinh(Math.tan(radians(latitude))) / Math.PI) / 2 * scale;
  const x = Math.floor(worldX); const y = Math.floor(worldY);
  return { key: `${x}/${y}`, x, y, pixelX: Math.min(255, Math.floor((worldX - x) * 256)), pixelY: Math.min(255, Math.floor((worldY - y) * 256)) };
};

function parseTile(text) {
  const rows = text.trim().split(/\r?\n/);
  if (rows.length !== 256) return null;
  const values = rows.map((row) => row.split(",").map((value) => value === "e" ? null : Number(value)));
  return values.every((row) => row.length === 256 && row.every((value) => value === null || Number.isFinite(value))) ? values : null;
}

async function fetchTile(point, fetchImpl) {
  for (const dataset of ["dem5a", "dem5b", "dem"]) {
    const response = await fetchImpl(`https://cyberjapandata.gsi.go.jp/xyz/${dataset}/15/${point.x}/${point.y}.txt`, { headers: { accept: "text/plain" } });
    if (response.ok) {
      const tile = parseTile(await response.text());
      if (tile) return { dataset, tile };
    }
  }
  return { dataset: null, tile: null };
}

function deriveMetrics(input) {
  const samples = input.map((sample, index) => {
    if (sample.elevationMeters === null || !Number.isFinite(sample.elevationMeters)) return { ...sample, elevationMeters: null };
    const values = input.slice(Math.max(0, index - 1), index + 2).flatMap((item) => item.elevationMeters === null || !Number.isFinite(item.elevationMeters) ? [] : [item.elevationMeters]).sort((a, b) => a - b);
    return { ...sample, elevationMeters: values.length === 3 ? values[1] : sample.elevationMeters };
  });
  const completenessRatio = samples.length ? samples.filter((sample) => sample.elevationMeters !== null).length / samples.length : 0;
  const usable = samples.filter((sample) => sample.elevationMeters !== null).length >= 2 && completenessRatio >= 0.8;
  let ascent = 0; let descent = 0; let longest = 0; let run = 0; let maximum = null; let uphill5 = 0; let uphill8 = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1]; const sample = samples[index]; const distance = sample.distanceMeters - previous.distanceMeters;
    const grade = distance > 0 && previous.elevationMeters !== null && sample.elevationMeters !== null ? (sample.elevationMeters - previous.elevationMeters) / distance * 100 : null;
    if (grade === null) { run = 0; continue; }
    maximum = maximum === null ? grade : Math.max(maximum, grade);
    const change = grade / 100 * distance;
    if (change > 0) ascent += change; else descent -= change;
    if (grade >= 5) uphill5 += distance;
    if (grade >= 8) uphill8 += distance;
    if (grade >= 1) { run += distance; longest = Math.max(longest, run); } else run = 0;
  }
  const metric = (value) => usable ? value : null;
  return { status: !usable ? "unavailable" : completenessRatio === 1 ? "complete" : "partial", sampleCount: samples.length, availableSampleCount: samples.filter((sample) => sample.elevationMeters !== null).length, completenessRatio, totalAscentMeters: metric(ascent), totalDescentMeters: metric(descent), maximumEstimatedGradePercent: metric(maximum ?? 0), uphillDistanceAboveThresholdMeters: metric(uphill5), steepUphillDistanceMeters: metric(uphill8), longestContinuousUphillMeters: metric(longest), samples };
}

const slopeBurden = (metrics, coefficients = SLOPE_COEFFICIENTS) => metrics.totalAscentMeters === null ? null : round(metrics.totalAscentMeters * coefficients.ascent + metrics.uphillDistanceAboveThresholdMeters * coefficients.uphill5 + metrics.steepUphillDistanceMeters * coefficients.uphill8 + metrics.longestContinuousUphillMeters * coefficients.longestUphill);
function score(route, avoidSteepSlopes) {
  const maximumWalk = Math.max(0, ...route.walkingSegments.map((segment) => segment.walkingMinutes));
  const conditionBurdenScore = route.durationMinutes + Math.max(0, maximumWalk - 10) * 12 + (avoidSteepSlopes ? route.steepSlopeCount * 35 : 0);
  return { conditionBurdenScore, slopeBurden: slopeBurden(route.elevation), comparisonScore: round(conditionBurdenScore + (avoidSteepSlopes ? slopeBurden(route.elevation) ?? 0 : 0)) };
}

const compare = (a, b, mode) => a.scores[mode].comparisonScore - b.scores[mode].comparisonScore || a.durationSeconds - b.durationSeconds || a.distanceMeters - b.distanceMeters || a.id.localeCompare(b.id);

export async function capture(fetchImpl = fetch, now = () => new Date().toISOString()) {
  const response = await fetchImpl(ROUTE_ENDPOINT, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(request) });
  if (!response.ok) throw new Error(`公開Workerからの経路取得に失敗しました: HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.source !== "openrouteservice" || payload.routes?.length !== 3 || !PROFILES.every((profile) => payload.routes.some((route) => route.profile === profile && route.isFallback === false))) throw new Error("公開Worker応答が実動的3経路ではありません");
  const sampledRoutes = payload.routes.map((route) => ({ route, samples: resample(route.coordinates) }));
  const points = sampledRoutes.flatMap(({ samples }) => samples.map((sample) => tilePoint(sample.coordinate)));
  const uniquePoints = [...new Map(points.map((point) => [point.key, point])).values()];
  const tiles = new Map(await Promise.all(uniquePoints.map(async (point) => [point.key, await fetchTile(point, fetchImpl)])));
  const capturedAt = now();
  const routes = sampledRoutes.map(({ route, samples }) => {
    const elevation = deriveMetrics(samples.map((sample) => { const point = tilePoint(sample.coordinate); return { ...sample, elevationMeters: tiles.get(point.key)?.tile?.[point.pixelY]?.[point.pixelX] ?? null }; }));
    const result = { ...route, elevation, elevationSource: { provider: "国土地理院", datasetName: "標高タイル（基盤地図情報数値標高モデル）", datasetUrl: "https://maps.gsi.go.jp/development/ichiran.html#dem", attribution: "国土地理院の標高タイルを加工して作成", derivedBy: "TOKYO PACE", tileZoom: 15, datasetsTriedInOrder: ["dem5a", "dem5b", "dem"], datasetsUsed: [...new Set([...tiles.values()].map((entry) => entry.dataset).filter(Boolean))], processing: PROCESSING } };
    result.scores = { withoutSlopePreference: score(result, false), withSlopePreference: score(result, true) };
    return result;
  });
  if (routes.some((route) => route.elevation.status === "unavailable")) throw new Error("GSI標高データを十分に取得できませんでした");
  return { schemaVersion: 1, evaluationId: "shinjuku-west-to-tocho-elevation-v1", routeName: "新宿駅西口 → 東京都庁", coordinateOrder: "latitude_longitude", acquisition: { capturedAt, method: "fresh_public_worker_response_plus_public_gsi_elevation_tiles", workerUrl: ROUTE_ENDPOINT }, request: { ...request, profiles: PROFILES }, provenance: { routing: { provider: "openrouteservice via TOKYO PACE Worker", underlyingData: "OpenStreetMap", attribution: "© OpenStreetMap contributors / openrouteservice", license: "ODbL" }, elevation: { provider: "国土地理院", attribution: "国土地理院の標高タイルを加工して作成", derivedValuesAreMeasurements: false } }, heuristic: { description: "TOKYO PACEの比較用ヒューリスティックであり、医学的に検証された身体負担モデルではありません", coefficients: SLOPE_COEFFICIENTS }, routes };
}

const winnerLabels = (routes, selector) => {
  const minimum = Math.min(...routes.map(selector));
  return routes.filter((route) => selector(route) === minimum).map((route) => route.profile).join(" / ");
};
const value = (number, unit = "") => number === null ? "不明" : `${round(number)}${unit}`;
const delta = (number, unit = "") => `${number > 0 ? "+" : ""}${round(number)}${unit}`;

export function buildCsv(snapshot) {
  const headers = ["profile", "route_id", "distance_m", "duration_s", "elevation_status", "elevation_completeness", "ascent_estimated_m", "descent_estimated_m", "maximum_grade_estimated_percent", "uphill_5_percent_m", "uphill_8_percent_m", "longest_continuous_uphill_m", "condition_burden_without_slope", "slope_burden", "comparison_score_without_slope", "condition_burden_with_slope", "comparison_score_with_slope"];
  const rows = snapshot.routes.map((route) => [route.profile, route.id, route.distanceMeters, route.durationSeconds, route.elevation.status, route.elevation.completenessRatio, route.elevation.totalAscentMeters, route.elevation.totalDescentMeters, route.elevation.maximumEstimatedGradePercent, route.elevation.uphillDistanceAboveThresholdMeters, route.elevation.steepUphillDistanceMeters, route.elevation.longestContinuousUphillMeters, route.scores.withoutSlopePreference.conditionBurdenScore, route.scores.withoutSlopePreference.slopeBurden, route.scores.withoutSlopePreference.comparisonScore, route.scores.withSlopePreference.conditionBurdenScore, route.scores.withSlopePreference.comparisonScore]);
  return `${[headers, ...rows].map((row) => row.map((item) => item === null ? "" : String(item)).join(",")).join("\n")}\n`;
}

export function buildReport(snapshot) {
  const routes = snapshot.routes; const standard = routes.find((route) => route.profile === "standard");
  const without = [...routes].sort((a, b) => compare(a, b, "withoutSlopePreference"))[0]; const withSlope = [...routes].sort((a, b) => compare(a, b, "withSlopePreference"))[0];
  const comparisons = routes.filter((route) => route !== standard).map((route) => `| ${route.profile} | ${delta(route.distanceMeters - standard.distanceMeters, "m")} | ${delta(route.durationSeconds - standard.durationSeconds, "秒")} | ${delta(route.elevation.totalAscentMeters - standard.elevation.totalAscentMeters, "m")} | ${delta(route.elevation.uphillDistanceAboveThresholdMeters - standard.elevation.uphillDistanceAboveThresholdMeters, "m")} | ${delta(route.elevation.steepUphillDistanceMeters - standard.elevation.steepUphillDistanceMeters, "m")} | ${delta(route.elevation.longestContinuousUphillMeters - standard.elevation.longestContinuousUphillMeters, "m")} | ${delta(route.scores.withoutSlopePreference.slopeBurden - standard.scores.withoutSlopePreference.slopeBurden)} |`).join("\n");
  const baselineSlopeOrder = [...routes].sort((a, b) => slopeBurden(a.elevation) - slopeBurden(b.elevation) || a.id.localeCompare(b.id)).map((route) => route.profile).join(" → ");
  const sensitivityRows = Object.keys(SLOPE_COEFFICIENTS).flatMap((coefficient) => [0.8, 1, 1.2].map((factor) => { const coefficients = { ...SLOPE_COEFFICIENTS, [coefficient]: SLOPE_COEFFICIENTS[coefficient] * factor }; const order = [...routes].sort((a, b) => slopeBurden(a.elevation, coefficients) - slopeBurden(b.elevation, coefficients) || a.id.localeCompare(b.id)).map((route) => route.profile).join(" → "); return { coefficient, factor, order, stable: order === baselineSlopeOrder }; }));
  const sensitivity = sensitivityRows.map((row) => `| ${row.coefficient} | ${row.factor.toFixed(1)}x | ${row.order} | ${row.stable ? "安定" : "変化"} |`).join("\n");
  const routeRows = routes.map((route) => `| ${route.profile} | ${route.distanceMeters}m | ${route.durationSeconds}秒 | ${value(route.elevation.totalAscentMeters, "m")} | ${value(route.elevation.totalDescentMeters, "m")} | ${value(route.elevation.maximumEstimatedGradePercent, "%")} | ${value(route.elevation.uphillDistanceAboveThresholdMeters, "m")} | ${value(route.elevation.steepUphillDistanceMeters, "m")} | ${value(route.elevation.longestContinuousUphillMeters, "m")} | ${value(route.scores.withoutSlopePreference.slopeBurden)} |`).join("\n");
  const scoreRows = routes.map((route) => `| ${route.profile} | ${route.scores.withoutSlopePreference.conditionBurdenScore} | ${route.scores.withoutSlopePreference.comparisonScore} | ${route.scores.withSlopePreference.conditionBurdenScore} | ${route.scores.withSlopePreference.slopeBurden} | ${route.scores.withSlopePreference.comparisonScore} |`).join("\n");
  const unchangedExplanation = `standardの「急坂を避けたい」ありcomparisonScore ${standard.scores.withSlopePreference.comparisonScore} は、次点${[...routes].sort((a, b) => compare(a, b, "withSlopePreference"))[1].profile}の${[...routes].sort((a, b) => compare(a, b, "withSlopePreference"))[1].scores.withSlopePreference.comparisonScore}より${round([...routes].sort((a, b) => compare(a, b, "withSlopePreference"))[1].scores.withSlopePreference.comparisonScore - standard.scores.withSlopePreference.comparisonScore)}低く、坂道差を加えても既存条件負担の差を逆転しません。`;
  return `# 新宿駅西口 → 東京都庁：標高・坂道評価\n\n取得日時: ${snapshot.acquisition.capturedAt}\n\nこの文書の標高指標は国土地理院の標高タイルからTOKYO PACEが推定した値であり、現地測定値ではありません。\n\n## 3経路の結果\n\n| profile | 距離 | 時間 | 推定累積上昇 | 推定累積下降 | 推定最大勾配 | 推定5%以上上り | 推定8%以上上り | 推定最長連続上り | slopeBurden |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n${routeRows}\n\n- 最短: ${winnerLabels(routes, (route) => route.distanceMeters)}\n- 最速: ${winnerLabels(routes, (route) => route.durationSeconds)}\n- 推定累積上昇量が最少: ${winnerLabels(routes, (route) => route.elevation.totalAscentMeters ?? Infinity)}\n- 推定5%以上上り距離が最少: ${winnerLabels(routes, (route) => route.elevation.uphillDistanceAboveThresholdMeters ?? Infinity)}\n- 推定8%以上急上り距離が最少: ${winnerLabels(routes, (route) => route.elevation.steepUphillDistanceMeters ?? Infinity)}\n- 推定連続上りが最短: ${winnerLabels(routes, (route) => route.elevation.longestContinuousUphillMeters ?? Infinity)}\n- slopeBurdenが最低: ${winnerLabels(routes, (route) => route.scores.withoutSlopePreference.slopeBurden ?? Infinity)}\n\n## standardとの直接差\n\n| profile | 距離差 | 時間差 | 推定上昇差 | 推定5%以上差 | 推定8%以上差 | 推定連続上り差 | slopeBurden差 |\n|---|---:|---:|---:|---:|---:|---:|---:|\n${comparisons}\n\n## 推薦\n\n| profile | 条件負担（設定なし） | comparisonScore（設定なし） | 条件負担（急坂回避） | slopeBurden | comparisonScore（急坂回避） |\n|---|---:|---:|---:|---:|---:|\n${scoreRows}\n\n- 「急坂を避けたい」なし: **${without.profile}**（comparisonScore ${without.scores.withoutSlopePreference.comparisonScore}）\n- 「急坂を避けたい」あり: **${withSlope.profile}**（comparisonScore ${withSlope.scores.withSlopePreference.comparisonScore}）\n- 推薦変更: **${without.id === withSlope.id ? "なし" : "あり"}**。${without.id === withSlope.id ? unchangedExplanation : `既存条件と坂道推定値を合成した結果、${without.profile}から${withSlope.profile}へ変わりました。`}\n\n## slopeBurden感度分析\n\nこれは比較用ヒューリスティックの感度分析であり、医学的妥当性の検証ではありません。各係数を一つずつ0.8x、1.0x、1.2xへ変え、他の係数を固定しました。基準順序は ${baselineSlopeOrder} です。全12条件での順序は**${sensitivityRows.every((row) => row.stable) ? "安定" : "安定ではありません"}**。\n\n| 変更係数 | 倍率 | slopeBurdenの昇順 | 基準順序との一致 |\n|---|---:|---|---|\n${sensitivity}\n\n## 出典と限界\n\n- 経路: © OpenStreetMap contributors / openrouteservice。TOKYO PACE公開Workerの正規化応答。\n- 標高: 国土地理院の標高タイルを加工して作成。25m間隔再標本化、3点中央値平滑化。\n- 経路・標高・勾配は取得日時時点の推定であり、現地の通行可能性や身体負担を保証しません。\n- slopeBurdenはTOKYO PACEのヒューリスティックであり、医学的に検証されたモデルではありません。\n- 欠損値はnull／不明のまま扱い、0へ置換しません。\n`;
}

export async function writeReports(snapshot) {
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([writeFile(path.join(outputDirectory, CSV_FILE), buildCsv(snapshot), "utf8"), writeFile(path.join(outputDirectory, REPORT_FILE), buildReport(snapshot), "utf8")]);
}

async function main() {
  const command = process.argv[2];
  if (command === "capture") { const snapshot = await capture(); await mkdir(outputDirectory, { recursive: true }); await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8"); await writeReports(snapshot); console.log(`実経路評価を取得しました: ${path.relative(root, snapshotPath)}`); return; }
  if (command === "report") { const snapshot = JSON.parse(await readFile(snapshotPath, "utf8")); await writeReports(snapshot); console.log("保存済みsnapshotからCSVとMarkdownを再生成しました"); return; }
  throw new Error("capture または report を指定してください");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
