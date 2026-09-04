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
  if (total === 0) return '<span class="kp-live-lock is-locked">✓ All available picks locked</span>';
  if (row.picks_locked) return `<span class="kp-live-lock is-locked">✓ ${submitted}/${total} picks locked</span>`;
  if (submitted > 0) return `<span class="kp-live-lock is-partial">${submitted}/${total} picks saved</span>`;
  return '<span class="kp-live-lock is-missing">Not submitted</span>';
}

function avatar(name) {
  return `<span class="avatar sm">${esc((name || '?').trim().slice(0,1).toUpperCase())}</span>`;
}

function points(row) { return Number(row?.points || 0); }
function exacts(row) { return Number(row?.exact_scores || 0); }
function teamHits(row) { return Number(row?.team_score_hits || 0); }
function sameRank(a, b) {
  return points(a) === points(b) && exacts(a) === exacts(b) && teamHits(a) === teamHits(b);
}
function ranksAbove(a, b) {
  if (points(a) !== points(b)) return points(a) > points(b);
  if (exacts(a) !== exacts(b)) return exacts(a) > exacts(b);
  return teamHits(a) > teamHits(b);
}

function tableSignature(ctx) {
  return `${ctx.group.id}:${ctx.gameweekId}:` + ctx.rows.map(r => `${r.user_id}:${points(r)}:${exacts(r)}:${teamHits(r)}:${Number(r.picks_submitted || 0)}:${Number(r.fixtures_total || 0)}:${r.picks_locked ? 1 : 0}`).join('|');
}

function competitionRank(rows, index) {
  const mine = rows[index];
  return 1 + rows.filter(r => ranksAbove(r, mine)).length;
}

function isSharedRank(rows, index) {
  const mine = rows[index];
  return rows.filter(r => sameRank(r, mine)).length > 1;
}

function ordinal(n) {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  if (n % 10 === 1) return `${n}st`;
  if (n % 10 === 2) return `${n}nd`;
  if (n % 10 === 3) return `${n}rd`;
  return `${n}th`;
}

function naturalList(names) {
  if (!names.length) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function tieAwareNeedMessage(ctx) {
  const rows = ctx.rows || [];
  const mineIndex = rows.findIndex(r => r.user_id === ctx.session.user.id);
  if (mineIndex < 0 || !rows.length) return '';

  const mine = rows[mineIndex];
  const top = rows[0];
  const minePoints = points(mine);
  const topPoints = points(top);
  const rank = competitionRank(rows, mineIndex);
  const sameStanding = rows.filter(r => sameRank(r, mine));
  const samePoints = rows.filter(r => points(r) === minePoints);
  const allLevel = rows.every(r => sameRank(r, mine));
  const unit = value => `pt${Number(value) === 1 ? '' : 's'}`;

  if (allLevel && rows.length > 1) {
    return `All ${rows.length} players are level on ${minePoints} ${unit(minePoints)} after all tiebreakers.`;
  }

  if (rank === 1) {
    if (sameStanding.length > 1) {
      const others = naturalList(sameStanding.filter(r => r.user_id !== mine.user_id).map(r => r.display_name || 'Player'));
      return `You're level at the top with ${esc(others)} on ${minePoints} ${unit(minePoints)} after all tiebreakers.`;
    }
    if (samePoints.length > 1) {
      const rivals = samePoints.filter(r => r.user_id !== mine.user_id);
      const bestRivalExact = Math.max(...rivals.map(exacts));
      if (exacts(mine) > bestRivalExact) return `You're leading on exact-score tiebreak with ${minePoints} ${unit(minePoints)}.`;
      return `You're leading on individual team-score hits with ${minePoints} ${unit(minePoints)}.`;
    }
    const second = rows.find(r => points(r) < minePoints);
    if (!second) return "You're leading the group.";
    const gap = minePoints - points(second);
    return `You're leading by ${gap} ${unit(gap)}.`;
  }

  if (minePoints === topPoints) {
    return `You're level on ${minePoints} ${unit(minePoints)}, but ${ordinal(rank)} on the tiebreakers.`;
  }

  const gap = topPoints - minePoints;
  if (sameStanding.length > 1) {
    return `You're tied for ${ordinal(rank)} on ${minePoints} ${unit(minePoints)}, ${gap} ${unit(gap)} off the lead.`;
  }
  return `You're ${ordinal(rank)}, ${gap} ${unit(gap)} off the lead.`;
}

function updateWhatYouNeed(ctx) {
  const card = document.querySelector('.kp3-live .kp3-need');
  const text = card?.querySelector('p');
  if (!text) return;
  const msg = tieAwareNeedMessage(ctx);
  if (msg && text.textContent !== msg) text.textContent = msg;
}

function rebuildTable(table, ctx) {
  const signature = tableSignature(ctx);
  if (!table || table.dataset.kpGroupStatus === signature) return;
  const tbody = table.querySelector('tbody');
  if (!tbody) return;
  tbody.innerHTML = ctx.rows.map((row, i) => {
    const name = row.display_name || 'Player';
    const mine = row.user_id === ctx.session.user.id;
    const rank = competitionRank(ctx.rows, i);
    const rankLabel = isSharedRank(ctx.rows, i) ? `=${rank}` : String(rank);
    return `<tr data-kp-user="${esc(row.user_id)}">
      <td><span class="rank-move same">–</span></td>
      <td class="rank">${rankLabel}</td>
      <td><div class="row-left kp-live-player">${avatar(name)}<span class="kp-live-player-copy"><strong>${esc(name)}</strong>${mine ? ' <span class="muted">(you)</span>' : ''}${statusText(row)}</span></div></td>
      <td class="pts">${points(row)}</td>
    </tr>`;
  }).join('');
  table.dataset.kpGroupStatus = signature;

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
    const nextSummary = `${locked}/${ctx.rows.length} locked`;
    if (summary.textContent !== nextSummary) summary.textContent = nextSummary;
  }
}

function liveTable() {
  return document.querySelector('.kp3-live .kp3-table-card table, .kp3-live table.table');
}

function paintCachedLiveStatus() {
  if (!cache || !document.querySelector('.kp3-live')) return false;
  const table = liveTable();
  if (table) rebuildTable(table, cache);
  updateWhatYouNeed(cache);
  return Boolean(table);
}

function normaliseTeamName(value = '') {
  return String(value).trim().toLowerCase().replace(/\s+/g, ' ');
}

function fixtureForRow(row, fixtures) {
  const home = normaliseTeamName(row.querySelector('.team:not(.away) > span:last-child')?.textContent || '');
  const away = normaliseTeamName(row.querySelector('.team.away > span:first-child')?.textContent || '');
  if (!home || !away) return null;
  return fixtures.find(f => normaliseTeamName(f.home?.name) === home && normaliseTeamName(f.away?.name) === away) || null;
}

async function revealStartedPicks(ctx) {
  const matches = document.querySelector('.kp3-live-matches');
  if (!matches) return;
  const fixtureRows = [...matches.querySelectorAll('.kp3-live-fixture')];
  if (!fixtureRows.length) return;

  const football = await fetch('/api/football/fixtures', { cache:'no-store' }).then(r => r.json()).catch(() => null);
  const fixtures = football?.fixtures || [];
  const startedFixtures = fixtures.filter(f => Date.now() >= new Date(f.kickoff).getTime());
  const startedIds = startedFixtures.map(f => f.id).filter(Boolean);
  if (!startedIds.length) return;

  const { data: predictions, error } = await ctx.sb.from('predictions')
    .select('fixture_id,user_id,predicted_home,predicted_away')
    .eq('group_id', ctx.group.id)
    .in('fixture_id', startedIds);
  if (error) return;

  const picks = predictions || [];
  const members = ctx.rows || [];

  fixtureRows.forEach(row => {
    const fixture = fixtureForRow(row, startedFixtures);
    if (!fixture || Date.now() < new Date(fixture.kickoff).getTime()) return;

    const fixturePicks = picks.filter(p => Number(p.fixture_id) === Number(fixture.id));
    const byUser = new Map(fixturePicks.map(p => [p.user_id, p]));
    const signature = members.map(member => {
      const pick = byUser.get(member.user_id);
      return `${member.user_id}:${pick ? `${pick.predicted_home}-${pick.predicted_away}` : 'none'}`;
    }).join('|');

    let reveal = row.querySelector('.kp3-reveal');
    if (reveal?.dataset.kpRevealSignature === signature) return;
    if (!reveal) {
      reveal = document.createElement('div');
      reveal.className = 'kp3-reveal';
      row.append(reveal);
    }
    reveal.dataset.kpRevealSignature = signature;
    reveal.innerHTML = `<div><small>GROUP PICKS · REVEALED AT KICK-OFF</small><span>${fixturePicks.length}/${members.length}</span></div><div class="kp3-reveal-scroll">${members.map(member => {
      const pick = byUser.get(member.user_id);
      const name = member.display_name || 'Player';
      const mine = member.user_id === ctx.session.user.id;
      return `<span class="kp3-pick-chip${mine ? ' mine' : ''}${pick ? '' : ' is-missing'}"><b>${esc(name)}${mine ? ' · you' : ''}</b><em>${pick ? `${pick.predicted_home}–${pick.predicted_away}` : 'No pick'}</em></span>`;
    }).join('')}</div>`;
  });
}

async function enhance() {
  if (busy || !document.querySelector('.kp3-live')) return;
  const table = liveTable();
  const matches = document.querySelector('.kp3-live-matches');
  if (!table && !matches) return;

  // When the Live DOM has just been recreated, immediately repopulate the
  // already-known lock/submission state before waiting for any network work.
  if (cache) {
    if (table) rebuildTable(table, cache);
    updateWhatYouNeed(cache);
  }

  busy = true;
  try {
    const ctx = await loadStatus();
    if (!ctx) return;
    if (table) rebuildTable(table, ctx);
    updateWhatYouNeed(ctx);
    await revealStartedPicks(ctx);
  } finally {
    busy = false;
  }
}

// app.js/ui-v3 recreate the Live table when changing tabs. MutationObserver
// callbacks run before the browser's next paint, so cached green lock statuses
// can be restored without the user seeing them disappear and reappear.
const liveObserver = new MutationObserver(() => {
  if (!cache || !document.querySelector('.kp3-live')) return;
  paintCachedLiveStatus();
});
const screen = document.querySelector('#screen');
if (screen) liveObserver.observe(screen, { childList:true, subtree:true });

setInterval(enhance, 1000);
document.addEventListener('click', event => {
  if (event.target.closest('[data-tab="live"], .kp3-feature-row, .kp3-back')) {
    // The original app's click handler renders first. Queueing a microtask puts
    // cached table state back into that fresh DOM before the next frame paints.
    queueMicrotask(paintCachedLiveStatus);
    setTimeout(enhance, 80);
  }
});
window.addEventListener('pageshow', () => setTimeout(enhance, 120));
setTimeout(enhance, 250);
