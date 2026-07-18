import type { OfficialToiletPlace, RestSpot } from "../types";
export function normalizeOfficialText(value: string | null): string;
export function approximateRecordDistanceMeters(a: RestSpot, b: RestSpot): number;
export function clusterOfficialToiletRecords(records: RestSpot[]): OfficialToiletPlace[];
export function distanceRecordToRoutes(record: { latitude: number; longitude: number }, routes: [number, number][][]): number;
export function buildOpenDataAudit(records: RestSpot[], routes: [number, number][][], retrievedAt: string): Record<string, unknown>;
