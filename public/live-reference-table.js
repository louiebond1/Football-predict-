(() => {
  const screen = document.querySelector('#screen');
  if (!screen) return;

  const state = {
    page: 'table', mounted: false, groupId: null, gameweekId: null,
    fixtures: [], predictions: {}, groupPredictions: {}, members: [], leaderboard: {}, pickStatus: {},
    myId: null, round: null, loaded: false, loading: false, error: '',
    refreshTimer: 0, loadPromise: null, generation: 0, context: null, picksError: false, openPicks: new Set()
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
    }).format(Number.isFinite(Date.parse(iso)) ? new Date(iso) : new Date(0));
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
  async function load() {
    if (state.loadPromise) return state.loadPromise;
    const generation = state.generation;
    state.loading = true;
    const promise = (async () => {
      try {
        const supabase = client();
        if (!supabase) throw new Error('Please reload KickPot to reconnect.');
        const {data:{session}} = await supabase.auth.getSession();
        if (!session) throw new Error('Please sign in again.');
        const context = state.context;
        let groupId = context?.groupId;
        if (!groupId) {
          const {data:groups,error} = await supabase.from('groups').select('id').order('created_at');
          if(error) throw error;
          let stored='';try{stored=sessionStorage.getItem('kp-active-group-v1')||localStorage.getItem('kp-active-group-v1');}catch{}
          groupId=groups?.find(g=>g.id===stored)?.id||groups?.[0]?.id;
        }
        if (!groupId) throw new Error('Join a group to see Live.');
        const response=await fetch('/api/football/fixtures',{cache:'no-store',signal:AbortSignal.timeout(15000)});
        const football=await response.json();
        if(!response.ok)throw new Error(football.error||'Fixtures could not be loaded');
        if(!Array.isArray(football.fixtures))throw new Error('Fixtures response was invalid');
        let gameweekId=football.gameweekId;
        const ensured=gameweekId
          ? await supabase.rpc('ensure_group_gameweek',{gid:groupId,gwid:gameweekId})
          : await supabase.rpc('ensure_current_gameweek',{p_group_id:groupId});
        if(ensured.error)throw ensured.error;
        gameweekId ||= ensured.data;
        if(generation!==state.generation)return;
        // Publish the fixture feed independently of optional standings/picks reads.
        state.fixtures=football.fixtures;state.round=football.round||'Matchday';state.loaded=true;
        state.groupId=groupId;state.gameweekId=gameweekId;state.myId=session.user.id;
        const ids=football.fixtures.map(f=>f.id);
        const revealedIds=football.fixtures.filter(f=>Number.isFinite(Date.parse(f.kickoff))&&Date.now()>=Date.parse(f.kickoff)).map(f=>f.id);
        const results=await Promise.all([
          supabase.from('group_members').select('user_id').eq('group_id',groupId),
          supabase.from('profiles').select('id,display_name'),
          supabase.from('group_leaderboard').select('*').eq('group_id',groupId).eq('gameweek_id',gameweekId),
          supabase.rpc('group_pick_status',{p_group_id:groupId,p_gameweek_id:gameweekId}),
          ids.length?supabase.from('predictions').select('fixture_id,predicted_home,predicted_away').eq('group_id',groupId).eq('user_id',session.user.id).in('fixture_id',ids):{data:[]},
          revealedIds.length?supabase.from('predictions').select('fixture_id,user_id,predicted_home,predicted_away').eq('group_id',groupId).in('fixture_id',revealedIds):{data:[]}
        ]);
        if(generation!==state.generation)return;
        const [members,profiles,board,status,mine,revealed]=results;
        const names=new Map((profiles.data||[]).map(p=>[p.id,p.display_name]));
        state.members=(members.data||[]).map(m=>({...m,display_name:names.get(m.user_id)||'Player'}));
        state.leaderboard=Object.fromEntries((board.data||[]).map(r=>[r.user_id,r]));
        state.pickStatus=Object.fromEntries((status.data||[]).map(r=>[r.user_id,Number(r.submitted_count)||0]));
        state.predictions=Object.fromEntries((mine.data||[]).map(p=>[String(p.fixture_id),p]));
        state.picksError=!!(revealed.error||members.error||profiles.error);
        const allowed=new Set(revealedIds.map(String));
        state.groupPredictions=(revealed.error?[]:revealed.data||[]).filter(p=>allowed.has(String(p.fixture_id))).reduce((all,p)=>{(all[String(p.fixture_id)]||=[]).push(p);return all;},{});
        state.error=results.some(r=>r.error)?'Some Live data could not be refreshed. Try again.':'';
      } catch(error) {
        if(generation===state.generation){state.error=error?.message||'Live could not be refreshed.';state.picksError=true;}
      } finally {
        if(generation===state.generation){state.loading=false;state.loadPromise=null;}
      }
    })();
    state.loadPromise=promise;return promise;
  }

  function rankedRoster() {
    const total = state.fixtures.length;
    const roster = state.members.map(member => ({ ...member,
      points: Number(state.leaderboard[member.user_id]?.points) || 0,
      exact: Number(state.leaderboard[member.user_id]?.exact_scores) || 0,
      hits: Number(state.leaderboard[member.user_id]?.team_score_hits) || 0,
      submitted: state.pickStatus[member.user_id] || 0,
      total, isMe: member.user_id === state.myId
    })).sort((a, b) => b.points - a.points || b.exact - a.exact || b.hits - a.hits || a.display_name.localeCompare(b.display_name));
    let rank = 0;
    roster.forEach((member, index) => {
      if (!index || ['points','exact','hits'].some(k=>member[k]!==roster[index-1][k])) rank = index + 1;
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
      <div class="kp-live-tpts">${member.points}</div>
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
  /* .kp-actions / .kp-action are shared with Matchday - same markup, same CSS,
     so the row has identical geometry on both tabs and only the copy differs. */
  const ICON = {
    fixtures: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><rect x="3" y="4.5" width="18" height="15" rx="3"/><path d="M3 9.5h18M8 4.5v-2M16 4.5v-2"/></svg>',
    picks: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="8" r="3.4"/><path d="M5 20v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1"/></svg>'
  };
  function actionHTML({ icon, title, sub, attrs }) {
    return `<button type="button" class="kp-action" ${attrs}><span class="kp-action-icon" aria-hidden="true">${icon}</span><span class="kp-action-copy"><b>${esc(title)}</b><small>${esc(sub)}</small></span><span class="kp-action-go" aria-hidden="true">›</span></button>`;
  }
  function actionsHTML() {
    return `<div class="kp-actions">${
      actionHTML({ icon: ICON.fixtures, title: 'Live fixtures', sub: 'Follow all matches', attrs: 'data-live-page="fixtures"' })
    }${
      actionHTML({ icon: ICON.picks, title: 'My picks', sub: 'Your predictions', attrs: 'data-live-page="picks"' })
    }</div>`;
  }
  function tableHTML(roster) {
    const locked = roster.filter(member => member.total && member.submitted === member.total).length;
    return `<div class="kp-live-table-head kp-sechead"><h1>Live Table</h1><div class="kp-live-locked kp-sechead-meta">🔒 ${locked}/${roster.length} locked</div></div><div class="kp-live-board">${roster.length ? roster.map(tableRowHTML).join('') : '<div class="kp-native-loading">No standings yet.</div>'}</div>`;
  }
  function drillHeaderHTML(title) {
    return `<div class="kp-live-drill-head"><button type="button" class="kp-live-drill-back" data-live-back aria-label="Back to Live Table">‹</button><div><h1>${title}</h1></div></div>`;
  }
  function fixtureHTML(fixture) {
    const started = fixture.status?.short !== 'NS';
    const score = started ? `${fixture.goals?.home ?? '–'}–${fixture.goals?.away ?? '–'}` : formatDayTime(fixture.kickoff).split(' ').pop();
    return `<div class="kp-live-fxc" data-fixture="${esc(fixture.id)}"><div class="kp-live-fxc-crests"><img src="${esc(fixture.home?.logo || '')}" alt=""><img src="${esc(fixture.away?.logo || '')}" alt=""></div><div class="kp-live-fxc-abbr"><span>${esc(displayName(fixture.home?.name))}</span><span class="v">v</span><span>${esc(displayName(fixture.away?.name))}</span></div><div class="kp-live-fxc-time${fixtureIsLive(fixture) ? ' is-live' : ''}">${esc(score)}</div><div class="kp-live-fxc-lock">${esc(fixtureStatus(fixture))}</div>${groupPicksHTML(fixture)}</div>`;
  }
  function groupPicksHTML(fixture) {
    if (!Number.isFinite(Date.parse(fixture.kickoff)) || Date.now() < Date.parse(fixture.kickoff)) return '';
    if(state.picksError)return '<div class="kp-live-empty">Group picks unavailable. <button type="button" data-live-retry>Try again</button></div>';
    const picks = state.groupPredictions[String(fixture.id)] || [];
    const byUser = new Map(picks.map(pick => [pick.user_id, pick]));
    return `<details class="kp-live-group-picks" data-picks-id="${esc(fixture.id)}"${state.openPicks.has(String(fixture.id)) ? ' open' : ''}><summary><span>Group picks</span><span>${picks.length}/${state.members.length} revealed</span></summary><div class="kp-live-group-picks-list">${state.members.map(member => {
      const pick = byUser.get(member.user_id);
      return `<div${member.user_id === state.myId ? ' class="is-me"' : ''}><span>${esc(member.display_name)}${member.user_id === state.myId ? ' · you' : ''}</span><strong>${pick ? `${pick.predicted_home}–${pick.predicted_away}` : 'No pick'}</strong></div>`;
    }).join('')}</div></details>`;
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
    const markup = `<div class="kp-live-screen" data-live-view="${state.page}">${state.error ? '<div class="status warning" role="status">'+esc(state.error)+' <button type="button" data-live-retry>Try again</button></div>':''}${content}</div>`;
    if(screen.innerHTML!==markup)screen.innerHTML=markup;
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
      if (state.mounted && isLiveRoute() && document.visibilityState!=='hidden') refresh();
    }, 30000);
  }
  /* Matchday's "Others' picks" card sends the user to the Live fixtures page,
     which is where group picks already live. The request is stored until mount
     runs, because the tab switch renders before this controller mounts. */
  let pendingPage = null;
  function mount({ reset = false, context = null } = {}) {
    /* Reset only when this is genuinely a different group or user. Being
       unmounted is not a reason to throw the cache away - see unmount(). */
    if(context && (context.groupId!==state.context?.groupId || context.userId!==state.context?.userId)) {
      state.generation++;state.loadPromise=null;state.loaded=false;state.fixtures=[];
      state.members=[];state.predictions={};state.groupPredictions={};state.error='';state.openPicks.clear();
    }
    state.context=context;
    state.mounted = true;
    if (pendingPage && VALID_PAGES.has(pendingPage)) { state.page = pendingPage; pendingPage = null; }
    else if (reset) state.page = 'table';
    else if(VALID_PAGES.has(history.state?.kpLivePage))state.page=history.state.kpLivePage;
    updateHistory(state.page, 'replace');
    render();
    startRefresh();
    refresh();
  }
  function unmount() {
    /* Leaving Live used to wipe fixtures, members, predictions and the loaded
       flag, so coming back always started from nothing - measured at 0.42s and
       0.70s of blank skeleton on two tab switches in a device recording, even
       though the group and the data had not changed. Matchday keeps its state
       and repaints instantly; Live now does the same. The in-flight request is
       still cancelled (generation++) and the poll still stops; only the cache
       survives, and mount() refreshes it immediately on the way back in. */
    state.mounted = false;
    state.generation++; state.loadPromise=null;
    clearInterval(state.refreshTimer);
    state.refreshTimer = 0;
    document.body.classList.remove('kp-native-live');
    delete document.body.dataset.kpLivePage;
  }

  screen.addEventListener('toggle',event=>{
    const id=event.target.dataset?.picksId;if(!id)return;
    if(event.target.open)state.openPicks.add(id);else state.openPicks.delete(id);
  },true);
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
      setPage('table', { historyMode: 'replace' });
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

  window.KickPotLive = Object.freeze({ mount, unmount, showTable: () => setPage('table', { historyMode: 'replace' }), requestPage: page => { if (VALID_PAGES.has(page)) pendingPage = page; } });
})();
