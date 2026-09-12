/* Final audit polish: route holds, snapshot caching, group-mode stabilisation. */
(() => {
  const screen = document.querySelector('#screen');
  if (!screen) return;
  let hold = null;
  let holdTimer = null;
  // In-memory only, deliberately not persisted (e.g. sessionStorage): a
  // snapshot cached from an earlier page load can end up describing an
  // older version of the screen's markup/styling than what a later deploy
  // ships, and replaying it verbatim as the hold then looks like a broken,
  // differently-styled screen briefly flashing over the real one - visible
  // live as ghosted old-style nav text overlapping the current design
  // during the Live tab transition. An in-memory cache can only ever hold
  // something captured earlier in this exact page load, so it can never be
  // older than the CSS/JS currently running.
  const snapshots = { live:'', group:'' };

  const activeTab = () => document.querySelector('.bottom-nav .nav-item.active')?.dataset?.tab || '';

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
    const cached = tab === 'live' ? snapshots.live : tab === 'group' ? snapshots.group : '';
    hold = document.createElement('div');
    hold.id = 'kp-route-hold';
    if(tab === 'group') hold.classList.add('kp-route-hold-group');
    hold.innerHTML = `<div class="kp-route-hold-scroll">${cached || skeleton()}</div>`;
    document.body.appendChild(hold);
    holdTimer = setTimeout(removeHold, 2200);
  }

  function cacheCurrent(){
    const live = screen.querySelector(':scope > .kp-live-screen') || screen.querySelector('.kp-live-screen');
    if(live) snapshots.live = live.outerHTML;
    const group = screen.querySelector(':scope > .group-reference-hub');
    if(group && !group.classList.contains('group-reference-hub--compact')) snapshots.group = group.outerHTML;
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

  cacheCurrent();
})();

/* Load the Live information-architecture override last so the Live tab lands on
   the table and treats Fixtures / My Picks as drill-in pages. */
(() => {
  if (!document.querySelector('link[data-kp-live-hierarchy]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/live-hierarchy-v1.css?v=1&studio=20260912-livehierarchy';
    link.dataset.kpLiveHierarchy = '1';
    document.head.appendChild(link);
  }
  if (!document.querySelector('script[data-kp-live-hierarchy]')) {
    const script = document.createElement('script');
    script.src = '/live-hierarchy-v1.js?v=1&studio=20260912-livehierarchy';
    script.defer = true;
    script.dataset.kpLiveHierarchy = '1';
    document.body.appendChild(script);
  }
})();
