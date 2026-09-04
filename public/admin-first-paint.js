import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const screen = document.querySelector('#screen');
const GROUP_KEY = 'kp-active-group-v1';
let client = null;
let pendingClick = false;
let adminGroupId = '';
let adminKnown = false;
let loading = false;

const adminIcon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5l7 2.7v5.3c0 5-3.1 7.9-7 9-3.9-1.1-7-4-7-9V6.2l7-2.7z"/><path d="M9 12h6M12 9v6"/></svg>';
const chevron = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';

async function getClient() {
  if (client) return client;
  if (window.__kickpotSupabase) {
    client = window.__kickpotSupabase;
    return client;
  }
  const cfg = await fetch('/api/config', { cache:'no-store' }).then(r => r.json()).catch(() => null);
  if (!cfg?.supabaseConfigured) return null;
  client = createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
  return client;
}

function selectedGroup(groups) {
  const wanted = document.querySelector('#groupSwitch')?.value || sessionStorage.getItem(GROUP_KEY) || '';
  return groups.find(g => g.id === wanted) || groups[0] || null;
}

async function prewarmAdmin(force = false) {
  if (loading || (!force && adminKnown)) return;
  loading = true;
  try {
    const sb = await getClient();
    if (!sb) return;
    const { data:{ session } } = await sb.auth.getSession();
    if (!session) return;
    const { data:groups, error } = await sb.from('groups').select('id,treasurer_id').order('created_at');
    if (error || !groups?.length) return;
    const group = selectedGroup(groups);
    adminGroupId = group?.id || '';
    adminKnown = Boolean(group && group.treasurer_id === session.user.id);
    apply();
  } finally {
    loading = false;
  }
}

function placeholder() {
  const entry = document.createElement('button');
  entry.type = 'button';
  entry.className = 'kp3-nav-row kp-admin-first-paint';
  entry.innerHTML = `<span class="kp3-nav-icon">${adminIcon}</span><span class="kp3-nav-copy"><strong>Admin</strong><small>Payments, members & scoring controls</small></span><span class="kp3-nav-meta">Treasurer</span><span class="kp3-nav-chevron">${chevron}</span>`;
  entry.addEventListener('click', () => {
    pendingClick = true;
    const real = screen?.querySelector('.kp-admin-entry');
    if (real) {
      pendingClick = false;
      real.click();
    }
  });
  return entry;
}

function apply() {
  if (!screen) return;
  const real = screen.querySelector('.kp-admin-entry');
  const fake = screen.querySelector('.kp-admin-first-paint');

  if (real) {
    fake?.remove();
    if (pendingClick) {
      pendingClick = false;
      queueMicrotask(() => real.click());
    }
    return;
  }

  if (!adminKnown || !document.querySelector('.nav-item[data-tab="group"].active')) {
    fake?.remove();
    return;
  }

  const menu = screen.querySelector('.kp3-group-overview .kp3-group-menu');
  if (!menu || fake) return;
  menu.append(placeholder());
}

const observer = new MutationObserver(() => queueMicrotask(apply));
if (screen) observer.observe(screen, { childList:true, subtree:true });

document.addEventListener('change', event => {
  if (event.target?.id !== 'groupSwitch') return;
  adminKnown = false;
  adminGroupId = event.target.value || '';
  setTimeout(() => prewarmAdmin(true), 0);
}, true);

window.addEventListener('pageshow', () => setTimeout(() => prewarmAdmin(false), 70));
setTimeout(() => prewarmAdmin(false), 90);
setTimeout(() => prewarmAdmin(false), 500);
