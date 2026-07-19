import { useEffect, useState } from "react";
import { CircleMarker, MapContainer, Marker, Pane, Polyline, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { EvaluatedRoute, OfficialToiletPlace, RestCandidate, RestSpot } from "../types";
import {
  FACILITY_MARKER_RADII,
  FACILITY_MARKER_STYLES,
  getFacilityLegendItems,
  getRouteLegendItems,
  getRouteMapMode,
  MAP_PANES,
  PUBLIC_TOILET_GAP_STYLE,
  SELECTED_ROUTE_HALO_STYLE,
  type FacilityLegendKind,
} from "../domain/mapLayerPresentation";
import { getRouteLineStyle } from "../domain/routePresentation";

const categoryLabel = { park: "公園", public_facility: "公共施設", toilet: "トイレ", library: "図書館", other: "その他" };
const toiletKindLabel = { public_toilet: "新宿区公衆トイレ", facility_toilet_information: "公共施設内の車椅子使用者対応トイレ情報", station_toilet_information: "鉄道駅内の車椅子使用者対応トイレ情報" };
const value = (item: boolean | null) => item === null ? "不明" : item ? "あり" : "なし";
const getOfficialMarkerKind = (place: OfficialToiletPlace): FacilityLegendKind => place.hasPublicToiletRecord ? "officialPublicToilet" : place.kinds.includes("facility_toilet_information") ? "officialFacilityToilet" : "officialStationToilet";

function LineLegendItem({ label, style }: { label: string; style: { color: string; dashArray?: string; weight?: number; opacity?: number } }) {
  return <span><svg width="40" height="14" viewBox="0 0 40 14" aria-hidden="true"><line x1="1" y1="7" x2="39" y2="7" stroke={style.color} strokeWidth={Math.min(style.weight ?? 4, 10)} strokeDasharray={style.dashArray} strokeLinecap="round" opacity={style.opacity ?? 1} /></svg>{label}</span>;
}

function MarkerLegendItem({ label, markerStyle }: { label: string; markerStyle: (typeof FACILITY_MARKER_STYLES)[FacilityLegendKind] }) {
  return <span><svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7" fill={markerStyle.fillColor} fillOpacity={markerStyle.fillOpacity} stroke={markerStyle.color} strokeOpacity={markerStyle.opacity} strokeWidth="2" /></svg>{label}</span>;
}

function MapPointSelector({ active, onPoint }: { active: boolean; onPoint(point: [number, number]): void }) { useMapEvents({ click: (event) => { if (active) onPoint([event.latlng.lat, event.latlng.lng]); } }); return null; }

function SelectedRouteViewport({ route }: { route?: EvaluatedRoute }) { const map = useMap(); useEffect(() => { if (route && route.coordinates.length > 1) map.fitBounds(route.coordinates, { padding: [32, 32], maxZoom: 17 }); }, [map, route]); return null; }

export function RouteMap({ routes, spots, restCandidates, officialToiletPlaces, selectedRouteId, origin, destination, selectionMode, onSelectRoute, onMapPoint }: { routes: EvaluatedRoute[]; spots: RestSpot[]; restCandidates: RestCandidate[]; officialToiletPlaces: OfficialToiletPlace[]; selectedRouteId: EvaluatedRoute["id"] | null; origin: [number, number]; destination: [number, number]; selectionMode: "origin" | "destination" | null; onSelectRoute(routeId: string): void; onMapPoint(point: [number, number]): void }) {
  const [showOfficial, setShowOfficial] = useState(true); const [showWheelchair, setShowWheelchair] = useState(true); const [showEstimated, setShowEstimated] = useState(true); const [showRestData, setShowRestData] = useState(true);
  const displayedOfficial = showOfficial ? officialToiletPlaces.filter((place) => !showWheelchair || place.hasWheelchairAccessibleRecord) : [];
  const displayedRestCandidates = showRestData ? restCandidates.filter((candidate) => candidate.category !== "estimated_rest_spot") : [];
  const highlightedRoute = routes.find((route) => route.id === selectedRouteId);
  const unselectedRoutes = routes.filter((route) => route.id !== selectedRouteId);
  const largestGap = highlightedRoute?.publicToiletGapSegments.reduce((best, gap) => gap.gapMeters > best.gapMeters ? gap : best, highlightedRoute.publicToiletGapSegments[0]);
  const facilityLegendKinds: FacilityLegendKind[] = [
    ...(showEstimated && spots.length > 0 ? ["estimatedRest" as const] : []),
    ...(displayedRestCandidates.some((candidate) => candidate.category === "drinking_station") ? ["drinkingStation" as const] : []),
    ...(displayedRestCandidates.some((candidate) => candidate.category === "barrier_free_facility") ? ["barrierFreeFacility" as const] : []),
    ...(displayedRestCandidates.some((candidate) => candidate.category !== "drinking_station" && candidate.category !== "barrier_free_facility") ? ["publicFacility" as const] : []),
    ...(highlightedRoute ? ["restSuggestion" as const] : []),
    ...displayedOfficial.map(getOfficialMarkerKind),
  ];
  const routeLegendItems = getRouteLegendItems(getRouteMapMode(routes));
  const facilityLegendItems = getFacilityLegendItems(facilityLegendKinds);

  return <section className="map-section" aria-labelledby="map-title">
    <div className="section-heading"><div><p className="eyebrow">地図</p><h2 id="map-title">選択した経路と施設候補</h2></div><p className="map-note">直線距離と正規化したルート沿い距離は推定です</p></div>
    <fieldset className="map-filters"><legend>地図に表示する情報</legend><label><input type="checkbox" checked={showOfficial} onChange={(event) => setShowOfficial(event.target.checked)} /> 公式掲載のトイレ候補・設備情報</label><label><input type="checkbox" checked={showWheelchair} onChange={(event) => setShowWheelchair(event.target.checked)} disabled={!showOfficial} /> 車椅子使用者対応情報あり</label><label><input type="checkbox" checked={showRestData} onChange={(event) => setShowRestData(event.target.checked)} /> 公式の休憩・給水・屋内候補</label><label><input type="checkbox" checked={showEstimated} onChange={(event) => setShowEstimated(event.target.checked)} /> 推定休憩候補</label></fieldset>
    <div className="map-frame"><MapContainer center={[35.6901, 139.694]} zoom={16} scrollWheelZoom={false} aria-label="選択した経路候補と周辺施設の地図">
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <MapPointSelector active={selectionMode !== null} onPoint={onMapPoint} />
      <SelectedRouteViewport route={highlightedRoute} />
      <Pane name={MAP_PANES.toiletGap.name} style={{ zIndex: MAP_PANES.toiletGap.zIndex }}>
        {largestGap && <Polyline positions={largestGap.coordinates} pathOptions={PUBLIC_TOILET_GAP_STYLE}><Popup><strong>公衆トイレ候補の空白区間</strong><br />デモ総距離へ正規化したルート沿い推定{Math.round(largestGap.gapMeters)}m</Popup></Polyline>}
      </Pane>
      <Pane name={MAP_PANES.unselectedRoutes.name} style={{ zIndex: MAP_PANES.unselectedRoutes.zIndex }}>
        {unselectedRoutes.map((route) => <Polyline key={route.id} positions={route.coordinates} pathOptions={getRouteLineStyle(route, false)} eventHandlers={{ click: () => { if (selectionMode === null) onSelectRoute(route.id); } }}><Popup><strong>{route.name}</strong><br />クリックして地図で選択</Popup></Polyline>)}
      </Pane>
      <Pane name={MAP_PANES.facilities.name} style={{ zIndex: MAP_PANES.facilities.zIndex }}>
        {showEstimated && spots.map((spot) => <CircleMarker key={spot.id} center={[spot.latitude, spot.longitude]} radius={FACILITY_MARKER_RADII.estimatedRest} pathOptions={FACILITY_MARKER_STYLES.estimatedRest}><Popup><strong>{spot.name}</strong><br />種別：{categoryLabel[spot.category]}<br />座席：{value(spot.seating)}<br />屋内：{value(spot.indoor)}<br />営業時間：{spot.openingHours ?? "不明"}<br /><small>{spot.source.datasetName}（推定・未検証）</small></Popup></CircleMarker>)}
        {displayedRestCandidates.map((candidate) => { const water = candidate.category === "drinking_station"; const barrier = candidate.category === "barrier_free_facility"; const markerStyle = water ? FACILITY_MARKER_STYLES.drinkingStation : barrier ? FACILITY_MARKER_STYLES.barrierFreeFacility : FACILITY_MARKER_STYLES.publicFacility; return <CircleMarker key={candidate.id} center={[candidate.latitude, candidate.longitude]} radius={FACILITY_MARKER_RADII.restCandidate} pathOptions={markerStyle}><Popup><strong>{candidate.name}</strong><br />分類：{water ? "給水地点" : barrier ? "バリアフリー掲載施設" : "公共施設"}<br />休憩信頼度：{candidate.confidence}<br />屋内：{value(candidate.indoor)}／座席：{value(candidate.seating)}<br /><small>{candidate.source.provider}の公式掲載情報。自由利用・着席・営業中は保証しません。</small></Popup></CircleMarker>; })}
        {highlightedRoute && <CircleMarker center={highlightedRoute.restInsertionSuggestion.suggestedRestInsertionCoordinate} radius={FACILITY_MARKER_RADII.restSuggestion} pathOptions={FACILITY_MARKER_STYLES.restSuggestion}><Popup><strong>理論上の休憩地点追加候補</strong><br />最長空白を約{Math.round(highlightedRoute.restInsertionSuggestion.improvementMeters)}m短縮する計算です。実在する設置可能場所ではありません。</Popup></CircleMarker>}
        {displayedOfficial.map((place) => {
          const primary = place.records[0]; const markerKind = getOfficialMarkerKind(place);
          return <CircleMarker key={place.clusterId} center={[place.representativeLatitude, place.representativeLongitude]} radius={FACILITY_MARKER_RADII.officialToilet} pathOptions={FACILITY_MARKER_STYLES[markerKind]}><Popup><strong>公式掲載のトイレ候補地点：{primary.name}</strong><br />原レコード：{place.sourceRecordCount}件<br />分類：{place.kinds.map((item) => toiletKindLabel[item]).join(" / ")}<hr />{place.records.map((record) => <div className="source-record" key={record.id}><strong>{record.name}</strong><br />住所：{record.address ?? "不明"}<br />種別：{record.officialToiletKind ? toiletKindLabel[record.officialToiletKind] : "不明"}<br />車椅子使用者対応情報：{value(record.wheelchairAccessible)}<br />利用時間情報：{record.openingHours ?? "不明"}<br />提供者：{record.source.provider}</div>)}<small>掲載情報であり、利用可能性、入場条件、実際の徒歩距離、車椅子での到達可能性は保証しません。</small></Popup></CircleMarker>;
        })}
      </Pane>
      <Pane name={MAP_PANES.selectedRouteHalo.name} style={{ zIndex: MAP_PANES.selectedRouteHalo.zIndex, pointerEvents: "none" }}>
        {highlightedRoute && <Polyline key={`halo-${highlightedRoute.id}`} positions={highlightedRoute.coordinates} pathOptions={SELECTED_ROUTE_HALO_STYLE} interactive={false} />}
      </Pane>
      <Pane name={MAP_PANES.selectedRoute.name} style={{ zIndex: MAP_PANES.selectedRoute.zIndex }}>
        {highlightedRoute && <Polyline key={highlightedRoute.id} positions={highlightedRoute.coordinates} pathOptions={getRouteLineStyle(highlightedRoute, true)} eventHandlers={{ click: () => { if (selectionMode === null) onSelectRoute(highlightedRoute.id); } }}><Popup><strong>{highlightedRoute.name}</strong><br />比較UIで選択中</Popup></Polyline>}
      </Pane>
      <Pane name={MAP_PANES.endpoints.name} style={{ zIndex: MAP_PANES.endpoints.zIndex }}>
        <Marker position={origin}><Popup><strong>出発地</strong><br />地図クリックで再設定できます</Popup></Marker><Marker position={destination}><Popup><strong>目的地</strong><br />地図クリックで再設定できます</Popup></Marker>
      </Pane>
    </MapContainer></div>
    <div className="legend" aria-label="凡例">
      {routeLegendItems.map((item) => <LineLegendItem key={item.key} label={item.label} style={item.lineStyle} />)}
      {largestGap && <LineLegendItem label="公衆トイレ候補の空白区間" style={PUBLIC_TOILET_GAP_STYLE} />}
      {facilityLegendItems.map((item) => <MarkerLegendItem key={item.key} label={item.label} markerStyle={item.markerStyle} />)}
      <span>「不明」は情報なし（falseではありません）</span>
    </div>
  </section>;
}
