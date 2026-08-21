const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type'
  }
});

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' } });

  const apiKey = Netlify.env.get('OPENAI_API_KEY');
  const model = Netlify.env.get('MANGA_IMAGE_MODEL') || 'gpt-image-1';

  if (req.method === 'GET') {
    return json({ ok: true, configured: Boolean(apiKey), model });
  }

  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!apiKey) return json({ error: 'image_generation_not_configured' }, 503);

  try {
    const body = await req.json();
    const prompt = String(body?.prompt || '').trim();
    const size = ['1024x1024', '1024x1536', '1536x1024'].includes(body?.size) ? body.size : '1024x1024';

    if (!prompt || prompt.length > 4000) return json({ error: 'invalid_prompt' }, 400);

    const r = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, size, quality: 'medium', n: 1 })
    });

    const data = await r.json();
    if (!r.ok) return json({ error: 'provider_error', detail: data?.error?.message || 'generation_failed' }, 502);

    const item = data?.data?.[0] || {};
    if (item.b64_json) return json({ image: `data:image/png;base64,${item.b64_json}`, model });
    if (item.url) return json({ image: item.url, model });

    return json({ error: 'empty_image' }, 502);
  } catch {
    return json({ error: 'internal_error' }, 500);
  }
};

export const config = { path: '/api/manga/generate' };
