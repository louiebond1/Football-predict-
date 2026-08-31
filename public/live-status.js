import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

let client = null;
let cache = null;
let cacheAt = 0;
let busy = false;

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[c]));
}

async function getClient() {
  if (client) return client;
  const cfg = await fetch('/api/config', { cache:'no-store' }).then(r => r.json()).catch(() => null);
  if (!cfg?.supabaseConfigured) return null;
  client = createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
  return client;
}

async function loadStatus(force = false) {
  if (!force && cache && Date.now() - cacheAt < 10000) return cache;
  const sb = await getClient();
  if (!sb) return null;
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;
  const { data: groups, error: groupsError } = await sb.from('groups').select('id,name,treasurer_id').order('created_at');
  if (groupsError) return null;
  const selected = document.querySelector('#groupSwitch')?.value || '';
  const group = (groups || []).find(g => g.id === selected) || (groups || [])[0] || null;
  if (!group) return null;
  const { data: gameweekId, error: gwError } = await sb.rpc('ensure_current_gameweek', { p_group_id:group.id });
  if (gwError || !gameweekId) return null;
  const { data: rows, error } = await sb.rpc('group_live_status', { p_group_id:group.id, p_gameweek_id:gameweekId });
  if (error) return null;
  cache = { sb, session, group, gameweekId, rows:rows || [] };
  cacheAt = Date.now();
  return cache;
}

function statusText(row) {
  const submitted = Number(row.picks_submitted || 0);
  const total = Number(row.fixtures_total || 0);
  if (row.picks_locked) return `<span class="kp-live-lock is-locked">✓ ${submitted}/${total} picks locked</span>`;
  if (submitted > 0) return `<span class="kp-live-lock is-partial">${submitted}/${total} picks saved</span>`;
  return '<span class="kp-live-lock is-missing">Not submitted</span>';
}

function avatar(name) {
  return `<span class="avatar sm">${esc((name || '?').trim().slice(0,1).toUpperCase())}</span>`;
}

function rebuildTable(table, ctx) {
  if (!table || table.dataset.kpGroupStatus === `${ctx.group.id}:${ctx.gameweekId}:${ctx.rows.length}`) return;
  const tbody = table.querySelector('tbody');
  if (!tbody) return;
  tbody.innerHTML = ctx.rows.map((row, i) => {
    const name = row.display_name || 'Player';
    const mine = row.user_id === ctx.session.user.id;
    return `<tr data-kp-user="${esc(row.user_id)}">
      <td><span class="rank-move same">–</span></td>
      <td class="rank">${i + 1}</td>
      <td><div class="row-left kp-live-player">${avatar(name)}<span class="kp-live-player-copy"><strong>${esc(name)}</strong>${mine ? ' <span class="muted">(you)</span>' : ''}${statusText(row)}</span></div></td>
      <td class="pts">${Number(row.points || 0)}</td>
    </tr>`;
  }).join('');
  table.dataset.kpGroupStatus = `${ctx.group.id}:${ctx.gameweekId}:${ctx.rows.length}`;

  const card = table.closest('.kp3-table-card,.card');
  const head = card?.querySelector('.card-head');
  if (head) {
    let summary = head.querySelector('.kp-live-summary');
    if (!summary) {
      summary = document.createElement('span');
      summary.className = 'kp-live-summary';
      head.append(summary);
    }
    const locked = ctx.rows.filter(r => r.picks_locked).length;
    summary.textContent = `${locked}/${ctx.rows.length} locked`;
  }
}

async function revealStartedPicks(ctx) {
  const matches = document.querySelector('.kp3-live-matches');
  if (!matches) return;
  const fixtureRows = [...matches.querySelectorAll('.kp3-live-fixture')];
  if (!fixtureRows.length) return;
  const football = await fetch('/api/football/fixtures', { cache:'no-store' }).then(r => r.json()).catch(() => null);
  const fixtures = football?.fixtures || [];
  const started = fixtures.filter(f => Date.now() >= new Date(f.kickoff).getTime()).map(f => f.id).filter(Boolean);
  if (!started.length) return;
  const { data: predictions } = await ctx.sb.from('predictions')
    .select('fixture_id,user_id,predicted_home,predicted_away')
    .eq('group_id', ctx.group.id)
    .in('fixture_id', started);
  const names = new Map(ctx.rows.map(r => [r.user_id, r.display_name || 'Player']));

  fixtureRows.forEach((row, index) => {
    const fixture = fixtures[index];
    if (!fixture || Date.now() < new Date(fixture.kickoff).getTime()) return;
    const picks = (predictions || []).filter(p => Number(p.fixture_id) === Number(fixture.id));
    row.querySelector('.kp3-reveal')?.remove();
    if (!picks.length) return;
    const reveal = document.createElement('div');
    reveal.className = 'kp3-reveal';
    reveal.innerHTML = `<div><small>PICKS REVEALED</small><span>${picks.length}/${ctx.rows.length}</span></div><div class="kp3-reveal-scroll">${picks.map(p => `<span class="kp3-pick-chip${p.user_id === ctx.session.user.id ? ' mine' : ''}"><b>${esc(names.get(p.user_id) || 'Player')}</b><em>${p.predicted_home}–${p.predicted_away}</em></span>`).join('')}</div>`;
    row.append(reveal);
  });
}

async function enhance() {
  if (busy || !document.querySelector('.kp3-live')) return;
  const table = document.querySelector('.kp3-live .kp3-table-card table, .kp3-live table.table');
  const matches = document.querySelector('.kp3-live-matches');
  if (!table && !matches) return;
  busy = true;
  try {
    const ctx = await loadStatus();
    if (!ctx) return;
    if (table) rebuildTable(table, ctx);
    await revealStartedPicks(ctx);
  } finally {
    busy = false;
  }
}

// Deliberately lightweight: no broad MutationObserver. We only check while Live exists,
// and the RPC result is cached. This avoids fighting the app's own render cycle.
setInterval(enhance, 1000);
document.addEventListener('click', event => {
  if (event.target.closest('[data-tab="live"], .kp3-feature-row, .kp3-back')) setTimeout(enhance, 80);
});
window.addEventListener('pageshow', () => setTimeout(enhance, 120));
setTimeout(enhance, 250);
