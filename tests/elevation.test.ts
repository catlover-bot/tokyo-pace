import { describe, expect, it } from "vitest";
import { classifySlope, deriveElevationMetrics, deriveSlopeBurden, normalizeElevationSamples, resampleRoute, type ElevationSample } from "../src/domain/elevation";

const samples = (elevations: Array<number | null>, spacing = 25): ElevationSample[] => elevations.map((elevationMeters, index) => ({ coordinate: [35.69 + index * .0001, 139.69], distanceMeters: index * spacing, elevationMeters }));

describe("elevation processing", () => {
  it("resamples regularly and removes duplicate coordinates", () => { const result = resampleRoute([[35.69, 139.69], [35.69, 139.69], [35.691, 139.69]], 25); expect(result.length).toBeGreaterThan(4); expect(result[0].distanceMeters).toBe(0); expect(result.at(-1)!.distanceMeters).toBeGreaterThan(100); });
  it("calculates flat, uphill, and downhill metrics", () => {
    const flat = deriveElevationMetrics(samples([10, 10, 10, 10])); expect(flat.totalAscentMeters).toBe(0); expect(flat.maximumEstimatedGradePercent).toBe(0);
    const uphill = deriveElevationMetrics(samples([0, 1.5, 3, 4.5])); expect(uphill.totalAscentMeters).toBeCloseTo(4.5); expect(uphill.uphillDistanceAboveThresholdMeters).toBe(75); expect(uphill.longestContinuousUphillMeters).toBe(75);
    const downhill = deriveElevationMetrics(samples([5, 4, 3, 2])); expect(downhill.totalAscentMeters).toBe(0); expect(downhill.totalDescentMeters).toBeCloseTo(3);
  });
  it("uses median smoothing for a short noisy spike", () => { expect(normalizeElevationSamples(samples([10, 10, 30, 10, 10]))[2].elevationMeters).toBe(10); });
  it("preserves partial and fully missing data as unknown rather than zero", () => {
    const partial = deriveElevationMetrics(samples([0, 1, 2, 3, null])); expect(partial.status).toBe("partial"); expect(partial.totalAscentMeters).not.toBeNull();
    const missing = deriveElevationMetrics(samples([null, null, null])); expect(missing.status).toBe("unavailable"); expect(missing.totalAscentMeters).toBeNull(); expect(deriveSlopeBurden(missing)).toBeNull();
  });
  it("classifies thresholds and derives deterministic burden", () => { expect(classifySlope(8)).toBe("steep_uphill"); expect(classifySlope(5)).toBe("uphill"); expect(classifySlope(-2)).toBe("downhill"); const metric = deriveElevationMetrics(samples([0, 2, 4, 6])); expect(deriveSlopeBurden(metric)).toBe(30); expect(deriveSlopeBurden(metric)).toBe(deriveSlopeBurden(metric)); });
});
