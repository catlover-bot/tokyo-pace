import { useEffect } from "react";
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import { demoRoutes } from "../data/routes";
import { getRouteBaseLineStyle } from "../domain/routePresentation";
import type { FieldVerificationCandidate } from "../types";

function CandidateViewport({ candidate }: { candidate: FieldVerificationCandidate | undefined }) {
  const map = useMap();
  useEffect(() => {
    if (candidate) map.setView([candidate.latitude, candidate.longitude], 17);
  }, [candidate, map]);
  return null;
}

function routeName(routeId: string): string {
  return demoRoutes.find((route) => route.id === routeId)?.name ?? routeId;
}

export function FieldCheckMap({ candidates, selectedCandidateId, onSelectCandidate }: { candidates: readonly FieldVerificationCandidate[]; selectedCandidateId: string | null; onSelectCandidate(candidateId: string): void }) {
  const selected = candidates.find((candidate) => candidate.candidateId === selectedCandidateId) ?? candidates[0];
  return <div className="field-check-map-frame">
    <MapContainer center={[35.6901, 139.694]} zoom={16} scrollWheelZoom={false} aria-label="デモルートと現地確認候補の地図">
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <CandidateViewport candidate={selected} />
      {demoRoutes.map((route) => <Polyline key={route.id} positions={route.coordinates} pathOptions={{ ...getRouteBaseLineStyle(route), weight: 5, opacity: 0.72, lineCap: "round", lineJoin: "round" }}><Popup><strong>{route.name}</strong><br />現地確認候補を抽出する固定デモルート</Popup></Polyline>)}
      {candidates.map((candidate, index) => {
        const isSelected = candidate.candidateId === selected?.candidateId;
        return <CircleMarker
          key={candidate.candidateId}
          center={[candidate.latitude, candidate.longitude]}
          radius={isSelected ? 11 : 8}
          pathOptions={{ color: isSelected ? "#7a2500" : "#075a45", fillColor: isSelected ? "#f0a500" : "#fffdf7", fillOpacity: 0.9, opacity: 1, weight: isSelected ? 4 : 3 }}
          eventHandlers={{ click: () => onSelectCandidate(candidate.candidateId) }}
        ><Popup><strong>候補順位 {index + 1}位：{candidate.name}</strong><br />{candidate.address ?? "住所情報なし"}<br />デモルートから推定直線{Math.round(candidate.distanceToRouteMeters)}m<br />単一指標の基準：{routeName(candidate.primaryRouteId)}<br />対象ルート：{candidate.routeIds.map(routeName).join(" / ")}<br />理論上の改善：推定{Math.round(candidate.expectedImprovementMeters)}m<br />CSV記入用ID：{candidate.verificationId ?? `fv-${candidate.candidateId}`}<br />公式出典ID：{candidate.officialSourceIds.join(" / ") || "なし"}</Popup></CircleMarker>;
      })}
    </MapContainer>
  </div>;
}
