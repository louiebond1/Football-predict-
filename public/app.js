import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const screen = document.querySelector('#screen');
const nav = [...document.querySelectorAll('.nav-item')];
const installBtn = document.querySelector('#installBtn');
const userChip = document.querySelector('#userChip');
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; installBtn.hidden = false });
installBtn.addEventListener('click', async () => { if (!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; installBtn.hidden = true });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

const state = {
  tab: 'gw', supabase: null, session: null, config: null,
  groups: [], activeGroupId: null, gameweekId: null,
  fixtures: [], round: null, predictions: {}, members: [], profiles: {}, payments: {},
  leaderboard: [], history: [], scorers: {}
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

function toast(msg, kind = 'success') {
  const el = document.querySelector('#toast');
  if (!el) return;
  el.textContent = msg; el.className = `status toast ${kind} show`;
  clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('show'), 3200);
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

    const { data: lb } = await sb.from('group_leaderboard').select('*').eq('group_id', gid).eq('gameweek_id', gwId).order('points', { ascending: false });
    state.leaderboard = lb || [];

    const { data: hist } = await sb.from('group_gameweeks').select('*, gameweeks(round_name)').eq('group_id', gid).not('settled_at', 'is', null).order('settled_at', { ascending: false });
    state.history = hist || [];
  } catch (err) {
    toast(err.message || String(err), 'error');
  }
}

async function refreshLiveScores() {
  const inPlay = state.fixtures.filter(f => !['NS', 'FT', 'AET', 'PEN', 'PST', 'CANC'].includes(f.status?.short));
  const finishedIds = state.fixtures.filter(f => f.id).map(f => f.id);
  let needsScorer = [];
  if (finishedIds.length) {
    const { data } = await state.supabase.from('fixtures').select('id')
      .in('id', finishedIds).in('status', ['FT', 'AET', 'PEN']).is('first_scorer_player_id', null);
    needsScorer = (data || []).map(r => ({ id: r.id }));
  }
  const toFetch = [...inPlay, ...needsScorer.filter(n => !inPlay.some(f => f.id === n.id))];
  if (!toFetch.length) return;
  await Promise.all(toFetch.map(f => fetch(`/api/football/fixtures/${f.id}/events`).catch(() => null)));
  const fxRes = await fetch('/api/football/fixtures').then(r => r.json()).catch(() => null);
  if (fxRes) { state.fixtures = fxRes.fixtures || state.fixtures; state.round = fxRes.round; }
  const gid = state.activeGroupId;
  const { data: lb } = await state.supabase.from('group_leaderboard').select('*').eq('group_id', gid).eq('gameweek_id', state.gameweekId).order('points', { ascending: false });
  if (lb) state.leaderboard = lb;
}

async function scorersFor(fixtureId) {
  if (state.scorers[fixtureId]) return state.scorers[fixtureId];
  const d = await fetch(`/api/football/fixtures/${fixtureId}/scorers`).then(r => r.json()).catch(() => ({ players: [] }));
  state.scorers[fixtureId] = d.players || [{ id: 0, name: 'No goalscorer', team: '' }];
  return state.scorers[fixtureId];
}

function meta() {
  const g = activeGroup();
  const paidCount = Object.values(state.payments).filter(p => p.confirmed_paid_at).length;
  const pot = g ? gbp(g.stake_pence * state.members.length) : '£0';
  return `<div class="hero-meta"><span class="pill"><strong>${pot}</strong> Pot</span><span class="pill"><strong>${paidCount}/${state.members.length}</strong> Paid</span><span class="pill">+3 exact · +1 result · +2 scorer</span></div>`;
}

function groupSwitcher() {
  if (state.groups.length < 2) return '';
  return `<select id="groupSwitch" class="scorer-select" style="margin-bottom:12px">${state.groups.map(g => `<option value="${g.id}" ${g.id === state.activeGroupId ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select>`;
}

function paymentBanner() {
  const p = myPayment();
  if (p?.confirmed_paid_at) return '';
  if (p?.claimed_paid_at) return `<div class="status warning">⏳ Waiting for the Treasurer to confirm your payment. Predictions unlock once confirmed.</div>`;
  return `<div class="status error">🔒 Pay the Treasurer for this Gameweek to unlock predictions. Go to the Group tab.</div>`;
}

function renderGW() {
  if (!state.groups.length) return renderOnboarding();
  const locked = !myPayment()?.confirmed_paid_at;
  screen.innerHTML = `<section class="hero"><div class="eyebrow">Premier League</div><h1>${esc(state.round || 'Gameweek')}</h1><div class="hero-sub">Make your calls. Each match locks at kick-off.</div>${meta()}</section>
  ${groupSwitcher()}
  ${paymentBanner()}
  <section class="card"><div class="card-head"><div class="card-title"><span class="accent">✦</span> Your Picks</div><span class="muted">${state.fixtures.length} fixtures</span></div>
  ${state.fixtures.length ? state.fixtures.map(f => fixtureRow(f, locked)).join('') : `<div class="empty">Fixtures are syncing — check back shortly.</div>`}
  <button class="primary" id="lockPicks" ${locked ? 'disabled' : ''}>🔒 Lock In My Picks</button><div id="gwStatus" class="rules">Your friends' picks stay hidden until kick-off.</div></section>`;

  document.querySelector('#groupSwitch')?.addEventListener('change', async e => { state.activeGroupId = e.target.value; await loadGroupData(); render() });

  document.querySelectorAll('[data-fixture]').forEach(row => {
    const id = Number(row.dataset.fixture);
    const fLocked = locked || row.dataset.locked === '1';
    if (fLocked) return;
    const pred = pickFor(id);
    row.querySelectorAll('[data-score]').forEach(inp => inp.addEventListener('input', () => { pred[inp.dataset.score] = Math.max(0, Math.min(20, Number(inp.value) || 0)); inp.value = pred[inp.dataset.score] }));
    row.querySelectorAll('[data-step]').forEach(btn => btn.addEventListener('click', () => { const [side, delta] = btn.dataset.step.split(','); pred[side] = Math.max(0, Math.min(20, pred[side] + Number(delta))); renderGW() }));
    const sel = row.querySelector('[data-scorer]');
    sel.addEventListener('focus', async () => {
      if (sel.dataset.loaded) return;
      const players = await scorersFor(id);
      sel.innerHTML = players.map(p => `<option value="${p.id}" data-name="${esc(p.name)}">${esc(p.name)}${p.team ? ' — ' + esc(p.team) : ''}</option>`).join('');
      sel.value = String(pred.scorerId ?? 0);
      sel.dataset.loaded = '1';
    });
    sel.addEventListener('change', () => { pred.scorerId = Number(sel.value); pred.scorerName = sel.selectedOptions[0]?.dataset.name || 'No goalscorer' });
  });

  document.querySelector('#lockPicks')?.addEventListener('click', submitPicks);
}

const draftPicks = {};
function pickFor(fixtureId) {
  const key = `${state.activeGroupId}:${fixtureId}`;
  if (!draftPicks[key]) {
    const existing = state.predictions[fixtureId];
    draftPicks[key] = existing
      ? { home: existing.predicted_home, away: existing.predicted_away, scorerId: existing.first_scorer_player_id ?? 0, scorerName: existing.first_scorer_name || 'No goalscorer' }
      : { home: 1, away: 1, scorerId: 0, scorerName: 'No goalscorer' };
  }
  return draftPicks[key];
}

function fixtureRow(f, groupLocked) {
  const kickLocked = isLocked(f.kickoff);
  const locked = groupLocked || kickLocked;
  const pred = pickFor(f.id);
  const saved = state.predictions[f.id];
  const scoreDisplay = kickLocked && f.goals?.home != null ? `<span class="rules">Final: ${f.goals.home}–${f.goals.away}</span>` : '';
  return `<div class="fixture" data-fixture="${f.id}" data-locked="${locked ? '1' : '0'}">
    <div class="teams"><div class="team">${esc(f.home?.name)}</div>
    <div class="scorepick">${locked
      ? `<span class="scorebox" style="display:grid;place-items:center">${saved ? saved.predicted_home : '–'}</span><span class="dash">–</span><span class="scorebox" style="display:grid;place-items:center">${saved ? saved.predicted_away : '–'}</span>`
      : `<button class="step" data-step="home,-1">−</button><input class="scorebox" inputmode="numeric" value="${pred.home}" data-score="home"><span class="dash">–</span><input class="scorebox" inputmode="numeric" value="${pred.away}" data-score="away"><button class="step" data-step="away,1">＋</button>`}
    </div><div class="team away">${esc(f.away?.name)}</div></div>
    <div class="scorer-row">${locked
      ? `<span class="muted">First scorer pick: ${esc(saved?.first_scorer_name || 'No goalscorer')}</span>`
      : `<select class="scorer-select" data-scorer><option value="${pred.scorerId}">${esc(pred.scorerName)}</option></select>`}
    </div>
    <div class="rules">${kickoffLabel(f.kickoff)} · ${locked ? '🔒 locked' : 'locks automatically at kick-off'} ${saved ? `· <strong class="accent">${saved.points} pts</strong>` : ''} ${scoreDisplay}</div>
  </div>`;
}

async function submitPicks() {
  const rows = state.fixtures.filter(f => !isLocked(f.kickoff)).map(f => {
    const p = pickFor(f.id);
    return { group_id: state.activeGroupId, fixture_id: f.id, user_id: myId(), predicted_home: p.home, predicted_away: p.away, first_scorer_player_id: p.scorerId, first_scorer_name: p.scorerName };
  });
  const statusEl = document.querySelector('#gwStatus');
  if (!rows.length) { statusEl.className = 'status warning'; statusEl.textContent = 'No open fixtures left to predict.'; return; }
  const { error } = await state.supabase.from('predictions').upsert(rows, { onConflict: 'group_id,fixture_id,user_id' });
  if (error) { statusEl.className = 'status error'; statusEl.textContent = error.message.includes('row-level security') ? 'Your payment needs Treasurer confirmation before predictions unlock.' : error.message; return; }
  statusEl.className = 'status success'; statusEl.textContent = '✓ Picks locked in and synced for the group.';
  await loadGroupData(); renderGW();
}

function renderLive() {
  if (!state.groups.length) return renderOnboarding();
  screen.innerHTML = `<section class="hero"><div class="eyebrow"><span class="live-dot"></span>Live Matchday</div><h1>Everything can change.</h1>${meta()}</section>
  ${groupSwitcher()}
  <section class="card"><div class="card-head"><div class="card-title accent">Live Table</div><span class="badge">LIVE</span></div>
  ${state.leaderboard.length ? `<table class="table"><thead><tr><th>#</th><th>Player</th><th class="pts">Pts</th></tr></thead><tbody>${state.leaderboard.map((m, i) => `<tr><td class="rank">${i + 1}</td><td><strong>${esc(m.display_name || profileName(m.user_id))}</strong>${m.user_id === myId() ? ' <span class="muted">(you)</span>' : ''}</td><td class="pts">${m.points}</td></tr>`).join('')}</tbody></table>` : `<div class="empty">No predictions locked in yet.</div>`}
  </section>
  <section class="card"><div class="card-title accent">This Gameweek's Fixtures</div>${state.fixtures.map(f => `<div class="payment-row"><span>${esc(f.home?.name)} v ${esc(f.away?.name)}</span><b class="${['1H','2H','ET','P','LIVE'].includes(f.status?.short) ? 'accent' : ''}">${f.goals?.home ?? '–'}–${f.goals?.away ?? '–'} <small class="muted">${esc(f.status?.short || '')}</small></b></div>`).join('') || '<div class="empty">No fixtures yet.</div>'}</section>`;
  document.querySelector('#groupSwitch')?.addEventListener('change', async e => { state.activeGroupId = e.target.value; await loadGroupData(); render() });
  refreshLiveScores().then(() => { if (state.tab === 'live') renderLive() });
}

async function loadSeasonStats() {
  const { data } = await state.supabase.from('group_leaderboard').select('*').eq('group_id', state.activeGroupId).eq('user_id', myId());
  const rows = data || [];
  return {
    points: rows.reduce((s, r) => s + r.points, 0),
    exact: rows.reduce((s, r) => s + (r.exact_scores || 0), 0),
    scorer: rows.reduce((s, r) => s + (r.scorer_hits || 0), 0),
    wins: state.history.filter(h => h.winner_user_id === myId()).length
  };
}

function renderHistory() {
  if (!state.groups.length) return renderOnboarding();
  const allFinished = state.fixtures.length && state.fixtures.every(f => ['FT', 'AET', 'PEN'].includes(f.status?.short));
  const alreadySettled = state.history.some(h => h.gameweek_id === state.gameweekId);
  const latestWinner = state.history[0];
  screen.innerHTML = `${latestWinner ? `<section class="card winner"><div class="trophy">🏆</div><div class="eyebrow">Gameweek Champion</div><h1>${esc((profileName(latestWinner.winner_user_id) || 'Player').toUpperCase())} WINS</h1><div class="muted">${esc(latestWinner.gameweeks?.round_name || '')}</div></section>` : `<section class="card"><div class="empty">No Gameweeks settled yet.</div></section>`}
  ${groupSwitcher()}
  ${isTreasurer() && allFinished && !alreadySettled ? `<section class="card"><div class="card-title accent">Ready to Settle</div><p class="muted">All fixtures are final for this Gameweek.</p><button class="primary" id="settleBtn">Settle Gameweek & Crown Winner</button></section>` : ''}
  <section class="card"><div class="card-title accent">Past Gameweeks</div>${state.history.length ? state.history.map(h => `<div class="payment-row"><span>${esc(h.gameweeks?.round_name || 'Gameweek')}</span><b>${esc(profileName(h.winner_user_id))}</b></div>`).join('') : '<div class="empty">Settle a Gameweek to see it here.</div>'}</section>
  <section class="card" id="seasonStatsCard"><div class="card-title accent">Your Season Stats</div><div class="empty">Loading…</div></section>`;
  document.querySelector('#groupSwitch')?.addEventListener('change', async e => { state.activeGroupId = e.target.value; await loadGroupData(); render() });
  document.querySelector('#settleBtn')?.addEventListener('click', async () => {
    const { error } = await state.supabase.rpc('settle_gameweek', { p_group_id: state.activeGroupId, p_gameweek_id: state.gameweekId });
    if (error) return toast(error.message, 'error');
    toast('Gameweek settled.'); await loadGroupData(); render();
  });
  loadSeasonStats().then(s => {
    const card = document.querySelector('#seasonStatsCard');
    if (!card || state.tab !== 'history') return;
    card.innerHTML = `<div class="card-title accent">Your Season Stats</div><div class="statgrid"><div class="stat"><b>${s.points}</b><small>Total points</small></div><div class="stat"><b>${s.exact}</b><small>Exact scores</small></div><div class="stat"><b>${s.scorer}</b><small>First scorers</small></div></div><div class="payment-row"><span>Gameweeks won</span><b class="accent">${s.wins}</b></div>`;
  });
}

function renderGroup() {
  if (!state.groups.length) return renderOnboarding();
  const g = activeGroup();
  const p = myPayment();
  screen.innerHTML = `<section class="hero"><div class="eyebrow">Private Group</div><h1>${esc(g.name)}</h1><div class="hero-sub">${gbp(g.stake_pence)} / week · ${state.members.length} members · Treasurer: ${esc(profileName(g.treasurer_id))}</div></section>
  ${groupSwitcher()}
  <section class="card"><div class="card-head"><div class="card-title">Join Code</div></div><div style="font-size:32px;font-weight:900;letter-spacing:4px;color:var(--accent);text-align:center">${esc(g.join_code)}</div><div class="rules">Share this code so friends can join the group.</div></section>
  <section class="card"><div class="card-title">Member Payments</div>${state.members.map(m => {
    const pay = state.payments[m.user_id];
    const status = pay?.confirmed_paid_at ? '✓ Paid' : pay?.claimed_paid_at ? 'Claimed' : 'Unpaid';
    const cls = pay?.confirmed_paid_at ? 'paid' : 'unpaid';
    const canConfirm = isTreasurer() && !pay?.confirmed_paid_at;
    return `<div class="payment-row"><strong>${esc(profileName(m.user_id))}${m.user_id === myId() ? ' (you)' : ''}</strong><span style="display:flex;align-items:center;gap:8px"><span class="${cls}">${status}</span>${canConfirm ? `<button class="secondary confirm-btn" style="padding:6px 10px;width:auto" data-user="${m.user_id}">Confirm</button>` : ''}</span></div>`;
  }).join('')}</section>
  <section class="card"><div class="card-title accent">Pay the Treasurer</div><p class="muted">Money is sent separately. KickPot only records whether the Treasurer has confirmed payment.</p>
  <div class="bankbox"><div class="bankline"><span>Account name</span><b>${esc(g.bank_account_name || 'Not set')}</b></div><div class="bankline"><span>Sort code</span><b>${esc(g.bank_sort_code || '••-••-••')}</b></div><div class="bankline"><span>Account no.</span><b>${esc(g.bank_account_number || '••••••••')}</b></div><div class="bankline"><span>Reference</span><b>${esc(state.round || 'GW')}-${esc((state.session.user.email || '').split('@')[0].toUpperCase())}</b></div></div>
  ${p?.claimed_paid_at ? `<div class="status warning" style="margin-top:12px">⏳ Waiting on Treasurer confirmation.</div>` : `<button class="secondary" id="claimPaid" style="margin-top:12px">I've Paid</button>`}
  </section>
  ${isTreasurer() ? `<section class="card"><div class="card-title accent">Treasurer · Bank Details</div><div class="scorer-row"><input class="scorer-select" id="bankName" placeholder="Account name" value="${esc(g.bank_account_name || '')}"></div><div class="scorer-row"><input class="scorer-select" id="bankSort" placeholder="Sort code" value="${esc(g.bank_sort_code || '')}"></div><div class="scorer-row"><input class="scorer-select" id="bankAcc" placeholder="Account number" value="${esc(g.bank_account_number || '')}"></div><button class="secondary" id="saveBankBtn" style="margin-top:8px">Save Bank Details</button></section>` : ''}`;

  document.querySelector('#groupSwitch')?.addEventListener('change', async e => { state.activeGroupId = e.target.value; await loadGroupData(); render() });
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
  document.querySelector('#saveBankBtn')?.addEventListener('click', async () => {
    const { error } = await state.supabase.from('groups').update({
      bank_account_name: document.querySelector('#bankName').value.trim() || null,
      bank_sort_code: document.querySelector('#bankSort').value.trim() || null,
      bank_account_number: document.querySelector('#bankAcc').value.trim() || null
    }).eq('id', g.id);
    if (error) return toast(error.message, 'error');
    toast('Bank details saved.'); await loadGroups(); render();
  });
}

function renderOnboarding() {
  screen.innerHTML = `<section class="hero"><div class="eyebrow">KickPot</div><h1>Start a Pot</h1><div class="hero-sub">Create a private group or join one with a code.</div></section>
  <section class="card"><div class="card-title accent">Create a Group</div><div class="scorer-row"><input class="scorer-select" id="newGroupName" placeholder="Group name, e.g. VAR Is Corrupt"></div><div class="scorer-row"><input class="scorer-select" id="newGroupStake" inputmode="numeric" placeholder="Stake per Gameweek (£)" value="5"></div><button class="primary" id="createGroupBtn">Create Group</button></section>
  <section class="card"><div class="card-title accent">Join a Group</div><div class="scorer-row"><input class="scorer-select" id="joinCode" placeholder="6-character join code" style="text-transform:uppercase"></div><button class="secondary" id="joinGroupBtn">Join Group</button></section>
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
  clearInterval(liveInterval);
  if (!state.session) return renderAuth();
  ({ gw: renderGW, live: renderLive, history: renderHistory, group: renderGroup }[state.tab])();
  if (state.tab === 'live' && state.groups.length) liveInterval = setInterval(() => { if (state.tab === 'live') refreshLiveScores().then(renderLive) }, 30000);
}
nav.forEach(btn => btn.addEventListener('click', () => { state.tab = btn.dataset.tab; render() }));
userChip?.addEventListener('click', async () => { if (confirm('Sign out of KickPot?')) { await state.supabase.auth.signOut(); state.session = null; render() } });

boot();
