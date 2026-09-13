import { createClient } from './supabase-singleton.js';

const PROMPT_KEY = 'kp-pin-setup-prompt-v1';
let client = null;
let promptBusy = false;

function addStyles() {
  if (document.querySelector('#kpPasswordStyles')) return;
  const style = document.createElement('style');
  style.id = 'kpPasswordStyles';
  style.textContent = `
    .kp-account-password{margin-top:22px;padding-top:22px;border-top:1px solid rgba(148,163,184,.16);display:grid;gap:12px}
    .kp-account-password>strong{font-size:17px;color:#f8fafc}
    .kp-account-password>p{margin:-5px 0 2px;color:#8f9aad;font-size:13px;line-height:1.45}
    .kp-account-password label{display:grid;gap:7px;color:#919bad;font-size:12px;font-weight:700}
    .kp-account-password input{width:100%;box-sizing:border-box;border:1px solid rgba(148,163,184,.18);background:#0c1626;color:#fff;border-radius:13px;padding:13px 14px;font:700 18px/1.2 system-ui,-apple-system,sans-serif;letter-spacing:.28em;outline:none}
    .kp-account-password input:focus{border-color:rgba(67,184,115,.75);box-shadow:0 0 0 3px rgba(67,184,115,.12)}
    .kp-account-password button{border:0;border-radius:13px;padding:14px 16px;background:linear-gradient(100deg,#0f6b40,#43b873);color:white;font:800 14px/1 system-ui,-apple-system,sans-serif}
    .kp-account-password small{min-height:16px;color:#9aa5b7;font-size:12px}
    .kp-password-prompt-overlay{position:fixed;inset:0;z-index:10050;background:rgba(2,7,18,.72);backdrop-filter:blur(14px);display:grid;place-items:end center;padding:18px;padding-bottom:calc(18px + env(safe-area-inset-bottom))}
    .kp-password-prompt{width:min(100%,520px);box-sizing:border-box;background:#091424;border:1px solid rgba(148,163,184,.18);border-radius:24px;padding:24px;box-shadow:0 30px 80px rgba(0,0,0,.5);color:#fff}
    .kp-password-prompt .kp-prompt-kicker{color:#5fcf94;font-size:11px;font-weight:900;letter-spacing:.16em;text-transform:uppercase}
    .kp-password-prompt h2{font-size:28px;line-height:1.02;margin:8px 0 8px;letter-spacing:-.035em}
    .kp-password-prompt p{color:#98a4b7;font-size:14px;line-height:1.5;margin:0 0 18px}
    .kp-password-prompt label{display:grid;gap:7px;color:#a1aabd;font-size:12px;font-weight:800;margin-top:11px}
    .kp-password-prompt input{width:100%;box-sizing:border-box;border:1px solid rgba(148,163,184,.20);background:#0d1728;color:#fff;border-radius:14px;padding:14px;font:800 20px/1.2 system-ui,-apple-system,sans-serif;letter-spacing:.32em;outline:none}
    .kp-password-prompt input:focus{border-color:#43b873;box-shadow:0 0 0 3px rgba(67,184,115,.15)}
    .kp-password-prompt .kp-prompt-save{width:100%;margin-top:17px;border:0;border-radius:14px;padding:15px;background:linear-gradient(100deg,#0f6b40,#43b873);color:#fff;font:900 15px/1 system-ui,-apple-system,sans-serif}
    .kp-password-prompt .kp-prompt-later{width:100%;margin-top:9px;border:0;background:transparent;color:#8f9aad;padding:11px;font:700 13px/1 system-ui,-apple-system,sans-serif}
    .kp-password-prompt .kp-prompt-status{display:block;min-height:17px;margin-top:9px;color:#ff9ab5;font-size:12px;text-align:center}
  `;
  document.head.append(style);
}

async function getClient() {
  if (client) return client;
  if (window.__kickpotSupabase) { client = window.__kickpotSupabase; return client; }
  const cfg = await fetch('/api/config', { cache:'no-store' }).then(r => r.json()).catch(() => null);
  if (!cfg?.supabaseConfigured) return null;
  client = createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
  return client;
}

function pinMarkup(prefix = 'kpAccount') {
  return `<label>New 6-digit PIN<input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" id="${prefix}NewPassword" autocomplete="new-password" placeholder="••••••"></label>
    <label>Confirm PIN<input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" id="${prefix}ConfirmPassword" autocomplete="new-password" placeholder="••••••"></label>`;
}
function cleanPinInput(input) {
  if (!input) return;
  input.value = input.value.replace(/\D/g, '').slice(0, 6);
}

async function savePin(pin, confirm, status, button) {
  if (!/^\d{6}$/.test(pin)) { status.textContent = 'Choose exactly 6 digits.'; return false; }
  if (pin !== confirm) { status.textContent = 'PINs do not match.'; return false; }
  const sb = await getClient();
  if (!sb) { status.textContent = 'KickPot authentication is unavailable.'; return false; }
  button.disabled = true;
  status.textContent = 'Saving…';
  const { data:{ session } } = await sb.auth.getSession();
  if (!session) {
    button.disabled = false;
    status.textContent = 'Your session expired. Log in once more, then choose your PIN.';
    return false;
  }
  const { error } = await sb.auth.updateUser({ password: pin, data: { kickpot_pin: true } });
  button.disabled = false;
  if (error) { status.textContent = error.message || 'Could not save PIN.'; return false; }
  status.textContent = 'PIN saved ✓';
  localStorage.setItem(PROMPT_KEY, 'done');
  return true;
}

function bindPinInputs(root) {
  root.querySelectorAll('input[inputmode="numeric"]').forEach(input => input.addEventListener('input', () => cleanPinInput(input)));
}

function injectPasswordControls() {
  addStyles();
  const sheet = document.querySelector('.kp-account-sheet');
  const form = sheet?.querySelector('.kp-account-form');
  if (!sheet || !form || form.querySelector('.kp-account-password')) return false;

  const block = document.createElement('div');
  block.className = 'kp-account-password';
  block.innerHTML = `<strong>Login PIN</strong><p>Use a simple 6-digit PIN if KickPot ever needs you to sign in again. This replaces your old password.</p>
    ${pinMarkup('kpAccount')}
    <button type="button" id="kpAccountSavePassword">Set / change PIN</button><small id="kpAccountPasswordStatus"></small>`;
  form.append(block);
  bindPinInputs(block);

  block.querySelector('#kpAccountSavePassword').addEventListener('click', async () => {
    const pin = block.querySelector('#kpAccountNewPassword').value;
    const confirm = block.querySelector('#kpAccountConfirmPassword').value;
    const status = block.querySelector('#kpAccountPasswordStatus');
    const button = block.querySelector('#kpAccountSavePassword');
    if (await savePin(pin, confirm, status, button)) {
      block.querySelector('#kpAccountNewPassword').value = '';
      block.querySelector('#kpAccountConfirmPassword').value = '';
    }
  });
  return true;
}

document.addEventListener('kp:account-render',injectPasswordControls);
