(() => {
  const S={groupId:null,gameweekId:null,fixtures:[],predictions:{},members:[],leaderboard:{},pickStatus:{},myId:null,round:null,loading:false,loaded:false};
  const $=s=>document.querySelector(s);
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[c]));
  const sb=()=>window.__kickpotSupabase;
  const isLive=()=>$('.bottom-nav .nav-item.active')?.dataset?.tab==='live';
  const displayName=n=>String(n||'').trim()==='Nottingham'?'Nottingham Forest':String(n||'');
  const fmtDayTime=iso=>new Intl.DateTimeFormat('en-GB',{weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(iso));
  const fmtTime=iso=>new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(iso));
  const rel=iso=>{const ms=new Date(iso)-Date.now();if(ms<=0)return'kick-off';const h=Math.floor(ms/36e5),d=Math.floor(h/24),r=h%24;return d?`${d}d ${r}h`:`${h}h`};
  async function waitForClient(timeout=15000){const start=Date.now();while(Date.now()-start<timeout){const client=sb();if(client)return client;await sleep(100)}return null}
  async function waitForSession(client,timeout=15000){const start=Date.now();while(Date.now()-start<timeout){const res=await client.auth.getSession().catch(()=>null);const session=res?.data?.session;if(session)return session;await sleep(150)}return null}

  async function load(){
    if(S.loading)return; S.loading=true;
    try{
      const client=await waitForClient(); if(!client)throw new Error('KickPot client did not initialise');
      const session=await waitForSession(client); if(!session)throw new Error('KickPot session did not initialise');
      const uid=session.user.id; S.myId=uid;
      const {data:groups,error:groupsError}=await client.from('groups').select('*').order('created_at'); if(groupsError)throw groupsError;
      const stored=(()=>{try{return sessionStorage.getItem('kp-active-group-v1')||localStorage.getItem('kp-active-group-v1')||''}catch{return''}})();
      S.groupId=(groups||[]).find(g=>g.id===stored)?.id||(groups||[])[0]?.id||null; if(!S.groupId)throw new Error('No active group found');
      const {data:gw,error:gwError}=await client.rpc('ensure_current_gameweek',{p_group_id:S.groupId}); if(gwError)throw gwError; S.gameweekId=gw;

      const [{data:members,error:membersError},{data:profiles,error:profilesError},{data:leaderboard,error:lbError},{data:pickStatus,error:psError},fx]=await Promise.all([
        client.from('group_members').select('user_id').eq('group_id',S.groupId),
        client.from('profiles').select('id,display_name'),
        client.from('group_leaderboard').select('*').eq('group_id',S.groupId).eq('gameweek_id',S.gameweekId),
        client.rpc('group_pick_status',{p_group_id:S.groupId,p_gameweek_id:S.gameweekId}),
        fetch('/api/football/fixtures',{cache:'no-store'}).then(r=>r.json())
      ]);
      if(membersError)throw membersError; if(profilesError)throw profilesError; if(lbError)throw lbError;
      const nameOf=new Map((profiles||[]).map(p=>[p.id,p.display_name]));
      S.members=(members||[]).map(m=>({user_id:m.user_id,display_name:nameOf.get(m.user_id)||'Player'}));
      S.leaderboard=Object.fromEntries((leaderboard||[]).map(r=>[r.user_id,r.points]));
      S.pickStatus=psError?{}:Object.fromEntries((pickStatus||[]).map(r=>[r.user_id,Number(r.submitted_count)||0]));

      S.fixtures=fx?.fixtures||[]; S.round=fx?.round||'Matchday 4';
      const fixtureIds=S.fixtures.map(f=>f.id).filter(Boolean);
      let preds=[];
      if(fixtureIds.length){
        const res=await client.from('predictions').select('*').eq('group_id',S.groupId).eq('user_id',uid).in('fixture_id',fixtureIds); if(res.error)throw res.error; preds=res.data||[];
      }
      S.predictions=Object.fromEntries(preds.map(p=>[String(p.fixture_id),p]));
      S.loaded=true;
    }catch(e){console.error('KickPot Live table load',e);S.loaded=false}
    finally{S.loading=false}
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
    const tied=new Set(ranks.filter((r,i)=>ranks.indexOf(r)!==i));
    roster.forEach((m,i)=>{m.rank=ranks[i];m.tied=tied.has(ranks[i])});
    return roster;
  }

  function rowHTML(m,i){
    const top=i===0;
    const statusHTML=m.total===0?'':m.submitted===0
      ?`<div class="kp-live-status">Not submitted</div>`
      :`<div class="kp-live-status${m.submitted===m.total?' locked':''}">${m.submitted}/${m.total} picks locked</div>`;
    return `<div class="kp-live-row${top?' top':''}${m.isMe?' me':''}">
      <div class="kp-live-rank">${m.tied?'=':''}${m.rank}</div>
      <div class="kp-live-info">
        <div class="kp-live-name">${esc(m.display_name)}</div>
        ${m.isMe?'<div class="kp-live-you">(you)</div>':''}
        ${statusHTML}
      </div>
      ${top?'<div class="kp-live-badge">TOP</div>':''}
      <div class="kp-live-pts">${m.points}</div>
    </div>`;
  }

  function fixtureCardHTML(f){
    const saved=S.predictions[f.id];
    const locked=Date.now()>=new Date(f.kickoff).getTime();
    const pick=saved?`Your pick: ${saved.predicted_home}-${saved.predicted_away}`:locked?'Locked':`Locks in ${rel(f.kickoff)}`;
    return `<div class="kp-live-fx-card">
      <div class="kp-live-fx-team"><img src="${esc(f.home?.logo||'')}" alt="" onerror="this.style.visibility='hidden'"><span>${esc(displayName(f.home?.name))}</span></div>
      <div class="kp-live-fx-team"><img src="${esc(f.away?.logo||'')}" alt="" onerror="this.style.visibility='hidden'"><span>${esc(displayName(f.away?.name))}</span></div>
      <div class="kp-live-fx-time">${fmtTime(f.kickoff)}</div>
      <div class="kp-live-fx-status">${fmtDayTime(f.kickoff)} · ${esc(pick)}</div>
    </div>`;
  }

  function needText(roster){
    const idx=roster.findIndex(m=>m.isMe);
    const stillPlaying=S.fixtures.filter(f=>!['FT','AET','PEN','CANC'].includes(f.status?.short)).length;
    let msg;
    if(idx<0||!roster.length)msg='';
    else if(idx===0){
      const next=roster.find(m=>!m.isMe);
      const gap=next?roster[0].points-next.points:null;
      msg=gap!=null?`You're leading by ${gap} pt${gap===1?'':'s'} over ${esc(next.display_name)}.`:"You're leading the pot.";
    } else {
      const gap=roster[0].points-roster[idx].points;
      msg=`You're ${gap} pt${gap===1?'':'s'} behind ${esc(roster[0].display_name)}.`;
    }
    if(msg&&stillPlaying)msg+=` ${stillPlaying} fixture${stillPlaying===1?'':'s'} still to finish.`;
    return msg;
  }

  function render(){
    if(!isLive())return;
    document.body.classList.add('kp-native-live');
    const screen=$('#screen'); if(!screen)return;
    if(!S.loaded){screen.innerHTML='<div class="kp-native-loading">Loading table…</div>';return;}
    const roster=rankedRoster();
    const fullyLocked=roster.filter(m=>m.total>0&&m.submitted===m.total).length;
    screen.innerHTML=`<section class="kp-live-head"><h1>Live Table</h1><div class="kp-live-locked">${fullyLocked}/${roster.length} locked</div></section>
    <div class="kp-live-board">${roster.map(rowHTML).join('')}</div>
    ${S.fixtures.length?`<div class="kp-live-section-title">This Matchday's Fixtures</div><div class="kp-live-fixtures">${S.fixtures.map(fixtureCardHTML).join('')}</div>`:''}
    <div class="kp-live-section-title">What You Need</div><p class="kp-live-need">${needText(roster)||'Standings will update as picks come in.'}</p>`;
  }

  document.querySelectorAll('.bottom-nav .nav-item').forEach(btn=>btn.addEventListener('click',()=>{
    setTimeout(async()=>{
      if(btn.dataset.tab==='live'){ if(!S.loaded)await load(); render(); }
      else document.body.classList.remove('kp-native-live');
    },0);
  }));

  const mo=new MutationObserver(()=>{if(isLive()&&!$('#screen .kp-live-head')&&S.loaded)setTimeout(render,0)});
  const screenEl=$('#screen'); if(screenEl)mo.observe(screenEl,{childList:true});
  if(isLive()){load().then(render)}
  window.addEventListener('pageshow',()=>{if(isLive())render()});
})();
