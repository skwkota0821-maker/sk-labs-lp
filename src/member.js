import { getUser, handleAuthCallback, login, logout, signup } from '@netlify/identity';

const $ = (id) => document.getElementById(id);
const status = $('status');
const authPanel = $('auth-panel');
const memberPanel = $('member-panel');
const adultPanel = $('adult-panel');
const adultGate = $('adult-gate');
let harnessMemberId = null;

function message(text, type = 'info') {
  status.textContent = text;
  status.dataset.type = type;
}

function adultConsentKey(user) {
  return `sklabs:adult-consent:${user.id}`;
}

function hasAdultConsent(user) {
  return localStorage.getItem(adultConsentKey(user)) === 'accepted';
}

async function harnessRequest(method = 'GET', body) {
  const response = await fetch('/api/harness/member', {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(`Harness Core ${response.status}`);
  return response.json();
}

async function syncHarnessMember() {
  try {
    const data = await harnessRequest('GET');
    harnessMemberId = data.member_id || null;
    return data;
  } catch (_) {
    harnessMemberId = null;
    return null;
  }
}

async function recordHarnessEvent(eventName, payload = {}) {
  try {
    const data = await harnessRequest('POST', { event_name: eventName, payload });
    harnessMemberId = data.member_id || harnessMemberId;
  } catch (_) {
    // Core未設定時でも認証UI自体は止めない。イベントは本番接続後に送信される。
  }
}

function render(user) {
  const loggedIn = Boolean(user);
  authPanel.hidden = loggedIn;
  memberPanel.hidden = !loggedIn;
  if (!loggedIn) {
    adultPanel.hidden = true;
    adultGate.hidden = true;
    return;
  }

  $('member-email').textContent = user.email || '会員';
  const accepted = hasAdultConsent(user);
  adultGate.hidden = accepted;
  adultPanel.hidden = !accepted;
}

async function refresh({ recordLogin = false } = {}) {
  const user = await getUser();
  render(user);
  if (user) {
    await syncHarnessMember();
    if (recordLogin) await recordHarnessEvent('member.logged_in');
  }
  return user;
}

$('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    await login(String(form.get('email')), String(form.get('password')));
    message('ログインしました。', 'success');
    await refresh({ recordLogin: true });
  } catch (error) {
    message('ログインできませんでした。入力内容をご確認ください。', 'error');
  }
});

$('signup-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const user = await signup(String(form.get('email')), String(form.get('password')), {
      full_name: String(form.get('name') || '')
    });
    message(user.emailVerified ? '会員登録が完了しました。' : '確認メールを送信しました。メール内の案内に従ってください。', 'success');
    await refresh();
    if (await getUser()) await recordHarnessEvent('member.created', { identity_provider: 'netlify' });
  } catch (error) {
    message('会員登録できませんでした。入力内容をご確認ください。', 'error');
  }
});

$('logout').addEventListener('click', async () => {
  await recordHarnessEvent('member.logged_out');
  await logout();
  harnessMemberId = null;
  message('ログアウトしました。');
  render(null);
});

$('adult-confirm').addEventListener('click', async () => {
  const user = await getUser();
  if (!user) return;
  const age = $('adult-age').checked;
  const terms = $('adult-terms').checked;
  if (!age || !terms) {
    message('18歳以上であることと注意事項への同意が必要です。', 'error');
    return;
  }
  localStorage.setItem(adultConsentKey(user), 'accepted');
  await recordHarnessEvent('adult.access_granted', { method: 'self_attestation' });
  message('成人向け外部リンク領域を表示しました。', 'success');
  render(user);
});

$('adult-reset').addEventListener('click', async () => {
  const user = await getUser();
  if (!user) return;
  localStorage.removeItem(adultConsentKey(user));
  await recordHarnessEvent('adult.access_revoked');
  message('成人向け領域への同意を解除しました。');
  render(user);
});

(async () => {
  try {
    await handleAuthCallback();
  } catch (_) {
    message('認証処理を完了できませんでした。', 'error');
  }
  await refresh();
})();
