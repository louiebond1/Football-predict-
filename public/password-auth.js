import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const INVITE_KEY = 'kp-pending-invite-v1';
let client = null;
let config = null;
let busy = false;
let mode = 'login';
let legacyPasswordMode = false;

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
  ['#kpPasswordSubmit','#kpAuthLoginTab','#kpAuthRegisterTab','#kpUseOldPassword'].forEach(selector => {
    const el = document.querySelector(selector);
    if (el) el.disabled = value;
  });
}
function configureSecretField() {
  const field = document.querySelector('#authPassword');
  const label = document.querySelector('#kpSecretLabel');
  const oldToggle = document.querySelector('#kpUseOldPassword');
  if (!field || !label) return;
  const registering = mode === 'register';
  const pinMode = registering || !legacyPasswordMode;

  label.textContent = registering ? 'Choose a 6-digit PIN' : (pinMode ? '6-digit PIN' : 'Old password');
  field.value = '';
  field.placeholder = pinMode ? '••••••' : 'Your old password';
  field.autocomplete = registering ? 'new-password' : 'current-password';
  field.inputMode = pinMode ? 'numeric' : 'text';
  field.maxLength = pinMode ? 6 : 128;
  if (pinMode) {
    field.setAttribute('pattern', '[0-9]*');
  } else {
    field.removeAttribute('pattern');
  }
  if (oldToggle) {
    oldToggle.hidden = registering;
    oldToggle.textContent = legacyPasswordMode ? 'Use PIN instead' : 'Use old password';
  }
}
function renderMode() {
  const invite = inviteCode();
  const isRegister = mode === 'register';
  if (isRegister) legacyPasswordMode = false;
  document.querySelector('#kpAuthLoginTab')?.classList.toggle('active', !isRegister);
  document.querySelector('#kpAuthRegisterTab')?.classList.toggle('active', isRegister);

  const displayField = document.querySelector('#kpAuthDisplayField');
  if (displayField) displayField.hidden = !isRegister;
  configureSecretField();

  const submit = document.querySelector('#kpPasswordSubmit');
  const hint = document.querySelector('#kpAuthHint');
  const title = document.querySelector('.hero h1');
  const sub = document.querySelector('.hero .hero-sub');

  if (submit) submit.textContent = isRegister
    ? (invite ? 'Create Account & Join' : 'Create Account')
    : (invite ? 'Log In & Join' : 'Log In');

  if (hint) hint.textContent = isRegister
    ? (invite
      ? 'Choose any 6 digits you’ll remember. Your invite joins you automatically.'
      : 'Choose any 6 digits you’ll remember. You can create or join a group next.')
    : (legacyPasswordMode
      ? 'Older accounts can use their original password once, then switch to a PIN from Account.'
      : invite
        ? 'Enter your PIN and you’ll join this group automatically.'
        : 'Your PIN is only needed when this device is not already signed in.');

  if (title) title.textContent = isRegister ? 'Create your KickPot account.' : 'Welcome back.';
  if (sub) sub.textContent = isRegister
    ? 'Sign up with your email and a simple 6-digit PIN.'
    : 'Log in with your email and PIN.';
}
function ensurePasswordUI() {
  const email = document.querySelector('#authEmail');
  const card = email?.closest('.card');
  if (!email || !card || card.dataset.kpPasswordAuth === '1') return;
  const currentEmail = email.value || '';
  const invite = inviteCode();
  mode = invite ? 'register' : 'login';
  legacyPasswordMode = false;
  card.dataset.kpPasswordAuth = '1';
  card.classList.add('kp-auth-card');
  card.innerHTML = `
    <div class="kp-auth-tabs" role="tablist" aria-label="KickPot account">
      <button type="button" id="kpAuthLoginTab" role="tab">Log in</button>
      <button type="button" id="kpAuthRegisterTab" role="tab">Sign up</button>
    </div>
    <label class="kp-auth-field" id="kpAuthDisplayField" hidden><span>Display name</span><input class="scorer-select" id="authDisplayName" type="text" autocomplete="nickname" maxlength="40" placeholder="What your friends will see"></label>
    <label class="kp-auth-field"><span>Email</span><input class="scorer-select" id="authEmail" type="email" autocomplete="email" placeholder="you@email.com" value="${currentEmail.replace(/&/g,'&amp;').replace(/"/g,'&quot;')}"></label>
    <label class="kp-auth-field"><span id="kpSecretLabel">6-digit PIN</span><input class="scorer-select kp-pin-input" id="authPassword" type="password" inputmode="numeric" autocomplete="current-password" maxlength="6" pattern="[0-9]*" placeholder="••••••"></label>
    <button type="button" class="kp-auth-fallback kp-old-password-toggle" id="kpUseOldPassword">Use old password</button>
    <div class="kp-auth-hint" id="kpAuthHint"></div>
    <button type="button" class="primary" id="kpPasswordSubmit"></button>
    <div id="authStatus"></div>
    <button type="button" class="kp-auth-fallback" id="kpShowMagic">I used the old email-link login</button>
    <div class="kp-auth-magic" id="kpMagicPanel" hidden>
      <p>Use this only if your older KickPot account has never had a PIN or password set. Email sending may be temporarily limited.</p>
      <button type="button" class="secondary" id="sendLinkBtn">Send one-time sign-in link</button>
    </div>`;
  renderMode();
}
async function edgeAuth(action, email, password, invite, displayName = '') {
  config = config || await fetch('/api/config', { cache:'no-store' }).then(r => r.json()).catch(() => null);
  if (!config?.supabaseUrl) throw new Error('KickPot authentication is unavailable.');
  const endpoint = `${config.supabaseUrl}/functions/v1/invite-password-auth`;
  const response = await fetch(endpoint, {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body:JSON.stringify({ action, email, password, inviteCode:invite || '', displayName }),
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
  const secret = document.querySelector('#authPassword')?.value || '';
  const displayName = document.querySelector('#authDisplayName')?.value?.trim() || '';
  const invite = inviteCode();
  if (!/^\S+@\S+\.\S+$/.test(email)) return authStatus('error', 'Enter a valid email address.');
  if (mode === 'register' && !displayName) return authStatus('error', 'Choose a display name.');
  if (mode === 'register' && displayName.length > 40) return authStatus('error', 'Display name must be 40 characters or fewer.');
  if (mode === 'register' && !/^\d{6}$/.test(secret)) return authStatus('error', 'Choose exactly 6 digits for your PIN.');
  if (mode === 'login' && !legacyPasswordMode && !/^\d{6}$/.test(secret)) return authStatus('error', 'Enter your 6-digit PIN.');
  if (mode === 'login' && legacyPasswordMode && secret.length < 10) return authStatus('error', 'Enter your old password.');

  setBusy(true);
  authStatus('', mode === 'register' ? 'Creating your KickPot account…' : 'Signing you in…');
  try {
    const result = await edgeAuth(mode === 'register' ? 'register' : 'login', email, secret, invite, displayName);
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
    authStatus('success', mode === 'register'
      ? (invite ? 'Account created — welcome to the group ✓' : 'Account created ✓')
      : 'Signed in ✓');
  } catch (error) {
    authStatus('error', error?.message || 'KickPot could not sign you in.');
    if (error?.code === 'account_exists' || error?.code === 'existing_magic_account') {
      mode = 'login';
      legacyPasswordMode = true;
      renderMode();
    }
  } finally {
    setBusy(false);
  }
}

document.addEventListener('click', event => {
  if (event.target.closest('#kpAuthLoginTab')) { mode = 'login'; legacyPasswordMode = false; renderMode(); return; }
  if (event.target.closest('#kpAuthRegisterTab')) { mode = 'register'; legacyPasswordMode = false; renderMode(); return; }
  if (event.target.closest('#kpUseOldPassword')) { legacyPasswordMode = !legacyPasswordMode; renderMode(); return; }
  if (event.target.closest('#kpPasswordSubmit')) { submitPassword(); return; }
  if (event.target.closest('#kpShowMagic')) {
    const panel = document.querySelector('#kpMagicPanel');
    if (panel) panel.hidden = !panel.hidden;
  }
});
document.addEventListener('input', event => {
  if (event.target?.id === 'authPassword' && !legacyPasswordMode) {
    event.target.value = event.target.value.replace(/\D/g, '').slice(0, 6);
  }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Enter' && document.querySelector('#authPassword') && ['authPassword','authEmail','authDisplayName'].includes(event.target?.id)) submitPassword();
});

setInterval(ensurePasswordUI, 350);
setTimeout(ensurePasswordUI, 50);
