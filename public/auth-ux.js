import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const COOLDOWN_KEY = 'kp-auth-send-until-v1';
const PAIR_KEY = 'kp-pwa-auth-pair-v1';
const COOLDOWN_MS = 60_000;
let client = null;
let sending = false;
let pairPolling = false;
let pairAuthorizing = false;

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

async function getClient() {
  if (client) return client;
  const cfg = await fetch('/api/config', { cache: 'no-store' }).then(r => r.json()).catch(() => null);
  if (!cfg?.supabaseConfigured) return null;
  client = createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
  return client;
}

function cooldownUntil() {
  return Math.max(0, Number(localStorage.getItem(COOLDOWN_KEY) || 0));
}
function setCooldown(ms = COOLDOWN_MS) {
  localStorage.setItem(COOLDOWN_KEY, String(Date.now() + ms));
}
function readPair() {
  try {
    const pair = JSON.parse(localStorage.getItem(PAIR_KEY) || 'null');
    if (!pair?.id || !pair?.expiresAt || pair.expiresAt <= Date.now()) {
      localStorage.removeItem(PAIR_KEY);
      return null;
    }
    return pair;
  } catch {
    localStorage.removeItem(PAIR_KEY);
    return null;
  }
}
function savePair(pairId, expiresIn = 600) {
  const pair = { id: pairId, expiresAt: Date.now() + Math.max(60, Number(expiresIn) || 600) * 1000 };
  localStorage.setItem(PAIR_KEY, JSON.stringify(pair));
  return pair;
}
async function createPair() {
  const r = await fetch('/api/auth/pair/start', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:'{}', cache:'no-store' });
  if (!r.ok) throw new Error('Could not prepare app sign-in');
  const data = await r.json();
  if (!data?.pairId) throw new Error('Could not prepare app sign-in');
  return savePair(data.pairId, data.expiresIn);
}

function statusEl() { return document.querySelector('#authStatus'); }
function setStatus(kind, message) {
  const el = statusEl();
  if (!el) return;
  el.className = `status ${kind}`;
  el.textContent = message;
}

function updateButton() {
  const btn = document.querySelector('#sendLinkBtn');
  if (!btn) return;

  const sub = document.querySelector('#authEmail')?.closest('.card')?.previousElementSibling?.querySelector('.hero-sub');
  if (sub && !sub.dataset.kpAuthCopy) {
    sub.dataset.kpAuthCopy = '1';
    sub.textContent = isStandalone()
      ? 'Sign in once on this iPhone — KickPot keeps you logged in.'
      : 'Sign in securely with email. Your session stays remembered on this device.';
  }

  if (sending) {
    btn.disabled = true;
    btn.textContent = 'Sending…';
    return;
  }

  const left = cooldownUntil() - Date.now();
  if (left > 0) {
    btn.disabled = true;
    btn.textContent = `Resend in ${Math.ceil(left / 1000)}s`;
  } else {
    btn.disabled = false;
    btn.textContent = 'Send Sign-In Link';
  }
}

function friendlyAuthError(error) {
  const message = String(error?.message || '');
  const code = String(error?.code || '');
  const waitMatch = message.match(/after\s+(\d+)\s+seconds?/i);

  if (waitMatch) {
    const seconds = Math.max(1, Number(waitMatch[1]) || 60);
    setCooldown(seconds * 1000);
    return `A sign-in link was just requested. Try again in ${seconds} seconds.`;
  }

  if (code === 'over_email_send_rate_limit' || /email rate limit exceeded/i.test(message) || error?.status === 429) {
    setCooldown(COOLDOWN_MS);
    return 'Sign-in emails are temporarily busy. Please try again in a little while.';
  }

  if (/failed to fetch|network/i.test(message)) return 'Couldn’t reach KickPot. Check your connection and try again.';
  return 'We couldn’t send the sign-in link. Please try again.';
}

async function pollPair() {
  if (!isStandalone() || pairPolling) return;
  const pair = readPair();
  if (!pair) return;
  pairPolling = true;
  try {
    const r = await fetch(`/api/auth/pair/status?id=${encodeURIComponent(pair.id)}`, { cache:'no-store' });
    if (r.status === 404) {
      localStorage.removeItem(PAIR_KEY);
      return;
    }
    if (!r.ok) return;
    const data = await r.json();
    if (!data?.ready) return;
    const sb = await getClient();
    if (!sb) return;
    const { error } = await sb.auth.setSession({ access_token:data.accessToken, refresh_token:data.refreshToken });
    if (error) {
      setStatus('error', 'KickPot received your sign-in, but could not save it. Please try once more.');
      return;
    }
    localStorage.removeItem(PAIR_KEY);
    location.reload();
  } catch {} finally {
    pairPolling = false;
  }
}

function showPairNotice() {
  if (document.querySelector('#kpPairNotice')) return;
  const notice = document.createElement('div');
  notice.id = 'kpPairNotice';
  notice.style.cssText = 'position:fixed;left:16px;right:16px;top:calc(env(safe-area-inset-top) + 14px);z-index:10000;padding:14px 16px;border-radius:14px;background:#111a2d;color:#fff;border:1px solid rgba(155,92,255,.45);font:700 14px/1.35 system-ui,-apple-system,sans-serif;box-shadow:0 18px 50px rgba(0,0,0,.35)';
  notice.textContent = 'KickPot connected ✓ Return to the Home Screen app — it will finish signing you in automatically.';
  document.body.append(notice);
}

async function authorizePairFromUrl() {
  if (pairAuthorizing) return;
  let pairId = '';
  try { pairId = new URL(location.href).searchParams.get('kp_pair') || ''; } catch {}
  if (!pairId) return;
  pairAuthorizing = true;
  try {
    const sb = await getClient();
    if (!sb) return;
    let session = null;
    for (let i = 0; i < 20 && !session; i++) {
      const result = await sb.auth.getSession();
      session = result.data?.session || null;
      if (!session) await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (!session?.access_token || !session?.refresh_token) return;
    const r = await fetch('/api/auth/pair/authorize', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      cache:'no-store',
      body:JSON.stringify({ pairId, accessToken:session.access_token, refreshToken:session.refresh_token })
    });
    if (!r.ok) return;
    try {
      const url = new URL(location.href);
      url.searchParams.delete('kp_pair');
      history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
    } catch {}
    showPairNotice();
  } catch {} finally {
    pairAuthorizing = false;
  }
}

// Intercept the core button before app.js's target listener fires. This keeps
// auth request throttling and PWA pairing in one place without changing app state.
document.addEventListener('click', async event => {
  const btn = event.target.closest('#sendLinkBtn');
  if (!btn) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  if (sending || cooldownUntil() > Date.now()) {
    updateButton();
    return;
  }

  const input = document.querySelector('#authEmail');
  const email = input?.value?.trim().toLowerCase() || '';
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    setStatus('error', 'Enter a valid email address.');
    input?.focus();
    return;
  }

  const sb = await getClient();
  if (!sb) {
    setStatus('error', 'KickPot sign-in is temporarily unavailable.');
    return;
  }

  sending = true;
  updateButton();
  setStatus('', 'Preparing your secure sign-in…');

  try {
    let redirectTo = location.origin;
    if (isStandalone()) {
      const pair = await createPair();
      const redirect = new URL('/', location.origin);
      redirect.searchParams.set('kp_pair', pair.id);
      redirectTo = redirect.toString();
    }

    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
    if (error) {
      setStatus('error', friendlyAuthError(error));
      return;
    }

    setCooldown(COOLDOWN_MS);
    setStatus('success', isStandalone()
      ? `✓ Link sent to ${email}. Tap it, then return here — KickPot will finish signing you in.`
      : `✓ Link sent to ${email}. Check your inbox.`);
  } catch (error) {
    setStatus('error', friendlyAuthError(error));
  } finally {
    sending = false;
    updateButton();
  }
}, true);

window.addEventListener('pageshow', () => { updateButton(); pollPair(); authorizePairFromUrl(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) pollPair(); });
document.addEventListener('input', event => { if (event.target?.id === 'authEmail') updateButton(); });
setInterval(() => { updateButton(); pollPair(); }, 1500);
setTimeout(() => { updateButton(); pollPair(); authorizePairFromUrl(); }, 100);
