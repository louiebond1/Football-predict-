import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const screen = document.querySelector('#screen');
let client = null;
let contextCache = null;
let contextFetchedAt = 0;
let contextGroupId = null;
let scheduled = null;
let running = false;

const LIVE_EXCLUDED = new Set(['NS', 'FT', 'AET', 'PEN', 'PST', 'CANC']);

const esc = (value = '') => String(value).replace(/[&<>"']/g, ch => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
}[ch]));

function money(pence) {
  const n = Number(pence || 0) / 100;
  return `£${Number.isInteger(n) ? n.toFixed(0) : n.toFixed(2)}`;
}

async function getClient() {
  if (client) return client;
  const cfg = await fetch('/api/config', { cache: 'no-store' }).then(r => r.json()).catch(() => null);
  if (!cfg?.supabaseConfigured) return null;
  client = createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
  return client;
}

function activeGroupFromDom(groups) {
  const selected = document.querySelector('#groupSwitch')?.value;
  if (selected && groups.some(g => g.id === selected)) return selected;
  if (contextGroupId && groups.some(g => g.id === contextGroupId)) return contextGroupId;
  return groups[0]?.id || null;
}

async function loadContext(force = false) {
  const sb = await getClient();
  if (!sb) return null;
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;

  const { data: groups } = await sb.from('groups').select('id,name,stake_pence,treasurer_id').order('created_at');
  const allGroups = groups || [];
  const groupId = activeGroupFromDom(allGroups);
  if (!groupId) return null;

  if (!force && contextCache && contextGroupId === groupId && Date.now() - contextFetchedAt < 12000) {
    return contextCache;
  }

  contextGroupId = groupId;
  const group = allGroups.find(g => g.id === groupId);
  const [{ data: gameweekId }, fxRes, membersRes, historyRes, boardAllRes] = await Promise.all([
    sb.rpc('ensure_current_gameweek', { p_group_id: groupId }),
    fetch('/api/football/fixtures', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ fixtures: [], round: null })),
    sb.from('group_members').select('user_id,role').eq('group_id', groupId),
    sb.from('group_gameweeks').select('*,gameweeks(round_name)').eq('group_id', groupId).not('settled_at', 'is', null).order('settled_at', { ascending: false }),
    sb.from('group_leaderboard').select('*').eq('group_id', groupId)
  ]);

  const fixtures = fxRes?.fixtures || [];
  const startedIds = fixtures.filter(f => Date.now() >= new Date(f.kickoff).getTime()).map(f => f.id).filter(Boolean);

  let predictions = [];
  if (startedIds.length) {
    const { data } = await sb.from('predictions')
      .select('fixture_id,user_id,predicted_home,predicted_away,points')
      .eq('group_id', groupId)
      .in('fixture_id', startedIds);
    predictions = data || [];
  }

  let currentBoard = [];
  if (gameweekId) {
    const { data } = await sb.from('group_leaderboard')
      .select('*')
      .eq('group_id', groupId)
      .eq('gameweek_id', gameweekId)
      .order('points', { ascending: false });
    currentBoard = data || [];
  }

  const names = new Map();
  [...(boardAllRes.data || []), ...currentBoard].forEach(row => {
    if (row.user_id && row.display_name) names.set(row.user_id, row.display_name);
  });
  names.set(session.user.id, session.user.email?.split('@')[0] || 'You');

  const domLiveRows = [...document.querySelectorAll('.live-table-final tbody tr')];
  domLiveRows.forEach((tr, i) => {
    const uid = currentBoard[i]?.user_id;
    const label = tr.querySelector('.row-left strong')?.textContent?.replace(/\s*\(you\)\s*$/i, '').trim();
    if (uid && label) names.set(uid, label);
  });

  contextCache = {
    sb,
    session,
    group,
    groupId,
    gameweekId,
    fixtures,
    round: fxRes?.round || '',
    members: membersRes.data || [],
    history: historyRes.data || [],
    boardAll: boardAllRes.data || [],
    currentBoard,
    predictions,
    names
  };
  contextFetchedAt = Date.now();
  return contextCache;
}

function nameFor(ctx, userId) {
  return ctx.names.get(userId) || (userId === ctx.session.user.id ? 'You' : 'Player');
}

function pointsAtScore(prediction, home, away) {
  if (home == null || away == null) return 0;
  if (prediction.predicted_home === home && prediction.predicted_away === away) return 3;
  const predictedSign = Math.sign(prediction.predicted_home - prediction.predicted_away);
  const actualSign = Math.sign(home - away);
  return predictedSign === actualSign ? 1 : 0;
}

function liveProjection(ctx, override = null) {
  const totals = new Map();
  ctx.members.forEach(m => totals.set(m.user_id, 0));

  const fixturesById = new Map(ctx.fixtures.map(f => [Number(f.id), f]));
  ctx.predictions.forEach(pred => {
    const f = fixturesById.get(Number(pred.fixture_id));
    if (!f || Date.now() < new Date(f.kickoff).getTime()) return;
    let home = f.goals?.home;
    let away = f.goals?.away;
    if (override && Number(override.fixtureId) === Number(f.id)) {
      home = override.home;
      away = override.away;
    }
    totals.set(pred.user_id, (totals.get(pred.user_id) || 0) + pointsAtScore(pred, home, away));
  });
  return totals;
}

function rankFor(totals, userId) {
  const mine = totals.get(userId) || 0;
  return 1 + [...totals.values()].filter(score => score > mine).length;
}

function buildLiveImpact(ctx) {
  const liveFixtures = ctx.fixtures.filter(f => !LIVE_EXCLUDED.has(f.status?.short) && f.goals?.home != null && f.goals?.away != null);
  if (!liveFixtures.length || !ctx.predictions.some(p => p.user_id === ctx.session.user.id)) return null;

  const base = liveProjection(ctx);
  const myId = ctx.session.user.id;
  const baseRank = rankFor(base, myId);
  let best = null;

  for (const f of liveFixtures) {
    const options = [
      { team: f.home?.name || 'Home', home: Number(f.goals.home) + 1, away: Number(f.goals.away) },
      { team: f.away?.name || 'Away', home: Number(f.goals.home), away: Number(f.goals.away) + 1 }
    ];
    for (const option of options) {
      const simulated = liveProjection(ctx, { fixtureId: f.id, home: option.home, away: option.away });
      const rank = rankFor(simulated, myId);
      const score = simulated.get(myId) || 0;
      if (rank < baseRank && (!best || rank < best.rank || (rank === best.rank && score > best.score))) {
        best = { ...option, rank, score };
      }
    }
  }

  const card = document.createElement('section');
  card.className = 'live-impact-v2';
  if (best) {
    card.innerHTML = `<div class="feature-kicker-v2">LIVE IMPACT</div><strong>If ${esc(best.team)} score next, you move to ${best.rank === 1 ? '1st' : best.rank === 2 ? '2nd' : best.rank === 3 ? '3rd' : `${best.rank}th`}.</strong><span>Projected from the group’s revealed picks.</span>`;
  } else if (baseRank === 1) {
    card.innerHTML = `<div class="feature-kicker-v2">LIVE IMPACT</div><strong>You’re leading the live projection.</strong><span>Every goal can change the order.</span>`;
  } else {
    card.innerHTML = `<div class="feature-kicker-v2">LIVE IMPACT</div><strong>You’re ${baseRank === 2 ? '2nd' : baseRank === 3 ? '3rd' : `${baseRank}th`} on the live projection.</strong><span>No single next goal moves you up right now.</span>`;
  }
  return card;
}

function decoratePredictionReveal(ctx) {
  const container = document.querySelector('.live-matches-view-final');
  if (!container) return;
  const rows = [...container.querySelectorAll('.live-match-final')];
  rows.forEach((row, index) => {
    if (row.querySelector('.prediction-reveal-v2')) return;
    const fixture = ctx.fixtures[index];
    if (!fixture || Date.now() < new Date(fixture.kickoff).getTime()) return;
    const picks = ctx.predictions.filter(p => Number(p.fixture_id) === Number(fixture.id));
    if (!picks.length) return;

    const reveal = document.createElement('div');
    reveal.className = 'prediction-reveal-v2';
    reveal.innerHTML = `<div class="reveal-label-v2"><span>PICKS REVEALED</span><small>${picks.length} pick${picks.length === 1 ? '' : 's'}</small></div><div class="reveal-picks-v2">${picks.map(p => {
      const n = nameFor(ctx, p.user_id);
      const mine = p.user_id === ctx.session.user.id;
      return `<span class="reveal-pick-v2${mine ? ' mine' : ''}"><b>${esc(n)}</b><em>${p.predicted_home}–${p.predicted_away}</em></span>`;
    }).join('')}</div>`;
    row.append(reveal);
  });
}

function decorateLive(ctx) {
  const matchesView = document.querySelector('.live-matches-view-final');
  if (!matchesView) return;
  decoratePredictionReveal(ctx);

  if (matchesView.querySelector('.live-impact-v2')) return;
  const impact = buildLiveImpact(ctx);
  if (impact) {
    const insight = matchesView.querySelector('.live-insight-final');
    const tableLink = matchesView.querySelector('.nav-row-feature');
    if (insight) insight.after(impact);
    else if (tableLink) tableLink.before(impact);
    else matchesView.prepend(impact);
  }
}

function recordData(ctx) {
  const settledIds = new Set(ctx.history.map(h => Number(h.gameweek_id)));
  const rows = ctx.boardAll.filter(r => settledIds.has(Number(r.gameweek_id)));
  if (!ctx.history.length || !rows.length) return null;

  const winCounts = new Map();
  ctx.history.forEach(h => {
    if (h.winner_user_id) winCounts.set(h.winner_user_id, (winCounts.get(h.winner_user_id) || 0) + 1);
  });
  const winLeader = [...winCounts.entries()].sort((a, b) => b[1] - a[1])[0] || null;

  const exacts = new Map();
  rows.forEach(r => exacts.set(r.user_id, (exacts.get(r.user_id) || 0) + Number(r.exact_scores || 0)));
  const exactLeader = [...exacts.entries()].sort((a, b) => b[1] - a[1])[0] || null;

  const high = [...rows].sort((a, b) => Number(b.points || 0) - Number(a.points || 0))[0] || null;

  const byGw = new Map();
  rows.forEach(r => {
    const key = Number(r.gameweek_id);
    if (!byGw.has(key)) byGw.set(key, []);
    byGw.get(key).push(r);
  });
  let margin = null;
  for (const gwRows of byGw.values()) {
    const sorted = [...gwRows].sort((a, b) => Number(b.points || 0) - Number(a.points || 0));
    if (sorted.length < 2) continue;
    const diff = Number(sorted[0].points || 0) - Number(sorted[1].points || 0);
    if (!margin || diff > margin.diff) margin = { row: sorted[0], diff };
  }

  return { winLeader, exactLeader, high, margin };
}

function decorateHistory(ctx) {
  const overview = document.querySelector('.history-overview-final');
  if (!overview || overview.querySelector('.season-records-v2')) return;

  const data = recordData(ctx);
  const section = document.createElement('section');
  section.className = 'season-records-v2';

  if (!data) {
    section.innerHTML = `<div class="records-heading-v2"><div><span>SEASON</span><strong>Records</strong></div><small>Starts after your first settled Gameweek</small></div>`;
  } else {
    const win = data.winLeader;
    const exact = data.exactLeader;
    const high = data.high;
    const margin = data.margin;
    section.innerHTML = `
      <div class="records-heading-v2"><div><span>SEASON</span><strong>Records</strong></div><small>Bragging rights, without the clutter</small></div>
      <div class="records-grid-v2">
        <div class="record-v2"><small>MOST WINS</small><strong>${win ? esc(nameFor(ctx, win[0])) : '—'}</strong><em>${win ? `${win[1]} win${win[1] === 1 ? '' : 's'}` : '—'}</em></div>
        <div class="record-v2"><small>EXACT SCORE KING</small><strong>${exact ? esc(nameFor(ctx, exact[0])) : '—'}</strong><em>${exact ? `${exact[1]} exact` : '—'}</em></div>
        <div class="record-v2"><small>HIGHEST GW</small><strong>${high ? esc(nameFor(ctx, high.user_id)) : '—'}</strong><em>${high ? `${Number(high.points || 0)} pts` : '—'}</em></div>
        <div class="record-v2"><small>BIGGEST WIN</small><strong>${margin ? esc(nameFor(ctx, margin.row.user_id)) : '—'}</strong><em>${margin ? `+${margin.diff} pts` : 'Needs 2+ players'}</em></div>
      </div>`;
  }

  const menu = overview.querySelector('.history-menu-final');
  if (menu) menu.before(section);
  else overview.append(section);
}

function maybeShowWinnerMoment(ctx) {
  if (document.querySelector('.winner-moment-v2')) return;
  const latest = ctx.history[0];
  if (!latest || latest.winner_user_id !== ctx.session.user.id) return;

  const key = `kp-winner-v2:${ctx.groupId}:${latest.gameweek_id}:${ctx.session.user.id}`;
  if (localStorage.getItem(key)) return;

  const potPence = Number(ctx.group?.stake_pence || 0) * Math.max(1, ctx.members.length);
  const round = latest.gameweeks?.round_name || ctx.round || 'Gameweek';
  const overlay = document.createElement('div');
  overlay.className = 'winner-moment-v2';
  overlay.innerHTML = `
    <div class="winner-glow-v2"></div>
    <button class="winner-close-v2" type="button" aria-label="Close">×</button>
    <div class="winner-cup-v2">
      <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h10v3a5 5 0 0 1-10 0V4z"/><path d="M7 5.5H4.5A2.5 2.5 0 0 0 7 8M17 5.5h2.5A2.5 2.5 0 0 1 17 8"/><path d="M12 12v4M8.5 20h7"/></svg>
    </div>
    <span class="winner-kicker-v2">GAMEWEEK WINNER</span>
    <h1>${esc(round)} is yours.</h1>
    <strong class="winner-money-v2">+${money(potPence)}</strong>
    <p>You finished top of the pot.</p>
    <button class="winner-action-v2" type="button">See the result</button>`;

  const dismiss = (goHistory = false) => {
    localStorage.setItem(key, '1');
    overlay.classList.add('leaving');
    setTimeout(() => overlay.remove(), 220);
    if (goHistory) document.querySelector('.nav-item[data-tab="history"]')?.click();
  };
  overlay.querySelector('.winner-close-v2').addEventListener('click', () => dismiss(false));
  overlay.querySelector('.winner-action-v2').addEventListener('click', () => dismiss(true));
  document.body.append(overlay);
}

async function enhanceFeatures(force = false) {
  if (running || !screen?.children.length) return;
  const tab = document.querySelector('.nav-item.active')?.dataset?.tab;
  if (!tab) return;
  running = true;
  try {
    const ctx = await loadContext(force);
    if (!ctx) return;
    maybeShowWinnerMoment(ctx);
    if (tab === 'live') decorateLive(ctx);
    if (tab === 'history') decorateHistory(ctx);
  } catch (err) {
    console.warn('KickPot feature layer:', err);
  } finally {
    running = false;
  }
}

function schedule(force = false, delay = 180) {
  clearTimeout(scheduled);
  scheduled = setTimeout(() => enhanceFeatures(force), delay);
}

const observer = new MutationObserver(mutations => {
  const external = mutations.some(m => {
    const target = m.target?.nodeType === 1 ? m.target : m.target?.parentElement;
    return !target?.closest?.('.prediction-reveal-v2,.live-impact-v2,.season-records-v2,.winner-moment-v2');
  });
  if (external) schedule(false);
});
observer.observe(screen, { childList: true, subtree: true });

document.addEventListener('change', e => {
  if (e.target?.id === 'groupSwitch') {
    contextCache = null;
    contextFetchedAt = 0;
    contextGroupId = e.target.value;
    schedule(true, 350);
  }
});

window.addEventListener('focus', () => schedule(true, 80));
window.addEventListener('load', () => schedule(true, 250));
schedule(true, 300);
