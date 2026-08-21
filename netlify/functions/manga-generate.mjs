export default async (req) => {
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: { 'content-type': 'application/json' } });
  const apiKey = Netlify.env.get('OPENAI_API_KEY');
  if (!apiKey) return new Response(JSON.stringify({ error: 'image_generation_not_configured' }), { status: 503, headers: { 'content-type': 'application/json' } });
  try {
    const body = await req.json();
    const prompt = String(body?.prompt || '').trim();
    if (!prompt || prompt.length > 4000) return new Response(JSON.stringify({ error: 'invalid_prompt' }), { status: 400, headers: { 'content-type': 'application/json' } });
    const r = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-image-1', prompt, size: '1024x1024', quality: 'medium', n: 1 })
    });
    const data = await r.json();
    if (!r.ok) return new Response(JSON.stringify({ error: 'provider_error', detail: data?.error?.message || 'generation_failed' }), { status: 502, headers: { 'content-type': 'application/json' } });
    const image = data?.data?.[0]?.b64_json;
    if (!image) return new Response(JSON.stringify({ error: 'empty_image' }), { status: 502, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ image: `data:image/png;base64,${image}` }), { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
};

export const config = { path: '/api/manga/generate' };