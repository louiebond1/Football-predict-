(() => {
  const screen = document.querySelector('#screen');
  if (!screen) return;

  let mode = 'table';
  let applying = false;
  let suppressHistory = false;

  const isLive = () => document.querySelector('.bottom-nav .nav-item.active')?.dataset?.tab === 'live';
  const teamNames = {
    ARS:'Arsenal', AVL:'Aston Villa', BOU:'Bournemouth', BRE:'Brentford', BHA:'Brighton',
    BUR:'Burnley', CHE:'Chelsea', CRY:'Crystal Palace', EVE:'Everton', FUL:'Fulham',
    HUL:'Hull City', IPS:'Ipswich Town', LEI:'Leicester City', LIV:'Liverpool',
    MCI:'Man City', MUN:'Man United', NEW:'Newcastle', NFO:'Nottingham Forest',
    SOU:'Southampton', SUN:'Sunderland', TOT:'Tottenham', WHU:'West Ham', WOL:'Wolves',
    LEE:'Leeds United', COV:'Coventry City'
  };

  function clickNativeTab(id) {
    const btn = screen.querySelector(`[data-live-subtab="${id}"]`);
    if (btn && !btn.classList.contains('active')) btn.click();
  }

  function currentNativeMode(){
    return screen.querySelector('[data-live-subtab].active')?.dataset?.liveSubtab || '';
  }

  function buildActions() {
    const hero = screen.querySelector('.kp-live-hero');
    if (!hero) return;
    let actions = screen.querySelector('.kp-live-primary-actions');
    if (actions) return;
    actions = document.createElement('div');
    actions.className = 'kp-live-primary-actions';
    actions.innerHTML = `
      <button type="button" data-kp-live-open="fixtures"><span>Live fixtures</span><span aria-hidden="true">›</span></button>
      <button type="button" data-kp-live-open="picks"><span>My picks</span><span aria-hidden="true">›</span></button>`;
    hero.insertAdjacentElement('afterend', actions);
  }

  function buildDrillHeader(kind) {
    const body = screen.querySelector('.kp-live-body');
    if (!body) return;
    body.querySelectorAll('.kp-live-drill-head').forEach(n=>n.remove());
    const title = kind === 'fixtures' ? 'Live fixtures' : 'My picks';
    const head = document.createElement('div');
    head.className = 'kp-live-drill-head';
    head.innerHTML = `<button type="button" class="kp-live-drill-back" data-kp-live-back aria-label="Back to Live Table">‹</button><div><h1>${title}</h1></div>`;
    body.prepend(head);
  }

  function polishFixtureRows() {
    if (mode !== 'fixtures') return;
    screen.querySelectorAll('.kp-live-fxc').forEach(row => {
      [...row.querySelectorAll('.kp-live-fxc-abbr > span:not(.v)')].forEach(span => {
        const key = (span.textContent || '').trim().toUpperCase();
        if (teamNames[key]) span.textContent = teamNames[key];
      });
      const lock = row.querySelector('.kp-live-fxc-lock');
      if (lock) lock.textContent = (lock.textContent || '').replace(/^🔒\s*/, '');
    });
  }

  function setHistory(kind, replace=false){
    if (suppressHistory) return;
    try {
      const state = {...(history.state || {}), kpLivePage: kind};
      if (replace) history.replaceState(state, '');
      else history.pushState(state, '');
    } catch {}
  }

  function openDrill(kind, {push=true}={}) {
    if (!isLive()) return;
    if (kind !== 'fixtures' && kind !== 'picks') return;
    mode = kind;
    document.body.dataset.kpLivePage = kind;
    if (push) setHistory(kind);
    clickNativeTab(kind);
    requestAnimationFrame(applyHierarchy);
    setTimeout(applyHierarchy, 80);
  }

  function closeDrill({historyBack=false}={}) {
    if (!isLive()) return;
    const wasDrill = mode !== 'table';
    mode = 'table';
    document.body.dataset.kpLivePage = 'table';
    clickNativeTab('table');
    requestAnimationFrame(applyHierarchy);
    setTimeout(applyHierarchy, 80);
    if (wasDrill && historyBack) {
      try { history.back(); } catch {}
    }
    window.scrollTo({top:0,behavior:'auto'});
  }

  function applyHierarchy() {
    if (applying || !isLive()) return;
    const root = screen.querySelector('.kp-live-screen');
    if (!root) return;
    applying = true;
    try {
      root.dataset.hierarchy = 'v2';
      document.body.dataset.kpLivePage = mode;
      const subnav = root.querySelector('.kp-live-subnav');
      if (subnav) subnav.setAttribute('aria-hidden','true');

      const native = currentNativeMode();
      if (mode === 'table') {
        if (native !== 'table') { clickNativeTab('table'); return; }
        buildActions();
        root.querySelectorAll('.kp-live-drill-head').forEach(n=>n.remove());
      } else {
        if (native !== mode) { clickNativeTab(mode); return; }
        buildDrillHeader(mode);
        polishFixtureRows();
      }
    } finally {
      applying = false;
    }
  }

  /* Delegated controls survive every #screen re-render. */
  document.addEventListener('click', e => {
    const open = e.target.closest?.('[data-kp-live-open]');
    if (open && isLive()) {
      e.preventDefault();
      e.stopPropagation();
      openDrill(open.dataset.kpLiveOpen, {push:true});
      return;
    }

    const back = e.target.closest?.('[data-kp-live-back],.kp-live-drill-back');
    if (back && isLive()) {
      e.preventDefault();
      e.stopPropagation();
      closeDrill({historyBack:true});
      return;
    }

    const nav = e.target.closest?.('.bottom-nav .nav-item[data-tab]');
    if (!nav) return;
    if (nav.dataset.tab === 'live') {
      mode = 'table';
      document.body.dataset.kpLivePage = 'table';
      setTimeout(()=>{ clickNativeTab('table'); applyHierarchy(); },0);
    } else {
      mode = 'table';
      delete document.body.dataset.kpLivePage;
    }
  }, true);

  window.addEventListener('popstate', e => {
    if (!isLive()) return;
    const target = e.state?.kpLivePage;
    suppressHistory = true;
    if (target === 'fixtures' || target === 'picks') openDrill(target,{push:false});
    else closeDrill({historyBack:false});
    setTimeout(()=>{suppressHistory=false},0);
  });

  const observer = new MutationObserver(() => {
    if (isLive()) requestAnimationFrame(applyHierarchy);
  });
  observer.observe(screen,{childList:true,subtree:true});

  if (isLive()) {
    mode = 'table';
    document.body.dataset.kpLivePage = 'table';
    setHistory('table', true);
    applyHierarchy();
  }
})();
