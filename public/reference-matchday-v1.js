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

  function styleMatchday() {
    if (document.body?.dataset?.kpScreen !== 'gw') return;
    setBrand();

    const hero = screen.querySelector('.kp3-page-hero');
    if (hero) {
      const title = hero.querySelector('h1');
      if (title) {
        const current = (title.textContent || '').trim();
        if (current && current.toLowerCase() !== 'premier league') {
          hero.dataset.kpRefRound = current;
        }
        const roundText = hero.dataset.kpRefRound || 'Matchday';

        let eyebrow = hero.querySelector('.kp-ref-round');
        if (!eyebrow) {
          eyebrow = document.createElement('div');
          eyebrow.className = 'kp-ref-round';
          title.before(eyebrow);
        }
        eyebrow.textContent = roundText;

        title.textContent = 'Premier League';

        let tagline = hero.querySelector('.kp-ref-tagline');
        if (!tagline) {
          tagline = document.createElement('p');
          tagline.className = 'kp-ref-tagline';
          title.after(tagline);
        }
        tagline.textContent = 'Same game. Bigger stakes.';
      }
    }

    const lock = screen.querySelector('#lockPicks');
    if (lock) {
      lock.textContent = 'Lock in my picks';
      lock.setAttribute('aria-label', 'Lock in my picks');
    }
  }

  let raf = 0;
  const queue = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      styleMatchday();
    });
  };

  styleMatchday();
  new MutationObserver(queue).observe(screen, { childList: true, subtree: true, characterData: true });
  document.querySelector('.bottom-nav')?.addEventListener('click', () => setTimeout(queue, 0), { passive: true });
  window.addEventListener('pageshow', queue);
})();
