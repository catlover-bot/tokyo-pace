import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer } from "react-leaflet";
import type { EvaluatedRoute, RestSpot } from "../types";

const points = { origin: [35.69092, 139.69917] as [number, number], destination: [35.68945, 139.69215] as [number, number] };
const categoryLabel = { park: "公園", public_facility: "公共施設", toilet: "トイレ", library: "図書館", other: "その他" };
const value = (item: boolean | null) => item === null ? "不明" : item ? "あり" : "なし";

export function RouteMap({ routes, spots }: { routes: EvaluatedRoute[]; spots: RestSpot[] }) {
  return <section className="map-section" aria-labelledby="map-title">
    <div className="section-heading"><div><p className="eyebrow">地図</p><h2 id="map-title">デモ区間と休憩候補</h2></div><p className="map-note">地図上の線・地点はプロトタイプ計算用です</p></div>
    <div className="map-frame">
      <MapContainer center={[35.6901, 139.694]} zoom={16} scrollWheelZoom={false} aria-label="新宿駅西口から東京都庁までのデモ地図">
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Marker position={points.origin}><Popup><strong>新宿駅西口</strong><br />出発地</Popup></Marker>
        <Marker position={points.destination}><Popup><strong>東京都庁</strong><br />目的地</Popup></Marker>
        {routes.map((route) => <Polyline key={route.id} positions={route.coordinates} pathOptions={{ color: route.id === "comfort" ? "#087f5b" : "#46505a", weight: route.id === "comfort" ? 7 : 5, dashArray: route.id === "comfort" ? undefined : "9 8" }} />)}
        {spots.map((spot) => <CircleMarker key={spot.id} center={[spot.latitude, spot.longitude]} radius={9} pathOptions={{ color: "#713b00", fillColor: spot.category === "toilet" ? "#6b3fa0" : "#f3a712", fillOpacity: 1, weight: 3 }}><Popup><strong>{spot.name}</strong><br />種別：{categoryLabel[spot.category]}<br />座席：{value(spot.seating)}<br />屋内：{value(spot.indoor)}<br />トイレ：{value(spot.toiletAvailable)}<br />営業時間：{spot.openingHours ?? "不明"}<br /><small>{spot.sourceName}（未検証）</small></Popup></CircleMarker>)}
      </MapContainer>
    </div>
    <div className="legend" aria-label="凡例"><span><i className="line normal" />通常ルート（破線）</span><span><i className="line comfort" />安心ルート（実線）</span><span><i className="dot" />休憩・トイレ候補</span></div>
  </section>;
}
