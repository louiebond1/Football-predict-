(() => {
  const ROOT_ID = 'kpHistoryInlineV2';
  let renderSeq = 0;

  const esc = (value = '') => String(value).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[c]));

  function historyActive() {
    return document.querySelector('.nav-item[data-tab="history"]')?.classList.contains('active') === true;
  }

  function activeGroupId() {
    const select = document.querySelector('#groupSwitch');
    if (select?.value) return select.value;
    try {
      return sessionStorage.getItem('kp-active-group-v1') || localStorage.getItem('kp-active-group-v1') || '';
    } catch {
      return '';
    }
  }

  function historyCard() {
    return [...document.querySelectorAll('#screen .card')].find(card => {
      const text = card.querySelector('.card-title')?.textContent || '';
      return /Past (?:Matchdays|Gameweeks)/i.test(text);
    });
  }

  async function client() {
    if (window.__kickpotSupabase) return window.__kickpotSupabase;
    for (let i = 0; i < 30; i += 1) {
      await new Promise(r => setTimeout(r, 100));
      if (window.__kickpotSupabase) return window.__kickpotSupabase;
    }
    return null;
  }

  function weekLabel(gw) {
    const raw = gw?.round_name || 'Matchday';
    const m = String(raw).match(/(\d+)/);
    return m ? `Matchday ${m[1]}` : raw.replace(/Gameweek/i, 'Matchday');
  }

  function initials(name = '') {
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return (parts.length > 1 ? `${parts[0][0]}${parts.at(-1)[0]}` : parts[0].slice(0, 2)).toUpperCase();
  }

  function sortedRows(rows) {
    return [...rows].sort((a, b) =>
      (Number(b.points || 0) - Number(a.points || 0)) ||
      (Number(b.exact_scores || 0) - Number(a.exact_scores || 0)) ||
      String(a.display_name || '').localeCompare(String(b.display_name || ''))
    );
  }

  function tableHtml(rows, gameweekId) {
    const sorted = sortedRows(rows);
    if (!sorted.length) return '<div class="kp-hi-empty">No table data for this Matchday.</div>';
    return `<div class="kp-hi-table" role="table" aria-label="Matchday table">
      ${sorted.map((row, index) => {
        const name = row.display_name || 'Player';
        return `<button type="button" class="kp-hi-row" data-hi-user="${esc(row.user_id)}" data-hi-gw="${esc(gameweekId)}" data-hi-name="${esc(name)}">
          <span class="kp-hi-rank">${index + 1}</span>
          <span class="kp-hi-avatar">${esc(initials(name))}</span>
          <span class="kp-hi-name"><strong>${esc(name)}</strong><small>${Number(row.exact_scores || 0)} exact · ${Number(row.scorer_hits || 0)} scorer</small></span>
          <span class="kp-hi-points"><strong>${Number(row.points || 0)}</strong><small>PTS</small></span>
          <span class="kp-hi-arrow">›</span>
        </button>`;
      }).join('')}
    </div>`;
  }

  async function showPlayer(root, button) {
    const sb = await client();
    const gid = activeGroupId();
    const userId = button.dataset.hiUser;
    const gameweekId = button.dataset.hiGw;
    const name = button.dataset.hiName || 'Player';
    if (!sb || !gid || !userId || !gameweekId) return;

    root.innerHTML = `<div class="kp-hi-detail-head"><button type="button" class="kp-hi-back">← Back to table</button><div><small>Matchday picks</small><h3>${esc(name)}</h3></div></div><div class="kp-hi-loading">Loading predictions…</div>`;

    const [{ data: fixtures, error: fxErr }, { data: predictions, error: predErr }, { data: week }] = await Promise.all([
      sb.from('fixtures').select('id,kickoff,home_team_name,away_team_name,status,home_goals,away_goals,first_scorer_name').eq('gameweek_id', gameweekId).order('kickoff'),
      sb.from('predictions').select('fixture_id,predicted_home,predicted_away,first_scorer_name,points').eq('group_id', gid).eq('user_id', userId),
      sb.from('gameweeks').select('id,round_name').eq('id', gameweekId).maybeSingle()
    ]);

    if (!root.isConnected) return;
    if (fxErr || predErr) {
      root.innerHTML = `<div class="kp-hi-detail-head"><button type="button" class="kp-hi-back">← Back to table</button><div><small>${esc(weekLabel(week))}</small><h3>${esc(name)}</h3></div></div><div class="kp-hi-empty">Couldn’t load this player’s predictions.</div>`;
      return;
    }

    const byFixture = new Map((predictions || []).map(p => [String(p.fixture_id), p]));
    const rows = fixtures || [];
    const total = rows.reduce((sum, fx) => sum + Number(byFixture.get(String(fx.id))?.points || 0), 0);

    root.innerHTML = `<div class="kp-hi-detail-head"><button type="button" class="kp-hi-back">← Back to table</button><div><small>${esc(weekLabel(week))}</small><h3>${esc(name)}</h3></div></div>
      <div class="kp-hi-total"><span>Total this week</span><strong>${total} pts</strong></div>
      <div class="kp-hi-fixtures">${rows.map(fx => {
        const p = byFixture.get(String(fx.id));
        const actualKnown = fx.home_goals != null && fx.away_goals != null;
        const prediction = p ? `${p.predicted_home}–${p.predicted_away}` : 'No pick';
        const actual = actualKnown ? `${fx.home_goals}–${fx.away_goals}` : '—';
        return `<article class="kp-hi-fixture">
          <div class="kp-hi-fixture-top"><span>${esc(fx.home_team_name || 'Home')}</span><b>${actualKnown ? esc(fx.home_goals) : '—'}</b></div>
          <div class="kp-hi-fixture-top"><span>${esc(fx.away_team_name || 'Away')}</span><b>${actualKnown ? esc(fx.away_goals) : '—'}</b></div>
          <div class="kp-hi-pick"><span>${p ? `Predicted <strong>${esc(prediction)}</strong>${p.first_scorer_name ? ` · ${esc(p.first_scorer_name)}` : ''}` : '<strong>No prediction</strong>'}</span><b>+${Number(p?.points || 0)}</b></div>
          <div class="kp-hi-actual">Actual ${esc(actual)}${fx.first_scorer_name ? ` · First scorer ${esc(fx.first_scorer_name)}` : ''}</div>
        </article>`;
      }).join('') || '<div class="kp-hi-empty">No fixtures found for this Matchday.</div>'}</div>`;
  }

  async function mount() {
    if (!historyActive()) return;
    const card = historyCard();
    if (!card) return;
    if (card.querySelector(`#${ROOT_ID}`)) return;

    card.querySelectorAll('.payment-row').forEach(row => row.remove());
    card.querySelector('.empty')?.remove();

    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.innerHTML = '<div class="kp-hi-loading">Loading previous Matchdays…</div>';
    card.appendChild(root);

    const seq = ++renderSeq;
    const sb = await client();
    const gid = activeGroupId();
    if (!root.isConnected || seq !== renderSeq || !historyActive()) return;
    if (!sb || !gid) {
      root.innerHTML = '<div class="kp-hi-empty">Couldn’t load previous Matchdays.</div>';
      return;
    }

    const { data: settled, error: settledErr } = await sb.from('group_gameweeks')
      .select('gameweek_id,settled_at')
      .eq('group_id', gid)
      .not('settled_at', 'is', null)
      .order('settled_at', { ascending: false });

    if (settledErr || !root.isConnected) {
      root.innerHTML = '<div class="kp-hi-empty">Couldn’t load previous Matchdays.</div>';
      return;
    }

    const ids = [...new Set((settled || []).map(r => r.gameweek_id).filter(Boolean))];
    if (!ids.length) {
      root.innerHTML = '<div class="kp-hi-empty">No completed Matchdays yet.</div>';
      return;
    }

    const [{ data: board, error: boardErr }, { data: weeks, error: weekErr }] = await Promise.all([
      sb.from('group_leaderboard')
        .select('group_id,user_id,display_name,gameweek_id,points,exact_scores,scorer_hits,team_score_hits')
        .eq('group_id', gid)
        .in('gameweek_id', ids),
      sb.from('gameweeks')
        .select('id,round_name,starts_at')
        .in('id', ids)
        .order('starts_at', { ascending: false })
    ]);

    if (boardErr || weekErr || !weeks?.length || !root.isConnected) {
      root.innerHTML = '<div class="kp-hi-empty">Couldn’t load previous Matchdays.</div>';
      return;
    }

    const byWeek = new Map(weeks.map(w => [String(w.id), (board || []).filter(r => String(r.gameweek_id) === String(w.id))]));
    let selected = String(weeks[0].id);

    const renderWeek = () => {
      const week = weeks.find(w => String(w.id) === selected) || weeks[0];
      root.innerHTML = `<div class="kp-hi-weekbar" role="tablist" aria-label="Choose Matchday">${weeks.map(w => `<button type="button" class="kp-hi-week${String(w.id) === selected ? ' active' : ''}" data-hi-week="${esc(w.id)}" aria-selected="${String(w.id) === selected ? 'true' : 'false'}">${esc(weekLabel(w))}</button>`).join('')}</div>
        <div class="kp-hi-subhead"><strong>${esc(weekLabel(week))} table</strong><small>Tap a player to see their predictions</small></div>
        ${tableHtml(byWeek.get(selected) || [], selected)}`;
    };

    root.addEventListener('click', event => {
      const weekButton = event.target.closest('[data-hi-week]');
      if (weekButton) {
        selected = String(weekButton.dataset.hiWeek);
        renderWeek();
        return;
      }
      const player = event.target.closest('[data-hi-user]');
      if (player) {
        showPlayer(root, player);
        return;
      }
      if (event.target.closest('.kp-hi-back')) renderWeek();
    });

    renderWeek();
  }

  const screen = document.querySelector('#screen');
  if (screen) new MutationObserver(() => queueMicrotask(mount)).observe(screen, { childList: true, subtree: true });
  document.querySelector('.bottom-nav')?.addEventListener('click', event => {
    if (event.target.closest('.nav-item[data-tab="history"]')) setTimeout(mount, 0);
  }, { passive: true });
  document.addEventListener('change', event => {
    if (event.target?.id === 'groupSwitch') {
      renderSeq += 1;
      setTimeout(mount, 0);
    }
  }, true);
  mount();
})();
