const state={tab:'matchday',subTab:'fixtures',fixtures:[],round:null,picks:{},loading:false,config:null,members:[
  {name:'Louie',paid:true,pts:14},{name:'Jack',paid:true,pts:12},{name:'Harry',paid:true,pts:9},{name:'Sam',paid:true,pts:8},{name:'Ben',paid:true,pts:6},{name:'Charlie',paid:true,pts:5}
]};
const screen=document.querySelector('#screen');
const nav=[...document.querySelectorAll('.nav-item')];
const installBtn=document.querySelector('#installBtn');
let deferredPrompt=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;installBtn.hidden=false});
installBtn.addEventListener('click',async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;installBtn.hidden=true});
if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});

const demoFixtures=[
  {id:1,kickoff:new Date(Date.now()+86400000).toISOString(),home:{name:'Arsenal',form:['W','W','D','W','L']},away:{name:'Tottenham',form:['L','D','W','L','D']},status:{short:'NS'},goals:{home:null,away:null}},
  {id:2,kickoff:new Date(Date.now()+90000000).toISOString(),home:{name:'Chelsea',form:['D','W','W','L','W']},away:{name:'Liverpool',form:['W','W','W','D','W']},status:{short:'NS'},goals:{home:null,away:null}},
  {id:3,kickoff:new Date(Date.now()+93600000).toISOString(),home:{name:'Newcastle',form:['W','L','W','W','D']},away:{name:'Aston Villa',form:['D','W','L','W','L']},status:{short:'NS'},goals:{home:null,away:null}}
];

function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
function initials(name=''){return name.split(' ').filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase()}
function hashColor(name=''){let h=0;for(const c of name)h=(h*31+c.charCodeAt(0))>>>0;const hues=[142,206,28,268,12,48];return `hsl(${hues[h%hues.length]} 50% 42%)`}
function crestHTML(team){
  const name=team?.name||'';
  if(team?.logo) return `<img class="crest" data-fallback-name="${esc(name)}" src="${esc(team.logo)}" alt="">`;
  return `<span class="crest crest-fallback" style="background:${hashColor(name)}">${esc(initials(name))}</span>`;
}
function bindCrestFallbacks(){
  document.querySelectorAll('img.crest').forEach(img=>{
    img.addEventListener('error',()=>{
      const name=img.dataset.fallbackName||'';
      const span=document.createElement('span');
      span.className='crest crest-fallback';
      span.style.background=hashColor(name);
      span.textContent=initials(name);
      img.replaceWith(span);
    },{once:true});
  });
}
function formHTML(form){
  if(!form || !form.length) return '';
  return `<div class="form">${form.map(r=>`<span class="form-dot form-${r.toLowerCase()}">${r}</span>`).join('')}</div>`;
}
function kickoffTime(d){return new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit'}).format(new Date(d))}
function dateLabel(d){return new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'numeric',month:'long'}).format(d).toUpperCase()}
function groupByDate(fixtures){
  const map=new Map();
  fixtures.forEach(f=>{
    const d=new Date(f.kickoff);
    const key=d.toDateString();
    if(!map.has(key)) map.set(key,{label:dateLabel(d),items:[]});
    map.get(key).items.push(f);
  });
  return [...map.values()];
}
function countdownParts(date){
  const ms=new Date(date)-Date.now();
  if(ms<=0) return null;
  const totalMin=Math.floor(ms/60000);
  return {d:Math.floor(totalMin/1440),h:Math.floor((totalMin%1440)/60),m:totalMin%60};
}
function countdownLong(date){
  const p=countdownParts(date); if(!p) return 'Closed';
  return `${p.d} day${p.d===1?'':'s'} ${p.h} hour${p.h===1?'':'s'}`;
}
function countdownShort(date){
  const p=countdownParts(date); if(!p) return null;
  return p.d>0?`${p.d}d ${p.h}h`:p.h>0?`${p.h}h ${p.m}m`:`${p.m}m`;
}
function roundShort(round){
  if(!round) return 'Matchday';
  const m=String(round).match(/(\d+)/);
  return m?`Matchday ${m[1]}`:round;
}
function scorerOptions(){
  const names=['No goalscorer','Bukayo Saka','Mohamed Salah','Alexander Isak','Cole Palmer','Erling Haaland','Son Heung-min','Other'];
  return names.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');
}
function pickFor(id){return state.picks[id]||(state.picks[id]={home:1,away:1,scorer:'No goalscorer'})}

function subnavHTML(){
  const tabs=[['fixtures','Fixtures'],['table','Table'],['picks','My Picks']];
  return `<div class="subnav">
    <div class="subnav-tabs">${tabs.map(([id,label])=>`<button class="subnav-tab${state.subTab===id?' active':''}" data-subtab="${id}">${label}</button>`).join('')}</div>
    <div class="round-pill">${esc(roundShort(state.round))} <span>⌄</span></div>
  </div>`;
}
function heroHTML(fixtures){
  const earliest=fixtures.reduce((min,f)=>!min||new Date(f.kickoff)<new Date(min)?f.kickoff:min,null);
  const league=fixtures[0]?.league?.name || 'Premier League';
  return `<section class="hero">
    <div class="eyebrow">${esc(roundShort(state.round))}</div>
    <div class="eyebrow-rule"></div>
    <h1>${esc(league)}</h1>
    <div class="hero-sub-label">Picks close in</div>
    <div class="hero-countdown">${earliest?countdownLong(earliest):'Closed'}</div>
  </section>`;
}
function fixtureRow(f){
  const p=pickFor(f.id);
  const locked=!countdownParts(f.kickoff);
  return `<div class="fixture" data-fixture="${f.id}">
    ${crestHTML(f.home)}
    <div class="fx-info"><div class="fx-name">${esc(f.home?.name)}</div>${formHTML(f.home?.form)}</div>
    <div class="fx-center">
      <div class="fx-time">${kickoffTime(f.kickoff)}</div>
      <div class="fx-lock">🔒 ${locked?'Locked':`Locks in ${countdownShort(f.kickoff)}`}</div>
      <div class="stepper-row">
        <div class="stepper"><button class="step" data-step="home,-1" ${locked?'disabled':''}>−</button><span class="step-val">${p.home}</span><button class="step" data-step="home,1" ${locked?'disabled':''}>＋</button></div>
        <div class="stepper"><button class="step" data-step="away,-1" ${locked?'disabled':''}>−</button><span class="step-val">${p.away}</span><button class="step" data-step="away,1" ${locked?'disabled':''}>＋</button></div>
      </div>
    </div>
    <div class="fx-info right"><div class="fx-name">${esc(f.away?.name)}</div>${formHTML(f.away?.form)}</div>
    ${crestHTML(f.away)}
    <div class="fx-scorer">
      <button class="scorer-toggle" data-scorer-toggle>⚽ First scorer: <span class="accent">${esc(p.scorer)}</span></button>
      <select class="scorer-select" data-scorer hidden>${scorerOptions()}</select>
    </div>
  </div>`;
}
function fixturesListHTML(fixtures){
  if(!fixtures.length) return `<div class="empty">No fixtures yet.</div>`;
  return groupByDate(fixtures).map(g=>`<div class="date-head">${esc(g.label)}</div><div class="fixture-list">${g.items.map(fixtureRow).join('')}</div>`).join('');
}
function myPicksHTML(fixtures){
  if(!fixtures.length) return `<div class="empty">No fixtures yet.</div>`;
  return groupByDate(fixtures).map(g=>`<div class="date-head">${esc(g.label)}</div><div class="fixture-list">${g.items.map(f=>{
    const p=pickFor(f.id);
    const locked=!countdownParts(f.kickoff);
    return `<div class="fixture pick-row">
      ${crestHTML(f.home)}
      <div class="fx-info"><div class="fx-name">${esc(f.home?.name)}</div></div>
      <div class="fx-center">
        <div class="fx-time">${kickoffTime(f.kickoff)}</div>
        <div class="pick-score">${p.home} – ${p.away}</div>
        <div class="fx-lock">${locked?'Locked':`Locks in ${countdownShort(f.kickoff)}`}</div>
      </div>
      <div class="fx-info right"><div class="fx-name">${esc(f.away?.name)}</div></div>
      ${crestHTML(f.away)}
    </div>`;
  }).join('')}</div>`).join('');
}
function standingsTableHTML({live=false}={}){
  return `<section class="card"><div class="card-head"><div class="card-title${live?' accent':''}">${live?'Live Table':'Standings'}</div>${live?'<span class="badge">LIVE</span>':`<span class="muted">${state.members.length} players</span>`}</div><table class="table"><thead><tr><th>#</th><th>Player</th><th class="pts">Pts</th></tr></thead><tbody>${state.members.map((m,i)=>`<tr><td class="rank">${i+1}</td><td><strong>${esc(m.name)}</strong></td><td class="pts">${m.pts}</td></tr>`).join('')}</tbody></table></section>`;
}

function bindSubnav(){
  document.querySelectorAll('[data-subtab]').forEach(btn=>btn.addEventListener('click',()=>{state.subTab=btn.dataset.subtab;renderMatchday()}));
}
function bindFixtureRows(){
  document.querySelectorAll('[data-fixture]').forEach(row=>{
    const id=Number(row.dataset.fixture),p=pickFor(id);
    const toggleBtn=row.querySelector('[data-scorer-toggle]');
    const sel=row.querySelector('[data-scorer]');
    if(sel){sel.value=p.scorer;sel.addEventListener('change',()=>{p.scorer=sel.value;toggleBtn.querySelector('.accent').textContent=sel.value})}
    if(toggleBtn && sel) toggleBtn.addEventListener('click',()=>{sel.hidden=!sel.hidden});
    row.querySelectorAll('[data-step]').forEach(btn=>btn.addEventListener('click',()=>{
      const [side,delta]=btn.dataset.step.split(',');
      p[side]=Math.max(0,Math.min(20,p[side]+Number(delta)));
      renderMatchday();
    }));
  });
  const lockBtn=document.querySelector('#lockPicks');
  if(lockBtn) lockBtn.addEventListener('click',()=>{const s=document.querySelector('#gwStatus');s.className='status success';s.textContent='✓ Picks locked on this device. Supabase connection will sync them for the whole group.'});
}

function renderMatchday(){
  const fixtures=state.fixtures.length?state.fixtures:demoFixtures;
  let body='';
  if(state.subTab==='fixtures'){
    body=`${fixturesListHTML(fixtures)}<button class="primary" id="lockPicks">🔒 Lock In My Picks</button><div id="gwStatus" class="rules">Your friends' picks stay hidden until kick-off.</div>`;
  } else if(state.subTab==='table'){
    body=standingsTableHTML();
  } else {
    body=myPicksHTML(fixtures);
  }
  screen.innerHTML=`${subnavHTML()}${heroHTML(fixtures)}${body}`;
  bindSubnav();
  bindCrestFallbacks();
  if(state.subTab==='fixtures') bindFixtureRows();
}

function renderLive(){
  screen.innerHTML=`<section class="hero"><div class="eyebrow"><span class="live-dot"></span>Live Matchday</div><div class="eyebrow-rule"></div><h1>Everything can change.</h1></section>
  ${standingsTableHTML({live:true})}
  <section class="card swing"><div class="eyebrow">⚡ Goal Swing</div><h2>GOAL — Liverpool 89'</h2><div>Jack <span class="accent">+2 places</span> · Louie <span style="color:var(--red)">−1 place</span></div><p class="muted">A late goal can flip the whole £30 pot.</p></section>
  <section class="card"><div class="card-title accent">What You Need</div><p>You can still win if Newcastle beat Villa and Liverpool–Chelsea stays level.</p></section>`;
}
function renderHistory(){
  screen.innerHTML=`<section class="card winner"><div class="trophy">🏆</div><div class="eyebrow">Gameweek Champion</div><h1>LOUIE WINS</h1><div class="muted">Gameweek 4</div><div class="money">18 pts · £30 won</div></section><section class="card"><div class="statgrid"><div class="stat"><b>4</b><small>Exact scores</small></div><div class="stat"><b>6</b><small>Results</small></div><div class="stat"><b>2</b><small>First scorers</small></div></div></section><section class="card"><div class="card-title accent">Season Stats</div><div class="payment-row"><span>Weekly wins</span><b>4</b></div><div class="payment-row"><span>Total points</span><b>58</b></div><div class="payment-row"><span>Exact scores</span><b>11</b></div><div class="payment-row"><span>Winnings</span><b class="accent">£45</b></div><div class="payment-row"><span>Net P/L</span><b class="accent">+£25</b></div></section>`;
}
function renderGroup(){
  screen.innerHTML=`<section class="hero"><div class="eyebrow">Private Group</div><div class="eyebrow-rule"></div><h1>VAR Is Corrupt</h1><div class="hero-sub-label">£5 / week · 6 members · Treasurer: Louie</div></section><section class="card"><div class="card-head"><div class="card-title">Gameweek 4 Pot</div><span class="badge">6/6 paid</span></div><div style="font-size:42px;font-weight:900;color:var(--accent)">£30</div></section><section class="card"><div class="card-title">Member Payments</div>${state.members.map(m=>`<div class="payment-row"><strong>${esc(m.name)}</strong><span class="${m.paid?'paid':'unpaid'}">${m.paid?'✓ Paid':'Unpaid'}</span></div>`).join('')}</section><section class="card"><div class="card-title accent">Pay the Treasurer</div><p class="muted">Money is sent separately. KickPot only records whether the Treasurer has confirmed payment.</p><div class="bankbox"><div class="bankline"><span>Account name</span><b>Set in Group Settings</b></div><div class="bankline"><span>Sort code</span><b>••-••-••</b></div><div class="bankline"><span>Account no.</span><b>••••••••</b></div><div class="bankline"><span>Reference</span><b>GW4-YOURNAME</b></div></div><button class="secondary" style="margin-top:12px">I've Paid</button></section>`;
}
function render(){nav.forEach(n=>n.classList.toggle('active',n.dataset.tab===state.tab));({matchday:renderMatchday,live:renderLive,history:renderHistory,group:renderGroup}[state.tab])()}
nav.forEach(btn=>btn.addEventListener('click',()=>{state.tab=btn.dataset.tab;render()}));

async function load(){
  render();
  try{state.config=await fetch('/api/config').then(r=>r.json());const r=await fetch('/api/football/fixtures');if(r.ok){const d=await r.json();state.fixtures=d.fixtures||[];state.round=d.round||state.round;render()}}catch(e){console.warn(e)}
}
load();
