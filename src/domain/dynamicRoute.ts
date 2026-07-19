import { distancePointToRouteMeters, polylineLengthMeters, projectPointToRoute } from "./geo";
import type { DemoRoute, RestCandidate, WalkingSegment } from "../types";

export function deriveDynamicWalkingSegments(route: DemoRoute, candidates: RestCandidate[]): WalkingSegment[] {
  const geometryLength = polylineLengthMeters(route.coordinates);
  const strict = candidates.filter((candidate) => (candidate.confidence === "confirmed" || candidate.confidence === "supported") && distancePointToRouteMeters([candidate.latitude, candidate.longitude], route.coordinates) <= 350)
    .map((candidate) => ({ candidate, geometryProgress: projectPointToRoute([candidate.latitude, candidate.longitude], route.coordinates).routeProgressMeters }))
    .sort((a, b) => a.geometryProgress - b.geometryProgress || a.candidate.id.localeCompare(b.candidate.id));
  const progress = [0, ...strict.map((item) => geometryLength ? item.geometryProgress / geometryLength * route.distanceMeters : 0), route.distanceMeters];
  const totalWalkingMinutes = route.durationSeconds === undefined ? route.durationMinutes : route.durationSeconds / 60;
  return progress.slice(1).map((end, index) => { const distanceMeters = end - progress[index]; return { id: `${route.id}-walk-${index + 1}`, name: `連続歩行区間${index + 1}`, distanceMeters, walkingMinutes: route.distanceMeters ? distanceMeters / route.distanceMeters * totalWalkingMinutes : 0, endsAtRestSpot: index < strict.length, restSpotId: strict[index]?.candidate.id ?? null }; });
}
export function prepareDynamicRoute(route: DemoRoute, candidates: RestCandidate[]): DemoRoute { const walkingSegments = deriveDynamicWalkingSegments(route, candidates); return { ...route, walkingSegments, restSpotIds: walkingSegments.flatMap((segment) => segment.restSpotId ? [segment.restSpotId] : []), indoorRestCount: candidates.filter((candidate) => candidate.indoor === true && (candidate.confidence === "confirmed" || candidate.confidence === "supported") && distancePointToRouteMeters([candidate.latitude, candidate.longitude], route.coordinates) <= 350).length }; }
