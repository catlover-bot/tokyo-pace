import { lazy, Suspense, useMemo, useRef, useState } from "react";
import type { VerifiedRestMetadata } from "./components/AnalysisDataPanel";
import { DataFreshnessNotice } from "./components/DataFreshnessNotice";
import { OfflineNotice } from "./components/OfflineNotice";
import { PublicPolicyLinks } from "./components/PublicPolicyLinks";
import { RouteSearchStatus } from "./components/RouteSearchStatus";
import { SkipLink } from "./components/SkipLink";
import { restSpots } from "./data/restSpots";
import { getOpenDataFreshness, latestOpenDataRetrievedAt, openDataManifest } from "./data/openDataManifest";
import { parseApplicationMode } from "./domain/applicationMode";
import { parsePublicPagePathname } from "./domain/publicPage";
import { distancePointToRouteMeters, findOfficialToiletPlacesNearRoute } from "./domain/geo";
import { prepareDynamicRoute } from "./domain/dynamicRoute";
import { canSearchDynamicRoutes, OFFLINE_ROUTE_SEARCH_MESSAGE } from "./domain/networkStatus";
import { buildRouteComparisonViewModels, selectRouteId } from "./domain/routeComparison";
import { selectRecommendedRoute } from "./domain/routeScore";
import { reportRouteSearchError, toRouteSearchErrorMessage } from "./domain/routeSearchError";
import { applySelectedMapPoint, SHINJUKU_ROUTING_BBOX } from "./domain/routing";
import { ApiRouteProvider } from "./providers/ApiRouteProvider";
import { DemoRouteProvider } from "./providers/DemoRouteProvider";
import { useOnlineStatus } from "./hooks/useOnlineStatus";
import type { DemoRoute, GeoPoint, OfficialToiletPlace, RestCandidate, RoutePreferences } from "./types";

const RouteMap = lazy(() => import("./components/RouteMap").then((module) => ({ default: module.RouteMap })));
const RouteComparison = lazy(() => import("./components/RouteComparison").then((module) => ({ default: module.RouteComparison })));
const AnalysisDataPanel = lazy(() => import("./components/AnalysisDataPanel").then((module) => ({ default: module.AnalysisDataPanel })));
const FieldCheckPage = lazy(() => import("./components/FieldCheckPage").then((module) => ({ default: module.FieldCheckPage })));
const PublicPolicyPage = lazy(() => import("./components/PublicPolicyPage").then((module) => ({ default: module.PublicPolicyPage })));
const apiProvider = new ApiRouteProvider(); const demoProvider = new DemoRouteProvider();
const presets = { "shinjuku-west": { label: "新宿駅西口", point: { latitude: 35.69092, longitude: 139.69917 } }, tocho: { label: "東京都庁", point: { latitude: 35.68945, longitude: 139.69215 } }, park: { label: "新宿中央公園", point: { latitude: 35.68908, longitude: 139.68925 } } } as const;
const initialPreferences: RoutePreferences = { maxContinuousWalkingMinutes: 10, requireToilet: true, avoidSteepSlopes: true, preferIndoorRest: false, avoidSteps: true };

export function RoutePlanningApp() {
  const online = useOnlineStatus();
  const dataFreshness = useMemo(() => getOpenDataFreshness(), []);
  const [preferences, setPreferences] = useState(initialPreferences); const [draft, setDraft] = useState(initialPreferences);
  const [origin, setOrigin] = useState<GeoPoint>(presets["shinjuku-west"].point); const [destination, setDestination] = useState<GeoPoint>(presets.tocho.point);
  const [selectionMode, setSelectionMode] = useState<"origin" | "destination" | null>(null); const [routes, setRoutes] = useState<DemoRoute[]>([]);
  const [officialToiletPlaces, setOfficialToiletPlaces] = useState<OfficialToiletPlace[]>([]); const [allRestCandidates, setAllRestCandidates] = useState<RestCandidate[]>([]);
  const [verifiedMetadata, setVerifiedMetadata] = useState<VerifiedRestMetadata>({ normalizedRecordCount: 0, latestVerifiedAt: null });
  const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null); const [fallback, setFallback] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null); const controller = useRef<AbortController | null>(null);
  const request = (next = draft) => ({ origin, destination, preferences: next });
  const loadAnalysisData = async () => { const [toilets, rest, verified] = await Promise.all([import("./data/officialToilets"), import("./data/restCandidates"), import("./data/verifiedRestSpots")]); setOfficialToiletPlaces(toilets.officialToiletPlaces); setAllRestCandidates(rest.allRestCandidates); setVerifiedMetadata(verified.verifiedRestMetadata); return { toilets: toilets.officialToiletPlaces, rest: rest.allRestCandidates }; };
  const search = async () => {
    controller.current?.abort(); const next = new AbortController(); controller.current = next;
    setLoading(true); setError(null); setFallback(false); setRoutes([]); setSelectedRouteId(null);
    if (!canSearchDynamicRoutes(online)) {
      setError(OFFLINE_ROUTE_SEARCH_MESSAGE);
      setLoading(false);
      return;
    }
    try { const [candidates, data] = await Promise.all([apiProvider.getRoutes(request(), next.signal), loadAnalysisData()]); setRoutes(candidates.map((route) => prepareDynamicRoute(route, data.rest))); setPreferences(draft); }
    catch (cause) { if (!next.signal.aborted) { reportRouteSearchError(cause); setError(toRouteSearchErrorMessage(cause)); } }
    finally { if (!next.signal.aborted) setLoading(false); }
  };
  const showDemo = async () => { setLoading(true); setError(null); setRoutes([]); setSelectedRouteId(null); try { const data = await loadAnalysisData(); const demoRoutes = await demoProvider.getRoutes(request()); const hasVerifiedStrictCandidate = data.rest.some((candidate) => candidate.confidence === "confirmed" || candidate.confidence === "supported"); setRoutes(hasVerifiedStrictCandidate ? demoRoutes.map((route) => prepareDynamicRoute(route, data.rest)) : demoRoutes); setPreferences(draft); setFallback(true); } finally { setLoading(false); } };
  const evaluated = useMemo(() => selectRecommendedRoute(routes, preferences, officialToiletPlaces, allRestCandidates), [routes, preferences, officialToiletPlaces, allRestCandidates]);
  const comparison = useMemo(() => buildRouteComparisonViewModels(evaluated, preferences), [evaluated, preferences]);
  const activeRouteId = selectRouteId(selectedRouteId, comparison.routes.map((model) => model.routeId), comparison.recommendedRouteId);
  const activeEvaluatedRoute = evaluated.find((route) => route.id === activeRouteId);
  const analysisGeneratedAt = activeEvaluatedRoute?.generatedAt ?? latestOpenDataRetrievedAt ?? "2000-01-01T00:00:00.000Z";
  const nearbyToilets = useMemo(() => [...new Map(routes.flatMap((route) => findOfficialToiletPlacesNearRoute(officialToiletPlaces, route.coordinates, 350, 30)).map((place) => [place.clusterId, place])).values()].slice(0, 30), [routes, officialToiletPlaces]);
  const nearbyRest = useMemo(() => allRestCandidates.filter((candidate) => routes.some((route) => distancePointToRouteMeters([candidate.latitude, candidate.longitude], route.coordinates) <= 350)).slice(0, 30), [routes, allRestCandidates]);
  const setPreset = (kind: "origin" | "destination", key: keyof typeof presets) => kind === "origin" ? setOrigin(presets[key].point) : setDestination(presets[key].point);
  return <>
    <SkipLink />
    <header className="site-header"><div className="header-inner"><div className="brand"><span className="brand-mark" aria-hidden="true">歩</span><div><p className="service-name">TOKYO PACE</p><p className="tagline">最短ではなく、最後まで歩ける道へ</p></div></div><span className="demo-badge">v1.0</span></div></header>
    <main id="main-content" tabIndex={-1}>
      <section className="intro"><p className="eyebrow">歩行経路候補の比較</p><h1>地図で場所を選び、<br />歩き続ける負担を比べます。</h1><p>対象は新宿駅・東京都庁・新宿中央公園周辺です。OpenStreetMapの情報に基づく候補で、実際の通行可否・工事・段差・営業時間等は確認が必要です。</p></section>
      <OfflineNotice online={online} onFallback={() => void showDemo()} />
      <section className="search-panel" aria-labelledby="conditions-title"><div className="panel-title"><div><p className="step">条件 1</p><h2 id="conditions-title">出発地・目的地と歩行条件</h2></div><p>検索ボタンを押した時だけ外部経路を取得します</p></div>
        <div className="locations"><label>出発地<select aria-label="出発地プリセット" onChange={(event) => setPreset("origin", event.target.value as keyof typeof presets)} defaultValue="shinjuku-west">{Object.entries(presets).map(([key, item]) => <option value={key} key={key}>{item.label}</option>)}</select></label><span>→</span><label>目的地<select aria-label="目的地プリセット" onChange={(event) => setPreset("destination", event.target.value as keyof typeof presets)} defaultValue="tocho">{Object.entries(presets).map(([key, item]) => <option value={key} key={key}>{item.label}</option>)}</select></label></div>
        <div className="location-actions"><button type="button" aria-pressed={selectionMode === "origin"} onClick={() => setSelectionMode("origin")}>地図で出発地を設定</button><button type="button" aria-pressed={selectionMode === "destination"} onClick={() => setSelectionMode("destination")}>地図で目的地を設定</button><button type="button" onClick={() => setSelectionMode(null)}>設定モード解除</button><button type="button" onClick={() => { setOrigin(presets["shinjuku-west"].point); setDestination(presets.tocho.point); setSelectionMode(null); }}>初期位置へ戻す</button></div>
        <p>出発地：{origin.latitude.toFixed(5)}, {origin.longitude.toFixed(5)}／目的地：{destination.latitude.toFixed(5)}, {destination.longitude.toFixed(5)}</p>
        <form onSubmit={(event) => { event.preventDefault(); void search(); }}><fieldset><legend>休まずに歩ける時間</legend><div className="segments">{([5, 10, 15] as const).map((minutes) => <label key={minutes}><input type="radio" checked={draft.maxContinuousWalkingMinutes === minutes} onChange={() => setDraft({ ...draft, maxContinuousWalkingMinutes: minutes })} /><span>{minutes}分</span></label>)}</div></fieldset><fieldset><legend>希望する条件</legend><div className="checks"><label><input type="checkbox" checked={draft.requireToilet} onChange={(event) => setDraft({ ...draft, requireToilet: event.target.checked })} /><span>公衆トイレ候補を希望</span></label><label><input type="checkbox" checked={draft.avoidSteepSlopes} onChange={(event) => setDraft({ ...draft, avoidSteepSlopes: event.target.checked })} /><span>急坂を避けたい</span></label><label><input type="checkbox" checked={draft.preferIndoorRest} onChange={(event) => setDraft({ ...draft, preferIndoorRest: event.target.checked })} /><span>屋内候補を優先</span></label><label><input type="checkbox" checked={draft.avoidSteps === true} onChange={(event) => setDraft({ ...draft, avoidSteps: event.target.checked })} /><span>階段回避候補を比較</span></label></div></fieldset><button className="search-button" type="submit" disabled={loading || !online}>{loading ? "比較中…" : online ? "経路候補を検索" : "オフラインでは検索できません"}</button>{loading && <button className="secondary-button" type="button" onClick={() => { controller.current?.abort(); setLoading(false); }}>検索を中止</button>}</form>
      </section>
      <RouteSearchStatus loading={loading} error={error} onRetry={() => void search()} onFallback={() => void showDemo()} />
      {comparison.routes.length > 0 && <Suspense fallback={<div className="loading" role="status">経路比較を準備しています…</div>}><RouteComparison comparison={comparison} selectedRouteId={activeRouteId} fallback={fallback} onSelect={setSelectedRouteId} /></Suspense>}
      {activeEvaluatedRoute && <Suspense fallback={<div className="loading" role="status">分析データを準備しています…</div>}><AnalysisDataPanel route={activeEvaluatedRoute} restCandidates={allRestCandidates} manifest={openDataManifest} verifiedMetadata={verifiedMetadata} generatedAt={analysisGeneratedAt} /></Suspense>}
      <Suspense fallback={<div className="loading" role="status" aria-live="polite">地図を読み込んでいます…</div>}><RouteMap routes={evaluated} spots={restSpots} restCandidates={nearbyRest} officialToiletPlaces={nearbyToilets} selectedRouteId={activeRouteId} origin={[origin.latitude, origin.longitude]} destination={[destination.latitude, destination.longitude]} selectionMode={selectionMode} onSelectRoute={setSelectedRouteId} onMapPoint={(point) => { if (selectionMode) { const next = applySelectedMapPoint(selectionMode, { origin, destination }, { latitude: point[0], longitude: point[1] }); setOrigin(next.origin); setDestination(next.destination); setSelectionMode(null); } }} /></Suspense>
      <section className="data-sources"><h2>データと注意事項</h2><DataFreshnessNotice summary={dataFreshness} /><p>対象範囲：緯度{SHINJUKU_ROUTING_BBOX.minLatitude}〜{SHINJUKU_ROUTING_BBOX.maxLatitude}、経度{SHINJUKU_ROUTING_BBOX.minLongitude}〜{SHINJUKU_ROUTING_BBOX.maxLongitude}。経路はopenrouteserviceとOpenStreetMap由来、施設は公式オープンデータです。取得日：{latestOpenDataRetrievedAt ? new Date(latestOpenDataRetrievedAt).toLocaleDateString("ja-JP") : "不明"}。</p><p>TOKYO PACEの順位と説明は既存の条件負担スコアと決定的なルールから生成し、AIで文章を生成していません。現地状況を保証するものではありません。</p></section>
    </main>
    <footer><strong>TOKYO PACE</strong><p>経路の安全性、設備の利用可否、車いすでの到達可能性を保証しません。</p><PublicPolicyLinks /></footer>
  </>;
}

export default function App() {
  const search = typeof window === "undefined" ? "" : window.location.search;
  const pathname = typeof window === "undefined" ? "/" : window.location.pathname;
  const publicPage = parsePublicPagePathname(pathname);
  if (publicPage) return <Suspense fallback={<div className="loading" role="status" aria-live="polite">方針ページを読み込んでいます…</div>}><PublicPolicyPage page={publicPage} /></Suspense>;
  if (parseApplicationMode(search) === "field-check") return <Suspense fallback={<div className="loading" role="status">現地確認画面を読み込んでいます…</div>}><FieldCheckPage /></Suspense>;
  return <RoutePlanningApp />;
}
