const LATITUDE_METERS = 111_320;
const LONGITUDE_METERS = 91_000;

export const normalizeOfficialText = (value) => (value ?? "").normalize("NFKC").toLowerCase().replace(/[\s\u3000・,，.。()（）-]/g, "");
export const approximateRecordDistanceMeters = (a, b) => Math.hypot((a.latitude - b.latitude) * LATITUDE_METERS, (a.longitude - b.longitude) * LONGITUDE_METERS);

function createUnionFind(size) {
  const parent = Array.from({ length: size }, (_, index) => index);
  const find = (index) => parent[index] === index ? index : (parent[index] = find(parent[index]));
  const union = (a, b) => { const rootA = find(a); const rootB = find(b); if (rootA !== rootB) parent[Math.max(rootA, rootB)] = Math.min(rootA, rootB); };
  return { find, union };
}

function nearbyPairs(records, thresholdMeters) {
  const cellSize = thresholdMeters;
  const buckets = new Map(); const pairs = [];
  records.forEach((record, index) => {
    const x = Math.floor(record.longitude * LONGITUDE_METERS / cellSize);
    const y = Math.floor(record.latitude * LATITUDE_METERS / cellSize);
    for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) {
      for (const other of buckets.get(`${x + dx}:${y + dy}`) ?? []) {
        const distance = approximateRecordDistanceMeters(record, records[other]);
        if (distance <= thresholdMeters) pairs.push([other, index, distance]);
      }
    }
    const key = `${x}:${y}`; const bucket = buckets.get(key) ?? []; bucket.push(index); buckets.set(key, bucket);
  });
  return pairs;
}

function connectedGroups(records, thresholdMeters, predicate = () => true) {
  const unionFind = createUnionFind(records.length);
  for (const [left, right, distance] of nearbyPairs(records, thresholdMeters)) if (predicate(records[left], records[right], distance)) unionFind.union(left, right);
  const groups = new Map();
  records.forEach((record, index) => { const root = unionFind.find(index); const group = groups.get(root) ?? []; group.push(record); groups.set(root, group); });
  return [...groups.values()].map((group) => group.sort((a, b) => a.id.localeCompare(b.id))).sort((a, b) => a[0].id.localeCompare(b[0].id));
}

export function clusterOfficialToiletRecords(inputRecords) {
  const records = [...inputRecords].sort((a, b) => a.id.localeCompare(b.id));
  const groups = connectedGroups(records, 10, (a, b, distance) => {
    if (distance <= 1) return true;
    const sameName = normalizeOfficialText(a.name) !== "" && normalizeOfficialText(a.name) === normalizeOfficialText(b.name);
    const sameAddress = normalizeOfficialText(a.address) !== "" && normalizeOfficialText(a.address) === normalizeOfficialText(b.address);
    return sameName || sameAddress;
  });
  return groups.map((group) => {
    const kinds = [...new Set(group.map((record) => record.officialToiletKind).filter(Boolean))].sort();
    return {
      clusterId: `place-${group[0].id}`,
      sourceRecordCount: group.length,
      representativeLatitude: group.reduce((sum, record) => sum + record.latitude, 0) / group.length,
      representativeLongitude: group.reduce((sum, record) => sum + record.longitude, 0) / group.length,
      records: group,
      kinds,
      hasPublicToiletRecord: kinds.includes("public_toilet"),
      hasWheelchairAccessibleRecord: group.some((record) => record.wheelchairAccessible === true),
    };
  });
}

const groupedMatches = (records, selector) => {
  const groups = new Map();
  for (const record of records) { const key = normalizeOfficialText(selector(record)); if (!key) continue; const group = groups.get(key) ?? []; group.push(record.id); groups.set(key, group); }
  return [...groups.entries()].filter(([, ids]) => ids.length > 1).map(([value, ids]) => ({ value, recordCount: ids.length, recordIds: ids.sort() })).sort((a, b) => a.value.localeCompare(b.value));
};

const proximityGroups = (records, threshold) => connectedGroups([...records].sort((a, b) => a.id.localeCompare(b.id)), threshold).filter((group) => group.length > 1).map((group) => ({ recordCount: group.length, recordIds: group.map((record) => record.id) }));

function pointToSegmentDistance(record, start, end) {
  const p = { x: record.longitude * LONGITUDE_METERS, y: record.latitude * LATITUDE_METERS };
  const a = { x: start[1] * LONGITUDE_METERS, y: start[0] * LATITUDE_METERS };
  const b = { x: end[1] * LONGITUDE_METERS, y: end[0] * LATITUDE_METERS };
  const dx = b.x - a.x; const dy = b.y - a.y;
  const ratio = dx === 0 && dy === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - (a.x + ratio * dx), p.y - (a.y + ratio * dy));
}

export const distanceRecordToRoutes = (record, routes) => Math.min(...routes.flatMap((route) => route.slice(1).map((end, index) => pointToSegmentDistance(record, route[index], end))));

export function buildOpenDataAudit(records, routes, retrievedAt) {
  const places = clusterOfficialToiletRecords(records);
  const proximity10 = proximityGroups(records, 10); const proximity25 = proximityGroups(records, 25);
  const sameCoordinate = new Map();
  for (const record of records) { const key = `${record.latitude}:${record.longitude}`; const ids = sameCoordinate.get(key) ?? []; ids.push(record.id); sameCoordinate.set(key, ids); }
  const identicalCoordinateGroups = [...sameCoordinate.entries()].filter(([, ids]) => ids.length > 1).map(([coordinate, ids]) => ({ coordinate, recordCount: ids.length, recordIds: ids.sort() })).sort((a, b) => a.coordinate.localeCompare(b.coordinate));
  const placeByRecord = new Map(places.flatMap((place) => place.records.map((record) => [record.id, place.clusterId])));
  const ambiguousPairs = nearbyPairs([...records].sort((a, b) => a.id.localeCompare(b.id)), 25).filter(([left, right]) => {
    const sorted = [...records].sort((a, b) => a.id.localeCompare(b.id)); return placeByRecord.get(sorted[left].id) !== placeByRecord.get(sorted[right].id);
  });
  const bands = [{ key: "0-50m", min: 0, max: 50 }, { key: "50-100m", min: 50, max: 100 }, { key: "100-150m", min: 100, max: 150 }, { key: "150-250m", min: 150, max: 250 }, { key: "250-350m", min: 250, max: 350 }];
  const distanceBands = Object.fromEntries(bands.map((band) => [band.key, { recordCount: records.filter((record) => { const distance = distanceRecordToRoutes(record, routes); return distance >= band.min && distance < band.max; }).length, placeCount: places.filter((place) => { const distance = distanceRecordToRoutes({ latitude: place.representativeLatitude, longitude: place.representativeLongitude }, routes); return distance >= band.min && distance < band.max; }).length }]));
  const byDataset = Object.fromEntries([...new Set(records.map((record) => record.source.datasetName))].sort().map((dataset) => { const sourceRecords = records.filter((record) => record.source.datasetName === dataset); return [dataset, { recordCount: sourceRecords.length, shinjukuRecordCount: sourceRecords.filter((record) => record.address?.includes("新宿区")).length, blankAttributeRates: Object.fromEntries(["address", "wheelchairAccessible", "openingHours"].map((field) => [field, sourceRecords.filter((record) => record[field] === null).length / sourceRecords.length])), wheelchairAccessible: { true: sourceRecords.filter((record) => record.wheelchairAccessible === true).length, false: sourceRecords.filter((record) => record.wheelchairAccessible === false).length, null: sourceRecords.filter((record) => record.wheelchairAccessible === null).length }, openingHours: { value: sourceRecords.filter((record) => record.openingHours !== null).length, null: sourceRecords.filter((record) => record.openingHours === null).length } }]; }));
  const crossDatasetCandidates = places.filter((place) => new Set(place.records.map((record) => record.source.datasetName)).size > 1).map((place) => ({ clusterId: place.clusterId, recordIds: place.records.map((record) => record.id), datasets: [...new Set(place.records.map((record) => record.source.datasetName))].sort() }));
  const normalizedNameMatches = groupedMatches(records, (record) => record.name);
  const normalizedAddressMatches = groupedMatches(records, (record) => record.address);
  const sameFacilityCandidateGroups = places.filter((place) => place.sourceRecordCount > 1).map((place) => ({ clusterId: place.clusterId, recordIds: place.records.map((record) => record.id) }));
  return { generatedAt: retrievedAt, sourceRecordCount: records.length, officialPlaceCount: places.length, routeDistanceBands: distanceBands, coordinateBounds: { latitude: { min: Math.min(...records.map((record) => record.latitude)), max: Math.max(...records.map((record) => record.latitude)) }, longitude: { min: Math.min(...records.map((record) => record.longitude)), max: Math.max(...records.map((record) => record.longitude)) } }, identicalCoordinateGroupCount: identicalCoordinateGroups.length, identicalCoordinateRecordCount: identicalCoordinateGroups.reduce((sum, group) => sum + group.recordCount, 0), identicalCoordinateGroups, proximityGroupWithin10mCount: proximity10.length, proximityGroupsWithin10m: proximity10, proximityGroupWithin25mCount: proximity25.length, proximityGroupsWithin25m: proximity25, normalizedNameMatchGroupCount: normalizedNameMatches.length, normalizedNameMatches, normalizedAddressMatchGroupCount: normalizedAddressMatches.length, normalizedAddressMatches, sameFacilityCandidateGroupCount: sameFacilityCandidateGroups.length, sameFacilityCandidateGroups, crossDatasetDuplicateCandidateCount: crossDatasetCandidates.length, crossDatasetDuplicateCandidates: crossDatasetCandidates, ambiguousNearbyPairCount: ambiguousPairs.length, byDataset };
}
