import generated from "./generated/open-data-manifest.json";
import type { OpenDataManifest } from "../types";

export const openDataManifest = generated as OpenDataManifest;
export const resolveDatasetRetrievedAt = (datasetId: string): string | null => openDataManifest.datasets.find((entry) => entry.datasetId === datasetId)?.retrievedAt ?? null;
export const latestOpenDataRetrievedAt = openDataManifest.datasets.map((entry) => entry.retrievedAt).sort().at(-1) ?? null;
