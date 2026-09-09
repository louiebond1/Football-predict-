(() => {
  const S={groupId:null,gameweekId:null,fixtures:[],predictions:{},members:[],leaderboard:{},pickStatus:{},myId:null,round:null,loading:false,loaded:false,subTab:'fixtures'};
  const $=s=>document.querySelector(s);
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[c]));
  const sb=()=>window.__kickpotSupabase;
  const isLive=()=>$('.bottom-nav .nav-item.active')?.dataset?.tab==='live';

  // app.js still runs its own, older Live renderer (renderLive() in app.js,
  // recognisable by the "<h1>Live Matchday</h1>" markup it writes). It repaints
  // that old UI into #screen once immediately on every tab entry, again a few
  // hundred ms later when its own score fetch resolves, and then every 30s on
  // a timer for as long as the user stays on the Live tab. Each of those writes
  // used to get immediately stomped back to the markup below by the
  // MutationObserver further down this file, so the user saw the old UI flash
  // in and out — including well after the entry mask had already cleared. This
  // script owns the Live tab's fixtures/table data independently of app.js, so
  // nothing is lost by simply refusing to paint app.js's copy once we have our
  // own data ready to show.
  //
  // Guard on hasRenderedLiveOnce (set below, once render() has actually drawn
  // the .kp-live-screen markup) rather than on S.loaded directly: S.loaded
  // gets reset to false by load() on a failed background refresh (see below),
  // and guarding on that would let app.js's old UI flash back in on every
  // transient network hiccup even after we'd already shown good data once.
  let hasRenderedLiveOnce = false;
  if (!window.__kpLiveWriteGuardInstalled) {
    window.__kpLiveWriteGuardInstalled = true;
    const screenEl = $('#screen');
    const upstream = screenEl ? Object.getOwnPropertyDescriptor(screenEl, 'innerHTML') : null;
    if (screenEl && upstream?.get && upstream?.set) {
      Object.defineProperty(screenEl, 'innerHTML', {
        configurable: true,
        get() { return upstream.get.call(this); },
        set(value) {
          if (hasRenderedLiveOnce && isLive() && String(value).includes('<h1>Live Matchday</h1>')) return;
          upstream.set.call(this, value);
        }
      });
    }
  }
  const displayName=n=>String(n||'').trim()==='Nottingham'?'Nottingham Forest':String(n||'');
  const fmtDayTime=iso=>new Intl.DateTimeFormat('en-GB',{weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(iso));
  const fmtTime=iso=>new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(iso));
  const rel=iso=>{const ms=new Date(iso)-Date.now();if(ms<=0)return'kick-off';const h=Math.floor(ms/36e5),d=Math.floor(h/24),r=h%24;return d?`${d}d ${r}h`:`${h}h`;};
  const heroRel=iso=>{const ms=new Date(iso)-Date.now();if(ms<=0)return'Closed';const h=Math.floor(ms/36e5),d=Math.floor(h/24),r=h%24;return d?`${d} days ${r} hours`:`${h} hours`;};

  const ABBR={'Arsenal':'ARS','Aston Villa':'AVL','Bournemouth':'BOU','Brentford':'BRE','Brighton':'BHA','Brighton & Hove Albion':'BHA','Burnley':'BUR','Chelsea':'CHE','Crystal Palace':'CRY','Everton':'EVE','Fulham':'FUL','Ipswich Town':'IPS','Leicester City':'LEI','Liverpool':'LIV','Manchester City':'MCI','Man City':'MCI','Manchester United':'MUN','Man Utd':'MUN','Newcastle United':'NEW','Newcastle':'NEW','Nottingham Forest':'NFO','Nottingham':'NFO','Southampton':'SOU','Tottenham':'TOT','Tottenham Hotspur':'TOT','West Ham':'WHU','West Ham United':'WHU','Wolves':'WOL','Wolverhampton Wanderers':'WOL','Leeds United':'LEE','Leeds':'LEE','Sunderland':'SUN'};
  const abbr=n=>ABBR[displayName(n)]||displayName(n).replace(/[^A-Za-z]/g,'').slice(0,3).toUpperCase();

  async function waitForClient(timeout=15000){const start=Date.now();while(Date.now()-start<timeout){const client=sb();if(client)return client;await sleep(100)}return null}
  async function waitForSession(client,timeout=15000){const start=Date.now();while(Date.now()-start<timeout){const res=await client.auth.getSession().catch(()=>null);const session=res?.data?.session;if(session)return session;await sleep(150)}return null}

  async function load(){
    if(S.loading)return; S.loading=true;
    try{
      // Fixtures don't depend on session/group data, so fetch them in parallel
      // with everything else instead of after — one fewer round-trip on the
      // critical path before the tab can render.
      const fixturesPromise=fetch('/api/football/fixtures',{cache:'no-store'}).then(r=>r.json());
      const client=await waitForClient(); if(!client)throw new Error('KickPot client did not initialise');
      const session=await waitForSession(client); if(!session)throw new Error('KickPot session did not initialise');
      const uid=session.user.id; S.myId=uid;
      const {data:groups,error:groupsError}=await client.from('groups').select('*').order('created_at'); if(groupsError)throw groupsError;
      const stored=(()=>{try{return sessionStorage.getItem('kp-active-group-v1')||localStorage.getItem('kp-active-group-v1')||''}catch{return''}})();
      S.groupId=(groups||[]).find(g=>g.id===stored)?.id||(groups||[])[0]?.id||null; if(!S.groupId)throw new Error('No active group found');
      const {data:gw,error:gwError}=await client.rpc('ensure_current_gameweek',{p_group_id:S.groupId}); if(gwError)throw gwError; S.gameweekId=gw;

      const [{data:members,error:membersError},{data:profiles,error:profilesError},{data:leaderboard,error:lbError},{data:pickStatus,error:psError},{data:preds,error:predsError},fx]=await Promise.all([
        client.from('group_members').select('user_id').eq('group_id',S.groupId),
        client.from('profiles').select('id,display_name'),
        client.from('group_leaderboard').select('*').eq('group_id',S.groupId).eq('gameweek_id',S.gameweekId),
        client.rpc('group_pick_status',{p_group_id:S.groupId,p_gameweek_id:S.gameweekId}),
        client.from('predictions').select('*').eq('group_id',S.groupId).eq('user_id',uid),
        fixturesPromise
      ]);
      if(membersError)throw membersError; if(profilesError)throw profilesError; if(lbError)throw lbError; if(predsError)throw predsError;
      const nameOf=new Map((profiles||[]).map(p=>[p.id,p.display_name]));
      S.members=(members||[]).map(m=>({user_id:m.user_id,display_name:nameOf.get(m.user_id)||'Player'}));
      S.leaderboard=Object.fromEntries((leaderboard||[]).map(r=>[r.user_id,r.points]));
      S.pickStatus=psError?{}:Object.fromEntries((pickStatus||[]).map(r=>[r.user_id,Number(r.submitted_count)||0]));

      S.fixtures=fx?.fixtures||[]; S.round=fx?.round||'Matchday 4';
      const fixtureIds=new Set(S.fixtures.map(f=>String(f.id)));
      S.predictions=Object.fromEntries((preds||[]).filter(p=>fixtureIds.has(String(p.fixture_id))).map(p=>[String(p.fixture_id),p]));
      S.loaded=true;
    }catch(e){console.error('KickPot Live table load',e);S.loaded=false}
    finally{S.loading=false}
  }

  function roundShort(round){
    if(!round)return'Matchday';
    const m=String(round).match(/(\d+)/);
    return m?m[1]:round;
  }

  function rankedRoster(){
    const total=S.fixtures.length;
    const roster=S.members.slice().sort((a,b)=>a.display_name.localeCompare(b.display_name));
    roster.forEach(m=>{
      m.points=S.leaderboard[m.user_id]||0;
      m.submitted=S.pickStatus[m.user_id]||0;
      m.total=total;
      m.isMe=m.user_id===S.myId;
    });
    roster.sort((a,b)=>b.points-a.points);
    const ranks=[]; roster.forEach((m,i)=>ranks.push(i>0&&roster[i-1].points===m.points?ranks[i-1]:i+1));
    roster.forEach((m,i)=>{m.rank=ranks[i]});
    return roster;
  }

  function statusParts(m){
    if(m.total===0)return{locked:false,text:'No fixtures yet'};
    if(m.submitted===0)return{locked:false,text:'Not submitted'};
    return{locked:m.submitted===m.total,text:`${m.submitted}/${m.total} picks locked`};
  }

  function tableRowHTML(m,i){
    const top=i===0;
    const st=statusParts(m);
    return `<div class="kp-live-trow${top?' top':''}${m.isMe?' me':''}">
      <div class="kp-live-tpos">${m.rank}</div>
      <div class="kp-live-tplayer">
        <div class="kp-live-tname">${esc(m.display_name)}${m.isMe?' <span class="kp-live-you">(you)</span>':''}</div>
        <div class="kp-live-tstatus"><span class="kp-live-dot${st.locked?' on':''}"></span>${esc(st.text)}</div>
      </div>
      <div class="kp-live-tpts">${m.points}</div>
      <div class="kp-live-tpicks">${m.submitted}/${m.total}</div>
      <div class="kp-live-tchevron">›</div>
    </div>`;
  }

  function fixtureAbbrCardHTML(f){
    const locked=Date.now()>=new Date(f.kickoff).getTime();
    return `<div class="kp-live-fxc">
      <div class="kp-live-fxc-crests"><img src="${esc(f.home?.logo||'')}" alt="" onerror="this.style.visibility='hidden'"><img src="${esc(f.away?.logo||'')}" alt="" onerror="this.style.visibility='hidden'"></div>
      <div class="kp-live-fxc-abbr"><span>${esc(abbr(f.home?.name))}</span><span class="v">v</span><span>${esc(abbr(f.away?.name))}</span></div>
      <div class="kp-live-fxc-time">${fmtTime(f.kickoff)}</div>
      <div class="kp-live-fxc-lock">🔒 ${locked?'Locked':`Locks in ${rel(f.kickoff)}`}</div>
    </div>`;
  }

  function myPickRowHTML(f){
    const p=S.predictions[f.id];
    const locked=Date.now()>=new Date(f.kickoff).getTime();
    // Home/away are rendered as two separate columns (rather than one combined
    // "Home v Away" string) so each crest sits directly beside its own team's
    // name - previously the away crest landed after the score, well past the
    // end of the (left-aligned) team-name text, and looked stranded/unrelated
    // to either team.
    return `<div class="kp-live-pickrow">
      <div class="kp-live-pick-main">
        <img class="kp-live-pick-crest" src="${esc(f.home?.logo||'')}" alt="" onerror="this.style.visibility='hidden'">
        <div class="kp-live-pick-team home">${esc(displayName(f.home?.name))}</div>
        <div class="kp-live-pick-score">${p?`${p.predicted_home}-${p.predicted_away}`:'—'}</div>
        <div class="kp-live-pick-team away">${esc(displayName(f.away?.name))}</div>
        <img class="kp-live-pick-crest" src="${esc(f.away?.logo||'')}" alt="" onerror="this.style.visibility='hidden'">
      </div>
      <div class="kp-live-pick-time">${fmtDayTime(f.kickoff)} · ${locked?'Locked':`Locks in ${rel(f.kickoff)}`}</div>
    </div>`;
  }

  function heroHTML(roster){
    const liveCount=S.fixtures.filter(f=>!['NS','FT','AET','PEN','PST','CANC'].includes(f.status?.short)).length;
    const upcoming=S.fixtures.filter(f=>f.status?.short==='NS').length;
    const fullyLocked=roster.filter(m=>m.total>0&&m.submitted===m.total).length;
    return `<section class="kp-live-hero">
      <img class="kp-live-hero-photo" src="/kickpot-hero-final.jpg" alt="">
      <div class="kp-live-hero-crown">👑<div class="kp-live-hero-tag">Same passion.<br>New predictions.</div></div>
      <div class="kp-live-eyebrow">Matchday ${esc(roundShort(S.round))}</div>
      <h1>Live</h1>
      <div class="kp-live-hero-sub">REAL GAMES. REAL POINTS.</div>
      <div class="kp-live-stats"><span class="kp-live-dot on"></span>${liveCount} LIVE<span class="sep">|</span>🔒 ${fullyLocked}/${roster.length} LOCKED<span class="sep">|</span>${upcoming} UPCOMING</div>
    </section>`;
  }

  function subnavHTML(){
    const tabs=[['fixtures','Live Fixtures'],['table','Live Table'],['picks','My Picks']];
    return `<div class="kp-live-subnav">
      <div class="kp-live-subtabs">${tabs.map(([id,label])=>`<button class="kp-live-subtab${S.subTab===id?' active':''}" data-live-subtab="${id}">${label}</button>`).join('')}</div>
    </div>`;
  }

  function needText(roster){
    const idx=roster.findIndex(m=>m.isMe);
    if(idx<0||!roster.length)return'';
    const stillPlaying=S.fixtures.filter(f=>!['FT','AET','PEN','CANC'].includes(f.status?.short)).length;
    let msg;
    if(idx===0){
      const next=roster.find(m=>!m.isMe);
      const gap=next?roster[0].points-next.points:null;
      msg=gap!=null?`You're leading by ${gap} pt${gap===1?'':'s'} over ${esc(next.display_name)}.`:"You're leading the pot.";
    } else {
      const gap=roster[0].points-roster[idx].points;
      msg=`You're ${gap} pt${gap===1?'':'s'} behind ${esc(roster[0].display_name)}.`;
    }
    if(stillPlaying)msg+=` ${stillPlaying} fixture${stillPlaying===1?'':'s'} still to finish.`;
    return msg;
  }

  function tableSectionHTML(roster){
    const fullyLocked=roster.filter(m=>m.total>0&&m.submitted===m.total).length;
    return `<div class="kp-live-table-head"><h1>Live Table</h1><div class="kp-live-locked">🔒 ${fullyLocked}/${roster.length} locked</div></div>
    <div class="kp-live-table-cols"><span>POS</span><span>PLAYER</span><span>POINTS</span><span>PICKS</span></div>
    <div class="kp-live-board">${roster.map(tableRowHTML).join('')}</div>
    <div class="kp-live-tip"><div class="kp-live-tip-icon">🏆</div><div class="kp-live-tip-text"><strong>Points update live as the games happen.</strong><br>Check back during matches to see the table move.</div></div>
    <div class="kp-live-need-title">What You Need</div><p class="kp-live-need">${needText(roster)||'Standings will update as picks come in.'}</p>`;
  }

  function bodyHTML(roster){
    if(S.subTab==='picks'){
      return S.fixtures.length
        ?`<div class="kp-live-picks">${S.fixtures.map(myPickRowHTML).join('')}</div>`
        :`<div class="kp-native-loading">No fixtures yet.</div>`;
    }
    if(S.subTab==='table')return tableSectionHTML(roster);
    const fxHTML=S.fixtures.length
      ?`<div class="kp-live-fx-scroll">${S.fixtures.map(fixtureAbbrCardHTML).join('')}</div>`
      :`<div class="kp-native-loading">No fixtures yet.</div>`;
    return `${fxHTML}${tableSectionHTML(roster)}`;
  }

  function bindSubnav(){
    document.querySelectorAll('[data-live-subtab]').forEach(btn=>btn.addEventListener('click',()=>{S.subTab=btn.dataset.liveSubtab;render()}));
  }

  function render(){
    if(!isLive())return;
    document.body.classList.add('kp-native-live');
    const screen=$('#screen'); if(!screen)return;
    if(!S.loaded){screen.innerHTML='<div class="kp-native-loading">Loading table…</div>';return;}
    const roster=rankedRoster();
    screen.innerHTML=`<div class="kp-live-screen">${heroHTML(roster)}${subnavHTML()}<div class="kp-live-body">${bodyHTML(roster)}</div></div>`;
    bindSubnav();
    hasRenderedLiveOnce=true;
  }

  async function refreshAndRender(){
    await load();
    render();
  }

  // Safety net for a rare tab-entry race: occasionally (root cause not fully
  // pinned down - seen once after a burst of navigation/theme-toggle activity
  // right before entering this tab) the nav highlights "Live" correctly but
  // #screen is left showing a stale previous tab's markup, and it never
  // self-corrects because the render() call this click triggers can lose a
  // narrow timing race. The MutationObserver below already re-renders if a
  // later DOM change reveals the problem, but if nothing touches #screen
  // again after the race, there's nothing left to trigger it. These extra
  // checks give the tab a couple more chances, at 400ms and 1200ms after
  // entry, to notice "we're on Live but not showing Live" and fix itself -
  // render() is a cheap no-op if everything's already correct.
  function ensureLiveRendered(){if(isLive()&&S.loaded&&!$('#screen .kp-live-screen'))render()}

  let liveRefreshInterval=0;
  document.querySelectorAll('.bottom-nav .nav-item').forEach(btn=>btn.addEventListener('click',()=>{
    clearInterval(liveRefreshInterval);
    setTimeout(async()=>{
      if(btn.dataset.tab==='live'){
        await refreshAndRender();
        setTimeout(ensureLiveRendered,400);
        setTimeout(ensureLiveRendered,1200);
        // Mirrors app.js's own 30s live-score poll, just routed through this
        // screen's own render() instead of the one we now suppress above.
        liveRefreshInterval=setInterval(()=>{if(isLive())refreshAndRender()},30000);
      } else {
        document.body.classList.remove('kp-native-live');
      }
    },0);
  }));

  const mo=new MutationObserver(()=>{if(isLive()&&!$('#screen .kp-live-screen')&&S.loaded)setTimeout(render,0)});
  const screenEl=$('#screen'); if(screenEl)mo.observe(screenEl,{childList:true});
  if(isLive())refreshAndRender();
  window.addEventListener('pageshow',()=>{if(isLive())refreshAndRender()});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&isLive())refreshAndRender()});
})();
