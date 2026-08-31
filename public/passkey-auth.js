import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const READY_KEY = 'kp-passkey-ready-v1';
let client = null;
let checking = false;
let lastCheck = 0;

async function getClient() {
  if (client) return client;
  if (window.__kickpotSupabase) { client = window.__kickpotSupabase; return client; }
  const cfg = await fetch('/api/config', { cache:'no-store' }).then(r => r.json()).catch(() => null);
  if (!cfg?.supabaseConfigured) return null;
  client = createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
  return client;
}

function supported() {
  return Boolean(window.PublicKeyCredential && navigator.credentials);
}

function addStyles() {
  if (document.querySelector('#kpPasskeyStyles')) return;
  const style = document.createElement('style');
  style.id = 'kpPasskeyStyles';
  style.textContent = `
    .kp-passkey-login{width:100%;min-height:50px;margin-top:10px;border:1px solid rgba(255,255,255,.13);border-radius:13px;background:rgba(255,255,255,.035);color:#fff;font:800 13px/1 system-ui,-apple-system,sans-serif}
    .kp-passkey-login:disabled{opacity:.55}
    .kp-account-passkey{margin-top:18px;padding-top:18px;border-top:1px solid rgba(148,163,184,.16);display:grid;gap:9px}
    .kp-account-passkey strong{font-size:17px;color:#f8fafc}
    .kp-account-passkey p{margin:0;color:#8f9aad;font-size:12.5px;line-height:1.45}
    .kp-account-passkey button{width:100%;border:1px solid rgba(155,92,255,.35);border-radius:13px;padding:14px 16px;background:rgba(126,75,255,.09);color:#d8c5ff;font:850 13px/1 system-ui,-apple-system,sans-serif}
    .kp-account-passkey small{min-height:16px;color:#9aa5b7;font-size:12px}
  `;
  document.head.append(style);
}

async function listPasskeys() {
  if (!supported()) return { available:false, passkeys:[] };
  const sb = await getClient();
  if (!sb?.auth?.passkey?.list) return { available:false, passkeys:[] };
  const { data, error } = await sb.auth.passkey.list();
  if (error) {
    if (String(error.code || error.message || '').includes('passkey_disabled')) return { available:false, passkeys:[] };
    return { available:false, passkeys:[] };
  }
  return { available:true, passkeys:Array.isArray(data) ? data : [] };
}

async function injectAccountPasskey() {
  if (checking || Date.now() - lastCheck < 4000) return;
  const sheet = document.querySelector('.kp-account-sheet');
  const form = sheet?.querySelector('.kp-account-form');
  if (!sheet || !form || form.querySelector('.kp-account-passkey')) return;
  checking = true;
  lastCheck = Date.now();
  try {
    const state = await listPasskeys();
    if (!state.available) return;
    addStyles();
    const block = document.createElement('div');
    block.className = 'kp-account-passkey';
    const hasPasskey = state.passkeys.length > 0;
    block.innerHTML = `<strong>Face ID / Passkey</strong>
      <p>${hasPasskey ? 'Face ID or your device passcode can sign you into KickPot without typing your PIN.' : 'Set up a passkey so iPhone can use Face ID instead of asking for your PIN.'}</p>
      <button type="button" id="kpRegisterPasskey">${hasPasskey ? 'Add another passkey' : 'Set up Face ID'}</button>
      <small id="kpPasskeyStatus">${hasPasskey ? 'Ready on this account ✓' : ''}</small>`;
    form.append(block);

    block.querySelector('#kpRegisterPasskey').addEventListener('click', async () => {
      const button = block.querySelector('#kpRegisterPasskey');
      const status = block.querySelector('#kpPasskeyStatus');
      const sb = await getClient();
      if (!sb?.auth?.registerPasskey) return;
      button.disabled = true;
      status.textContent = 'Waiting for your device…';
      try {
        const { error } = await sb.auth.registerPasskey();
        if (error) throw error;
        localStorage.setItem(READY_KEY, '1');
        status.textContent = 'Face ID / Passkey ready ✓';
        button.textContent = 'Add another passkey';
      } catch (error) {
        const message = String(error?.message || 'Could not set up Face ID.');
        status.textContent = /cancel|abort/i.test(message) ? 'Setup cancelled.' : message;
      } finally {
        button.disabled = false;
      }
    });
  } finally {
    checking = false;
  }
}

async function injectLoginPasskey() {
  if (!supported() || localStorage.getItem(READY_KEY) !== '1') return;
  const card = document.querySelector('.kp-auth-card');
  const primary = card?.querySelector('#kpPasswordSubmit');
  if (!card || !primary || card.querySelector('#kpPasskeyLogin')) return;
  const sb = await getClient();
  if (!sb?.auth?.signInWithPasskey) return;
  addStyles();
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'kp-passkey-login';
  button.id = 'kpPasskeyLogin';
  button.textContent = 'Use Face ID';
  primary.after(button);
  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = 'Waiting for Face ID…';
    try {
      const { error } = await sb.auth.signInWithPasskey();
      if (error) throw error;
      button.textContent = 'Signed in ✓';
    } catch (error) {
      const message = String(error?.message || 'Face ID sign-in failed.');
      button.textContent = /cancel|abort/i.test(message) ? 'Use Face ID' : 'Try Face ID again';
      const status = document.querySelector('#authStatus');
      if (status && !/cancel|abort/i.test(message)) {
        status.className = 'status error';
        status.textContent = message;
      }
    } finally {
      button.disabled = false;
    }
  });
}

document.addEventListener('click', event => {
  if (event.target.closest('#userChip')) [80,250,600,1100].forEach(ms => setTimeout(injectAccountPasskey, ms));
});
setInterval(() => {
  if (document.querySelector('.kp-account-sheet')) injectAccountPasskey();
  if (document.querySelector('.kp-auth-card')) injectLoginPasskey();
}, 1200);
setTimeout(injectLoginPasskey, 500);
