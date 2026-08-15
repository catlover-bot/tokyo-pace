import type { DemoRoute } from "../src/types";
import { deriveElevationMetrics, resampleRoute, type ElevationSample } from "../src/domain/elevation";

export const GSI_ELEVATION_ZOOM = 15;
export const GSI_ELEVATION_TILE_DATASETS = ["dem5a", "dem5b", "dem"] as const;
type TilePoint = { key: string; x: number; y: number; pixelX: number; pixelY: number };
const tilePoint = ([latitude, longitude]: [number, number]): TilePoint => {
  const scale = 2 ** GSI_ELEVATION_ZOOM;
  const worldX = (longitude + 180) / 360 * scale;
  const latitudeRadians = latitude * Math.PI / 180;
  const worldY = (1 - Math.asinh(Math.tan(latitudeRadians)) / Math.PI) / 2 * scale;
  const x = Math.floor(worldX), y = Math.floor(worldY);
  return { key: x + "/" + y, x, y, pixelX: Math.min(255, Math.floor((worldX - x) * 256)), pixelY: Math.min(255, Math.floor((worldY - y) * 256)) };
};
export function parseGsiElevationTile(text: string): Array<Array<number | null>> | null {
  const rows = text.trim().split(/\r?\n/);
  if (rows.length !== 256) return null;
  const parsed = rows.map((row) => row.split(",").map((value) => value === "e" ? null : Number(value)));
  return parsed.every((row) => row.length === 256 && row.every((value) => value === null || Number.isFinite(value))) ? parsed : null;
}
async function fetchTile(point: TilePoint, fetchImpl: typeof fetch): Promise<Array<Array<number | null>> | null> {
  for (const dataset of GSI_ELEVATION_TILE_DATASETS) {
    try {
      const response = await fetchImpl(`https://cyberjapandata.gsi.go.jp/xyz/${dataset}/${GSI_ELEVATION_ZOOM}/${point.x}/${point.y}.txt`, { headers: { accept: "text/plain" } });
      if (response.ok) { const tile = parseGsiElevationTile(await response.text()); if (tile) return tile; }
    } catch { /* Elevation is optional; the caller preserves unknown. */ }
  }
  return null;
}
export async function enrichRoutesWithGsiElevation(routes: readonly DemoRoute[], fetchImpl: typeof fetch): Promise<DemoRoute[]> {
  const sampled = routes.map((route) => resampleRoute(route.coordinates));
  const points = sampled.flat().map((sample) => tilePoint(sample.coordinate));
  const unique = [...new Map(points.map((point) => [point.key, point])).values()];
  const tileEntries = await Promise.all(unique.map(async (point) => [point.key, await fetchTile(point, fetchImpl)] as const));
  const tiles = new Map(tileEntries);
  return routes.map((route, routeIndex) => {
    const samples: ElevationSample[] = sampled[routeIndex].map((sample) => { const point = tilePoint(sample.coordinate), tile = tiles.get(point.key); return { ...sample, elevationMeters: tile?.[point.pixelY]?.[point.pixelX] ?? null }; });
    const elevation = deriveElevationMetrics(samples);
    return { ...route, elevation, warnings: elevation.status === "unavailable" ? [...(route.warnings ?? []), "坂道情報を取得できませんでした。経路の比較は坂道以外の情報で続けられます。"] : route.warnings };
  });
}
