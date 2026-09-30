/* 天気予報・観測スポットの天気を気象庁の予報JSONから取得し、CDNで30分キャッシュする。
 * 出典：気象庁ホームページ（https://www.jma.go.jp/bosai/forecast/）
 * 取得できない地点は null を返し、画面側は「未取得」と表示する（推測値は返さない）。
 */

type Place = { id: string; name: string; office: string; area: string };

// 横浜（事業所所在地）と、国際ダークスカイ協会（DarkSky International）認定地
export const PLACES: Place[] = [
  { id: "yokohama", name: "横浜", office: "140000", area: "140010" },
  { id: "kozushima", name: "神津島（東京都）", office: "130000", area: "130020" },
  { id: "bisei", name: "井原市美星町（岡山県）", office: "330000", area: "330010" },
  { id: "yaeyama", name: "石垣島・西表島（沖縄県）", office: "474000", area: "474010" },
];

type JmaArea = { area?: { code?: string; name?: string }; weathers?: string[]; pops?: string[] };
type JmaSeries = { timeDefines?: string[]; areas?: JmaArea[] };
type JmaForecast = { reportDatetime?: string; publishingOffice?: string; timeSeries?: JmaSeries[] }[];

export function pickArea(series: JmaSeries | undefined, code: string): JmaArea | undefined {
  const areas = series?.areas || [];
  return areas.find((a) => a.area?.code === code);
}

export function summarize(place: Place, data: JmaForecast, now = new Date()) {
  const short = Array.isArray(data) ? data[0] : undefined;
  const ts = short?.timeSeries || [];
  const w = pickArea(ts[0], place.area);
  const p = pickArea(ts[1], place.area);
  if (!w || !w.weathers || !w.weathers.length) return null;
  const times = ts[1]?.timeDefines || [];
  const pops: { from: string; pop: number }[] = [];
  (p?.pops || []).forEach((v, i) => {
    const t = times[i];
    if (!t || v === "" || v == null) return;
    // 6時間区間の終了が現在より後のものだけ（これから先の区間）
    if (new Date(t).getTime() + 6 * 3600 * 1000 <= now.getTime()) return;
    pops.push({ from: t, pop: Number(v) });
  });
  return {
    id: place.id,
    name: place.name,
    area: w.area?.name || "",
    weather: w.weathers[0].replace(/[\s　]+/g, " ").trim(),
    tomorrow: (w.weathers[1] || "").replace(/[\s　]+/g, " ").trim(),
    pops: pops.slice(0, 3),
    reportDatetime: short?.reportDatetime || "",
  };
}

async function load(place: Place) {
  try {
    const res = await fetch(`https://www.jma.go.jp/bosai/forecast/data/forecast/${place.office}.json`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return summarize(place, await res.json());
  } catch (_e) {
    return null;
  }
}

export default async () => {
  const places = await Promise.all(PLACES.map(load));
  const ok = places.some(Boolean);
  return Response.json(
    { source: "気象庁", places },
    {
      status: ok ? 200 : 502,
      headers: ok
        ? {
            "Cache-Control": "public, max-age=300",
            "Netlify-CDN-Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
          }
        : { "Cache-Control": "no-store" },
    },
  );
};

export const config = {
  path: "/api/weather",
  cache: "manual",
};
