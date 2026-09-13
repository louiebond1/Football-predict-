import { createClient } from './supabase-singleton.js';
import { enhanceGroup } from './ui-v3.js';
import { enhanceAdmin } from './admin-v1.js';
import { refreshGroupFeatures, openAccountSettings } from './settings-v2.js';
import { ensurePasswordUI } from './password-auth.js';
import './passkey-auth.js';
import './account-password.js';
import './auth-ux.js';
import './pwa.js';
import {readStandings} from './standings.js';

const screen = document.querySelector('#screen');
const nav = [...document.querySelectorAll('.nav-item')];
const installBtn = document.querySelector('#installBtn');
const userChip = document.querySelector('#userChip');
const bellDot = document.querySelector('#bellDot');
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; installBtn.hidden = false });
installBtn.addEventListener('click', async () => { if (!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; installBtn.hidden = true });


/* ---------- icon set (Lucide-style inline SVG) ---------- */
const ICONS = {
  lock: '<rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  wallet: '<rect x="3" y="7" width="18" height="12" rx="2.5"/><path d="M3 10.2h18"/><circle cx="16.3" cy="14.6" r="1.1" fill="currentColor" stroke="none"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1"/><circle cx="17.3" cy="8.6" r="2.3"/><path d="M18.7 20v-1a4 4 0 0 0-2.7-3.78"/>',
  user: '<circle cx="12" cy="8" r="3.4"/><path d="M5 20v-.4A5.6 5.6 0 0 1 10.6 14h2.8A5.6 5.6 0 0 1 19 19.6v.4"/>',
  trophy: '<path d="M7 4h10v3a5 5 0 0 1-10 0V4z"/><path d="M7 5.5H4.5A2.5 2.5 0 0 0 7 8"/><path d="M17 5.5h2.5A2.5 2.5 0 0 1 17 8"/><path d="M12 12v4.5"/><path d="M8.5 20h7"/><path d="M9.7 16.5h4.6v3.5H9.7z"/>',
  target: '<circle cx="12" cy="12" r="8.3"/><circle cx="12" cy="12" r="4.8"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/>',
  check: '<circle cx="12" cy="12" r="8.5"/><path d="M8 12.3l2.6 2.6L16.2 9"/>',
  arrowUp: '<path d="M12 18.5V5.5"/><path d="M6.5 11l5.5-5.5L17.5 11"/>',
  arrowDown: '<path d="M12 5.5v13"/><path d="M17.5 13l-5.5 5.5L6.5 13"/>',
  dash: '<path d="M6 12h12"/>',
  award: '<circle cx="12" cy="8.5" r="5.3"/><path d="M8.7 13.2L7 20.5l5-2.8 5 2.8-1.7-7.3"/>',
  landmark: '<path d="M4 21h16"/><path d="M5.5 21V10.5"/><path d="M18.5 21V10.5"/><path d="M9.5 21V10.5"/><path d="M14.5 21V10.5"/><path d="M3 10.5l9-5.5 9 5.5z"/>',
  shield: '<path d="M12 3.5l7 2.7v5.3c0 5-3.1 7.9-7 9-3.9-1.1-7-4-7-9V6.2l7-2.7z"/>',
  zap: '<path d="M12.5 3L5 14h5.5L11 21l7.5-11H13z"/>',
  star: '<path d="M12 3.5l2.6 5.4 6 .8-4.3 4.1 1 5.9L12 16.8l-5.3 2.9 1-5.9L3.4 9.7l6-.8z"/>',
  crown: '<path d="M4 18h16l-1.4-8-4 3.4L12 8l-2.6 5.4-4-3.4L4 18z"/><path d="M4 20.5h16"/>',
  climb: '<path d="M3 17l6-6 4 4 8-9"/><path d="M15 6h6v6"/>',
  chevronRight: '<path d="M9 6l6 6-6 6"/>',
  radio: '<circle cx="12" cy="12" r="3"/><path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.5 5.5a9.5 9.5 0 0 0 0 13M18.5 5.5a9.5 9.5 0 0 1 0 13"/>'
};
function ic(name, size = 18) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
}

document.addEventListener('error', e => {
  if (e.target?.classList?.contains('crest')) {
    const span = document.createElement('span');
    span.className = 'crest-fallback';
    span.textContent = e.target.dataset.initial || '?';
    e.target.replaceWith(span);
  }
}, true);

function crest(team) {
  const initial = esc((team?.name || '?').slice(0, 1));
  if (team?.logo) return `<img class="crest" src="${esc(team.logo)}" data-initial="${initial}" alt="" loading="lazy">`;
  return `<span class="crest-fallback">${initial}</span>`;
}
function avatar(name, size = '') {
  const initial = esc((name || '?').trim().slice(0, 1).toUpperCase());
  return `<span class="avatar ${size}">${initial}</span>`;
}
function initials(name) {
  const words = (name || '?').trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0] || '?').slice(0, 2);
  return esc(letters.toUpperCase());
}

const state = {
  tab: 'gw', supabase: null, session: null, config: null,
  groups: [], groupsStatus: 'idle', activeGroupId: null, gameweekId: null,
  fixtures: [], round: null, predictions: {}, members: [], profiles: {}, payments: {},
  leaderboard: [], history: [], readyWeeks: [], seasonBoard: [], recentFixtures: []
};
let sessionReadyRun = 0;
let dataRun=0, renderRun=0;

function esc(s = '') { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c])) }
function gbp(pence) { return `£${(pence / 100).toFixed(pence % 100 ? 2 : 0)}` }
function kickoffLabel(d) { return new Intl.DateTimeFormat('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(d)) }
function isLocked(kickoff) { return Date.now() >= new Date(kickoff).getTime() }
function myId() { return state.session?.user?.id }
function activeGroup() { return state.groups.find(g => g.id === state.activeGroupId) }
function isTreasurer() { const g = activeGroup(); return g && g.treasurer_id === myId() }
function myPayment() { return state.payments[myId()] }
function profileName(id) { return state.profiles[id]?.display_name || 'Player' }
function countdown(ms) {
  if (ms <= 0) return 'now';
  const s = Math.floor(ms / 1000);
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${sec}`;
}

function toast(msg, kind = 'success') {
  const el = document.querySelector('#toast');
  if (!el) return;
  el.textContent = msg; el.className = `status toast ${kind} show`;
  clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('show'), 3200);
}

function updateBell() {
  if (!bellDot) return;
  const p = myPayment();
  const needsMe = p && !p.confirmed_paid_at;
  const needsTreasurer = isTreasurer() && Object.values(state.payments).some(x => !x.confirmed_paid_at);
  const settleable = isTreasurer() && state.fixtures.length && state.fixtures.every(f => ['FT', 'AET', 'PEN'].includes(f.status?.short)) && !state.history.some(h => h.gameweek_id === state.gameweekId);
  bellDot.hidden = !(needsMe || needsTreasurer || settleable);
}

function resetSessionState() {
  ++sessionReadyRun;++dataRun;++renderRun;
  window.KickPotLive?.unmount();window.KickPotMatchday?.unmount();
  for(const key of Object.keys(draftPicks))delete draftPicks[key];
  state.seasonBoard=[];state.readyWeeks=[];state.recentFixtures=[];
  state.groups = [];
  state.groupsStatus = 'idle';
  state.activeGroupId = null;
  state.gameweekId = null;
  state.fixtures = [];
  state.predictions = {};
  state.members = [];
  state.profiles = {};
  state.payments = {};
  state.leaderboard = [];
  state.history = [];
}

function renderSessionLoading(message = 'Loading your pot…') {
  screen.className = 'screen';
  screen.innerHTML = `<section class="card" style="margin-top:22px;text-align:center;padding:28px 18px"><div class="eyebrow">KICKPOT</div><h1 style="margin:8px 0 6px;font-size:25px">${esc(message)}</h1><p class="muted" style="margin:0">Getting your group and Gameweek ready.</p></section>`;
}

async function boot() {
  state.config = await fetch('/api/config',{signal:AbortSignal.timeout(15000)}).then(r => r.json()).catch(() => null);
  if (!state.config) throw new Error(navigator.onLine===false?'You’re offline. Reconnect to load your group.':'KickPot could not connect. Try again.');
  if (!state.config?.supabaseConfigured) { renderConfigError(); return; }
  state.supabase = createClient(state.config.supabaseUrl, state.config.supabasePublishableKey);
  const { data: { session } } = await state.supabase.auth.getSession();
  state.session = session;

  state.supabase.auth.onAuthStateChange((evt, sess) => {
    const previousUserId = state.session?.user?.id || null;
    const nextUserId = sess?.user?.id || null;
    if(previousUserId&&previousUserId!==nextUserId)resetSessionState();
    state.session = sess;
    updateUserChip();

    if (!sess) {
      resetSessionState();
      renderAuth();
      return;
    }

    // Supabase emits INITIAL_SESSION after getSession() and later emits
    // TOKEN_REFRESHED for the same signed-in user. Neither event represents
    // a new account, so never wipe group state or restart the app for them.
    if (previousUserId === nextUserId && (evt === 'INITIAL_SESSION' || evt === 'TOKEN_REFRESHED' || evt === 'USER_UPDATED')) return;
    if (previousUserId === nextUserId && state.groupsStatus !== 'idle') return;

    queueMicrotask(() => onSessionReady().catch(showError));
  });

  await onSessionReady();
}

async function onSessionReady() {
  const run = ++sessionReadyRun;
  if (!state.session) { resetSessionState(); renderAuth(); return; }
  updateUserChip();
  await ensureProfile();
  if (run !== sessionReadyRun || !state.session) return;

  state.groupsStatus = 'loading';
  if (!state.groups.length) renderSessionLoading();
  const loaded = await loadGroups();
  if (run !== sessionReadyRun || !state.session) return;
  if (!loaded) {
    state.groupsStatus = 'error';
    showError(new Error('Couldn’t load your pot. Check your connection and try again.'));
    return;
  }
  state.groupsStatus = 'loaded';
  await render();
}

function updateUserChip() {
  if (!userChip) return;
  if (!state.session) { userChip.hidden = true; return; }
  userChip.hidden = false;
  userChip.textContent = (state.session.user.email || '?')[0].toUpperCase();
}

async function ensureProfile() {
  const email = state.session.user.email || 'player';
  const {error}=await state.supabase.from('profiles').upsert(
    { id: myId(), display_name: email.split('@')[0] },
    { onConflict: 'id', ignoreDuplicates: true }
  );
  if(error)throw error;
}

async function loadGroups() {
  const uid=myId();
  const { data, error } = await state.supabase.from('groups').select('*').order('created_at');
  if (error) { toast(error.message, 'error'); return false; }
  if(uid!==myId())return false;
  const nextGroups = data || [];
  state.groups = nextGroups;
  if (!state.activeGroupId || !nextGroups.some(g => g.id === state.activeGroupId)) {
    let stored='';try{stored=sessionStorage.getItem('kp-active-group-v1')||localStorage.getItem('kp-active-group-v1');}catch{}
    state.activeGroupId = nextGroups.find(g=>g.id===stored)?.id||nextGroups[0]?.id||null;
  }
  if (state.activeGroupId) return await loadGroupData();
  else {
    state.gameweekId = null;
    state.fixtures = [];
    state.predictions = {};
    state.members = [];
    state.profiles = {};
    state.payments = {};
    state.leaderboard = [];
    state.history = [];
  }
  return true;
}

async function loadGroupData() {
  const run=++dataRun,gid=state.activeGroupId,uid=myId(),sb=state.supabase;
  try {
    const response=await fetch('/api/football/fixtures',{cache:'no-store',signal:AbortSignal.timeout(15000)});
    const fx=await response.json();
    if(!response.ok||!Array.isArray(fx.fixtures))throw Error(fx.error||'Fixtures could not be loaded.');
    let gwId=fx.gameweekId;
    const ensured=gwId?await sb.rpc('ensure_group_gameweek',{gid,gwid:gwId}):await sb.rpc('ensure_current_gameweek',{p_group_id:gid});
    if(ensured.error)throw ensured.error;gwId ||= ensured.data;
    const ids=fx.fixtures.map(f=>f.id);
    const results=await Promise.all([
      sb.from('group_members').select('user_id,role').eq('group_id',gid),
      sb.from('payments').select('*').eq('group_id',gid).eq('gameweek_id',gwId),
      sb.from('profiles').select('id,display_name'),
      ids.length?sb.from('predictions').select('*').eq('group_id',gid).eq('user_id',uid).in('fixture_id',ids):{data:[]},
      sb.from('group_leaderboard').select('*').eq('group_id',gid).eq('gameweek_id',gwId),
      sb.from('group_gameweeks').select('*,gameweeks(round_name,fixtures(status,home_goals,away_goals))').eq('group_id',gid).order('settled_at',{ascending:false})
    ]);
    if(run!==dataRun||gid!==state.activeGroupId||uid!==myId())return false;
    const failed=results.find(r=>r.error);if(failed)throw failed.error;
    const [members,payments,profiles,predictions,board,history]=results.map(r=>r.data||[]);
    Object.assign(state,{gameweekId:gwId,fixtures:fx.fixtures,round:fx.round,members,
      payments:Object.fromEntries(payments.map(p=>[p.user_id,p])),profiles:Object.fromEntries(profiles.map(p=>[p.id,p])),
      predictions:Object.fromEntries(predictions.map(p=>[p.fixture_id,p])),leaderboard:board,history:history.filter(h=>h.settled_at),readyWeeks:history.filter(h=>!h.settled_at&&h.gameweeks?.fixtures?.length&&h.gameweeks.fixtures.every(f=>['FT','AET','PEN'].includes(f.status)&&f.home_goals!==null&&f.away_goals!==null)),groupsStatus:'loaded'});
    try{sessionStorage.setItem('kp-active-group-v1',gid);localStorage.setItem('kp-active-group-v1',gid);}catch{}
    if(!state.recentFixtures.length){
      const recent=await sb.from('fixtures').select('kickoff,home_team_id,away_team_id,home_goals,away_goals,status').in('status',['FT','AET','PEN']).order('kickoff',{ascending:false}).limit(100);
      if(run===dataRun&&!recent.error)state.recentFixtures=recent.data||[];
    }
    if(run!==dataRun||gid!==state.activeGroupId||uid!==myId())return false;
    updateBell();return true;
  }catch(error){if(run===dataRun){state.groupsStatus='error';toast(error.message||'Could not refresh your group.','error');}return false;}
}

async function refreshLeaderboard() {
  const { data: lb } = await state.supabase.from('group_leaderboard').select('*').eq('group_id', state.activeGroupId).eq('gameweek_id', state.gameweekId).order('points', { ascending: false });
  state.leaderboard = lb || [];
}

async function loadGroupSeasonBoard() {
  const groupId=state.activeGroupId;
  const data=await readStandings(state.supabase,groupId);
  const settled=new Set(state.history.map(h=>String(h.gameweek_id)));
  return (data||[]).filter(r=>settled.has(String(r.gameweek_id)));
}

function computeAwards(rows, history) {
  if (!rows.length) return null;
  const totals = {}, exactTotals = {}, byUserGw = {};
  rows.forEach(r => {
    totals[r.user_id] = (totals[r.user_id] || 0) + r.points;
    exactTotals[r.user_id] = (exactTotals[r.user_id] || 0) + (r.exact_scores || 0);
    (byUserGw[r.user_id] ||= []).push({ gw: r.gameweek_id, points: r.points });
  });
  const weeklyWins = {};
  history.forEach(h => { if (h.winner_user_id) weeklyWins[h.winner_user_id] = (weeklyWins[h.winner_user_id] || 0) + 1 });

  const byGw = {};
  rows.forEach(r => { (byGw[r.gameweek_id] ||= []).push(r) });
  const woodenSpoon = {};
  Object.values(byGw).forEach(gwRows => {
    const min = Math.min(...gwRows.map(r => r.points));
    gwRows.filter(r => r.points === min).forEach(r => { woodenSpoon[r.user_id] = (woodenSpoon[r.user_id] || 0) + 1 });
  });

  let climber = null;
  Object.entries(byUserGw).forEach(([uid, series]) => {
    const sorted = series.slice().sort((a, b) => a.gw - b.gw);
    for (let i = 1; i < sorted.length; i++) {
      const d = sorted[i].points - sorted[i - 1].points;
      if (!climber || d > climber.delta) climber = { user_id: uid, delta: d };
    }
  });
  if (climber && climber.delta <= 0) climber = null;

  const topBy = obj => Object.entries(obj).sort((a, b) => b[1] - a[1])[0];
  const champion = topBy(weeklyWins);
  const mostExact = topBy(exactTotals);
  const spoon = topBy(woodenSpoon);

  return {
    totals, champion: champion && champion[1] > 0 ? champion : null, climber,
    mostExact: mostExact && mostExact[1] > 0 ? mostExact : null,
    spoon: spoon && spoon[1] > 0 ? spoon : null
  };
}

function potMeta() {
  const g = activeGroup();
  const paidCount = Object.values(state.payments).filter(p => p.confirmed_paid_at).length;
  const pot = g ? gbp(g.stake_pence * state.members.length) : '£0';
  return { pot, paidCount, total: state.members.length };
}

function lockCountdownPill() {
  const upcoming = state.fixtures.filter(f => !isLocked(f.kickoff)).sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff))[0];
  if (!upcoming) return `<span class="pill lock">${ic('lock', 14)} All locked</span>`;
  return `<span class="pill lock" id="lockPill" data-kickoff="${esc(upcoming.kickoff)}">${ic('lock', 14)} Locks in <strong id="lockPillTime">${countdown(new Date(upcoming.kickoff) - Date.now())}</strong></span>`;
}

function meta() {
  const { pot, paidCount, total } = potMeta();
  return `<div class="hero-meta"><span class="pill">${ic('wallet', 14)} <strong>${pot}</strong> Pot</span><span class="pill">${ic('users', 14)} <strong>${paidCount}/${total}</strong> Paid</span>${lockCountdownPill()}</div>`;
}

function groupSwitcher() {
  if (state.groups.length < 2) return '';
  return `<div class="select-wrap" style="margin-bottom:12px"><select id="groupSwitch" aria-label="Active group" class="scorer-select">${state.groups.map(g => `<option value="${g.id}" ${g.id === state.activeGroupId ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select>${ic('chevronRight', 16)}</div>`;
}
function bindGroupSwitcher() {
  const el = document.querySelector('#groupSwitch');
  if (!el || el.dataset.bound === '1') return;
  el.dataset.bound = '1';
  el.addEventListener('change', async e => {
    state.activeGroupId = e.target.value;
    state.groupsStatus='loading';window.KickPotLive?.unmount();window.KickPotMatchday?.unmount();
    renderSessionLoading();
    // Switching groups refetches that group's members/payments/predictions from
    // Supabase, which can take a second or more on a slow connection. Without
    // this, the previous group's fully-rendered screen just sits there
    // untouched (looks frozen/unresponsive) and then snaps to the new group's
    // content all at once once the fetch resolves - the exact "words change
    // out of nowhere" feel we're trying to eliminate. Show a lightweight
    // in-place loading state on the switcher itself for that gap; the wrap
    // element is destroyed and rebuilt fresh by render(), so nothing needs to
    // clean this back up.
    const wrap = el.closest('.select-wrap');
    el.disabled = true;
    if (wrap) wrap.classList.add('kp-group-switching');
    try {
      await loadGroupData();
    } finally {
      render();
    }
  });
}

function paymentBanner() {
  if(activeGroup()?.payments_required===false)return '';
  const p = myPayment();
  if (p?.confirmed_paid_at) return '';
  if (p?.claimed_paid_at) return `<div class="status warning">${ic('clock', 15)} Waiting for the Treasurer to confirm your payment. Predictions unlock once confirmed.</div>`;
  return `<div class="status error">${ic('lock', 15)} Pay the Treasurer for this Gameweek to unlock predictions. Go to the Group tab.</div>`;
}

function renderGW() {
  window.KickPotMatchday.mount({state,group:activeGroup(),pickFor,groupSwitcher,bindGroupSwitcher});
  return;
}
const draftPicks = {};
function pickFor(fixtureId) {
  const key = `${state.activeGroupId}:${fixtureId}`;
  if (!draftPicks[key]) {
    const existing = state.predictions[fixtureId];
    draftPicks[key] = existing
      ? { home: existing.predicted_home, away: existing.predicted_away }
      : { home: 1, away: 1 };
  }
  return draftPicks[key];
}

function renderHistory() {
  if (!state.groups.length) return state.groupsStatus === 'loaded' ? renderOnboarding() : renderSessionLoading();
  const allFinished = state.fixtures.length && state.fixtures.every(f => ['FT', 'AET', 'PEN'].includes(f.status?.short));
  const alreadySettled = state.history.some(h => h.gameweek_id === state.gameweekId);
  const latestWinner = state.history[0];
  const historyGroup=state.activeGroupId,historyUser=myId();
  const winners=latestWinner?.winner_user_ids||[latestWinner?.winner_user_id].filter(Boolean);
  const resultTitle=latestWinner?.settlement_kind==='draw'?'DRAW · '+winners.map(profileName).join(' & '):winners.length?profileName(winners[0])+' WINS':'NO WINNER';
  screen.innerHTML = `${latestWinner ? `<section class="card winner"><div class="trophy">${ic('crown', 22)}</div><div class="eyebrow">Gameweek Champion</div><h1>${esc(resultTitle.toUpperCase())}</h1><div class="muted">${esc(latestWinner.gameweeks?.round_name || '')}</div></section>` : `<section class="card"><div class="empty">No Gameweeks settled yet.</div></section>`}
  ${groupSwitcher()}
  ${isTreasurer()?state.readyWeeks.map(w=>`<section class="card"><div class="card-title">Ready to settle · ${esc(w.gameweeks.round_name)}</div><button class="primary" data-settle-week="${w.gameweek_id}">Settle Matchday & Crown Winner</button></section>`).join(''):''}
  <section class="card"><div class="card-title">${ic('clock')} Past Gameweeks</div>${state.history.length ? state.history.map(h => `<div class="payment-row"><span>${esc(h.gameweeks?.round_name || 'Gameweek')}</span><b>${esc(profileName(h.winner_user_id))}</b></div>`).join('') : '<div class="empty">Settle a Gameweek to see it here.</div>'}</section>
  <section class="card" id="seasonStatsCard"><div class="card-title">${ic('climb')} Your Season Stats</div><div class="empty">Loading…</div></section>
  <section class="card" id="awardsCard"><div class="card-title">${ic('award')} Awards</div><div class="empty">Loading…</div></section>`;
  bindGroupSwitcher();
  screen.querySelectorAll('[data-settle-week]').forEach(button=>button.addEventListener('click',async()=>{
    button.disabled=true;
    try{const {error}=await state.supabase.rpc('settle_gameweek',{p_group_id:historyGroup,p_gameweek_id:Number(button.dataset.settleWeek)});if(error)throw error;
      toast('Matchday settled.');await loadGroupData();await render();
    }catch(error){toast(error.message||'Could not settle. Try again.','error');button.disabled=false;}
  }));
  loadGroupSeasonBoard().then(rows => {
    if (state.tab !== 'history'||state.activeGroupId!==historyGroup||myId()!==historyUser) return;
    const mine = rows.filter(r => r.user_id === myId());
    const s = {
      points: mine.reduce((a, r) => a + r.points, 0),
      exact: mine.reduce((a, r) => a + (r.exact_scores || 0), 0),
      wins: state.history.filter(h => h.winner_user_id === myId()).length
    };
    const statsCard = document.querySelector('#seasonStatsCard');
    if (statsCard) statsCard.innerHTML = `<div class="card-title">${ic('climb')} Your Season Stats</div><div class="statgrid"><div class="stat"><b>${s.points}</b><small>Total points</small></div><div class="stat"><b>${s.exact}</b><small>Exact scores</small></div><div class="stat"><b>${s.wins}</b><small>Gameweeks won</small></div></div>`;

    const a = computeAwards(rows, state.history);
    const tiles = [];
    if (a?.champion) tiles.push({ icon: 'crown', label: 'Champion', name: profileName(a.champion[0]) });
    if (a?.climber) tiles.push({ icon: 'climb', label: 'Biggest Climber', name: profileName(a.climber.user_id) });
    if (a?.mostExact) tiles.push({ icon: 'star', label: 'Sharpshooter', name: profileName(a.mostExact[0]) });
    const awardsCard = document.querySelector('#awardsCard');
    if (awardsCard) awardsCard.innerHTML = `<div class="card-title">${ic('award')} Awards</div>${tiles.length ? `<div class="award-grid">${tiles.map(t => `<div class="award-tile"><div class="award-icon">${ic(t.icon, 18)}</div><b>${esc(t.name)}</b><small>${esc(t.label)}</small></div>`).join('')}</div>` : '<div class="empty">Not enough settled Gameweeks yet.</div>'}`;
  }).catch(()=>{for(const id of ['seasonStatsCard','awardsCard']){const el=document.getElementById(id);if(el)el.textContent='Stats unavailable. Reopen History to try again.';}});
}

function onAction(button,action){
  button?.addEventListener('click',async event=>{
    if(button.dataset.busy)return;button.dataset.busy='1';button.disabled=true;
    try{await action(event);}catch(error){toast(error.message||'Could not complete the action. Please try again.','error');}
    finally{delete button.dataset.busy;button.disabled=false;}
  });
}
function renderGroup() {
  if (!state.groups.length) return state.groupsStatus === 'loaded' ? renderOnboarding() : renderSessionLoading();
  const g = activeGroup();
  const p = myPayment();
  const { pot, paidCount, total } = potMeta();
  const anyUnconfirmed = Object.values(state.payments).some(x => !x.confirmed_paid_at);
  const modeText = g.payments_required === false ? 'For fun' : `${gbp(g.stake_pence)} / week`;
  screen.innerHTML = `<section class="group-head"><div class="group-emblem">${initials(g.name)}</div><div><div class="private-badge">${ic('shield', 13)} Private Group</div><h1 style="margin:4px 0 2px;font-size:26px;letter-spacing:-1px;line-height:1.1">${esc(g.name)}</h1><div class="hero-sub">${modeText} · ${state.members.length} members · Treasurer: ${esc(profileName(g.treasurer_id))}</div></div></section>
  <div class="pill" style="margin:4px 0 14px">Join code <strong class="accent" style="letter-spacing:3px;margin-left:5px">${esc(g.join_code)}</strong></div>
  ${groupSwitcher()}
  <section class="card"><div class="card-head"><div class="card-title">${ic('wallet')} ${esc(state.round || 'Gameweek')} Pot</div><span class="badge">${paidCount}/${total} paid</span></div><div class="pot-hero"><div class="pot-amount">${pot}</div><div class="pot-icon">${ic('wallet', 26)}</div></div></section>
  <section class="card"><div class="card-head"><div class="card-title">${ic('users')} Member Payments</div>${isTreasurer() && anyUnconfirmed ? `<button class="secondary chip-btn" id="confirmAllBtn">Confirm All</button>` : ''}</div>${state.members.map(m => {
    const pay = state.payments[m.user_id];
    const status = pay?.confirmed_paid_at ? 'Paid' : pay?.claimed_paid_at ? 'Claimed' : 'Unpaid';
    const cls = pay?.confirmed_paid_at ? 'paid' : 'unpaid';
    const canConfirm = isTreasurer() && !pay?.confirmed_paid_at;
    return `<div class="payment-row"><div class="row-left">${avatar(profileName(m.user_id), 'sm')}<strong>${esc(profileName(m.user_id))}${m.user_id === myId() ? ' (you)' : ''}</strong></div><span><span class="${cls}">${pay?.confirmed_paid_at ? ic('check', 15) : ''} ${status}</span>${canConfirm ? `<button class="secondary confirm-btn chip-btn" data-user="${m.user_id}">Confirm</button>` : ''}</span></div>`;
  }).join('')}</section>
  <section class="card"><div class="card-title">${ic('clock')} This Week</div><div class="rivalry-row"><span class="row-left">${ic('trophy', 15)} Winner takes all</span></div><div class="rivalry-row"><span class="row-left">${ic('lock', 15)} Predictions lock per fixture kickoff</span></div><div class="rivalry-row"><span class="row-left">${ic('target', 15)} Exact score +3 · Correct result +1</span></div></section>
  <section class="card" id="rivalryCard"><div class="card-title">${ic('award')} Group Rivalry</div><div class="empty">Loading…</div></section>
  <section class="card"><div class="card-title">${ic('landmark')} Pay the Treasurer</div><p class="muted">Money is sent separately. KickPot only records whether the Treasurer has confirmed payment.</p>
  <div class="bankbox"><div class="bankline"><span>Account name</span><b>${esc(g.bank_account_name || 'Not set')}</b></div><div class="bankline"><span>Sort code</span><b>${esc(g.bank_sort_code || '••-••-••')}</b></div><div class="bankline"><span>Account no.</span><b>${esc(g.bank_account_number || '••••••••')}</b></div><div class="bankline"><span>Reference</span><b>${esc(state.round || 'GW')}-${esc((state.session.user.email || '').split('@')[0].toUpperCase())}</b></div></div>
  ${p?.claimed_paid_at ? `<div class="status warning" style="margin-top:12px">${ic('clock', 15)} Waiting on Treasurer confirmation.</div>` : `<button class="secondary" id="claimPaid" style="margin-top:12px">I've Paid</button>`}
  </section>
  ${isTreasurer() ? `<section class="card"><div class="card-title">${ic('landmark')} Treasurer · Bank Details</div><div class="scorer-row"><input class="scorer-select" id="bankName" aria-label="Bank account name" placeholder="Account name" value="${esc(g.bank_account_name || '')}"></div><div class="scorer-row"><input class="scorer-select" id="bankSort" aria-label="Sort code" placeholder="Sort code" value="${esc(g.bank_sort_code || '')}"></div><div class="scorer-row"><input class="scorer-select" id="bankAcc" aria-label="Bank account number" placeholder="Account number" value="${esc(g.bank_account_number || '')}"></div><button class="secondary" id="saveBankBtn" style="margin-top:8px">Save Bank Details</button></section>` : ''}
  <section class="card"><div class="card-title">Leave Group</div>${isTreasurer()
    ? `<p class="muted">You're the Treasurer — transfer control to another member (via Admin → Member administration) before you can leave.</p>`
    : `<p class="muted">You'll lose access to this group's predictions and history.</p><button class="secondary" id="leaveGroupBtn" style="margin-top:8px;border-color:#6f3535;color:#ff9d9d">Leave Group</button>`}
  </section>`;

  const paymentWeek=state.gameweekId,paymentUser=myId();
  bindGroupSwitcher();
  onAction(document.querySelector('#claimPaid'), async () => {
    const { error } = await state.supabase.from('payments').update({ claimed_paid_at: new Date().toISOString() }).eq('group_id', g.id).eq('gameweek_id', paymentWeek).eq('user_id', paymentUser);
    if (error) return toast(error.message, 'error');
    toast('Marked as paid — waiting on Treasurer.'); await loadGroupData(); await render();
  });
  document.querySelectorAll('.confirm-btn').forEach(btn => onAction(btn, async () => {
    const { error } = await state.supabase.from('payments').update({ confirmed_paid_at: new Date().toISOString(), confirmed_by: paymentUser }).eq('group_id', g.id).eq('gameweek_id', paymentWeek).eq('user_id', btn.dataset.user);
    if (error) return toast(error.message, 'error');
    toast('Payment confirmed.'); await loadGroupData(); await render();
  }));
  onAction(document.querySelector('#confirmAllBtn'), async () => {
    const targets = Object.entries(state.payments).filter(([, x]) => !x.confirmed_paid_at).map(([uid]) => uid);
    const { error } = await state.supabase.from('payments').update({ confirmed_paid_at: new Date().toISOString(), confirmed_by: paymentUser }).eq('group_id', g.id).eq('gameweek_id', paymentWeek).in('user_id', targets);
    if (error) return toast(error.message, 'error');
    toast('All payments confirmed.'); await loadGroupData(); await render();
  });
  onAction(document.querySelector('#saveBankBtn'), async () => {
    const { error } = await state.supabase.from('groups').update({
      bank_account_name: document.querySelector('#bankName').value.trim() || null,
      bank_sort_code: document.querySelector('#bankSort').value.trim() || null,
      bank_account_number: document.querySelector('#bankAcc').value.trim() || null
    }).eq('id', g.id);
    if (error) return toast(error.message, 'error');
    toast('Bank details saved.'); await loadGroups(); await render();
  });
  onAction(document.querySelector('#leaveGroupBtn'), async () => {
    if (!confirm(`Leave ${g.name}? You'll lose access to its predictions and history.`)) return;
    const { error } = await state.supabase.rpc('leave_group', { p_group_id: g.id });
    if (error) return toast(error.message, 'error');
    state.activeGroupId = null;
    toast('Left the group.'); await loadGroups(); state.groupsStatus = 'loaded'; await render();
  });

  loadGroupSeasonBoard().then(rows => {
    if (state.tab !== 'group') return;
    const a = computeAwards(rows, state.history);
    const card = document.querySelector('#rivalryCard');
    if (!card) return;
    if (!a || (!a.champion && !a.mostExact && !a.spoon)) { card.innerHTML = `<div class="card-title">${ic('award')} Group Rivalry</div><div class="empty">Play a few Gameweeks to build rivalry stats.</div>`; return; }
    const rows2 = [];
    if (a.champion) rows2.push(['trophy', 'Most weekly wins', `${profileName(a.champion[0])} (${a.champion[1]})`]);
    if (a.mostExact) rows2.push(['target', 'Most exact scores', `${profileName(a.mostExact[0])} (${a.mostExact[1]})`]);
    if (a.spoon) rows2.push(['dash', 'Wooden spoon', `${profileName(a.spoon[0])} (${a.spoon[1]})`]);
    card.innerHTML = `<div class="card-title">${ic('award')} Group Rivalry</div>${rows2.map(([icon, label, val]) => `<div class="rivalry-row"><span class="row-left">${ic(icon, 15)} ${label}</span><b class="accent">${esc(val)}</b></div>`).join('')}`;
  }).catch(()=>{});
}

function renderOnboarding() {
  screen.innerHTML = `<section class="hero"><h1>Start a Pot</h1><div class="hero-sub">Create a private group or join one with a code.</div></section>
  <section class="card"><div class="card-title">${ic('users')} Create a Group</div><div class="scorer-row"><input class="scorer-select" id="newGroupName" aria-label="Group name" placeholder="Group name, e.g. VAR Is Corrupt"></div><div class="kp-mode-pick" role="group" aria-label="Play mode"><button type="button" class="kp-mode-pick-btn is-active" data-mode="pot">Play for a Pot</button><button type="button" class="kp-mode-pick-btn" data-mode="fun">Play for Fun</button></div><div class="scorer-row" id="newGroupStakeRow"><input class="scorer-select" id="newGroupStake" aria-label="Weekly stake in pounds" inputmode="numeric" placeholder="Stake per Gameweek (£)" value="5"></div><button class="primary" id="createGroupBtn">Create Group</button></section>
  <section class="card"><div class="card-title">${ic('shield')} Join a Group</div><div class="scorer-row"><input class="scorer-select" id="joinCode" aria-label="Group invite code" placeholder="6-character join code" style="text-transform:uppercase"></div><button class="secondary" id="joinGroupBtn">Join Group</button></section>
  <div id="onboardStatus"></div>`;
  const modeButtons = [...screen.querySelectorAll('.kp-mode-pick-btn')];
  const stakeRow = screen.querySelector('#newGroupStakeRow');
  modeButtons.forEach(btn => btn.addEventListener('click', () => {
    modeButtons.forEach(b => b.classList.toggle('is-active', b === btn));
    stakeRow.hidden = btn.dataset.mode === 'fun';
  }));
  onAction(document.querySelector('#createGroupBtn'), async () => {
    const name = document.querySelector('#newGroupName').value.trim();
    const isFun = screen.querySelector('.kp-mode-pick-btn[data-mode="fun"]')?.classList.contains('is-active');
    const stake = isFun ? 0 : Math.max(0, Number(document.querySelector('#newGroupStake').value) || 0) * 100;
    const statusEl = document.querySelector('#onboardStatus');
    if (!name) { statusEl.className = 'status error'; statusEl.textContent = 'Give your group a name.'; return; }
    const { data, error } = await state.supabase.rpc('create_group', { p_name: name, p_stake_pence: stake });
    if (error) { statusEl.className = 'status error'; statusEl.textContent = error.message; return; }
    state.activeGroupId = data.id; state.groupsStatus = 'loading'; await loadGroups(); state.groupsStatus = 'loaded'; await render();
  });
  onAction(document.querySelector('#joinGroupBtn'), async () => {
    const code = document.querySelector('#joinCode').value.trim();
    const statusEl = document.querySelector('#onboardStatus');
    const { data, error } = await state.supabase.rpc('join_group', { p_join_code: code });
    if (error) { statusEl.className = 'status error'; statusEl.textContent = error.message; return; }
    state.activeGroupId = data.id; state.groupsStatus = 'loading'; await loadGroups(); state.groupsStatus = 'loaded'; await render();
  });
}

function renderAuth() {
  screen.innerHTML = `<section class="hero"><div class="eyebrow">KickPot</div><h1>Predict. Score. Win the pot.</h1><div class="hero-sub">Sign in with a magic link — no password needed.</div></section>
  <section class="card"><div class="scorer-row"><input class="scorer-select" id="authEmail" type="email" placeholder="you@email.com" autocomplete="email"></div><button class="primary" id="sendLinkBtn">Send Magic Link</button><div id="authStatus"></div></section>`;
  ensurePasswordUI();
  document.dispatchEvent(new Event('kp:auth-render'));
}

function renderConfigError() {
  screen.innerHTML = `<section class="card"><div class="card-title accent">Setup incomplete</div><p class="muted">Supabase isn't configured on the server yet. Add SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in Railway.</p></section>`;
}

async function render({ resetLive = false } = {}) {
  const run=++renderRun;
  document.body.dataset.kpScreen=state.tab;
  delete screen.dataset.groupReference;screen.className='screen';
  document.body.classList.remove('kp-group-panel-open');
  if(state.tab!=='gw')window.KickPotMatchday?.unmount();
  nav.forEach(n => n.classList.toggle('active', n.dataset.tab === state.tab));
  if (state.tab !== 'live') window.KickPotLive?.unmount();
  if (!state.config?.supabaseConfigured) return renderConfigError();
  if (!state.session) {window.KickPotLive?.unmount();return renderAuth();}
  if (state.groupsStatus === 'loading') return renderSessionLoading();
  if (state.groupsStatus === 'error') return showError(new Error('Couldn’t load your pot. Check your connection and try again.'));
  if (state.tab === 'live') {
    if (!state.groups.length) return renderOnboarding();
    window.KickPotLive?.mount({ reset: resetLive, context: {groupId:state.activeGroupId,userId:myId()} });
  } else {
    ({ gw: renderGW, history: renderHistory, group: renderGroup }[state.tab])();
    if(state.tab==='group'&&state.groups.length){
      enhanceGroup();
      await enhanceAdmin();if(run!==renderRun)return;
      await refreshGroupFeatures(true);if(run!==renderRun)return;
      window.KickPotGroup?.render();
      if(history.state?.kpGroupPage)window.KickPotGroup?.restore(history.state.kpGroupPage);
    }
    if(state.tab==='history')await window.KickPotHistory?.mount(state.activeGroupId);
  }
  updateBell();
}
nav.forEach(btn => btn.addEventListener('click', () => {
  state.tab = btn.dataset.tab;
  history.pushState({kpTab:state.tab},'');
  render({ resetLive: state.tab === 'live' }).catch(showError);
  window.scrollTo({top:0,behavior:'auto'});
}));
history.replaceState({kpTab:state.tab},'');
window.addEventListener('popstate',event=>{const tab=event.state?.kpTab||'gw';if(['gw','live','history','group'].includes(tab)){state.tab=tab;render().catch(showError);}});
userChip?.addEventListener('click',()=>openAccountSettings().catch(showError));
document.querySelector('#bellBtn')?.addEventListener('click', () => {
  const p = myPayment();
  if (p && !p.confirmed_paid_at) return toast(p.claimed_paid_at ? 'Waiting on Treasurer confirmation.' : 'You have an unpaid Gameweek stake.', 'warning');
  if (isTreasurer() && Object.values(state.payments).some(x => !x.confirmed_paid_at)) return toast('Some members still need payment confirmed.', 'warning');
  if (isTreasurer() && state.fixtures.length && state.fixtures.every(f => ['FT', 'AET', 'PEN'].includes(f.status?.short)) && !state.history.some(h => h.gameweek_id === state.gameweekId)) return toast('This Gameweek is ready to settle.', 'warning');
  toast("You're all caught up.");
});

function showError(error){
  window.KickPotLive?.unmount();window.KickPotMatchday?.unmount();
  screen.innerHTML='<section class="card" role="alert"><h1>Couldn’t load KickPot</h1><p>'+esc(error.message||'Check your connection and try again.')+'</p><button class="primary" id="retryApp">Try again</button></section>';
  screen.querySelector('#retryApp').onclick=()=>{(state.supabase?onSessionReady():boot()).catch(showError);};
}
window.KickPotApp={refresh:async()=>{await loadGroups();await render();},selectGroup:async(id)=>{state.activeGroupId=id;await loadGroups();await render();},context:()=>state};
let refreshing=false;
async function resume(){
  if(refreshing||document.hidden||!state.session||state.groupsStatus==='loading'||state.tab==='live'||document.querySelector('.group-reference-panel,.kp-account-overlay')||window.KickPotMatchday?.isSaving())return;
  refreshing=true;try{if(await loadGroupData())await render();}finally{refreshing=false;}
}
window.addEventListener('pageshow',()=>resume().catch(showError));
window.addEventListener('online',()=>resume().catch(showError));
document.addEventListener('visibilitychange',()=>resume().catch(showError));
setInterval(()=>{if(state.tab==='gw')resume().catch(showError);},30000);
boot().catch(showError);
