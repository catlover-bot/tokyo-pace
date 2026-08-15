import { describe, expect, it, vi } from "vitest";
import { enrichRoutesWithGsiElevation, parseGsiElevationTile } from "../worker/gsiElevation";
import type { DemoRoute } from "../src/types";

const tile = (value: string) => Array.from({ length: 256 }, () => Array.from({ length: 256 }, () => value).join(",")).join("\n");
const route: DemoRoute = { id: "fixture", name: "fixture", coordinates: [[35.69, 139.69], [35.691, 139.69]], durationMinutes: 2, distanceMeters: 111, restSpotIds: [], walkingSegments: [], steepSlopeCount: 0, indoorRestCount: 0 };

describe("GSI elevation enrichment", () => {
  it("rejects malformed tiles", () => { expect(parseGsiElevationTile("1,2")).toBeNull(); });
  it("batches a route tile and enriches a dynamic route", async () => { const fetchImpl = vi.fn(async () => new Response(tile("12.5"))); const result = await enrichRoutesWithGsiElevation([route], fetchImpl as typeof fetch); expect(fetchImpl).toHaveBeenCalledTimes(1); expect(result[0].elevation?.status).toBe("complete"); expect(result[0].elevation?.totalAscentMeters).toBe(0); });
  it("keeps route usable and metrics unknown when GSI fails", async () => { const result = await enrichRoutesWithGsiElevation([route], vi.fn(async () => new Response("", { status: 503 })) as typeof fetch); expect(result[0].coordinates).toEqual(route.coordinates); expect(result[0].elevation?.status).toBe("unavailable"); expect(result[0].elevation?.totalAscentMeters).toBeNull(); expect(result[0].warnings?.join("")).toContain("????"); });
});
