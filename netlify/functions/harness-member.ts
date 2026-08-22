import type { Config, Context } from '@netlify/functions';
import { getUser } from '@netlify/identity';

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

async function coreRequest(path: string, init: RequestInit = {}) {
  const base = Netlify.env.get('HARNESS_CORE_API_URL');
  const apiKey = Netlify.env.get('HARNESS_CORE_API_KEY');
  if (!base) return { ok: false, status: 503, body: { error: 'core_not_configured' } };

  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  if (apiKey) headers.set('authorization', `Bearer ${apiKey}`);

  const response = await fetch(`${base.replace(/\/$/, '')}${path}`, { ...init, headers });
  let body: unknown = null;
  try { body = await response.json(); } catch { body = { status: response.status }; }
  return { ok: response.ok, status: response.status, body };
}

async function ensureMember(user: Awaited<ReturnType<typeof getUser>>) {
  if (!user) return null;

  const created = await coreRequest('/v1/members', {
    method: 'POST',
    body: JSON.stringify({ email: user.email ?? null, source: 'web' }),
  });

  if (!created.ok && created.status !== 409) return created;

  const member = (created.body as { member_id?: string })?.member_id;
  if (!member && created.status === 409) {
    return { ok: false, status: 409, body: { error: 'member_lookup_required' } };
  }
  if (!member) return { ok: false, status: 502, body: { error: 'member_id_missing' } };

  const linked = await coreRequest(`/v1/members/${encodeURIComponent(member)}/identities`, {
    method: 'POST',
    body: JSON.stringify({ provider: 'web', external_id: user.id }),
  });

  if (!linked.ok && linked.status !== 409) return linked;
  return { ok: true, status: 200, body: { member_id: member } };
}

export default async (req: Request, _context: Context) => {
  const user = await getUser();
  if (!user) return json({ error: 'unauthorized' }, 401);

  const ensured = await ensureMember(user);
  if (!ensured?.ok) return json(ensured?.body ?? { error: 'member_sync_failed' }, ensured?.status ?? 500);
  const memberId = (ensured.body as { member_id: string }).member_id;

  if (req.method === 'GET') {
    const entitlements = await coreRequest(`/v1/members/${encodeURIComponent(memberId)}/entitlements`);
    return json({ member_id: memberId, entitlements: entitlements.ok ? entitlements.body : [] }, entitlements.ok ? 200 : entitlements.status);
  }

  if (req.method === 'POST') {
    const input = await req.json().catch(() => ({})) as { event_name?: string; payload?: Record<string, unknown> };
    if (!input.event_name) return json({ error: 'event_name_required' }, 400);

    const recorded = await coreRequest('/v1/events', {
      method: 'POST',
      body: JSON.stringify({
        member_id: memberId,
        event_name: input.event_name,
        source: 'web',
        occurred_at: new Date().toISOString(),
        payload: input.payload ?? {},
      }),
    });
    return json({ member_id: memberId, event: recorded.body }, recorded.ok ? 202 : recorded.status);
  }

  return json({ error: 'method_not_allowed' }, 405);
};

export const config: Config = {
  path: '/api/harness/member',
};
