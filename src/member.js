import { getUser, handleAuthCallback, login, logout, signup } from '@netlify/identity';

const $ = (id) => document.getElementById(id);
const status = $('status');
const authPanel = $('auth-panel');
const memberPanel = $('member-panel');
const adultPanel = $('adult-panel');
const adultGate = $('adult-gate');

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

async function refresh() {
  const user = await getUser();
  render(user);
  return user;
}

$('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    await login(String(form.get('email')), String(form.get('password')));
    message('ログインしました。', 'success');
    await refresh();
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
  } catch (error) {
    message('会員登録できませんでした。入力内容をご確認ください。', 'error');
  }
});

$('logout').addEventListener('click', async () => {
  await logout();
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
  message('成人向け外部リンク領域を表示しました。', 'success');
  render(user);
});

$('adult-reset').addEventListener('click', async () => {
  const user = await getUser();
  if (!user) return;
  localStorage.removeItem(adultConsentKey(user));
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
