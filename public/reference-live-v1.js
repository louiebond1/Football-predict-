(() => {
  const screen = document.querySelector('#screen');
  if (!screen) return;

  function setBrand() {
    const brand = document.querySelector('.brand');
    const mark = brand?.querySelector('.brand-mark');
    const label = brand?.querySelector(':scope > span');
    if (!brand || !mark || !label) return;
    mark.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M3 7.2 7.5 11 12 5l4.5 6L21 7.2 19.2 18H4.8L3 7.2Zm2.8 8.8h12.4l.35-2.2H5.45L5.8 16Z"/></svg>';
    label.dataset.kpWordmark = '1';
    label.className = 'kp-ref-brand-label';
    label.textContent = 'KickPot';
  }

  function styleLive() {
    if (document.body?.dataset?.kpScreen !== 'live') return;
    setBrand();
    const title = screen.querySelector('.hero h1');
    if (title) title.textContent = 'Live Matchday';
  }

  let raf = 0;
  const queue = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      styleLive();
    });
  };

  styleLive();
  new MutationObserver(queue).observe(screen, { childList:true, subtree:true, characterData:true });
  document.querySelector('.bottom-nav')?.addEventListener('click', () => setTimeout(queue, 0), { passive:true });
  window.addEventListener('pageshow', queue);
})();
