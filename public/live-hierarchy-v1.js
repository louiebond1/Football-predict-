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
    if (!hero || screen.querySelector('.kp-live-primary-actions')) return;
    const actions = document.createElement('div');
    actions.className = 'kp-live-primary-actions';
    actions.innerHTML = `
      <button type="button" data-kp-live-open="fixtures"><span>Live fixtures</span><span aria-hidden="true">›</span></button>
      <button type="button" data-kp-live-open="picks"><span>My picks</span><span aria-hidden="true">›</span></button>`;
    hero.insertAdjacentElement('afterend', actions);
  }

  /* Important: do NOT replace this header on every MutationObserver pass.
     On iOS the old version could remove the button between touchstart and click,
     which made the visible back button appear completely dead. */
  function buildDrillHeader(kind) {
    const body = screen.querySelector('.kp-live-body');
    if (!body) return;
    const title = kind === 'fixtures' ? 'Live fixtures' : 'My picks';
    const existing = body.querySelector('.kp-live-drill-head');
    if (existing?.dataset?.kind === kind) return;
    existing?.remove();

    const head = document.createElement('div');
    head.className = 'kp-live-drill-head';
    head.dataset.kind = kind;
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
      if (lock && !lock.dataset.kpPolished) {
        lock.dataset.kpPolished = '1';
        lock.textContent = (lock.textContent || '').replace(/^🔒\s*/, '');
      }
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
    if (!isLive() || (kind !== 'fixtures' && kind !== 'picks')) return;
    mode = kind;
    document.body.dataset.kpLivePage = kind;
    if (push) setHistory(kind);
    clickNativeTab(kind);
    requestAnimationFrame(applyHierarchy);
    setTimeout(applyHierarchy, 80);
  }

  function closeDrill({replaceHistory=true}={}) {
    if (!isLive()) return;
    mode = 'table';
    document.body.dataset.kpLivePage = 'table';
    if (replaceHistory) setHistory('table', true);
    clickNativeTab('table');
    requestAnimationFrame(applyHierarchy);
    setTimeout(applyHierarchy, 50);
    setTimeout(applyHierarchy, 180);
    window.scrollTo({top:0,behavior:'auto'});
  }

  function applyHierarchy() {
    if (applying || !isLive()) return;
    const root = screen.querySelector('.kp-live-screen');
    if (!root) return;
    applying = true;
    try {
      root.dataset.hierarchy = 'v3';
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

  function handleBack(e){
    const back = e.target?.closest?.('[data-kp-live-back],.kp-live-drill-back');
    if (!back || !isLive()) return false;
    e.preventDefault?.();
    e.stopPropagation?.();
    e.stopImmediatePropagation?.();
    closeDrill({replaceHistory:true});
    return true;
  }

  /* pointerup fires reliably in installed iOS PWAs. click remains as a fallback.
     A short flag prevents pointerup + synthetic click from running twice. */
  let backHandledAt = 0;
  document.addEventListener('pointerup', e => {
    if (!e.target?.closest?.('[data-kp-live-back],.kp-live-drill-back')) return;
    backHandledAt = Date.now();
    handleBack(e);
  }, true);

  document.addEventListener('click', e => {
    const open = e.target.closest?.('[data-kp-live-open]');
    if (open && isLive()) {
      e.preventDefault();
      e.stopPropagation();
      openDrill(open.dataset.kpLiveOpen, {push:true});
      return;
    }

    if (e.target.closest?.('[data-kp-live-back],.kp-live-drill-back')) {
      if (Date.now() - backHandledAt < 500) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      handleBack(e);
      return;
    }

    const nav = e.target.closest?.('.bottom-nav .nav-item[data-tab]');
    if (!nav) return;
    if (nav.dataset.tab === 'live') {
      mode = 'table';
      document.body.dataset.kpLivePage = 'table';
      setHistory('table', true);
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
    else closeDrill({replaceHistory:false});
    setTimeout(()=>{suppressHistory=false},0);
  });

  const observer = new MutationObserver(() => {
    if (!isLive()) return;
    requestAnimationFrame(() => {
      const root = screen.querySelector('.kp-live-screen');
      if (!root) return;
      const native = currentNativeMode();
      const headerKind = root.querySelector('.kp-live-drill-head')?.dataset?.kind || '';
      const needsApply = mode === 'table'
        ? native !== 'table' || !root.querySelector('.kp-live-primary-actions') || !!headerKind
        : native !== mode || headerKind !== mode;
      if (needsApply) applyHierarchy();
      else if (mode === 'fixtures') polishFixtureRows();
    });
  });
  observer.observe(screen,{childList:true,subtree:true});

  if (isLive()) {
    mode = 'table';
    document.body.dataset.kpLivePage = 'table';
    setHistory('table', true);
    applyHierarchy();
  }
})();
