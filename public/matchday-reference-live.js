(() => {
  const S={groupId:null,gameweekId:null,fixtures:[],predictions:{},drafts:{},forms:new Map(),round:null,paid:false,loading:false,loaded:false};
  const $=s=>document.querySelector(s);
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[c]));
  const sb=()=>window.__kickpotSupabase;
  const isGW=()=>$('.bottom-nav .nav-item.active')?.dataset?.tab==='gw';
  const displayName=n=>String(n||'').trim()==='Nottingham'?'Nottingham Forest':String(n||'');
  const fmtTime=iso=>new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(iso));
  const fmtDate=iso=>new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'numeric',month:'long'}).format(new Date(iso)).toUpperCase();
  const rel=iso=>{const ms=new Date(iso)-Date.now();if(ms<=0)return'kick-off';const h=Math.floor(ms/36e5),d=Math.floor(h/24),r=h%24;return d?`${d}d ${r}h`:`${h}h`};
  const heroRel=iso=>{const ms=new Date(iso)-Date.now();if(ms<=0)return'Closed';const h=Math.floor(ms/36e5),d=Math.floor(h/24),r=h%24;return d?`${d} days ${r} hours`:`${h} hours`};
  const crown=()=>'<svg viewBox="0 0 24 20" fill="currentColor" aria-hidden="true"><path d="M2 5.2 7.2 9.4 12 2.6l4.8 6.8L22 5.2 20.2 16H3.8L2 5.2Zm2.5 9h15l.35-2.15H4.15L4.5 14.2Z"/></svg>';
  const resultFor=(f,id)=>{if(!['FT','AET','PEN'].includes(f.status?.short)||f.goals?.home==null)return null;const home=Number(f.home?.id)===Number(id),gf=home?f.goals.home:f.goals.away,ga=home?f.goals.away:f.goals.home;return gf>ga?'W':gf<ga?'L':'D'};
  function draftFor(id){if(!S.drafts[id]){const p=S.predictions[id];S.drafts[id]=p?{home:Number(p.predicted_home)||0,away:Number(p.predicted_away)||0}:{home:1,away:1}}return S.drafts[id]}
  async function waitForClient(timeout=15000){const start=Date.now();while(Date.now()-start<timeout){const client=sb();if(client)return client;await sleep(100)}return null}
  async function waitForSession(client,timeout=15000){const start=Date.now();while(Date.now()-start<timeout){const res=await client.auth.getSession().catch(()=>null);const session=res?.data?.session;if(session)return session;await sleep(150)}return null}
  async function load(){if(S.loading)return;S.loading=true;try{
    const client=await waitForClient(); if(!client)throw new Error('KickPot client did not initialise');
    const session=await waitForSession(client); if(!session)throw new Error('KickPot session did not initialise');
    const {data:groups,error:groupsError}=await client.from('groups').select('*').order('created_at'); if(groupsError)throw groupsError;
    const stored=(()=>{try{return sessionStorage.getItem('kp-active-group-v1')||localStorage.getItem('kp-active-group-v1')||''}catch{return''}})();
    S.groupId=(groups||[]).find(g=>g.id===stored)?.id||(groups||[])[0]?.id||null; if(!S.groupId)throw new Error('No active group found');
    const {data:gw,error:gwError}=await client.rpc('ensure_current_gameweek',{p_group_id:S.groupId}); if(gwError)throw gwError; S.gameweekId=gw;
    const uid=session.user.id;
    const [{data:payments,error:paymentsError},fx]=await Promise.all([
      client.from('payments').select('*').eq('group_id',S.groupId).eq('gameweek_id',S.gameweekId).eq('user_id',uid),
      fetch('/api/football/fixtures',{cache:'no-store'}).then(r=>r.json())
    ]); if(paymentsError)throw paymentsError;
    S.fixtures=fx?.fixtures||[]; S.round=fx?.round||'Matchday 4';
    const fixtureIds=S.fixtures.map(f=>f.id).filter(Boolean);
    let preds=[];
    if(fixtureIds.length){
      const res=await client.from('predictions').select('*').eq('group_id',S.groupId).eq('user_id',uid).in('fixture_id',fixtureIds); if(res.error)throw res.error; preds=res.data||[];
    }
    S.paid=!!payments?.[0]?.confirmed_paid_at; S.predictions=Object.fromEntries(preds.map(p=>[String(p.fixture_id),p]));
    const rn=Number((String(S.round).match(/\d+/)||[])[0]);
    if(Number.isFinite(rn)){
      const rounds=[];for(let n=Math.max(1,rn-5);n<rn;n++)rounds.push(n);
      const hist=(await Promise.all(rounds.map(n=>fetch(`/api/football/fixtures?round=${n}`,{cache:'no-store'}).then(r=>r.json()).catch(()=>({fixtures:[]}))))).flatMap(x=>x.fixtures||[]);
      const by=new Map();hist.sort((a,b)=>new Date(b.kickoff)-new Date(a.kickoff)).forEach(f=>[f.home?.id,f.away?.id].forEach(id=>{const rr=resultFor(f,id);if(!rr)return;const arr=by.get(String(id))||[];if(arr.length<5)arr.push(rr);by.set(String(id),arr)}));S.forms=by;
    }
    S.loaded=true;
  }catch(e){console.error('KickPot Matchday load',e);S.loaded=false}finally{S.loading=false}}
  const form=id=>`<div class="kp-native-form">${(S.forms.get(String(id))||[]).slice(0,5).map(x=>`<i class="${x.toLowerCase()}">${x}</i>`).join('')}</div>`;
  function scoreControl(f,side,val,locked){if(locked)return `<div class="kp-native-score locked"><span></span><b>${val}</b><span></span></div>`;return `<div class="kp-native-score"><button data-score-step="${f.id},${side},-1">−</button><b data-score-value="${f.id},${side}">${val}</b><button data-score-step="${f.id},${side},1">+</button></div>`}
  function fixtureHTML(f){const kickLocked=Date.now()>=new Date(f.kickoff).getTime(),locked=!S.paid||kickLocked,p=draftFor(String(f.id));return `<div class="kp-native-match"><div class="kp-native-side"><img src="${esc(f.home?.logo||'')}" alt=""><div><div class="kp-native-team">${esc(displayName(f.home?.name))}</div>${form(f.home?.id)}</div></div><div class="kp-native-mid"><div class="kp-native-time">${fmtTime(f.kickoff)}</div><div class="kp-native-lock">${locked?(kickLocked?'Locked':'Payment required'):`Locks in ${rel(f.kickoff)}`}</div><div class="kp-native-scores">${scoreControl(f,'home',p.home,locked)}<span class="kp-native-divider"></span>${scoreControl(f,'away',p.away,locked)}</div></div><div class="kp-native-side away"><div><div class="kp-native-team">${esc(displayName(f.away?.name))}</div>${form(f.away?.id)}</div><img src="${esc(f.away?.logo||'')}" alt=""></div></div>`}
  function styleBrand(){const mark=$('.topbar .brand-mark');if(mark)mark.innerHTML=crown();const txt=$('.topbar .brand>span');if(txt)txt.textContent='KICKPOT'}
  function render(){if(!isGW())return;document.body.classList.add('kp-native-matchday');styleBrand();const screen=$('#screen');if(!screen)return;if(!S.loaded){screen.innerHTML='<div class="kp-native-loading">Loading fixtures…</div>';return;}const rn=(String(S.round).match(/\d+/)||['4'])[0],next=S.fixtures.filter(f=>new Date(f.kickoff)>new Date()).sort((a,b)=>new Date(a.kickoff)-new Date(b.kickoff))[0],first=S.fixtures.slice().sort((a,b)=>new Date(a.kickoff)-new Date(b.kickoff))[0];screen.innerHTML=`<div class="kp-native-tabs"><span>Fixtures</span></div><section class="kp-native-hero"><img class="kp-native-hero-photo" src="/assets/matchday-hero.jpg" alt="Football stadium"><div class="kp-native-eyebrow">Matchday ${rn}</div><h1>Premier<br>League</h1><div class="kp-native-count"><small>Picks close in</small><strong>${esc(next?heroRel(next.kickoff):'Closed')}</strong></div></section><section class="kp-native-list"><div class="kp-native-date">${esc(first?fmtDate(first.kickoff):'')}</div>${S.fixtures.map(fixtureHTML).join('')}<button class="kp-native-lock-button" id="kpNativeLock" ${!S.paid?'disabled':''}>${S.paid?'Lock in my picks':'Predictions unavailable'}</button><div class="kp-native-status" id="kpNativeStatus"></div></section>`}
  async function save(){const client=sb(),status=$('#kpNativeStatus'),btn=$('#kpNativeLock');if(!client||!S.paid)return;const {data:{session}}=await client.auth.getSession();if(!session)return;const open=S.fixtures.filter(f=>Date.now()<new Date(f.kickoff).getTime());const rows=open.map(f=>{const p=draftFor(String(f.id));return{group_id:S.groupId,fixture_id:f.id,user_id:session.user.id,predicted_home:p.home,predicted_away:p.away}});if(!rows.length){status.textContent='No open fixtures left to predict.';return}btn.disabled=true;btn.textContent='Saving…';const {error}=await client.from('predictions').upsert(rows,{onConflict:'group_id,fixture_id,user_id'});if(error){status.textContent=error.message;btn.disabled=false;btn.textContent='Lock in my picks';return}status.textContent='✓ Picks locked in';const fixtureIds=S.fixtures.map(f=>f.id).filter(Boolean);let preds=[];if(fixtureIds.length){const res=await client.from('predictions').select('*').eq('group_id',S.groupId).eq('user_id',session.user.id).in('fixture_id',fixtureIds);preds=res.data||[]}S.predictions=Object.fromEntries(preds.map(p=>[String(p.fixture_id),p]));btn.textContent='Locked in';setTimeout(()=>{btn.disabled=false;btn.textContent='Lock in my picks'},900)}
  document.addEventListener('click',e=>{const step=e.target.closest('[data-score-step]');if(step&&isGW()){const[id,side,delta]=step.dataset.scoreStep.split(','),p=draftFor(id);p[side]=Math.max(0,Math.min(20,p[side]+Number(delta)));const out=$(`[data-score-value="${id},${side}"]`);if(out)out.textContent=p[side];return}if(e.target.closest('#kpNativeLock')&&isGW())save()});
  document.querySelectorAll('.bottom-nav .nav-item').forEach(btn=>btn.addEventListener('click',()=>{setTimeout(async()=>{if(btn.dataset.tab==='gw'){if(!S.loaded)await load();render()}else document.body.classList.remove('kp-native-matchday')},0)}));
  const mo=new MutationObserver(()=>{if(isGW()&&!$('#screen .kp-native-hero')&&S.loaded)setTimeout(render,0)});const screen=$('#screen');if(screen)mo.observe(screen,{childList:true});
  (async()=>{if(isGW()){render();await load();render();if(!S.loaded){setTimeout(async()=>{if(isGW()&&!S.loaded){await load();render()}},1200)}}})();
})();