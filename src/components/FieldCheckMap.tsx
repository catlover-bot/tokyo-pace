import { useEffect, useRef, useState } from "react";
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import { fieldCheckRouteSnapshot, representativeDynamicRoutes } from "../data/fieldCheckRoutes";
import { demoRoutes } from "../data/routes";
import {
  DEFAULT_FIELD_CHECK_MAP_LAYERS,
  getCandidateMapGeometry,
  getDynamicFieldCheckRouteClassName,
  getDynamicFieldCheckRouteLabel,
  getFixedDemoFieldCheckRouteClassName,
  getFixedDemoFieldCheckRouteLabel,
  type FieldCheckMapLayerVisibility,
} from "../domain/fieldCheckMapPresentation";
import {
  getDetourSensitivityLabel,
  getRankStabilityLabel,
} from "../domain/fieldCandidateRankingPresentation";
import { getRouteBaseLineStyle } from "../domain/routePresentation";
import type {
  FieldCandidateRankingSensitivity,
  FieldVerificationCandidate,
  FieldVisitShortlistEntry,
} from "../types";

function InitialViewport({ candidates }: { candidates: readonly FieldVerificationCandidate[] }) {
  const map = useMap();
  const didFit = useRef(false);
  useEffect(() => {
    if (didFit.current) return;
    const points: Array<[number, number]> = [
      ...representativeDynamicRoutes.flatMap((route) => route.coordinates),
      ...candidates.slice(0, 5).map((candidate) => [candidate.latitude, candidate.longitude] as [number, number]),
    ];
    if (points.length > 1) map.fitBounds(points, { padding: [28, 28], maxZoom: 16 });
    didFit.current = true;
  }, [candidates, map]);
  return null;
}

function CandidateViewport({ candidate }: { candidate: FieldVerificationCandidate | undefined }) {
  const map = useMap();
  const initialCandidateId = useRef<string | null>(null);
  useEffect(() => {
    if (initialCandidateId.current === null) {
      initialCandidateId.current = candidate?.candidateId ?? "";
      return;
    }
    if (candidate && initialCandidateId.current !== candidate.candidateId) {
      initialCandidateId.current = candidate.candidateId;
      map.setView([candidate.latitude, candidate.longitude], Math.max(map.getZoom(), 16));
    }
  }, [candidate, map]);
  return null;
}

function updateLayer(
  setLayers: React.Dispatch<React.SetStateAction<FieldCheckMapLayerVisibility>>,
  key: keyof FieldCheckMapLayerVisibility,
  checked: boolean,
) {
  setLayers((current) => ({ ...current, [key]: checked }));
}

export function FieldCheckMap({
  candidates,
  rankingSensitivity,
  visitShortlist,
  selectedCandidateId,
  onSelectCandidate,
}: {
  candidates: readonly FieldVerificationCandidate[];
  rankingSensitivity: readonly FieldCandidateRankingSensitivity[];
  visitShortlist: readonly FieldVisitShortlistEntry[];
  selectedCandidateId: string | null;
  onSelectCandidate(candidateId: string): void;
}) {
  const [layers, setLayers] = useState<FieldCheckMapLayerVisibility>(DEFAULT_FIELD_CHECK_MAP_LAYERS);
  const selected = candidates.find((candidate) => candidate.candidateId === selectedCandidateId) ?? candidates[0];
  const selectedGeometry = selected ? getCandidateMapGeometry(selected) : null;
  const analysisByCandidateId = new Map(rankingSensitivity.map((analysis) => [analysis.candidateId, analysis]));
  const shortlistByCandidateId = new Map(visitShortlist.map((entry) => [entry.candidateId, entry]));

  return <div className="field-check-map-shell">
    <fieldset className="field-map-controls">
      <legend>地図の表示</legend>
      <label><input type="checkbox" checked={layers.dynamicRoutes} onChange={(event) => updateLayer(setLayers, "dynamicRoutes", event.target.checked)} />代表動的3経路</label>
      <label><input type="checkbox" checked={layers.fixedDemoRoutes} onChange={(event) => updateLayer(setLayers, "fixedDemoRoutes", event.target.checked)} />固定デモ経路（回帰比較）</label>
      <label><input type="checkbox" checked={layers.candidates} onChange={(event) => updateLayer(setLayers, "candidates", event.target.checked)} />現地確認候補</label>
      <label><input type="checkbox" checked={layers.selectedCandidateConnection} onChange={(event) => updateLayer(setLayers, "selectedCandidateConnection", event.target.checked)} />選択候補の最近点・推定直線</label>
      <label><input type="checkbox" checked={layers.theoreticalInsertion} onChange={(event) => updateLayer(setLayers, "theoreticalInsertion", event.target.checked)} />選択候補の理論挿入位置</label>
    </fieldset>

    <div className="field-check-map-frame">
      <MapContainer
        center={[35.6901, 139.694]}
        zoom={15}
        scrollWheelZoom={false}
        className="field-check-leaflet-map"
        aria-label="代表動的経路、固定デモ経路と現地確認候補の地図"
      >
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <InitialViewport candidates={candidates} />
        <CandidateViewport candidate={selected} />

        {layers.dynamicRoutes && representativeDynamicRoutes.map((route) => <Polyline
          key={`dynamic-${route.profile}`}
          positions={route.coordinates}
          className={getDynamicFieldCheckRouteClassName(route.profile)}
          pathOptions={{
            ...getRouteBaseLineStyle(route),
            weight: 5,
            opacity: 0.88,
            lineCap: "round",
            lineJoin: "round",
          }}
        ><Popup><strong>{getDynamicFieldCheckRouteLabel(route.profile)}</strong><br />保存済みsnapshot：{fieldCheckRouteSnapshot.snapshotId}<br />距離：{Math.round(route.distanceMeters)}m<br />通常の画面表示から外部ORSへ接続せず再現した代表経路です。</Popup></Polyline>)}

        {layers.fixedDemoRoutes && demoRoutes.map((route) => <Polyline
          key={`fixed-demo-${route.id}`}
          positions={route.coordinates}
          className={getFixedDemoFieldCheckRouteClassName(route.id)}
          pathOptions={{
            ...getRouteBaseLineStyle(route),
            weight: 4,
            opacity: 0.48,
            lineCap: "round",
            lineJoin: "round",
          }}
        ><Popup><strong>{getFixedDemoFieldCheckRouteLabel(route.id, route.name)}</strong><br />既存機能の比較・回帰確認にだけ使用する固定デモ経路です。</Popup></Polyline>)}

        {layers.candidates && candidates.map((candidate, index) => {
          const isSelected = candidate.candidateId === selected?.candidateId;
          const analysis = analysisByCandidateId.get(candidate.candidateId);
          const shortlistEntry = shortlistByCandidateId.get(candidate.candidateId);
          const baselineRank = analysis?.baselineRank ?? index + 1;
          return <CircleMarker
            key={candidate.candidateId}
            center={[candidate.latitude, candidate.longitude]}
            radius={isSelected ? 11 : 8}
            className={`field-map-candidate${isSelected ? " field-map-candidate--selected" : ""}${shortlistEntry ? " field-map-candidate--shortlisted" : ""}`}
            pathOptions={{
              color: isSelected ? "#7a2500" : shortlistEntry ? "#5b2a86" : "#075a45",
              fillColor: isSelected ? "#f0a500" : shortlistEntry ? "#f2e9fa" : "#fffdf7",
              fillOpacity: 0.94,
              opacity: 1,
              weight: isSelected ? 4 : 3,
            }}
            eventHandlers={{ click: () => onSelectCandidate(candidate.candidateId) }}
          >
            {isSelected && <Tooltip permanent direction="top" offset={[0, -10]} className="field-map-selected-label">選択中：単一スコア{baselineRank}位{shortlistEntry ? `／訪問推奨${shortlistEntry.visitPriority}番目` : ""}</Tooltip>}
            <Popup><strong>単一スコア順位 {baselineRank}位：{candidate.name}</strong>{shortlistEntry && <><br /><strong>訪問推奨 {shortlistEntry.visitPriority}番目</strong></>}<br />{candidate.facilityAccessCategoryLabel}<br />{candidate.address ?? "住所情報なし"}<br />代表動的経路から推定直線{Math.round(candidate.distanceToRouteMeters)}m{analysis && <><br />往復直線proxy控除後：推定{Math.round(analysis.conservativeProxyImprovementMeters)}m<br />{getDetourSensitivityLabel(analysis.detourSensitivityClass)}<br />上位5出現率 {Math.round(analysis.top5AppearanceRate * 1000) / 10}%（{getRankStabilityLabel(analysis.rankStabilityClass)}）</>}<br />対象：{candidate.dynamicRouteIds.map(getDynamicFieldCheckRouteLabel).join(" / ")}</Popup>
          </CircleMarker>;
        })}

        {selectedGeometry && layers.selectedCandidateConnection && <>
          <Polyline
            positions={selectedGeometry.connectionCoordinates}
            className="field-map-detour-line"
            pathOptions={{ color: "#b43e18", dashArray: "4 7", weight: 4, opacity: 0.9 }}
          ><Popup>候補地点から代表動的経路への推定直線です。実際の道路上の徒歩経路ではありません。</Popup></Polyline>
          <CircleMarker
            center={selectedGeometry.nearestPointCoordinate}
            radius={7}
            className="field-map-nearest-point"
            pathOptions={{ color: "#b43e18", fillColor: "#ffffff", fillOpacity: 1, weight: 4 }}
          ><Popup><strong>ルートへの最近点</strong><br />選択候補の距離・迂回下限推定に用いる折れ線上の点です。</Popup></CircleMarker>
        </>}

        {selectedGeometry && layers.theoreticalInsertion && <CircleMarker
          center={selectedGeometry.theoreticalInsertionCoordinate}
          radius={9}
          className="field-map-insertion"
          pathOptions={{ color: "#5b2a86", fillColor: "#efe2ff", fillOpacity: 0.95, weight: 4, dashArray: "3 3" }}
        ><Popup><strong>理論上の休憩挿入位置</strong><br />選択候補の改善計算で使うルート上の位置です。施設位置や実在する設置可能場所ではありません。</Popup></CircleMarker>}
      </MapContainer>
    </div>

    <div className="field-map-legend" aria-label="現地確認地図の凡例">
      <span><i className="field-route-key dynamic-standard" aria-hidden="true" />代表動的：標準</span>
      <span><i className="field-route-key dynamic-step" aria-hidden="true" />代表動的：階段回避要求</span>
      <span><i className="field-route-key dynamic-wheelchair" aria-hidden="true" />代表動的：車いすプロファイル</span>
      <span><i className="field-route-key fixed-demo" aria-hidden="true" />固定デモ（初期非表示）</span>
      <span><i className="field-candidate-key" aria-hidden="true" />現地確認候補</span>
      <span><i className="field-shortlist-key" aria-hidden="true" />最終訪問候補5地点</span>
      <span><i className="field-nearest-key" aria-hidden="true" />ルートへの最近点</span>
      <span><i className="field-detour-key" aria-hidden="true" />候補から最近点までの推定直線</span>
      <span><i className="field-insertion-key" aria-hidden="true" />理論上の休憩挿入位置</span>
    </div>
    <p className="field-map-source">代表動的経路：{fieldCheckRouteSnapshot.source.attribution}。固定デモ経路は比較・回帰用で、候補順位には使用していません。</p>
  </div>;
}
