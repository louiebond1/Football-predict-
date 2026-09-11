(() => {
  const screen = document.querySelector('#screen');
  if (!screen) return;
  const navOrder = ['gw','live','history','group'];
  let currentTab = document.querySelector('.nav-item.active')?.dataset.tab || 'gw';
  let direction = 'forward';
  let mutationTimer = 0;
  let lastSignature = '';

  function activeTab(){ return document.querySelector('.nav-item.active')?.dataset.tab || currentTab || 'gw'; }
  function routeSignature(){
    const tab = activeTab();
    const drill = screen.querySelector('.group-reference-panel,.kp3-drill-header h1,.kp-admin-header h1')?.textContent?.trim() || '';
    const historyActive = [...screen.querySelectorAll('.kp3-history-tabs button')].find(b=>b.classList.contains('active'))?.textContent?.trim() || '';
    const liveActive = [...screen.querySelectorAll('.live-reference-tabs button')].find(b=>b.classList.contains('active'))?.textContent?.trim() || '';
    return `${tab}|${drill}|${historyActive}|${liveActive}|${screen.dataset.groupReference||''}`;
  }
  function animateScreen(){
    const sig = routeSignature();
    if (!sig || sig === lastSignature) return;
    lastSignature = sig;
    screen.classList.remove('kp-page-enter');
    screen.dataset.kpDir = direction === 'back' ? 'back' : 'forward';
    void screen.offsetWidth;
    screen.classList.add('kp-page-enter');
    clearTimeout(mutationTimer);
    mutationTimer = setTimeout(()=>screen.classList.remove('kp-page-enter'),360);
  }
  function markInteractiveRows(){
    screen.querySelectorAll('.kp3-nav-row,.kp3-setting-row,.kp-admin-nav-row,.payment-row,.live-reference-table-row,.group-reference-menu>button').forEach(el=>el.classList.add('kp-motion-row'));
  }

  document.addEventListener('pointerdown', e => {
    const nav = e.target.closest('.nav-item[data-tab]');
    if (nav) {
      const from = navOrder.indexOf(currentTab);
      const to = navOrder.indexOf(nav.dataset.tab);
      direction = to < from ? 'back' : 'forward';
      return;
    }
    if (e.target.closest('.kp3-back,.group-reference-back')) direction = 'back';
    else if (e.target.closest('.kp3-nav-row,.group-reference-menu>button,.kp-admin-nav-row')) direction = 'forward';
  }, true);

  document.addEventListener('click', e => {
    const nav = e.target.closest('.nav-item[data-tab]');
    if (nav) currentTab = nav.dataset.tab;
  }, true);

  function enhanceGroupMode(){
    if (!document.querySelector('.nav-item[data-tab="group"]')?.classList.contains('active')) return;
    const mode = screen.querySelector('.group-reference-mode');
    if (!mode || mode.dataset.overhaulMode === '1') return;
    mode.dataset.overhaulMode = '1';
    const title = mode.querySelector('h2');
    const isFun = /for fun/i.test(title?.textContent || '');
    const copy = mode.querySelector('p');
    if (copy) {
      const hint = document.createElement('span');
      hint.className = 'kp-overhaul-mode-hint';
      hint.textContent = isFun ? 'Predictions, tables and bragging rights — no money needed.' : 'Money mode is optional. This group can switch to Play for Fun at any time.';
      copy.after(hint);
    }
    if (!isFun) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'kp-overhaul-mode-action';
      btn.innerHTML = 'Play for fun <span aria-hidden="true">→</span>';
      btn.addEventListener('click', () => {
        const admin = screen.querySelector('.group-reference-menu [data-open="admin"]');
        if (!admin) return;
        admin.click();
        const openMode = (tries=0) => {
          const modeNav = screen.querySelector('.kp-playmode-nav');
          if (modeNav) { modeNav.click(); return; }
          if (tries < 12) setTimeout(()=>openMode(tries+1),80);
        };
        setTimeout(()=>openMode(),40);
      });
      mode.querySelector('div')?.append(btn);
    }
  }

  function enhanceGroupPanelMotion(){
    const panel = screen.querySelector('.group-reference-panel');
    document.body.classList.toggle('kp-group-panel-open', !!panel);
    if (!panel || panel.dataset.motionBound === '1') return;
    panel.dataset.motionBound = '1';
    const back = panel.querySelector('.group-reference-back');
    if (!back) return;
    back.addEventListener('click', e => {
      // Let the underlying renderer handle state, but make the exit read as a route pop.
      const p = e.currentTarget.closest('.group-reference-panel');
      if (p) p.classList.add('kp-panel-closing');
    }, true);
  }

  function rewritePlayModeLanguage(){
    document.querySelectorAll('.kp-playmode-nav').forEach(row => {
      const title = row.querySelector('.kp3-nav-copy strong');
      const meta = row.querySelector('.kp3-nav-copy small');
      if (title) title.textContent = 'Play mode';
      if (meta && !/for fun/i.test(meta.textContent||'')) meta.textContent = `${meta.textContent.replace(/\s+/g,' ').trim()} · Play for Fun available`;
    });
    document.querySelectorAll('.kp-playmode-page').forEach(page => {
      const head = page.querySelector('.kp-admin-header p');
      if (head) head.textContent = 'Choose a weekly pot or Play for Fun — same predictions, same table.';
      const toggle = page.querySelector('.kp-mode-toggle-copy small');
      if (toggle) toggle.textContent = 'On = weekly pot. Off = Play for Fun with no payment required.';
    });
  }

  function polish(){
    markInteractiveRows();
    enhanceGroupMode();
    enhanceGroupPanelMotion();
    rewritePlayModeLanguage();
    animateScreen();
  }

  new MutationObserver(()=>requestAnimationFrame(polish)).observe(screen,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden','data-group-reference']});
  document.querySelectorAll('.nav-item').forEach(btn=>btn.addEventListener('click',()=>requestAnimationFrame(polish)));
  setTimeout(polish,0);
  setTimeout(polish,250);
  setTimeout(polish,800);
})();
