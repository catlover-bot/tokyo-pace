import { useEffect, useMemo, useState } from "react";
import { RouteCard } from "./components/RouteCard";
import { RouteMap } from "./components/RouteMap";
import { restSpots } from "./data/restSpots";
import { officialToiletPlaces } from "./data/officialToilets";
import { allRestCandidates } from "./data/restCandidates";
import { latestOpenDataRetrievedAt } from "./data/openDataManifest";
import { distancePointToRouteMeters, findOfficialToiletPlacesNearRoute } from "./domain/geo";
import { selectRecommendedRoute } from "./domain/routeScore";
import { DemoRouteProvider } from "./providers/DemoRouteProvider";
import type { DemoRoute, RoutePreferences } from "./types";

const provider = new DemoRouteProvider();
const initial: RoutePreferences = { maxContinuousWalkingMinutes: 10, requireToilet: true, avoidSteepSlopes: true, preferIndoorRest: false };

export default function App() {
  const [draft, setDraft] = useState(initial); const [preferences, setPreferences] = useState(initial);
  const [routes, setRoutes] = useState<DemoRoute[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const load = async (next = preferences) => { setLoading(true); setError(null); try { setRoutes(await provider.getRoutes("shinjuku-west", "tocho")); setPreferences(next); } catch (cause) { setError(cause instanceof Error ? cause.message : "経路データを読み込めませんでした。"); } finally { setLoading(false); } };
  useEffect(() => {
    provider.getRoutes("shinjuku-west", "tocho")
      .then(setRoutes)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "経路データを読み込めませんでした。"))
      .finally(() => setLoading(false));
  }, []);
  const evaluated = useMemo(() => selectRecommendedRoute(routes, preferences, officialToiletPlaces, allRestCandidates), [routes, preferences]);
  const nearbyOfficialToiletPlaces = useMemo(() => {
    const matches = routes.flatMap((route) => findOfficialToiletPlacesNearRoute(officialToiletPlaces, route.coordinates, 350, 30));
    return [...new Map(matches.map((place) => [place.clusterId, place])).values()].slice(0, 30);
  }, [routes]);
  const nearbyRestCandidates = useMemo(() => allRestCandidates.filter((candidate) => routes.some((route) => distancePointToRouteMeters([candidate.latitude, candidate.longitude], route.coordinates) <= 350)).slice(0, 30), [routes]);
  const byDisplayOrder = [...evaluated].sort((a, b) => a.id === "standard" ? -1 : b.id === "standard" ? 1 : 0);
  const selected = evaluated[0]; const difference = selected?.id === "comfort" ? 6 : 0;
  return <>
    <header className="site-header"><div className="header-inner"><div className="brand"><span className="brand-mark" aria-hidden="true">歩</span><div><p className="service-name">TOKYO PACE</p><p className="tagline">最短ではなく、最後まで歩ける道へ</p></div></div><span className="demo-badge">MVP・デモ版</span></div></header>
    <main>
      <section className="intro"><p className="eyebrow">歩くペースに合わせた経路比較</p><h1>休める場所を確認しながら、<br />無理の少ない道を選びましょう。</h1><p>新宿駅西口から東京都庁まで、休憩・トイレ・坂道の条件を比べます。トイレは公式オープンデータ、経路と休憩地点はデモ用です。現況の利用可否や安全を保証するものではありません。</p></section>
      <section className="search-panel" aria-labelledby="conditions-title"><div className="panel-title"><div><p className="step">条件 1</p><h2 id="conditions-title">歩行条件を選ぶ</h2></div><p>すべて後から変更できます</p></div>
        <form onSubmit={(event) => { event.preventDefault(); void load(draft); }}>
          <div className="locations"><label>出発地<select value="shinjuku-west" disabled><option value="shinjuku-west">新宿駅 西口</option></select></label><span aria-hidden="true">→</span><label>目的地<select value="tocho" disabled><option value="tocho">東京都庁</option></select></label></div>
          <fieldset><legend>休まずに歩ける時間</legend><div className="segments">{([5,10,15] as const).map((minutes) => <label key={minutes}><input type="radio" name="minutes" checked={draft.maxContinuousWalkingMinutes === minutes} onChange={() => setDraft({ ...draft, maxContinuousWalkingMinutes: minutes })} /><span>{minutes}分</span></label>)}</div></fieldset>
          <fieldset><legend>希望する条件</legend><div className="checks">{[["requireToilet","ルートから推定250m以内に公衆トイレ候補を希望する"],["avoidSteepSlopes","急な坂を避ける"],["preferIndoorRest","屋内休憩場所を優先する"]].map(([key,label]) => <label key={key}><input type="checkbox" checked={draft[key as keyof RoutePreferences] as boolean} onChange={(e) => setDraft({ ...draft, [key]: e.target.checked })} /><span>{label}</span></label>)}</div></fieldset>
          <button className="search-button" type="submit" disabled={loading}>{loading ? "経路を計算中…" : "安心ルートを検索"}</button>
        </form>
      </section>
      {error && <div className="error" role="alert"><strong>読み込みに失敗しました。</strong><p>{error}</p><button onClick={() => void load()}>もう一度試す</button></div>}
      {loading && <div className="loading" role="status">デモ用経路を読み込んでいます…</div>}
      {!loading && !error && selected && <>
        <section className="result-summary" aria-live="polite"><p className="step">条件 2</p><h2>比較結果</h2><p>{selected.id === "comfort" ? `通常ルートより${difference}分長くなりますが、約7分ごとに推定休憩候補があり、ルート周辺に公式掲載のトイレ候補があります。利用可否や実際の徒歩距離は別途確認が必要です。` : "現在の条件では、所要時間の短い通常ルートが選ばれました。条件を厳しくすると結果が変わります。"}</p><span>プロトタイプ計算結果</span></section>
        <div className="cards">{byDisplayOrder.map((route) => <RouteCard key={route.id} route={route} recommended={route.id === selected.id} />)}</div>
        <RouteMap routes={byDisplayOrder} spots={restSpots} restCandidates={nearbyRestCandidates} officialToiletPlaces={nearbyOfficialToiletPlaces} highlightedRouteId={selected.id} />
        <section className="spot-list" aria-labelledby="spots-title"><p className="eyebrow">地図を使わない確認</p><h2 id="spots-title">休憩・トイレ候補一覧</h2><div className="spot-grid">{restSpots.map((spot) => <article key={spot.id}><h3>{spot.name}</h3><p>{spot.category === "toilet" ? "トイレ候補" : "休憩候補"}・{spot.indoor === null ? "屋内情報は不明" : spot.indoor ? "屋内" : "屋外"}</p><p>営業時間：{spot.openingHours ?? "不明"}</p><small>{spot.source.datasetName}／確認状況：推定</small></article>)}</div></section>
        <section className="data-sources" aria-labelledby="sources-title"><p className="eyebrow">データ出典</p><h2 id="sources-title">公式施設情報の出典</h2><ul><li><a href="https://catalog.data.metro.tokyo.lg.jp/dataset/t131041d0000000123">新宿区公衆トイレ一覧</a>（新宿区、CC BY）</li><li><a href="https://catalog.data.metro.tokyo.lg.jp/dataset/t000054d0000000342">公共施設等・鉄道駅の車椅子使用者対応トイレ</a>（東京都福祉局、CC BY）</li><li><a href="https://catalog.data.metro.tokyo.lg.jp/dataset/t000019d0000000003">Tokyowater Drinking Station</a>（東京都水道局、CC BY）</li><li><a href="https://catalog.data.metro.tokyo.lg.jp/dataset/t000029d0000000003">だれでも東京</a>、<a href="https://catalog.data.metro.tokyo.lg.jp/dataset/t131041d0000000113">新宿区公共施設情報</a>（CC BY）</li></ul><p>取得日：{latestOpenDataRetrievedAt ? new Date(latestOpenDataRetrievedAt).toLocaleDateString("ja-JP") : "不明"}。公共施設が自由に休憩可能とは限らず、営業時間、入館条件、座席の空きは保証しません。給水地点に座席があるとも限りません。距離は推定直線距離またはデモ総距離へ正規化したルート沿い距離で、実際の徒歩経路や安全性を保証しません。追加休憩地点は都市設備検討用の理論上の配置候補です。</p></section>
      </>}
    </main>
    <footer><strong>TOKYO PACE</strong><p>本サービスは経路の安全性や設備の利用可否を保証するものではありません。現地の案内をご確認ください。</p></footer>
  </>;
}
