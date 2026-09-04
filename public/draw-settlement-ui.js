import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GROUP_KEY = 'kp-active-group-v1';
let client = null;
let cache = null;
let cacheAt = 0;
let cacheGroup = '';
let busy = false;

async function getClient() {
  if (client) return client;
  const cfg = await fetch('/api/config', { cache:'no-store' }).then(r => r.json()).catch(() => null);
  if (!cfg?.supabaseConfigured) return null;
  client = createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
  return client;
}

function activeHistoryTab() {
  return document.querySelector('.nav-item.active')?.dataset?.tab === 'history';
}

function winnerIds(row) {
  if (Array.isArray(row?.winner_user_ids) && row.winner_user_ids.length) return row.winner_user_ids;
  return row?.winner_user_id ? [row.winner_user_id] : [];
}

function settlementKind(row) {
  if (row?.settlement_kind && row.settlement_kind !== 'pending') return row.settlement_kind;
  const ids = winnerIds(row);
  if (ids.length > 1) return 'draw';
  if (ids.length === 1) return 'winner';
  return row?.settled_at ? 'no_winner' : 'pending';
}

function drawLabel(row) {
  const count = winnerIds(row).length;
  if (settlementKind(row) === 'draw') return `${count}-way draw`;
  if (settlementKind(row) === 'no_winner') return 'No winner';
  return '';
}

function setText(node, value) {
  if (node && node.textContent !== value) node.textContent = value;
}

async function loadContext(force = false) {
  const sb = await getClient();
  if (!sb) return null;
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;

  const { data: groups } = await sb.from('groups').select('id,name,stake_pence,payments_required').order('created_at');
  const selected = document.querySelector('#groupSwitch')?.value || sessionStorage.getItem(GROUP_KEY) || '';
  const group = (groups || []).find(g => g.id === selected) || (groups || [])[0] || null;
  if (!group) return null;

  if (!force && cache && cacheGroup === group.id && Date.now() - cacheAt < 30000) return cache;

  const { data: history, error } = await sb.from('group_gameweeks')
    .select('group_id,gameweek_id,winner_user_id,winner_user_ids,settlement_kind,settled_at,gameweeks(round_name)')
    .eq('group_id', group.id)
    .not('settled_at', 'is', null)
    .order('settled_at', { ascending:false });
  if (error) return null;

  cache = { sb, session, group, history:history || [] };
  cacheGroup = group.id;
  cacheAt = Date.now();
  return cache;
}

function patchSettleButton() {
  const button = document.querySelector('#settleBtn');
  if (button && /crown winner/i.test(button.textContent || '')) setText(button, 'Settle Gameweek');
}

function patchLatest(row) {
  if (!row) return;
  const kind = settlementKind(row);
  if (kind !== 'draw' && kind !== 'no_winner') return;

  const card = document.querySelector('.kp3-latest-winner, .card.winner');
  if (!card) return;
  const eyebrow = card.querySelector('.eyebrow');
  const title = card.querySelector('h1');
  const muted = card.querySelector('.muted');
  const round = row.gameweeks?.round_name || 'Gameweek';

  card.classList.toggle('kp-settlement-draw', kind === 'draw');
  if (kind === 'draw') {
    const count = winnerIds(row).length;
    setText(eyebrow, 'Gameweek Draw');
    setText(title, `${count}-WAY DRAW`);
    setText(muted, `${round} · level after all tiebreakers`);
  } else {
    setText(eyebrow, 'Gameweek Settled');
    setText(title, 'NO WINNER');
    setText(muted, round);
  }
}

function patchRows(container, history) {
  if (!container) return;
  const rows = [...container.querySelectorAll('.payment-row')];
  rows.forEach((node, index) => {
    const result = history[index];
    if (!result) return;
    const label = drawLabel(result);
    if (!label) return;
    setText(node.querySelector('b'), label);
  });
}

function patchGameweekLists(history) {
  patchRows(document.querySelector('.kp3-history-preview'), history.slice(0, 3));
  patchRows(document.querySelector('.kp3-gameweeks-list'), history);

  const basePast = [...document.querySelectorAll('section.card')].find(card =>
    /past gameweeks/i.test(card.querySelector('.card-title')?.textContent || '')
  );
  patchRows(basePast, history);
}

function patchMyWins(ctx) {
  const stats = document.querySelector('.kp3-season-stats .statgrid') || document.querySelector('#seasonStatsCard .statgrid');
  const tiles = stats ? [...stats.querySelectorAll('.stat')] : [];
  if (tiles.length < 3) return;
  const count = ctx.history.filter(row => winnerIds(row).includes(ctx.session.user.id)).length;
  setText(tiles[2].querySelector('b'), String(count));
}

function patchRules() {
  const rules = document.querySelector('.kp3-rules-card');
  if (!rules || rules.dataset.kpTieRules === '1') return;
  const rows = [...rules.querySelectorAll('.rivalry-row')];
  const winner = rows.find(row => /winner takes all/i.test(row.textContent || ''));
  if (!winner) return;
  const copy = winner.querySelector('.row-left') || winner;
  const icon = copy.querySelector('svg')?.outerHTML || '';
  copy.innerHTML = `${icon} Ties: points → exact scores → individual team-score hits`;

  const tie = document.createElement('div');
  tie.className = 'rivalry-row kp-tie-rule';
  tie.innerHTML = '<span class="row-left">Still level after all three? Joint winners — split the pot equally.</span>';
  winner.after(tie);
  rules.dataset.kpTieRules = '1';
}

function patchFromCache() {
  patchSettleButton();
  patchRules();
  if (!activeHistoryTab() || !cache) return false;
  patchLatest(cache.history[0]);
  patchGameweekLists(cache.history);
  patchMyWins(cache);
  return true;
}

async function enhance(force = false) {
  patchSettleButton();
  patchRules();
  if (!activeHistoryTab() || busy) return;
  if (!force && patchFromCache()) return;
  busy = true;
  try {
    const ctx = await loadContext(force);
    if (!ctx || !activeHistoryTab()) return;
    patchLatest(ctx.history[0]);
    patchGameweekLists(ctx.history);
    patchMyWins(ctx);
  } finally {
    busy = false;
  }
}

// Warm the settlement cache without observing and rewriting the entire screen.
// The previous MutationObserver could trigger itself indefinitely on History.
setTimeout(() => loadContext().catch(() => null), 80);

document.addEventListener('click', event => {
  if (event.target.closest('[data-tab="history"], .kp3-back')) {
    setTimeout(() => enhance(), 0);
    setTimeout(() => enhance(), 120);
    return;
  }
  if (event.target.closest('#settleBtn')) {
    cache = null;
    cacheAt = 0;
    setTimeout(() => enhance(true), 120);
  }
});

document.addEventListener('change', event => {
  if (event.target?.id === 'groupSwitch') {
    cache = null;
    cacheAt = 0;
    cacheGroup = '';
    setTimeout(() => loadContext(true).then(() => patchFromCache()), 80);
  }
}, true);

window.addEventListener('pageshow', () => setTimeout(() => enhance(), 120));
window.addEventListener('focus', () => setTimeout(() => enhance(), 120));
setInterval(() => enhance(), 1500);
setTimeout(() => enhance(), 150);
