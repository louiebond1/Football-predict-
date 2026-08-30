const CRESTS={
  'Arsenal':42,'Aston Villa':66,'Bournemouth':35,'Brentford':55,'Brighton':51,'Brighton & Hove Albion':51,
  'Burnley':44,'Chelsea':49,'Crystal Palace':52,'Everton':45,'Fulham':36,'Leeds':63,'Leeds United':63,
  'Liverpool':40,'Manchester City':50,'Man City':50,'Manchester United':33,'Man Utd':33,'Newcastle':34,
  'Newcastle United':34,'Nottingham Forest':65,'Sunderland':746,'Tottenham':47,'Tottenham Hotspur':47,
  'West Ham':48,'West Ham United':48,'Wolves':39,'Wolverhampton Wanderers':39
};

function decorateTeam(el){
  if(el.dataset.crestDone)return;
  const name=el.textContent.trim();
  const id=CRESTS[name];
  if(!id)return;
  el.dataset.crestDone='1';
  const img=document.createElement('img');
  img.className='team-logo';
  img.src=`https://media.api-sports.io/football/teams/${id}.png`;
  img.alt='';
  img.loading='lazy';
  if(el.classList.contains('away')) el.appendChild(img); else el.prepend(img);
}

function decorate(){
  document.querySelectorAll('.team').forEach(decorateTeam);
  document.querySelectorAll('.card-title').forEach(el=>{
    const t=el.textContent.trim();
    if(t==='Member Payments'&&!el.dataset.icon){el.dataset.icon='1';el.insertAdjacentHTML('afterbegin','<span class="section-icon">◎</span>')}
    if(t==='Past Gameweeks'&&!el.dataset.icon){el.dataset.icon='1';el.insertAdjacentHTML('afterbegin','<span class="section-icon">🏆</span>')}
    if(t==='Your Season Stats'&&!el.dataset.icon){el.dataset.icon='1';el.insertAdjacentHTML('afterbegin','<span class="section-icon">↗</span>')}
  });
}

new MutationObserver(decorate).observe(document.documentElement,{subtree:true,childList:true});
decorate();
