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

// /space/ の地域選択で使う府県予報区（この一覧以外は受け付けない）
export const OFFICES = new Set([
  "011000", "012000", "013000", "014030", "014100", "015000", "016000", "017000",
  "020000", "030000", "040000", "050000", "060000", "070000", "080000", "090000", "100000",
  "110000", "120000", "130000", "140000", "150000", "160000", "170000", "180000", "190000",
  "200000", "210000", "220000", "230000", "240000", "250000", "260000", "270000", "280000",
  "290000", "300000", "310000", "320000", "330000", "340000", "350000", "360000", "370000",
  "380000", "390000", "400000", "410000", "420000", "430000", "440000", "450000", "460100",
  "460040", "471000", "472000", "473000", "474000",
]);

export function summarizeOffice(data: JmaForecast, now = new Date()) {
  const areas = (Array.isArray(data) ? data[0]?.timeSeries?.[0]?.areas : []) || [];
  return areas
    .map((a) => a.area?.code ? summarize({ id: a.area.code, name: a.area.name || "", office: "", area: a.area.code }, data, now) : null)
    .filter(Boolean);
}

async function loadOffice(office: string) {
  const res = await fetch(`https://www.jma.go.jp/bosai/forecast/data/forecast/${office}.json`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`JMA ${res.status}`);
  const data: JmaForecast = await res.json();
  return { reportDatetime: data?.[0]?.reportDatetime || "", areas: summarizeOffice(data) };
}

const CACHE_OK = {
  "Cache-Control": "public, max-age=300",
  "Netlify-CDN-Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
};

export default async (req: Request) => {
  const office = new URL(req.url).searchParams.get("office");
  if (office !== null) {
    if (!OFFICES.has(office)) {
      return Response.json({ error: "unknown office" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    try {
      const body = await loadOffice(office);
      if (!body.areas.length) throw new Error("empty");
      return Response.json({ source: "気象庁", office, ...body }, { headers: { ...CACHE_OK, "Netlify-Vary": "query=office" } });
    } catch (_e) {
      return Response.json({ error: "unavailable" }, { status: 502, headers: { "Cache-Control": "no-store" } });
    }
  }
  const places = await Promise.all(PLACES.map(load));
  const ok = places.some(Boolean);
  return Response.json(
    { source: "気象庁", places },
    {
      status: ok ? 200 : 502,
      headers: ok ? CACHE_OK : { "Cache-Control": "no-store" },
    },
  );
};

export const config = {
  path: "/api/weather",
  cache: "manual",
};
