(() => {
  const state = { current: null, formByTeam: new Map(), loadedAt: 0, enhancing: false };

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const fmtTime = iso => new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(iso));
  const fmtDate = iso => new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'numeric',month:'long'}).format(new Date(iso)).toUpperCase();
  const rel = iso => {
    const ms = new Date(iso).getTime() - Date.now();
    if (ms <= 0) return 'kick-off';
    const h = Math.floor(ms/3600000), d = Math.floor(h/24), r = h%24;
    return d > 0 ? `${d}d ${r}h` : `${h}h`;
  };
  const heroCountdown = iso => {
    const ms = new Date(iso).getTime() - Date.now();
    if (ms <= 0) return 'Closed';
    const h = Math.floor(ms/3600000), d = Math.floor(h/24), r = h%24;
    return d > 0 ? `${d} days ${r} hours` : `${h} hours`;
  };
  const resultFor = (f, teamId) => {
    if (!['FT','AET','PEN'].includes(f.status?.short) || f.goals?.home == null || f.goals?.away == null) return null;
    const home = Number(f.home?.id) === Number(teamId);
    const gf = home ? f.goals.home : f.goals.away;
    const ga = home ? f.goals.away : f.goals.home;
    return gf > ga ? 'W' : gf < ga ? 'L' : 'D';
  };

  async function loadFootball() {
    if (Date.now() - state.loadedAt < 120000 && state.current) return;
    try {
      const cur = await fetch('/api/football/fixtures',{cache:'no-store'}).then(r=>r.json());
      state.current = cur;
      const round = Number(cur.round);
      if (!Number.isFinite(round)) { state.loadedAt = Date.now(); return; }
      const rounds = [];
      for (let n=Math.max(1,round-5); n<round; n++) rounds.push(n);
      const history = (await Promise.all(rounds.map(n => fetch(`/api/football/fixtures?round=${n}`,{cache:'no-store'}).then(r=>r.json()).catch(()=>({fixtures:[]}))))).flatMap(x=>x.fixtures||[]);
      const by = new Map();
      history.sort((a,b)=>new Date(b.kickoff)-new Date(a.kickoff)).forEach(f=>{
        [f.home?.id,f.away?.id].forEach(id=>{
          if (id == null) return;
          const r = resultFor(f,id);
          if (!r) return;
          const arr = by.get(String(id)) || [];
          if (arr.length < 5) arr.push(r);
          by.set(String(id),arr);
        });
      });
      state.formByTeam = by;
      state.loadedAt = Date.now();
    } catch (_) {}
  }

  function crown() {
    return '<svg viewBox="0 0 24 20" fill="currentColor" aria-hidden="true"><path d="M2 5.2 7.2 9.4 12 2.6l4.8 6.8L22 5.2 20.2 16H3.8L2 5.2Zm2.5 9h15l.35-2.15H4.15L4.5 14.2Z"/></svg>';
  }

  function isMatchday() {
    const active = document.querySelector('.bottom-nav .nav-item.active');
    return active?.dataset?.tab === 'gw' && !!document.querySelector('#screen .fixture');
  }

  function addTabs(roundText) {
    let tabs = document.querySelector('.kp-ref-tabs');
    if (!tabs) {
      tabs = document.createElement('div');
      tabs.className = 'kp-ref-tabs';
      const top = document.querySelector('.topbar');
      top?.insertAdjacentElement('afterend', tabs);
    }
    tabs.innerHTML = `<button class="kp-ref-tab on" data-kp-tab="fixtures">Fixtures</button><button class="kp-ref-tab" data-kp-tab="table">Table</button><button class="kp-ref-tab" data-kp-tab="picks">My Picks</button><div class="kp-ref-round">${esc(roundText)}⌄</div>`;
    tabs.querySelector('[data-kp-tab="table"]')?.addEventListener('click',()=>document.querySelector('.bottom-nav [data-tab="live"]')?.click());
    tabs.querySelector('[data-kp-tab="picks"]')?.addEventListener('click',()=>document.querySelector('#screen .fixture')?.scrollIntoView({behavior:'smooth',block:'start'}));
  }

  function addForm(teamEl, teamId) {
    teamEl.querySelector('.kp-form')?.remove();
    const vals = state.formByTeam.get(String(teamId)) || [];
    if (!vals.length) return;
    const form = document.createElement('div');
    form.className = 'kp-form';
    form.innerHTML = vals.slice(0,5).map(x=>`<i class="${x.toLowerCase()}">${x}</i>`).join('');
    teamEl.appendChild(form);
  }

  function syntheticButton(label, side, delta, input) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = label; b.setAttribute('aria-label',`${delta<0?'Decrease':'Increase'} ${side} score`);
    b.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      const next = Math.max(0,Math.min(20,(Number(input.value)||0)+delta));
      input.value = String(next);
      input.dispatchEvent(new Event('input',{bubbles:true}));
    });
    return b;
  }

  function enhanceFixture(row, fixture) {
    if (!row || row.dataset.kpRef === '1') return;
    row.dataset.kpRef = '1';
    const teams = row.querySelector('.teams');
    const home = teams?.querySelector('.team:not(.away)');
    const away = teams?.querySelector('.team.away');
    const scorepick = teams?.querySelector('.scorepick');
    if (!home || !away || !scorepick) return;
    if (fixture) { addForm(home, fixture.home?.id); addForm(away, fixture.away?.id); }

    const mid = document.createElement('div');
    mid.className = 'kp-mid-meta';
    const locked = row.dataset.locked === '1' || !fixture || new Date(fixture.kickoff) <= new Date();
    mid.innerHTML = `<div class="kp-time">${fixture ? fmtTime(fixture.kickoff) : ''}</div><div class="kp-lock">${locked ? 'Locked' : `Locks in ${rel(fixture.kickoff)}`}</div>`;

    const homeInput = scorepick.querySelector('[data-score="home"]');
    const awayInput = scorepick.querySelector('[data-score="away"]');
    if (homeInput && awayInput) {
      const homeMinus = scorepick.querySelector('[data-step^="home,"]');
      const awayPlus = scorepick.querySelector('[data-step^="away,"]');
      const homePlus = syntheticButton('+','home',1,homeInput);
      const awayMinus = syntheticButton('−','away',-1,awayInput);
      const h = document.createElement('div'); h.className='kp-score-side';
      const a = document.createElement('div'); a.className='kp-score-side';
      if (homeMinus) h.append(homeMinus); else h.append(syntheticButton('−','home',-1,homeInput));
      h.append(homeInput,homePlus);
      a.append(awayMinus,awayInput);
      if (awayPlus) a.append(awayPlus); else a.append(syntheticButton('+','away',1,awayInput));
      const div = document.createElement('span'); div.className='kp-score-divider';
      scorepick.replaceChildren(h,div,a,mid);
    } else {
      const boxes = [...scorepick.querySelectorAll('.scorebox')];
      if (boxes.length >= 2) {
        const h = document.createElement('div'); h.className='kp-score-side';
        const a = document.createElement('div'); a.className='kp-score-side';
        const hm=document.createElement('button'), hp=document.createElement('button'), am=document.createElement('button'), ap=document.createElement('button');
        [hm,hp,am,ap].forEach(b=>{b.disabled=true;b.textContent='';});
        h.append(hm,boxes[0],hp); a.append(am,boxes[1],ap);
        const div=document.createElement('span');div.className='kp-score-divider';
        scorepick.replaceChildren(h,div,a,mid);
      } else scorepick.append(mid);
    }
  }

  async function enhance() {
    if (state.enhancing) return;
    state.enhancing = true;
    try {
      if (!isMatchday()) {
        document.body.classList.remove('kp-ref-matchday');
        document.querySelector('.kp-ref-tabs')?.remove();
        return;
      }
      document.body.classList.add('kp-ref-matchday');
      const brandMark = document.querySelector('.topbar .brand-mark');
      if (brandMark) brandMark.innerHTML = crown();
      const brandText = document.querySelector('.topbar .brand>span');
      if (brandText) brandText.textContent = 'KICKPOT';

      await loadFootball();
      if (!isMatchday()) return;
      const current = state.current?.fixtures || [];
      const fixtureById = new Map(current.map(f=>[String(f.id),f]));
      const round = state.current?.round || (document.querySelector('#screen>.hero h1')?.textContent.match(/\d+/)?.[0]) || 4;
      const roundText = `Matchday ${round}`;
      addTabs(roundText);

      const hero = document.querySelector('#screen>.hero');
      if (hero && !hero.classList.contains('kp-ref-hero')) {
        const next = current.filter(f=>new Date(f.kickoff)>new Date()).sort((a,b)=>new Date(a.kickoff)-new Date(b.kickoff))[0];
        hero.classList.add('kp-ref-hero');
        hero.innerHTML = `<div class="kp-ref-eyebrow">${esc(roundText)}</div><h1 class="kp-ref-hero-title">Premier<br>League</h1><div class="kp-ref-count"><small>Picks close in</small><strong>${esc(next ? heroCountdown(next.kickoff) : 'Closed')}</strong></div>`;
      }

      const card = document.querySelector('#screen>.card');
      if (card && !card.querySelector('.kp-ref-date')) {
        const first = current.slice().sort((a,b)=>new Date(a.kickoff)-new Date(b.kickoff))[0];
        const d = document.createElement('div'); d.className='kp-ref-date'; d.textContent = first ? fmtDate(first.kickoff) : '';
        card.prepend(d);
      }
      document.querySelectorAll('#screen .fixture[data-fixture]').forEach(row=>enhanceFixture(row,fixtureById.get(String(row.dataset.fixture))));
    } finally { state.enhancing = false; }
  }

  const observer = new MutationObserver(()=>requestAnimationFrame(enhance));
  observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  document.addEventListener('click',e=>{ if (e.target.closest('.bottom-nav .nav-item')) setTimeout(enhance,0); });
  setInterval(()=>{
    if (!document.body.classList.contains('kp-ref-matchday')) return;
    const next = state.current?.fixtures?.filter(f=>new Date(f.kickoff)>new Date()).sort((a,b)=>new Date(a.kickoff)-new Date(b.kickoff))[0];
    const el=document.querySelector('.kp-ref-count strong'); if (el) el.textContent=next?heroCountdown(next.kickoff):'Closed';
    document.querySelectorAll('#screen .fixture[data-fixture]').forEach(row=>{
      const f=state.current?.fixtures?.find(x=>String(x.id)===String(row.dataset.fixture));
      const lock=row.querySelector('.kp-lock'); if(lock&&f) lock.textContent=new Date(f.kickoff)<=new Date()?'Locked':`Locks in ${rel(f.kickoff)}`;
    });
  },60000);
  setTimeout(enhance,0);
})();
