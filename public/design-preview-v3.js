const app=document.querySelector('#app');
const screen=document.querySelector('#screen');
const theme=document.querySelector('#theme');

const crests={
  ips:'https://crests.football-data.org/349.png',
  liv:'https://crests.football-data.org/64.png',
  newc:'https://crests.football-data.org/67.png',
  bou:'https://crests.football-data.org/1044.png',
  for:'https://crests.football-data.org/351.png',
  tot:'https://crests.football-data.org/73.png'
};

const photos=[
  'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=1200&q=80'
];
const photo=photos[Math.floor(Date.now()/1800000)%photos.length];

function team(name,crest,away=false){
  return `<div class="team ${away?'away':''}">${
    away
      ? `<span>${name}</span><img class="crest" src="${crest}" alt="">`
      : `<img class="crest" src="${crest}" alt=""><span>${name}</span>`
  }</div>`;
}

function picks(){
  return `<details>
    <summary><span>Group picks and scores</span><span>5/6 revealed ▾</span></summary>
    <div class="reveal">
      <div class="pick"><b>Louie · you</b><b>0–2</b></div>
      <div class="pick"><span>maxkyte1</span><b>1–2</b></div>
      <div class="pick"><span>alexanderlester</span><b>1–3</b></div>
      <div class="pick"><span>benji7gordon</span><b>2–3</b></div>
      <div class="pick"><span>Josh</span><b>1–3</b></div>
      <div class="pick"><span>Dylan</span><span>No pick</span></div>
    </div>
  </details>`;
}

function stepper(home,away){
  return `<div class="stepper prediction-control" aria-label="Editable prediction">
    <div class="score-side">
      <button data-side="home" data-delta="-1" aria-label="Decrease Nottingham Forest score">−</button>
      <strong data-score="home">${home}</strong>
      <button data-side="home" data-delta="1" aria-label="Increase Nottingham Forest score">+</button>
    </div>
    <span class="vs">vs</span>
    <div class="score-side">
      <button data-side="away" data-delta="-1" aria-label="Decrease Tottenham score">−</button>
      <strong data-score="away">${away}</strong>
      <button data-side="away" data-delta="1" aria-label="Increase Tottenham score">+</button>
    </div>
  </div>`;
}

function editableFixture(){
  return `<div class="fixture editable">
    <div class="editable-matchup">
      ${team('Nottingham Forest',crests.for)}
      <div class="kickoff-centre"><strong>15:00</strong><span>Sat</span></div>
      ${team('Tottenham',crests.tot,true)}
    </div>
    ${stepper(2,0)}
    <div class="fixture-sub">Editable until kick-off</div>
  </div>`;
}

function matchday(){
  return `<div class="photo" style="background-image:url('${photo}')"><div class="photo-label">Saturday football</div></div>
    <h1>Matchday 3</h1>
    <div class="meta"><span>For fun</span><span>Next lock <strong>01:14:17</strong></span></div>
    <h2>Your picks</h2>

    <div class="section-title">Friday</div>
    <div class="fixture">
      <div class="teams">
        ${team('Ipswich Town',crests.ips)}
        <div class="score">0 <span class="dash">–</span> 2</div>
        ${team('Liverpool',crests.liv,true)}
      </div>
      <div class="fixture-sub">Full-time · Your pick 0–2 · <strong>+3 Exact</strong></div>
    </div>
    ${picks()}

    <div class="section-title" style="margin-top:22px">Saturday</div>
    <div class="fixture">
      <div class="teams">
        ${team('Newcastle',crests.newc)}
        <div class="score">1 <span class="dash">–</span> 0</div>
        ${team('Bournemouth',crests.bou,true)}
      </div>
      <div class="fixture-sub"><span class="live-dot"></span>63′ · locked · Your pick 2–1</div>
    </div>

    ${editableFixture()}`;
}

function tableRow({rank,name,points,movement,status,you=false,leader=false}){
  const movementClass=movement.startsWith('↑')?'up':movement.startsWith('↓')?'down':'flat';
  return `<div class="stand-row ${you?'you':''} ${leader?'leader':''}">
    <div class="place">
      <strong>${rank}</strong>
      <span class="movement ${movementClass}">${movement}</span>
    </div>
    <div class="stand-person">
      <div><b>${name}</b>${you?'<span class="you-mark">YOU</span>':''}</div>
      <small>${status}</small>
    </div>
    <div class="stand-points"><strong>${points}</strong><small>PTS</small></div>
  </div>`;
}

function live(){
  const players=[
    {rank:'1',name:'Louie',points:'6',movement:'↑2',status:'9/9 picks locked',you:true,leader:true},
    {rank:'2',name:'maxkyte1',points:'4',movement:'↑1',status:'9/9 picks locked'},
    {rank:'3',name:'Alexander',points:'3',movement:'↓1',status:'9/9 picks locked'},
    {rank:'=3',name:'Josh',points:'3',movement:'—',status:'9/9 picks locked'},
    {rank:'5',name:'benji7gordon',points:'2',movement:'↓2',status:'9/9 picks locked'},
    {rank:'6',name:'Dylan',points:'0',movement:'—',status:'No submission'}
  ];

  return `<div class="live-title">
      <div><h1>Live</h1><div class="meta live-meta"><span>Matchday 3</span><span><i class="live-dot"></i><strong>1</strong> live</span></div></div>
      <div class="live-clock">15:24</div>
    </div>

    <section class="league-board">
      <div class="league-heading">
        <div>
          <span class="league-kicker">Live table</span>
          <h2>The race</h2>
        </div>
        <div class="lead-callout">2 pts clear</div>
      </div>

      <div class="standings">
        ${players.map(tableRow).join('')}
      </div>

      <div class="race-note">
        <span>Max is closest</span>
        <strong>6–4</strong>
      </div>
    </section>

    <div class="commentary">
      <span>WHAT YOU NEED</span>
      <p>You’re leading. If Bournemouth equalise, Max closes the gap to one.</p>
    </div>

    <div class="section-title">Live fixtures</div>
    <div class="fixture">
      <div class="teams">
        ${team('Newcastle',crests.newc)}
        <div class="score">1 <span class="dash">–</span> 0</div>
        ${team('Bournemouth',crests.bou,true)}
      </div>
      <div class="fixture-sub"><span class="live-dot"></span>63′ · Your pick 2–1</div>
    </div>
    ${picks()}`;
}

function history(){
  return `<h1>History</h1>
    <div class="meta"><span>Your season</span><span>2026/27</span></div>
    <div class="honour">
      <div class="eyebrow">Matchday 2 · result</div>
      <div class="winner">2-way draw</div>
      <p style="margin-top:7px;color:var(--muted)">Louie & Max · 4 pts</p>
    </div>
    <div class="records">
      <div class="record"><strong>21</strong><small>Total points</small></div>
      <div class="record"><strong>5</strong><small>Exact scores</small></div>
      <div class="record"><strong>2</strong><small>Matchdays won</small></div>
    </div>
    <h2>Recent matchdays</h2>
    <div class="index-row"><span>Matchday 3</span><small>In progress</small></div>
    <div class="index-row"><span>Matchday 2</span><small>2-way draw</small></div>
    <div class="index-row"><span>Matchday 1</span><small>Louie</small></div>
    <h2 style="margin-top:28px">Season records</h2>
    <div class="index-row"><span>Sharpshooter</span><small>Louie · 5 exact</small></div>
    <div class="index-row"><span>Biggest climber</span><small>Josh · +4</small></div>`;
}

function group(){
  return `<h1>VAR is corrupt</h1>
    <div class="meta"><span>Private group</span><span>6 members</span></div>
    <div class="pot"><small>Current pot</small><strong>£30</strong><span>5 of 6 paid · Treasurer: Louie</span></div>
    <div class="index-row"><span>Members</span><small>6</small></div>
    <div class="index-row"><span>Payments</span><small>5 / 6 paid</small></div>
    <div class="index-row"><span>Rules</span><small>Scoring & lock times</small></div>
    <div class="index-row"><span>Group settings</span><small>Invite code</small></div>
    <div class="index-row"><span>Admin</span><small>Treasurer</small></div>
    <div class="notice"><b>Preview only.</b> Nothing here is connected to Supabase, payments, live football data or your production KickPot account.</div>`;
}

const renders={matchday,live,history,group};
let current='matchday';

function render(){
  screen.innerHTML=renders[current]();
  window.scrollTo({top:0,behavior:'instant'});
}

document.querySelectorAll('nav button').forEach(btn=>btn.addEventListener('click',()=>{
  current=btn.dataset.tab;
  document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b===btn));
  render();
}));

screen.addEventListener('click',event=>{
  const button=event.target.closest('.prediction-control button');
  if(!button)return;
  const control=button.closest('.prediction-control');
  const target=control.querySelector(`[data-score="${button.dataset.side}"]`);
  const currentScore=Number(target.textContent||0);
  target.textContent=String(Math.max(0,currentScore+Number(button.dataset.delta||0)));
});

theme.addEventListener('click',()=>{
  app.dataset.theme=app.dataset.theme==='dark'?'light':'dark';
});

render();
