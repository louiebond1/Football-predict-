(() => {
  const screen = document.querySelector('#screen');
  if (!screen) return;

  let mode = 'table';
  let applying = false;

  const isLive = () => document.querySelector('.bottom-nav .nav-item.active')?.dataset?.tab === 'live';

  function clickNativeTab(id) {
    const btn = screen.querySelector(`[data-live-subtab="${id}"]`);
    if (btn && !btn.classList.contains('active')) btn.click();
  }

  function buildActions() {
    if (screen.querySelector('.kp-live-primary-actions')) return;
    const hero = screen.querySelector('.kp-live-hero');
    const body = screen.querySelector('.kp-live-body');
    if (!hero || !body) return;

    const actions = document.createElement('div');
    actions.className = 'kp-live-primary-actions';
    actions.innerHTML = `
      <button type="button" data-kp-live-open="fixtures"><span>Live fixtures</span><span aria-hidden="true">›</span></button>
      <button type="button" data-kp-live-open="picks"><span>My picks</span><span aria-hidden="true">›</span></button>`;
    hero.insertAdjacentElement('afterend', actions);

    actions.querySelector('[data-kp-live-open="fixtures"]')?.addEventListener('click', () => openDrill('fixtures'));
    actions.querySelector('[data-kp-live-open="picks"]')?.addEventListener('click', () => openDrill('picks'));
  }

  function buildDrillHeader(kind) {
    const body = screen.querySelector('.kp-live-body');
    if (!body || body.querySelector('.kp-live-drill-head')) return;
    const title = kind === 'fixtures' ? 'Live Fixtures' : 'My Picks';
    const head = document.createElement('div');
    head.className = 'kp-live-drill-head';
    head.innerHTML = `<button type="button" class="kp-live-drill-back" aria-label="Back to Live Table">‹</button><div><small>LIVE</small><h1>${title}</h1></div>`;
    body.prepend(head);
    head.querySelector('.kp-live-drill-back')?.addEventListener('click', closeDrill);
  }

  function openDrill(kind) {
    mode = kind;
    document.body.dataset.kpLivePage = kind;
    clickNativeTab(kind);
    requestAnimationFrame(() => applyHierarchy());
  }

  function closeDrill() {
    mode = 'table';
    document.body.dataset.kpLivePage = 'table';
    clickNativeTab('table');
    requestAnimationFrame(() => {
      applyHierarchy();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  function applyHierarchy() {
    if (applying || !isLive()) return;
    const root = screen.querySelector('.kp-live-screen');
    if (!root) return;
    applying = true;
    try {
      root.dataset.hierarchy = 'v1';
      document.body.dataset.kpLivePage = mode;

      // The old 3-tab strip is no longer the information architecture.
      const subnav = root.querySelector('.kp-live-subnav');
      if (subnav) subnav.setAttribute('aria-hidden', 'true');

      if (mode === 'table') {
        const active = root.querySelector('[data-live-subtab].active')?.dataset?.liveSubtab;
        if (active !== 'table') {
          clickNativeTab('table');
          return;
        }
        buildActions();
        root.querySelectorAll('.kp-live-drill-head').forEach(n => n.remove());
      } else {
        const active = root.querySelector('[data-live-subtab].active')?.dataset?.liveSubtab;
        if (active !== mode) {
          clickNativeTab(mode);
          return;
        }
        buildDrillHeader(mode);
      }
    } finally {
      applying = false;
    }
  }

  const observer = new MutationObserver(() => {
    if (isLive()) requestAnimationFrame(applyHierarchy);
  });
  observer.observe(screen, { childList: true, subtree: true });

  document.querySelectorAll('.bottom-nav .nav-item').forEach(btn => btn.addEventListener('click', () => {
    if (btn.dataset.tab === 'live') {
      mode = 'table';
      document.body.dataset.kpLivePage = 'table';
      setTimeout(applyHierarchy, 0);
    } else {
      delete document.body.dataset.kpLivePage;
    }
  }));

  if (isLive()) applyHierarchy();
})();
