import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const screen = document.querySelector('#screen');
const nav = [...document.querySelectorAll('.nav-item')];
const installBtn = document.querySelector('#installBtn');
const userChip = document.querySelector('#userChip');
const bellDot = document.querySelector('#bellDot');
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; installBtn.hidden = false });
installBtn.addEventListener('click', async () => { if (!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; installBtn.hidden = true });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

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
  const letters = words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0].slice(0, 2);
  return esc(letters.toUpperCase());
}

const state = {
  tab: 'gw', supabase: null, session: null, config: null,
  groups: [], activeGroupId: null, gameweekId: null,
  fixtures: [], round: null, predictions: {}, members: [], profiles: {}, payments: {},
  leaderboard: [], history: [],
  prevRanks: {}, rankDelta: {}, lastGoal: null, prevGoals: {}, seasonBoard: []
};

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

async function boot() {
  state.config = await fetch('/api/config').then(r => r.json()).catch(() => null);
  if (!state.config?.supabaseConfigured) { renderConfigError(); return; }
  state.supabase = createClient(state.config.supabaseUrl, state.config.supabasePublishableKey);
  const { data: { session } } = await state.supabase.auth.getSession();
  state.session = session;
  state.supabase.auth.onAuthStateChange((_evt, sess) => { state.session = sess; state.groups = []; state.activeGroupId = null; onSessionReady() });
  onSessionReady();
}

async function onSessionReady() {
  if (!state.session) { renderAuth(); return; }
  updateUserChip();
  await ensureProfile();
  await loadGroups();
  render();
}

function updateUserChip() {
  if (!userChip) return;
  if (!state.session) { userChip.hidden = true; return; }
  userChip.hidden = false;
  userChip.textContent = (state.session.user.email || '?')[0].toUpperCase();
}

async function ensureProfile() {
  const email = state.session.user.email || 'player';
  await state.supabase.from('profiles').upsert(
    { id: myId(), display_name: email.split('@')[0] },
    { onConflict: 'id', ignoreDuplicates: true }
  );
}

async function loadGroups() {
  const { data, error } = await state.supabase.from('groups').select('*').order('created_at');
  if (error) { toast(error.message, 'error'); return; }
  state.groups = data || [];
  if (!state.activeGroupId || !state.groups.some(g => g.id === state.activeGroupId)) {
    state.activeGroupId = state.groups[0]?.id || null;
  }
  if (state.activeGroupId) await loadGroupData();
}

async function loadGroupData() {
  const gid = state.activeGroupId;
  const sb = state.supabase;
  try {
    const { data: gwId, error: gwErr } = await sb.rpc('ensure_current_gameweek', { p_group_id: gid });
    if (gwErr) throw gwErr;
    state.gameweekId = gwId;

    const [{ data: members }, { data: payments }] = await Promise.all([
      sb.from('group_members').select('user_id, role').eq('group_id', gid),
      sb.from('payments').select('*').eq('group_id', gid).eq('gameweek_id', gwId)
    ]);
    state.members = members || [];
    state.payments = Object.fromEntries((payments || []).map(p => [p.user_id, p]));

    const ids = state.members.map(m => m.user_id);
    if (ids.length) {
      const { data: profiles } = await sb.from('profiles').select('id,display_name').in('id', ids);
      state.profiles = Object.fromEntries((profiles || []).map(p => [p.id, p]));
    }

    const fxRes = await fetch('/api/football/fixtures').then(r => r.json()).catch(() => ({ fixtures: [], round: null }));
    state.fixtures = fxRes.fixtures || [];
    state.round = fxRes.round;

    const fixtureIds = state.fixtures.map(f => f.id).filter(Boolean);
    if (fixtureIds.length) {
      const { data: preds } = await sb.from('predictions').select('*').eq('group_id', gid).eq('user_id', myId()).in('fixture_id', fixtureIds);
      state.predictions = Object.fromEntries((preds || []).map(p => [p.fixture_id, p]));
    } else {
      state.predictions = {};
    }

    await refreshLeaderboard();

    const { data: hist } = await sb.from('group_gameweeks').select('*, gameweeks(round_name)').eq('group_id', gid).not('settled_at', 'is', null).order('settled_at', { ascending: false });
    state.history = hist || [];
    updateBell();
  } catch (err) {
    toast(err.message || String(err), 'error');
  }
}

async function refreshLeaderboard() {
  const { data: lb } = await state.supabase.from('group_leaderboard').select('*').eq('group_id', state.activeGroupId).eq('gameweek_id', state.gameweekId).order('points', { ascending: false });
  const rows = lb || [];
  const prevOrder = state.prevRanks[state.activeGroupId] || {};
  const delta = {};
  rows.forEach((r, i) => {
    const prevIdx = prevOrder[r.user_id];
    delta[r.user_id] = prevIdx == null ? 0 : prevIdx - i;
  });
  state.rankDelta = delta;
  state.prevRanks[state.activeGroupId] = Object.fromEntries(rows.map((r, i) => [r.user_id, i]));
  state.leaderboard = rows;
}

async function loadGroupSeasonBoard() {
  const { data } = await state.supabase.from('group_leaderboard').select('*').eq('group_id', state.activeGroupId);
  state.seasonBoard = data || [];
  return state.seasonBoard;
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

async function refreshLiveScores() {
  const prevGoals = state.prevGoals || {};
  const fxRes = await fetch('/api/football/fixtures').then(r => r.json()).catch(() => null);
  if (fxRes) {
    let latest = null;
    (fxRes.fixtures || []).forEach(f => {
      const prev = prevGoals[f.id];
      if (!prev || f.goals?.home == null) return;
      if (f.goals.home > prev.home) latest = { team: f.home?.name };
      else if (f.goals.away > prev.away) latest = { team: f.away?.name };
    });
    if (latest) state.lastGoal = latest;
    state.prevGoals = Object.fromEntries((fxRes.fixtures || []).filter(f => f.id).map(f => [f.id, { home: f.goals?.home, away: f.goals?.away }]));
    state.fixtures = fxRes.fixtures || state.fixtures;
    state.round = fxRes.round;
  }
  await refreshLeaderboard();
  updateBell();
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
  return `<div class="select-wrap" style="margin-bottom:12px"><select id="groupSwitch" class="scorer-select">${state.groups.map(g => `<option value="${g.id}" ${g.id === state.activeGroupId ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select>${ic('chevronRight', 16)}</div>`;
}
function bindGroupSwitcher() {
  document.querySelector('#groupSwitch')?.addEventListener('change', async e => { state.activeGroupId = e.target.value; await loadGroupData(); render() });
}

function paymentBanner() {
  const p = myPayment();
  if (p?.confirmed_paid_at) return '';
  if (p?.claimed_paid_at) return `<div class="status warning">${ic('clock', 15)} Waiting for the Treasurer to confirm your payment. Predictions unlock once confirmed.</div>`;
  return `<div class="status error">${ic('lock', 15)} Pay the Treasurer for this Gameweek to unlock predictions. Go to the Group tab.</div>`;
}

let lockTickInterval = null;
function startLockTicker() {
  clearInterval(lockTickInterval);
  lockTickInterval = setInterval(() => {
    const pill = document.querySelector('#lockPill');
    const timeEl = document.querySelector('#lockPillTime');
    if (!pill || !timeEl) { clearInterval(lockTickInterval); return; }
    const ms = new Date(pill.dataset.kickoff) - Date.now();
    if (ms <= 0) { if (state.tab === 'gw') renderGW(); return; }
    timeEl.textContent = countdown(ms);
  }, 1000);
}

function renderGW() {
  if (!state.groups.length) return renderOnboarding();
  const locked = !myPayment()?.confirmed_paid_at;
  screen.innerHTML = `<section class="hero"><h1>${esc(state.round || 'Gameweek')}</h1>${meta()}</section>
  ${groupSwitcher()}
  ${paymentBanner()}
  <section class="card"><div class="card-head"><div class="card-title">${ic('target')} Your Picks</div><span class="muted">${state.fixtures.length} fixtures</span></div>
  ${state.fixtures.length ? state.fixtures.map(f => fixtureRow(f, locked)).join('') : `<div class="empty">Fixtures are syncing — check back shortly.</div>`}
  <button class="primary" id="lockPicks" ${locked ? 'disabled' : ''}>${ic('lock', 17)} Lock In My Picks ${ic('chevronRight', 17)}</button><div id="gwStatus" class="rules">Your friends' picks stay hidden until kick-off.</div></section>`;

  bindGroupSwitcher();
  startLockTicker();

  document.querySelectorAll('[data-fixture]').forEach(row => {
    const id = Number(row.dataset.fixture);
    const fLocked = locked || row.dataset.locked === '1';
    if (fLocked) return;
    const pred = pickFor(id);
    row.querySelectorAll('[data-score]').forEach(inp => inp.addEventListener('input', () => { pred[inp.dataset.score] = Math.max(0, Math.min(20, Number(inp.value) || 0)); inp.value = pred[inp.dataset.score] }));
    row.querySelectorAll('[data-step]').forEach(btn => btn.addEventListener('click', () => { const [side, delta] = btn.dataset.step.split(','); pred[side] = Math.max(0, Math.min(20, pred[side] + Number(delta))); renderGW() }));
  });

  document.querySelector('#lockPicks')?.addEventListener('click', submitPicks);
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

function predictionBadge(saved, f) {
  if (!saved || !['FT', 'AET', 'PEN'].includes(f.status?.short) || f.goals?.home == null) return '';
  const exact = saved.predicted_home === f.goals.home && saved.predicted_away === f.goals.away;
  const sign = n => (n > 0) - (n < 0);
  const result = sign(saved.predicted_home - saved.predicted_away) === sign(f.goals.home - f.goals.away);
  if (exact) return `<span class="badge exact">+3 EXACT</span>`;
  if (result) return `<span class="badge result">+1 RESULT</span>`;
  return `<span class="badge none">0 PTS</span>`;
}

function fixtureRow(f, groupLocked) {
  const kickLocked = isLocked(f.kickoff);
  const locked = groupLocked || kickLocked;
  const pred = pickFor(f.id);
  const saved = state.predictions[f.id];
  return `<div class="fixture" data-fixture="${f.id}" data-locked="${locked ? '1' : '0'}">
    <div class="teams"><div class="team">${crest(f.home)}<span>${esc(f.home?.name)}</span></div>
    <div class="scorepick">${locked
      ? `<span class="scorebox" style="display:grid;place-items:center">${saved ? saved.predicted_home : '–'}</span><span class="dash">–</span><span class="scorebox" style="display:grid;place-items:center">${saved ? saved.predicted_away : '–'}</span>`
      : `<button class="step" data-step="home,-1">−</button><input class="scorebox" inputmode="numeric" value="${pred.home}" data-score="home"><span class="dash">–</span><input class="scorebox" inputmode="numeric" value="${pred.away}" data-score="away"><button class="step" data-step="away,1">＋</button>`}
    </div><div class="team away"><span>${esc(f.away?.name)}</span>${crest(f.away)}</div></div>
    <div class="rules">${kickoffLabel(f.kickoff)} ${locked ? `· ${ic('lock', 11)} locked` : '· locks at kick-off'} ${saved ? `· <strong class="accent">${saved.points} pts</strong>` : ''} ${predictionBadge(saved, f)}</div>
  </div>`;
}

async function submitPicks() {
  const rows = state.fixtures.filter(f => !isLocked(f.kickoff)).map(f => {
    const p = pickFor(f.id);
    return { group_id: state.activeGroupId, fixture_id: f.id, user_id: myId(), predicted_home: p.home, predicted_away: p.away };
  });
  const statusEl = document.querySelector('#gwStatus');
  if (!rows.length) { statusEl.className = 'status warning'; statusEl.textContent = 'No open fixtures left to predict.'; return; }
  const { error } = await state.supabase.from('predictions').upsert(rows, { onConflict: 'group_id,fixture_id,user_id' });
  if (error) { statusEl.className = 'status error'; statusEl.textContent = error.message.includes('row-level security') ? 'Your payment needs Treasurer confirmation before predictions unlock.' : error.message; return; }
  statusEl.className = 'status success'; statusEl.textContent = '✓ Picks locked in and synced for the group.';
  await loadGroupData(); renderGW();
}

function rankMove(uid) {
  const d = state.rankDelta[uid] || 0;
  if (d > 0) return `<span class="rank-move up">${ic('arrowUp', 12)}${d}</span>`;
  if (d < 0) return `<span class="rank-move down">${ic('arrowDown', 12)}${-d}</span>`;
  return `<span class="rank-move same">${ic('dash', 12)}</span>`;
}

function goalSwingCard() {
  const g = state.lastGoal;
  const inPlay = state.fixtures.some(f => !['NS', 'FT', 'AET', 'PEN', 'PST', 'CANC'].includes(f.status?.short));
  if (!g || !inPlay) return '';
  const mover = state.leaderboard.find(m => (state.rankDelta[m.user_id] || 0) > 0);
  const faller = state.leaderboard.find(m => (state.rankDelta[m.user_id] || 0) < 0);
  const leader = state.leaderboard[0];
  return `<section class="card swing"><div class="eyebrow">${ic('zap', 13)} Goal Swing</div><h2>GOAL — ${esc(g.team)}</h2>
  <div>${mover ? `${esc(profileName(mover.user_id))} <span class="accent">${rankMove(mover.user_id)}</span>` : ''}${mover && faller ? ' · ' : ''}${faller ? `${esc(profileName(faller.user_id))} ${rankMove(faller.user_id)}` : ''}${!mover && !faller ? 'Standings unchanged so far.' : ''}</div>
  ${leader ? `<p class="muted">${esc(profileName(leader.user_id))} is now leading the pot.</p>` : ''}</section>`;
}

function whatYouNeedCard() {
  if (!state.leaderboard.length) return '';
  const idx = state.leaderboard.findIndex(m => m.user_id === myId());
  if (idx < 0) return '';
  const stillPlaying = state.fixtures.filter(f => !['FT', 'AET', 'PEN', 'CANC'].includes(f.status?.short)).length;
  let msg;
  if (idx === 0) {
    const gap = state.leaderboard[1] ? state.leaderboard[0].points - state.leaderboard[1].points : null;
    msg = gap != null ? `You're leading by ${gap} pt${gap === 1 ? '' : 's'} over ${esc(profileName(state.leaderboard[1].user_id))}.` : "You're leading the pot.";
  } else {
    const gap = state.leaderboard[0].points - state.leaderboard[idx].points;
    msg = `You're ${gap} pt${gap === 1 ? '' : 's'} behind ${esc(profileName(state.leaderboard[0].user_id))}.`;
  }
  if (stillPlaying) msg += ` ${stillPlaying} fixture${stillPlaying === 1 ? '' : 's'} still to finish.`;
  return `<section class="card"><div class="card-title">${ic('target')} What You Need</div><p>${msg}</p></section>`;
}

function renderLive() {
  if (!state.groups.length) return renderOnboarding();
  const inPlayCount = state.fixtures.filter(f => !['NS', 'FT', 'AET', 'PEN', 'PST', 'CANC'].includes(f.status?.short)).length;
  screen.innerHTML = `<section class="hero"><h1>Live Matchday</h1><div class="hero-meta"><span class="pill">${ic('wallet', 14)} <strong>${potMeta().pot}</strong> Pot</span><span class="pill">${ic('radio', 14)} <strong>${inPlayCount}</strong> Live</span><span class="pill">${ic('clock', 14)} ${new Intl.DateTimeFormat('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date())}</span></div></section>
  ${groupSwitcher()}
  <section class="card"><div class="card-head"><div class="card-title">${ic('trophy')} Live Table</div>${inPlayCount ? '<span class="badge">LIVE</span>' : ''}</div>
  ${state.leaderboard.length ? `<table class="table"><thead><tr><th></th><th>#</th><th>Player</th><th class="pts">Pts</th></tr></thead><tbody>${state.leaderboard.map((m, i) => `<tr><td>${rankMove(m.user_id)}</td><td class="rank">${i + 1}</td><td><div class="row-left">${avatar(m.display_name || profileName(m.user_id), 'sm')}<strong>${esc(m.display_name || profileName(m.user_id))}</strong>${m.user_id === myId() ? ' <span class="muted">(you)</span>' : ''}</div></td><td class="pts">${m.points}</td></tr>`).join('')}</tbody></table>` : `<div class="empty">No predictions locked in yet.</div>`}
  </section>
  ${goalSwingCard()}
  <section class="card"><div class="card-title">${ic('target')} This Gameweek's Fixtures</div>${state.fixtures.map(liveFixtureRow).join('') || '<div class="empty">No fixtures yet.</div>'}</section>
  ${whatYouNeedCard()}`;
  bindGroupSwitcher();
}

function liveFixtureRow(f) {
  const live = !['NS', 'FT', 'AET', 'PEN', 'PST', 'CANC'].includes(f.status?.short);
  const saved = state.predictions[f.id];
  return `<div class="fixture"><div class="teams"><div class="team">${crest(f.home)}<span>${esc(f.home?.name)}</span></div>
  <div class="scorepick"><span class="scorebox ${live ? 'accent' : ''}" style="display:grid;place-items:center">${f.goals?.home ?? '–'}</span><span class="dash">–</span><span class="scorebox ${live ? 'accent' : ''}" style="display:grid;place-items:center">${f.goals?.away ?? '–'}</span></div>
  <div class="team away"><span>${esc(f.away?.name)}</span>${crest(f.away)}</div></div>
  <div class="rules">${live ? `<span class="accent">${f.status?.elapsed ? f.status.elapsed + "'" : 'LIVE'}</span>` : esc(f.status?.short || '')} ${saved ? `· Your pick: ${saved.predicted_home}-${saved.predicted_away}` : ''} ${predictionBadge(saved, f)}</div></div>`;
}

function renderHistory() {
  if (!state.groups.length) return renderOnboarding();
  const allFinished = state.fixtures.length && state.fixtures.every(f => ['FT', 'AET', 'PEN'].includes(f.status?.short));
  const alreadySettled = state.history.some(h => h.gameweek_id === state.gameweekId);
  const latestWinner = state.history[0];
  screen.innerHTML = `${latestWinner ? `<section class="card winner"><div class="trophy">${ic('crown', 22)}</div><div class="eyebrow">Gameweek Champion</div><h1>${esc((profileName(latestWinner.winner_user_id) || 'Player').toUpperCase())} WINS</h1><div class="muted">${esc(latestWinner.gameweeks?.round_name || '')}</div></section>` : `<section class="card"><div class="empty">No Gameweeks settled yet.</div></section>`}
  ${groupSwitcher()}
  ${isTreasurer() && allFinished && !alreadySettled ? `<section class="card"><div class="card-title">${ic('trophy')} Ready to Settle</div><p class="muted">All fixtures are final for this Gameweek.</p><button class="primary" id="settleBtn">Settle Gameweek & Crown Winner</button></section>` : ''}
  <section class="card"><div class="card-title">${ic('clock')} Past Gameweeks</div>${state.history.length ? state.history.map(h => `<div class="payment-row"><span>${esc(h.gameweeks?.round_name || 'Gameweek')}</span><b>${esc(profileName(h.winner_user_id))}</b></div>`).join('') : '<div class="empty">Settle a Gameweek to see it here.</div>'}</section>
  <section class="card" id="seasonStatsCard"><div class="card-title">${ic('climb')} Your Season Stats</div><div class="empty">Loading…</div></section>
  <section class="card" id="awardsCard"><div class="card-title">${ic('award')} Awards</div><div class="empty">Loading…</div></section>`;
  bindGroupSwitcher();
  document.querySelector('#settleBtn')?.addEventListener('click', async () => {
    const { error } = await state.supabase.rpc('settle_gameweek', { p_group_id: state.activeGroupId, p_gameweek_id: state.gameweekId });
    if (error) return toast(error.message, 'error');
    toast('Gameweek settled.'); await loadGroupData(); render();
  });
  loadGroupSeasonBoard().then(rows => {
    if (state.tab !== 'history') return;
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
  });
}

function renderGroup() {
  if (!state.groups.length) return renderOnboarding();
  const g = activeGroup();
  const p = myPayment();
  const { pot, paidCount, total } = potMeta();
  const anyUnconfirmed = Object.values(state.payments).some(x => !x.confirmed_paid_at);
  screen.innerHTML = `<section class="group-head"><div class="group-emblem">${initials(g.name)}</div><div><div class="private-badge">${ic('shield', 13)} Private Group</div><h1 style="margin:4px 0 2px;font-size:26px;letter-spacing:-1px;line-height:1.1">${esc(g.name)}</h1><div class="hero-sub">${gbp(g.stake_pence)} / week · ${state.members.length} members · Treasurer: ${esc(profileName(g.treasurer_id))}</div></div></section>
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
  ${isTreasurer() ? `<section class="card"><div class="card-title">${ic('landmark')} Treasurer · Bank Details</div><div class="scorer-row"><input class="scorer-select" id="bankName" placeholder="Account name" value="${esc(g.bank_account_name || '')}"></div><div class="scorer-row"><input class="scorer-select" id="bankSort" placeholder="Sort code" value="${esc(g.bank_sort_code || '')}"></div><div class="scorer-row"><input class="scorer-select" id="bankAcc" placeholder="Account number" value="${esc(g.bank_account_number || '')}"></div><button class="secondary" id="saveBankBtn" style="margin-top:8px">Save Bank Details</button></section>` : ''}`;

  bindGroupSwitcher();
  document.querySelector('#claimPaid')?.addEventListener('click', async () => {
    const { error } = await state.supabase.from('payments').update({ claimed_paid_at: new Date().toISOString() }).eq('group_id', g.id).eq('gameweek_id', state.gameweekId).eq('user_id', myId());
    if (error) return toast(error.message, 'error');
    toast('Marked as paid — waiting on Treasurer.'); await loadGroupData(); render();
  });
  document.querySelectorAll('.confirm-btn').forEach(btn => btn.addEventListener('click', async () => {
    const { error } = await state.supabase.from('payments').update({ confirmed_paid_at: new Date().toISOString(), confirmed_by: myId() }).eq('group_id', g.id).eq('gameweek_id', state.gameweekId).eq('user_id', btn.dataset.user);
    if (error) return toast(error.message, 'error');
    toast('Payment confirmed.'); await loadGroupData(); render();
  }));
  document.querySelector('#confirmAllBtn')?.addEventListener('click', async () => {
    const targets = Object.entries(state.payments).filter(([, x]) => !x.confirmed_paid_at).map(([uid]) => uid);
    const { error } = await state.supabase.from('payments').update({ confirmed_paid_at: new Date().toISOString(), confirmed_by: myId() }).eq('group_id', g.id).eq('gameweek_id', state.gameweekId).in('user_id', targets);
    if (error) return toast(error.message, 'error');
    toast('All payments confirmed.'); await loadGroupData(); render();
  });
  document.querySelector('#saveBankBtn')?.addEventListener('click', async () => {
    const { error } = await state.supabase.from('groups').update({
      bank_account_name: document.querySelector('#bankName').value.trim() || null,
      bank_sort_code: document.querySelector('#bankSort').value.trim() || null,
      bank_account_number: document.querySelector('#bankAcc').value.trim() || null
    }).eq('id', g.id);
    if (error) return toast(error.message, 'error');
    toast('Bank details saved.'); await loadGroups(); render();
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
  });
}

function renderOnboarding() {
  screen.innerHTML = `<section class="hero"><h1>Start a Pot</h1><div class="hero-sub">Create a private group or join one with a code.</div></section>
  <section class="card"><div class="card-title">${ic('users')} Create a Group</div><div class="scorer-row"><input class="scorer-select" id="newGroupName" placeholder="Group name, e.g. VAR Is Corrupt"></div><div class="scorer-row"><input class="scorer-select" id="newGroupStake" inputmode="numeric" placeholder="Stake per Gameweek (£)" value="5"></div><button class="primary" id="createGroupBtn">Create Group</button></section>
  <section class="card"><div class="card-title">${ic('shield')} Join a Group</div><div class="scorer-row"><input class="scorer-select" id="joinCode" placeholder="6-character join code" style="text-transform:uppercase"></div><button class="secondary" id="joinGroupBtn">Join Group</button></section>
  <div id="onboardStatus"></div>`;
  document.querySelector('#createGroupBtn').addEventListener('click', async () => {
    const name = document.querySelector('#newGroupName').value.trim();
    const stake = Math.max(0, Number(document.querySelector('#newGroupStake').value) || 0) * 100;
    const statusEl = document.querySelector('#onboardStatus');
    if (!name) { statusEl.className = 'status error'; statusEl.textContent = 'Give your group a name.'; return; }
    const { data, error } = await state.supabase.rpc('create_group', { p_name: name, p_stake_pence: stake });
    if (error) { statusEl.className = 'status error'; statusEl.textContent = error.message; return; }
    state.activeGroupId = data.id; await loadGroups(); render();
  });
  document.querySelector('#joinGroupBtn').addEventListener('click', async () => {
    const code = document.querySelector('#joinCode').value.trim();
    const statusEl = document.querySelector('#onboardStatus');
    const { data, error } = await state.supabase.rpc('join_group', { p_join_code: code });
    if (error) { statusEl.className = 'status error'; statusEl.textContent = error.message; return; }
    state.activeGroupId = data.id; await loadGroups(); render();
  });
}

function renderAuth() {
  screen.innerHTML = `<section class="hero"><div class="eyebrow">KickPot</div><h1>Predict. Score. Win the pot.</h1><div class="hero-sub">Sign in with a magic link — no password needed.</div></section>
  <section class="card"><div class="scorer-row"><input class="scorer-select" id="authEmail" type="email" placeholder="you@email.com" autocomplete="email"></div><button class="primary" id="sendLinkBtn">Send Magic Link</button><div id="authStatus"></div></section>`;
  document.querySelector('#sendLinkBtn').addEventListener('click', async () => {
    const email = document.querySelector('#authEmail').value.trim();
    const statusEl = document.querySelector('#authStatus');
    if (!email) return;
    statusEl.className = 'status'; statusEl.textContent = 'Sending…';
    const { error } = await state.supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin } });
    statusEl.className = error ? 'status error' : 'status success';
    statusEl.textContent = error ? error.message : `✓ Check ${email} for your sign-in link.`;
  });
}

function renderConfigError() {
  screen.innerHTML = `<section class="card"><div class="card-title accent">Setup incomplete</div><p class="muted">Supabase isn't configured on the server yet. Add SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in Railway.</p></section>`;
}

let liveInterval = null;
function render() {
  nav.forEach(n => n.classList.toggle('active', n.dataset.tab === state.tab));
  clearInterval(liveInterval); clearInterval(lockTickInterval);
  if (!state.session) return renderAuth();
  ({ gw: renderGW, live: renderLive, history: renderHistory, group: renderGroup }[state.tab])();
  updateBell();
  if (state.tab === 'live' && state.groups.length) {
    refreshLiveScores().then(() => { if (state.tab === 'live') renderLive() });
    liveInterval = setInterval(() => { if (state.tab === 'live') refreshLiveScores().then(() => { if (state.tab === 'live') renderLive() }) }, 30000);
  }
}
nav.forEach(btn => btn.addEventListener('click', () => { state.tab = btn.dataset.tab; render() }));
userChip?.addEventListener('click', async () => { if (confirm('Sign out of KickPot?')) { await state.supabase.auth.signOut(); state.session = null; render() } });
document.querySelector('#bellBtn')?.addEventListener('click', () => {
  const p = myPayment();
  if (p && !p.confirmed_paid_at) return toast(p.claimed_paid_at ? 'Waiting on Treasurer confirmation.' : 'You have an unpaid Gameweek stake.', 'warning');
  if (isTreasurer() && Object.values(state.payments).some(x => !x.confirmed_paid_at)) return toast('Some members still need payment confirmed.', 'warning');
  if (isTreasurer() && state.fixtures.length && state.fixtures.every(f => ['FT', 'AET', 'PEN'].includes(f.status?.short)) && !state.history.some(h => h.gameweek_id === state.gameweekId)) return toast('This Gameweek is ready to settle.', 'warning');
  toast("You're all caught up.");
});

boot();
