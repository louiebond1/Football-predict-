(() => {
  let context=null,timer=0,saving=false,mounted=false;
  const S={groupId:null,gameweekId:null,fixtures:[],predictions:{},drafts:{},forms:new Map(),round:null,paid:false,loading:false,loaded:false};
  const $=s=>document.querySelector(s);
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const sb=()=>window.__kickpotSupabase;
  const isGW=()=>$('.bottom-nav .nav-item.active')?.dataset?.tab==='gw';
  const displayName=n=>String(n||'').trim()==='Nottingham'?'Nottingham Forest':String(n||'');
  const fmtTime=iso=>new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(iso));
  const fmtDate=iso=>new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'numeric',month:'long'}).format(new Date(iso)).toUpperCase();
  const rel=iso=>{const ms=new Date(iso)-Date.now();if(ms<=0)return'kick-off';const h=Math.floor(ms/36e5),d=Math.floor(h/24),r=h%24;return d?`${d}d ${r}h`:`${h}h`};
  const heroRel=iso=>{const ms=new Date(iso)-Date.now();if(ms<=0)return'Closed';const h=Math.floor(ms/36e5),d=Math.floor(h/24),r=h%24;return d?`${d} days ${r} hours`:`${h} hours`};
  const resultFor=(f,id)=>{if(!['FT','AET','PEN'].includes(f.status?.short)||f.goals?.home==null)return null;const home=Number(f.home?.id)===Number(id),gf=home?f.goals.home:f.goals.away,ga=home?f.goals.away:f.goals.home;return gf>ga?'W':gf<ga?'L':'D'};
  function draftFor(id){if(context)return context.pickFor(id);if(!S.drafts[id]){const p=S.predictions[id];S.drafts[id]=p?{home:Number(p.predicted_home)||0,away:Number(p.predicted_away)||0}:{home:1,away:1}}return S.drafts[id]}
  const form=id=>`<div class="kp-native-form">${(S.forms.get(String(id))||[]).slice(0,5).map(x=>`<i class="${x.toLowerCase()}">${x}</i>`).join('')}</div>`;
  function scoreControl(f,side,val,locked){if(locked)return `<div class="kp-native-score locked"><span></span><b>${val}</b><span></span></div>`;return `<div class="kp-native-score"><button type="button" aria-label="Decrease ${esc(f[side]?.name)} score" data-score-step="${f.id},${side},-1">−</button><b data-score-value="${f.id},${side}">${val}</b><button type="button" aria-label="Increase ${esc(f[side]?.name)} score" data-score-step="${f.id},${side},1">+</button></div>`}
  /* Not loading="lazy": these are the first rows on the screen, and deferring
     them is why each badge popped in about 0.15s after its row painted in a
     device recording. They are fetched with the row now, and the slot carries a
     placeholder until each one lands (see data-loaded below). */
  const crest=team=>team?.logo?'<img class="crest" src="'+esc(team.logo)+'" data-initial="'+esc((team.name||'?')[0])+'" alt="" fetchpriority="high">':'<span class="crest-fallback" aria-hidden="true">'+esc((team?.name||'?')[0])+'</span>';
  function fixtureHTML(f){const kickLocked=!Number.isFinite(Date.parse(f.kickoff))||Date.now()>=Date.parse(f.kickoff),locked=!S.paid||kickLocked,p=kickLocked?(S.predictions[f.id]?{home:S.predictions[f.id].predicted_home,away:S.predictions[f.id].predicted_away}:{home:'–',away:'–'}):draftFor(String(f.id));return `<div class="kp-native-match" data-fixture="${esc(f.id)}"><div class="kp-native-side">${crest(f.home)}<div><div class="kp-native-team">${esc(displayName(f.home?.name))}</div>${form(f.home?.id)}</div></div><div class="kp-native-mid"><div class="kp-native-time">${fmtTime(f.kickoff)}</div><div class="kp-native-lock">${locked?(kickLocked?'Locked':'Payment required'):`Locks in ${rel(f.kickoff)}`}</div></div><div class="kp-native-side away"><div><div class="kp-native-team">${esc(displayName(f.away?.name))}</div>${form(f.away?.id)}</div>${crest(f.away)}</div><div class="kp-native-scores">${scoreControl(f,'home',p.home,locked)}<span class="kp-native-divider"></span>${scoreControl(f,'away',p.away,locked)}</div></div>`}
  /* Same .kp-actions / .kp-action / .kp-sechead components Live uses - identical
     markup and CSS, so both rows occupy the same vertical slot and only the copy
     differs. Progress comes from S.predictions, which is the saved prediction per
     fixture for this user; it is the same thing the Live Table counts as a locked
     pick, so the two screens cannot disagree. */
  const ACTION_ICON = {
    progress: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8.4 12.3 2.5 2.5 4.7-5"/></svg>',
    others: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1"/><circle cx="17.4" cy="8.6" r="2.4"/><path d="M16 14.2h.6a4.4 4.4 0 0 1 4.4 4.4V20"/></svg>'
  };
  const pickedCount=()=>S.fixtures.reduce((n,f)=>n+(S.predictions[f.id]?1:0),0);
  function actionHTML({icon,title,sub,attrs}){
    return `<button type="button" class="kp-action" ${attrs}><span class="kp-action-icon" aria-hidden="true">${icon}</span><span class="kp-action-copy"><b>${esc(title)}</b><small>${esc(sub)}</small></span><span class="kp-action-go" aria-hidden="true">\u203a</span></button>`;
  }
  function actionsHTML(){
    const total=S.fixtures.length,picked=pickedCount(),done=total>0&&picked===total;
    return `<div class="kp-actions">${
      actionHTML({icon:ACTION_ICON.progress,title:`${picked}/${total} picked`,sub:done?'Review your picks':'View your picks',attrs:'data-kp-goto="picks"'})
    }${
      actionHTML({icon:ACTION_ICON.others,title:'Others\u2019 picks',sub:'See group picks',attrs:'data-kp-goto="others"'})
    }</div>`;
  }
  function secheadHTML(round){
    return `<div class="kp-sechead"><h1>Fixtures</h1><div class="kp-sechead-meta">Matchday ${esc(round)}</div></div>`;
  }
  function fixtureList(){
    let day='';return [...S.fixtures].sort((a,b)=>Date.parse(a.kickoff)-Date.parse(b.kickoff)).map(f=>{
      const next=fmtDate(f.kickoff),heading=next!==day?'<div class="kp-native-date">'+esc(next)+'</div>':'';day=next;return heading+fixtureHTML(f);
    }).join('');
  }
  function render(){if(!mounted||!isGW())return;document.body.classList.add('kp-native-matchday');const screen=$('#screen');if(!screen)return;if(!S.loaded){screen.innerHTML='<div class="kp-native-loading">Loading fixtures…</div>';return;}const rn=(String(S.round).match(/\d+/)||['4'])[0],next=S.fixtures.filter(f=>new Date(f.kickoff)>new Date()).sort((a,b)=>new Date(a.kickoff)-new Date(b.kickoff))[0],first=S.fixtures.slice().sort((a,b)=>new Date(a.kickoff)-new Date(b.kickoff))[0];screen.innerHTML=`<div class="kp-native-tabs"><span>Fixtures</span></div><section class="kp-native-hero"><img class="kp-native-hero-photo" src="/kickpot-hero-final.jpg?v=3" alt="Football stadium"><div class="kp-native-eyebrow">Matchday ${rn}</div><h1>Premier <br>League</h1><div class="kp-native-count"><small>Picks close in</small><strong>${esc(next?heroRel(next.kickoff):'Closed')}</strong></div></section>${actionsHTML()}${secheadHTML(rn)}<section class="kp-native-list">${fixtureList()}<button class="kp-native-lock-button" id="kpNativeLock" ${!S.paid||saving||!S.fixtures.some(f=>Date.now()<Date.parse(f.kickoff))?'disabled':''}>${S.paid?'Lock in my picks':'Predictions unavailable'}</button><div class="kp-native-status" id="kpNativeStatus" role="status">${!S.fixtures.length?'No fixtures available yet.':!S.paid?'Pay the Treasurer and wait for confirmation in Group → Payments.':'You can edit saved picks until each fixture kicks off.'}</div></section>`;}
  async function save(){
    if(!mounted||saving||!S.paid)return;
    const status=$('#kpNativeStatus'),btn=$('#kpNativeLock'),gid=S.groupId,uid=context.state.session?.user.id;
    const rows=S.fixtures.filter(f=>Date.now()<Date.parse(f.kickoff)).map(f=>{const p=draftFor(String(f.id));return{group_id:gid,fixture_id:f.id,user_id:uid,predicted_home:p.home,predicted_away:p.away};});
    if(!rows.length){status.textContent='No open fixtures left to predict.';return;}
    saving=true;btn.disabled=true;btn.textContent='Saving…';
    try{
      const {error}=await sb().from('predictions').upsert(rows,{onConflict:'group_id,fixture_id,user_id'});
      if(error)throw error;
      if(mounted&&S.groupId===gid&&context.state.session?.user.id===uid){
        for(const row of rows){S.predictions[row.fixture_id]=row;context.state.predictions[row.fixture_id]=row;}
        status.textContent='✓ Picks saved. You can edit them until kick-off.';
      }
    }catch(error){if(status.isConnected)status.textContent=error.message||'Could not save. Check your connection and try again.';}
    finally{saving=false;if(btn.isConnected){btn.disabled=!S.paid;btn.textContent='Lock in my picks';}}
  }
  /* On document, not on `screen`: this module has no module-scope `screen`
     binding (render() declares its own local one), so `screen` here resolved
     to window.screen. Chromium's Screen extends EventTarget and silently
     accepted the listener; WebKit's does not, so this threw at module
     evaluation and took KickPotMatchday with it - every Safari test that
     waits for .kp-native-hero failed. Capture phase because load does not
     bubble. */
  document.addEventListener('load',event=>{
    const img=event.target;
    if(img instanceof HTMLImageElement&&img.classList.contains('crest'))img.dataset.loaded='1';
  },true);
  document.addEventListener('click',e=>{
    const go=e.target.closest?.('[data-kp-goto]');
    if(go&&isGW()){
      e.preventDefault();
      if(go.dataset.kpGoto==='picks'){
        /* Matchday IS the picks screen, so this focuses the first fixture still
           missing a prediction rather than inventing a second view of them. */
        const next=S.fixtures.find(f=>!S.predictions[f.id])||S.fixtures[0];
        const el=next&&document.querySelector(`.kp-native-match[data-fixture="${next.id}"]`);
        (el||document.querySelector('.kp-native-list'))?.scrollIntoView({behavior:'smooth',block:'start'});
      } else {
        /* Group picks already exist on Live's fixtures page, behind the existing
           per-fixture kickoff reveal. Send the user there instead of building a
           second way to read other people's predictions. */
        window.KickPotLive?.requestPage?.('fixtures');
        document.querySelector('.bottom-nav .nav-item[data-tab="live"]')?.click();
      }
      return;
    }
    if(!mounted||!isGW())return;
    const step=e.target.closest('[data-score-step]');
    if(step){const[id,side,delta]=step.dataset.scoreStep.split(',');const f=S.fixtures.find(f=>String(f.id)===id);
      if(saving||!S.paid||!f||Date.now()>=Date.parse(f.kickoff)){render();return;}
      const p=draftFor(id);p[side]=Math.max(0,Math.min(20,p[side]+Number(delta)));const out=$('[data-score-value="'+id+','+side+'"]');if(out)out.textContent=p[side];return;
    }
    if(e.target.closest('#kpNativeLock'))save();
  });
  function mount(next){
    context=next;mounted=true;
    Object.assign(S,{groupId:next.state.activeGroupId,gameweekId:next.state.gameweekId,fixtures:next.state.fixtures,predictions:next.state.predictions,round:next.state.round,paid:next.group?.payments_required===false||!!next.state.payments[next.state.session.user.id]?.confirmed_paid_at,loaded:true});
    S.forms=new Map();
    for(const f of next.state.recentFixtures||[])for(const id of [f.home_team_id,f.away_team_id]){
      if(f.home_goals==null||f.away_goals==null)continue;
      const goals=id===f.home_team_id?f.home_goals:f.away_goals,against=id===f.home_team_id?f.away_goals:f.home_goals;
      const form=S.forms.get(String(id))||[];if(form.length<5)form.push(goals>against?'W':goals<against?'L':'D');S.forms.set(String(id),form);
    }
    render();clearInterval(timer);
    let open=S.fixtures.filter(f=>Date.now()<Date.parse(f.kickoff)).length;
    timer=setInterval(()=>{const count=S.fixtures.filter(f=>Date.now()<Date.parse(f.kickoff)).length;if(count!==open){open=count;render();}},1000);
  }
  function unmount(){mounted=false;clearInterval(timer);document.body.classList.remove('kp-native-matchday');}
  window.KickPotMatchday={mount,unmount,isSaving:()=>saving};
})();
