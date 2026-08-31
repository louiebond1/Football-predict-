import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const screen = document.querySelector('#screen');
const userChip = document.querySelector('#userChip');
let client = null;
let checking = false;
let recoveryTimer = null;
let lastRecoveryReload = Number(sessionStorage.getItem('kp-last-group-recovery') || 0);

function isLoggedInUI() {
  return Boolean(userChip && !userChip.hidden);
}

function isOnboardingVisible() {
  const h1 = screen?.querySelector(':scope .hero h1');
  return h1?.textContent?.trim() === 'Start a Pot';
}

function showLoading() {
  if (!screen) return;
  screen.className = 'screen session-loading-screen';
  screen.innerHTML = `
    <section class="session-loading-wrap" role="status" aria-live="polite">
      <div class="session-loading-mark" aria-hidden="true"></div>
      <div class="session-loading-kicker">KICKPOT</div>
      <h1>Loading your pot…</h1>
      <p>Getting your group and Gameweek ready.</p>
    </section>`;
}

function installStyles() {
  if (document.querySelector('#sessionGuardStyles')) return;
  const style = document.createElement('style');
  style.id = 'sessionGuardStyles';
  style.textContent = `
    .session-loading-screen{min-height:calc(100dvh - 150px);display:grid;place-items:center}
    .session-loading-wrap{width:100%;padding:54px 8px 110px;text-align:center}
    .session-loading-mark{width:34px;height:34px;margin:0 auto 17px;border-radius:50%;border:2px solid rgba(255,255,255,.11);border-top-color:#6fd3ff;animation:kpGuardSpin .75s linear infinite}
    .session-loading-kicker{margin-bottom:9px;color:#71d5ff;font-size:9px;font-weight:900;letter-spacing:1.7px}
    .session-loading-wrap h1{margin:0;color:#fff;font-size:28px;line-height:1.05;letter-spacing:-1px;font-weight:900}
    .session-loading-wrap p{margin:9px 0 0;color:#827d90;font-size:12px}
    @keyframes kpGuardSpin{to{transform:rotate(360deg)}}
    @media(prefers-reduced-motion:reduce){.session-loading-mark{animation:none;border-color:#6fd3ff}}
  `;
  document.head.append(style);
}

async function getClient() {
  if (client) return client;
  const cfg = await fetch('/api/config', { cache: 'no-store' }).then(r => r.json());
  if (!cfg?.supabaseConfigured) return null;
  client = createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
  return client;
}

function scheduleRecoveryReload() {
  const now = Date.now();
  const cooldown = 30000;
  const wait = Math.max(0, cooldown - (now - lastRecoveryReload));
  clearTimeout(recoveryTimer);
  recoveryTimer = setTimeout(() => {
    lastRecoveryReload = Date.now();
    sessionStorage.setItem('kp-last-group-recovery', String(lastRecoveryReload));
    location.reload();
  }, wait + 120);
}

async function recoverIfNeeded() {
  if (!screen || checking || !isLoggedInUI() || !isOnboardingVisible()) return;
  checking = true;

  try {
    const sb = await getClient();
    if (!sb) throw new Error('Supabase unavailable');
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      location.reload();
      return;
    }

    // Do not replace onboarding until an authenticated query proves this
    // account already belongs to a group. A genuine zero-group account must
    // be able to use Create / Join immediately.
    const { data, error } = await sb.from('groups').select('id').limit(1);
    if (error) throw error;

    if (!(data || []).length) return;

    installStyles();
    showLoading();
    scheduleRecoveryReload();
  } catch (err) {
    console.warn('KickPot group recovery:', err);
  } finally {
    checking = false;
  }
}

function tick() {
  if (!screen) return;
  recoverIfNeeded();
}

window.addEventListener('pageshow', () => setTimeout(tick, 80));
window.addEventListener('focus', () => setTimeout(tick, 80));
setInterval(tick, 900);
setTimeout(tick, 150);
