(() => {
  const screen = document.querySelector('#screen');
  if (!screen) return;

  const state = {
    page: 'table', mounted: false, groupId: null, gameweekId: null,
    fixtures: [], predictions: {}, members: [], leaderboard: {}, pickStatus: {},
    myId: null, round: null, loaded: false, loading: false, error: '',
    refreshTimer: 0, loadPromise: null
  };
  const FINAL_CODES = new Set(['FT', 'AET', 'PEN', 'PST', 'CANC', 'ABD', 'AWD', 'WO']);
  const VALID_PAGES = new Set(['table', 'fixtures', 'picks']);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));
  const client = () => window.__kickpotSupabase;
  const isLiveRoute = () => document.querySelector('.bottom-nav .nav-item.active')?.dataset.tab === 'live';
  const displayName = name => String(name || '').trim() === 'Nottingham' ? 'Nottingham Forest' : String(name || '');

  function formatDayTime(iso) {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false
    }).format(new Date(iso));
  }
  function relativeKickoff(iso) {
    const milliseconds = new Date(iso) - Date.now();
    if (milliseconds <= 0) return 'Locked';
    const hours = Math.floor(milliseconds / 36e5);
    const days = Math.floor(hours / 24);
    return days ? `Locks in ${days}d ${hours % 24}h` : `Locks in ${hours}h`;
  }
  function roundShort(round) {
    const match = String(round || '').match(/(\d+)/);
    return match ? match[1] : '';
  }
  function fixtureIsLive(fixture) {
    const code = String(fixture?.status?.short || '').toUpperCase();
    return code !== 'NS' && !FINAL_CODES.has(code);
  }
  function fixtureStatus(fixture) {
    const code = String(fixture?.status?.short || '').toUpperCase();
    if (code === 'NS') return relativeKickoff(fixture.kickoff);
    if (code === 'FT') return 'Full-time';
    if (code === 'HT') return 'Half-time';
    if (code === 'AET') return 'After extra time';
    if (code === 'PEN') return 'Penalties';
    if (code === 'PST') return 'Postponed';
    if (code === 'CANC') return 'Cancelled';
    if (fixture?.status?.elapsed) return `${fixture.status.elapsed}'`;
    return fixtureIsLive(fixture) ? 'LIVE' : code;
  }
  async function waitForClient(timeout = 15000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (client()) return client();
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return null;
  }
  async function waitForSession(supabase, timeout = 15000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const result = await supabase.auth.getSession().catch(() => null);
      if (result?.data?.session) return result.data.session;
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    return null;
  }

  async function load() {
    if (state.loadPromise) return state.loadPromise;
    state.loading = true;
    state.error = '';
    state.loadPromise = (async () => {
      try {
        const fixturesPromise = fetch(`/api/football/fixtures?_=${Date.now()}`, { cache: 'no-store' })
          .then(async response => {
            const payload = await response.json();
            if (!response.ok) throw new Error(payload?.error || 'Fixtures could not be loaded');
            if (!Array.isArray(payload?.fixtures)) throw new Error('Fixtures response was invalid');
            return payload;
          });
        const supabase = await waitForClient();
        if (!supabase) throw new Error('KickPot client did not initialise');
        const session = await waitForSession(supabase);
        if (!session) throw new Error('KickPot session did not initialise');
        state.myId = session.user.id;
        const { data: groups, error: groupsError } = await supabase.from('groups').select('*').order('created_at');
        if (groupsError) throw groupsError;
        const storedGroup = (() => {
          try { return sessionStorage.getItem('kp-active-group-v1') || localStorage.getItem('kp-active-group-v1') || ''; }
          catch { return ''; }
        })();
        state.groupId = (groups || []).find(group => group.id === storedGroup)?.id || groups?.[0]?.id || null;
        if (!state.groupId) throw new Error('No active group found');
        const { data: gameweekId, error: gameweekError } = await supabase.rpc('ensure_current_gameweek', { p_group_id: state.groupId });
        if (gameweekError) throw gameweekError;
        state.gameweekId = gameweekId;

        const [membersResult, profilesResult, leaderboardResult, pickStatusResult, predictionsResult, football] = await Promise.all([
          supabase.from('group_members').select('user_id').eq('group_id', state.groupId),
          supabase.from('profiles').select('id,display_name'),
          supabase.from('group_leaderboard').select('*').eq('group_id', state.groupId).eq('gameweek_id', state.gameweekId),
          supabase.rpc('group_pick_status', { p_group_id: state.groupId, p_gameweek_id: state.gameweekId }),
          supabase.from('predictions').select('*').eq('group_id', state.groupId).eq('user_id', state.myId),
          fixturesPromise
        ]);
        // Fixture visibility is independent of the leaderboard/profile queries.
        // Keep the football feed usable even if a secondary Supabase read fails.
        state.fixtures = football.fixtures;
        state.round = football.round || 'Matchday';
        if (membersResult.error) throw membersResult.error;
        if (profilesResult.error) throw profilesResult.error;
        if (leaderboardResult.error) throw leaderboardResult.error;
        if (predictionsResult.error) throw predictionsResult.error;

        const names = new Map((profilesResult.data || []).map(profile => [profile.id, profile.display_name]));
        state.members = (membersResult.data || []).map(member => ({ user_id: member.user_id, display_name: names.get(member.user_id) || 'Player' }));
        state.leaderboard = Object.fromEntries((leaderboardResult.data || []).map(row => [row.user_id, row.points]));
        state.pickStatus = pickStatusResult.error ? {} : Object.fromEntries((pickStatusResult.data || []).map(row => [row.user_id, Number(row.submitted_count) || 0]));
        const fixtureIds = new Set(state.fixtures.map(fixture => String(fixture.id)));
        state.predictions = Object.fromEntries((predictionsResult.data || [])
          .filter(prediction => fixtureIds.has(String(prediction.fixture_id)))
          .map(prediction => [String(prediction.fixture_id), prediction]));
        state.loaded = true;
      } catch (error) {
        state.error = error?.message || String(error);
        if (state.fixtures.length) state.loaded = true;
        console.error('KickPot Live load', error);
      } finally {
        state.loading = false;
        state.loadPromise = null;
      }
    })();
    return state.loadPromise;
  }

  function rankedRoster() {
    const total = state.fixtures.length;
    const roster = state.members.map(member => ({ ...member,
      points: state.leaderboard[member.user_id] || 0,
      submitted: state.pickStatus[member.user_id] || 0,
      total, isMe: member.user_id === state.myId
    })).sort((a, b) => b.points - a.points || a.display_name.localeCompare(b.display_name));
    let rank = 0;
    roster.forEach((member, index) => {
      if (!index || member.points !== roster[index - 1].points) rank = index + 1;
      member.rank = rank;
    });
    return roster;
  }
  function statusParts(member) {
    if (!member.total) return { locked: false, text: 'No fixtures yet' };
    if (!member.submitted) return { locked: false, text: 'Not submitted' };
    return { locked: member.submitted === member.total, text: `${member.submitted}/${member.total} picks locked` };
  }
  function tableRowHTML(member, index) {
    const status = statusParts(member);
    return `<div class="kp-live-trow${index === 0 ? ' top' : ''}${member.isMe ? ' me' : ''}">
      <div class="kp-live-tpos">${member.rank}</div>
      <div class="kp-live-tplayer"><div class="kp-live-tname">${esc(member.display_name)}${member.isMe ? ' <span class="kp-live-you">(you)</span>' : ''}</div>
      <div class="kp-live-tstatus"><span class="kp-live-dot${status.locked ? ' on' : ''}"></span>${esc(status.text)}</div></div>
      <div class="kp-live-tpts">${member.points}</div><div class="kp-live-tchevron">›</div>
    </div>`;
  }
  function heroHTML(roster) {
    const liveCount = state.fixtures.filter(fixtureIsLive).length;
    const upcoming = state.fixtures.filter(fixture => fixture.status?.short === 'NS').length;
    const locked = roster.filter(member => member.total && member.submitted === member.total).length;
    return `<section class="kp-live-hero"><img class="kp-live-hero-photo" src="/kickpot-hero-final.jpg" alt="">
      <div class="kp-live-eyebrow">Matchday ${esc(roundShort(state.round))}</div><h1>Live</h1>
      <div class="kp-live-hero-sub">REAL GAMES. REAL POINTS.</div>
      <div class="kp-live-stats"><span class="kp-live-dot on"></span>${liveCount} LIVE<span class="sep">|</span>🔒 ${locked}/${roster.length} LOCKED<span class="sep">|</span>${upcoming} UPCOMING</div></section>`;
  }
  function actionsHTML() {
    return `<div class="kp-live-primary-actions"><button type="button" data-live-page="fixtures"><span>Live fixtures</span><span aria-hidden="true">›</span></button><button type="button" data-live-page="picks"><span>My picks</span><span aria-hidden="true">›</span></button></div>`;
  }
  function tableHTML(roster) {
    const locked = roster.filter(member => member.total && member.submitted === member.total).length;
    return `<div class="kp-live-table-head"><h1>Live Table</h1><div class="kp-live-locked">🔒 ${locked}/${roster.length} locked</div></div><div class="kp-live-board">${roster.length ? roster.map(tableRowHTML).join('') : '<div class="kp-native-loading">No standings yet.</div>'}</div>`;
  }
  function drillHeaderHTML(title) {
    return `<div class="kp-live-drill-head"><button type="button" class="kp-live-drill-back" data-live-back aria-label="Back to Live Table">‹</button><div><h1>${title}</h1></div></div>`;
  }
  function fixtureHTML(fixture) {
    const started = fixture.status?.short !== 'NS';
    const score = started ? `${fixture.goals?.home ?? '–'}–${fixture.goals?.away ?? '–'}` : formatDayTime(fixture.kickoff).split(' ').pop();
    return `<div class="kp-live-fxc" data-fixture="${esc(fixture.id)}"><div class="kp-live-fxc-crests"><img src="${esc(fixture.home?.logo || '')}" alt=""><img src="${esc(fixture.away?.logo || '')}" alt=""></div><div class="kp-live-fxc-abbr"><span>${esc(displayName(fixture.home?.name))}</span><span class="v">v</span><span>${esc(displayName(fixture.away?.name))}</span></div><div class="kp-live-fxc-time${fixtureIsLive(fixture) ? ' is-live' : ''}">${esc(score)}</div><div class="kp-live-fxc-lock">${esc(fixtureStatus(fixture))}</div></div>`;
  }
  function emptyHTML(title, detail) {
    return `<div class="kp-live-empty"><strong>${esc(title)}</strong><span>${esc(detail)}</span><button type="button" data-live-retry>Try again</button></div>`;
  }
  function fixturesHTML() {
    return state.fixtures.length
      ? `<div class="kp-live-fx-scroll">${state.fixtures.map(fixtureHTML).join('')}</div>`
      : emptyHTML('No fixtures are available.', state.error || 'The football feed returned no matches for this Matchday.');
  }
  function pickHTML(fixture) {
    const prediction = state.predictions[String(fixture.id)];
    return `<div class="kp-live-pickrow"><div class="kp-live-pick-main"><img class="kp-live-pick-crest" src="${esc(fixture.home?.logo || '')}" alt=""><div class="kp-live-pick-team home">${esc(displayName(fixture.home?.name))}</div><div class="kp-live-pick-score">${prediction ? `${prediction.predicted_home}-${prediction.predicted_away}` : '—'}</div><div class="kp-live-pick-team away">${esc(displayName(fixture.away?.name))}</div><img class="kp-live-pick-crest" src="${esc(fixture.away?.logo || '')}" alt=""></div><div class="kp-live-pick-time">${esc(formatDayTime(fixture.kickoff))} · ${esc(relativeKickoff(fixture.kickoff))}</div></div>`;
  }
  function picksHTML() {
    return state.fixtures.length
      ? `<div class="kp-live-picks">${state.fixtures.map(pickHTML).join('')}</div>`
      : emptyHTML('No picks to show yet.', 'Fixtures will appear here when the Matchday feed is available.');
  }

  function render() {
    if (!state.mounted || !isLiveRoute()) return;
    document.body.classList.add('kp-native-live');
    document.body.dataset.kpLivePage = state.page;
    if (!state.loaded) {
      const message = state.error
        ? emptyHTML('Live could not be loaded.', state.error)
        : '<div class="kp-native-loading">Loading Live Table…</div>';
      screen.innerHTML = `<div class="kp-live-screen" data-live-view="loading">${message}</div>`;
      return;
    }
    const roster = rankedRoster();
    const content = state.page === 'table'
      ? `${heroHTML(roster)}${actionsHTML()}<div class="kp-live-body">${tableHTML(roster)}</div>`
      : `<div class="kp-live-body">${drillHeaderHTML(state.page === 'fixtures' ? 'Live fixtures' : 'My picks')}${state.page === 'fixtures' ? fixturesHTML() : picksHTML()}</div>`;
    screen.innerHTML = `<div class="kp-live-screen" data-live-view="${state.page}">${content}</div>`;
  }
  function updateHistory(page, mode) {
    if (!mode) return;
    try {
      const next = { ...(history.state || {}), kpLivePage: page };
      if (mode === 'push') history.pushState(next, '');
      else history.replaceState(next, '');
    } catch {}
  }
  function setPage(page, { historyMode = '', scroll = true } = {}) {
    if (!VALID_PAGES.has(page)) return;
    state.page = page;
    updateHistory(page, historyMode);
    render();
    if (scroll) window.scrollTo({ top: 0, behavior: 'auto' });
  }
  async function refresh() { await load(); render(); }
  function startRefresh() {
    clearInterval(state.refreshTimer);
    state.refreshTimer = setInterval(() => {
      if (state.mounted && isLiveRoute()) refresh();
    }, 30000);
  }
  function mount({ reset = false } = {}) {
    state.mounted = true;
    if (reset) state.page = 'table';
    updateHistory(state.page, 'replace');
    render();
    startRefresh();
    refresh();
  }
  function unmount() {
    state.mounted = false;
    clearInterval(state.refreshTimer);
    state.refreshTimer = 0;
    document.body.classList.remove('kp-native-live');
    delete document.body.dataset.kpLivePage;
  }

  let pointerBackAt = 0;
  screen.addEventListener('pointerup', event => {
    if (!event.target.closest('[data-live-back]') || !state.mounted) return;
    pointerBackAt = Date.now();
    event.preventDefault();
    setPage('table', { historyMode: 'replace' });
  });
  screen.addEventListener('click', event => {
    if (!state.mounted) return;
    const pageButton = event.target.closest('[data-live-page]');
    if (pageButton) {
      event.preventDefault();
      setPage(pageButton.dataset.livePage, { historyMode: 'push' });
      return;
    }
    if (event.target.closest('[data-live-back]')) {
      event.preventDefault();
      if (Date.now() - pointerBackAt >= 500) setPage('table', { historyMode: 'replace' });
      return;
    }
    if (event.target.closest('[data-live-retry]')) {
      event.preventDefault();
      state.error = '';
      render();
      refresh();
    }
  });
  window.addEventListener('popstate', event => {
    if (!state.mounted || !isLiveRoute()) return;
    const page = VALID_PAGES.has(event.state?.kpLivePage) ? event.state.kpLivePage : 'table';
    setPage(page, { scroll: false });
  });
  window.addEventListener('pageshow', () => {
    if (state.mounted && isLiveRoute()) refresh();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.mounted && isLiveRoute()) refresh();
  });

  window.KickPotLive = Object.freeze({ mount, unmount, showTable: () => setPage('table', { historyMode: 'replace' }) });
})();
