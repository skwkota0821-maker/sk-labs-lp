import type { Config, Context } from '@netlify/functions';
import { getUser } from '@netlify/identity';

const CLIENT_EVENT_ALLOWLIST = new Set([
  'content.viewed',
  'cta.clicked',
  'adult.external_link_clicked',
]);

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

async function coreRequest(path: string, init: RequestInit = {}) {
  const base = Netlify.env.get('HARNESS_CORE_API_URL');
  const apiKey = Netlify.env.get('HARNESS_CORE_API_KEY');
  if (!base || !apiKey) return { ok: false, status: 503, body: { error: 'core_not_configured' } };

  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  headers.set('authorization', `Bearer ${apiKey}`);

  const response = await fetch(`${base.replace(/\/$/, '')}${path}`, { ...init, headers });
  let body: unknown = null;
  try { body = await response.json(); } catch { body = { status: response.status }; }
  return { ok: response.ok, status: response.status, body };
}

async function ensureMember(user: Awaited<ReturnType<typeof getUser>>) {
  if (!user) return null;

  const identityPath = `/v1/identities/web/${encodeURIComponent(user.id)}`;
  const resolved = await coreRequest(identityPath, { method: 'GET' });
  if (resolved.ok) {
    const memberId = (resolved.body as { member_id?: string })?.member_id;
    if (!memberId) return { ok: false, status: 502, body: { error: 'member_id_missing' } };
    return { ok: true, status: 200, body: { member_id: memberId } };
  }
  if (resolved.status !== 404) return resolved;

  const created = await coreRequest('/v1/members', {
    method: 'POST',
    body: JSON.stringify({ email: user.email ?? null, source: 'web' }),
  });
  if (!created.ok) return created;

  const memberId = (created.body as { member_id?: string })?.member_id;
  if (!memberId) return { ok: false, status: 502, body: { error: 'member_id_missing' } };

  const linked = await coreRequest(`/v1/members/${encodeURIComponent(memberId)}/identities`, {
    method: 'POST',
    body: JSON.stringify({ provider: 'web', external_id: user.id }),
  });
  if (!linked.ok) return linked;

  return { ok: true, status: 200, body: { member_id: memberId } };
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
    const input = await req.json().catch(() => ({})) as {
      event_name?: string;
      idempotency_key?: string;
      payload?: Record<string, unknown>;
    };
    if (!input.event_name) return json({ error: 'event_name_required' }, 400);
    if (!CLIENT_EVENT_ALLOWLIST.has(input.event_name)) return json({ error: 'event_not_allowed' }, 403);

    const idempotencyKey = input.idempotency_key?.trim() || crypto.randomUUID();
    const recorded = await coreRequest('/v1/events/client', {
      method: 'POST',
      body: JSON.stringify({
        member_id: memberId,
        event_name: input.event_name,
        source: 'web',
        occurred_at: new Date().toISOString(),
        event_version: 1,
        idempotency_key: idempotencyKey,
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
