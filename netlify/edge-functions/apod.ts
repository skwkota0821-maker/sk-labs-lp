/* 今日の宇宙写真（NASA APOD）をサーバー側で取得し、CDNで1時間キャッシュする。
 * ブラウザから DEMO_KEY で直接呼ぶと共有レート制限で失敗しやすいため、
 * 本番ではこの関数経由で取得する。NASA_API_KEY が設定されていれば優先して使う。
 * 取得できない場合は 502 を返し、画面側は「未取得」と表示する（サンプル値は返さない）。
 */

type Apod = {
  title?: string;
  date?: string;
  url?: string;
  hdurl?: string;
  media_type?: string;
  thumbnail_url?: string;
  copyright?: string;
};

export function jstDateString(offsetDays: number, now = new Date()): string {
  const jst = new Date(now.getTime() + 9 * 3600 * 1000 - offsetDays * 86400 * 1000);
  return jst.toISOString().slice(0, 10);
}

export function toPayload(d: Apod) {
  const image = d.media_type === "image" ? d.url : d.thumbnail_url;
  if (!d.title || !d.date || !image) return null;
  const [y, m, day] = d.date.split("-");
  return {
    title: d.title,
    date: d.date,
    image,
    mediaType: d.media_type,
    copyright: d.copyright ? d.copyright.trim() : "",
    pageUrl: `https://apod.nasa.gov/apod/ap${y.slice(2)}${m}${day}.html`,
  };
}

async function fetchApod(key: string, date?: string) {
  const u = new URL("https://api.nasa.gov/planetary/apod");
  u.searchParams.set("api_key", key);
  u.searchParams.set("thumbs", "true");
  if (date) u.searchParams.set("date", date);
  const res = await fetch(u, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`APOD ${res.status}`);
  return toPayload(await res.json());
}

export default async () => {
  const key = Netlify.env.get("NASA_API_KEY") || "DEMO_KEY";
  // 当日分が未公開・一時エラーの場合は前日分へフォールバック（実データのみ）
  for (const date of [undefined, jstDateString(1)]) {
    try {
      const payload = await fetchApod(key, date);
      if (payload) {
        return Response.json(payload, {
          headers: {
            "Cache-Control": "public, max-age=600",
            "Netlify-CDN-Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
          },
        });
      }
    } catch (_e) {
      // 次の候補へ
    }
  }
  return Response.json({ error: "unavailable" }, { status: 502, headers: { "Cache-Control": "no-store" } });
};

export const config = {
  path: "/api/apod",
  cache: "manual",
};
