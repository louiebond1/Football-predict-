import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const screen = document.querySelector('#screen');
const subState = { live: 'matches', history: 'overview', group: 'overview' };
let lastTab = null;
let busy = false;
let sb = null;
let dataCache = null;
let dataCacheAt = 0;
let winnerChecked = false;

const LIVE_EXCLUDED = new Set(['NS', 'FT', 'AET', 'PEN', 'PST', 'CANC']);

function hasText(el, text) {
  return (el?.textContent || '').toLowerCase().includes(text.toLowerCase());
}
function directCard(title) {
  return [...screen.querySelectorAll(':scope > .card')].find(card => hasText(card.querySelector('.card-title'), title));
}
function clampScore(value) { return Math.max(0, Math.min(20, Number(value) || 0)); }
function esc(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
}
function chevron() {
  return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
}
function backIcon() {
  return '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
}
function icon(name) {
  const icons = {
    users: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1"/><circle cx="17.3" cy="8.6" r="2.3"/><path d="M18.7 20v-1a4 4 0 0 0-2.7-3.78"/>',
    card: '<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18"/><path d="M7 15h4"/>',
    shield: '<path d="M12 3.5l7 2.7v5.3c0 5-3.1 7.9-7 9-3.9-1.1-7-4-7-9V6.2l7-2.7z"/><path d="M9.5 12l1.7 1.7 3.5-3.7"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.86 2.86-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1V21H9.6v-.08a1.7 1.7 0 0 0-.4-1 1.7 1.7 0 0 0-1-.6 1.7 1.7 0 0 0-1.88.34l-.06.06-2.86-2.86.06-.06A1.7 1.7 0 0 0 3.8 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1-.4H2V9.6h.08a1.7 1.7 0 0 0 1-.4 1.7 1.7 0 0 0 .6-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.86-2.86.06.06A1.7 1.7 0 0 0 8 3.8a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1V2h4v.08a1.7 1.7 0 0 0 .4 1 1.7 1.7 0 0 0 1 .6 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.86 2.86-.06.06A1.7 1.7 0 0 0 20.2 8c.14.36.35.7.6 1 .27.28.61.49 1 .6h.08v4h-.08a1.7 1.7 0 0 0-1 .4c-.27.28-.47.62-.6 1z"/>',
    trophy: '<path d="M7 4h10v3a5 5 0 0 1-10 0V4z"/><path d="M7 5.5H4.5A2.5 2.5 0 0 0 7 8M17 5.5h2.5A2.5 2.5 0 0 1 17 8"/><path d="M12 12v4M8.5 20h7"/>',
    target: '<circle cx="12" cy="12" r="8.3"/><circle cx="12" cy="12" r="4.8"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/>',
    copy: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>'
  };
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icons[name] || ''}</svg>`;
}

function makeBackHeader(title, subtitle, onBack) {
  const header = document.createElement('section');
  header.className = 'kp3-drill-header';
  header.innerHTML = `<button type="button" class="kp3-back" aria-label="Back">${backIcon()}</button><div><h1>${esc(title)}</h1>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div>`;
  header.querySelector('.kp3-back').addEventListener('click', onBack);
  return header;
}

function makeNavRow(label, meta, iconName, onClick, extra = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `kp3-nav-row ${extra}`.trim();
  button.innerHTML = `<span class="kp3-nav-icon">${icon(iconName)}</span><span class="kp3-nav-copy"><strong>${esc(label)}</strong>${meta ? `<small>${esc(meta)}</small>` : ''}</span><span class="kp3-nav-meta"></span><span class="kp3-nav-chevron">${chevron()}</span>`;
  button.addEventListener('click', onClick);
  return button;
}

function showView(map, key) {
  Object.entries(map).forEach(([name, node]) => { if (node) node.hidden = name !== key; });
  requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'auto' }));
}

function buildScoreStepper(input, side, teamName) {
  const wrap = document.createElement('div');
  wrap.className = `kp3-score-stepper kp3-score-${side}`;
  input.readOnly = true;
  input.setAttribute('inputmode', 'none');
  input.setAttribute('aria-label', `${teamName} predicted goals`);

  const minus = document.createElement('button');
  minus.type = 'button';
  minus.className = 'kp3-step';
  minus.textContent = '−';
  minus.setAttribute('aria-label', `Decrease ${teamName} score`);
  const plus = document.createElement('button');
  plus.type = 'button';
  plus.className = 'kp3-step';
  plus.textContent = '+';
  plus.setAttribute('aria-label', `Increase ${teamName} score`);

  const change = delta => {
    const next = clampScore(Number(input.value) + delta);
    if (String(next) === String(input.value)) return;
    input.value = String(next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  minus.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); change(-1); });
  plus.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); change(1); });
  wrap.append(minus, input, plus);
  return wrap;
}

function upgradeScoreControls(fixture) {
  const scorepick = fixture.querySelector('.scorepick');
  const homeInput = scorepick?.querySelector('[data-score="home"]');
  const awayInput = scorepick?.querySelector('[data-score="away"]');
  if (!scorepick || !homeInput || !awayInput || scorepick.dataset.kp3 === '1') return;
  scorepick.dataset.kp3 = '1';
  const teams = fixture.querySelectorAll('.team');
  const homeName = teams[0]?.textContent?.trim() || 'Home team';
  const awayName = teams[1]?.textContent?.trim() || 'Away team';
  scorepick.querySelectorAll('.step,.dash').forEach(el => el.remove());
  const divider = document.createElement('span');
  divider.className = 'kp3-vs';
  divider.textContent = 'vs';
  scorepick.replaceChildren(buildScoreStepper(homeInput, 'home', homeName), divider, buildScoreStepper(awayInput, 'away', awayName));
}

function enhanceGW() {
  screen.className = 'screen kp3-screen kp3-gw';
  const hero = screen.querySelector(':scope > .hero');
  const switcher = screen.querySelector(':scope > .select-wrap');
  const banner = screen.querySelector(':scope > .status');
  const picks = directCard('Your Picks');
  if (!hero || !picks || screen.querySelector(':scope > .kp3-gw-root')) return;

  const root = document.createElement('div');
  root.className = 'kp3-gw-root';
  screen.insertBefore(root, hero);
  root.append(hero, ...(switcher ? [switcher] : []), ...(banner ? [banner] : []), picks);
  hero.classList.add('kp3-page-hero');
  picks.classList.add('kp3-fixtures-card');

  const title = picks.querySelector('.card-title');
  const count = picks.querySelectorAll(':scope > .fixture').length;
  const head = picks.querySelector('.card-head');
  if (head && !head.querySelector('.kp3-count')) {
    const c = document.createElement('span');
    c.className = 'kp3-count';
    c.textContent = `${count} fixtures`;
    head.append(c);
  }

  let lastDay = '';
  [...picks.querySelectorAll(':scope > .fixture')].forEach(fixture => {
    fixture.classList.add('kp3-pick-fixture');
    upgradeScoreControls(fixture);
    const rules = fixture.querySelector('.rules')?.textContent?.trim() || '';
    const day = rules.match(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/)?.[1] || '';
    if (day && day !== lastDay) {
      const label = document.createElement('div');
      label.className = 'kp3-day';
      label.textContent = ({ Mon:'Monday', Tue:'Tuesday', Wed:'Wednesday', Thu:'Thursday', Fri:'Friday', Sat:'Saturday', Sun:'Sunday' })[day] || day;
      picks.insertBefore(label, fixture);
      lastDay = day;
    }
  });

  const privacy = picks.querySelector('#gwStatus');
  if (privacy) {
    privacy.className = 'kp3-privacy';
    privacy.textContent = 'Picks stay private until each fixture kicks off.';
  }
  if (title) title.textContent = 'Your Picks';
}

async function getSupabase() {
  if (sb) return sb;
  const cfg = await fetch('/api/config', { cache: 'no-store' }).then(r => r.json()).catch(() => null);
  if (!cfg?.supabaseConfigured) return null;
  sb = createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
  return sb;
}

async function loadContext(force = false) {
  if (!force && dataCache && Date.now() - dataCacheAt < 15000) return dataCache;
  const client = await getSupabase();
  if (!client) return null;
  const { data: { session } } = await client.auth.getSession();
  if (!session) return null;
  const { data: groups } = await client.from('groups').select('id,name,stake_pence,treasurer_id').order('created_at');
  const selected = document.querySelector('#groupSwitch')?.value;
  const group = (groups || []).find(g => g.id === selected) || (groups || [])[0];
  if (!group) return null;
  const { data: gwId } = await client.rpc('ensure_current_gameweek', { p_group_id: group.id });
  const [fx, membersRes, boardRes, historyRes] = await Promise.all([
    fetch('/api/football/fixtures', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ fixtures: [], round: '' })),
    client.from('group_members').select('user_id,role').eq('group_id', group.id),
    client.from('group_leaderboard').select('*').eq('group_id', group.id).eq('gameweek_id', gwId),
    client.from('group_gameweeks').select('*,gameweeks(round_name)').eq('group_id', group.id).not('settled_at', 'is', null).order('settled_at', { ascending: false }).limit(20)
  ]);
  const fixtures = fx.fixtures || [];
  const started = fixtures.filter(f => Date.now() >= new Date(f.kickoff).getTime()).map(f => f.id).filter(Boolean);
  let predictions = [];
  if (started.length) {
    const { data } = await client.from('predictions').select('fixture_id,user_id,predicted_home,predicted_away,points').eq('group_id', group.id).in('fixture_id', started);
    predictions = data || [];
  }
  const names = new Map((boardRes.data || []).map(r => [r.user_id, r.display_name || 'Player']));
  names.set(session.user.id, session.user.email?.split('@')[0] || 'You');
  dataCache = { client, session, group, gameweekId: gwId, fixtures, round: fx.round || '', members: membersRes.data || [], board: boardRes.data || [], history: historyRes.data || [], predictions, names };
  dataCacheAt = Date.now();
  return dataCache;
}

function pointsAt(pred, home, away) {
  if (home == null || away == null) return 0;
  if (Number(pred.predicted_home) === Number(home) && Number(pred.predicted_away) === Number(away)) return 3;
  return Math.sign(Number(pred.predicted_home) - Number(pred.predicted_away)) === Math.sign(Number(home) - Number(away)) ? 1 : 0;
}
function liveTotals(ctx, override = null) {
  const totals = new Map(ctx.members.map(m => [m.user_id, 0]));
  const fixtures = new Map(ctx.fixtures.map(f => [Number(f.id), f]));
  ctx.predictions.forEach(p => {
    const f = fixtures.get(Number(p.fixture_id));
    if (!f) return;
    let h = f.goals?.home, a = f.goals?.away;
    if (override && Number(override.fixtureId) === Number(f.id)) { h = override.home; a = override.away; }
    totals.set(p.user_id, (totals.get(p.user_id) || 0) + pointsAt(p, h, a));
  });
  return totals;
}
function rankFor(totals, uid) {
  const mine = totals.get(uid) || 0;
  return 1 + [...totals.values()].filter(v => v > mine).length;
}
function ordinal(n) { return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`; }

async function addLiveExtras(matchesView) {
  const ctx = await loadContext(true);
  if (!ctx || !document.body.contains(matchesView)) return;
  const live = ctx.fixtures.filter(f => !LIVE_EXCLUDED.has(f.status?.short) && f.goals?.home != null && f.goals?.away != null);
  if (live.length && ctx.predictions.some(p => p.user_id === ctx.session.user.id)) {
    const base = liveTotals(ctx);
    const baseRank = rankFor(base, ctx.session.user.id);
    let best = null;
    live.forEach(f => {
      [
        { team: f.home?.name || 'Home', home: Number(f.goals.home) + 1, away: Number(f.goals.away) },
        { team: f.away?.name || 'Away', home: Number(f.goals.home), away: Number(f.goals.away) + 1 }
      ].forEach(opt => {
        const rank = rankFor(liveTotals(ctx, { fixtureId: f.id, home: opt.home, away: opt.away }), ctx.session.user.id);
        if (rank < baseRank && (!best || rank < best.rank)) best = { ...opt, rank };
      });
    });
    const insight = document.createElement('section');
    insight.className = 'kp3-live-impact';
    insight.innerHTML = `<small>WHAT YOU NEED</small><strong>${best ? `If ${esc(best.team)} score next, you move to ${ordinal(best.rank)}.` : baseRank === 1 ? 'You’re leading the live projection.' : `You’re ${ordinal(baseRank)} right now.`}</strong><span>Calculated from revealed group picks.</span>`;
    const table = matchesView.querySelector('.kp3-table-card');
    const hero = matchesView.querySelector('.kp3-page-hero');
    (table || hero)?.after(insight);
  }

  const rows = [...matchesView.querySelectorAll('.kp3-live-fixture')];
  rows.forEach((row, index) => {
    const fixture = ctx.fixtures[index];
    if (!fixture || Date.now() < new Date(fixture.kickoff).getTime() || row.querySelector('.kp3-reveal')) return;
    const picks = ctx.predictions.filter(p => Number(p.fixture_id) === Number(fixture.id));
    const roster = ctx.members.length ? ctx.members : picks.map(p => ({ user_id: p.user_id }));
    if (!roster.length) return;
    const reveal = document.createElement('div');
    reveal.className = 'kp3-reveal';
    const people = roster.map(member => {
      const p = picks.find(pick => pick.user_id === member.user_id);
      const mine = member.user_id === ctx.session.user.id;
      const name = `${ctx.names.get(member.user_id) || 'Player'}${mine ? ' · YOU' : ''}`;
      return `<span class="kp3-pick-chip${mine ? ' mine' : ''}${p ? '' : ' is-missing'}"><b>${esc(name)}</b><em>${p ? `${p.predicted_home}–${p.predicted_away}` : 'No pick'}</em></span>`;
    }).join('');
    reveal.innerHTML = `<div><small>GROUP PICKS</small><span>${picks.length}/${roster.length}</span></div><div class="kp3-reveal-scroll">${people}</div>`;
    row.append(reveal);
  });
}

function enhanceLive() {
  screen.className = 'screen kp3-screen kp3-live';
  const hero = screen.querySelector(':scope > .hero');
  const switcher = screen.querySelector(':scope > .select-wrap');
  const table = directCard('Live Table');
  const fixtures = directCard("This Gameweek's Fixtures");
  const need = directCard('What You Need');
  const swing = [...screen.querySelectorAll(':scope > .card')].find(c => c.classList.contains('swing'));
  if (!hero || !table || !fixtures || screen.querySelector(':scope > .kp3-live-root')) return;

  const root = document.createElement('div'); root.className = 'kp3-live-root';
  const matches = document.createElement('section'); matches.className = 'kp3-view kp3-live-matches';
  screen.insertBefore(root, hero); root.append(matches);
  hero.classList.add('kp3-page-hero');
  matches.append(hero);
  if (switcher) matches.append(switcher);

  table.classList.add('kp3-table-card');
  matches.append(table);
  if (need) { need.classList.add('kp3-need'); matches.append(need); }

  fixtures.classList.add('kp3-live-card');
  fixtures.querySelectorAll('.fixture').forEach(f => {
    f.classList.add('kp3-live-fixture');
    f.querySelectorAll('.scorebox').forEach(s => s.classList.add('kp3-broadcast-score'));
  });
  matches.append(fixtures);
  if (swing) { swing.classList.add('kp3-swing'); fixtures.after(swing); }

  addLiveExtras(matches).catch(() => {});
}

function historyHasData(first) { return !hasText(first, 'No Gameweeks settled yet'); }

function clonePreviewRows(past) {
  const wrap = document.createElement('div');
  wrap.className = 'kp3-history-preview';
  const rows = [...past.querySelectorAll('.payment-row')].slice(0, 3);
  if (!rows.length) {
    wrap.innerHTML = '<div class="kp3-empty-small">Your settled Gameweeks will appear here.</div>';
    return wrap;
  }
  rows.forEach(row => wrap.append(row.cloneNode(true)));
  return wrap;
}

function enhanceHistory() {
  screen.className = 'screen kp3-screen kp3-history';
  if (screen.querySelector(':scope > .kp3-history-root')) return;
  const first = screen.querySelector(':scope > .card');
  const switcher = screen.querySelector(':scope > .select-wrap');
  const settle = [...screen.querySelectorAll(':scope > .card')].find(c => hasText(c.querySelector('.card-title'), 'Ready to Settle'));
  const past = directCard('Past Gameweeks');
  const stats = directCard('Your Season Stats');
  const awards = directCard('Awards');
  if (!first || !past || !stats) return;

  const hasData = historyHasData(first);
  const root = document.createElement('div'); root.className = 'kp3-history-root';
  const overview = document.createElement('section'); overview.className = 'kp3-view kp3-history-overview';
  const gameweeks = document.createElement('section'); gameweeks.className = 'kp3-view';
  const records = document.createElement('section'); records.className = 'kp3-view';
  screen.insertBefore(root, first); root.append(overview, gameweeks, records);

  const mast = document.createElement('section');
  mast.className = 'kp3-history-mast';
  mast.innerHTML = '<h1>History</h1><p>Your season, without the noise.</p>';
  overview.append(mast);
  if (switcher) overview.append(switcher);

  if (!hasData) {
    first.className = 'kp3-history-empty';
    first.innerHTML = `<span>${icon('trophy')}</span><strong>Season ready to start</strong><p>Your first settled Gameweek will appear here.</p>`;
    overview.append(first);
  } else {
    first.classList.add('kp3-latest-winner');
    overview.append(first);
  }

  stats.classList.add('kp3-season-stats');
  overview.append(stats);
  if (settle) overview.append(settle);

  const recent = document.createElement('section'); recent.className = 'kp3-recent';
  recent.innerHTML = '<div class="kp3-section-head"><strong>Recent Gameweeks</strong></div>';
  recent.append(clonePreviewRows(past));
  overview.append(recent);

  const menu = document.createElement('div'); menu.className = 'kp3-history-links';
  if (hasData) {
    menu.append(
      makeNavRow('All Gameweeks', 'Results and weekly winners', 'trophy', () => { subState.history = 'gameweeks'; showView({ overview, gameweeks, records }, 'gameweeks'); }),
      makeNavRow('Season records', 'Most wins, exact scores and more', 'target', () => { subState.history = 'records'; showView({ overview, gameweeks, records }, 'records'); })
    );
  } else {
    const locked = makeNavRow('Season records', 'Available after your first settled Gameweek', 'target', () => {});
    locked.disabled = true; locked.classList.add('kp3-disabled'); menu.append(locked);
  }
  overview.append(menu);

  past.classList.add('kp3-gameweeks-list');
  gameweeks.append(makeBackHeader('Gameweeks', 'Past winners', () => { subState.history = 'overview'; showView({ overview, gameweeks, records }, 'overview'); }), past);

  records.append(makeBackHeader('Season records', 'Bragging rights', () => { subState.history = 'overview'; showView({ overview, gameweeks, records }, 'overview'); }));
  if (awards) {
    awards.classList.add('kp3-records-card');
    const title = awards.querySelector('.card-title'); if (title) title.textContent = 'Records';
    records.append(awards);
  }
  showView({ overview, gameweeks, records }, subState.history);
}

function memberStatus(source, memberRow) {
  const paid = Boolean(source?.querySelector('.paid'));
  const claimed = /\bClaimed\b/i.test(source?.textContent || '');
  const confirm = source?.querySelector('.confirm-btn');
  const el = document.createElement(confirm ? 'button' : 'span');
  if (confirm) el.type = 'button';
  el.className = `kp3-member-status ${paid ? 'is-paid' : claimed ? 'is-pending' : 'is-unpaid'}${confirm ? ' can-approve' : ''}`;
  el.textContent = paid ? 'Paid ✓' : claimed ? 'Needs approval' : 'Unpaid';
  if (confirm) {
    el.addEventListener('click', () => {
      el.disabled = true; el.textContent = 'Approving…'; confirm.click();
    });
  }
  memberRow.append(el);
}

function buildMembers(payments) {
  const list = document.createElement('div'); list.className = 'kp3-members-list';
  const rows = [...(payments?.querySelectorAll('.payment-row') || [])];
  rows.forEach(source => {
    const row = document.createElement('div'); row.className = 'kp3-member-row';
    const left = source.querySelector('.row-left')?.cloneNode(true); if (left) row.append(left);
    memberStatus(source, row); list.append(row);
  });
  if (!rows.length) list.innerHTML = '<div class="kp3-empty-small">No members yet.</div>';
  return list;
}

function improvePaymentCard(pay, mePaid) {
  if (!pay) return;
  pay.classList.add('kp3-payment-details');
  const claim = pay.querySelector('#claimPaid');
  const waiting = pay.querySelector('.status.warning');
  if (mePaid) {
    claim?.remove(); waiting?.remove();
    if (!pay.querySelector('.kp3-payment-confirmed')) {
      const done = document.createElement('div'); done.className = 'kp3-payment-confirmed'; done.textContent = 'Paid ✓'; pay.append(done);
    }
  }
  const bankbox = pay.querySelector('.bankbox');
  if (bankbox && !pay.querySelector('.kp3-copy-bank')) {
    const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'kp3-copy-bank'; copy.innerHTML = `${icon('copy')} Copy payment details`;
    copy.addEventListener('click', async () => {
      const text = [...bankbox.querySelectorAll('.bankline')].map(line => `${line.querySelector('span')?.textContent?.trim() || ''}: ${line.querySelector('b')?.textContent?.trim() || ''}`).join('\n');
      try { await navigator.clipboard.writeText(text); copy.textContent = 'Copied'; setTimeout(() => { copy.innerHTML = `${icon('copy')} Copy payment details`; }, 1400); } catch {}
    });
    bankbox.after(copy);
  }
}

async function setupJoinAnother(container) {
  const button = container.querySelector('.kp3-join-another');
  if (!button || button.dataset.bound === '1') return;
  button.dataset.bound = '1';
  button.addEventListener('click', () => {
    const form = container.querySelector('.kp3-join-form');
    form.hidden = !form.hidden;
    if (!form.hidden) form.querySelector('input')?.focus();
  });
  container.querySelector('.kp3-join-submit')?.addEventListener('click', async () => {
    const input = container.querySelector('.kp3-join-form input');
    const status = container.querySelector('.kp3-join-status');
    const code = input?.value.trim(); if (!code) return;
    status.textContent = 'Joining…';
    try {
      const client = await getSupabase();
      const { error } = await client.rpc('join_group', { p_join_code: code });
      if (error) throw error;
      status.textContent = 'Joined ✓';
      setTimeout(() => location.reload(), 450);
    } catch (err) { status.textContent = err.message || 'Could not join group.'; }
  });
}

function enhanceGroup() {
  screen.className = 'screen kp3-screen kp3-group';
  if (screen.querySelector(':scope > .kp3-group-root')) return;
  const head = screen.querySelector(':scope > .group-head');
  const join = [...screen.querySelectorAll(':scope > .pill')].find(el => hasText(el, 'Join code'));
  const switcher = screen.querySelector(':scope > .select-wrap');
  const pot = directCard('Pot');
  const payments = directCard('Member Payments');
  const week = directCard('This Week');
  const pay = directCard('Pay the Treasurer');
  const admin = directCard('Treasurer · Bank Details');
  const rivalry = directCard('Group Rivalry');
  const leave = directCard('Leave Group');
  if (!head || !pot) return;
  rivalry?.remove();

  const myRow = [...(payments?.querySelectorAll('.payment-row') || [])].find(r => hasText(r, '(you)'));
  const mePaid = Boolean(myRow?.querySelector('.paid'));
  improvePaymentCard(pay, mePaid);
  const amount = pot.querySelector('.pot-amount')?.textContent?.trim() || '£0';
  const paymentBadge = pot.querySelector('.badge')?.textContent?.trim() || '0/0 paid';
  const memberCount = payments?.querySelectorAll('.payment-row').length || 0;

  const root = document.createElement('div'); root.className = 'kp3-group-root';
  const overview = document.createElement('section'); overview.className = 'kp3-view kp3-group-overview';
  const members = document.createElement('section'); members.className = 'kp3-view';
  const paymentView = document.createElement('section'); paymentView.className = 'kp3-view';
  const rules = document.createElement('section'); rules.className = 'kp3-view';
  const settings = document.createElement('section'); settings.className = 'kp3-view';
  screen.insertBefore(root, head); root.append(overview, members, paymentView, rules, settings);

  head.classList.add('kp3-group-head');
  const subtitle = head.querySelector('.hero-sub');
  if (subtitle) subtitle.textContent = subtitle.textContent.replace(/\b1 members\b/i, '1 member');
  overview.append(head);

  if (switcher) { switcher.classList.add('kp3-group-switch-top'); overview.append(switcher); }

  const potHero = document.createElement('section'); potHero.className = 'kp3-pot-hero';
  potHero.innerHTML = `<div><small>CURRENT POT</small><strong>${esc(amount)}</strong><span>${esc(paymentBadge)} ✓</span></div><div class="kp3-ball-art" aria-hidden="true"></div>`;
  overview.append(potHero);

  const nav = document.createElement('div'); nav.className = 'kp3-group-menu';
  const views = { overview, members, payments: paymentView, rules, settings };
  const go = key => { subState.group = key; showView(views, key); };
  const m = makeNavRow('Members', 'Manage your group', 'users', () => go('members'));
  m.querySelector('.kp3-nav-meta').textContent = `${memberCount} member${memberCount === 1 ? '' : 's'}`;
  const p = makeNavRow('Payments', 'Payment details & status', 'card', () => go('payments'));
  p.querySelector('.kp3-nav-meta').textContent = paymentBadge;
  nav.append(m, p, makeNavRow('Rules', 'Scoring & lock times', 'shield', () => go('rules')), makeNavRow('Group settings', 'Invite code & admin', 'settings', () => go('settings')));
  overview.append(nav);

  members.append(makeBackHeader('Members', `${memberCount} in this group`, () => go('overview')), buildMembers(payments));
  const invite = document.createElement('button'); invite.type = 'button'; invite.className = 'kp3-primary-small'; invite.textContent = 'Invite members'; invite.addEventListener('click', () => go('settings')); members.append(invite);

  paymentView.append(makeBackHeader('Payments', paymentBadge, () => go('overview')));
  if (pay) paymentView.append(pay);
  if (payments) { payments.classList.add('kp3-payment-history'); paymentView.append(payments); }

  rules.append(makeBackHeader('Rules', 'How the pot works', () => go('overview')));
  if (week) { week.classList.add('kp3-rules-card'); rules.append(week); }

  settings.append(makeBackHeader('Group settings', 'Invite and manage', () => go('overview')));
  const settingsList = document.createElement('div'); settingsList.className = 'kp3-settings-list';
  if (join) {
    const code = join.querySelector('strong')?.textContent?.trim() || '';
    const row = document.createElement('button'); row.type = 'button'; row.className = 'kp3-setting-row'; row.innerHTML = `<span><small>Invite code</small><strong>${esc(code)}</strong></span><em>Copy</em>`;
    row.addEventListener('click', async () => { try { await navigator.clipboard.writeText(code); row.querySelector('em').textContent = 'Copied'; setTimeout(() => row.querySelector('em').textContent = 'Copy', 1300); } catch {} });
    settingsList.append(row); join.remove();
  }
  const joinAnother = document.createElement('button'); joinAnother.type = 'button'; joinAnother.className = 'kp3-setting-row kp3-join-another'; joinAnother.innerHTML = `<span>${icon('plus')}<strong>Join another group</strong></span>${chevron()}`;
  settingsList.append(joinAnother);
  const form = document.createElement('div'); form.className = 'kp3-join-form'; form.hidden = true; form.innerHTML = `<input type="text" maxlength="6" placeholder="6-character join code" autocomplete="off"><button type="button" class="kp3-join-submit">Join group</button><small class="kp3-join-status"></small>`;
  settingsList.append(form); settings.append(settingsList);
  if (admin) {
    admin.classList.add('kp3-admin-card');
    [['#bankName','Account holder'],['#bankSort','Sort code'],['#bankAcc','Account number']].forEach(([sel,label]) => {
      const input = admin.querySelector(sel); const wrap = input?.closest('.scorer-row');
      if (input && wrap && !wrap.querySelector('label')) { const l = document.createElement('label'); l.textContent = label; l.htmlFor = input.id; wrap.prepend(l); }
    });
    settings.append(admin);
  }
  if (leave) { leave.classList.add('kp3-leave-card'); settings.append(leave); }
  pot.remove();
  setupJoinAnother(settings);
  showView(views, subState.group);
}

async function maybeWinnerMoment() {
  if (winnerChecked) return;
  winnerChecked = true;
  try {
    const ctx = await loadContext(false);
    const latest = ctx?.history?.[0];
    if (!ctx || !latest || latest.winner_user_id !== ctx.session.user.id) return;
    const key = `kp3-win:${ctx.group.id}:${latest.gameweek_id}:${ctx.session.user.id}`;
    if (localStorage.getItem(key)) return;
    const pot = Number(ctx.group.stake_pence || 0) * Math.max(1, ctx.members.length) / 100;
    const overlay = document.createElement('div'); overlay.className = 'kp3-winner';
    overlay.innerHTML = `<button type="button" aria-label="Close">×</button><div class="kp3-winner-cup">${icon('trophy')}</div><small>YOU WON</small><h1>${esc(latest.gameweeks?.round_name || 'Gameweek')}</h1><strong>£${Number.isInteger(pot) ? pot.toFixed(0) : pot.toFixed(2)}</strong><p>Top of the pot.</p><button type="button" class="kp3-winner-action">See result</button>`;
    const dismiss = go => { localStorage.setItem(key,'1'); overlay.remove(); if (go) document.querySelector('.nav-item[data-tab="history"]')?.click(); };
    overlay.querySelector(':scope > button').addEventListener('click', () => dismiss(false));
    overlay.querySelector('.kp3-winner-action').addEventListener('click', () => dismiss(true));
    document.body.append(overlay);
  } catch {}
}

function enhance() {
  if (busy || !screen?.children.length) return;
  const tab = document.querySelector('.nav-item.active')?.dataset?.tab;
  if (!tab) return;
  if (tab !== lastTab) {
    lastTab = tab;
    if (tab === 'live') subState.live = 'matches';
    if (tab === 'history') subState.history = 'overview';
    if (tab === 'group') subState.group = 'overview';
    dataCache = null; dataCacheAt = 0;
  }
  const expected = `.kp3-${tab}-root`;
  if (screen.querySelector(`:scope > ${expected}`)) return;
  busy = true;
  try {
    if (tab === 'gw') enhanceGW();
    if (tab === 'live') enhanceLive();
    if (tab === 'history') enhanceHistory();
    if (tab === 'group') enhanceGroup();
  } finally { busy = false; }
  maybeWinnerMoment();
}

const observer = new MutationObserver(() => queueMicrotask(enhance));
observer.observe(screen, { childList: true });
window.addEventListener('load', enhance);
window.addEventListener('focus', () => { dataCache = null; dataCacheAt = 0; maybeWinnerMoment(); });
queueMicrotask(enhance);
