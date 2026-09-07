(() => {
  const GROUP_KEY = 'kp-active-group-v1';
  const FEATURE_ID = 'kpHistoryBrowser';
  const MODAL_ID = 'kpHistoryPlayerModal';
  let renderToken = 0;

  const esc = (value = '') => String(value).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[c]));

  function activeGroupId() {
    const select = document.querySelector('#groupSwitch');
    if (select?.value) return select.value;
    try {
      return sessionStorage.getItem(GROUP_KEY) || localStorage.getItem(GROUP_KEY) || '';
    } catch {
      return '';
    }
  }

  function historyIsActive() {
    return document.querySelector('.nav-item[data-tab="history"]')?.classList.contains('active');
  }

  function findPastGameweeksCard() {
    return [...document.querySelectorAll('#screen .card')].find(card =>
      /Past Gameweeks/i.test(card.querySelector('.card-title')?.textContent || '')
    );
  }

  async function getClient() {
    if (window.__kickpotSupabase) return window.__kickpotSupabase;
    for (let i = 0; i < 40; i += 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
      if (window.__kickpotSupabase) return window.__kickpotSupabase;
    }
    return null;
  }

  function roundNumber(label = '') {
    const match = String(label).match(/(\d+)/);
    return match ? Number(match[1]) : null;
  }

  function formatGameweek(gw) {
    const n = roundNumber(gw?.round_name);
    return n ? `Gameweek ${n}` : (gw?.round_name || 'Gameweek');
  }

  function sortBoard(rows) {
    return [...rows].sort((a, b) =>
      (Number(b.points) - Number(a.points)) ||
      (Number(b.exact_scores) - Number(a.exact_scores)) ||
      String(a.display_name || '').localeCompare(String(b.display_name || ''))
    );
  }

  function playerInitial(name = '') {
    const words = String(name).trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '?';
    return (words.length > 1 ? `${words[0][0]}${words.at(-1)[0]}` : words[0].slice(0, 2)).toUpperCase();
  }

  function boardRowsHtml(rows, gameweekId) {
    const sorted = sortBoard(rows);
    return sorted.map((row, index) => {
      const name = row.display_name || 'Player';
      const crown = index === 0 ? '<span class="kp-history-crown" aria-label="Winner">♛</span>' : '';
      return `<button class="kp-history-player-row" type="button" data-user-id="${esc(row.user_id)}" data-gameweek-id="${esc(gameweekId)}" data-player-name="${esc(name)}">
        <span class="kp-history-rank">${index + 1}</span>
        <span class="kp-history-avatar">${esc(playerInitial(name))}</span>
        <span class="kp-history-player-copy"><strong>${esc(name)} ${crown}</strong><small>${Number(row.exact_scores || 0)} exact · ${Number(row.scorer_hits || 0)} scorer</small></span>
        <span class="kp-history-points">${Number(row.points || 0)}<small>pts</small></span>
        <span class="kp-history-chevron">›</span>
      </button>`;
    }).join('');
  }

  function loadingHtml() {
    return `<div class="kp-history-loading"><span></span><span></span><span></span></div>`;
  }

  async function mountHistoryBrowser() {
    if (!historyIsActive()) return;
    const card = findPastGameweeksCard();
    if (!card || card.dataset.kpHistoryEnhanced === '1') return;

    card.dataset.kpHistoryEnhanced = '1';
    const existingTitle = card.querySelector('.card-title');
    const titleHtml = existingTitle?.outerHTML || '<div class="card-title">Past Gameweeks</div>';
    card.innerHTML = `${titleHtml}<div id="${FEATURE_ID}">${loadingHtml()}</div>`;

    const token = ++renderToken;
    const client = await getClient();
    const groupId = activeGroupId();
    const mount = document.getElementById(FEATURE_ID);
    if (!mount || token !== renderToken || !historyIsActive()) return;

    if (!client || !groupId) {
      mount.innerHTML = '<div class="empty">Couldn’t load previous Gameweeks.</div>';
      return;
    }

    const { data: boardRows, error: boardError } = await client
      .from('group_leaderboard')
      .select('group_id,user_id,display_name,gameweek_id,points,exact_scores,scorer_hits,team_score_hits')
      .eq('group_id', groupId);

    if (boardError) {
      mount.innerHTML = `<div class="empty">${esc(boardError.message || 'Couldn’t load previous Gameweeks.')}</div>`;
      return;
    }

    const ids = [...new Set((boardRows || []).map(row => row.gameweek_id).filter(Boolean))];
    if (!ids.length) {
      mount.innerHTML = '<div class="empty">No completed Gameweeks yet.</div>';
      return;
    }

    const { data: weeks, error: weeksError } = await client
      .from('gameweeks')
      .select('id,round_name,starts_at,ends_at')
      .in('id', ids)
      .order('starts_at', { ascending: false });

    if (weeksError || !weeks?.length) {
      mount.innerHTML = `<div class="empty">${esc(weeksError?.message || 'Couldn’t load previous Gameweeks.')}</div>`;
      return;
    }

    if (token !== renderToken || !document.getElementById(FEATURE_ID)) return;

    const rowsByWeek = new Map(ids.map(id => [String(id), (boardRows || []).filter(row => String(row.gameweek_id) === String(id))]));
    const defaultWeek = weeks[0];

    mount.innerHTML = `
      <div class="kp-history-week-strip" role="tablist" aria-label="Previous Gameweeks">
        ${weeks.map((gw, index) => `<button type="button" role="tab" class="kp-history-week-chip${index === 0 ? ' active' : ''}" data-gameweek-id="${esc(gw.id)}" aria-selected="${index === 0 ? 'true' : 'false'}">${esc(formatGameweek(gw))}</button>`).join('')}
      </div>
      <div class="kp-history-table-head"><span id="kpHistoryWeekTitle">${esc(formatGameweek(defaultWeek))}</span><small>Tap a player to see their picks</small></div>
      <div id="kpHistoryBoard">${boardRowsHtml(rowsByWeek.get(String(defaultWeek.id)) || [], defaultWeek.id)}</div>`;

    mount.querySelectorAll('.kp-history-week-chip').forEach(button => {
      button.addEventListener('click', () => {
        const selectedId = button.dataset.gameweekId;
        const selectedWeek = weeks.find(gw => String(gw.id) === String(selectedId));
        mount.querySelectorAll('.kp-history-week-chip').forEach(chip => {
          const active = chip === button;
          chip.classList.toggle('active', active);
          chip.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        const title = mount.querySelector('#kpHistoryWeekTitle');
        if (title) title.textContent = formatGameweek(selectedWeek);
        const board = mount.querySelector('#kpHistoryBoard');
        if (board) board.innerHTML = boardRowsHtml(rowsByWeek.get(String(selectedId)) || [], selectedId);
      });
    });
  }

  async function openPlayerModal(button) {
    const userId = button.dataset.userId;
    const gameweekId = button.dataset.gameweekId;
    const playerName = button.dataset.playerName || 'Player';
    if (!userId || !gameweekId) return;

    document.getElementById(MODAL_ID)?.remove();
    const modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'kp-history-modal-backdrop';
    modal.innerHTML = `<section class="kp-history-modal" role="dialog" aria-modal="true" aria-label="${esc(playerName)} predictions">
      <div class="kp-history-modal-head">
        <button type="button" class="kp-history-close" aria-label="Close">‹</button>
        <div><small>Gameweek picks</small><h2>${esc(playerName)}</h2></div>
      </div>
      <div class="kp-history-modal-body">${loadingHtml()}</div>
    </section>`;
    document.body.appendChild(modal);
    document.body.classList.add('kp-history-modal-open');

    const close = () => {
      modal.remove();
      document.body.classList.remove('kp-history-modal-open');
    };
    modal.querySelector('.kp-history-close')?.addEventListener('click', close);
    modal.addEventListener('click', event => { if (event.target === modal) close(); });

    const client = await getClient();
    const groupId = activeGroupId();
    const body = modal.querySelector('.kp-history-modal-body');
    if (!client || !groupId || !body) return;

    const [{ data: fixtures, error: fixturesError }, { data: predictions, error: predictionsError }, { data: week }] = await Promise.all([
      client.from('fixtures').select('id,kickoff,home_team_name,away_team_name,status,home_goals,away_goals,first_scorer_name').eq('gameweek_id', gameweekId).order('kickoff'),
      client.from('predictions').select('fixture_id,predicted_home,predicted_away,first_scorer_name,points').eq('group_id', groupId).eq('user_id', userId),
      client.from('gameweeks').select('id,round_name').eq('id', gameweekId).maybeSingle()
    ]);

    if (!modal.isConnected) return;
    if (fixturesError || predictionsError) {
      body.innerHTML = `<div class="empty">${esc(fixturesError?.message || predictionsError?.message || 'Couldn’t load predictions.')}</div>`;
      return;
    }

    const predByFixture = new Map((predictions || []).map(pred => [String(pred.fixture_id), pred]));
    const relevantFixtures = fixtures || [];
    const totalPoints = relevantFixtures.reduce((sum, fixture) => sum + Number(predByFixture.get(String(fixture.id))?.points || 0), 0);

    const heading = modal.querySelector('.kp-history-modal-head small');
    if (heading) heading.textContent = week?.round_name || 'Gameweek picks';

    body.innerHTML = `<div class="kp-history-player-total"><span>Total</span><strong>${totalPoints} pts</strong></div>
      <div class="kp-history-fixtures">
        ${relevantFixtures.map(fixture => {
          const pred = predByFixture.get(String(fixture.id));
          const actualKnown = fixture.home_goals != null && fixture.away_goals != null;
          const actual = actualKnown ? `${fixture.home_goals}–${fixture.away_goals}` : '–';
          const pick = pred ? `${pred.predicted_home}–${pred.predicted_away}` : 'No pick';
          const scorerPick = pred?.first_scorer_name ? ` · ${esc(pred.first_scorer_name)}` : '';
          const points = pred ? Number(pred.points || 0) : 0;
          const pointClass = points > 0 ? ' scored' : '';
          return `<article class="kp-history-fixture-row">
            <div class="kp-history-fixture-main">
              <div class="kp-history-team"><span>${esc(fixture.home_team_name || 'Home')}</span><b>${actualKnown ? esc(fixture.home_goals) : '–'}</b></div>
              <div class="kp-history-team"><span>${esc(fixture.away_team_name || 'Away')}</span><b>${actualKnown ? esc(fixture.away_goals) : '–'}</b></div>
            </div>
            <div class="kp-history-pick-line">
              <span>${pred ? `Predicted <strong>${esc(pick)}</strong>${scorerPick}` : '<strong>No prediction</strong>'}</span>
              <b class="kp-history-earned${pointClass}">+${points}</b>
            </div>
            ${fixture.first_scorer_name ? `<div class="kp-history-result-note">First scorer: ${esc(fixture.first_scorer_name)}</div>` : ''}
          </article>`;
        }).join('') || '<div class="empty">No fixtures found for this Gameweek.</div>'}
      </div>`;
  }

  document.addEventListener('click', event => {
    const row = event.target.closest('.kp-history-player-row');
    if (row) openPlayerModal(row);
  });

  const screen = document.querySelector('#screen');
  if (screen) {
    const observer = new MutationObserver(() => queueMicrotask(mountHistoryBrowser));
    observer.observe(screen, { childList: true, subtree: true });
  }
  document.addEventListener('click', event => {
    if (event.target.closest('.nav-item[data-tab="history"]')) setTimeout(mountHistoryBrowser, 0);
  }, true);
  document.addEventListener('change', event => {
    if (event.target?.id === 'groupSwitch') {
      renderToken += 1;
      setTimeout(mountHistoryBrowser, 0);
    }
  }, true);

  mountHistoryBrowser();
})();