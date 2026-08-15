import type { ElevationMetrics } from "../types";
import { haversineDistanceMeters as haversineMeters } from "./geo";

export const ELEVATION_SAMPLE_SPACING_METERS = 25;
export const ELEVATION_SMOOTHING_WINDOW_POINTS = 3;
export const UPHILL_GRADE_THRESHOLD_PERCENT = 5;
export const STEEP_UPHILL_GRADE_THRESHOLD_PERCENT = 8;
export const MIN_ELEVATION_COMPLETENESS_RATIO = 0.8;
export type ElevationSample = { coordinate: [number, number]; distanceMeters: number; elevationMeters: number | null };

export function resampleRoute(coordinates: readonly [number, number][], spacing = ELEVATION_SAMPLE_SPACING_METERS): ElevationSample[] {
  if (!coordinates.length) return [];
  const points = coordinates.filter((point, i) => i === 0 || haversineMeters(coordinates[i - 1], point) >= .01);
  if (points.length === 1) return [{ coordinate: points[0], distanceMeters: 0, elevationMeters: null }];
  const cumulative = [0];
  for (let i = 1; i < points.length; i += 1) cumulative.push(cumulative[i - 1] + haversineMeters(points[i - 1], points[i]));
  const total = cumulative.at(-1) ?? 0;
  const targets = Array.from({ length: Math.floor(total / spacing) + 1 }, (_, i) => i * spacing);
  if (targets.at(-1) !== total) targets.push(total);
  let segment = 1;
  return targets.map((distanceMeters) => {
    while (segment < cumulative.length - 1 && cumulative[segment] < distanceMeters) segment += 1;
    const start = cumulative[segment - 1], length = cumulative[segment] - start, ratio = length ? (distanceMeters - start) / length : 0;
    return { coordinate: [points[segment - 1][0] + (points[segment][0] - points[segment - 1][0]) * ratio, points[segment - 1][1] + (points[segment][1] - points[segment - 1][1]) * ratio], distanceMeters, elevationMeters: null };
  });
}

export function normalizeElevationSamples(samples: readonly ElevationSample[]) {
  return samples.map((sample, i) => {
    if (sample.elevationMeters === null || !Number.isFinite(sample.elevationMeters)) return { ...sample, elevationMeters: null };
    const values = samples.slice(Math.max(0, i - 1), i + 2).flatMap((x) => x.elevationMeters === null || !Number.isFinite(x.elevationMeters) ? [] : [x.elevationMeters]).sort((a, b) => a - b);
    return { ...sample, elevationMeters: values.length === 3 ? values[1] : sample.elevationMeters };
  });
}
export function classifySlope(grade: number | null) { return grade === null || !Number.isFinite(grade) ? "unknown" : grade >= 8 ? "steep_uphill" : grade >= 1 ? "uphill" : grade <= -1 ? "downhill" : "level"; }

export function deriveElevationMetrics(input: readonly ElevationSample[]): ElevationMetrics {
  const samples = normalizeElevationSamples(input), available = samples.filter((s) => s.elevationMeters !== null), completenessRatio = samples.length ? available.length / samples.length : 0, usable = available.length >= 2 && completenessRatio >= MIN_ELEVATION_COMPLETENESS_RATIO;
  const segments = samples.slice(1).map((sample, i) => { const previous = samples[i], distanceMeters = sample.distanceMeters - previous.distanceMeters, grade = distanceMeters > 0 && sample.elevationMeters !== null && previous.elevationMeters !== null ? (sample.elevationMeters - previous.elevationMeters) / distanceMeters * 100 : null; return { coordinates: [previous.coordinate, sample.coordinate] as [number, number][], distanceMeters, estimatedGradePercent: grade, slopeClass: classifySlope(grade), isUphill: grade === null ? null : grade >= 1 }; });
  const valid = segments.filter((s) => s.estimatedGradePercent !== null); let ascent = 0, descent = 0, longest = 0, run = 0;
  for (const segment of valid) { const change = (segment.estimatedGradePercent ?? 0) / 100 * segment.distanceMeters; if (change > 0) ascent += change; else descent -= change; if ((segment.estimatedGradePercent ?? 0) >= 1) { run += segment.distanceMeters; longest = Math.max(longest, run); } else run = 0; }
  const elevations = available.map((s) => s.elevationMeters as number), metric = (value: number) => usable ? value : null;
  return { status: !usable ? "unavailable" : completenessRatio === 1 ? "complete" : "partial", completenessRatio, totalAscentMeters: metric(ascent), totalDescentMeters: metric(descent), maximumEstimatedGradePercent: metric(valid.length ? Math.max(...valid.map((s) => s.estimatedGradePercent as number)) : 0), uphillDistanceAboveThresholdMeters: metric(valid.filter((s) => (s.estimatedGradePercent ?? 0) >= 5).reduce((n, s) => n + s.distanceMeters, 0)), steepUphillDistanceMeters: metric(valid.filter((s) => (s.estimatedGradePercent ?? 0) >= 8).reduce((n, s) => n + s.distanceMeters, 0)), longestContinuousUphillMeters: metric(longest), elevationRangeMeters: metric(elevations.length ? Math.max(...elevations) - Math.min(...elevations) : 0), profile: samples.map((s, i) => ({ ...s, estimatedGradePercent: i ? segments[i - 1].estimatedGradePercent : null, slopeClass: i ? segments[i - 1].slopeClass : "unknown" })), segments, source: { provider: "国土地理院", datasetName: "標高タイル（基盤地図情報数値標高モデル）", datasetUrl: "https://maps.gsi.go.jp/development/ichiran.html#dem", attribution: "国土地理院の標高タイルを加工して作成", derivedBy: "TOKYO PACE" }, processing: { sampleSpacingMeters: 25, smoothingWindowPoints: 3, uphillThresholdPercent: 5, steepUphillThresholdPercent: 8 } };
}
export function deriveSlopeBurden(metrics: ElevationMetrics | undefined) {
  if (!metrics || metrics.status === "unavailable" || metrics.totalAscentMeters === null || metrics.uphillDistanceAboveThresholdMeters === null || metrics.steepUphillDistanceMeters === null || metrics.longestContinuousUphillMeters === null) return null;
  return Math.round((metrics.totalAscentMeters * 1.5 + metrics.uphillDistanceAboveThresholdMeters * .08 + metrics.steepUphillDistanceMeters * .16 + metrics.longestContinuousUphillMeters * .04) * 10) / 10;
}
