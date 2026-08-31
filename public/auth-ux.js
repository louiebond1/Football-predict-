import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const COOLDOWN_KEY = 'kp-auth-send-until-v2';
const COOLDOWN_MS = 60_000;
let client = null;
let sending = false;

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

async function getClient() {
  if (client) return client;
  const cfg = await fetch('/api/config', { cache:'no-store' }).then(r => r.json()).catch(() => null);
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
function statusEl() { return document.querySelector('#authStatus'); }
function setStatus(kind, message) {
  const el = statusEl();
  if (!el) return;
  el.className = `status ${kind || ''}`.trim();
  el.textContent = message || '';
}

function updateFallbackCopy() {
  const fallback = document.querySelector('#kpShowMagic');
  if (!fallback || fallback.dataset.kpCopy === '1') return;
  fallback.dataset.kpCopy = '1';
  fallback.textContent = isStandalone() ? 'Older account? Use one-time email fallback' : 'I used the old email-link login';
}

function updateButton() {
  updateFallbackCopy();
  const btn = document.querySelector('#sendLinkBtn');
  if (!btn) return;
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
    btn.textContent = 'Send one-time sign-in link';
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
    return 'Email fallback is temporarily busy. Use your password instead.';
  }
  if (/failed to fetch|network/i.test(message)) return 'Couldn’t reach KickPot. Check your connection and try again.';
  return 'We couldn’t send the one-time link. Use your password if you have one.';
}

// Magic links are now a legacy fallback only. Crucially, there is no longer a
// Safari -> installed-PWA token handoff: that copied/rotated refresh tokens
// between browser contexts and was the source of refresh_token_already_used.
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
  if (!sb) return setStatus('error', 'KickPot sign-in is temporarily unavailable.');

  sending = true;
  updateButton();
  setStatus('', 'Sending one-time link…');
  try {
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { shouldCreateUser:false, emailRedirectTo:location.origin }
    });
    if (error) {
      setStatus('error', friendlyAuthError(error));
      return;
    }
    setCooldown(COOLDOWN_MS);
    setStatus('success', isStandalone()
      ? `✓ Link sent to ${email}. It may open Safari; password login is the recommended Home Screen sign-in.`
      : `✓ Check ${email} for the one-time sign-in link.`);
  } catch (error) {
    setStatus('error', friendlyAuthError(error));
  } finally {
    sending = false;
    updateButton();
  }
}, true);

document.addEventListener('input', event => { if (event.target?.id === 'authEmail') updateButton(); });
window.addEventListener('pageshow', updateButton);
setInterval(updateButton, 1000);
setTimeout(updateButton, 100);
