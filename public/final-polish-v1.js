/* Load the authoritative experience layer last so it can unify legacy renderers without touching scoring/data logic. */
(() => {
  if (!document.querySelector('link[data-kp-experience="v1"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/experience-overhaul-v1.css?v=20260911b';
    link.dataset.kpExperience = 'v1';
    document.head.appendChild(link);
  }
  if (!document.querySelector('script[data-kp-experience="v1"]')) {
    const script = document.createElement('script');
    script.src = '/experience-overhaul-v1.js?v=20260911b';
    script.defer = true;
    script.dataset.kpExperience = 'v1';
    document.head.appendChild(script);
  }
})();

/* Final audit polish: route holds, snapshot caching, group-mode stabilisation. */
(() => {
  const screen = document.querySelector('#screen');
  if (!screen) return;
  const LIVE_KEY = 'kp-live-snapshot-v1';
  const GROUP_KEY = 'kp-group-snapshot-v1';
  let hold = null;
  let holdTimer = null;

  const activeTab = () => document.querySelector('.bottom-nav .nav-item.active')?.dataset?.tab || '';
  const safeGet = key => { try { return sessionStorage.getItem(key) || ''; } catch { return ''; } };
  const safeSet = (key,val) => { try { if(val) sessionStorage.setItem(key,val); } catch {} };

  function removeHold(){
    clearTimeout(holdTimer);
    holdTimer = null;
    hold?.remove();
    hold = null;
  }

  function skeleton(){
    return `<div class="kp-route-skeleton"><div class="kp-route-skeleton-hero"></div><div class="kp-route-skeleton-tabs"></div>${'<div class="kp-route-skeleton-row"></div>'.repeat(5)}</div>`;
  }

  function showHold(tab){
    removeHold();
    const cached = tab === 'live' ? safeGet(LIVE_KEY) : tab === 'group' ? safeGet(GROUP_KEY) : '';
    hold = document.createElement('div');
    hold.id = 'kp-route-hold';
    if(tab === 'group') hold.classList.add('kp-route-hold-group');
    hold.innerHTML = `<div class="kp-route-hold-scroll">${cached || skeleton()}</div>`;
    document.body.appendChild(hold);
    holdTimer = setTimeout(removeHold, 2200);
  }

  function cacheCurrent(){
    const live = screen.querySelector(':scope > .kp-live-screen') || screen.querySelector('.kp-live-screen');
    if(live) safeSet(LIVE_KEY, live.outerHTML);
    const group = screen.querySelector(':scope > .group-reference-hub');
    if(group && !group.classList.contains('group-reference-hub--compact')) safeSet(GROUP_KEY, group.outerHTML);
  }

  function screenIsReadyFor(tab){
    if(tab === 'live') return !!screen.querySelector('.kp-live-screen');
    if(tab === 'group') return !!screen.querySelector('.group-reference-hub');
    return true;
  }

  function releaseWhenReady(tab){
    if(!hold) return;
    if(!screenIsReadyFor(tab)) return;
    requestAnimationFrame(() => requestAnimationFrame(removeHold));
  }

  document.addEventListener('click', e => {
    const btn = e.target.closest?.('.bottom-nav .nav-item');
    if(!btn) return;
    const next = btn.dataset.tab;
    if(next === activeTab()) return;
    cacheCurrent();
    if(next === 'live' || next === 'group') showHold(next);
    else removeHold();
    setTimeout(() => releaseWhenReady(next), 0);
  }, true);

  const observer = new MutationObserver(() => {
    cacheCurrent();
    const tab = activeTab();
    releaseWhenReady(tab);

    if(tab === 'live' && !screen.querySelector('.kp-live-screen')) {
      const text = (screen.textContent || '').toLowerCase();
      const looksTransient = text.includes('loading') || text.includes('live matchday') || screen.children.length === 0;
      if(looksTransient && !hold) showHold('live');
    }
  });
  observer.observe(screen,{childList:true,subtree:true,characterData:true});

  function stabiliseGroupMode(){
    if(activeTab() !== 'group') return;
    const hub = screen.querySelector('.group-reference-hub');
    if(!hub) return;
    const select = screen.querySelector('.group-reference-legacy #groupSwitch, #groupSwitch');
    const gid = select?.value || 'default';
    const modeEl = hub.querySelector('.group-reference-mode h2');
    const subEl = hub.querySelector('.group-reference-mode p');
    const heroMeta = hub.querySelector('.group-reference-hero p');
    if(!modeEl || !heroMeta) return;
    const current = modeEl.textContent.trim();
    const key = `kp-group-mode:${gid}`;
    let saved = '';
    try { saved = sessionStorage.getItem(key) || localStorage.getItem(key) || ''; } catch {}

    if(current !== 'For fun') {
      try { sessionStorage.setItem(key,current); localStorage.setItem(key,current); } catch {}
      return;
    }
    if(!saved || saved === 'For fun') return;
    modeEl.textContent = saved;
    if(subEl) subEl.textContent = 'Weekly stake enabled';
    heroMeta.textContent = heroMeta.textContent.replace(/^For fun\s*·/, `${saved} ·`);
  }

  const modeObserver = new MutationObserver(() => requestAnimationFrame(stabiliseGroupMode));
  modeObserver.observe(screen,{childList:true,subtree:true,characterData:true});
  stabiliseGroupMode();
  cacheCurrent();
})();
