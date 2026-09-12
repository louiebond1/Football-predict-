(() => {
  if (!document.querySelector('link[data-kp-simple-overhaul]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/simple-overhaul-v2.css?v=2&studio=20260912-single-owner';
    link.dataset.kpSimpleOverhaul = '1';
    document.head.appendChild(link);
  }

  function cleanPageClasses() {
    const tab = document.querySelector('.bottom-nav .nav-item.active')?.dataset.tab || '';
    if (tab !== 'gw') document.body.classList.remove('kp-native-matchday');
  }

  window.addEventListener('pageshow', cleanPageClasses);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') cleanPageClasses();
  });
  cleanPageClasses();
})();
