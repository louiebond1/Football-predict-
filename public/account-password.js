import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

let client = null;
async function getClient() {
  if (client) return client;
  const cfg = await fetch('/api/config', { cache:'no-store' }).then(r => r.json()).catch(() => null);
  if (!cfg?.supabaseConfigured) return null;
  client = createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
  return client;
}
async function injectPasswordControls() {
  const sheet = document.querySelector('.kp-account-sheet');
  const form = sheet?.querySelector('.kp-account-form');
  if (!sheet || !form || sheet.dataset.kpPasswordControls === '1') return false;
  const sb = await getClient();
  if (!sb) return false;
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return false;
  sheet.dataset.kpPasswordControls = '1';

  const loginEmail = session.user.user_metadata?.login_email || session.user.email || '';
  const readonlyEmail = form.querySelector('input[readonly]');
  if (readonlyEmail && loginEmail) readonlyEmail.value = loginEmail;

  const block = document.createElement('div');
  block.className = 'kp-account-password';
  block.innerHTML = `<strong>Password</strong><p>Add or change your password so you can log in without waiting for an email link.</p>
    <label>New password<input type="password" id="kpNewPassword" autocomplete="new-password" placeholder="10+ characters"></label>
    <label>Confirm password<input type="password" id="kpConfirmPassword" autocomplete="new-password" placeholder="Repeat password"></label>
    <button type="button" id="kpSavePassword">Set / change password</button><small id="kpPasswordStatus"></small>`;
  form.append(block);

  block.querySelector('#kpSavePassword').addEventListener('click', async () => {
    const password = block.querySelector('#kpNewPassword').value;
    const confirm = block.querySelector('#kpConfirmPassword').value;
    const status = block.querySelector('#kpPasswordStatus');
    const button = block.querySelector('#kpSavePassword');
    if (password.length < 10) { status.textContent = 'Use at least 10 characters.'; return; }
    if (password !== confirm) { status.textContent = 'Passwords do not match.'; return; }
    button.disabled = true; status.textContent = 'Saving…';
    const { error } = await sb.auth.updateUser({ password });
    button.disabled = false;
    if (error) { status.textContent = error.message || 'Could not save password.'; return; }
    block.querySelector('#kpNewPassword').value = '';
    block.querySelector('#kpConfirmPassword').value = '';
    status.textContent = 'Password saved ✓';
  });
  return true;
}

function tryInject() {
  let tries = 0;
  const timer = setInterval(async () => {
    tries += 1;
    if (await injectPasswordControls() || tries > 24) clearInterval(timer);
  }, 120);
}
document.addEventListener('click', event => {
  if (event.target.closest('#userChip')) tryInject();
});
setTimeout(() => { if (document.querySelector('.kp-account-sheet')) tryInject(); }, 200);
