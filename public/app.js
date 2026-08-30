const state={tab:'gw',fixtures:[],round:null,picks:{},loading:false,config:null,members:[
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
  {id:1,kickoff:new Date(Date.now()+86400000).toISOString(),home:{name:'Arsenal'},away:{name:'Tottenham'},status:{short:'NS'},goals:{home:null,away:null}},
  {id:2,kickoff:new Date(Date.now()+90000000).toISOString(),home:{name:'Chelsea'},away:{name:'Liverpool'},status:{short:'NS'},goals:{home:null,away:null}},
  {id:3,kickoff:new Date(Date.now()+93600000).toISOString(),home:{name:'Newcastle'},away:{name:'Aston Villa'},status:{short:'NS'},goals:{home:null,away:null}}
];

function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
function kickoffLabel(d){return new Intl.DateTimeFormat('en-GB',{weekday:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(d))}
function scorerOptions(f){
  const names=['No goalscorer','Bukayo Saka','Mohamed Salah','Alexander Isak','Cole Palmer','Erling Haaland','Son Heung-min','Other'];
  return names.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('')
}
function pickFor(id){return state.picks[id]||(state.picks[id]={home:1,away:1,scorer:'No goalscorer'})}
function meta(){return `<div class="hero-meta"><span class="pill"><strong>£30</strong> Pot</span><span class="pill"><strong>6/6</strong> Paid</span><span class="pill">+3 exact · +1 result · +2 scorer</span></div>`}

function renderGW(){
  const fixtures=state.fixtures.length?state.fixtures:demoFixtures;
  screen.innerHTML=`<section class="hero"><div class="eyebrow">Premier League</div><h1>${esc(state.round||'Gameweek')}</h1><div class="hero-sub">Make your calls. Each match locks at kick-off.</div>${meta()}</section>
  <section class="card"><div class="card-head"><div class="card-title"><span class="accent">✦</span> Your Picks</div><span class="muted">${fixtures.length} fixtures</span></div>
  ${fixtures.map(f=>{const p=pickFor(f.id);return `<div class="fixture" data-fixture="${f.id}"><div class="teams"><div class="team">${esc(f.home?.name)}</div><div class="scorepick"><button class="step" data-step="home,-1">−</button><input class="scorebox" inputmode="numeric" value="${p.home}" data-score="home"><span class="dash">–</span><input class="scorebox" inputmode="numeric" value="${p.away}" data-score="away"><button class="step" data-step="away,1">＋</button></div><div class="team away">${esc(f.away?.name)}</div></div><div class="scorer-row"><select class="scorer-select" data-scorer>${scorerOptions(f)}</select></div><div class="rules">${kickoffLabel(f.kickoff)} · locks automatically at kick-off</div></div>`}).join('')}
  <button class="primary" id="lockPicks">🔒 Lock In My Picks</button><div id="gwStatus" class="rules">Your friends' picks stay hidden until kick-off.</div></section>`;
  document.querySelectorAll('[data-fixture]').forEach(row=>{
    const id=Number(row.dataset.fixture),p=pickFor(id);
    const sel=row.querySelector('[data-scorer]');sel.value=p.scorer;sel.addEventListener('change',()=>p.scorer=sel.value);
    row.querySelectorAll('[data-score]').forEach(inp=>inp.addEventListener('input',()=>{const v=Math.max(0,Math.min(20,Number(inp.value)||0));p[inp.dataset.score]=v;inp.value=v}));
    row.querySelectorAll('[data-step]').forEach(btn=>btn.addEventListener('click',()=>{const [side,delta]=btn.dataset.step.split(',');p[side]=Math.max(0,Math.min(20,p[side]+Number(delta)));renderGW()}));
  });
  document.querySelector('#lockPicks').addEventListener('click',()=>{const s=document.querySelector('#gwStatus');s.className='status success';s.textContent='✓ Picks locked on this device. Supabase connection will sync them for the whole group.'});
}

function renderLive(){
  screen.innerHTML=`<section class="hero"><div class="eyebrow"><span class="live-dot"></span>Live Matchday</div><h1>Everything can change.</h1>${meta()}</section>
  <section class="card"><div class="card-head"><div class="card-title accent">Live Table</div><span class="badge">LIVE</span></div><table class="table"><thead><tr><th>#</th><th>Player</th><th class="pts">Pts</th></tr></thead><tbody>${state.members.map((m,i)=>`<tr><td class="rank">${i+1}</td><td><strong>${esc(m.name)}</strong></td><td class="pts">${m.pts}</td></tr>`).join('')}</tbody></table></section>
  <section class="card swing"><div class="eyebrow">⚡ Goal Swing</div><h2>GOAL — Liverpool 89'</h2><div>Jack <span class="accent">+2 places</span> · Louie <span style="color:var(--danger)">−1 place</span></div><p class="muted">A late goal can flip the whole £30 pot.</p></section>
  <section class="card"><div class="card-title accent">What You Need</div><p>You can still win if Newcastle beat Villa and Liverpool–Chelsea stays level.</p></section>`;
}
function renderHistory(){
  screen.innerHTML=`<section class="card winner"><div class="trophy">🏆</div><div class="eyebrow">Gameweek Champion</div><h1>LOUIE WINS</h1><div class="muted">Gameweek 4</div><div class="money">18 pts · £30 won</div></section><section class="card"><div class="statgrid"><div class="stat"><b>4</b><small>Exact scores</small></div><div class="stat"><b>6</b><small>Results</small></div><div class="stat"><b>2</b><small>First scorers</small></div></div></section><section class="card"><div class="card-title accent">Season Stats</div><div class="payment-row"><span>Weekly wins</span><b>4</b></div><div class="payment-row"><span>Total points</span><b>58</b></div><div class="payment-row"><span>Exact scores</span><b>11</b></div><div class="payment-row"><span>Winnings</span><b class="accent">£45</b></div><div class="payment-row"><span>Net P/L</span><b class="accent">+£25</b></div></section>`
}
function renderGroup(){
  screen.innerHTML=`<section class="hero"><div class="eyebrow">Private Group</div><h1>VAR Is Corrupt</h1><div class="hero-sub">£5 / week · 6 members · Treasurer: Louie</div></section><section class="card"><div class="card-head"><div class="card-title">Gameweek 4 Pot</div><span class="badge">6/6 paid</span></div><div style="font-size:42px;font-weight:900;color:var(--accent)">£30</div></section><section class="card"><div class="card-title">Member Payments</div>${state.members.map(m=>`<div class="payment-row"><strong>${esc(m.name)}</strong><span class="${m.paid?'paid':'unpaid'}">${m.paid?'✓ Paid':'Unpaid'}</span></div>`).join('')}</section><section class="card"><div class="card-title accent">Pay the Treasurer</div><p class="muted">Money is sent separately. KickPot only records whether the Treasurer has confirmed payment.</p><div class="bankbox"><div class="bankline"><span>Account name</span><b>Set in Group Settings</b></div><div class="bankline"><span>Sort code</span><b>••-••-••</b></div><div class="bankline"><span>Account no.</span><b>••••••••</b></div><div class="bankline"><span>Reference</span><b>GW4-YOURNAME</b></div></div><button class="secondary" style="margin-top:12px">I've Paid</button></section>`
}
function render(){nav.forEach(n=>n.classList.toggle('active',n.dataset.tab===state.tab));({gw:renderGW,live:renderLive,history:renderHistory,group:renderGroup}[state.tab])()}
nav.forEach(btn=>btn.addEventListener('click',()=>{state.tab=btn.dataset.tab;render()}));

async function load(){
  render();
  try{state.config=await fetch('/api/config').then(r=>r.json());const r=await fetch('/api/football/fixtures');if(r.ok){const d=await r.json();state.fixtures=d.fixtures||[];state.round=d.round||state.round;render()}}catch(e){console.warn(e)}
}
load();
