/* Final audit polish v2: remove duplicate Live hierarchy boot and route-hold overlays. */
(() => {
  const screen = document.querySelector('#screen');
  if (!screen) return;

  /* Older versions injected live-hierarchy-v1.js a second time from here.
     index.html already loads it, so that produced two independent mode state
     machines fighting over Fixtures / My Picks / Back. Never inject it here. */
  document.querySelectorAll('script[data-kp-live-hierarchy],link[data-kp-live-hierarchy]').forEach(n=>n.remove());

  /* Kill stale route-hold overlays. They caused the blank/skeleton flash seen
     when moving between the first two pages and are unnecessary now that the
     native renderers preserve their own state. */
  const removeRouteHold = () => {
    document.querySelectorAll('#kp-route-hold,.kp-route-skeleton').forEach(n=>n.remove());
  };
  removeRouteHold();

  /* Load the final restrained visual pass exactly once, after every legacy
     stylesheet, so Matchday and Live use one shell without rewriting game data. */
  if (!document.querySelector('link[data-kp-simple-overhaul]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/simple-overhaul-v2.css?v=1&studio=20260912-massivefix';
    link.dataset.kpSimpleOverhaul = '1';
    document.head.appendChild(link);
  }

  const activeTab = () => document.querySelector('.bottom-nav .nav-item.active')?.dataset?.tab || '';

  function cleanTransientState(){
    removeRouteHold();
    const tab = activeTab();
    if (tab !== 'live') {
      delete document.body.dataset.kpLivePage;
      document.body.classList.remove('kp-native-live');
    }
    if (tab !== 'gw') document.body.classList.remove('kp-native-matchday');
  }

  /* Bottom navigation is always an escape route, even from a drill-in. */
  document.addEventListener('click', e => {
    const nav = e.target.closest?.('.bottom-nav .nav-item[data-tab]');
    if (!nav) return;
    removeRouteHold();
    if (nav.dataset.tab !== 'live') delete document.body.dataset.kpLivePage;
    requestAnimationFrame(cleanTransientState);
  }, true);

  new MutationObserver(removeRouteHold).observe(document.body,{childList:true,subtree:false});
  window.addEventListener('pageshow', cleanTransientState);
  document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible') cleanTransientState(); });
  cleanTransientState();
})();
