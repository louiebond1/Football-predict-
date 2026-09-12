import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const screen = document.querySelector('#screen');
const GROUP_KEY = 'kp-active-group-v1';
const caches = new Map();
let client = null;
let busy = false;
let lastGroupId = '';

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[c]));
}

function icon(name, size = 18) {
  const paths = {
    climb: '<path d="M3 17l6-6 4 4 8-9"/><path d="M15 6h6v6"/>',
    award: '<circle cx="12" cy="8.5" r="5.3"/><path d="M8.7 13.2L7 20.5l5-2.8 5 2.8-1.7-7.3"/>',
    crown: '<path d="M4 18h16l-1.4-8-4 3.4L12 8l-2.6 5.4-4-3.4L4 18z"/><path d="M4 20.5h16"/>',
    star: '<path d="M12 3.5l2.6 5.4 6 .8-4.3 4.1 1 5.9L12 16.8l-5.3 2.9 1-5.9L3.4 9.7l6-.8z"/>',
    trophy: '<path d="M7 4h10v3a5 5 0 0 1-10 0V4z"/><path d="M7 5.5H4.5A2.5 2.5 0 0 0 7 8M17 5.5h2.5A2.5 2.5 0 0 1 17 8"/><path d="M12 12v4M8.5 20h7"/>',
    target: '<circle cx="12" cy="12" r="8.3"/><circle cx="12" cy="12" r="4.8"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/>'
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name] || ''}</svg>`;
}

function avatar(name) {
  return `<span class="avatar sm">${esc((name || '?').trim().slice(0,1).toUpperCase())}</span>`;
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

function activeGroupId(groups = []) {
  const selected = document.querySelector('#groupSwitch')?.value || sessionStorage.getItem(GROUP_KEY) || '';
  return groups.find(g => g.id === selected)?.id || groups[0]?.id || '';
}

function winnerIds(row) {
  if (Array.isArray(row?.winner_user_ids) && row.winner_user_ids.length) return row.winner_user_ids;
  return row?.winner_user_id ? [row.winner_user_id] : [];
}

function computeAwards(rows, history) {
  if (!rows.length) return null;
  const exactTotals = {};
  const byUserGw = {};
  const weeklyWins = {};
  const byGw = {};

  rows.forEach(r => {
    exactTotals[r.user_id] = (exactTotals[r.user_id] || 0) + Number(r.exact_scores || 0);
    (byUserGw[r.user_id] ||= []).push({ gw:Number(r.gameweek_id), points:Number(r.points || 0) });
    (byGw[r.gameweek_id] ||= []).push(r);
  });
  history.forEach(h => winnerIds(h).forEach(uid => { weeklyWins[uid] = (weeklyWins[uid] || 0) + 1; }));

  const woodenSpoon = {};
  Object.values(byGw).forEach(gwRows => {
    const min = Math.min(...gwRows.map(r => Number(r.points || 0)));
    gwRows.filter(r => Number(r.points || 0) === min).forEach(r => {
      woodenSpoon[r.user_id] = (woodenSpoon[r.user_id] || 0) + 1;
    });
  });

  let climber = null;
  Object.entries(byUserGw).forEach(([uid, series]) => {
    const sorted = series.slice().sort((a,b) => a.gw - b.gw);
    for (let i = 1; i < sorted.length; i++) {
      const delta = sorted[i].points - sorted[i - 1].points;
      if (!climber || delta > climber.delta) climber = { user_id:uid, delta };
    }
  });
  if (climber && climber.delta <= 0) climber = null;

  const topBy = obj => Object.entries(obj).sort((a,b) => b[1] - a[1])[0];
  const champion = topBy(weeklyWins);
  const mostExact = topBy(exactTotals);
  const spoon = topBy(woodenSpoon);
  return {
    champion: champion && champion[1] > 0 ? champion : null,
    climber,
    mostExact: mostExact && mostExact[1] > 0 ? mostExact : null,
    spoon: spoon && spoon[1] > 0 ? spoon : null
  };
}

function points(row) { return Number(row?.points || 0); }
function exacts(row) { return Number(row?.exact_scores || 0); }
function teamHits(row) { return Number(row?.team_score_hits || 0); }
function buildHistoryMarkup(ctx) {
  const mine = ctx.seasonRows.filter(r => r.user_id === ctx.session.user.id);
  const pointsTotal = mine.reduce((sum,r) => sum + Number(r.points || 0), 0);
  const exact = mine.reduce((sum,r) => sum + Number(r.exact_scores || 0), 0);
  const wins = ctx.history.filter(h => winnerIds(h).includes(ctx.session.user.id)).length;
  const stats = `<div class="card-title">${icon('climb')} Your Season Stats</div><div class="statgrid"><div class="stat"><b>${pointsTotal}</b><small>Total points</small></div><div class="stat"><b>${exact}</b><small>Exact scores</small></div><div class="stat"><b>${wins}</b><small>Matchdays won</small></div></div>`;

  const awards = computeAwards(ctx.seasonRows, ctx.history);
  const tiles = [];
  if (awards?.champion) tiles.push({ icon:'crown', label:'Champion', uid:awards.champion[0] });
  if (awards?.climber) tiles.push({ icon:'climb', label:'Biggest Climber', uid:awards.climber.user_id });
  if (awards?.mostExact) tiles.push({ icon:'star', label:'Sharpshooter', uid:awards.mostExact[0] });
  const awardHtml = `<div class="card-title">${icon('award')} Awards</div>${tiles.length ? `<div class="award-grid">${tiles.map(t => `<div class="award-tile"><div class="award-icon">${icon(t.icon,18)}</div><b>${esc(ctx.names.get(t.uid) || 'Player')}</b><small>${esc(t.label)}</small></div>`).join('')}</div>` : '<div class="empty">Not enough settled Matchdays yet.</div>'}`;
  return { stats, awards:awardHtml };
}

async function prewarm(force = false) {
  if (busy) return;
  busy = true;
  try {
    const sb = await getClient();
    if (!sb) return;
    const { data:{ session } } = await sb.auth.getSession();
    if (!session) return;
    const { data:groups, error:groupsError } = await sb.from('groups').select('id').order('created_at');
    if (groupsError || !groups?.length) return;
    const gid = activeGroupId(groups);
    if (!gid) return;
    lastGroupId = gid;

    const existing = caches.get(gid);
    if (!force && existing && Date.now() - existing.at < 30000) {
      applyCached(existing);
      return;
    }

    const { data:gameweekId } = await sb.rpc('ensure_current_gameweek', { p_group_id:gid });
    const [seasonRes, historyRes, memberRes] = await Promise.all([
      sb.from('group_leaderboard').select('*').eq('group_id', gid),
      sb.from('group_gameweeks').select('group_id,gameweek_id,winner_user_id,winner_user_ids,settlement_kind,settled_at,gameweeks(round_name)').eq('group_id', gid).not('settled_at','is',null).order('settled_at',{ascending:false}),
      sb.from('group_members').select('user_id').eq('group_id', gid)
    ]);

    const memberIds = (memberRes.data || []).map(m => m.user_id);
    const { data:profiles } = memberIds.length
      ? await sb.from('profiles').select('id,display_name').in('id', memberIds)
      : { data:[] };
    const names = new Map((profiles || []).map(p => [p.id, p.display_name || 'Player']));
    names.set(session.user.id, names.get(session.user.id) || session.user.email?.split('@')[0] || 'You');

    const ctx = {
      at:Date.now(), gid, gameweekId, session,
      seasonRows:seasonRes.data || [],
      history:historyRes.data || [],
      names
    };
    ctx.historyMarkup = buildHistoryMarkup(ctx);
    caches.set(gid, ctx);
    applyCached(ctx);
  } finally {
    busy = false;
  }
}

function isLoading(node) {
  return /\bLoading(?:…|\.\.\.)/i.test(node?.textContent || '');
}

function applyHistory(ctx) {
  const stats = screen?.querySelector('#seasonStatsCard');
  const awards = screen?.querySelector('#awardsCard');
  if (stats && isLoading(stats) && stats.innerHTML !== ctx.historyMarkup.stats) stats.innerHTML = ctx.historyMarkup.stats;
  if (awards && isLoading(awards) && awards.innerHTML !== ctx.historyMarkup.awards) awards.innerHTML = ctx.historyMarkup.awards;
}

function applyCached(ctx = caches.get(lastGroupId)) {
  if (!ctx || !screen) return;
  applyHistory(ctx);
}

const observer = new MutationObserver(() => {
  const ctx = caches.get(lastGroupId);
  if (ctx) queueMicrotask(() => applyCached(ctx));
});
if (screen) observer.observe(screen, { childList:true, subtree:true });

document.addEventListener('change', event => {
  if (event.target?.id !== 'groupSwitch') return;
  lastGroupId = event.target.value || '';
  setTimeout(() => prewarm(true), 0);
}, true);

window.addEventListener('pageshow', () => setTimeout(() => prewarm(false), 60));
window.addEventListener('focus', () => setTimeout(() => prewarm(false), 80));
setTimeout(() => prewarm(false), 80);
setTimeout(() => prewarm(false), 500);
setInterval(() => prewarm(true), 30000);
