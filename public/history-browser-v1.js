(() => {
  const GROUP_KEY = 'kp-active-group-v1';
  const FEATURE_ID = 'kpHistoryBrowser';
  const MODAL_ID = 'kpHistoryPlayerModal';
  let renderToken = 0;
  let scheduled = false;

  const esc = (value = '') => String(value).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[c]));

  function activeGroupId() {
    const select = document.querySelector('#groupSwitch');
    if (select?.value) return select.value;
    try { return sessionStorage.getItem(GROUP_KEY) || localStorage.getItem(GROUP_KEY) || ''; }
    catch { return ''; }
  }

  function historyIsActive() {
    return document.querySelector('.nav-item[data-tab="history"]')?.classList.contains('active');
  }

  function findHistoryCard() {
    return [...document.querySelectorAll('#screen .card')].find(card =>
      /Past (Gameweeks|Matchdays)/i.test(card.querySelector('.card-title')?.textContent || '')
    );
  }

  function closeModal() {
    document.getElementById(MODAL_ID)?.remove();
    document.body.classList.remove('kp-history-modal-open');
  }

  async function getClient() {
    if (window.__kickpotSupabase) return window.__kickpotSupabase;
    for (let i = 0; i < 30; i += 1) {
      await new Promise(r => setTimeout(r, 100));
      if (window.__kickpotSupabase) return window.__kickpotSupabase;
    }
    return null;
  }

  function label(gw) {
    const n = String(gw?.round_name || '').match(/(\d+)/)?.[1];
    return n ? `Matchday ${n}` : (gw?.round_name || 'Matchday');
  }

  function initials(name = '') {
    const words = String(name).trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '?';
    return (words.length > 1 ? words[0][0] + words.at(-1)[0] : words[0].slice(0,2)).toUpperCase();
  }

  function sorted(rows) {
    return [...rows].sort((a,b) =>
      Number(b.points || 0) - Number(a.points || 0) ||
      Number(b.exact_scores || 0) - Number(a.exact_scores || 0) ||
      String(a.display_name || '').localeCompare(String(b.display_name || ''))
    );
  }

  function rowsHtml(rows, weekId) {
    return sorted(rows).map((row, i) => {
      const name = row.display_name || 'Player';
      return `<button type="button" class="kp-history-player-row" data-user-id="${esc(row.user_id)}" data-gameweek-id="${esc(weekId)}" data-player-name="${esc(name)}">
        <span class="kp-history-rank">${i + 1}</span>
        <span class="kp-history-avatar">${esc(initials(name))}</span>
        <span class="kp-history-player-copy"><strong>${esc(name)}${i === 0 ? ' ♛' : ''}</strong><small>${Number(row.exact_scores || 0)} exact · ${Number(row.scorer_hits || 0)} scorer</small></span>
        <span class="kp-history-points">${Number(row.points || 0)}<small>pts</small></span>
        <span class="kp-history-chevron">›</span>
      </button>`;
    }).join('') || '<div class="empty">No table data for this Matchday.</div>';
  }

  function scheduleMount() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      mount().catch(() => {});
    });
  }

  async function mount() {
    if (!historyIsActive()) return;
    const card = findHistoryCard();
    if (!card || card.querySelector(`#${FEATURE_ID}`)) return;

    const title = card.querySelector('.card-title');
    const titleHtml = title?.outerHTML || '<div class="card-title">Past Matchdays</div>';
    const token = ++renderToken;
    card.innerHTML = `${titleHtml}<div id="${FEATURE_ID}"><div class="kp-history-loading"><span></span><span></span><span></span></div></div>`;

    const client = await getClient();
    const groupId = activeGroupId();
    const root = document.getElementById(FEATURE_ID);
    if (!root || token !== renderToken || !historyIsActive()) return;
    if (!client || !groupId) { root.innerHTML = '<div class="empty">Couldn’t load previous Matchdays.</div>'; return; }

    const { data: board, error } = await client.from('group_leaderboard')
      .select('user_id,display_name,gameweek_id,points,exact_scores,scorer_hits,team_score_hits')
      .eq('group_id', groupId);
    if (error) { root.innerHTML = `<div class="empty">${esc(error.message)}</div>`; return; }

    const ids = [...new Set((board || []).map(r => r.gameweek_id).filter(Boolean))];
    if (!ids.length) { root.innerHTML = '<div class="empty">No completed Matchdays yet.</div>'; return; }

    const { data: weeks, error: weekError } = await client.from('gameweeks')
      .select('id,round_name,starts_at').in('id', ids).order('starts_at', { ascending:false });
    if (weekError || !weeks?.length) { root.innerHTML = '<div class="empty">Couldn’t load previous Matchdays.</div>'; return; }
    if (token !== renderToken || !root.isConnected) return;

    const byWeek = new Map(ids.map(id => [String(id), (board || []).filter(r => String(r.gameweek_id) === String(id))]));
    const first = weeks[0];
    root.innerHTML = `<div class="kp-history-week-strip" role="tablist">${weeks.map((w,i) => `<button type="button" class="kp-history-week-chip${i === 0 ? ' active' : ''}" data-gameweek-id="${esc(w.id)}">${esc(label(w))}</button>`).join('')}</div>
      <div class="kp-history-table-head"><span id="kpHistoryWeekTitle">${esc(label(first))}</span><small>Tap a player to see their picks</small></div>
      <div id="kpHistoryBoard">${rowsHtml(byWeek.get(String(first.id)), first.id)}</div>`;

    root.addEventListener('click', e => {
      const chip = e.target.closest('.kp-history-week-chip');
      if (chip) {
        const id = chip.dataset.gameweekId;
        root.querySelectorAll('.kp-history-week-chip').forEach(x => x.classList.toggle('active', x === chip));
        const week = weeks.find(w => String(w.id) === String(id));
        const heading = root.querySelector('#kpHistoryWeekTitle');
        if (heading) heading.textContent = label(week);
        const boardEl = root.querySelector('#kpHistoryBoard');
        if (boardEl) boardEl.innerHTML = rowsHtml(byWeek.get(String(id)), id);
      }
    });
  }

  async function openPlayer(button) {
    closeModal();
    const userId = button.dataset.userId;
    const weekId = button.dataset.gameweekId;
    const name = button.dataset.playerName || 'Player';
    if (!userId || !weekId) return;

    const modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'kp-history-modal-backdrop';
    modal.innerHTML = `<section class="kp-history-modal" role="dialog" aria-modal="true"><div class="kp-history-modal-head"><button type="button" class="kp-history-close">‹</button><div><small>Matchday picks</small><h2>${esc(name)}</h2></div></div><div class="kp-history-modal-body"><div class="kp-history-loading"><span></span><span></span><span></span></div></div></section>`;
    document.body.appendChild(modal);
    document.body.classList.add('kp-history-modal-open');
    modal.querySelector('.kp-history-close')?.addEventListener('click', closeModal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

    const client = await getClient();
    const groupId = activeGroupId();
    const body = modal.querySelector('.kp-history-modal-body');
    if (!client || !groupId || !body) return;

    const [{data:fixtures,error:fxErr},{data:picks,error:pickErr},{data:week}] = await Promise.all([
      client.from('fixtures').select('id,home_team_name,away_team_name,home_goals,away_goals,first_scorer_name,kickoff').eq('gameweek_id', weekId).order('kickoff'),
      client.from('predictions').select('fixture_id,predicted_home,predicted_away,first_scorer_name,points').eq('group_id', groupId).eq('user_id', userId),
      client.from('gameweeks').select('id,round_name').eq('id', weekId).maybeSingle()
    ]);
    if (!modal.isConnected) return;
    if (fxErr || pickErr) { body.innerHTML = '<div class="empty">Couldn’t load predictions.</div>'; return; }

    const map = new Map((picks || []).map(p => [String(p.fixture_id), p]));
    const total = (fixtures || []).reduce((s,f) => s + Number(map.get(String(f.id))?.points || 0), 0);
    modal.querySelector('.kp-history-modal-head small').textContent = label(week);
    body.innerHTML = `<div class="kp-history-player-total"><span>Total</span><strong>${total} pts</strong></div><div class="kp-history-fixtures">${(fixtures || []).map(f => {
      const p = map.get(String(f.id));
      const actual = f.home_goals != null && f.away_goals != null;
      const pts = Number(p?.points || 0);
      return `<article class="kp-history-fixture-row"><div class="kp-history-fixture-main"><div class="kp-history-team"><span>${esc(f.home_team_name || 'Home')}</span><b>${actual ? esc(f.home_goals) : '–'}</b></div><div class="kp-history-team"><span>${esc(f.away_team_name || 'Away')}</span><b>${actual ? esc(f.away_goals) : '–'}</b></div></div><div class="kp-history-pick-line"><span>${p ? `Predicted <strong>${p.predicted_home}–${p.predicted_away}</strong>${p.first_scorer_name ? ` · ${esc(p.first_scorer_name)}` : ''}` : '<strong>No prediction</strong>'}</span><b class="kp-history-earned${pts ? ' scored' : ''}">+${pts}</b></div>${f.first_scorer_name ? `<div class="kp-history-result-note">First scorer: ${esc(f.first_scorer_name)}</div>` : ''}</article>`;
    }).join('')}</div>`;
  }

  document.addEventListener('click', e => {
    const row = e.target.closest('.kp-history-player-row');
    if (row) openPlayer(row);
  });

  // Navigation must always win over the History modal/overlay.
  document.querySelector('.bottom-nav')?.addEventListener('pointerdown', () => {
    closeModal();
    renderToken += 1;
  }, true);
  document.querySelector('.bottom-nav')?.addEventListener('click', e => {
    if (e.target.closest('[data-tab="history"]')) setTimeout(scheduleMount, 0);
  }, true);

  document.addEventListener('change', e => {
    if (e.target?.id === 'groupSwitch') { renderToken += 1; setTimeout(scheduleMount, 0); }
  }, true);

  const screen = document.querySelector('#screen');
  if (screen) new MutationObserver(scheduleMount).observe(screen, { childList:true, subtree:true });
  window.addEventListener('pageshow', scheduleMount);
  scheduleMount();
})();