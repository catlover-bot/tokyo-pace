import type { OfficialToiletPlace, RestSpot } from "../types";

export type Coordinate = [number, number];
export type RouteProjection = { projectedPoint: Coordinate; distanceToRouteMeters: number; routeProgressMeters: number; segmentIndex: number };
export type ProjectedToiletPlace = { place: OfficialToiletPlace; projection: RouteProjection };
const EARTH_RADIUS_METERS = 6_371_000;
const radians = (degrees: number) => degrees * Math.PI / 180;

export function haversineDistanceMeters(a: Coordinate, b: Coordinate): number {
  const latitudeDelta = radians(b[0] - a[0]);
  const longitudeDelta = radians(b[1] - a[1]);
  const latitude1 = radians(a[0]);
  const latitude2 = radians(b[0]);
  const value = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(value));
}

function projectPointToSegment(point: Coordinate, start: Coordinate, end: Coordinate) {
  const referenceLatitude = radians((point[0] + start[0] + end[0]) / 3);
  const project = ([latitude, longitude]: Coordinate) => ({
    x: radians(longitude) * EARTH_RADIUS_METERS * Math.cos(referenceLatitude),
    y: radians(latitude) * EARTH_RADIUS_METERS,
  });
  const p = project(point); const a = project(start); const b = project(end);
  const dx = b.x - a.x; const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return { distanceMeters: haversineDistanceMeters(point, start), ratio: 0, projectedPoint: start };
  const ratio = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return { distanceMeters: Math.hypot(p.x - (a.x + ratio * dx), p.y - (a.y + ratio * dy)), ratio, projectedPoint: [start[0] + (end[0] - start[0]) * ratio, start[1] + (end[1] - start[1]) * ratio] as Coordinate };
}

export function distancePointToRouteMeters(point: Coordinate, route: Coordinate[]): number {
  if (route.length === 0) return Number.POSITIVE_INFINITY;
  if (route.length === 1) return haversineDistanceMeters(point, route[0]);
  return projectPointToRoute(point, route).distanceToRouteMeters;
}

export function polylineLengthMeters(route: Coordinate[]): number {
  return route.slice(1).reduce((sum, end, index) => sum + haversineDistanceMeters(route[index], end), 0);
}

export function projectPointToRoute(point: Coordinate, route: Coordinate[]): RouteProjection {
  if (route.length === 0) return { projectedPoint: point, distanceToRouteMeters: Number.POSITIVE_INFINITY, routeProgressMeters: 0, segmentIndex: -1 };
  if (route.length === 1) return { projectedPoint: route[0], distanceToRouteMeters: haversineDistanceMeters(point, route[0]), routeProgressMeters: 0, segmentIndex: 0 };
  let progress = 0; let best: RouteProjection | null = null;
  route.slice(1).forEach((end, index) => {
    const start = route[index]; const segmentLength = haversineDistanceMeters(start, end);
    const projection = projectPointToSegment(point, start, end);
    const candidate = { projectedPoint: projection.projectedPoint, distanceToRouteMeters: projection.distanceMeters, routeProgressMeters: progress + segmentLength * projection.ratio, segmentIndex: index };
    if (!best || candidate.distanceToRouteMeters < best.distanceToRouteMeters) best = candidate;
    progress += segmentLength;
  });
  return best!;
}

export function sortToiletPlacesByRouteProgress(places: OfficialToiletPlace[], route: Coordinate[]): ProjectedToiletPlace[] {
  return places.map((place) => ({ place, projection: projectPointToRoute([place.representativeLatitude, place.representativeLongitude], route) }))
    .sort((a, b) => a.projection.routeProgressMeters - b.projection.routeProgressMeters || a.place.clusterId.localeCompare(b.place.clusterId));
}

export function sliceRouteByProgress(route: Coordinate[], startProgress: number, endProgress: number): Coordinate[] {
  if (route.length < 2) return [...route];
  const output: Coordinate[] = []; let progress = 0;
  route.slice(1).forEach((end, index) => {
    const start = route[index]; const length = haversineDistanceMeters(start, end); const segmentEnd = progress + length;
    if (segmentEnd >= startProgress && progress <= endProgress && length > 0) {
      const from = Math.max(0, Math.min(1, (startProgress - progress) / length));
      const to = Math.max(0, Math.min(1, (endProgress - progress) / length));
      const fromPoint: Coordinate = [start[0] + (end[0] - start[0]) * from, start[1] + (end[1] - start[1]) * from];
      const toPoint: Coordinate = [start[0] + (end[0] - start[0]) * to, start[1] + (end[1] - start[1]) * to];
      if (!output.length || output.at(-1)![0] !== fromPoint[0] || output.at(-1)![1] !== fromPoint[1]) output.push(fromPoint);
      output.push(toPoint);
    }
    progress = segmentEnd;
  });
  return output;
}

export function findOfficialToiletsNearRoute(toilets: RestSpot[], route: Coordinate[], maximumDistanceMeters = 250, limit = 30): RestSpot[] {
  return toilets
    .filter((spot) => spot.confidence === "official" && spot.toiletAvailable === true)
    .map((spot) => ({ spot, distance: distancePointToRouteMeters([spot.latitude, spot.longitude], route) }))
    .filter(({ distance }) => distance <= maximumDistanceMeters)
    .sort((a, b) => a.distance - b.distance || a.spot.id.localeCompare(b.spot.id))
    .slice(0, limit)
    .map(({ spot }) => spot);
}

export function nearestOfficialToiletDistanceMeters(toilets: RestSpot[], route: Coordinate[]): number | null {
  const distances = toilets
    .filter((spot) => spot.confidence === "official" && spot.toiletAvailable === true)
    .map((spot) => distancePointToRouteMeters([spot.latitude, spot.longitude], route));
  return distances.length ? Math.min(...distances) : null;
}

export function findOfficialToiletPlacesNearRoute(places: OfficialToiletPlace[], route: Coordinate[], maximumDistanceMeters = 250, limit = 30): OfficialToiletPlace[] {
  return places
    .map((place) => ({ place, distance: distancePointToRouteMeters([place.representativeLatitude, place.representativeLongitude], route) }))
    .filter(({ distance }) => distance <= maximumDistanceMeters)
    .sort((a, b) => a.distance - b.distance
      || Number(b.place.hasPublicToiletRecord) - Number(a.place.hasPublicToiletRecord)
      || Number(b.place.hasWheelchairAccessibleRecord) - Number(a.place.hasWheelchairAccessibleRecord)
      || a.place.clusterId.localeCompare(b.place.clusterId))
    .slice(0, limit)
    .map(({ place }) => place);
}

export function nearestOfficialToiletPlaceDistanceMeters(places: OfficialToiletPlace[], route: Coordinate[]): number | null {
  const distances = places.map((place) => distancePointToRouteMeters([place.representativeLatitude, place.representativeLongitude], route));
  return distances.length ? Math.min(...distances) : null;
}
