import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PROMPT_KEY = 'kp-password-setup-prompt-v2';
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
    .kp-account-password input{width:100%;box-sizing:border-box;border:1px solid rgba(148,163,184,.18);background:#0c1626;color:#fff;border-radius:13px;padding:13px 14px;font:600 15px/1.2 system-ui,-apple-system,sans-serif;outline:none}
    .kp-account-password input:focus{border-color:rgba(142,92,255,.75);box-shadow:0 0 0 3px rgba(142,92,255,.10)}
    .kp-account-password button{border:0;border-radius:13px;padding:14px 16px;background:linear-gradient(100deg,#7047ff,#a054ff);color:white;font:800 14px/1 system-ui,-apple-system,sans-serif}
    .kp-account-password small{min-height:16px;color:#9aa5b7;font-size:12px}
    .kp-password-prompt-overlay{position:fixed;inset:0;z-index:10050;background:rgba(2,7,18,.72);backdrop-filter:blur(14px);display:grid;place-items:end center;padding:18px;padding-bottom:calc(18px + env(safe-area-inset-bottom))}
    .kp-password-prompt{width:min(100%,520px);box-sizing:border-box;background:#091424;border:1px solid rgba(148,163,184,.18);border-radius:24px;padding:24px;box-shadow:0 30px 80px rgba(0,0,0,.5);color:#fff}
    .kp-password-prompt .kp-prompt-kicker{color:#a66bff;font-size:11px;font-weight:900;letter-spacing:.16em;text-transform:uppercase}
    .kp-password-prompt h2{font-size:28px;line-height:1.02;margin:8px 0 8px;letter-spacing:-.035em}
    .kp-password-prompt p{color:#98a4b7;font-size:14px;line-height:1.5;margin:0 0 18px}
    .kp-password-prompt label{display:grid;gap:7px;color:#a1aabd;font-size:12px;font-weight:800;margin-top:11px}
    .kp-password-prompt input{width:100%;box-sizing:border-box;border:1px solid rgba(148,163,184,.20);background:#0d1728;color:#fff;border-radius:14px;padding:14px;font:600 16px/1.2 system-ui,-apple-system,sans-serif;outline:none}
    .kp-password-prompt input:focus{border-color:#8d5cff;box-shadow:0 0 0 3px rgba(141,92,255,.12)}
    .kp-password-prompt .kp-prompt-save{width:100%;margin-top:17px;border:0;border-radius:14px;padding:15px;background:linear-gradient(100deg,#7047ff,#a054ff);color:#fff;font:900 15px/1 system-ui,-apple-system,sans-serif}
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

function passwordMarkup(prefix = 'kpAccount') {
  return `<label>New password<input type="password" id="${prefix}NewPassword" autocomplete="new-password" placeholder="10+ characters"></label>
    <label>Confirm password<input type="password" id="${prefix}ConfirmPassword" autocomplete="new-password" placeholder="Repeat password"></label>`;
}

async function savePassword(password, confirm, status, button) {
  if (password.length < 10) { status.textContent = 'Use at least 10 characters.'; return false; }
  if (password !== confirm) { status.textContent = 'Passwords do not match.'; return false; }
  const sb = await getClient();
  if (!sb) { status.textContent = 'KickPot authentication is unavailable.'; return false; }
  button.disabled = true;
  status.textContent = 'Saving…';
  const { data:{ session } } = await sb.auth.getSession();
  if (!session) {
    button.disabled = false;
    status.textContent = 'Your session expired. Log in once more, then set your password.';
    return false;
  }
  const { error } = await sb.auth.updateUser({ password });
  button.disabled = false;
  if (error) { status.textContent = error.message || 'Could not save password.'; return false; }
  status.textContent = 'Password saved ✓';
  localStorage.setItem(PROMPT_KEY, 'done');
  return true;
}

function injectPasswordControls() {
  addStyles();
  const sheet = document.querySelector('.kp-account-sheet');
  const form = sheet?.querySelector('.kp-account-form');
  if (!sheet || !form || form.querySelector('.kp-account-password')) return false;

  const block = document.createElement('div');
  block.className = 'kp-account-password';
  block.innerHTML = `<strong>Password</strong><p>Set this once, then use email + password to sign in without waiting for an email link.</p>
    ${passwordMarkup('kpAccount')}
    <button type="button" id="kpAccountSavePassword">Set / change password</button><small id="kpAccountPasswordStatus"></small>`;
  form.append(block);

  block.querySelector('#kpAccountSavePassword').addEventListener('click', async () => {
    const password = block.querySelector('#kpAccountNewPassword').value;
    const confirm = block.querySelector('#kpAccountConfirmPassword').value;
    const status = block.querySelector('#kpAccountPasswordStatus');
    const button = block.querySelector('#kpAccountSavePassword');
    if (await savePassword(password, confirm, status, button)) {
      block.querySelector('#kpAccountNewPassword').value = '';
      block.querySelector('#kpAccountConfirmPassword').value = '';
    }
  });
  return true;
}

async function maybeShowOneTimePrompt() {
  if (promptBusy || localStorage.getItem(PROMPT_KEY) === 'done' || document.querySelector('.kp-password-prompt-overlay')) return;
  const sb = await getClient();
  if (!sb) return;
  const { data:{ session } } = await sb.auth.getSession();
  if (!session) return;
  promptBusy = true;
  addStyles();
  const overlay = document.createElement('div');
  overlay.className = 'kp-password-prompt-overlay';
  overlay.innerHTML = `<section class="kp-password-prompt" role="dialog" aria-modal="true" aria-label="Create your KickPot password">
    <div class="kp-prompt-kicker">ONE-TIME SETUP</div>
    <h2>Create your KickPot password</h2>
    <p>Do this once on this account. Afterward you can sign in directly with your email and password and the Home Screen app will keep you signed in.</p>
    ${passwordMarkup('kpPrompt')}
    <button type="button" class="kp-prompt-save">Save password</button>
    <button type="button" class="kp-prompt-later">Do this later</button>
    <small class="kp-prompt-status"></small>
  </section>`;
  document.body.append(overlay);
  const status = overlay.querySelector('.kp-prompt-status');
  const save = overlay.querySelector('.kp-prompt-save');
  save.addEventListener('click', async () => {
    const password = overlay.querySelector('#kpPromptNewPassword').value;
    const confirm = overlay.querySelector('#kpPromptConfirmPassword').value;
    if (await savePassword(password, confirm, status, save)) {
      setTimeout(() => overlay.remove(), 450);
    }
  });
  overlay.querySelector('.kp-prompt-later').addEventListener('click', () => {
    localStorage.setItem(PROMPT_KEY, 'done');
    overlay.remove();
  });
  promptBusy = false;
}

// Account sheet is appended asynchronously. Check briefly after an Account tap,
// and keep a very light fallback check so the control cannot silently disappear.
document.addEventListener('click', event => {
  if (!event.target.closest('#userChip')) return;
  [60,180,400,800,1400].forEach(ms => setTimeout(injectPasswordControls, ms));
});
setInterval(() => { if (document.querySelector('.kp-account-sheet')) injectPasswordControls(); }, 750);
window.addEventListener('pageshow', () => setTimeout(maybeShowOneTimePrompt, 900));
setTimeout(maybeShowOneTimePrompt, 1200);
