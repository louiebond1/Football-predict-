import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const COOLDOWN_KEY = 'kp-auth-send-until-v1';
const COOLDOWN_MS = 60_000;
let client = null;
let sending = false;

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

function statusEl() {
  return document.querySelector('#authStatus');
}

function setStatus(kind, message) {
  const el = statusEl();
  if (!el) return;
  el.className = `status ${kind}`;
  el.textContent = message;
}

function updateButton() {
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
    btn.textContent = 'Send Magic Link';
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
    // The built-in Supabase mailer also has a small project-wide hourly cap.
    // Do not expose the backend error or encourage repeated retries.
    setCooldown(COOLDOWN_MS);
    return 'Sign-in emails are temporarily busy. Please try again in a little while.';
  }

  if (/failed to fetch|network/i.test(message)) return 'Couldn’t reach KickPot. Check your connection and try again.';
  return 'We couldn’t send the sign-in link. Please try again.';
}

// Intercept the core button before app.js's target listener fires. This keeps
// auth request throttling in one place without changing the rest of app state.
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
  setStatus('', 'Sending your secure sign-in link…');

  try {
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: location.origin }
    });

    if (error) {
      setStatus('error', friendlyAuthError(error));
      return;
    }

    setCooldown(COOLDOWN_MS);
    setStatus('success', `✓ Link sent to ${email}. Check your inbox.`);
  } catch (error) {
    setStatus('error', friendlyAuthError(error));
  } finally {
    sending = false;
    updateButton();
  }
}, true);

window.addEventListener('pageshow', updateButton);
document.addEventListener('input', event => {
  if (event.target?.id === 'authEmail') updateButton();
});
setInterval(updateButton, 1000);
setTimeout(updateButton, 100);
