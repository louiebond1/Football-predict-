(() => {
  const ROOT_ID = 'kpHistoryInlineV2';
  let renderSeq = 0;
  let resolvedGroupId = '';
  const esc = (v='') => String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const historyActive = () => document.querySelector('.nav-item[data-tab="history"]')?.classList.contains('active') === true;
  function candidateGroupId(){const s=document.querySelector('#groupSwitch');if(s?.value)return String(s.value);try{return String(sessionStorage.getItem('kp-active-group-v1')||localStorage.getItem('kp-active-group-v1')||'')}catch{return''}}
  function historyCard(){return [...document.querySelectorAll('#screen .card')].find(c=>/Past (?:Matchdays|Gameweeks)/i.test(c.querySelector('.card-title')?.textContent||''))}
  async function client(){if(window.__kickpotSupabase)return window.__kickpotSupabase;for(let i=0;i<30;i++){await new Promise(r=>setTimeout(r,100));if(window.__kickpotSupabase)return window.__kickpotSupabase}return null}
  async function resolveGroupId(sb){
    if(!sb)return'';
    const candidate=candidateGroupId();
    const {data:groups,error}=await sb.from('groups').select('id').order('created_at',{ascending:true});
    if(error||!groups?.length){console.warn('[history-v2] unable to resolve groups',error);return candidate}
    const valid=new Set(groups.map(g=>String(g.id)));
    const gid=valid.has(candidate)?candidate:String(groups[0].id);
    resolvedGroupId=gid;
    try{sessionStorage.setItem('kp-active-group-v1',gid)}catch{}
    return gid;
  }
  async function getGroupId(sb){return resolvedGroupId||await resolveGroupId(sb)}
  function weekLabel(g){const raw=g?.round_name||'Matchday',m=String(raw).match(/(\d+)/);return m?`Matchday ${m[1]}`:raw.replace(/Gameweek/i,'Matchday')}
  function initials(n=''){const p=String(n).trim().split(/\s+/).filter(Boolean);return !p.length?'?':(p.length>1?`${p[0][0]}${p.at(-1)[0]}`:p[0].slice(0,2)).toUpperCase()}
  const sortedRows=r=>[...r].sort((a,b)=>(+b.points||0)-(+a.points||0)||(+b.exact_scores||0)-(+a.exact_scores||0)||String(a.display_name||'').localeCompare(String(b.display_name||'')));
  function tableHtml(rows,gid){const s=sortedRows(rows);if(!s.length)return'<div class="kp-hi-empty">No table data for this Matchday.</div>';return `<div class="kp-hi-table">${s.map((r,i)=>{const n=r.display_name||'Player';return `<button type="button" class="kp-hi-row" data-hi-user="${esc(r.user_id)}" data-hi-gw="${esc(gid)}" data-hi-name="${esc(n)}"><span class="kp-hi-rank">${i+1}</span><span class="kp-hi-avatar">${esc(initials(n))}</span><span class="kp-hi-name"><strong>${esc(n)}</strong><small>${+r.exact_scores||0} exact · ${+r.scorer_hits||0} scorer</small></span><span class="kp-hi-points"><strong>${+r.points||0}</strong><small>PTS</small></span><span class="kp-hi-arrow">›</span></button>`}).join('')}</div>`}
  async function showPlayer(root,button){
    const sb=await client(),gid=await getGroupId(sb),uid=button.dataset.hiUser,gwid=button.dataset.hiGw,name=button.dataset.hiName||'Player';
    if(!sb||!gid||!uid||!gwid)return;
    root.innerHTML=`<button type="button" class="kp-hi-back">‹ Back to table</button><div class="kp-hi-loading">Loading predictions…</div>`;
    const [{data:fixtures,error:fxErr},{data:predictions,error:predErr},{data:week},{data:statRows}] = await Promise.all([
      sb.from('fixtures').select('id,kickoff,home_team_name,away_team_name,status,home_goals,away_goals,first_scorer_name').eq('gameweek_id',gwid).order('kickoff'),
      sb.from('predictions').select('fixture_id,predicted_home,predicted_away,first_scorer_name,points').eq('group_id',gid).eq('user_id',uid),
      sb.from('gameweeks').select('id,round_name').eq('id',gwid).maybeSingle(),
      sb.from('group_leaderboard').select('*').eq('group_id',gid).eq('gameweek_id',gwid).eq('user_id',uid).limit(1)
    ]);
    if(!root.isConnected)return;
    if(fxErr||predErr){console.warn('[history-v2] player load failed',{fxErr,predErr});root.innerHTML=`<button type="button" class="kp-hi-back">‹ Back to table</button><div class="kp-hi-empty">Couldn’t load this player’s predictions.</div>`;return}
    const by=new Map((predictions||[]).map(p=>[String(p.fixture_id),p])),rows=fixtures||[],stat=statRows?.[0]||{},total=stat.points??rows.reduce((s,f)=>s+(+by.get(String(f.id))?.points||0),0),exact=+stat.exact_scores||0,results=+stat.team_score_hits||0,scorers=+stat.scorer_hits||0;
    root.innerHTML=`<div class="kp-hi-player-head"><button type="button" class="kp-hi-back">‹ Back to table</button><span class="kp-hi-week-label">${esc(weekLabel(week))}</span><div class="kp-hi-person"><span class="kp-hi-big-avatar">${esc(initials(name))}</span><div><h3>${esc(name)}</h3><small>${esc(weekLabel(week).toUpperCase())} RESULTS</small></div><div class="kp-hi-score"><strong>${total} pts</strong><span>Total this week</span></div></div></div><div class="kp-hi-stats"><div><b>${rows.length}</b><span>Fixtures</span></div><div><b>${exact}</b><span>Exact scores</span></div><div><b>${results}</b><span>Correct results</span></div><div><b>${scorers}</b><span>First scorer</span></div></div><div class="kp-hi-fixtures">${rows.map(f=>{const p=by.get(String(f.id)),known=f.home_goals!=null&&f.away_goals!=null,pts=+p?.points||0,pred=p?`${p.predicted_home} - ${p.predicted_away}`:'—',actual=known?`${f.home_goals} - ${f.away_goals}`:'—';let badge='No points',cls='none';if(pts>=3){badge='Exact score';cls='good'}else if(pts>0){badge='Correct result';cls='good'}return `<article class="kp-hi-fixture-card"><div class="kp-hi-match"><span class="kp-hi-ft">FT</span><div class="kp-hi-teams"><div><strong>${esc(f.home_team_name||'Home')}</strong><b>${known?esc(f.home_goals):'—'}</b></div><div><strong>${esc(f.away_team_name||'Away')}</strong><b>${known?esc(f.away_goals):'—'}</b></div></div><span class="kp-hi-badge ${cls}">${badge}</span></div><div class="kp-hi-result-strip"><div><span>Prediction</span><b>${esc(pred)}</b></div><div><span>Actual score</span><b>${esc(actual)}</b></div><div><span>Points</span><b class="${pts?'earned':''}">+${pts}</b></div></div>${p?.first_scorer_name||f.first_scorer_name?`<div class="kp-hi-scorer">Prediction scorer: <b>${esc(p?.first_scorer_name||'None')}</b>${f.first_scorer_name?` · Actual: ${esc(f.first_scorer_name)}`:''}</div>`:''}</article>`}).join('')}</div><div class="kp-hi-summary"><div><strong>Week summary</strong><span>${exact} exact score${exact===1?'':'s'}, ${results} correct result${results===1?'':'s'}<br>${total} points from ${rows.length} fixtures</span></div><div><b>${total} pts</b><span>${esc(weekLabel(week))}</span></div></div>`;
  }
  async function mount(){
    if(!historyActive())return;
    const card=historyCard();if(!card||card.querySelector(`#${ROOT_ID}`))return;
    card.querySelectorAll('.payment-row').forEach(r=>r.remove());card.querySelector('.empty')?.remove();
    const root=document.createElement('div');root.id=ROOT_ID;root.innerHTML='<div class="kp-hi-loading">Loading previous Matchdays…</div>';card.appendChild(root);
    const seq=++renderSeq,sb=await client();
    if(!root.isConnected||seq!==renderSeq||!historyActive())return;
    const gid=await resolveGroupId(sb);
    if(!sb||!gid){root.innerHTML='<div class="kp-hi-empty">Couldn’t load previous Matchdays.</div>';return}
    const {data:board,error:boardErr}=await sb.from('group_leaderboard').select('*').eq('group_id',gid);
    if(boardErr||!root.isConnected){console.warn('[history-v2] leaderboard failed',{gid,boardErr});root.innerHTML='<div class="kp-hi-empty">Couldn’t load previous Matchdays.</div>';return}
    const ids=[...new Set((board||[]).map(r=>r.gameweek_id).filter(Boolean))];
    if(!ids.length){root.innerHTML='<div class="kp-hi-empty">No completed Matchdays yet.</div>';return}
    const {data:weekRows,error:weekErr}=await sb.from('gameweeks').select('id,round_name,starts_at,ends_at').in('id',ids).order('starts_at',{ascending:false});
    if(weekErr||!root.isConnected){console.warn('[history-v2] gameweeks failed',weekErr);root.innerHTML='<div class="kp-hi-empty">Couldn’t load previous Matchdays.</div>';return}
    const now=Date.now(),weeks=(weekRows||[]).filter(w=>!w.ends_at||new Date(w.ends_at).getTime()<now);
    if(!weeks.length){root.innerHTML='<div class="kp-hi-empty">No completed Matchdays yet.</div>';return}
    const byWeek=new Map(weeks.map(w=>[String(w.id),(board||[]).filter(r=>String(r.gameweek_id)===String(w.id))]));
    let selected=String(weeks[0].id);
    const renderWeek=()=>{const week=weeks.find(w=>String(w.id)===selected)||weeks[0];root.innerHTML=`<div class="kp-hi-weekbar">${weeks.map(w=>`<button type="button" class="kp-hi-week${String(w.id)===selected?' active':''}" data-hi-week="${esc(w.id)}">${esc(weekLabel(w))}</button>`).join('')}</div><div class="kp-hi-subhead"><strong>${esc(weekLabel(week))} table</strong><small>Tap a player to see their predictions</small></div>${tableHtml(byWeek.get(selected)||[],selected)}`};
    root.addEventListener('click',e=>{const w=e.target.closest('[data-hi-week]');if(w){selected=String(w.dataset.hiWeek);renderWeek();return}const p=e.target.closest('[data-hi-user]');if(p){showPlayer(root,p);return}if(e.target.closest('.kp-hi-back'))renderWeek()});
    renderWeek();
  }
  const screen=document.querySelector('#screen');if(screen)new MutationObserver(()=>queueMicrotask(mount)).observe(screen,{childList:true,subtree:true});
  document.querySelector('.bottom-nav')?.addEventListener('click',e=>{if(e.target.closest('.nav-item[data-tab="history"]'))setTimeout(mount,0)},{passive:true});
  document.addEventListener('change',e=>{if(e.target?.id==='groupSwitch'){resolvedGroupId='';renderSeq++;setTimeout(mount,0)}},true);
  mount();
})();