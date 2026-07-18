import { useState } from "react";
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer } from "react-leaflet";
import type { EvaluatedRoute, OfficialToiletPlace, RestSpot } from "../types";

const points = { origin: [35.69092, 139.69917] as [number, number], destination: [35.68945, 139.69215] as [number, number] };
const categoryLabel = { park: "公園", public_facility: "公共施設", toilet: "トイレ", library: "図書館", other: "その他" };
const toiletKindLabel = { public_toilet: "新宿区公衆トイレ", facility_toilet_information: "公共施設内の車椅子使用者対応トイレ情報", station_toilet_information: "鉄道駅内の車椅子使用者対応トイレ情報" };
const value = (item: boolean | null) => item === null ? "不明" : item ? "あり" : "なし";

export function RouteMap({ routes, spots, officialToiletPlaces, highlightedRouteId }: { routes: EvaluatedRoute[]; spots: RestSpot[]; officialToiletPlaces: OfficialToiletPlace[]; highlightedRouteId: EvaluatedRoute["id"] }) {
  const [showOfficial, setShowOfficial] = useState(true); const [showWheelchair, setShowWheelchair] = useState(true); const [showEstimated, setShowEstimated] = useState(true);
  const displayedOfficial = showOfficial ? officialToiletPlaces.filter((place) => !showWheelchair || place.hasWheelchairAccessibleRecord) : [];
  const highlightedRoute = routes.find((route) => route.id === highlightedRouteId);
  const largestGap = highlightedRoute?.publicToiletGapSegments.reduce((best, gap) => gap.gapMeters > best.gapMeters ? gap : best, highlightedRoute.publicToiletGapSegments[0]);

  return <section className="map-section" aria-labelledby="map-title">
    <div className="section-heading"><div><p className="eyebrow">地図</p><h2 id="map-title">デモ区間と休憩候補</h2></div><p className="map-note">直線距離と正規化したルート沿い距離は推定です</p></div>
    <fieldset className="map-filters"><legend>地図に表示する情報</legend><label><input type="checkbox" checked={showOfficial} onChange={(event) => setShowOfficial(event.target.checked)} /> 公式掲載のトイレ候補・設備情報</label><label><input type="checkbox" checked={showWheelchair} onChange={(event) => setShowWheelchair(event.target.checked)} disabled={!showOfficial} /> 車椅子使用者対応情報あり</label><label><input type="checkbox" checked={showEstimated} onChange={(event) => setShowEstimated(event.target.checked)} /> 推定休憩候補</label></fieldset>
    <div className="map-frame"><MapContainer center={[35.6901, 139.694]} zoom={16} scrollWheelZoom={false} aria-label="新宿駅西口から東京都庁までのデモ地図">
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Marker position={points.origin}><Popup><strong>新宿駅西口</strong><br />出発地</Popup></Marker><Marker position={points.destination}><Popup><strong>東京都庁</strong><br />目的地</Popup></Marker>
      {routes.map((route) => <Polyline key={route.id} positions={route.coordinates} pathOptions={{ color: route.id === "comfort" ? "#087f5b" : "#46505a", weight: route.id === "comfort" ? 7 : 5, dashArray: route.id === "comfort" ? undefined : "9 8" }} />)}
      {largestGap && <Polyline positions={largestGap.coordinates} pathOptions={{ color: "#b42318", weight: 10, dashArray: "3 9", opacity: 0.9 }}><Popup><strong>公衆トイレ候補の空白区間</strong><br />デモ総距離へ正規化したルート沿い推定{Math.round(largestGap.gapMeters)}m</Popup></Polyline>}
      {showEstimated && spots.map((spot) => <CircleMarker key={spot.id} center={[spot.latitude, spot.longitude]} radius={9} pathOptions={{ color: "#713b00", fillColor: "#f3a712", fillOpacity: 1, weight: 3 }}><Popup><strong>{spot.name}</strong><br />種別：{categoryLabel[spot.category]}<br />座席：{value(spot.seating)}<br />屋内：{value(spot.indoor)}<br />営業時間：{spot.openingHours ?? "不明"}<br /><small>{spot.source.datasetName}（推定・未検証）</small></Popup></CircleMarker>)}
      {displayedOfficial.map((place) => {
        const primary = place.records[0]; const kind = place.hasPublicToiletRecord ? "public" : place.kinds.includes("facility_toilet_information") ? "facility" : "station";
        const colors = kind === "public" ? { color: "#063b73", fillColor: "#1479c9" } : kind === "facility" ? { color: "#5b2c83", fillColor: "#c9a7e8" } : { color: "#713b00", fillColor: "#f3a712" };
        return <CircleMarker key={place.clusterId} center={[place.representativeLatitude, place.representativeLongitude]} radius={10} pathOptions={{ ...colors, fillOpacity: 1, weight: 4 }}><Popup><strong>公式掲載のトイレ候補地点：{primary.name}</strong><br />原レコード：{place.sourceRecordCount}件<br />分類：{place.kinds.map((item) => toiletKindLabel[item]).join(" / ")}<hr />{place.records.map((record) => <div className="source-record" key={record.id}><strong>{record.name}</strong><br />住所：{record.address ?? "不明"}<br />種別：{record.officialToiletKind ? toiletKindLabel[record.officialToiletKind] : "不明"}<br />車椅子使用者対応情報：{value(record.wheelchairAccessible)}<br />利用時間情報：{record.openingHours ?? "不明"}<br />提供者：{record.source.provider}</div>)}<small>掲載情報であり、利用可能性、入場条件、実際の徒歩距離、車椅子での到達可能性は保証しません。</small></Popup></CircleMarker>;
      })}
    </MapContainer></div>
    <div className="legend" aria-label="凡例"><span><i className="line normal" />通常ルート（破線）</span><span><i className="line comfort" />安心ルート（実線）</span><span><i className="line toilet-gap" />公衆トイレ候補の空白区間</span><span><i className="dot official" />公衆トイレ候補</span><span><i className="dot facility" />公共施設内の設備情報</span><span><i className="dot station" />鉄道駅内の設備情報</span><span><i className="dot" />推定デモデータ</span><span>「不明」は情報なし（falseではありません）</span></div>
  </section>;
}
