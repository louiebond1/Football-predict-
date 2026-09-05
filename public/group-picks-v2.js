import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const screen = document.querySelector('#screen');
const GROUP_KEY = 'kp-active-group-v1';
let client = null;
let contextCache = null;
let contextCacheAt = 0;
let fixturesCache = [];
let fixturesCacheAt = 0;
let lastGroupId = '';
let busy = false;
const revealedPicks = new Map();

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[c]));
}

function activeTab() {
  return document.querySelector('.nav-item.active')?.dataset.tab || '';
}

function normaliseTeamName(value = '') {
  return String(value).trim().toLowerCase().replace(/\s+/g, ' ');
}

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

async function loadContext(force = false) {
  if (!force && contextCache && Date.now() - contextCacheAt < 15000) return contextCache;
  const sb = await getClient();
  if (!sb) return null;
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;

  const { data: groups, error: groupsError } = await sb.from('groups').select('id,name').order('created_at');
  if (groupsError) return null;
  const selected = document.querySelector('#groupSwitch')?.value || sessionStorage.getItem(GROUP_KEY) || '';
  const group = (groups || []).find(g => g.id === selected) || (groups || [])[0] || null;
  if (!group) return null;

  const { data: gameweekId, error: gwError } = await sb.rpc('ensure_current_gameweek', { p_group_id: group.id });
  if (gwError || !gameweekId) return null;
  const { data: rows, error } = await sb.rpc('group_live_status', { p_group_id: group.id, p_gameweek_id: gameweekId });
  if (error) return null;

  if (lastGroupId && lastGroupId !== group.id) revealedPicks.clear();
  lastGroupId = group.id;
  contextCache = { sb, session, group, gameweekId, members: rows || [] };
  contextCacheAt = Date.now();
  return contextCache;
}

async function loadFixtures() {
  if (fixturesCache.length && Date.now() - fixturesCacheAt < 30000) return fixturesCache;
  const football = await fetch('/api/football/fixtures', { cache:'no-store' }).then(r => r.json()).catch(() => null);
  fixturesCache = football?.fixtures || [];
  fixturesCacheAt = Date.now();
  return fixturesCache;
}

function fixtureForRow(row, fixtures) {
  const directId = Number(row.dataset.fixture || 0);
  if (directId) return fixtures.find(f => Number(f.id) === directId) || null;

  const home = normaliseTeamName(row.querySelector('.team:not(.away) > span:last-child')?.textContent || '');
  const away = normaliseTeamName(row.querySelector('.team.away > span:first-child')?.textContent || '');
  if (!home || !away) return null;
  return fixtures.find(f => normaliseTeamName(f.home?.name) === home && normaliseTeamName(f.away?.name) === away) || null;
}

function revealSignature(members, byUser) {
  return members.map(member => {
    const pick = byUser.get(member.user_id);
    return `${member.user_id}:${pick ? `${pick.predicted_home}-${pick.predicted_away}` : 'none'}`;
  }).join('|');
}

function renderReveal(row, ctx, fixture, picks) {
  const members = ctx.members || [];
  if (!members.length) return;
  const byUser = new Map((picks || []).map(p => [p.user_id, p]));
  const signature = revealSignature(members, byUser);

  let reveal = row.querySelector('.kp3-reveal');
  if (reveal?.dataset.kpRevealSignature === signature && reveal.tagName === 'DETAILS') return;

  const wasOpen = reveal?.hasAttribute?.('open') || false;
  if (!reveal || reveal.tagName !== 'DETAILS') {
    const details = document.createElement('details');
    details.className = 'kp3-reveal';
    if (reveal) reveal.replaceWith(details);
    else row.append(details);
    reveal = details;
  }

  reveal.dataset.kpRevealSignature = signature;
  reveal.dataset.kpGroupPicksV2 = String(fixture.id);
  if (wasOpen) reveal.setAttribute('open', '');
  else reveal.removeAttribute('open');

  reveal.innerHTML = `<summary><small>Group picks and scores</small><span>${(picks || []).length}/${members.length} revealed</span></summary><div class="kp3-reveal-scroll">${members.map(member => {
    const pick = byUser.get(member.user_id);
    const name = member.display_name || 'Player';
    const mine = member.user_id === ctx.session.user.id;
    return `<span class="kp3-pick-chip${mine ? ' mine' : ''}${pick ? '' : ' is-missing'}"><b>${esc(name)}${mine ? ' · you' : ''}</b><em>${pick ? `${pick.predicted_home}–${pick.predicted_away}` : 'No pick'}</em></span>`;
  }).join('')}</div>`;
}

async function enhanceGroupPicks() {
  const tab = activeTab();
  if (busy || !screen || (tab !== 'gw' && tab !== 'live')) return;
  const rows = [...screen.querySelectorAll('.fixture')].filter(row => row.querySelector('.teams'));
  if (!rows.length) return;

  busy = true;
  try {
    const [ctx, fixtures] = await Promise.all([loadContext(), loadFixtures()]);
    if (!ctx || !fixtures.length || (activeTab() !== 'gw' && activeTab() !== 'live')) return;

    const now = Date.now();
    const visible = rows.map(row => ({ row, fixture: fixtureForRow(row, fixtures) }))
      .filter(item => item.fixture && now >= new Date(item.fixture.kickoff).getTime());
    if (!visible.length) return;

    const missingIds = [...new Set(visible.map(item => Number(item.fixture.id)).filter(id => !revealedPicks.has(`${ctx.group.id}:${id}`)))];
    if (missingIds.length) {
      const { data, error } = await ctx.sb.from('predictions')
        .select('fixture_id,user_id,predicted_home,predicted_away')
        .eq('group_id', ctx.group.id)
        .in('fixture_id', missingIds);
      if (!error) {
        missingIds.forEach(id => {
          const groupPicks = (data || []).filter(p => Number(p.fixture_id) === id);
          revealedPicks.set(`${ctx.group.id}:${id}`, groupPicks);
        });
      }
    }

    visible.forEach(({ row, fixture }) => {
      const groupPicks = revealedPicks.get(`${ctx.group.id}:${Number(fixture.id)}`);
      if (groupPicks) renderReveal(row, ctx, fixture, groupPicks);
    });
  } finally {
    busy = false;
  }
}

document.addEventListener('change', event => {
  if (event.target?.id === 'groupSwitch') {
    contextCache = null;
    contextCacheAt = 0;
    revealedPicks.clear();
  }
}, true);

document.addEventListener('click', event => {
  if (event.target.closest('.nav-item[data-tab="gw"],.nav-item[data-tab="live"]')) {
    setTimeout(enhanceGroupPicks, 60);
    setTimeout(enhanceGroupPicks, 300);
  }
}, true);

const observer = new MutationObserver(() => queueMicrotask(enhanceGroupPicks));
if (screen) observer.observe(screen, { childList:true, subtree:true });
setInterval(enhanceGroupPicks, 1500);
window.addEventListener('pageshow', () => setTimeout(enhanceGroupPicks, 120));
setTimeout(enhanceGroupPicks, 250);
