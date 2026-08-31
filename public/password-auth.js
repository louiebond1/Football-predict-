import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const INVITE_KEY = 'kp-pending-invite-v1';
let client = null;
let config = null;
let busy = false;
let mode = 'login';

function cleanInvite(value = '') {
  return String(value).trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 32);
}
function inviteCode() {
  try {
    const urlCode = cleanInvite(new URL(location.href).searchParams.get('join') || '');
    if (urlCode) return urlCode;
  } catch {}
  try {
    const raw = JSON.parse(localStorage.getItem(INVITE_KEY) || 'null');
    return cleanInvite(raw?.code || '');
  } catch { return ''; }
}
async function getClient() {
  if (client) return client;
  config = config || await fetch('/api/config', { cache:'no-store' }).then(r => r.json()).catch(() => null);
  if (!config?.supabaseConfigured) return null;
  client = createClient(config.supabaseUrl, config.supabasePublishableKey);
  return client;
}
function authStatus(kind, message) {
  const el = document.querySelector('#authStatus');
  if (!el) return;
  el.className = `status ${kind || ''}`.trim();
  el.textContent = message || '';
}
function setBusy(value) {
  busy = value;
  const button = document.querySelector('#kpPasswordSubmit');
  if (button) button.disabled = value;
  const loginTab = document.querySelector('#kpAuthLoginTab');
  const registerTab = document.querySelector('#kpAuthRegisterTab');
  if (loginTab) loginTab.disabled = value;
  if (registerTab) registerTab.disabled = value;
}
function renderMode() {
  const invite = inviteCode();
  if (!invite && mode === 'register') mode = 'login';
  document.querySelector('#kpAuthLoginTab')?.classList.toggle('active', mode === 'login');
  document.querySelector('#kpAuthRegisterTab')?.classList.toggle('active', mode === 'register');
  const submit = document.querySelector('#kpPasswordSubmit');
  const hint = document.querySelector('#kpAuthHint');
  const title = document.querySelector('.hero h1');
  const sub = document.querySelector('.hero .hero-sub');
  if (submit) submit.textContent = mode === 'register' ? 'Create Account & Join' : (invite ? 'Log In & Join' : 'Log In');
  if (hint) hint.textContent = mode === 'register'
    ? 'Your invite authorises this signup. No verification email is sent.'
    : invite ? 'Already have KickPot? Log in and you’ll join this group automatically.' : 'Your session stays saved on this device until you sign out.';
  if (title) title.textContent = mode === 'register' ? 'Join. Predict. Compete.' : 'Welcome back.';
  if (sub) sub.textContent = mode === 'register'
    ? 'Create your account with a password — no email link needed.'
    : 'Log in with your email and password.';
}
function ensurePasswordUI() {
  const email = document.querySelector('#authEmail');
  const card = email?.closest('.card');
  if (!email || !card || card.dataset.kpPasswordAuth === '1') return;
  const currentEmail = email.value || '';
  const invite = inviteCode();
  mode = invite ? 'register' : 'login';
  card.dataset.kpPasswordAuth = '1';
  card.classList.add('kp-auth-card');
  card.innerHTML = `
    <div class="kp-auth-tabs">
      <button type="button" id="kpAuthLoginTab">Log in</button>
      ${invite ? '<button type="button" id="kpAuthRegisterTab">Create account</button>' : ''}
    </div>
    <label class="kp-auth-field"><span>Email</span><input class="scorer-select" id="authEmail" type="email" autocomplete="email" placeholder="you@email.com" value="${currentEmail.replace(/&/g,'&amp;').replace(/"/g,'&quot;')}"></label>
    <label class="kp-auth-field"><span>Password</span><input class="scorer-select" id="authPassword" type="password" autocomplete="${invite ? 'new-password' : 'current-password'}" placeholder="10+ characters"></label>
    <div class="kp-auth-hint" id="kpAuthHint"></div>
    <button type="button" class="primary" id="kpPasswordSubmit"></button>
    <div id="authStatus"></div>
    <button type="button" class="kp-auth-fallback" id="kpShowMagic">I used the old email-link login</button>
    <div class="kp-auth-magic" id="kpMagicPanel" hidden>
      <p>Use this only if your older KickPot account does not have a password yet. Email sending may be temporarily limited.</p>
      <button type="button" class="secondary" id="sendLinkBtn">Send one-time sign-in link</button>
    </div>`;
  renderMode();
}
async function edgeAuth(action, email, password, invite) {
  config = config || await fetch('/api/config', { cache:'no-store' }).then(r => r.json()).catch(() => null);
  if (!config?.supabaseUrl) throw new Error('KickPot authentication is unavailable.');
  const endpoint = `${config.supabaseUrl}/functions/v1/invite-password-auth`;
  const response = await fetch(endpoint, {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body:JSON.stringify({ action, email, password, inviteCode:invite || '' }),
    cache:'no-store'
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'KickPot could not sign you in.');
    error.code = data.code || '';
    throw error;
  }
  return data;
}
async function submitPassword() {
  if (busy) return;
  const email = document.querySelector('#authEmail')?.value?.trim().toLowerCase() || '';
  const password = document.querySelector('#authPassword')?.value || '';
  const invite = inviteCode();
  if (!/^\S+@\S+\.\S+$/.test(email)) return authStatus('error', 'Enter a valid email address.');
  if (password.length < 10) return authStatus('error', 'Password must be at least 10 characters.');
  if (mode === 'register' && !invite) return authStatus('error', 'Open the invite link your group admin sent you.');

  setBusy(true);
  authStatus('', mode === 'register' ? 'Creating your KickPot account…' : 'Signing you in…');
  try {
    const result = await edgeAuth(mode === 'register' ? 'register' : 'login', email, password, invite);
    const sb = await getClient();
    if (!sb) throw new Error('KickPot authentication is unavailable.');
    const { error } = await sb.auth.setSession({ access_token: result.accessToken, refresh_token: result.refreshToken });
    if (error) throw error;
    try {
      localStorage.removeItem(INVITE_KEY);
      const url = new URL(location.href);
      if (url.searchParams.has('join')) {
        url.searchParams.delete('join');
        history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
      }
    } catch {}
    authStatus('success', mode === 'register' ? 'Account created — welcome to the group ✓' : 'Signed in ✓');
  } catch (error) {
    authStatus('error', error?.message || 'KickPot could not sign you in.');
    if (error?.code === 'account_exists' || error?.code === 'existing_magic_account') {
      mode = 'login'; renderMode();
    }
  } finally {
    setBusy(false);
  }
}

document.addEventListener('click', event => {
  if (event.target.closest('#kpAuthLoginTab')) { mode = 'login'; renderMode(); return; }
  if (event.target.closest('#kpAuthRegisterTab')) { mode = 'register'; renderMode(); return; }
  if (event.target.closest('#kpPasswordSubmit')) { submitPassword(); return; }
  if (event.target.closest('#kpShowMagic')) {
    const panel = document.querySelector('#kpMagicPanel');
    if (panel) panel.hidden = !panel.hidden;
  }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Enter' && document.querySelector('#authPassword') && (event.target?.id === 'authPassword' || event.target?.id === 'authEmail')) submitPassword();
});

setInterval(ensurePasswordUI, 350);
setTimeout(ensurePasswordUI, 50);
